# Register the app and connect sign-in

1. Sign in at [X-Center ID](https://id.xcenter.it). Open **Developer apps → Register app**. Choose a unique app identity, display name and exact HTTPS callback.
2. For websites, choose **Website backend**. Use a callback on your canonical product host and keep the client secret in your protected backend. For a native app with signed HTTPS return, register a **native public client** and configure the matching Universal Link or Android App Link. Do not embed a confidential client secret.
3. Copy the registration's DNS verification record to the requested hostname. Wait for lookup to work publicly and use the portal's verification/activation flow. If you cannot prove domain control, use the portal's explicit local registration mode only when its loopback constraints fit the product. It has a different trust level and cannot masquerade as a secure registration.
4. Copy the active client ID. Select profile requirements and shared permissions in the portal and request the matching scopes. Test sign-in with an isolated account before shipping, including the already-linked consent screen and denied permissions.

## Secure browser and product session

**Prefer the AccountOverview at the top of Settings.** Bind the card's signed-out action to the secure browser flow, then return a normalized profile from the product's authenticated session. The details view already supplies Open dashboard, Manage app and Sign out. Add the host's sync categories or product-specific settings in its customization slot.

Use discovery at `https://id.xcenter.it/.well-known/openid-configuration`. Pin the issuer and its HTTPS endpoints, register an exact redirect, create a short-lived transaction with fresh state, S256 PKCE and nonce, and consume it once. Validate the authorization response and ID token through a supported OIDC library, including signature, issuer, audience, expiry and saved nonce. Check UserInfo `sub` matches the validated ID token. Map the verified issuer and pairwise subject to the app account. A user with multiple relying parties has different pairwise subjects in each registration.

The server module provides discovery, authorization preparation, the verified exchange, UserInfo and refresh. The host still owns its transaction store, authorization policy, encrypted token persistence, mapping and session cookie or mobile session. If you use a backend from a registered native public client, preserve the browser transaction on the backend, bind it to the initiating installation with a fresh proof, and pass the exact callback to the backend for validation and exchange. Do not allow browser return values to construct a product session on their own.

### Callback-free native builds

Unsigned apps can use a registered product backend. Create a fresh device pickup verifier and send its SHA-256 challenge to your HTTPS backend. Have that backend prepare and consume its own OIDC transaction with the confidential client. After the issuer returns to the product callback, redeem a short-lived product session using the original device proof over HTTPS. Use bounded polling and cancellation, and consume the pickup atomically. Never put session tokens or the pickup proof in a browser URL. On iOS keep the browser inside ASWebAuthenticationSession and dismiss it after validated session pickup. The Expo and Swift packages expose this browser/polling integration point. For Android use the system browser with a host pickup implementation. The backend handoff store and endpoints are owned by the product.

QR and manual codes are for devices such as TVs or kiosks where the regular flow is unavailable or inconvenient. Follow the [provider device authorization guide](https://id.xcenter.it/docs#manual). Keep the confidential device grant and token polling on the product backend.

### Session renewal

Request `offline_access` and `prompt=consent` for a renewable X-Center session. Access tokens last ten minutes. Refresh has a rolling 14-day idle window and rotates on each exchange. Refresh near expiry when there is foreground activity. Serialize refresh and replace the stored token atomically. Reusing a consumed token can revoke the grant. Stop refreshing after unlinking, revocation, sign-out or prolonged inactivity. Use a separate product session. Use SecureStore, Keychain or encrypted platform storage for native product credentials, and Secure HttpOnly cookies on the web.

### Profile and settings

An authorized profile photo is a protected issuer resource. Fetch it with the current user's bearer token on the issuer origin. Pass the component a safe image source supplied by the product, such as authenticated backend avatar route, browser Blob URL or in-memory image data. Revoke object URLs and clear private caches on sign-out. Never put bearer tokens in an image URL. Provider verification and admin badges do not grant any privilege in the host product.

[Read the full capability guide](capabilities.md) for access scopes, permissions, age bands, email, friends, user-owned data, app-owned storage and public or shared data.
