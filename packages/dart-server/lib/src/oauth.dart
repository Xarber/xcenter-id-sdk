import 'dart:convert';
import 'dart:math';
import 'package:crypto/crypto.dart';
import 'package:http/http.dart' as http;
import 'package:jose/jose.dart';

const issuer = 'https://id.xcenter.it';
const supportedScopes = {'openid','profile','email','age_range','app_data','friends','offline_access',
  'files_read','files_write','shared_files_read','account_overview','account_manage'};

class XCenterOAuthError implements Exception {
  final int httpStatus;
  final String? code;
  XCenterOAuthError(this.httpStatus,this.code);
  @override
  String toString() => 'X-Center ID OAuth request failed (HTTP $httpStatus).';
}

class XCenterOAuth {
  final String clientId;
  final Uri callback;
  final String? _secret;
  final http.Client _http;
  final List<String> defaultScopes;

  XCenterOAuth.publicClient(String clientId, Uri callback, {http.Client? transport})
      : this._(clientId, callback, null, false, transport, const []);

  XCenterOAuth.server(String clientId, Uri callback, String clientSecret, {bool allowLoopback = false, http.Client? transport,List<String> defaultScopes=const []})
      : this._(clientId, callback, clientSecret, allowLoopback, transport,defaultScopes);

  XCenterOAuth._(this.clientId, this.callback, this._secret, bool allowLoopback, http.Client? transport,this.defaultScopes)
      : _http = transport ?? http.Client() {
    final loopback = allowLoopback && callback.scheme == 'http' &&
        {'127.0.0.1','::1'}.contains(callback.host) && callback.hasPort;
    if (clientId.isEmpty || (_secret != null && _secret.isEmpty) ||
        (!loopback && callback.scheme != 'https') || callback.host.isEmpty ||
        callback.userInfo.isNotEmpty || callback.hasQuery || callback.hasFragment ||
        callback.path.isEmpty || callback.path == '/') throw ArgumentError('Invalid client or redirect URI.');
  }

  void close() => _http.close();
  static String _encode(List<int> bytes) => base64Url.encode(bytes).replaceAll('=', '');
  static List<int> _decode(String value) => base64Url.decode(base64Url.normalize(value));
  static String _random() {
    final random = Random.secure();
    return _encode(List.generate(32, (_) => random.nextInt(256)));
  }
  static String _scope(Iterable<String> requested) {
    if (requested.any((scope) => !supportedScopes.contains(scope))) throw ArgumentError('Unsupported scope.');
    return {'openid', ...requested}.join(' ');
  }
  static int _now() => DateTime.now().millisecondsSinceEpoch ~/ 1000;

  ({Uri url, Map<String, Object> transaction}) begin({List<String> scopes = const [], bool promptConsent = false}) {
    final state = _random(), nonce = _random(), verifier = _random();
    final url = Uri.parse('$issuer/auth').replace(queryParameters: {
      'client_id':clientId,'redirect_uri':callback.toString(),'response_type':'code','scope':_scope([...defaultScopes,...scopes]),
      'state':state,'nonce':nonce,'code_challenge':_encode(sha256.convert(ascii.encode(verifier)).bytes),
      'code_challenge_method':'S256',if(promptConsent || defaultScopes.contains('offline_access') || scopes.contains('offline_access'))'prompt':'consent',
    });
    return (url:url, transaction:{'state':state,'nonce':nonce,'verifier':verifier,'expiresAt':_now()+600});
  }

  Future<({Map<String,dynamic> tokens, Map<String,dynamic> identity})> complete(Uri returned, Map<String,Object?> transaction) async {
    final parameters = returned.queryParametersAll;
    final expiry = transaction['expiresAt'];
    final proof = RegExp(r'^[A-Za-z0-9_-]{22,128}$');
    if (expiry is! int || expiry <= _now() ||
        ['state','nonce','verifier'].any((key) => transaction[key] is! String || !proof.hasMatch(transaction[key] as String)) ||
        returned.scheme != callback.scheme || returned.host != callback.host || returned.port != callback.port ||
        returned.path != callback.path || returned.userInfo.isNotEmpty || returned.hasFragment ||
        parameters['state']?.length != 1 || parameters['state']?.single != transaction['state'] ||
        parameters.containsKey('error') || parameters['code']?.length != 1 || parameters['code']!.single.isEmpty) {
      throw StateError('Invalid or expired authorization response.');
    }
    final tokens = await _request('/token', form:{
      'grant_type':'authorization_code','code':parameters['code']!.single,
      'redirect_uri':callback.toString(),'code_verifier':transaction['verifier'] as String,
    });
    return _identity(tokens, nonce:transaction['nonce'] as String);
  }

  Future<({Map<String,dynamic> tokens, Map<String,dynamic> identity})> refresh(String refreshToken,String subject) async {
    if (refreshToken.isEmpty || subject.isEmpty) throw ArgumentError('A saved token and validated subject are required.');
    final tokens=await _request('/token',form:{'grant_type':'refresh_token','refresh_token':refreshToken});
    if (tokens['refresh_token'] is! String || (tokens['refresh_token'] as String).isEmpty) throw StateError('Missing rotated refresh token.');
    return _identity(tokens,subject:subject);
  }

