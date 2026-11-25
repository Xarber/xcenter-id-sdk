<p align="center"><img src="packages/web/xcenter-id-mark.svg" width="80" alt=""></p>

# X-Center ID SDK

Add X-Center ID to your app's Settings. A single **AccountOverview** shows a sign-in banner or the signed-in profile in the same place. The account detail view opens the main dashboard, opens the linked app's permissions, signs out of the product, and gives the host app room for its own settings and sync controls.

| Your app | Start here |
| --- | --- |
| Expo / React Native | [Expo package](packages/expo) with managed sign-in, overview and stand-alone sign-in |
| Native iOS / macOS | [Swift Package](packages/swift) with SwiftUI and ASWebAuthenticationSession |
| Native Android | [Kotlin library](packages/android) with Compose and Android Auth Tab |
| Flutter | [Dart package](packages/flutter) with an account card and system-browser adapter |
| HTML, Vue, Svelte, Angular, Lit | [Web component](packages/web) using standard DOM properties and slots |
| React / Next.js on Vercel | [React card and server routes](examples/nextjs) |
| Other backends and platforms | [OpenID Connect integration](docs/integration.md) and the [public API guide](https://id.xcenter.it/docs#manual) |

1. Register your app and activate its exact HTTPS callback in the [Developer portal](https://id.xcenter.it/developer). Use the [integration guide](docs/integration.md) to select a registration type.
2. Install the component for your stack and bind it to a product session. Use the secure system browser for the provider's passkeys and signup.
3. Choose the smallest set of [capabilities](docs/capabilities.md) your app needs. The same provider APIs support profile details, email and Hide My Email, friends, private user sync, verified app storage, and cross-app sharing.

For agent-assisted setup, install the [Integrate X-Center ID skill](skills/integrate-xcenter-id) from this repository.

The source is distributed through this repository. Packages have stack-specific compatibility requirements and validation status in [Testing](docs/TESTING.md). Project code is AGPL-3.0-only. See [LICENSE](LICENSE).

Use the [data client and backend SDK guide](docs/DATA_CLIENTS.md) for API requests, storage writes, files, friends, and plain Node.js services.
