# X-Center ID data clients

Start by [registering the app](integration.md). For platform differences and verification, see [API coverage](API_COVERAGE.md). See [configuration and sign-in](CONFIGURATION.md) for `xid.json`, environment variables and explicit settings. Use the SDK’s secure browser sign-in to get a user token. An app needs its own client registration even when using the same SDK as another app. Plain Node.js and Next.js use the same server module.

## Choose the credential and feature

| Operation | Credential or scope | SDK surface |
| --- | --- | --- |
| Discovery, public app icons, public profile and photo | None | Public client |
| UserInfo and account photo | User access token with `openid` | User client |
| Consented email, age range and verified-email status | `email`, `age_range` | UserInfo |
| Accepted friends and app-specific subjects | `friends` | User client |
| Create, list, edit and remove account-owned app records | `app_data` | User records |
| Read a published collection from another app | `app_data` and live consent, both apps linked | Shared records |
| Share own records with selected users | `app_data`, pass `readers` when writing | User records |
| Public records | Anonymous reads. Verified app and explicit visibility on writes | Public client and records |
| Create, list, edit and delete service-owned records | Verified app database key | Node, Swift, JVM or Dart service client |
| List and download account files and folders | `files_read` or `files_write` | User files |
| Upload, rename, move and delete account files. Create, rename, move and delete empty folders | `files_write` | User files |
| List and download incoming shared files | `shared_files_read` | User files |
| Authorization code + PKCE, ID token validation, refresh rotation and device flow | Registered sign-in, confidential backend for device flow | Public platform OAuth clients and confidential backend SDKs |
| Create, list and manage user app backups | `app_data` and the account owner’s backup permission | App backup methods |

Account settings, credentials, administrator actions, friends management, mailbox operations, app registration, private-app membership, cross-app grants, and database configuration use the hosted dashboard. An app token and a database key grant only their designated permissions. The mail UI and SMTP/IMAP use separate account credentials. Administrator-designated trusted apps can request user-consented account scopes. Mail remains a first-party account capability. X-Center ID currently does not advertise OAuth token revocation. To revoke live access, unlink the app in the dashboard. Product sign-out clears the product session and its saved credentials. Ending an issuer session alone does not replace grant revocation.

Hosted records require explicit `public` on every write. Put with revision 0 to create. Read an existing record before replacing or deleting it, and send its returned revision. Only retry a stale write after dealing with the conflicting change. Continue list requests with the server's `nextCursor`. Developer-controlled sharing allows reads of the current user's source records, subject to consent. It does not expose the service database.

The inline base64 upload supports 1 byte to 2 MiB. Use the [resumable transfer API](ACCOUNT_AND_PEER_APIS.md#quota-limited-file-transfer) for files up to the account’s remaining quota. The dashboard handles recursive deletion, shared-file access changes, and capacity management. File download methods return the bytes or a binary response. Manage images with a native image loader or a browser object URL, and release temporary files and object URLs after use. Treat downloaded content as untrusted.

For field-by-field backup responses, see [app backups](https://id.xcenter.it/docs/sdk/list-app-backups). Standard storage encryption and the opt-in ADP pilot are described in [Encryption and ADP](https://id.xcenter.it/docs/encryption).

## JavaScript, Expo and plain Node.js

```js
import {createPublicClient, createUserClient} from '@xcenter-id/client';

const publicApi = createPublicClient();
const user = createUserClient({
  clientId: 'your-registered-client-id',
  getAccessToken: () => yourSession.getCurrentAccessToken(),
});

const profile = await user.userInfo();
const created = await user.records.put('notes', 'first_note', {
  data: {title: 'First note'}, public: false,
}, {revision: 0});
const saved = await user.records.get('notes', created.id);
const files = await user.files.list();
```

In Expo you can also import from `@authnjs/expo/client`. For plain HTML copy `index.js`, `oauth.js`, `config.js`, and `session.js` from `packages/client` together to your static assets and use a module script to import it. There is no React dependency. The web component stays in `@xcenter-id/web`. For confidential websites keep OAuth credentials and the actual token on your backend, and call your own authenticated product API from the browser. The provider source includes delegated file and public profile CORS. Deployments predating that change need same-origin application endpoints for those browser calls.

```js
import {createServiceClient} from '@xcenter-id/server/data';

const service = createServiceClient({
  clientId: process.env.XCENTER_CLIENT_ID,
  databaseKey: process.env.XCENTER_DATABASE_KEY,
});
await service.records.put('status', 'installation', {
  data: {ready: true}, public: false,
}, {revision: 0});
```

Run Node.js 22 or later. Install all needed tarballs from the same SDK checkout to supply the shared dependency without a package registry. The following packs the public and server tarballs. Pack `./packages/expo` and `./packages/web` similarly when required.

```sh
npm pack ./packages/client ./packages/server
npm install ./xcenter-id-client-0.3.0.tgz ./xcenter-id-server-0.3.0.tgz
```

Use `createXCenterOIDC` from `@xcenter-id/server` for confidential browser callbacks. Save each transaction server-side and take it exactly once before `complete`. Keep session credentials separate for every account. To keep access tokens current, pass `createSessionTokenSource` to `getAccessToken`. Provide locked load/save and refresh adapters so all processes share one persisted refresh token. If a refresh response was lost, require a new sign-in instead of replaying the consumed token. Set `allowLoopback: true` only for a portal registration with an exact loopback callback.

For TVs and other input-constrained devices, use `beginDevice` and show only its user code and verification URL. Store the returned transaction server-side, bind it to the requesting product session and pass an AbortSignal to `completeDevice`. Do not send the transaction or its device secret to the display. For ordinary mobile sign-in keep the system browser integration.

## Swift, Kotlin and Flutter

| Stack | Constructor and import | Return values |
| --- | --- | --- |
| SwiftPM `XCenterID` | `XCenterDataClient(clientID: clientID, accessToken: { try await session.token() })` | `Data` for decoding with `JSONDecoder` or for images and files |
| Kotlin `it.xcenter.id` | `XCenterDataClient(clientId) { session.accessToken() }` | `ByteArray`; use an IO dispatcher |
| Flutter `package:xcenter_id/xcenter_id.dart` | `XCenterDataClient(clientId: clientId, accessToken: session.accessToken)` | `Uint8List`; decode JSON using `jsonDecode(utf8.decode(bytes))` |

Use constructors without credentials for public reads. These clients supplement the existing secure-browser sign-in and Account Overview. Use the supplied record and file methods rather than assembling URLs or forwarding the account header yourself. Service-owned database keys belong on a backend. Dart's browser transport follows the provider's CORS rules. [Browser transport documentation](https://pub.dev/documentation/http/latest/browser_client/BrowserClient-class.html)
