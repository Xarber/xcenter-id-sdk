import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { chromium } from 'playwright-core';

const executablePath = process.env.XCENTER_CHROME;
const origin = 'https://sdk-fixture.example';
const fixtures = new Map([
  ['/','examples/html.html'],
  ['/packages/web/account-overview.js','packages/web/account-overview.js'],
  ['/packages/web/urls.js','packages/web/urls.js'],
  ['/packages/web/xcenter-id-mark.png','packages/web/xcenter-id-mark.png'],
]);
const contentType = { html: 'text/html', js: 'text/javascript', png: 'image/png' };

test('phone account card signs in, shows profile, opens details and signs out', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({ executablePath, headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 360, height: 780 }, colorScheme: 'dark' });
    await page.route(origin + '/**', async route => {
      const file = fixtures.get(new URL(route.request().url()).pathname);
      if (!file) return route.fulfill({ status: 404 });
      await route.fulfill({
        contentType: contentType[file.split('.').at(-1)],
        body: await readFile(new URL('../' + file, import.meta.url)),
      });
    });
    await page.goto(origin);
    await page.getByRole('button', { name: 'Continue with X-Center ID' }).waitFor();
    await page.evaluate(() => {
      const host = document.querySelector('xcenter-account-overview');
      host.signIn = async () => {
        host.profile = { name: '<Team> Example', username: 'example', verified: true, administrator: true };
      };
      host.signOut = async () => { host.profile = null; };
      host.syncOptions = [{ label: 'Sync favorites', enabled: false, onChange: enabled => {
        if (enabled) host.syncOptions = [{ label: 'Sync favorites', enabled, onChange() {} }];
      }}];
    });
    await page.getByRole('button', { name: 'Continue with X-Center ID' }).click();
    await page.getByRole('heading', { name: '<Team> Example' }).waitFor();
    await page.locator('section').getByText('Verified profile', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Manage account & data →' }).click();
    const details = page.getByRole('dialog', { name: 'Manage account and data' });
    await details.getByRole('link', { name: 'Open dashboard' }).waitFor();
    await details.getByRole('link', { name: 'Manage app' }).waitFor();
    await details.getByRole('checkbox', { name: 'Sync favorites' }).check();
    await details.getByRole('button', { name: 'Sign out' }).click();
    await page.getByRole('button', { name: 'Continue with X-Center ID' }).waitFor();
  } finally { await browser.close(); }
});

