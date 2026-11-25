# API coverage by SDK and platform

Audit dated 25 November 2026. Provider production revision `7124b6b` (0.17.0). Public SDK source reviewed at `ec394b7`. This report distinguishes API methods from hosted flows and successful platform builds from authenticated runtime tests.

| Capability | Browser JS / Web Component | Expo | Swift | Kotlin | Flutter | Node.js |
| --- | --- | --- | --- | --- | --- | --- |
| Anonymous discovery, public profiles and avatars, app icons and public record list/get | Direct | Direct | Direct | Direct | Direct | Direct |
| UserInfo, account avatar and consented friend list | Direct | Direct | Direct | Direct | Direct | Direct |
| Account-owned record list/get/put/delete, visibility, recipient sharing and pagination | Direct | Direct | Direct | Direct | Direct | Direct |
| Read consented collections from other apps | Direct | Direct | Direct | Direct | Direct | Direct |
| Account file list/download/upload, rename, move and delete. Folder creation, rename, move and empty deletion | Direct | Direct | Direct | Direct | Direct | Direct |
| Read incoming shared files | Direct | Direct | Direct | Direct | Direct | Direct |
| Start sign-in in a framework-appropriate browser | Host's same-origin backend start route | Built-in PKCE start and browser | Browser adapter accepts host-prepared request | Browser adapter accepts host-prepared request | Native adapter accepts host-prepared request. Web uses backend | Built-in authorization URL and transaction |
| Exchange code and validate ID token | Backend | Host app or backend | Host app or backend | Host app or backend | Host app or backend | Built-in |
| Refresh and rotate a session | Backend | Host app or backend | Host app or backend | Host app or backend | Host app or backend | Built-in refresh and serialized persistence helper |
| Device approval initiation and polling | Backend | Backend | Backend | Backend | Backend | Built-in with confidential client |
| Verified app service storage | Backend | Backend | Backend | Backend | Backend | Built-in server client |
| Historical saved-place endpoints | Backend | Backend | Backend | Backend | Backend | Built-in migration client |
| Product sign-out | Host session | Host session | Host session | Host session | Host session | Host session |
| End the issuer session | Hosted issuer route | Hosted issuer route | Hosted issuer route | Hosted issuer route | Hosted issuer route | Issuer discovery supplies the URL. No dedicated helper |
| Revoke a live app grant | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow. Live discovery has no OAuth revocation endpoint |

“Direct” means the SDK contains the operation. It still requires the matching active registration and granted scope where applicable. “Backend” can be the existing Node.js SDK or a backend using the same HTTP contract. Service writes must remain server-side even when the consuming app uses Swift, Kotlin or Flutter. Those languages do not currently have standalone framework-free server SDKs for service storage, device polling, the saved-place migration API, or confidential-client sign-in.

The delegated file upload endpoint accepts up to 2 MiB of nonempty data. Chunked uploads, recursive delete, changing file shares and account usage are available through the account dashboard. Account, passkey, device, mailbox, email verification, contact management, developer registration, callback approval, entitlements, quotas and administration endpoints use first-party sessions. The issuer does not expose third-party access scopes for them. Mail clients authenticate separately through SMTP/IMAP.

## Verification

- Live discovery returned ten supported scopes, the device authorization endpoint and an issuer end-session URL. It did not advertise token revocation.
- Production returned CORS headers for discovery, public records and profiles, delegated files, shared files, friend lists and the signed-in avatar route. Unauthenticated delegated reads were denied. The deployment separately verified browser file preflight against production.
- The shared JavaScript test covers the HTTP verb, path, query string and credential for every public, delegated and Node service data operation. Headless Chromium covers the browser write and Account Overview flows with synthetic data. The Expo entry point forwards to the same package.
- The matched SDK CI run compiled Swift for macOS and iOS Simulator, assembled Android and analyzed/tested Flutter. The native method mapping is based on the Swift, Kotlin, and Dart source. The builds do not verify each authenticated operation on physical devices. [SDK CI run](https://github.com/Xarber/xcenter-id-sdk/actions/runs/45635778866)

To claim equivalent standalone SDK support, add server-only Swift, JVM Kotlin and pure Dart modules, verify the native OAuth exchange and refresh paths, and run the same authenticated data contract against synthetic accounts from each client. Preserve the provider's first-party and confidential credential boundaries.
