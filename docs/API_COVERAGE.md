# API coverage by SDK and platform

Audit dated 25 November 2026. Provider production revision `7124b6b` (0.17.0). Public SDK source reviewed at `ec394b7`. The parity update supersedes the initial SDK audit. This report distinguishes API methods from hosted flows and successful platform builds from authenticated runtime tests.

| Capability | Browser JS / Web Component | Expo | Swift | Kotlin | Flutter | Node.js |
| --- | --- | --- | --- | --- | --- | --- |
| Anonymous discovery, public profiles and avatars, app icons and public record list/get | Direct | Direct | Direct | Direct | Direct | Direct |
| UserInfo, account avatar and consented friend list | Direct | Direct | Direct | Direct | Direct | Direct |
| Account-owned record list/get/put/delete, visibility, recipient sharing and pagination | Direct | Direct | Direct | Direct | Direct | Direct |
| Read consented collections from other apps | Direct | Direct | Direct | Direct | Direct | Direct |
| Account file list/download/upload, rename, move and delete. Folder creation, rename, move and empty deletion | Direct | Direct | Direct | Direct | Direct | Direct |
| Read incoming shared files | Direct | Direct | Direct | Direct | Direct | Direct |
| Start sign-in in a framework-appropriate browser | Public PKCE URL or confidential backend | Built-in PKCE and OS browser | OS authentication sheet and PKCE | Auth Tab and PKCE | Native system browser and PKCE. Web redirects with saved transaction | Built-in confidential authorization URL |
| Exchange code and validate ID token | Direct for public clients in Web Crypto | Direct on registered HTTPS callback | Direct | Direct | Direct | Direct |
| Refresh and rotate a session | Direct with caller-provided persistence | Direct with caller-provided persistence | Direct with caller-provided persistence | Direct with caller-provided persistence | Direct with caller-provided persistence | Direct with caller-provided persistence |
| Device approval initiation and polling | Own backend | Own backend | Swift server package on macOS | Kotlin/JVM server package | Dart server package | Node server package |
| Verified app service storage | Own backend | Own backend | Swift server package on macOS | Kotlin/JVM server package | Dart server package | Node server package |
| Historical saved-place endpoints | Own backend | Own backend | Swift server package | Kotlin/JVM server package | Dart server package | Node server package |
| Product sign-out | Host session | Host session | Host session | Host session | Host session | Host session |
| End the issuer session | SDK exposes issuer URL | SDK exposes issuer URL | SDK exposes issuer URL | SDK exposes issuer URL | SDK exposes issuer URL | SDK exposes issuer URL |
| Revoke a live app grant | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow | Hosted Linked apps flow. Live discovery has no OAuth revocation endpoint |

“Direct” means the SDK contains the operation. It still requires the matching active registration and granted scope where applicable. “Backend” can be the existing Node.js SDK or a backend using the same HTTP contract. Service writes must remain server-side even when the consuming app uses Swift, Kotlin or Flutter. The Swift server product uses Apple Security on macOS. Kotlin/JVM and standalone Dart support backends without a mobile toolchain. Public native and browser SDKs never need a client secret.

The delegated file upload endpoint accepts up to 2 MiB of nonempty data. Chunked uploads, recursive delete, changing file shares and account usage are available through the account dashboard. Account, passkey, device, mailbox, email verification, contact management, developer registration, callback approval, entitlements, quotas and administration endpoints use first-party sessions. The issuer does not expose third-party access scopes for them. Mail clients authenticate separately through SMTP/IMAP.

## Verification

- Live discovery returned ten supported scopes, the device authorization endpoint and an issuer end-session URL. It did not advertise token revocation.
- Production returned CORS headers for discovery, public records and profiles, delegated files, shared files, friend lists and the signed-in avatar route. Unauthenticated delegated reads were denied. The deployment separately verified browser file preflight against production.
- The shared JavaScript test covers the HTTP verb, path, query string and credential for every public, delegated and Node service data operation. Headless Chromium covers the browser write and Account Overview flows with synthetic data. The Expo entry point forwards to the same package.
- The matched SDK CI run compiled Swift for macOS and iOS Simulator, assembled Android and analyzed/tested Flutter. The native method mapping is based on the Swift, Kotlin, and Dart source. The builds do not verify each authenticated operation on physical devices. [SDK CI run](https://github.com/Xarber/xcenter-id-sdk/actions/runs/45635778866)

End-to-end OS handoff and authenticated live writes on physical devices require separate verification. Device start, credential handling, and API scopes are described in [configuration and sign-in](CONFIGURATION.md).
