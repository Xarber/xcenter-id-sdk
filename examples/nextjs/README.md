# Next.js and Vercel

Use an App Router product with its own account store. Install the `packages/web` and `packages/server` packages from this checkout. Copy `AccountCard.tsx` into the product's Settings page and have it receive the normalized profile from your authenticated product session. On successful sign-out, clear that session and set the profile to null.

Configure a canonical HTTPS deployment domain in Vercel. Register it as a Website backend and register exactly `https://your-domain.example/api/xcenter/callback`. Activate the app in the [Developer portal](https://id.xcenter.it/developer). Set the client ID and secret in the **server-only** production environment. Leave the client secret out of `NEXT_PUBLIC_*` variables. Use a separate registration and callback domain if you need previews.

Copy `routes.js` to your server code. Instantiate `xCenterRoutes` with your canonical origin, client credentials, required scopes, durable transaction store and product session adapter. Bind the same instance to App Router handlers.

```js
// app/api/xcenter/start/route.js
export const runtime = 'nodejs';
export { start as GET } from '@/server/xcenter-config';

// app/api/xcenter/callback/route.js
export const runtime = 'nodejs';
export { callback as GET } from '@/server/xcenter-config';
```

In `xcenter-config`, export the returned `start` and `callback` handlers. The product store must implement `put(id, transaction, ttlSeconds)` and atomic `take(id)` across instances. Use your database or a storage service with a consume-once operation. The host's `session.create({tokens, identity})` maps the verified issuer and subject to the product account and returns a fresh Secure, HttpOnly session cookie. The product must enforce its own CSRF checks on sign-out and settings mutations. The adapter redirects to `/settings` after success, and exposes generic failure status in the query string for the host to present.

Keep refresh tokens in encrypted backend storage and serialize refresh per session. On sign-out, clear product cookies and stored credentials. For a user photo, use an authenticated product route that fetches the provider JPEG server-side with the current user's access token. Use the same-origin URL for the card. See [capabilities](../../docs/capabilities.md).
