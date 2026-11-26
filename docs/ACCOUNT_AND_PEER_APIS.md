# Account APIs, uploads and peer signaling

The [SDK reference](https://id.xcenter.it/docs/sdk) documents public and confidential sign-in. These endpoints take a user access token from that sign-in. Keep service database keys and dashboard session credentials separate.

## Trusted account controls

An administrator enables **Administration app** for an active, verified registration with a trusted HTTPS callback. The app requests `account_overview` for storage totals and a linked app count, or `account_manage` for linked app and public profile controls. The account holder approves each scope independently in Administrative App Permissions. The settings grant requires a second confirmation explaining what the app can change. The live app trust, account status, registration, linked grant and issued scope are checked for every call. The same account can turn off grant permissions in its dashboard.

- `GET /v1/account/overview` returns `storage.used`, `storage.capacity` and `connectedApps`.
- `GET /v1/account/profile-visibility` lists public profile fields. `PUT` replaces them with an explicit `fields` array drawn from username, givenName, surname and picture.
- `GET /v1/account/apps` lists the signed-in account's linked apps.
- `GET /v1/account/apps/{client}/permissions` lists the existing permission decisions. `PUT` with `{scope,enabled:false}` may turn off optional permission decisions. Required scopes and new access remain in the consent flow.

Only surface the settings in response to a user action and explain when a field becomes public. The flag does not grant operator privileges, credentials, mailbox access, destructive account operations or permission to act on any other user. Sign-in, new app authorization and protected passkey changes retain their existing flows.

## Quota-limited file transfer

The five operations under `/v1/files/uploads` require `files_write`. Start with POST and `{name,size,folder?}`. Save the returned ID and use the provided chunk size. GET with the ID returns the position for resumption. PUT a chunk with `{position,content}`, where content is base64. POST an empty JSON object to finish and DELETE to release a pending reservation. Every write rechecks the live grant. A transfer is additionally bound to its initiating registration and account.

Call `user.files.uploadChunks(file, readChunk, {id, signal, onProgress})` in the JavaScript SDK or use the five individual transfer methods in any SDK. Supply a streaming or seekable source and encode one chunk at a time. Capture the transfer ID at the first progress callback. A final request may be repeated after a lost response. Transfer expiry is one hour of inactivity. Disk headroom, quota and the destination are checked as uploads progress.

## Shared WebRTC transport

An active verified app enables **Peer connections** in Developer Apps. Discovery is separate and off by default. A connected peer must also explicitly opt in to listing. Authentication selects an internal namespace derived from the registered client ID, so client code always handles short opaque peer IDs. The separately issued peer proof is private. It is sent in `X-XCenter-Peer-Proof` on the peer-specific operations.

- `POST /v1/peers` with `{discoverable}` creates a peer and returns `{id,proof,expiresIn}`.
- `GET /v1/peers/{id}/directory` lists discoverable peers for that app when enabled.
- `POST /v1/peers/{id}/messages` sends `{to,type,data}`, where type is offer, answer, or candidate.
- `GET /v1/peers/{id}/messages` drains pending signaling messages. Poll while waiting, independently from WebRTC media or data transfer.
- `DELETE /v1/peers/{id}` closes the signaling registration.

Use the app's WebRTC implementation for connections. Authenticate and accept application-level invitations before opening sensitive data channels. The service forwards only signaling data. A TURN server may still be needed for restrictive networks. Peer sessions expire after 90 seconds of inactivity and reconnect with new IDs after a server restart.
