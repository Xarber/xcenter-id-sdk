library;

import 'package:material_ui/material_ui.dart';
import 'package:url_launcher/url_launcher.dart';

export 'browser_sign_in.dart';
export 'data_client.dart';

class OverviewProfile {
  final String name;
  final String username;
  final Uri? picture;
  final ImageProvider? avatar;
  final String? email;
  final bool verified;
  final bool administrator;

  const OverviewProfile({
    required this.name, required this.username, this.picture, this.avatar, this.email,
    this.verified = false, this.administrator = false,
  });
}

class AccountOverview extends StatefulWidget {
  final OverviewProfile? profile;
  final String clientId;
  final Future<void> Function() signIn;
  final Future<void> Function() signOut;
  final Widget? settings;

  const AccountOverview({
    super.key, required this.profile, required this.clientId,
    required this.signIn, required this.signOut, this.settings,
  });

  @override
  State<AccountOverview> createState() => _AccountOverviewState();
}

class _AccountOverviewState extends State<AccountOverview> {
  bool _busy = false;
  String? _error;

  Future<void> _signIn() async {
    setState(() { _busy = true; _error = null; });
    try {
      await widget.signIn();
    } catch (_) {
      if (mounted) setState(() => _error = 'Could not sign in with X-Center ID.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profile = widget.profile;
    final colors = Theme.of(context).colorScheme;
    return Card(
      color: colors.primaryContainer,
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('X-Center ID', style: Theme.of(context).textTheme.titleMedium),
            const SizedBox(height: 10),
            if (profile == null) ...[
              const Text('Sign in or create an account'),
              FilledButton(
                onPressed: _busy ? null : _signIn,
                child: const Text('Continue with X-Center ID'),
              ),
            ] else ...[
              _Identity(profile),
              OutlinedButton(
                onPressed: () => Navigator.of(context).push(MaterialPageRoute<void>(
                  builder: (_) => _Details(
                    profile: profile, clientId: widget.clientId,
                    signOut: widget.signOut, settings: widget.settings,
                  ),
                )),
                child: const Text('Manage account & data →'),
              ),
            ],
            if (_error case final message?)
              Semantics(liveRegion: true, child: Text(message, style: TextStyle(color: colors.error))),
          ],
        ),
      ),
    );
  }
}

class _Identity extends StatelessWidget {
  final OverviewProfile profile;
  const _Identity(this.profile);

  @override
  Widget build(BuildContext context) {
    final picture = profile.picture;
    final avatar = profile.avatar ?? (picture != null && picture.scheme == 'https' && picture.userInfo.isEmpty
      ? NetworkImage(picture.toString()) : null);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        CircleAvatar(
          foregroundImage: avatar,
          onForegroundImageError: avatar == null ? null : (_, _) {},
          child: const Icon(Icons.person_outline, semanticLabel: null),
        ),
        const SizedBox(width: 12),
        Expanded(child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(profile.name, style: Theme.of(context).textTheme.titleMedium),
            Text('@${profile.username}'),
            if (profile.email case final email?) Text(email),
            if (profile.verified) const Text('✓ Verified profile'),
            if (profile.administrator) const Text('◆ Administrator'),
          ],
        )),
      ],
    );
  }
}

class _Details extends StatefulWidget {
  final OverviewProfile profile;
  final String clientId;
  final Future<void> Function() signOut;
  final Widget? settings;

  const _Details({
    required this.profile, required this.clientId, required this.signOut, this.settings,
  });

  @override
  State<_Details> createState() => _DetailsState();
}

class _DetailsState extends State<_Details> {
  bool _busy = false;
  String? _error;

  Future<void> _run(Future<void> Function() action) async {
    if (_busy) return;
    setState(() { _busy = true; _error = null; });
    try {
      await action();
    } catch (_) {
      if (mounted) setState(() => _error = 'X-Center ID could not complete this action.');
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _open(Uri url) async {
    if (!await launchUrl(url, mode: LaunchMode.externalApplication)) {
      throw StateError('Could not open dashboard.');
    }
  }

  @override
  Widget build(BuildContext context) {
    final colors = Theme.of(context).colorScheme;
    return Scaffold(
      appBar: AppBar(title: const Text('Manage account & data')),
      body: ListView(
        padding: const EdgeInsets.all(20),
        children: [
          _Identity(widget.profile),
          const SizedBox(height: 12),
          Wrap(spacing: 8, runSpacing: 8, children: [
            OutlinedButton(
              onPressed: _busy ? null : () => _run(() => _open(Uri.https('id.xcenter.it', '/dashboard'))),
              child: const Text('Open dashboard'),
            ),
            if (widget.clientId.isNotEmpty) OutlinedButton(
              onPressed: _busy ? null : () => _run(() => _open(Uri(
                scheme: 'https', host: 'id.xcenter.it', pathSegments: ['permissions', widget.clientId],
              ))),
              child: const Text('Manage app'),
            ),
            TextButton(
              onPressed: _busy ? null : () => _run(() async {
                await widget.signOut();
                if (mounted) Navigator.of(context).pop();
              }),
              child: Text('Sign out', style: TextStyle(color: colors.error)),
            ),
          ]),
          if (_error case final message?)
            Semantics(liveRegion: true, child: Text(message, style: TextStyle(color: colors.error))),
          if (widget.settings case final settings?) ...[const Divider(), settings],
        ],
      ),
    );
  }
}
