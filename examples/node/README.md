# Plain Node.js example

Run `npm ci` at the SDK repository root, then `node examples/node/data.mjs`. The example checks public discovery. To also check UserInfo or service storage, inject `XCENTER_CLIENT_ID` and the matching `XCENTER_USER_ACCESS_TOKEN` or `XCENTER_DATABASE_KEY` through your backend's environment. The example performs only reads.

For a production web product, use the OAuth callback and refresh helper from [the data clients guide](../../docs/DATA_CLIENTS.md). Persist rotated tokens on the server. Browser requests may rely on your app's authenticated session instead of holding provider tokens.
