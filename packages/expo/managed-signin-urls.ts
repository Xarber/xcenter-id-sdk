export function webSignInUrl(startPath: string, origin: string): string {
  if (!startPath.startsWith('/') || startPath.startsWith('//')) {
    throw new Error('Use a same-origin backend sign-in path.');
  }
  const target=new URL(startPath,origin);
  if (target.protocol!=='https:' || target.origin!==origin || target.hash) {
    throw new Error('Use a same-origin HTTPS backend sign-in path.');
  }
  return target.href;
}

export function matchesNativeCallback(value:string, registered:string): boolean {
  const callback=new URL(value);
  const expected=new URL(registered);
  return callback.origin===expected.origin && callback.pathname===expected.pathname &&
    !callback.username && !callback.password && !callback.hash;
}
