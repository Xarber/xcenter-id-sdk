import 'dart:io';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:test/test.dart';
import 'package:xcenter_id_server/config.dart';
import 'package:xcenter_id_server/xcenter_id_server.dart';

void main() {
  test('reads configuration with explicit, environment, file precedence', () {
    final dir = Directory.systemTemp.createTempSync();
    addTearDown(() => dir.deleteSync(recursive:true));
    final path = '${dir.path}/fixture.json';
    File(path).writeAsStringSync('{"clientId":"file","clientSecret":"fixture","redirectUri":"https://example.org/callback"}');
    final config=XCenterConfig.load(path:path,environment:{'XCENTER_CLIENT_ID':'env'},
      explicit:XCenterConfig(clientId:'explicit'));
    expect(config.clientId,'explicit');
    expect(config.clientSecret,'fixture');
    expect(config.oauth().begin().url.queryParameters['code_challenge_method'],'S256');
  });

  test('rejects a wrong or duplicate callback state before sending credentials', () async {
    final client=XCenterOAuth.publicClient('fixture',Uri.parse('https://example.org/callback'),
      transport:MockClient((_) async => throw StateError('network must stay untouched')));
    addTearDown(client.close);
    final attempt=client.begin(scopes:['friends','offline_access']);
    expect(attempt.url.queryParameters['scope'],'openid friends offline_access');
    expect(attempt.url.queryParameters['prompt'],'consent');
    final wrong=Uri.parse('https://example.org/callback?code=one&state=wrong');
    await expectLater(client.complete(wrong,attempt.transaction),throwsStateError);
  });

  test('private service writes use app bearer key and optimistic revision', () async {
    final key='xid-db-${List.filled(43,'a').join()}';
    final api=XCenterServiceRecords('fixture',key,transport:MockClient((request) async {
      expect(request.url.path,'/v1/apps/fixture/data/notes/one');
      expect(request.method,'PUT');
      expect(request.followRedirects,false);
      expect(request.headers['authorization'],'Bearer $key');
      expect(request.headers['if-match'],'"0"');
      expect(request.body,contains('"public":false'));
      return http.Response('{"id":"one","revision":1,"public":false}',200);
    }));
    addTearDown(api.close);
    await api.put('notes','one',revision:0,data:{'message':'hello'},isPublic:false);
  });
}
