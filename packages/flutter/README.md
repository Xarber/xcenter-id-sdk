# Flutter

Use a path or Git dependency to `packages/flutter`, then import `package:xcenter_id/xcenter_id.dart`. Mount `AccountOverview` at the top of Settings. Supply the host profile, registered client ID, async sign-in and sign-out handlers, and the optional settings widget. Update the profile when the validated product session changes. Use `OverviewProfile.avatar` for a host-managed image provider, or pass an HTTPS product avatar URL.

`authorizeBrowser(BrowserRequest(...))` uses `flutter_web_auth_2` on iOS, Android and macOS with the HTTPS callback. Apply the [package's platform configuration](https://pub.dev/packages/flutter_web_auth_2/versions/5.1.0), including the Android HTTPS return activity if your supported browser requires it. Configure verified links and the issuer registration before testing. Test on an Apple version with HTTPS ASWebAuthenticationSession support (iOS 17.4+ or macOS 14.4+) and a system browser supporting Android Auth Tab. The web and unsupported desktop builds use the host's same-origin browser redirect adapter.

Start using a real product transaction, then validate and exchange the callback before updating the profile. The widget does not accept a raw ID token as a session. For unsigned iOS, supply a native proof-bound backend pickup adapter through the sign-in callback. See [integration](../../docs/integration.md).