test('plain browser client writes a record without framework code or cookies', { skip: !executablePath }, async () => {
  const browser = await chromium.launch({executablePath,headless:true});
  try {
    const page = await browser.newPage();
    await page.route(origin+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>SDK fixture</title>'}));
    for (const path of ['index.js','oauth.js','config.js','session.js']) {
      await page.route(origin+'/'+path,async route=>route.fulfill({
        contentType:'text/javascript',
        body:await readFile(new URL('../packages/client/'+path,import.meta.url)),
      }));
    }
    await page.route('https://id.xcenter.it/v1/apps/fixture/data/notes/one',route=>{
      const request=route.request(),headers=request.headers();
      if(request.method()==='OPTIONS')return route.fulfill({status:204,headers:{
        'access-control-allow-origin':'*','access-control-allow-methods':'PUT, OPTIONS',
        'access-control-allow-headers':'Authorization, Content-Type, If-Match',
      }});
      if(request.method()!=='PUT'||headers.authorization!=='Bearer synthetic-token'||
          headers['if-match']!=='"0"'||headers.cookie||request.postDataJSON().public!==false){
        return route.fulfill({status:403,headers:{'access-control-allow-origin':'*'},json:{error:'Unexpected request'}});
      }
      return route.fulfill({headers:{'access-control-allow-origin':'*'},json:{id:'one',revision:1,public:false}});
    });
    await page.goto(origin);
    const result=await page.evaluate(async()=>{
      const sdk=await import('/index.js');
      const user=sdk.createUserClient({clientId:'fixture',getAccessToken:()=> 'synthetic-token'});
      return user.records.put('notes','one',{data:{title:'Browser fixture'},public:false},{revision:0});
    });
    if(result.id!=='one'||result.revision!==1)throw new Error('Unexpected write result');
  }finally{await browser.close();}
});

test('browser peers exchange media and a chunked file after accepting an invitation', {skip:!executablePath}, async () => {
  const browser=await chromium.launch({executablePath,headless:true,args:['--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream']});
  try {
    const page=await browser.newPage();
    await page.route(origin+'/',route=>route.fulfill({contentType:'text/html',body:'<!doctype html><title>Peer fixture</title>'}));
    await page.route(origin+'/peers.js',async route=>route.fulfill({contentType:'text/javascript',
      body:await readFile(new URL('../packages/web/peers.js',import.meta.url))}));
    await page.goto(origin);
    const result=await page.evaluate(async()=>{
      const {openPeerConnections,sendPeerFile}=await import('/peers.js');
      const inbox=new Map();
      let index=0;
      const user={peers:{
        async open(){const id=String(++index).padStart(24,'0');inbox.set(id,[]);return {id};},
        async list({id}){return {peers:[...inbox.keys()].filter(key=>key!==id)};},
        async send({id},{to,...message}){inbox.get(to).push({from:id,...message});},
        async receive({id}){return {messages:inbox.get(id).splice(0)};},
        async close({id}){inbox.delete(id);},
      }};
      const media=await navigator.mediaDevices.getUserMedia({audio:true,video:true});
      const screenFixture=document.createElement('canvas');
      screenFixture.width=64;
      screenFixture.height=64;
      const screen=screenFixture.captureStream(10);
      const tracks=[];
      let secondConnection;
      let announceFile;
      const file=new Promise(resolve=>{announceFile=resolve;});
      const b=await openPeerConnections(user,{
        discoverable:true,onInvite:({kind})=>({stream:kind==='media'?media:undefined,onConnection(pc){
          pc.ontrack=event=>tracks.push(event.track.kind);
          if(kind==='data')secondConnection=pc;
          pc.ondatachannel=({channel})=>{
            channel.binaryType='arraybuffer';
            let bytes=0;
            channel.onmessage=({data})=>{
              bytes+=data.byteLength;
              if(bytes===40_000)announceFile(bytes);
            };
          };
        }}),
      });
      const a=await openPeerConnections(user);
      try {
        const discovered=await a.listDiscoverablePeers();
        const {connection,channel}=await a.connect(b.id,{stream:media,dataLabel:'file'});
        if(channel.readyState!=='open')await new Promise(resolve=>channel.addEventListener('open',resolve,{once:true}));
        const sender=connection.getSenders().find(item=>item.track?.kind==='video');
        const camera=sender.track;
        await sender.replaceTrack(screen.getVideoTracks()[0]);
        await sender.replaceTrack(camera);
        await sendPeerFile(channel,new Blob([new Uint8Array(40_000)]));
        const parallel=await a.connect(b.id);
        if(parallel.channel.readyState!=='open')await new Promise(resolve=>parallel.channel.addEventListener('open',resolve,{once:true}));
        const remoteParallel=secondConnection;
        parallel.close();
        const deadline=Date.now()+5000;
        while(remoteParallel.connectionState!=='closed'&&Date.now()<deadline)await new Promise(resolve=>setTimeout(resolve,25));
        return {matches:discovered[0]===b.id,tracks:tracks.sort(),bytes:await file,
          closed:remoteParallel.connectionState==='closed',original:channel.readyState};
      }finally{
        await a.close();await b.close();
        for(const track of [...media.getTracks(),...screen.getTracks()])track.stop();
      }
    });
    const {deepEqual}=await import('node:assert/strict');
    deepEqual(result,{matches:true,tracks:['audio','video'],bytes:40_000,closed:true,original:'open'});
  } finally {await browser.close();}
});
