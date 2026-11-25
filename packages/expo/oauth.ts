import {createPublicOAuthClient, publicConfig, issuer, type PublicConfigOptions} from '@xcenter-id/client';
import forge from 'node-forge';
import {authorizeNative} from './authorize-native';

export function createExpoOAuth(options:PublicConfigOptions & {fetch?:typeof fetch}) {
  const config=publicConfig(options);
  if(!config.redirectUri)throw new Error('Configure your registered HTTPS callback.');
  const redirectUri=config.redirectUri;
  const oauth=createPublicOAuthClient({...config,fetch:options.fetch,
    verifyRS256:(jwt,key)=>{
      const {n,e}=key;
      if(typeof n!=='string'||typeof e!=='string')return false;
      const bytes=(value:string)=>forge.util.decode64(value.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-value.length%4)%4));
      const modulus=new forge.jsbn.BigInteger(forge.util.bytesToHex(bytes(n)),16);
      const exponent=new forge.jsbn.BigInteger(forge.util.bytesToHex(bytes(e)),16);
      if(modulus.bitLength()<2048)return false;
      const [header,payload,signature]=jwt.split('.');
      const hash=forge.md.sha256.create().update(header+'.'+payload).digest().getBytes();
      return forge.pki.setRsaPublicKey(modulus,exponent).verify(hash,bytes(signature));
    },
  });
  return {
    async signIn({scopes=config.scopes,promptConsent=false}={}) {
      const attempt=await authorizeNative({issuer,clientId:config.clientId,redirectUri,scopes,promptConsent});
      if(!attempt)return null;
      return oauth.complete(attempt.callbackUrl,attempt);
    },
    refresh:oauth.refresh,
    issuerSignOutURL:oauth.issuerSignOutURL,
  };
}
