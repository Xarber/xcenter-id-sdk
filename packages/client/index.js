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
  return async (path, {method = 'GET', body, revision, binary = false, signal, peerProof} = {}) => {
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
    if(peerProof!==undefined){
      if(!path.startsWith('/v1/peers/')||!/^[A-Za-z0-9_-]{43}$/.test(peerProof))throw new TypeError('Invalid peer proof.');
      headers['X-XCenter-Peer-Proof']=peerProof;
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

function createFileTransfers(request,files) {
  const uploads=files+'/uploads';
  return {
    start: (file,{signal}={})=>request(uploads,{method:'POST',body:file,signal}),
    status: (id,{signal}={})=>request(filePath(uploads,id),{signal}),
    append: (id,chunk,{signal}={})=>request(filePath(uploads,id),{method:'PUT',body:chunk,signal}),
    complete: (id,{signal}={})=>request(filePath(uploads,id),{method:'POST',body:{},signal}),
    cancel: (id,{signal}={})=>request(filePath(uploads,id),{method:'DELETE',signal}),
  };
}

async function uploadChunks(transfer,file,readChunk,{id,signal,onProgress}={}) {
  const info=id?await transfer.status(id,{signal}):await transfer.start(file,{signal});
  if(info.size!==undefined&&info.size!==file.size)throw new TypeError('The resumed file size must match.');
  const uploadId=info.id;
  let received=info.received??0;
  onProgress?.({id:uploadId,received,total:file.size});
  while(received<file.size){
    const length=Math.min(info.chunkSize,file.size-received);
    const content=await readChunk(received,length);
    const next=await transfer.append(uploadId,{position:received,content},{signal});
    if(next.received!==received+length)throw new Error('Unexpected upload position.');
    received=next.received;
    onProgress?.({id:uploadId,received,total:file.size});
  }
  return info.committed?{id:uploadId}:transfer.complete(uploadId,{signal});
}

export function createAppFiles(request,clientId,service=false) {
  const files='/v1/apps/'+segment(clientId,100)+'/files';
  const transfers=createFileTransfers(request,files);
  const store={
    transfers,
    uploadChunks:(file,readChunk,options)=>uploadChunks(transfers,file,readChunk,options),
    list:({cursor,signal}={})=>request(files+query('cursor',cursor),{signal}),
    get:(id,{signal}={})=>request(filePath(files,id)+'?metadata=1',{signal}),
    download:(id,{signal}={})=>request(filePath(files,id),{signal,binary:true}),
    delete:(id,{signal}={})=>request(filePath(files,id),{method:'DELETE',signal}),
  };
  const setVisibility=(id,visibility,{signal}={})=>request(filePath(files,id),{method:'PUT',body:visibility,signal});
  return service?store:{...store,setVisibility,setBrowseable:(id,browseable,options)=>setVisibility(id,{browseable},options)};
}

export function createUserClient({clientId, getAccessToken, fetch} = {}) {
  segment(clientId, 100);
  if (typeof getAccessToken !== 'function') throw new TypeError('Provide an end-user access token callback.');
  const request = createTransport({fetch, getAccessToken: async () => {
    const token = await getAccessToken();
    if (typeof token === 'string' && token.startsWith('xid-db-')) throw new TypeError('Use database keys only in the server SDK.');
    return token;
  }});
  const appBackups='/v1/apps/'+segment(clientId,100)+'/backups';
  const files = '/v1/files', folders = files + '/folders', shared = files + '/shared';
  const transfer=createFileTransfers(request,files);
  const routeFor=(peer,action='')=>'/v1/peers/'+segment(peer.id,24)+(action?'/'+action:'');
  const peerJS='/v1/peers/peerjs/session';
  const peers={
    openPeerJS: (settings,{signal}={})=>request(peerJS,{method:'POST',body:settings,signal}),
    renewPeerJS: (session,{signal}={})=>request(peerJS,{method:'PUT',body:{key:session.key},signal}),
    closePeerJS: (session,{signal}={})=>request(peerJS,{method:'DELETE',body:{key:session.key},signal}),
    open: (settings,{signal}={})=>request('/v1/peers',{method:'POST',body:settings,signal}),
    list: (peer,{signal}={})=>request(routeFor(peer,'directory'),{peerProof:peer.proof,signal}),
    receive: (peer,{signal}={})=>request(routeFor(peer,'messages'),{peerProof:peer.proof,signal}),
    send: (peer,message,{signal}={})=>request(routeFor(peer,'messages'),{method:'POST',peerProof:peer.proof,body:message,signal}),
    close: (peer,{signal}={})=>request(routeFor(peer),{method:'DELETE',peerProof:peer.proof,signal}),
  };
  return {
    peers,
    account: {
      visibility: ({signal}={})=>request('/v1/account/profile-visibility',{signal}),
      updateVisibility: (fields,{signal}={})=>request('/v1/account/profile-visibility',{method:'PUT',body:{fields},signal}),
      apps: ({signal}={})=>request('/v1/account/apps',{signal}),
      permissions: (client,{signal}={})=>request('/v1/account/apps/'+segment(client,100)+'/permissions',{signal}),
      disablePermission: (client,scope,{signal}={})=>request('/v1/account/apps/'+segment(client,100)+'/permissions',
        {method:'PUT',body:{scope,enabled:false},signal}),
    },
    accountOverview: ({signal}={}) => request('/v1/account/overview',{signal}),
    userInfo: ({signal} = {}) => request('/me', {signal}),
    avatar: ({signal} = {}) => request('/v1/profile/avatar', {signal, binary:true}),
    friends: ({signal} = {}) => request('/v1/profile/friends', {signal}),
    records: createRecords(request, clientId),
    appFiles: createAppFiles(request,clientId),
    appBackups:{
      list:({signal}={})=>request(appBackups,{signal}),
      create:({signal}={})=>request(appBackups,{signal,method:'POST',body:{}}),
      delete:(id,{signal}={})=>request(filePath(appBackups,id),{signal,method:'DELETE'}),
      requestRestore:(id,{signal}={})=>request(filePath(appBackups,id)+'/restore',{signal,method:'POST',body:{}}),
      managementURL:()=>new URL('/apps/'+segment(clientId,100)+'/backups','https://id.xcenter.it'),
    },
    sharedRecords: {
      list: (source, collection, {cursor, signal} = {}) => request(dataPath('/v1', source, collection) + query('cursor', cursor), {signal}),
      get: (source, collection, id, {signal} = {}) => request(dataPath('/v1', source, collection, id), {signal}),
    },
    files: {
      transfers:transfer,
      uploadChunks: (file,readChunk,options)=>uploadChunks(transfer,file,readChunk,options),
      list: ({folder, signal} = {}) => request(files + query('folder', folder), {signal}),
      get: (id, {signal} = {}) => request(filePath(files, id)+'?metadata=1', {signal}),
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
      getShared: (id, {signal} = {}) => request(filePath(shared, id)+'?metadata=1', {signal}),
      downloadShared: (id, {signal} = {}) => request(filePath(shared, id), {signal, binary:true}),
    },
  };
}

export {createPublicOAuthClient, scopes} from "./oauth.js";

export {loadPublicConfig, publicConfig} from "./config.js";

export {createSessionTokenSource} from "./session.js";
