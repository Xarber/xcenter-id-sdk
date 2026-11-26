import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

class XCenterHttpException implements Exception {
  final int status;
  final Uint8List body;
  final String? retryAfter;

  XCenterHttpException(this.status, this.body, this.retryAfter);
  @override
  String toString() => 'X-Center ID request failed (HTTP $status).';
}

/// Use the same client in Flutter native and web, subject to browser CORS.
class XCenterDataClient {
  static const issuer = 'https://id.xcenter.it';
  final String? clientId;
  final Future<String> Function()? accessToken;
  final http.Client _http;

  XCenterDataClient({this.clientId, this.accessToken, http.Client? client}) : _http = client ?? http.Client();

  void close() => _http.close();

  Future<Uint8List> discover() => _send('/.well-known/openid-configuration', authenticated: false);
  Future<Uint8List> userInfo() => _send('/me');
  Future<Uint8List> avatar() => _send('/v1/profile/avatar');
  Future<Uint8List> friends() => _send('/v1/profile/friends');
  Future<Uint8List> publicProfile(String username) => _send('/public/profiles/${_handle(username)}', authenticated: false);
  Future<Uint8List> publicAvatar(String username) => _send('/public/profiles/${_handle(username)}/avatar', authenticated: false);
  Future<Uint8List> appIcon(String id) => _send('/public/app-icons/${_segment(id, 36)}', authenticated: false);

  Future<Uint8List> listRecords(String collection, {String? cursor, String? sharedFrom}) =>
      _send(_records('v1', sharedFrom ?? _own, collection), query: {if (cursor != null) 'cursor': cursor});
  Future<Uint8List> getRecord(String collection, String id, {String? sharedFrom}) =>
      _send('${_records('v1', sharedFrom ?? _own, collection)}/${_segment(id)}');
  Future<Uint8List> listPublicRecords(String client, String collection, {String? cursor}) =>
      _send(_records('public', client, collection), authenticated: false, query: {if (cursor != null) 'cursor': cursor});
  Future<Uint8List> getPublicRecord(String client, String collection, String id) =>
      _send('${_records('public', client, collection)}/${_segment(id)}', authenticated: false);

  Future<Uint8List> putRecord(String collection, String id,
      {required Object? data, required bool isPublic, required int revision, List<String>? readers}) =>
      _send('${_records('v1', _own, collection)}/${_segment(id)}', method: 'PUT', revision: revision,
          body: {'data': data, 'public': isPublic, if (readers != null) 'readers': readers});
  Future<Uint8List> deleteRecord(String collection, String id, {required int revision}) {
    if (revision < 1) throw ArgumentError('Supply the current revision.');
    return _send('${_records('v1', _own, collection)}/${_segment(id)}', method: 'DELETE', revision: revision);
  }

  Future<Uint8List> profileVisibility() => _send('/v1/account/profile-visibility');
  Future<Uint8List> updateProfileVisibility(List<String> fields) =>
      _send('/v1/account/profile-visibility',method:'PUT',body:{'fields':fields});
  Future<Uint8List> connectedApps() => _send('/v1/account/apps');
  Future<Uint8List> connectedPermissions(String client) =>
      _send('/v1/account/apps/${_segment(client,100)}/permissions');
  Future<Uint8List> disableConnectedPermission(String client,String scope) =>
      _send('/v1/account/apps/${_segment(client,100)}/permissions',method:'PUT',body:{'scope':scope,'enabled':false});

  Future<Uint8List> accountOverview() => _send('/v1/account/overview');

  String get _appFiles => '/v1/apps/${_segment(_own,100)}/files';
  Future<Uint8List> listAppFiles({String? cursor}) =>
      _send(_appFiles,query:cursor==null?null:{'cursor':cursor});
  Future<Uint8List> getAppFile(String id) => _send('$_appFiles/${_segment(id,36)}', query: {'metadata':'1'});
  Future<Uint8List> downloadAppFile(String id) => _send('$_appFiles/${_segment(id,36)}');
  Future<Uint8List> deleteAppFile(String id) => _send('$_appFiles/${_segment(id,36)}',method:'DELETE');
  Future<Uint8List> setAppFileBrowseable(String id,bool browseable) =>
      setAppFileVisibility(id,browseable:browseable);
  Future<Uint8List> setAppFileVisibility(String id,{required bool browseable,bool? editable}) =>
      _send('$_appFiles/${_segment(id,36)}',method:'PUT',body:{'browseable':browseable,if(editable!=null)'editable':editable});
  Future<Uint8List> startAppUpload(String name,int size,{bool browseable=false,bool editable=false}) =>
      _send('$_appFiles/uploads',method:'POST',body:{'name':name,'size':size,'browseable':browseable,'editable':editable});
  Future<Uint8List> appUploadStatus(String id) => _send('$_appFiles/uploads/${_segment(id,36)}');
  Future<Uint8List> appendAppUpload(String id,int position,Uint8List content) =>
      _send('$_appFiles/uploads/${_segment(id,36)}',method:'PUT',body:{'position':position,'content':base64Encode(content)});
  Future<Uint8List> completeAppUpload(String id) => _send('$_appFiles/uploads/${_segment(id,36)}',method:'POST',body:{});
  Future<Uint8List> cancelAppUpload(String id) => _send('$_appFiles/uploads/${_segment(id,36)}',method:'DELETE');

