class XCenterSessionTokens {
  final String accessToken;
  final String? refreshToken;
  final DateTime expiresAt;
  const XCenterSessionTokens(this.accessToken,this.refreshToken,this.expiresAt);
}

/// One source per stored product session. Multiple backend workers still need a shared lock.
class XCenterSessionTokenSource {
  final Future<XCenterSessionTokens?> Function() load;
  final Future<void> Function(XCenterSessionTokens) save;
  final Future<XCenterSessionTokens> Function(String) refresh;
  Future<String>? _pending;
  XCenterSessionTokenSource({required this.load,required this.save,required this.refresh});

  Future<String> accessToken() => _pending ??= Future<String>(_fetch).whenComplete(() {
    _pending=null;
  });

  Future<String> _fetch() async {
    final current=await load();
    if(current==null||current.accessToken.isEmpty) throw StateError('Sign in to X-Center ID first.');
    final now=DateTime.now();
    if(current.expiresAt.difference(now)>const Duration(seconds:30))return current.accessToken;
    final refreshToken=current.refreshToken;
    if(refreshToken==null||refreshToken.isEmpty){
      if(current.expiresAt.isBefore(now)||current.expiresAt==now)throw StateError('X-Center ID sign-in expired.');
      return current.accessToken;
    }
    final next=await refresh(refreshToken);
    if(next.accessToken.isEmpty||next.refreshToken?.isNotEmpty!=true||!next.expiresAt.isAfter(DateTime.now())){
      throw StateError('Invalid refresh response.');
    }
    await save(next);
    return next.accessToken;
  }
}
