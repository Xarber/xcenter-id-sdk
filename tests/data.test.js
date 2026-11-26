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
  assert.deepEqual(Object.keys(service),['records','files']);
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

test('all public and delegated data operations use their documented wire routes', async () => {
  const requests = [];
  const fetch = async (url, options) => {
    const target = new URL(url);
    requests.push([options.method, target.pathname + target.search, options.headers.Authorization]);
    return Response.json({ok:true});
  };
  const publicClient = createPublicClient({fetch});
  const user = createUserClient({clientId:'example',getAccessToken:()=> 'fixture-token',fetch});
  const service = createServiceClient({clientId:'example',databaseKey:'xid-db-'+'s'.repeat(43),fetch});
  await publicClient.discover();
  await publicClient.profile('example.user');
  await publicClient.avatar('example.user');
  await publicClient.appIcon('app-icon');
  await publicClient.listRecords('example','notes',{cursor:'second'});
  await publicClient.getRecord('example','notes','opaque-id');
  await user.userInfo();
  await user.avatar();
  await user.friends();
  await user.records.list('notes');
  await user.records.get('notes','mine');
  await user.records.put('notes','mine',{data:{},public:true,readers:['example.friend']},{revision:1});
  await user.records.delete('notes','mine',{revision:2});
  await user.sharedRecords.list('publisher','notes',{cursor:'third'});
  await user.sharedRecords.get('publisher','notes','opaque-id');
  await user.files.list({folder:'root-folder'});
  await user.files.download('file');
  await user.files.upload({name:'file.txt',content:'YQ=='});
  await user.files.update('file',{name:'renamed.txt',folder:null});
  await user.files.delete('file');
  await user.files.createFolder({name:'New folder'});
  await user.files.updateFolder('folder',{name:'Renamed folder'});
  await user.files.deleteFolder('folder');
  await user.files.listShared();
  await user.files.downloadShared('share');
  await service.records.list('notes');
  await service.records.get('notes','entry');
  await service.records.put('notes','entry',{data:{},public:false},{revision:0});
  await service.records.delete('notes','entry',{revision:1});
  const userToken='Bearer fixture-token', key='Bearer xid-db-'+'s'.repeat(43);
  assert.deepEqual(requests,[
    ['GET','/.well-known/openid-configuration',undefined],
    ['GET','/public/profiles/example.user',undefined],
    ['GET','/public/profiles/example.user/avatar',undefined],
    ['GET','/public/app-icons/app-icon',undefined],
    ['GET','/public/apps/example/data/notes?cursor=second',undefined],
    ['GET','/public/apps/example/data/notes/opaque-id',undefined],
    ['GET','/me',userToken],
    ['GET','/v1/profile/avatar',userToken],
    ['GET','/v1/profile/friends',userToken],
    ['GET','/v1/apps/example/data/notes',userToken],
    ['GET','/v1/apps/example/data/notes/mine',userToken],
    ['PUT','/v1/apps/example/data/notes/mine',userToken],
    ['DELETE','/v1/apps/example/data/notes/mine',userToken],
    ['GET','/v1/apps/publisher/data/notes?cursor=third',userToken],
    ['GET','/v1/apps/publisher/data/notes/opaque-id',userToken],
    ['GET','/v1/files?folder=root-folder',userToken],
    ['GET','/v1/files/file',userToken],
    ['POST','/v1/files',userToken],
    ['PATCH','/v1/files/file',userToken],
    ['DELETE','/v1/files/file',userToken],
    ['POST','/v1/files/folders',userToken],
    ['PATCH','/v1/files/folders/folder',userToken],
    ['DELETE','/v1/files/folders/folder',userToken],
    ['GET','/v1/files/shared',userToken],
    ['GET','/v1/files/shared/share',userToken],
    ['GET','/v1/apps/example/data/notes',key],
    ['GET','/v1/apps/example/data/notes/entry',key],
    ['PUT','/v1/apps/example/data/notes/entry',key],
    ['DELETE','/v1/apps/example/data/notes/entry',key],
  ]);
});

test('delegated account and peer operations keep user and peer credentials separate', async () => {
  const requests=[];
  const user=createUserClient({clientId:'fixture',getAccessToken:()=> 'fixture-user',fetch:async (url,request)=>{
    requests.push({path:new URL(url).pathname,...request});
    return Response.json({ok:true});
  }});
  const peer={id:'p'.repeat(24),proof:'q'.repeat(43),expiresIn:90};
  await user.accountOverview();
  await user.account.visibility();
  await user.account.updateVisibility(['picture']);
  await user.account.apps();
  await user.account.permissions('fixture-app');
  await user.account.disablePermission('fixture-app','friends');
  await user.peers.open({discoverable:false});
  await user.peers.list(peer);
  await user.peers.send(peer,{to:'t'.repeat(24),type:'offer',data:{sdp:'fixture'}});
  await user.peers.receive(peer);
  await user.peers.close(peer);
  const peerPath='/v1/peers/'+peer.id;
  assert.deepEqual(requests.map(({path,method})=>[method,path]),[
    ['GET','/v1/account/overview'],['GET','/v1/account/profile-visibility'],
    ['PUT','/v1/account/profile-visibility'],['GET','/v1/account/apps'],
    ['GET','/v1/account/apps/fixture-app/permissions'],['PUT','/v1/account/apps/fixture-app/permissions'],
    ['POST','/v1/peers'],['GET',peerPath+'/directory'],['POST',peerPath+'/messages'],
    ['GET',peerPath+'/messages'],['DELETE',peerPath],
  ]);
  assert.deepEqual(JSON.parse(requests[5].body),{scope:'friends',enabled:false});
  assert.ok(requests.every(({headers})=>headers.Authorization==='Bearer fixture-user'));
  assert.ok(requests.slice(0,7).every(({headers})=>!headers['X-XCenter-Peer-Proof']));
  assert.ok(requests.slice(7).every(({headers})=>headers['X-XCenter-Peer-Proof']===peer.proof));
});

