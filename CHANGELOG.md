# Changelog

## App container file APIs

- JavaScript client, server and web 0.5.0 and Expo 0.7.0 expose resumable uploads and access to files in a registered app’s own namespace.
- Swift, Kotlin and Dart provide matching transfer, download, visibility and list operations. Verified service adapters have their own private file namespace.
- Ordinary account folder rows return the size of committed files in their subtree.

## 0.4.0 · 2026-11-26

- Added quota-based resumable uploads and shared signaling for verified apps.
- Added delegated account overview and settings for trusted apps with explicit user consent.

## 0.3.0 · 2026-11-25

- Added public OAuth exchange, signed identity validation and token rotation for registered browser and native apps.
- Added Swift, Kotlin/JVM and standalone Dart backend clients for confidential OAuth, device approval and service storage.
- Configure clients through explicit values, environment variables or `xid.json`. Frontend configuration accepts public settings only.

## 0.2.0 · 2026-11-25

- Added public and user-authorized API clients for plain JavaScript, Expo, Swift, Kotlin and Flutter.
- Added a Node.js service database client, safe session refresh helper, device authorization and a saved-place migration client.
- Documented requests, writes, file operations and authorization boundaries.

## 0.1.0 · 2026-11-20

- Separate public SDK source for web and server, SwiftUI, Android Compose, Flutter and a Next.js/Vercel example.
- Includes the Expo SDK at 0.3.0 with managed browser sign-in and account overview.
- Publishes setup guidance for registered callbacks, backend pickup, profile, email, permissions, friends and storage.
