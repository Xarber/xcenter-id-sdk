# Choose an account component

Use the [standalone public SDK](https://github.com/Xarber/xcenter-id-sdk). Pin the tested source revision in the product. Verify the framework and package versions already used by the product. Keep the existing route and settings behavior. Prefer the account overview as one signed-in/signed-out entry at the top of Settings.

| Existing stack | Source and adapter |
| --- | --- |
| Expo / React Native | [Expo](https://github.com/Xarber/xcenter-id-sdk/tree/main/packages/expo). Use the managed AccountOverview and optional sync controls. For signed iOS use the verified HTTPS ASWebAuthenticationSession flow. For unsigned iOS use the proof-bound backend adapter and close the browser only after saving the validated product session. |
| Native Apple | [SwiftUI](https://github.com/Xarber/xcenter-id-sdk/tree/main/packages/swift). Add the Swift package product XCenterID. Use BrowserSignIn with exact HTTPS callback on supported OS versions, or use its ASWebAuthenticationSession pickup adapter with the product backend for unsigned clients. |
| Native Android | [Kotlin and Compose](https://github.com/Xarber/xcenter-id-sdk/tree/main/packages/android). Use the Auth Tab adapter and a verified Android App Link. Supply a system-browser backend pickup adapter if the app cannot claim a link. |
| Flutter | [Flutter package](https://github.com/Xarber/xcenter-id-sdk/tree/main/packages/flutter). Add the Git/path dependency and bind its browser adapter on supported native platforms. Use the host's same-origin backend flow on web or a platform adapter for callback-free native builds. |
| Plain HTML, Vue, Angular, Svelte or Lit | [Web Component](https://github.com/Xarber/xcenter-id-sdk/tree/main/packages/web). Use the `xcenter-account-overview` element, DOM properties and settings slot. Bind a same-origin HTTPS backend sign-in start path. |
| React / Next.js, including Vercel | [Client account card and App Router routes](https://github.com/Xarber/xcenter-id-sdk/tree/main/examples/nextjs). Keep the client secret, token exchange, durable browser transaction store and refresh backend-only. Register the canonical deployment origin and exact callback. |
| Other backends and frameworks | [OpenID Connect guide](https://github.com/Xarber/xcenter-id-sdk/blob/main/docs/integration.md) using a version-compatible OIDC library and the provider's supported endpoints. |

Use the profile after checking UserInfo and the validated token subject. Pass a supported image source from the product avatar adapter. Keep the provider token out of image URLs. The overview displays the dashboard and linked-app routes, sign-out action and the host's settings. Mount those controls once. The product owns the verified session, profile, delegated data, logout and settings changes.

Check the [SDK testing status](https://github.com/Xarber/xcenter-id-sdk/blob/main/docs/TESTING.md) and test the actual integration on your target device or browser. A package's build does not establish app registration, callback ownership or working sign-in.