  Future<Uint8List> startUpload(String name, int size, {String? folder}) =>
      _send('/v1/files/uploads', method:'POST', body:{'name':name,'size':size,'folder':folder});
  Future<Uint8List> uploadStatus(String id) => _send('/v1/files/uploads/${_segment(id,36)}');
  Future<Uint8List> appendUpload(String id, int position, Uint8List content) =>
      _send('/v1/files/uploads/${_segment(id,36)}', method:'PUT',
        body:{'position':position,'content':base64Encode(content)});
  Future<Uint8List> completeUpload(String id) =>
      _send('/v1/files/uploads/${_segment(id,36)}', method:'POST', body:{});
  Future<Uint8List> cancelUpload(String id) =>
      _send('/v1/files/uploads/${_segment(id,36)}', method:'DELETE');

  Future<Uint8List> openPeer({bool discoverable=false}) =>
      _send('/v1/peers', method:'POST',body:{'discoverable':discoverable});
  Future<Uint8List> listPeers(String id,String proof) =>
      _send('/v1/peers/${_segment(id,24)}/directory',peerProof:proof);
  Future<Uint8List> receivePeerMessages(String id,String proof) =>
      _send('/v1/peers/${_segment(id,24)}/messages',peerProof:proof);
  Future<Uint8List> sendPeerMessage(String id,String proof,{required String to,required String type,
      required Map<String,Object?> data}) =>
      _send('/v1/peers/${_segment(id,24)}/messages',method:'POST',peerProof:proof,
        body:{'to':to,'type':type,'data':data});
  Future<Uint8List> closePeer(String id,String proof) =>
      _send('/v1/peers/${_segment(id,24)}',method:'DELETE',peerProof:proof);

  Future<Uint8List> listFiles({String? folder}) => _send('/v1/files', query: {if (folder != null) 'folder': folder});
  Future<Uint8List> getFile(String id) => _send('/v1/files/${_segment(id, 36)}', query: {'metadata':'1'});
  Future<Uint8List> downloadFile(String id) => _send('/v1/files/${_segment(id, 36)}');
  Future<Uint8List> listSharedFiles() => _send('/v1/files/shared');
  Future<Uint8List> getSharedFile(String id) => _send('/v1/files/shared/${_segment(id, 36)}', query: {'metadata':'1'});
  Future<Uint8List> downloadSharedFile(String id) => _send('/v1/files/shared/${_segment(id, 36)}');
  Future<Uint8List> createFolder(String name, {String? parent}) =>
      _send('/v1/files/folders', method: 'POST', body: {'name': name, 'folder': parent});
  Future<Uint8List> uploadFile(String name, Uint8List content, {String? folder}) {
    if (content.isEmpty || content.length > 2 * 1024 * 1024) throw ArgumentError('Choose a file from 1 byte to 2 MB.');
    return _send('/v1/files', method: 'POST', body: {'name': name, 'content': base64Encode(content), 'folder': folder});
  }

  /// Pass {'folder': null} to move to root or {'name': name} to rename.
  Future<Uint8List> updateFile(String id, Map<String, Object?> change) =>
      _send('/v1/files/${_segment(id, 36)}', method: 'PATCH', body: change);
  Future<Uint8List> updateFolder(String id, Map<String, Object?> change) =>
      _send('/v1/files/folders/${_segment(id, 36)}', method: 'PATCH', body: change);
  Future<Uint8List> deleteFile(String id) => _send('/v1/files/${_segment(id, 36)}', method: 'DELETE');
  Future<Uint8List> deleteFolder(String id) => _send('/v1/files/folders/${_segment(id, 36)}', method: 'DELETE');

  String get _own => clientId ?? (throw StateError('Configure your registered client ID.'));

  static String _handle(String value) {
    if (!RegExp(r'^[a-z0-9._-]{3,24}$').hasMatch(value) ||
        value.startsWith('.') || value.endsWith('.') || value.contains('..')) throw ArgumentError('Invalid username.');
    return value;
  }

  static String _segment(String value, [int limit = 120]) {
    if (value.length > limit || !RegExp(r'^[A-Za-z0-9_-]+$').hasMatch(value)) throw ArgumentError('Invalid resource identifier.');
    return value;
  }

  static String _records(String prefix, String client, String collection) =>
      '/$prefix/apps/${_segment(client, 100)}/data/${_segment(collection, 80)}';

  Future<Uint8List> _send(String path, {String method = 'GET', Map<String,String>? query,
      Object? body, int? revision, bool authenticated = true, String? peerProof}) async {
    if (revision != null && revision < 0) throw ArgumentError('Invalid record revision.');
    String? token;
    if (authenticated) {
      token = await accessToken?.call();
      if (token == null || token.startsWith('xid-db-') || token.isEmpty || RegExp(r'[^A-Za-z0-9_.~-]').hasMatch(token)) {
        throw StateError('Supply an end-user access token.');
      }
    }
    final request = http.Request(method, Uri.https('id.xcenter.it', path, query))..followRedirects = false;
    if (token != null) request.headers['Authorization'] = 'Bearer $token';
    if (peerProof != null) {
      if (!RegExp(r'^[A-Za-z0-9_-]{43}$').hasMatch(peerProof)) throw ArgumentError('Supply a valid peer proof.');
      request.headers['X-XCenter-Peer-Proof'] = peerProof;
    }
    if (revision != null) request.headers['If-Match'] = '"$revision"';
    if (body != null) {
      request.headers['Content-Type'] = 'application/json';
      request.bodyBytes = utf8.encode(jsonEncode(body));
    }
    final response = await http.Response.fromStream(await _http.send(request));
    if (response.statusCode < 200 || response.statusCode >= 300) {
      throw XCenterHttpException(response.statusCode, response.bodyBytes, response.headers['retry-after']);
    }
    return response.bodyBytes;
  }
}
