import 'dart:convert';
import 'dart:typed_data';
import 'package:http/http.dart' as http;
import 'oauth.dart';

class XCenterServiceRecords {
  final String clientId;
  final String _key;
  final http.Client _http;
  XCenterServiceRecords(this.clientId, this._key, {http.Client? transport}) : _http = transport ?? http.Client() {
    _part(clientId, 100);
    if (!RegExp(r'^xid-db-[A-Za-z0-9_-]{43}$').hasMatch(_key)) throw ArgumentError('Invalid service database key.');
  }
  void close() => _http.close();
  Future<Uint8List> list(String collection,{String? cursor}) => _send('GET',collection,query:cursor==null?null:{'cursor':cursor});
  Future<Uint8List> get(String collection,String id) => _send('GET',collection,id:id);
  Future<Uint8List> put(String collection,String id,{required int revision,required Object? data,required bool isPublic}) =>
    _send('PUT',collection,id:id,revision:revision,body:{'data':data,'public':isPublic});
  Future<Uint8List> delete(String collection,String id,{required int revision}) {
    if(revision<=0) throw ArgumentError('Supply the current revision.');
    return _send('DELETE',collection,id:id,revision:revision);
  }
  String get _appFiles => '/v1/apps/$clientId/files';
  Future<Uint8List> listAppFiles({String? cursor}) =>
      _request('GET',_appFiles,query:cursor==null?null:{'cursor':cursor});
  Future<Uint8List> getAppFile(String id) => _request('GET','$_appFiles/${_part(id,36)}',query:{'metadata':'1'});
  Future<Uint8List> downloadAppFile(String id) => _request('GET','$_appFiles/${_part(id,36)}');
  Future<Uint8List> deleteAppFile(String id) => _request('DELETE','$_appFiles/${_part(id,36)}');
  Future<Uint8List> startAppUpload(String name,int size) =>
      _request('POST','$_appFiles/uploads',body:{'name':name,'size':size});
  Future<Uint8List> appUploadStatus(String id) => _request('GET','$_appFiles/uploads/${_part(id,36)}');
  Future<Uint8List> appendAppUpload(String id,int position,Uint8List content) =>
      _request('PUT','$_appFiles/uploads/${_part(id,36)}',body:{'position':position,'content':base64Encode(content)});
  Future<Uint8List> completeAppUpload(String id) => _request('POST','$_appFiles/uploads/${_part(id,36)}',body:{});
  Future<Uint8List> cancelAppUpload(String id) => _request('DELETE','$_appFiles/uploads/${_part(id,36)}');

  static String _part(String value,int max) {
    if(value.isEmpty||value.length>max||RegExp(r'[^A-Za-z0-9_-]').hasMatch(value)) throw ArgumentError('Invalid identifier.');
    return value;
  }
  Future<Uint8List> _send(String method,String collection,{String? id,int? revision,
      Map<String,String>? query,Map<String,Object?>? body}) async {
    final path='/v1/apps/$clientId/data/${_part(collection,80)}'+(id==null?'':'/${_part(id,120)}');
    return _request(method,path,revision:revision,query:query,body:body);
  }
  Future<Uint8List> _request(String method,String path,{int? revision,Map<String,String>? query,Map<String,Object?>? body}) async {
    if(revision!=null&&revision<0) throw ArgumentError('Invalid revision.');
    final request=http.Request(method,Uri.parse(issuer+path).replace(queryParameters:query))..followRedirects=false;
    request.headers['Authorization']='Bearer $_key';
    if(revision!=null) request.headers['If-Match']='"$revision"';
    if(body!=null) {
      request.headers['Content-Type']='application/json';
      request.body=jsonEncode(body);
    }
    final response=await http.Response.fromStream(await _http.send(request)).timeout(const Duration(seconds:30));
    if(response.statusCode<200||response.statusCode>=300) throw XCenterOAuthError(response.statusCode,null);
    return response.bodyBytes;
  }
}

class XCenterSavedPlaces {
  final Future<String> Function() accessToken;
  final http.Client _http;
  XCenterSavedPlaces(this.accessToken,{http.Client? transport}):_http=transport??http.Client();
  void close()=>_http.close();
  Future<Uint8List> list({String? source,String? after}) => _send('GET', query:{
    if(source!=null)'source':source,if(after!=null)'after':after,
  });
  Future<Uint8List> create(Map<String,Object?> place) => _send('POST',body:place);
  Future<Uint8List> update(String id,int revision,Map<String,Object?> place) {
    if(revision<=0) throw ArgumentError('Supply the current revision.');
    return _send('PUT',id:id,revision:revision,body:place);
  }
  Future<Uint8List> delete(String id) => _send('DELETE',id:id);
  Future<Uint8List> _send(String method,{String? id,int? revision,Map<String,String>? query,Map<String,Object?>? body}) async {
    if(id!=null&&!RegExp(r'^[a-f0-9-]{36}$').hasMatch(id)) throw ArgumentError('Invalid saved-place ID.');
    final token=await accessToken();
    if(token.isEmpty||token.startsWith('xid-db-')||RegExp(r'[^A-Za-z0-9_.~-]').hasMatch(token)) {
      throw ArgumentError('Supply a user access token.');
    }
    final uri=Uri.parse('$issuer/v1/records/saved-place${id==null?'':'/$id'}');
    final request=http.Request(method,uri.replace(queryParameters:query))..followRedirects=false;
    request.headers['Authorization']='Bearer $token';
    if(revision!=null)request.headers['If-Match']='"$revision"';
    if(body!=null) {
      request.headers['Content-Type']='application/json';
      request.body=jsonEncode(body);
    }
    final response=await http.Response.fromStream(await _http.send(request)).timeout(const Duration(seconds:30));
    if(response.statusCode<200||response.statusCode>=300)throw XCenterOAuthError(response.statusCode,null);
    return response.bodyBytes;
  }
}
