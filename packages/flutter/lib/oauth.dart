import 'dart:convert';
import 'package:flutter/services.dart';
import 'package:xcenter_id_server/xcenter_id_server.dart';
import 'browser_sign_in.dart';

/// Public OIDC sign-in. Persist the returned validated session with your app's secure storage.
class XCenterNativeOAuth {
  final XCenterOAuth _client;
  final List<String> defaultScopes;
  XCenterNativeOAuth({required String clientId,required Uri redirectUri,this.defaultScopes=const []})
      : _client=XCenterOAuth.publicClient(clientId,redirectUri);

  Future<({Map<String,dynamic> tokens,Map<String,dynamic> identity})> signIn({List<String> scopes=const []}) async {
    final request=_client.begin(scopes:[...defaultScopes,...scopes]);
    final result=await authorizeBrowser(BrowserRequest(authorization:request.url,callback:_client.callback));
    return _client.complete(result,request.transaction);
  }

  ({Uri url, Map<String,Object> transaction}) begin({List<String> scopes=const []}) =>
      _client.begin(scopes:[...defaultScopes,...scopes]);

  Future<({Map<String,dynamic> tokens,Map<String,dynamic> identity})> complete(
      Uri returned, Map<String,Object?> transaction) => _client.complete(returned,transaction);

  Future<({Map<String,dynamic> tokens,Map<String,dynamic> identity})> refresh(String token,String subject) =>
      _client.refresh(token,subject);
  Uri get issuerSignOutUrl=>_client.issuerSignOutUrl;
  void close()=>_client.close();
}

class XCenterPublicConfig {
  final String clientId;
  final Uri redirectUri;
  final List<String> scopes;

  XCenterPublicConfig({required this.clientId,required this.redirectUri,this.scopes=const []});

  factory XCenterPublicConfig.load({Map<String,Object?> config=const {},
      Map<String,String> environment=const {},String? clientId,Uri? redirectUri,List<String>? scopes}) {
    if(config.containsKey('clientSecret')||config.containsKey('databaseKey')) {
      throw ArgumentError('Keep confidential credentials on a server.');
    }
    final id=clientId??environment['XCENTER_CLIENT_ID']??config['clientId'] as String?;
    final redirect=redirectUri??Uri.tryParse(environment['XCENTER_REDIRECT_URI']??(config['redirectUri'] as String? ?? ''));
    if(id==null||id.isEmpty||redirect==null||redirect.host.isEmpty) throw ArgumentError('Configure a public client ID and callback.');
    return XCenterPublicConfig(clientId:id,redirectUri:redirect,scopes:scopes??(config['scopes'] as List?)?.cast<String>()??const []);
  }

  static Future<XCenterPublicConfig> loadAsset({String asset='xid.json', Map<String,String> environment=const {},
      String? clientId, Uri? redirectUri, List<String>? scopes}) async {
    final value=jsonDecode(await rootBundle.loadString(asset)) as Map<String,Object?>;
    return XCenterPublicConfig.load(config:value,environment:environment,clientId:clientId,redirectUri:redirectUri,scopes:scopes);
  }

  XCenterNativeOAuth identity()=>XCenterNativeOAuth(clientId:clientId,redirectUri:redirectUri,defaultScopes:scopes);
}
