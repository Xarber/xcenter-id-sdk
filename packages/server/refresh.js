/**
 * Use one instance per persisted app session. withLock must serialize access
 * across all workers that can refresh that session. Store an absolute expiresAt
 * timestamp in milliseconds alongside the current access and refresh tokens.
 */
export function createSessionTokenSource({withLock, load, save, refresh, now = Date.now, refreshWindowMs = 30_000}) {
  if ([withLock, load, save, refresh].some(value => typeof value !== 'function')) {
    throw new TypeError('Provide a session lock, load, save and refresh callbacks.');
  }
  return () => withLock(async () => {
    const current = await load();
    if (!current?.accessToken || !Number.isFinite(current.expiresAt)) throw new Error('Sign in to X-Center ID.');
    if (current.expiresAt-now() > refreshWindowMs) return current.accessToken;
    if (!current.refreshToken) {
      if (current.expiresAt > now()) return current.accessToken;
      throw new Error('X-Center ID sign-in expired.');
    }
    const updated = await refresh(current.refreshToken);
    if (!updated?.access_token || !updated.refresh_token || !Number.isFinite(updated.expires_in) || updated.expires_in <= 0) {
      throw new Error('Invalid X-Center ID refresh response. Sign in again.');
    }
    const next = {...current,accessToken:updated.access_token,refreshToken:updated.refresh_token,
      expiresAt:now()+updated.expires_in*1000};
    await save(next);
    return next.accessToken;
  });
}
