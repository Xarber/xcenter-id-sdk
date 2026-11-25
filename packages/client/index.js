export const issuer = 'https://id.xcenter.it';

export class XCenterError extends Error {
  constructor(status, body, retryAfter) {
    super(typeof body?.error === 'string' ? body.error : `X-Center ID request failed (HTTP ${status}).`);
    this.name = 'XCenterError';
    this.status = status;
    this.body = body;
    this.retryAfter = retryAfter;
  }
}

const segment = (value, max = 120) => {
  if (typeof value !== 'string' || !value || /[^A-Za-z0-9_-]/.test(value) || value.length > max) {
    throw new TypeError('Invalid X-Center ID resource identifier.');
  }
  return value;
};
const handle = value => {
  if (typeof value !== 'string' || !/^[a-z0-9._-]{3,24}$/.test(value) ||
      value.startsWith('.') || value.endsWith('.') || value.includes('..')) {
    throw new TypeError('Invalid X-Center ID username.');
  }
  return value;
};
const query = (key, value) => value == null ? '' : '?' + key + '=' + encodeURIComponent(value);
const dataPath = (prefix, client, collection, id) =>
  `${prefix}/apps/${segment(client, 100)}/data/${segment(collection, 80)}` +
  (id === undefined ? '' : '/' + segment(id));
const filePath = (prefix, id) => prefix + '/' + segment(id, 36);

export function createTransport({fetch: send = globalThis.fetch, getAccessToken} = {}) {
  return async (path, {method = 'GET', body, revision, binary = false, signal} = {}) => {
    const url = new URL(path, issuer);
    if (url.origin !== issuer || !path.startsWith('/') || path.startsWith('//')) {
      throw new TypeError('Unexpected X-Center ID endpoint.');
    }
    const headers = {};
    if (getAccessToken) {
      const token = await getAccessToken();
      if (typeof token !== 'string' || !token || /[^A-Za-z0-9_.~-]/.test(token)) {
        throw new TypeError('A valid X-Center ID credential is required.');
      }
      headers.Authorization = 'Bearer ' + token;
    }
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    if (revision !== undefined) {
      if (!Number.isSafeInteger(revision) || revision < 0) throw new TypeError('Invalid record revision.');
      headers['If-Match'] = '"' + revision + '"';
    }
    const response = await send(url.href, {
      method, headers, signal, credentials: 'omit', redirect: 'error',
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    if (!response.ok) {
      throw new XCenterError(response.status, await response.json().catch(() => null), response.headers.get('Retry-After'));
    }
    if (binary) return response;
    if (response.status === 204) return undefined;
    return response.json();
  };
}

export function createRecords(request, clientId) {
  return {
    list: (collection, {cursor, signal} = {}) => request(dataPath('/v1', clientId, collection) + query('cursor', cursor), {signal}),
    get: (collection, id, {signal} = {}) => request(dataPath('/v1', clientId, collection, id), {signal}),
    put: (collection, id, body, {revision, signal} = {}) => {
      if (typeof body?.public !== 'boolean' || !Object.hasOwn(body, 'data') || revision === undefined) {
        throw new TypeError('Supply data, explicit public visibility, and a revision.');
      }
      return request(dataPath('/v1', clientId, collection, id), {method:'PUT', body, revision, signal});
    },
    delete: (collection, id, {revision, signal} = {}) => {
      if (!Number.isSafeInteger(revision) || revision < 1) throw new TypeError('Supply the current record revision.');
      return request(dataPath('/v1', clientId, collection, id), {method:'DELETE', revision, signal});
    },
  };
}

export function createPublicClient({fetch} = {}) {
  const request = createTransport({fetch});
  return {
    discover: ({signal} = {}) => request('/.well-known/openid-configuration', {signal}),
    profile: (username, {signal} = {}) => request('/public/profiles/' + handle(username), {signal}),
    avatarUrl: username => issuer + '/public/profiles/' + handle(username) + '/avatar',
    avatar: (username, {signal} = {}) => request('/public/profiles/' + handle(username) + '/avatar', {signal, binary:true}),
    appIconUrl: registrationId => issuer + '/public/app-icons/' + segment(registrationId, 36),
    appIcon: (registrationId, {signal} = {}) => request('/public/app-icons/' + segment(registrationId, 36), {signal, binary:true}),
    listRecords: (client, collection, {cursor, signal} = {}) => request(dataPath('/public', client, collection) + query('cursor', cursor), {signal}),
    getRecord: (client, collection, id, {signal} = {}) => request(dataPath('/public', client, collection, id), {signal}),
  };
}

export function createUserClient({clientId, getAccessToken, fetch} = {}) {
  segment(clientId, 100);
  if (typeof getAccessToken !== 'function') throw new TypeError('Provide an end-user access token callback.');
  const request = createTransport({fetch, getAccessToken: async () => {
    const token = await getAccessToken();
    if (typeof token === 'string' && token.startsWith('xid-db-')) throw new TypeError('Use database keys only in the server SDK.');
    return token;
  }});
  const files = '/v1/files', folders = files + '/folders', shared = files + '/shared';
  return {
    userInfo: ({signal} = {}) => request('/me', {signal}),
    avatar: ({signal} = {}) => request('/v1/profile/avatar', {signal, binary:true}),
    friends: ({signal} = {}) => request('/v1/profile/friends', {signal}),
    records: createRecords(request, clientId),
    sharedRecords: {
      list: (source, collection, {cursor, signal} = {}) => request(dataPath('/v1', source, collection) + query('cursor', cursor), {signal}),
      get: (source, collection, id, {signal} = {}) => request(dataPath('/v1', source, collection, id), {signal}),
    },
    files: {
      list: ({folder, signal} = {}) => request(files + query('folder', folder), {signal}),
      download: (id, {signal} = {}) => request(filePath(files, id), {signal, binary:true}),
      upload: (body, {signal} = {}) => {
        const content = body?.content;
        if (typeof content !== 'string' || !content.length || content.length > Math.ceil(2 * 1024 ** 2 / 3) * 4) {
          throw new TypeError('Supply a nonempty file, up to 2 MB, encoded as base64.');
        }
        return request(files, {method:'POST', body, signal});
      },
      update: (id, body, {signal} = {}) => request(filePath(files, id), {method:'PATCH', body, signal}),
      delete: (id, {signal} = {}) => request(filePath(files, id), {method:'DELETE', signal}),
      createFolder: (body, {signal} = {}) => request(folders, {method:'POST', body, signal}),
      updateFolder: (id, body, {signal} = {}) => request(filePath(folders, id), {method:'PATCH', body, signal}),
      deleteFolder: (id, {signal} = {}) => request(filePath(folders, id), {method:'DELETE', signal}),
      listShared: ({signal} = {}) => request(shared, {signal}),
      downloadShared: (id, {signal} = {}) => request(filePath(shared, id), {signal, binary:true}),
    },
  };
}

export {createPublicOAuthClient, scopes} from "./oauth.js";

export {loadPublicConfig, publicConfig} from "./config.js";

export {createSessionTokenSource} from "./session.js";
