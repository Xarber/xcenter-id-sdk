import * as oidc from 'openid-client';

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

export async function createXCenterOIDC({ clientId, clientSecret, redirectUri, scopes = [], promptConsent = false }) {
  if (!clientId) throw new Error('Register the application in the Developer portal.');
  const redirect = redirectURL(redirectUri);
  if (scopes.some(scope => !supportedScopes.has(scope))) throw new Error('Unsupported X-Center ID scope.');
  const config = await oidc.discovery(new URL(issuer), clientId, {}, clientSecret ? oidc.ClientSecretBasic(clientSecret) : oidc.None());
  const metadata = config.serverMetadata();
  for (const endpoint of [metadata.authorization_endpoint, metadata.token_endpoint, metadata.jwks_uri, metadata.userinfo_endpoint]) {
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
    async userInfo(accessToken, subject) {
      return oidc.fetchUserInfo(config, accessToken, subject);
    },
    async refresh(refreshToken) {
      return oidc.refreshTokenGrant(config, refreshToken);
    },
  };
}
