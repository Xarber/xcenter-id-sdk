import { createXCenterOIDC } from '@xcenter-id/server';

const cookieName = '__Host-xcenter-flow';
const secure = 'Path=/; HttpOnly; Secure; SameSite=Lax';
const cache = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };

function redirect(url, cookies = []) {
  const headers = new Headers({ ...cache, Location: url });
  for (const cookie of cookies) headers.append('Set-Cookie', cookie);
  return new Response(null, { status: 303, headers });
}

// Bind these to nodejs Route Handlers. store.take(id) must atomically consume the
// transaction. session.create maps verified identities to the product account.
export function xCenterRoutes({ origin, clientId, clientSecret, store, session, scopes = [] }) {
  if (!clientSecret) throw new Error('Configure the registered website client secret.');
  const site = new URL(origin);
  if (site.protocol !== 'https:' || site.href !== site.origin + '/') throw new Error('Configure the canonical HTTPS origin.');
  let provider;
  const getProvider = () => provider ??= createXCenterOIDC({
    clientId, clientSecret, scopes, redirectUri: site.origin + '/api/xcenter/callback',
  }).catch(error => { provider = undefined; throw error; });
  const clear = cookieName + '=; Max-Age=0; ' + secure;
  return {
    async start() {
      const { url, transaction } = await (await getProvider()).begin();
      const id = crypto.randomUUID();
      await store.put(id, transaction, 600);
      return redirect(url.href, [cookieName + '=' + id + '; Max-Age=600; ' + secure]);
    },
    async callback(request) {
      const match = /(?:^|;\s*)__Host-xcenter-flow=([a-f0-9-]{36})(?:;|$)/.exec(request.headers.get('Cookie') ?? '');
      if (!match) return redirect(site.origin + '/settings?signin=expired');
      try {
        const incoming = new URL(request.url);
        const callback = new URL('/api/xcenter/callback' + incoming.search, site);
        const transaction = await store.take(match[1]);
        const result = await (await getProvider()).complete(callback, transaction);
        const productSessionCookie = await session.create(result);
        return redirect(site.origin + '/settings', [clear, productSessionCookie]);
      } catch {
        return redirect(site.origin + '/settings?signin=failed', [clear]);
      }
    },
  };
}
