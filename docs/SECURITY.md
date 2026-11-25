# Security boundaries

The relying party owns its product session and account mapping. See [integration](integration.md) for the trust boundary between browser, OS callback, issuer and product backend. Never ship a confidential client or app storage secret with frontend code. A displayed badge is metadata. It cannot authorize a privileged action.

Use exact HTTPS callbacks, pinned issuer discovery, one-time state, nonce, PKCE and verified ID tokens. Bind transaction state and completion to the initiating browser or installation. Keep browser URLs, analytical events and logs clear of tokens, proofs and real user data. Use signed platform links where applicable. If no app callback exists, redeem through the product backend with a separate proof.

For a vulnerability, use [private reporting](https://github.com/Xarber/xcenter-id-sdk/security/advisories/new) where enabled. Report the affected package and version, impact and safe reproduction information. Avoid attaching live credentials or user data.

The data clients send access tokens only to fixed issuer routes and reject redirects. The service client uses only a verified app database key and exposes operations on that app's service namespace. Public requests carry no credential. Use separate per-user sessions and a persistent refresh lock when callbacks and requests can run on multiple backend workers.
