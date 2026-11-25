# Active SDK tasks

## Complete X-Center ID SDK

The request is to extend the existing SDK for every framework with an Account Overview implementation. Cover supported requests and writes in addition to sign-in and account UI. Include plain JavaScript for browsers, plain Node.js independent of React and Next.js, and clearly separated server clients for backend services. Preserve existing component and sign-in exports.

| ID | State | Work and acceptance criteria |
| --- | --- | --- |
| SDK-001 | Verified | Build an endpoint-and-scope coverage matrix against the live provider source and existing packages. Record schemas, pagination, binary transfer, OAuth and backend credentials, supported CORS, and dashboard-only boundaries. Mark legacy interfaces separately. Use the matrix as the testable definition of completeness. |
| SDK-002 | Verified | Extend browser JavaScript/HTML and Expo with delegated operations. Extend the existing Node.js package with distinct user, public, and service clients and complete OIDC lifecycle helpers. Keep Next.js/Vercel as a sample adapter. Check credential isolation, refresh serialization, error mapping, revision preconditions and abortable uploads. |
| SDK-003 | Verified | Implement the equivalent allowed surfaces in Swift, Kotlin and Dart, using platform-appropriate transport and OIDC integrations. Keep backend secrets out of mobile targets and avoid duplicating existing managed sign-in flows. Check supported toolchains before committing to verification. |
| SDK-004 | Verified | Add runnable quickstarts and method references, update the integration skill in both repositories, and verify all advertised operations against isolated provider fixtures. Record browser, Node and native verification separately. Prepare version metadata and integrate through the SDK's established branches. |

Start with identity discovery, authorization, token exchange and renewal, revocation and device approval; UserInfo, avatar and friends; public profiles; application data CRUD, collection pagination, revision conflicts, recipient sharing and consented cross-app reads; and delegated account files, folders and incoming shares. Confirm exact routes from the current provider before implementing. Cover service-owned storage with verified-app backend keys. Link to the hosted management flows for app registration, verification, consent, account management, mailbox and administration where the provider requires first-party authentication. A service key or relying-party token must never act as an account dashboard session.

### 24 November 2026 usage checkpoint

The local public SDK checkout and its `testing` branch were verified. Existing packages cover HTML/Web Components, Expo, Swift, Kotlin, Flutter, and a Node OIDC adapter with a Next.js example. No SDK implementation, build or release began. The weekly window had 23% remaining, below the 35% threshold, and no reset credits. The reset is 30 November at 11:09:58 CET. The five-hour window had 91% remaining and resets 25 November at 01:22:16 CET. The previous override covered the provider's 0.16.0 batch. Recheck usage before resuming. The weekly threshold drops to 20% on 25 November at 11:09:58 CET.

Exact next action: complete SDK-001 against the current checkout of the X-Center ID provider, starting with `services/api/account-web.mjs`, `oidc.mjs`, `application-data.mjs` and `account-files.mjs`, and compare their route contracts with the existing SDK's web, server and native entry points.


### 25 November implementation

The [endpoint and scope matrix](DATA_CLIENTS.md) was validated against the provider and its public discovery document. The JavaScript, Expo, Node.js, Swift, Kotlin and Dart clients are implemented. Node tests cover credential isolation, mutation preconditions, binary downloads and refresh serialization. The plain Node.js quickstart reached the live discovery endpoint. Swift data-client source type-checks locally. The local Xcode app is incomplete and cannot supply the simulator build. Kotlin and Flutter require their remote toolchains. Browser file and public-profile CORS changes are present in the provider source and need a provider deployment before a third-party browser can rely on them directly.

Node and Chromium tests passed, including a plain browser record write and the unchanged Account Overview flow. Source package dry runs for client, server, Web Components and Expo passed. The next check is the SDK GitHub quality workflow on the same source, then any fixes identified by platform tests.

The [SDK quality run](https://github.com/Xarber/xcenter-id-sdk/actions/runs/45635778866) passed web, Swift, Android and Flutter for source commit `688866b`. TypeScript declarations and the Expo re-export passed a strict local check. Local Swift data source type-checking passed. The local full build lacked the SwiftUI macro plug-in in Command Line Tools, and the complete macOS/iOS build passed with Xcode on CI. Provider-side isolated tests and Chromium passed callback approval and credential claiming. Installed-device execution and provider deployment are outside this source verification.


### Full platform parity follow-up

| ID | State | Work |
| --- | --- | --- |
| SDK-005 | Verified | Re-audited the production provider and all SDK entry points. [API coverage](API_COVERAGE.md) records the differences, and the JavaScript request test covers all the available operations. |
| SDK-006 | Implemented | Add standalone server packages for Swift, JVM Kotlin and Dart. Cover confidential auth, token rotation, device authorization, service records and legacy migration while keeping server credentials out of native and web bundles. |
| SDK-007 | Implemented | Add native public-client OAuth exchange and renewal where supported, and verify authenticated data methods with a shared synthetic provider fixture on each target. Keep the existing product-backend handoff available. |
| SDK-008 | Implemented | Configuration accepts explicit options, environment mappings and public or private `xid.json` according to the runtime. Tests cover precedence, rejection of secrets in public settings and a missing explicit file. |
