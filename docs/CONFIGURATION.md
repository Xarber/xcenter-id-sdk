# Configure X-Center ID

Register the product in Developer Apps and activate the exact callback. Use the client ID shown in the portal. A public native registration uses PKCE and has no client secret. A confidential registration uses a backend and receives a secret once.

## Browser and native apps

Use [xid.example.json](../xid.example.json) as a public configuration template. Public configuration contains `clientId`, `redirectUri` and `scopes`. Use an explicit setting, then a build-provided environment map, then JSON. The public parser rejects JSON containing a client secret or database key.

| Platform | Configuration | Sign-in |
| --- | --- | --- |
| Plain JavaScript and web | `loadPublicConfig()` loads same-origin `/xid.json`. `publicConfig({config, env, clientId, redirectUri})` accepts explicit values. | Create `createPublicOAuthClient(config)` for a public client using Web Crypto. Save the returned transaction before redirect and consume it once at the callback. Use the server SDK for a confidential website. |
| Expo | Import a bundled public JSON object and pass it as `config` to `createExpoOAuth` from `@authnjs/expo/oauth`. Environment values may come from Expo's public build configuration. | `signIn()` opens the system browser, exchanges the code and validates the returned profile. `refresh(token, subject)` rotates the saved token. |
| Swift | `XCenterPublicConfig.load(file: bundleURL)` or explicit client ID and redirect URI. | `BrowserSignIn(anchor:).signIn(config:)` uses the OS authentication sheet and validates the returned session. The OAuth client also supports refresh. |
| Android | `loadXCenterAsset(assets)` loads public `xid.json`. Alternatively use `XCenterPublicConfig.load`. | `browser.signIn(config)` uses an Android Auth Tab and verifies the returned identity. Use an IO dispatcher for standalone exchange and refresh calls. |
| Flutter | `XCenterPublicConfig.loadAsset()` reads the public asset. Pass a build-time map or explicit settings if needed. | `config.identity().signIn()` manages the native browser flow. For Flutter web, use `begin`, navigate the page, and pass the same-origin callback to `complete`, or use a confidential backend. |

The selected scopes must match those required by the app's registration. Only the user can grant optional scopes. Save validated tokens where the platform provides secure storage. In a confidential web product, retain them in the backend session. The SDK validates identity and returns tokens, and the product attaches that identity to its own session. Callers with multiple windows or processes must serialize refresh of the same persisted credential to avoid reusing an invalidated token.

## Backend services

Store secrets in the service environment or a private server `xid.json`. Do not serve that file. The SDK checks explicit settings first, followed by environment variables and then the local file. A missing implicit file is allowed. A missing explicitly selected file is an error.

| JSON property | Environment key | Purpose |
| --- | --- | --- |
| `clientId` | `XCENTER_CLIENT_ID` | Client ID assigned by Developer Apps |
| `clientSecret` | `XCENTER_CLIENT_SECRET` | Confidential OAuth client secret |
| `redirectUri` | `XCENTER_REDIRECT_URI` | Exact registered callback |
| `databaseKey` | `XCENTER_DATABASE_KEY` | Separate verified-app service database credential |
| `scopes` | Set in the JSON or constructor | Default consent scopes |
| `allowLoopback` | Set in the JSON or constructor | Explicit opt-in for registered loopback callbacks |

```js
import {createXCenterOIDC, createServiceClient} from '@xcenter-id/server';

// With no arguments, both use the environment and private ./xid.json.
const auth = await createXCenterOIDC();
const { url, transaction } = await auth.begin();
const service = createServiceClient();
await service.records.put('notes', 'first', {data:{title:'First note'},public:false}, {revision:0});
```

Store the returned transaction with the product session, redirect the user to its URL, then consume the transaction once with `auth.complete(callback, transaction)`. Verified native clients can use the existing backend handoff on devices without a supported callback.

| Backend | Source package | Initialization |
| --- | --- | --- |
| Node.js 22+ | `packages/server` | `createXCenterOIDC(options)`, `createServiceClient(options)` |
| Swift on macOS | SwiftPM product `XCenterIDServer` | `XCenterServerConfig.load()`, then `identity()` and `records()` |
| Kotlin/JVM 17+ | `packages/kotlin-server` | `XCenterConfig.load()`, then `identity()` and `records()` |
| Standalone Dart | `packages/dart-server` | Import `package:xcenter_id_server/config.dart` and call `XCenterConfig.load()` |
| Next.js/Vercel | Same Node package | Use backend functions with protected environment variables |

Server SDKs support beginning and completing device sign-in. Display the verification URL and short user code. Keep the polling transaction and device credential on the backend. Browser and native clients can ask their own service to start and follow approval without handling the confidential secret.

Issuer sign-out opens the provider's session end page. Unlinking from the dashboard revokes a live app grant. Account administration and SMTP/IMAP retain their existing authentication boundaries.
