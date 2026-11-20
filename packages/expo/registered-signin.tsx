import { useState } from 'react';
import { AccountEntry } from './index';
import { authorizeNative, type NativeAuthorizationCode } from './authorize-native';

export type RegisteredAppSignInProps = {
  clientId: string;
  redirectUri: string;
  scopes?: readonly string[];
  nonce?: string;
  promptConsent?: boolean;
  onAuthorized: (transaction: NativeAuthorizationCode) => Promise<void>;
};

/** Sign in to an approved native client through X-Center ID's system authentication session. */
export function RegisteredAppSignIn({ clientId, redirectUri, scopes,nonce,promptConsent,onAuthorized }: RegisteredAppSignInProps) {
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  async function start(){
    if(pending)return;
    setPending(true);
    setError('');
    try{
      const transaction=await authorizeNative({issuer:'https://id.xcenter.it',clientId,redirectUri,scopes,nonce,promptConsent});
      if(transaction)await onAuthorized(transaction);
    }catch(failure){setError(failure instanceof Error?failure.message:'Could not sign in.');}
    finally{setPending(false);}
  }
  return <AccountEntry onSignIn={()=>void start()} pending={pending} error={error}/>;
}
