import assert from 'node:assert/strict';
import {test} from 'node:test';
import {createPublicClient,createUserClient,XCenterError} from '@xcenter-id/client';
import {createServiceClient} from '@xcenter-id/server/data';

test('user records use signed-in credentials with explicit visibility and revision', async () => {
  const fixtures = [];
  const client = createUserClient({clientId:'fixture', getAccessToken:()=> 'fixture-user', fetch:async (url,request)=>{
    fixtures.push({url,request});
    return Response.json({id:'item',revision:1,public:false});
  }});
  await client.records.put('drafts','item',{data:{title:'Draft'},public:false},{revision:0});
  assert.equal(fixtures[0].url,'https://id.xcenter.it/v1/apps/fixture/data/drafts/item');
  assert.equal(fixtures[0].request.headers.Authorization,'Bearer fixture-user');
  assert.equal(fixtures[0].request.headers['If-Match'],'"0"');
  assert.equal(fixtures[0].request.credentials,'omit');
  assert.equal(fixtures[0].request.redirect,'error');
  assert.throws(()=>client.records.put('drafts','item',{data:{}},{revision:0}),/visibility/);
  assert.throws(()=>client.records.get('drafts','../private'),/identifier/);
  assert.equal(fixtures.length,1);
});

test('public, service, and shared records retain separate permission surfaces', async () => {
  const requests=[];
  const fetch=async (url, req)=>{requests.push({url,req});return Response.json({records:[]});};
  const anonymous=createPublicClient({fetch});
  const service=createServiceClient({clientId:'fixture',databaseKey:'xid-db-'+'a'.repeat(43),fetch});
  await anonymous.listRecords('fixture','posts',{cursor:'page-2'});
  await service.records.list('posts');
  assert.ok(!requests[0].req.headers.Authorization);
  assert.match(requests[0].url,/\/public\/apps\/fixture\/data\/posts\?cursor=page-2$/);
  assert.match(requests[1].req.headers.Authorization,/^Bearer xid-db-/);
  assert.deepEqual(Object.keys(service),['records']);
  const user=createUserClient({clientId:'fixture',getAccessToken:()=> 'fixture-user',fetch});
  await user.sharedRecords.list('publisher','posts');
  assert.match(requests[2].url,/\/v1\/apps\/publisher\/data\/posts$/);
  assert.equal(user.sharedRecords.put,undefined);
  await assert.rejects(createUserClient({clientId:'fixture',getAccessToken:()=> 'xid-db-invalid',fetch}).userInfo(),/server SDK/);
});

test('incoming file downloads return the binary response and preserve error status', async () => {
  const client=createUserClient({clientId:'fixture',getAccessToken:()=> 'fixture-user',
    fetch:async (url)=>url.endsWith('/item') ? new Response(new Uint8Array([42])) :
      Response.json({error:'Scope missing'},{status:403})});
  const result=await client.files.downloadShared('item');
  assert.deepEqual([...new Uint8Array(await result.arrayBuffer())],[42]);
  await assert.rejects(client.files.list(),error=>error instanceof XCenterError&&error.status===403);
});

test('token refresh reloads the persisted session under the lock before rotating', async () => {
  const {createSessionTokenSource} = await import('@xcenter-id/server/refresh');
  let store={accessToken:'old-access',refreshToken:'old-refresh',expiresAt:5};
  let previous=Promise.resolve();
  let calls=0;
  const source=createSessionTokenSource({
    withLock: work=>{
      const result=previous.then(work);
      previous=result.catch(()=>{});
      return result;
    },
    load:async()=>store,save:async next=>{store=next;},now:()=>10,
    refresh:async token=>{
      assert.equal(token,'old-refresh');
      calls++;
      return {access_token:'new-access',refresh_token:'new-refresh',expires_in:600};
    },
  });
  assert.deepEqual(await Promise.all([source(),source()]),['new-access','new-access']);
  assert.equal(calls,1);
  assert.equal(store.refreshToken,'new-refresh');
});