test('chunk helper resumes at the saved offset and finishes without rereading committed data', async () => {
  const id='abcdef';
  const reads=[];
  const progress=[];
  const sent=[];
  let committed=false;
  const user=createUserClient({clientId:'fixture',getAccessToken:()=> 'fixture-user',fetch:async (url,request)=>{
    assert.match(url,/\/v1\/files\/uploads\/abcdef$/);
    if(request.method==='GET')return Response.json({id,size:9,chunkSize:4,received:committed?9:4,committed});
    if(request.method==='PUT'){
      const chunk=JSON.parse(request.body);
      sent.push(chunk);
      return Response.json({received:chunk.position+Buffer.from(chunk.content,'base64').length});
    }
    assert.equal(request.method,'POST');
    committed=true;
    return Response.json({id});
  }});
  const source=(offset,length)=>{reads.push([offset,length]);return Buffer.alloc(length).toString('base64');};
  const file={name:'fixture.bin',size:9};
  assert.deepEqual(await user.files.uploadChunks(file,source,{id,onProgress:result=>progress.push(result.received)}),{id});
  assert.deepEqual(reads,[[4,4],[8,1]]);
  assert.deepEqual(sent.map(chunk=>chunk.position),[4,8]);
  assert.deepEqual(progress,[4,8,9]);
  assert.deepEqual(await user.files.uploadChunks(file,()=>assert.fail('Committed file read'),{id}),{id});
});

test('app files use private container routes and distinguish user and service credentials', async () => {
  const calls=[];
  const id='abcdef11-1234-1234-9123-1234567890ab';
  const fixture=async (url,options)=>{
    calls.push([new URL(url).pathname,options]);
    if(options.method==='PUT'&&url.includes('/uploads/'))return Response.json({received:3});
    if(options.method==='POST'&&url.endsWith('/uploads'))return Response.json({id,chunkSize:524288});
    if(options.method==='GET'&&url.endsWith(id))return new Response('abc');
    return Response.json({id,ok:true,files:[],nextCursor:null});
  };
  const user=createUserClient({clientId:'backup',getAccessToken:()=> 'user-fixture',fetch:fixture});
  const key='xid-db-'+'k'.repeat(43);
  const service=createServiceClient({clientId:'backup',databaseKey:key,fetch:fixture});
  const read=(offset,length)=>{assert.equal(offset,0);assert.equal(length,3);return 'YWJj';};
  const userFile={name:'backup.zip',size:3,browseable:true};
  assert.equal((await user.appFiles.uploadChunks(userFile,read)).id,id);
  assert.deepEqual(JSON.parse(calls[0][1].body),userFile);
  assert.deepEqual(JSON.parse(calls[1][1].body),{position:0,content:'YWJj'});
  assert.equal(await (await user.appFiles.download(id)).text(),'abc');
  await user.appFiles.setBrowseable(id,false);
  assert.deepEqual(JSON.parse(calls[4][1].body),{browseable:false});
  await user.appFiles.setVisibility(id,{browseable:true,editable:true});
  assert.deepEqual(JSON.parse(calls[5][1].body),{browseable:true,editable:true});
  assert.ok(calls.every(([,request])=>request.headers.Authorization==='Bearer user-fixture'));
  calls.length=0;
  assert.equal((await service.files.uploadChunks({name:'server.zip',size:3},read)).id,id);
  assert.equal(service.files.setBrowseable,undefined);
  assert.equal(await (await service.files.download(id)).text(),'abc');
  await service.files.delete(id);
  assert.ok(calls.every(([path,request])=>path.startsWith('/v1/apps/backup/files')&&request.headers.Authorization==='Bearer '+key));
});

test('stock PeerJS lease operations send the account token only to the session API', async () => {
  const calls=[];
  const user=createUserClient({clientId:'fixture',getAccessToken:()=> 'user-token',fetch:async (url,request)=>{
    calls.push({path:new URL(url).pathname,...request});
    return Response.json({key:'fixture-key'});
  }});
  const lease=await user.peers.openPeerJS({discoverable:true,id:'Fixture'});
  await user.peers.renewPeerJS(lease);
  await user.peers.closePeerJS(lease);
  assert.deepEqual(calls.map(call=>[call.path,call.method,JSON.parse(call.body)]),[
    ['/v1/peers/peerjs/session','POST',{discoverable:true,id:'Fixture'}],
    ['/v1/peers/peerjs/session','PUT',{key:'fixture-key'}],
    ['/v1/peers/peerjs/session','DELETE',{key:'fixture-key'}],
  ]);
  assert.ok(calls.every(call=>call.headers.Authorization==='Bearer user-token'));
});
