# SwiftUI

Add the [SDK repository](https://github.com/Xarber/xcenter-id-sdk) as a Swift Package and select `XCenterID`. The account card supports iOS 16 and macOS 13. The registered HTTPS callback requires iOS 17.4 or macOS 14.4. For older clients or unsigned iOS builds, use the backend pickup flow.

Place `AccountOverview(profile:clientID:signIn:signOut:settings:)` at the top of Settings. Use the trailing view to show the app's own sync toggles. The card replaces the sign-in banner as soon as the host publishes its product profile.

Create `BrowserSignIn(anchor:)` with the presenting window. For native registration, create `RegisteredBrowserRequest(authorizationURL:callbackURL:)` from the OIDC transaction. Call `authorize`, then send the returned callback to your transaction-bound exchange handler. Configure the exact universal link and Associated Domains before testing. The browser sheet closes when it receives the registered HTTPS callback. With a confidential backend registration, call `authorizeWithPickup(browserURL:backendOrigin:complete:)` and supply the bounded proof-bound completion closure. Return only after the product session is validated and persisted. Cancel cleanup when the task or sheet is closed. See [the product session contract](../../docs/integration.md).

For a protected picture, give the card an authenticated product avatar URL or a product-owned image source adapter. Map the trusted profile and badges from checked UserInfo, and keep credentials in Keychain.
