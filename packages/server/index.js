import {loadXCenterConfig} from './config.js';
export {loadXCenterConfig} from './config.js';
import * as oidc from 'openid-client';
export * from './data.js';

export const issuer = 'https://id.xcenter.it';
const supportedScopes = new Set(['openid', 'profile', 'email', 'age_range', 'app_data', 'friends', 'offline_access', 'files_read', 'files_write', 'shared_files_read']);

export function redirectURL(value) {
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    throw new Error('Configure an exact HTTPS callback URL.');
  }
  return url;
}

export function validateCallback(value, redirect) {
  const url = new URL(value);
  if (url.origin !== redirect.origin || url.pathname !== redirect.pathname || url.username || url.password || url.hash) {
    throw new Error('Unexpected callback URL.');
  }
  return url;
}

export async function createXCenterOIDC(options) {
  const {clientId,clientSecret,redirectUri,scopes,promptConsent,allowLoopback}=loadXCenterConfig(options);
  if (!redirectUri) throw new Error('Configure the exact callback URL registered in Developer Apps.');
  const candidate = new URL(redirectUri);
  const local = allowLoopback && candidate.protocol === 'http:' &&
    ['127.0.0.1','[::1]'].includes(candidate.hostname) && candidate.port &&
    !candidate.username && !candidate.password && !candidate.search && !candidate.hash && candidate.pathname !== '/';
  const redirect = local ? candidate : redirectURL(candidate);
  if (scopes.some(scope => !supportedScopes.has(scope))) throw new Error('Unsupported X-Center ID scope.');
  const config = await oidc.discovery(new URL(issuer), clientId, {}, clientSecret ? oidc.ClientSecretBasic(clientSecret) : oidc.None());
  const metadata = config.serverMetadata();
  for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri, metadata.userinfo_endpoint]) {
    if (redirectURL(endpoint).origin !== issuer) throw new Error('Unexpected X-Center ID endpoint.');
  }
  for (const endpoint of [metadata.device_authorization_endpoint, metadata.revocation_endpoint].filter(Boolean)) {
    if (redirectURL(endpoint).origin !== issuer) throw new Error('Unexpected X-Center ID endpoint.');
  }
  oidc.enableNonRepudiationChecks(config);
  const requested = new Set(['openid', ...scopes]);

  return {
    async begin() {
      const transaction = {
        state: oidc.randomState(),
        nonce: oidc.randomNonce(),
        verifier: oidc.randomPKCECodeVerifier(),
        expiresAt: Date.now() + 10 * 60 * 1000,
      };
      const params = {
        redirect_uri: redirect.href,
        scope: [...requested].join(' '),
        state: transaction.state,
        nonce: transaction.nonce,
        code_challenge: await oidc.calculatePKCECodeChallenge(transaction.verifier),
        code_challenge_method: 'S256',
      };
      if (promptConsent || requested.has('offline_access')) params.prompt = 'consent';
      return { url: oidc.buildAuthorizationUrl(config, params), transaction };
    },
    async complete(callback, transaction) {
      if (!transaction || transaction.expiresAt < Date.now()) throw new Error('Sign-in transaction expired.');
      const tokens = await oidc.authorizationCodeGrant(config, validateCallback(callback, redirect), {
        expectedState: transaction.state,
        expectedNonce: transaction.nonce,
        pkceCodeVerifier: transaction.verifier,
      });
      return { tokens, identity: await oidc.fetchUserInfo(config, tokens.access_token, tokens.claims().sub) };
    },
    async beginDevice() {
      if (!clientSecret || !metadata.device_authorization_endpoint) {
        throw new Error('Device sign-in requires an active confidential registration.');
      }
      const nonce = oidc.randomNonce();
      const response = await oidc.initiateDeviceAuthorization(config, {scope:[...requested].join(' '), nonce});
      const verification = redirectURL(response.verification_uri);
      const complete = new URL(response.verification_uri_complete ?? verification.href);
      if (verification.origin !== issuer || complete.origin !== issuer || complete.pathname !== verification.pathname ||
          complete.username || complete.password || complete.hash) {
        throw new Error('Unexpected device verification URL.');
      }
      return {
        userCode:response.user_code,
        verificationUrl:complete.href,
        transaction:{nonce,response,expiresAt:Date.now()+response.expires_in*1000},
      };
    },
    async completeDevice(transaction, {signal} = {}) {
      if (!clientSecret || !transaction || transaction.expiresAt <= Date.now()) throw new Error('Device authorization expired.');
      const deadline = AbortSignal.timeout(Math.max(1, transaction.expiresAt-Date.now()));
      const tokens = await oidc.pollDeviceAuthorizationGrant(config, transaction.response, undefined,
        {signal:signal?AbortSignal.any([signal,deadline]):deadline});
      const claims = tokens.claims();
      if (!claims?.sub || claims.nonce !== transaction.nonce) throw new Error('Invalid device sign-in identity.');
      return {tokens, identity:await oidc.fetchUserInfo(config,tokens.access_token,claims.sub)};
    },
    issuerSignOutURL() { return new URL(issuer+'/session/end'); },
    async revoke(token, tokenTypeHint) {
      if (!metadata.revocation_endpoint) throw new Error('The issuer does not offer OAuth token revocation. Manage the grant in Linked apps.');
      await oidc.tokenRevocation(config,token,tokenTypeHint?{token_type_hint:tokenTypeHint}:undefined);
    },
    async userInfo(accessToken, subject) {
      return oidc.fetchUserInfo(config, accessToken, subject);
    },
    async refresh(refreshToken) {
      return oidc.refreshTokenGrant(config, refreshToken);
    },
  };
}

export {createSessionTokenSource} from "./refresh.js";

export {createSavedPlacesClient} from "./legacy.js";
