import {issuer, XCenterError} from './index.js';
import {publicConfig} from './config.js';

export const scopes = Object.freeze(['openid','profile','email','age_range','app_data','friends','offline_access',
  'files_read','files_write','shared_files_read']);
const characters = /^[A-Za-z0-9_-]{22,128}$/;
const encodeText = value => new TextEncoder().encode(value);
const encode = bytes => btoa(String.fromCharCode(...bytes)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode = value => Uint8Array.from(atob(value.replace(/-/g,'+').replace(/_/g,'/') + '='.repeat((4-value.length%4)%4)),c=>c.charCodeAt(0));
const part = value => JSON.parse(decodeURIComponent(Array.from(decode(value),byte=>"%"+byte.toString(16).padStart(2,"0")).join("")));

function callback(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.hash || url.pathname === '/') {
    throw new TypeError('Configure an exact registered HTTPS callback.');
  }
  return url;
}

export function createPublicOAuthClient({fetch:send=globalThis.fetch,crypto=globalThis.crypto,verifyRS256,now=Date.now,...options}={}) {
  const {clientId,redirectUri,scopes:defaults}=publicConfig(options);
  if(typeof clientId!=='string'||!/^[A-Za-z0-9_-]{1,100}$/.test(clientId))throw new TypeError('Configure your registered public client ID.');
  const redirect=callback(redirectUri);
  if(redirect.search)throw new TypeError('Configure the registered callback without query parameters.');
  function runtime() {
    if(!crypto?.subtle||!crypto.getRandomValues)throw new Error('Provide Web Crypto or use the secure backend handoff.');
    return crypto;
  }
  async function request(path,{body,accessToken,signal}={}) {
    const response=await send(issuer+path,{method:body?'POST':'GET',credentials:'omit',redirect:'error',signal,
      headers:{...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{}),
        ...(accessToken?{Authorization:'Bearer '+accessToken}:{})},...(body?{body:new URLSearchParams(body).toString()}:{})});
    const value=await response.json().catch(()=>null);
    if(!response.ok)throw new XCenterError(response.status,value,response.headers.get('Retry-After'));
    if(!value||typeof value!=='object')throw new Error('Invalid X-Center ID response.');
    return value;
  }

  async function verify(jwt,nonce,subject,signal) {
    if(typeof jwt!=='string'||jwt.length>16384)throw new Error('Invalid X-Center ID token.');
    const components=jwt.split('.');
    if(components.length!==3)throw new Error('Invalid X-Center ID token.');
    const [header,payload]=components;
    const {alg,kid}=part(header);
    if(alg!=='RS256'||typeof kid!=='string'||!kid)throw new Error('Unsupported X-Center ID signing key.');
    const {keys}=await request('/jwks',{signal});
    const matches=Array.isArray(keys)?keys.filter(key=>key.kid===kid&&key.kty==='RSA'&&(!key.alg||key.alg==='RS256')&&(!key.use||key.use==='sig')):[];
    if(matches.length!==1)throw new Error('X-Center ID signing key unavailable.');
    const verifySignature=verifyRS256??(async (value,jwk)=>{
      const subtle=runtime().subtle;
      const key=await subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
      const [signedHeader,signedPayload,sig]=value.split('.');
      return subtle.verify('RSASSA-PKCS1-v1_5',key,decode(sig),encodeText(signedHeader+'.'+signedPayload));
    });
    if(!await verifySignature(jwt,matches[0]))throw new Error('Invalid X-Center ID signature.');
    const claims=part(payload);
    const audiences=Array.isArray(claims.aud)?claims.aud:[claims.aud];
    const time=Math.floor(now()/1000);
    if(claims.iss!==issuer||!audiences.includes(clientId)||((audiences.length>1||claims.azp!==undefined)&&claims.azp!==clientId)||
       typeof claims.sub!=='string'||!claims.sub||!Number.isFinite(claims.exp)||claims.exp<=time||
       !Number.isFinite(claims.iat)||claims.iat>time+60||(claims.nbf!==undefined&&(!Number.isFinite(claims.nbf)||claims.nbf>time))||
       (nonce!==undefined&&claims.nonce!==nonce)||(subject!==undefined&&claims.sub!==subject)){
      throw new Error('Invalid X-Center ID token claims.');
    }
    return claims;
  }

  async function identity(tokens,nonce,subject,signal) {
    if(typeof tokens.access_token!=='string'||!tokens.access_token||/[^A-Za-z0-9_.~-]/.test(tokens.access_token)||
        typeof tokens.token_type!=='string'||tokens.token_type.toLowerCase()!=='bearer'){
      throw new Error('Invalid X-Center ID access token.');
    }
    const claims=tokens.id_token?await verify(tokens.id_token,nonce,subject,signal):null;
    if(nonce!==undefined&&!claims)throw new Error('Missing X-Center ID token.');
    const profile=await request('/me',{accessToken:tokens.access_token,signal});
    if(profile.sub!==(claims?.sub??subject)||typeof profile.sub!=='string'||!profile.sub)throw new Error('Unexpected X-Center ID subject.');
    return {tokens,identity:profile};
  }

  return {
    async begin({scopes:requested=defaults,promptConsent=false}={}) {
      if(requested.some(scope=>!scopes.includes(scope)))throw new TypeError('Unsupported permission scope.');
      const webCrypto=runtime();
      const random=()=>encode(webCrypto.getRandomValues(new Uint8Array(32)));
      const transaction={state:random(),nonce:random(),verifier:random(),expiresAt:now()+10*60_000};
      const codeChallenge=encode(new Uint8Array(await webCrypto.subtle.digest('SHA-256',encodeText(transaction.verifier))));
      const url=new URL(issuer+'/auth');
      url.search=new URLSearchParams({client_id:clientId,redirect_uri:redirect.href,response_type:'code',
        scope:[...new Set(['openid',...requested])].join(' '),state:transaction.state,nonce:transaction.nonce,
        code_challenge:codeChallenge,code_challenge_method:'S256',
        ...(promptConsent||requested.includes('offline_access')?{prompt:'consent'}:{})}).toString();
      return {url,transaction};
    },
    async complete(value,transaction,{signal}={}) {
      const url=callback(value);
      if(url.origin!==redirect.origin||url.pathname!==redirect.pathname||
          !transaction||!Number.isFinite(transaction.expiresAt)||transaction.expiresAt<=now()||
          ![transaction.state,transaction.nonce,transaction.verifier].every(value=>typeof value==='string'&&characters.test(value))||
          url.searchParams.getAll('state').length!==1||url.searchParams.get('state')!==transaction.state||
          url.searchParams.has('error')||url.searchParams.getAll('code').length!==1||!url.searchParams.get('code')){
        throw new Error('Invalid or expired X-Center ID authorization response.');
      }
      const tokens=await request('/token',{signal,body:{grant_type:'authorization_code',client_id:clientId,
        code:url.searchParams.get('code'),redirect_uri:redirect.href,code_verifier:transaction.verifier}});
      return identity(tokens,transaction.nonce,undefined,signal);
    },
    async refresh(refreshToken,subject,{signal}={}) {
      if(!refreshToken||!subject)throw new TypeError('Supply the saved refresh token and validated subject.');
      const tokens=await request('/token',{signal,body:{grant_type:'refresh_token',client_id:clientId,refresh_token:refreshToken}});
      if(!tokens.refresh_token)throw new Error('Missing rotated refresh token.');
      return identity(tokens,undefined,subject,signal);
    },
    issuerSignOutURL() { return new URL(issuer+'/session/end'); },
  };
}
