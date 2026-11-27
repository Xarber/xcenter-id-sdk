# App container files

Save a backup inside the app's own branded folder using a user token with `app_data`. Use a verified app's database key on a backend for files owned by the service. The two quotas and file lists are separate. A user upload can opt into **Browseable** so the account holder can download that file from their dashboard. Keep this off for private application state. Add `editable: true` only with `browseable: true` when the account holder should also be able to rename, replace or delete that file. Service files stay private.

## JavaScript, TypeScript, and Expo

```js
// user is createUserClient({clientId, getAccessToken}).
// backup is a seekable file, such as a browser File or a Node file handle.
const saved = await user.appFiles.uploadChunks(
  {name: "Beat Saber.zip", size: backupSize, browseable: true},
  readBase64Chunk,
  {id: savedTransferId, onProgress: storeTransferProgress},
);
const response = await user.appFiles.download(saved.id);
await user.appFiles.setVisibility(saved.id, {browseable: true, editable: true});
```

The reader takes `(offset, length)` and returns exactly those bytes as standard base64. For example, use a browser `Blob.slice` or a Node file handle that reads at an explicit byte position. Store the ID and original file to resume. Delete a saved file with `user.appFiles.delete(id)` and list with `user.appFiles.list({cursor})`. In Node, initialize `createServiceClient` from `@xcenter-id/server/data` with the client ID and protected database key. Use the same list, download, delete and upload operations on `service.files`. Omit the Browseable flag for service uploads.

The low-level `transfers` object has these operations.

| Operation | Arguments | Response |
| --- | --- | --- |
| `start` | `{name, size, browseable?, editable?}`, optional request options | `{id, chunkSize}` |
| `status` | ID, optional request options | `{id, size, chunkSize, received, committed}` |
| `append` | ID, `{position, content}`, optional request options | `{received}` |
| `complete` | ID, optional request options | `{id}` |
| `cancel` | ID, optional request options | `{ok:true}` |

Request options support `signal`. Use `chunkSize` until the last chunk, which can be shorter. Complete an empty file immediately after starting. Stream a large download from the binary response body. Revisit the [hosted API reference](https://id.xcenter.it/docs/sdk/app-container-files) for language-specific calls.

## Swift, Kotlin, and Dart

Use `XCenterDataClient` for user files and `XCenterServiceRecords` from the server SDK for service files. Never supply a database key to a mobile or browser client. Signatures differ by language. Kotlin clients perform blocking calls on a worker thread or IO dispatcher. The native adapters expose the individual transfer operations for streaming from a file without loading the whole backup into memory.

| Operation | Native method |
| --- | --- |
| Reserve a transfer | `startAppUpload` with name, byte size and optional Browseable and Editable flags for user files |
| Inspect/resume | `appUploadStatus` with transfer ID |
| Send one chunk | `appendAppUpload` with transfer ID, byte position and native bytes |
| Commit | `completeAppUpload` with transfer ID |
| Cancel | `cancelAppUpload` with transfer ID |
| List | `listAppFiles` with optional cursor |
| Download | `downloadAppFile` with file ID |
| Change dashboard visibility | `setAppFileBrowseable` or `setAppFileVisibility` with file ID and both flags, user adapter only |
| Remove | `deleteAppFile` with file ID |

Swift returns `Data`. The Kotlin user adapter returns `ByteArray`; its server adapter decodes JSON operations to `JSONObject` and returns `ByteArray` for downloads. Dart returns `Uint8List`. For large downloads with native runtimes use a streaming HTTP transport against the [binary API](https://id.xcenter.it/docs/sdk/download-app-file). Ordinary account folder listing results also include a recursive `size` on each folder row.

`setBrowseable(id, false)` clears both flags. Use `setVisibility(id, {browseable: true, editable: false})` to keep a file readable while revoking writes and deletion. The service namespace remains private. The flags grant the account holder access through their dashboard. Apps should treat an editable file as user-controlled and handle changed bytes, a renamed file, or a missing ID.

## File hashes and metadata

Every committed file returned by a list includes `sha256`, a 64-character lowercase hexadecimal SHA-256 of its original bytes. Renames, moves and visibility changes preserve the value. Replacing bytes updates it even when the file ID stays the same. Two independent files containing identical bytes have the same digest. Keep the file ID alongside the hash in an index your app owns.

| File location | JavaScript metadata call | Swift, Kotlin and Dart |
| --- | --- | --- |
| User’s Files | `user.files.get(id)` | `getFile(id)` |
| Incoming file share | `user.files.getShared(shareId)` | `getSharedFile(shareId)` |
| App’s user container | `user.appFiles.get(id)` | `getAppFile(id)` on the user client |
| App’s verified service storage | `service.files.get(id)` | `getAppFile(id)` on the service records client |

JavaScript returns a descriptor object. Swift and Dart return JSON bytes from these methods. Kotlin’s user client returns JSON bytes and its JVM service client returns a JSON object. With direct HTTPS, add `?metadata=1` to the file’s download URL and use the same credential. The response contains `id`, `name`, `size`, `created`, and `sha256`, plus applicable share or visibility fields. The download URL without this parameter still returns binary content.

## App backups

Enable backups and a compatibility version in Developer Apps → Storage. With the user’s separate backup grant and `app_data` token, call JavaScript `user.appBackups.list()`, `.create()`, `.delete(id)` for app-created backups, or `.requestRestore(id)`. Swift, Kotlin and Dart use `listAppBackups`, `createAppBackup`, `deleteAppBackup` and `requestAppBackupRestore`. Open the shared user interface with `user.appBackups.managementURL()` or the issuer URL `/apps/{clientId}/backups`. The app can request restore but the user confirms it in the dashboard. Snapshots share unchanged file content and immutable record versions.

The developer can limit backups to approved collection names or exact `collection/recordId` selections, and choose no files, all files, Browseable files, or Browseable + Editable files. Check the snapshot's `selection` before describing a restore to users. Restoring a filtered category updates only captured items.

Each returned snapshot has an `id` UUID and a lowercase `sha256` manifest fingerprint. Use the ID for restore and deletion. Compare hashes within the same account and app to identify matching captured versions and policy. The hash can match across distinct IDs. See [backup fields](https://id.xcenter.it/docs/sdk/list-app-backups) and [encryption](https://id.xcenter.it/docs/encryption).