  Future<({String code, Uri verificationUrl, Map<String,Object> transaction})> beginDevice({List<String> scopes = const []}) async {
    if (_secret == null) throw StateError('A confidential client is required.');
    final nonce = _random();
    final data = await _request('/device/auth',form:{'client_id':clientId,'scope':_scope([...defaultScopes,...scopes]),'nonce':nonce});
    final code = data['user_code'], secret = data['device_code'], expiry = data['expires_in'];
    final url = Uri.tryParse((data['verification_uri_complete'] ?? data['verification_uri'] ?? '').toString());
    if (code is! String || code.isEmpty || secret is! String || secret.isEmpty || expiry is! int || expiry <= 0 ||
        url == null || url.origin != issuer || url.userInfo.isNotEmpty || url.hasFragment || url.path != '/device') {
      throw StateError('Invalid device authorization response.');
    }
    final interval = data['interval'];
    return (code:code,verificationUrl:url,transaction:{'nonce':nonce,'deviceCode':secret,
      'expiresAt':_now()+expiry,'interval':interval is int && interval > 0 ? interval : 5});
  }

  Future<({Map<String,dynamic> tokens, Map<String,dynamic> identity})> completeDevice(
      Map<String,Object?> transaction,{bool Function()? cancelled}) async {
    if (_secret == null) throw StateError('A confidential client is required.');
    final end=transaction['expiresAt'] as int, nonce=transaction['nonce'] as String;
    var interval=transaction['interval'] as int;
    while (_now() < end && cancelled?.call() != true) {
      final remaining=end-_now();
      if(remaining<=0) break;
      await Future<void>.delayed(Duration(seconds:min(interval,remaining)));
      if (_now() >= end || cancelled?.call() == true) break;
      try {
        final tokens=await _request('/token',form:{
          'grant_type':'urn:ietf:params:oauth:grant-type:device_code','device_code':transaction['deviceCode'] as String});
        return await _identity(tokens,nonce:nonce);
      } on XCenterOAuthError catch (error) {
        if (error.code == 'slow_down') interval+=5;
        else if (error.code != 'authorization_pending') rethrow;
      }
    }
    throw StateError('Device authorization expired or cancelled.');
  }

  Uri get issuerSignOutUrl => Uri.parse('$issuer/session/end');

  Future<Map<String,dynamic>> _request(String path,{Map<String,String>? form,String? accessToken}) async {
    final request=http.Request(form==null?'GET':'POST',Uri.parse(issuer+path))..followRedirects=false;
    if (form != null) {
      if (_secret != null) {
        final basic='${Uri.encodeQueryComponent(clientId)}:${Uri.encodeQueryComponent(_secret)}';
        request.headers['Authorization']='Basic ${base64.encode(utf8.encode(basic))}';
      }
      request.bodyFields={...form,if(_secret==null)'client_id':clientId};
    }
    if (accessToken!=null) request.headers['Authorization']='Bearer $accessToken';
    final response=await http.Response.fromStream(await _http.send(request)).timeout(const Duration(seconds:30));
    if (response.statusCode<200 || response.statusCode>=300) {
      String? code;
      try { final parsed=jsonDecode(response.body); if(parsed is Map && parsed['error'] is String) code=parsed['error']; } on FormatException { /* Optional OAuth error body. */ }
      throw XCenterOAuthError(response.statusCode,code);
    }
    return jsonDecode(response.body) as Map<String,dynamic>;
  }

  Future<({Map<String,dynamic> tokens, Map<String,dynamic> identity})> _identity(
      Map<String,dynamic> tokens,{String? nonce,String? subject}) async {
    final access=tokens['access_token'];
    if (access is! String || access.isEmpty || RegExp(r'[^A-Za-z0-9_.~-]').hasMatch(access) ||
        tokens['token_type']?.toString().toLowerCase()!='bearer') throw StateError('Invalid access token.');
    var expected=subject;
    final token=tokens['id_token'];
    if (token is String) {
      if (token.length>16384) throw StateError('Invalid ID token.');
      final pieces=token.split('.');
      if (pieces.length!=3) throw StateError('Invalid ID token.');
      final header=jsonDecode(utf8.decode(_decode(pieces.first))) as Map<String,dynamic>;
      if(header['alg']!='RS256'||header['kid'] is! String||header['kid']=='') throw StateError('Unsupported signing key.');
      final keys=(await _request('/jwks'))['keys'] as List;
      final matching=keys.whereType<Map<String,dynamic>>().where((key)=>key['kid']==header['kid']&&key['kty']=='RSA'&&
        (key['alg']==null||key['alg']=='RS256')&&(key['use']==null||key['use']=='sig')).toList();
      if(matching.length!=1) throw StateError('Issuer signing key unavailable.');
      final store=JsonWebKeyStore()..addKey(JsonWebKey.fromJson(matching.single));
      if (!await JsonWebSignature.fromCompactSerialization(token).verify(store)) throw StateError('Invalid token signature.');
      final claims=jsonDecode(utf8.decode(_decode(pieces[1]))) as Map<String,dynamic>;
      final audience=claims['aud'] is List ? claims['aud'] as List : [claims['aud']];
      final now=_now(), exp=claims['exp'], issued=claims['iat'], notBefore=claims['nbf'], sub=claims['sub'];
      if (claims['iss']!=issuer||!audience.contains(clientId)||
          ((audience.length>1||claims.containsKey('azp'))&&claims['azp']!=clientId)||
          exp is! num||exp<=now||issued is! num||issued>now+60||(notBefore!=null&&(notBefore is! num||notBefore>now))||
          sub is! String||sub.isEmpty||(nonce!=null&&claims['nonce']!=nonce)||(subject!=null&&sub!=subject)) {
        throw StateError('Invalid ID token claims.');
      }
      expected=sub;
    } else if (nonce!=null) { throw StateError('Missing ID token.'); }
    final profile=await _request('/me',accessToken:access);
    if(expected==null||profile['sub']!=expected) throw StateError('Unexpected identity.');
    return (tokens:tokens,identity:profile);
  }
}
