import 'dart:convert';
import 'dart:io';
import 'xcenter_id_server.dart';

class XCenterConfig {
  final String clientId;
  final String? clientSecret, redirectUri, databaseKey;
  final bool allowLoopback;
  final List<String> scopes;

  XCenterConfig({required this.clientId,this.clientSecret,this.redirectUri,this.databaseKey,
    this.allowLoopback=false,this.scopes=const []});

  factory XCenterConfig.load({String? path,Map<String,String>? environment,XCenterConfig? explicit}) {
    final source=File(path??'xid.json'), env=environment??Platform.environment;
    if(path!=null&&!source.existsSync()) throw StateError('X-Center ID configuration was not found.');
    final json=source.existsSync()?jsonDecode(source.readAsStringSync()) as Map<String,dynamic>:<String,dynamic>{};
    final id=explicit?.clientId??env['XCENTER_CLIENT_ID']??json['clientId'] as String?;
    if(id==null||id.isEmpty) throw StateError('Configure the registered client ID.');
    return XCenterConfig(clientId:id,
        clientSecret:explicit?.clientSecret??env['XCENTER_CLIENT_SECRET']??json['clientSecret'] as String?,
        redirectUri:explicit?.redirectUri??env['XCENTER_REDIRECT_URI']??json['redirectUri'] as String?,
        databaseKey:explicit?.databaseKey??env['XCENTER_DATABASE_KEY']??json['databaseKey'] as String?,
        allowLoopback:explicit?.allowLoopback??json['allowLoopback']==true,
        scopes:explicit?.scopes??(json['scopes'] as List?)?.cast<String>()??const []);
  }

  XCenterOAuth oauth() => XCenterOAuth.server(clientId,Uri.parse(redirectUri??(throw StateError('Configure a redirect URI.'))),
    clientSecret??(throw StateError('Configure a confidential client secret.')),allowLoopback:allowLoopback,defaultScopes:scopes);
  XCenterServiceRecords records() => XCenterServiceRecords(clientId,databaseKey??(throw StateError('Configure a service key.')));
}
