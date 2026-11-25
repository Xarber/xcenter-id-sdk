export function publicConfig({config={},env={},...explicit}={}) {
  if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Expected a public X-Center ID configuration object.');
  for(const source of [config,explicit]){
    if('clientSecret' in source||'databaseKey' in source)throw new TypeError('Keep confidential credentials on your server.');
  }
  const clientId=explicit.clientId??env.XCENTER_CLIENT_ID??config.clientId;
  const redirectUri=explicit.redirectUri??env.XCENTER_REDIRECT_URI??config.redirectUri;
  const scopes=explicit.scopes??config.scopes??[];
  if(typeof clientId!=='string'||!clientId||!Array.isArray(scopes))throw new TypeError('Configure the registered public client ID and scopes.');
  return {clientId,redirectUri,scopes};
}

export async function loadPublicConfig({file='/xid.json',fetch:send=globalThis.fetch,...options}={}) {
  const origin=globalThis.location?.origin;
  if(!origin)throw new TypeError('Load the public JSON as an app asset, then pass it to publicConfig.');
  const url=new URL(file,origin);
  if(url.origin!==origin||url.username||url.password||url.hash)throw new TypeError('Use a same-origin public configuration file.');
  const response=await send(url.href,{credentials:'omit',redirect:'error'});
  if(!response.ok)throw new Error('Could not read public X-Center ID configuration.');
  return publicConfig({...options,config:await response.json()});
}
