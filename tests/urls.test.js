import { test } from 'node:test';
import assert from 'node:assert/strict';
import { redirectURL, validateCallback } from '../packages/server/index.js';
import { safePhotoURL, signInURL } from '../packages/web/urls.js';

test('browser sign-in is same-origin and requires HTTPS', () => {
  const origin = 'https://product.example';
  assert.equal(signInURL('/api/auth?from=settings', origin), origin + '/api/auth?from=settings');
  for (const path of ['//outside.example', '/\\outside.example', 'https://outside.example', '/#fragment']) {
    assert.throws(() => signInURL(path, origin));
  }
  assert.throws(() => signInURL('/api/auth', 'http://product.example'));
});

test('profile images permit HTTPS and same-origin blobs', () => {
  const origin = 'https://product.example';
  assert.equal(safePhotoURL('/avatar', origin), origin + '/avatar');
  assert.equal(safePhotoURL('blob:https://product.example/a', origin), 'blob:https://product.example/a');
  for (const value of ['blob:https://outside.example/a', 'javascript:alert(1)', 'https://user@product.example/']) {
    assert.equal(safePhotoURL(value, origin), undefined);
  }
});

test('backend callback is bound to the configured HTTPS origin and exact path', () => {
  const redirect = redirectURL('https://product.example/api/xcenter/callback');
  assert.equal(validateCallback(redirect.href + '?code=abc&state=def', redirect).searchParams.get('code'), 'abc');
  for (const callback of [redirect.href + '/', redirect.href + '#x', 'https://other.example/api/xcenter/callback']) {
    assert.throws(() => validateCallback(callback, redirect));
  }
  assert.throws(() => redirectURL(redirect.href + '?returnTo=other'));
});
