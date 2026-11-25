import {readFileSync} from 'node:fs';

export function loadXCenterConfig(options = {}) {
  const {file = 'xid.json', env = process.env, ...explicit} = options;
  let config = {};
  if (file !== false) {
    try { config = JSON.parse(readFileSync(file,'utf8')); }
    catch(error) {
      if(error.code!=='ENOENT'||Object.hasOwn(options,'file'))throw new Error('Could not read the X-Center ID configuration file.');
    }
    if(!config||typeof config!=='object'||Array.isArray(config))throw new TypeError('Expected a JSON configuration object.');
  }
  const clientId=explicit.clientId??env.XCENTER_CLIENT_ID??config.clientId;
  if(typeof clientId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(clientId))throw new TypeError('Configure your registered client ID.');
  return {
    clientId,
    clientSecret:explicit.clientSecret??env.XCENTER_CLIENT_SECRET??config.clientSecret,
    redirectUri:explicit.redirectUri??env.XCENTER_REDIRECT_URI??config.redirectUri,
    databaseKey:explicit.databaseKey??env.XCENTER_DATABASE_KEY??config.databaseKey,
    scopes:explicit.scopes??config.scopes??[],
    promptConsent:explicit.promptConsent??config.promptConsent??false,
    allowLoopback:explicit.allowLoopback??config.allowLoopback??false,
  };
}
