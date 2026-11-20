import { AuthRequest, CodeChallengeMethod, ResponseType, fetchDiscoveryAsync } from 'expo-auth-session';
import { randomUUID } from 'expo-crypto';
import { Platform } from 'react-native';
import {matchesNativeCallback} from './managed-signin-urls';

export type NativeAuthorizationOptions = {
  issuer: string;
  clientId: string;
  redirectUri: string;
  scopes?: readonly string[];
  nonce?: string;
  promptConsent?: boolean;
};

export type NativeAuthorizationCode = {
  code: string;
  verifier: string;
  nonce: string;
  redirectUri: string;
};

function https(value: string) {
  const url = new URL(value);
  return url.protocol === 'https:' && !url.username && !url.password && !url.search && !url.hash;
}

/** Obtain a code for the host's approved public sign-in client. */
export async function authorizeNative({ issuer, clientId, redirectUri,scopes=['openid'],nonce:providedNonce,promptConsent=false }: NativeAuthorizationOptions):
  Promise<NativeAuthorizationCode | null> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
    throw new Error('Use the website backend to start web sign-in');
  }
  if (!https(issuer) || !https(redirectUri) || !clientId) {
    throw new Error('Expected an HTTPS issuer, verified HTTPS app link and registered public client');
  }
  if(Platform.OS==='ios'&&Number.parseFloat(Platform.Version)<17.4){
    throw new Error('This registered HTTPS callback requires iOS 17.4 or newer. Use the secure backend sign-in handoff on this device.');
  }
  const discovery = await fetchDiscoveryAsync(issuer);
  if (discovery.discoveryDocument?.issuer !== issuer ||
    !discovery.authorizationEndpoint || !https(discovery.authorizationEndpoint) ||
    !discovery.tokenEndpoint || !https(discovery.tokenEndpoint) ||
    [discovery.authorizationEndpoint,discovery.tokenEndpoint].some(endpoint=>new URL(endpoint).origin!==new URL(issuer).origin)) {
    throw new Error('Invalid issuer discovery');
  }
  if(scopes.length>7||scopes.some(scope=>!['openid','profile','email','age_range','app_data','friends','offline_access'].includes(scope)))throw new Error('Unsupported X-Center permission scope');
  if(providedNonce&&!/^[A-Za-z0-9_-]{22,256}$/.test(providedNonce))throw new Error('Use a cryptographically random transaction nonce');
  const nonce = providedNonce??randomUUID();
  const request = new AuthRequest({
    clientId, redirectUri, responseType: ResponseType.Code, scopes: [...new Set(['openid',...scopes])],
    usePKCE: true, codeChallengeMethod: CodeChallengeMethod.S256, extraParams: { nonce,...(promptConsent||scopes.includes('offline_access')?{prompt:'consent'}:{}) },
  });
  const result = await request.promptAsync(discovery,{preferUniversalLinks:true});
  if (result.type === 'cancel' || result.type === 'dismiss') return null;
  if (result.type !== 'success' || result.params.state !== request.state ||
    !result.params.code || !request.codeVerifier || !matchesNativeCallback(result.url,redirectUri)) {
    throw new Error('Authorization could not be completed');
  }
  return { code: result.params.code, verifier: request.codeVerifier, nonce, redirectUri };
}
