import 'package:flutter/foundation.dart';
import 'package:flutter_web_auth_2/flutter_web_auth_2.dart';

/// A transaction created by the app backend or a registered public OIDC client.
class BrowserRequest {
  final Uri authorization;
  final Uri callback;

  BrowserRequest({required this.authorization, required this.callback}) {
    if (!_https(authorization) ||
        authorization.host != 'id.xcenter.it' ||
        authorization.path != '/auth' ||
        !_https(callback) ||
        callback.hasQuery ||
        callback.path.isEmpty) {
      throw ArgumentError('Expected the X-Center ID issuer and exact HTTPS callback.');
    }
  }

  static bool _https(Uri uri) =>
      uri.scheme == 'https' &&
      uri.host.isNotEmpty &&
      !uri.hasPort &&
      uri.userInfo.isEmpty &&
      !uri.hasFragment;

  bool matches(Uri returned) =>
      _https(returned) && returned.host == callback.host && returned.path == callback.path;
}

/// The host must validate state, exchange the returned code using PKCE and verify
/// the ID token before creating or saving a product session.
Future<Uri> authorizeBrowser(BrowserRequest request) async {
  if (kIsWeb || !{
    TargetPlatform.iOS, TargetPlatform.android, TargetPlatform.macOS,
  }.contains(defaultTargetPlatform)) {
    throw UnsupportedError('Use a same-origin backend sign-in route on this platform.');
  }
  final response = await FlutterWebAuth2.authenticate(
    url: request.authorization.toString(),
    callbackUrlScheme: 'https',
    options: FlutterWebAuth2Options(
      httpsHost: request.callback.host,
      httpsPath: request.callback.path,
    ),
  );
  final returned = Uri.parse(response);
  if (!request.matches(returned)) throw StateError('Unexpected X-Center ID callback URL.');
  return returned;
}
