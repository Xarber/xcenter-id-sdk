# Verification

Run `npm ci` and `npm test` at the root. Node tests cover callback identity and safe browser URLs. Swift syntax and package manifest checks can run without an iOS simulator. The SDK quality workflow builds Swift for an iOS simulator destination, compiles the Android library and analyzes/tests Flutter.

For real integration use an isolated user and a developer registration. Test signed-out banner, canceled sign-in, exact callback with valid state and verifier, wrong callback, expired transaction, role/auth isolation, successful profile and sign-out, unlinking, access removal and settings persistence. Test device-level browser return and auto-dismiss separately on Apple and Android hardware. A compile check alone does not establish device sign-in or validate a host product's callback configuration.
