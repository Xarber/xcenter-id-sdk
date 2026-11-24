# Active SDK tasks

## Complete X-Center ID SDK

The request is to extend the existing SDK for every framework with an Account Overview implementation. Cover supported requests and writes in addition to sign-in and account UI. Include plain JavaScript for browsers, plain Node.js independent of React and Next.js, and clearly separated server clients for backend services. Preserve existing component and sign-in exports.

| ID | State | Work and acceptance criteria |
| --- | --- | --- |
| SDK-001 | Queued | Build an endpoint-and-scope coverage matrix against the live provider source and existing packages. Record schemas, pagination, binary transfer, OAuth and backend credentials, supported CORS, and dashboard-only boundaries. Mark legacy interfaces separately. Use the matrix as the testable definition of completeness. |
| SDK-002 | Queued | Extend browser JavaScript/HTML and Expo with delegated operations. Extend the existing Node.js package with distinct user, public, and service clients and complete OIDC lifecycle helpers. Keep Next.js/Vercel as a sample adapter. Check credential isolation, refresh serialization, error mapping, revision preconditions and abortable uploads. |
| SDK-003 | Queued | Implement the equivalent allowed surfaces in Swift, Kotlin and Dart, using platform-appropriate transport and OIDC integrations. Keep backend secrets out of mobile targets and avoid duplicating existing managed sign-in flows. Check supported toolchains before committing to verification. |
| SDK-004 | Queued | Add runnable quickstarts and method references, update the integration skill in both repositories, and verify all advertised operations against isolated provider fixtures. Record browser, Node and native verification separately. Prepare version metadata and integrate through the SDK's established branches. |

Start with identity discovery, authorization, token exchange and renewal, revocation and device approval; UserInfo, avatar and friends; public profiles; application data CRUD, collection pagination, revision conflicts, recipient sharing and consented cross-app reads; and delegated account files, folders and incoming shares. Confirm exact routes from the current provider before implementing. Cover service-owned storage with verified-app backend keys. Link to the hosted management flows for app registration, verification, consent, account management, mailbox and administration where the provider requires first-party authentication. A service key or relying-party token must never act as an account dashboard session.

### 24 November 2026 usage checkpoint

The local public SDK checkout and its `testing` branch were verified. Existing packages cover HTML/Web Components, Expo, Swift, Kotlin, Flutter, and a Node OIDC adapter with a Next.js example. No SDK implementation, build or release began. The weekly window had 23% remaining, below the 35% threshold, and no reset credits. The reset is 30 November at 11:09:58 CET. The five-hour window had 91% remaining and resets 25 November at 01:22:16 CET. The previous override covered the provider's 0.16.0 batch. Recheck usage before resuming. The weekly threshold drops to 20% on 25 November at 11:09:58 CET.

Exact next action: complete SDK-001 against the current checkout of the X-Center ID provider, starting with `services/api/account-web.mjs`, `oidc.mjs`, `application-data.mjs` and `account-files.mjs`, and compare their route contracts with the existing SDK's web, server and native entry points.
