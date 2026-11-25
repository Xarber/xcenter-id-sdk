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
    await page.route(origin+'/client.js',async route=>route.fulfill({
      contentType:'text/javascript',body:await readFile(new URL('../packages/client/index.js',import.meta.url)),
    }));
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
      const sdk=await import('/client.js');
      const user=sdk.createUserClient({clientId:'fixture',getAccessToken:()=> 'synthetic-token'});
      return user.records.put('notes','one',{data:{title:'Browser fixture'},public:false},{revision:0});
    });
    if(result.id!=='one'||result.revision!==1)throw new Error('Unexpected write result');
  }finally{await browser.close();}
});
