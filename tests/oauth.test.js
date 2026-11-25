import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {test} from 'node:test';
import {createPublicOAuthClient,publicConfig,issuer} from '@xcenter-id/client';
import {loadXCenterConfig} from '@xcenter-id/server';

test('uses explicit, environment, then file configuration and keeps the public parser secret-free',()=>{
  const dir=mkdtempSync(join(tmpdir(),'xcenter-sdk-config-'));
  try {
    const file=join(dir,'xid.json');
    writeFileSync(file,JSON.stringify({clientId:'file-client',clientSecret:'fixture-file',redirectUri:'https://product.example.org/callback'}));
    const settings=loadXCenterConfig({file,env:{XCENTER_CLIENT_ID:'env-client',XCENTER_CLIENT_SECRET:'fixture-env'},clientId:'explicit-client'});
    assert.equal(settings.clientId,'explicit-client');
    assert.equal(settings.clientSecret,'fixture-env');
    assert.equal(settings.redirectUri,'https://product.example.org/callback');
    assert.throws(()=>publicConfig({config:{clientId:'example',clientSecret:'fixture'}}),/server/);
    assert.throws(()=>loadXCenterConfig({file:join(dir,'missing.json'),clientId:'example'}),/configuration file/);
    assert.deepEqual(publicConfig({config:{clientId:'file-client',scopes:['friends']},env:{XCENTER_CLIENT_ID:'env-client'}}),
      {clientId:'env-client',redirectUri:undefined,scopes:['friends']});
  } finally {rmSync(dir,{recursive:true,force:true});}
});

test('validates PKCE state, RSA signature, issuer, audience, nonce and subject on exchange and rotation',async()=>{
  const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
  const jwk={...publicKey.export({format:'jwk'}),kid:'fixture',alg:'RS256',use:'sig'};
  const now=Date.now();
  const callback='https://product.example.org/callback';
  const clientId='fixture-app';
  let idToken, expectedSubject='subject', lastForm, calls=0;
  const client=createPublicOAuthClient({clientId,redirectUri:callback,now:()=>now,fetch:async (url,req)=>{
    assert.equal(new URL(url).origin,issuer);
    assert.equal(req.redirect,'error');
    assert.equal(req.credentials,'omit');
    if(url.endsWith('/jwks'))return Response.json({keys:[jwk]});
    if(url.endsWith('/me')){
      assert.equal(req.headers.Authorization,'Bearer fixture-access');
      return Response.json({sub:expectedSubject});
    }
    calls++;
    lastForm=new URLSearchParams(req.body);
    assert.equal(lastForm.get('client_id'),clientId);
    return Response.json({token_type:'Bearer',access_token:'fixture-access',refresh_token:'fixture-next',id_token:idToken});
  }});
  const {url,transaction}=await client.begin({scopes:['friends','offline_access']});
  assert.equal(url.searchParams.get('code_challenge_method'),'S256');
  assert.equal(url.searchParams.get('prompt'),'consent');
  assert.equal(url.searchParams.get('scope'),'openid friends offline_access');
  const receipt=callback+'?code=fixture&state='+transaction.state;
  const mint=(claims={})=>{
    const payload={iss:issuer,aud:clientId,sub:'subject',nonce:transaction.nonce,
      iat:Math.floor(now/1000),exp:Math.floor(now/1000)+600,...claims};
    const input=[{alg:'RS256',kid:'fixture'},payload].map(value=>Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
    return input+'.'+sign('RSA-SHA256',Buffer.from(input),privateKey).toString('base64url');
  };
  await assert.rejects(client.complete(receipt+'&state=duplicate',transaction),/authorization response/);
  assert.equal(calls,0);
  for(const claims of [{iss:'https://other.example.org'},{aud:'other'},{nonce:'other'},{exp:0}]){
    idToken=mint(claims);
    await assert.rejects(client.complete(receipt,transaction),/claims/);
  }
  idToken=mint();
  const forged=idToken.split('.');
  forged[2]=Buffer.from([1]).toString('base64url');
  idToken=forged.join('.');
  await assert.rejects(client.complete(receipt,transaction),/signature/);
  idToken=mint();
  assert.equal((await client.complete(receipt,transaction)).identity.sub,'subject');
  assert.equal(lastForm.get('code_verifier'),transaction.verifier);
  idToken=undefined;
  assert.equal((await client.refresh('fixture-old','subject')).tokens.refresh_token,'fixture-next');
  assert.equal(lastForm.get('refresh_token'),'fixture-old');
  expectedSubject='other';
  await assert.rejects(client.refresh('fixture-old','subject'),/subject/);
});
