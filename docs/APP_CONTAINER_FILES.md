# App container files

Save a backup inside the app's own branded folder using a user token with `app_data`. Use a verified app's database key on a backend for files owned by the service. The two quotas and file lists are separate. A user upload can opt into **Browseable** so the account holder can download that file from their dashboard. Keep this off for private application state. Service files stay private.

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
await user.appFiles.setBrowseable(saved.id, false);
```

The reader takes `(offset, length)` and returns exactly those bytes as standard base64. For example, use a browser `Blob.slice` or a Node file handle that reads at an explicit byte position. Store the ID and original file to resume. Delete a saved file with `user.appFiles.delete(id)` and list with `user.appFiles.list({cursor})`. In Node, initialize `createServiceClient` from `@xcenter-id/server/data` with the client ID and protected database key. Use the same list, download, delete and upload operations on `service.files`. Omit the Browseable flag for service uploads.

The low-level `transfers` object has these operations.

| Operation | Arguments | Response |
| --- | --- | --- |
| `start` | `{name, size, browseable?}`, optional request options | `{id, chunkSize}` |
| `status` | ID, optional request options | `{id, size, chunkSize, received, committed}` |
| `append` | ID, `{position, content}`, optional request options | `{received}` |
| `complete` | ID, optional request options | `{id}` |
| `cancel` | ID, optional request options | `{ok:true}` |

Request options support `signal`. Use `chunkSize` until the last chunk, which can be shorter. Complete an empty file immediately after starting. Stream a large download from the binary response body. Revisit the [hosted API reference](https://id.xcenter.it/docs/sdk/app-container-files) for language-specific calls.

## Swift, Kotlin, and Dart

Use `XCenterDataClient` for user files and `XCenterServiceRecords` from the server SDK for service files. Never supply a database key to a mobile or browser client. Signatures differ by language. Kotlin clients perform blocking calls on a worker thread or IO dispatcher. The native adapters expose the individual transfer operations for streaming from a file without loading the whole backup into memory.

| Operation | Native method |
| --- | --- |
| Reserve a transfer | `startAppUpload` with name, byte size and optional Browseable flag for user files |
| Inspect/resume | `appUploadStatus` with transfer ID |
| Send one chunk | `appendAppUpload` with transfer ID, byte position and native bytes |
| Commit | `completeAppUpload` with transfer ID |
| Cancel | `cancelAppUpload` with transfer ID |
| List | `listAppFiles` with optional cursor |
| Download | `downloadAppFile` with file ID |
| Change dashboard visibility | `setAppFileBrowseable` with file ID and boolean, user adapter only |
| Remove | `deleteAppFile` with file ID |

Swift returns `Data`. The Kotlin user adapter returns `ByteArray`; its server adapter decodes JSON operations to `JSONObject` and returns `ByteArray` for downloads. Dart returns `Uint8List`. For large downloads with native runtimes use a streaming HTTP transport against the [binary API](https://id.xcenter.it/docs/sdk/download-app-file). Ordinary account folder listing results also include a recursive `size` on each folder row.
