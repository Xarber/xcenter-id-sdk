# Current integration contract

## Portal

Open the [Developer Portal](https://id.xcenter.it/developer) while signed in. Look for an exact product match. Otherwise choose **Register an app** and enter its real name and an exact HTTPS callback on a product-controlled domain. Select Native only for an OS-verified app return. Select Website when a backend owns the callback and code exchange, including unsigned-device browser handoff. The API accepts up to eight callback paths on one HTTPS origin with no queries, fragments, wildcard paths or embedded credentials.

**Prioritize the app icon at registration.** Choose the product's actual icon from the existing branding or platform assets. Use a square PNG or JPEG export, then choose **Choose app icon** on the new or existing registration and save the app profile. Check the portal preview and a consent screen. A recognizable icon helps users identify the requesting product and distinguish it from the source apps whose data it requests. This is strongly recommended and optional. Continue if the product has no approved icon yet, and record the follow-up.

Open the pending registration, copy its TXT name and value, and publish those exact details in the callback host's DNS zone. The expected form is `_xcenter-id.<callback-host>` with TXT value `xcenter-id=<registration UUID>`. Resolve the public TXT and then choose **Verify domain and activate**. Record the verified callback and client ID in the target project's setup. Place any one-time confidential secret directly into the target backend's protected configuration. Only an active registration can sign users in. An app-owned service database additionally requires an administrator to choose **Verify app**. Private user-owned storage is available to active apps with the user’s `app_data` grant.

If portal login, the callback host or DNS access is missing, name the exact blocker. Give the user the portal link and the next action in that interface. Include the actual callback and TXT details when observed. Before choosing defaults, inspect the target app's existing service and DNS access. Keep independent implementation and isolated tests moving while activation is pending. Use a public DNS lookup to confirm publication and verify activation in the portal when the dependency clears.

A DNS challenge proves control of the callback domain. It does not establish which installed mobile app receives the callback. Configure Apple Associated Domains and the apple-app-site-association file with the app's team ID and bundle ID, and Android intent filters and assetlinks.json with its package name and release certificate digest. Verify association on an installed development or release build. Sharing a callback with another product defeats product isolation.

## Framework-neutral setup

Use the [manual developer guide](https://id.xcenter.it/docs#manual) and its HTTPS examples. For Python, Go, Swift, Kotlin, or any other stack, choose an OpenID Connect library that supports issuer discovery, S256 PKCE, state, nonce and ID-token validation. There is no X-Center package to install for this path.

1. Register a Website backend for a server-owned HTTPS callback. A browser-only frontend can use a backend to own this exchange and create the product session. Use a Native registration only for a public client with an OS-verified HTTPS callback the product controls.
2. Discover `https://id.xcenter.it/.well-known/openid-configuration`. Before opening authorization, create a short-lived transaction holding state, nonce, exact callback, expected client ID and original verifier.
3. Use the discovered authorization endpoint with `response_type=code`, `scope=openid`, and S256 PKCE. On return, validate state, redeem the code once at the discovered token endpoint and verify the ID token with the issuer's signing keys.
4. Authenticate a confidential client's exchange using HTTP Basic on the backend. For a registered public native client, use its client ID and PKCE. Map the verified issuer and pairwise subject to the product's account and issue the product's own session.
5. For delegated reads, use the returned bearer access token against discovered UserInfo or the documented hosted data route when the app is active and authorized for `app_data`. Treat failure after unlink or deletion as lost access.

Follow [session renewal and account UI](sessions-and-ui.md) for the preferred secure browser handoff and long-lived product sessions.

## Optional Expo package

The [Expo package in the public SDK repository](https://github.com/Xarber/xcenter-id-sdk/tree/main/packages/expo) is `@authnjs/expo`. It currently targets React 19, React Native >=0.83 <0.89 and Expo 58 authentication modules. Read its package.json and installed target versions. Install from a checkout of the GitHub repository or a verified package archive. Do not embed a private repository access token into the target app or a package URL.

AccountEntry from @authnjs/expo renders the reusable account entry UI. RegisteredAppSignIn from @authnjs/expo/registered-signin starts the native flow. authorizeNative from @authnjs/expo/authorize-native uses Expo AuthSession with S256, a cryptographically generated nonce and an HTTPS native return. It requests openid and returns code, verifier, nonce and redirectUri. Cancellation returns null. It does not establish the product session.

For a product backend, prefer letting that backend create and retain the one-time authorization transaction, open its authorization start in the system browser, validate the exact callback, and redeem the code with its own verifier and credentials. Use a one-time return bound to the app's initial verifier to deliver the product session to the native app. An app-supplied expected nonce at completion is not a replacement for a backend-retained pre-authorization nonce.

For a registered public native client, send client_id, code, code_verifier, exact redirect_uri and grant_type=authorization_code to the issuer token endpoint discovered from its exact issuer URL. An established OIDC library must validate the ID token with the nonce created before this flow. If a product backend accepts that result, bind it to its own prior transaction and expected audience, or let the backend own authorization. Never accept an arbitrary user-supplied subject or decode an ID token without validating it. Store product sessions with SecureStore or equivalent OS-backed storage.

## API and identity boundaries

Use the issuer's .well-known/openid-configuration. Pin the issuer and validate endpoint origins. Exact registered redirect paths, S256 verifier checks and state verification are mandatory. Every ID token is bound to its client audience. The issuer uses pairwise subjects, so product A and product B receive different subjects for the same person.

The identity provider uses opaque access tokens. Third-party native clients cannot use the account manager's /account/native/exchange or /account/login/code to obtain privileged account-manager sessions. The registered API accepts supported active-client access tokens with app_data scope for the user’s own app records. Cross-app reads additionally require an owner-approved, unexpired grant. Giving product B the same display name, username or client ID as product A does not create product A credentials or its callback ownership.

## Host app checks

Trace normal login, deep-link return and app-session restore. Preserve user data when switching login providers. Verify against isolated identities before public deployment. Include negative checks showing that app B cannot redeem app A's code, that a different callback or verifier fails, and that an unregistered/revoked client fails. For public clients, verify the OS sends the claimed HTTPS callback only to the intended app. Backend identity, user consent and OS callback ownership are distinct checks.

If behavior differs from the guide, verify live issuer discovery and the target app's callback, registration and consent configuration. Apply any discovered security fix at its relevant boundary before reporting integration complete.

## Unsigned apps and clients without an app callback

Use the product's backend as the OIDC client. Register its exact HTTPS browser callback as a **Website backend**. The device never has to claim a URL, receive an OS app link, or carry a client secret.

1. The local app generates a cryptographically random pickup verifier. It sends only its SHA-256 challenge to the product backend over HTTPS and receives a short-lived transaction handle and browser URL.
2. The product backend independently creates an OIDC state, nonce and PKCE verifier for that transaction. On iOS open the HTTPS URL in `ASWebAuthenticationSession`, using the backend handoff without a native return URL. On Android use a system Custom Tab. Show the product's identity and the user's chosen account before completing the browser sign-in.
3. The issuer returns to the backend's registered HTTPS callback. The backend validates and consumes state, exchanges the code using its own secret and PKCE verifier, and validates issuer, signature, audience, expiry and nonce. It shows a completion page in the browser. Keep issuer tokens, product session tokens and pickup proof out of browser URLs.
4. The local app polls its product backend with the transaction handle and original pickup verifier over HTTPS. Enforce short expiry, bounded polling and cancellation. Only a proven client can redeem the successful transaction, and that redemption must consume it atomically. Return a product session to the device over HTTPS. After successful pickup and session persistence, dismiss the iOS authentication sheet automatically. Stop polling when the sheet closes.

Verify pending, wrong proof, expired, canceled and replayed pickup requests. The app owns the pickup implementation. X-Center ID supplies the existing confidential authorization code flow. Its private native account-manager exchange is reserved for the dashboard. There is currently no issuer device-code grant for an unsigned, backend-less client.

### QR and manual codes for input-constrained devices

Use this only for devices where the regular secure browser flow is unavailable or particularly inconvenient, such as a TV or kiosk. Keep the secure browser as the normal sign-in path. Unsigned phones or desktops can still use the backend browser handoff above.

Use an active confidential registration, with its secret on your backend only. The shipped app asks its backend for a pairing transaction. Your backend generates and saves a random nonce and starts [OAuth device authorization](https://www.rfc-editor.org/rfc/rfc8628.html) on the issuer. Discover `device_authorization_endpoint`, currently `POST /device/auth`. Authenticate with HTTP Basic, and send URL-encoded `client_id`, `scope` (including `openid` and the registration's required scopes), and `nonce` (at least 22 URL-safe characters). Keep `device_code` on the backend. Bind the backend transaction to the specific waiting installation or session.

Display the six-character `user_code`, the manual address `https://id.xcenter.it/device`, and a QR code encoding the returned `verification_uri_complete` (`https://id.xcenter.it/device?code=XXXXXX`). The user can scan with the X-Center ID app or a system QR scanner, or enter the code on an already signed-in phone or computer. Explain that users should approve only if the app and displayed code match their device. X-Center ID handles first-time linking, permissions and repeat sign-in confirmation there.

Poll the issuer token endpoint from your backend with the same authenticated client and form fields `grant_type=urn:ietf:params:oauth:grant-type:device_code` and `device_code`. Respect `interval` and `expires_in`, back off on `slow_down` or transport failures, and stop on denial, expiry or success. Verify signature, issuer, audience, expiry and saved nonce before creating the product session. Return the product session only to the bound device. Keep the user's login, files and private sync scoped to their account container. Service-owned shared records use the separate app database and backend key.
