import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:xcenter_id/xcenter_id.dart';

void main() {
  testWidgets('account banner uses host sign-in and opens account controls', (tester) async {
    OverviewProfile? profile;
    await tester.pumpWidget(MaterialApp(home: Scaffold(body: StatefulBuilder(
      builder: (context, update) => AccountOverview(
        profile: profile,
        clientId: 'example',
        signIn: () async => update(() => profile = const OverviewProfile(
          name: 'Example', username: 'example', verified: true,
        )),
        signOut: () async => update(() => profile = null),
        settings: const Text('Sync settings'),
      ),
    ))));
    await tester.tap(find.text('Continue with X-Center ID'));
    await tester.pumpAndSettle();
    await tester.tap(find.text('Manage account & data →'));
    await tester.pumpAndSettle();
    expect(find.text('Manage app'), findsOneWidget);
    expect(find.text('Sync settings'), findsOneWidget);
    await tester.tap(find.text('Sign out'));
    await tester.pumpAndSettle();
    expect(find.text('Continue with X-Center ID'), findsOneWidget);
  });

  test('browser request is bound to the exact HTTPS callback', () {
    final request = BrowserRequest(
      authorization: Uri.parse('https://id.xcenter.it/auth?state=example'),
      callback: Uri.parse('https://app.example/callback'),
    );
    expect(request.matches(Uri.parse('https://app.example/callback?code=example')), isTrue);
    expect(request.matches(Uri.parse('https://other.example/callback?code=example')), isFalse);
    expect(request.matches(Uri.parse('https://app.example/callback/?code=example')), isFalse);
  });
}
