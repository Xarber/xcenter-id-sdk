export const issuer = 'https://id.xcenter.it';

export function signInURL(path, origin) {
  if (!path.startsWith('/') || path.startsWith('//')) throw new Error('Expected a local sign-in path.');
  const url = new URL(path, origin);
  if (url.protocol !== 'https:' || url.origin !== origin || url.hash || url.username || url.password) {
    throw new Error('Expected a same-origin HTTPS sign-in path.');
  }
  return url.href;
}

export function manageAppURL(clientId) {
  return issuer + '/permissions/' + encodeURIComponent(clientId);
}

export function safePhotoURL(value, origin) {
  if (!value) return undefined;
  try {
    const url = new URL(value, origin);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
    if (url.protocol === 'blob:' && url.origin === origin) return url.href;
  } catch {
    return undefined;
  }
}
