import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {build} from 'vite';
import {chromium} from 'playwright';

// All browser requests are intercepted and fulfilled locally or aborted.
// A fake measurement ID is compiled into an isolated QA build: this script
// never loads Google's tag or transmits page views to any analytics property.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','analytics'),buildDirectory=path.join(output,'build');
await fs.mkdir(output,{recursive:true});
const measurementId='G-QATEST00001',productionUrl='https://smithmw7.github.io/rock-lab/';
const sourceFiles=['src/analytics.js','src/main.js','vite.config.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async filename=>[filename,createHash('sha256').update(await fs.readFile(path.join(project,filename))).digest('hex')])));
const report={sourceHashes:await hashes(),measurementId,checks:[],application:{},errors:[],unexpectedRequests:[],googleRequests:[],externalRequestsAllowed:0};
const moduleCache=new Map();
let browser;

async function analyticsModule(id=measurementId,prod=true){
  const key=JSON.stringify([id,prod]);if(moduleCache.has(key))return moduleCache.get(key);
  const result=await build({configFile:false,root:project,logLevel:'silent',publicDir:false,define:{'import.meta.env.VITE_GA_MEASUREMENT_ID':JSON.stringify(id),'import.meta.env.PROD':String(prod)},build:{write:false,minify:false,lib:{entry:path.join(project,'src/analytics.js'),formats:['es'],fileName:'analytics'}}});
  const code=(Array.isArray(result)?result:[result]).flatMap(bundle=>bundle.output).find(item=>item.type==='chunk').code;moduleCache.set(key,code);return code;
}
async function intercept(context,{url=productionUrl,moduleCode,blocked=false,application=false,label}){
  const origin=new URL(url).origin;
  await context.route('**/*',async route=>{
    const request=route.request(),target=new URL(request.url());
    if(target.hostname==='www.googletagmanager.com'&&target.pathname==='/gtag/js'){
      report.googleRequests.push({label,url:target.href,action:blocked?'aborted':'local-empty-stub'});
      if(blocked)await route.abort('blockedbyclient');
      else await route.fulfill({status:200,contentType:'application/javascript',body:'/* Intentionally empty QA stub; no Google code or network. */'});
      return;
    }
    if(target.hostname==='fonts.googleapis.com'){await route.fulfill({status:200,contentType:'text/css',body:'/* Local system fonts for offline QA. */'});return;}
    if(target.origin!==origin){report.unexpectedRequests.push({label,url:target.href});await route.abort('blockedbyclient');return;}
    if(!application){
      if(target.pathname.endsWith('/qa-analytics.js')){await route.fulfill({status:200,contentType:'application/javascript',body:moduleCode});return;}
      if(request.isNavigationRequest()){
        const html='<!doctype html><meta charset="utf-8"><title>Analytics gate QA</title><script type="module">import * as analytics from "/qa-analytics.js";window.__analyticsQa={analytics,ready:true};</script>';
        await route.fulfill({status:200,contentType:'text/html',body:html});return;
      }
      await route.fulfill({status:204,body:''});return;
    }
    try{
      if(!target.pathname.startsWith('/rock-lab/'))throw new Error('Outside application prefix');
      const relative=decodeURIComponent(target.pathname.slice('/rock-lab/'.length))||'index.html',filename=path.resolve(buildDirectory,relative);
      if(!filename.startsWith(`${buildDirectory}${path.sep}`))throw new Error('Outside isolated build');
      const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.wav':'audio/wav','.png':'image/png','.svg':'image/svg+xml','.webp':'image/webp'};
      await route.fulfill({status:200,contentType:mime[path.extname(filename)]||'application/octet-stream',body:await fs.readFile(filename)});
    }catch(error){report.unexpectedRequests.push({label,url:target.href,error:error.message});await route.fulfill({status:404,body:'No local QA fixture for request'});}
  });
}
async function browserState(page){return page.evaluate(()=>({
  webdriver:navigator.webdriver,
  tags:[...document.querySelectorAll('script[src*="googletagmanager.com/gtag/js"]')].map(script=>({src:script.src,async:script.async})),
  commands:(window.dataLayer||[]).map(entry=>Array.from(entry).map(value=>value instanceof Date?value.toISOString():value)),
  hasGtag:typeof window.gtag==='function',
}));}
function verifyTag(state,label,{expectedId=measurementId}={}){
  assert.equal(state.tags.length,1,`${label}: exactly one Google tag`);assert.equal(state.tags[0].src,`https://www.googletagmanager.com/gtag/js?id=${expectedId}`);assert.equal(state.tags[0].async,true);assert.equal(state.hasGtag,true);
  assert.equal(state.commands.length,2,`${label}: one initialization and one config`);assert.equal(state.commands[0][0],'js');assert.ok(Number.isFinite(Date.parse(state.commands[0][1])));
  assert.deepEqual(state.commands[1],['config',expectedId,{allow_google_signals:false,allow_ad_personalization_signals:false}],`${label}: ad signals disabled and no duplicate page-view event`);
}
async function gate({label,url=productionUrl,id=measurementId,prod=true,webdriver=false,optOut=false,allowed=false}){
  const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
  page.on('pageerror',error=>report.errors.push({label,message:error.message}));
  if(!webdriver)await context.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{configurable:true,get:()=>false}));
  if(optOut)await context.addInitScript(id=>{window[`ga-disable-${id}`]=true;},id);
  const before=report.googleRequests.length;
  await intercept(context,{url,moduleCode:await analyticsModule(id,prod),label});
  await page.goto(url);await page.waitForFunction(()=>window.__analyticsQa?.ready);
  const first=await browserState(page),returns=await page.evaluate(()=>[window.__analyticsQa.analytics.initAnalytics(),window.__analyticsQa.analytics.initAnalytics()]);
  const repeated=await browserState(page);assert.deepEqual(returns,[false,false],`${label}: repeated initialization is inert`);assert.deepEqual(repeated,first,`${label}: repeated calls cannot duplicate tags or commands`);
  if(allowed){verifyTag(first,label);assert.equal(report.googleRequests.length-before,1,`${label}: one intercepted script request`);}
  else{assert.deepEqual(first.tags,[],`${label}: no external tag`);assert.deepEqual(first.commands,[],`${label}: no analytics commands`);assert.equal(first.hasGtag,false,`${label}: no global tag initialized`);assert.equal(report.googleRequests.length-before,0,`${label}: no analytics request attempted`);}
  if(webdriver)assert.equal(first.webdriver,true,'Automation gate uses actual webdriver signal');
  report.checks.push({label,allowed,tags:first.tags.length,commands:first.commands.length,repeatedCallsInert:true});await context.close();
}

try{
  browser=await chromium.launch({channel:'chrome',headless:true});
  for(const pathname of['/rock-lab/','/rock-lab','/rock-lab/index.html'])await gate({label:`Production ${pathname}`,url:`https://smithmw7.github.io${pathname}?utm_source=qa`,allowed:true});
  for(const url of['http://127.0.0.1:5227/rock-lab/','http://localhost:5227/rock-lab/','https://example.github.io/rock-lab/','https://smithmw7.github.io/another-project/','https://smithmw7.github.io/rock-lab/preview/','http://smithmw7.github.io/rock-lab/'])await gate({label:`Excluded location ${url}`,url});
  await gate({label:'Development build on production URL',prod:false});
  await gate({label:'Native browser automation',webdriver:true});
  await gate({label:'Query-string exclusion',url:`${productionUrl}?analytics=0`});
  await gate({label:'Explicit measurement opt-out',optOut:true});
  for(const id of['','   ','UA-12345-1','G-invalid','G-BAD<"ID'])await gate({label:`Missing or invalid ID ${JSON.stringify(id)}`,id});
  await gate({label:'Trimmed valid ID',id:`  ${measurementId}  `,allowed:true});
  const serverModule=await import(`data:text/javascript;base64,${Buffer.from(await analyticsModule()).toString('base64')}`);assert.equal(serverModule.initAnalytics(),false,'Server evaluation without window is harmless');report.checks.push({label:'No browser window',allowed:false});

  // The actual application is built into ignored output with a fake ID. This
  // checks the production import and verifies that a blocked external script
  // cannot stop the studio or its ordinary controls from working.
  await build({root:project,logLevel:'silent',define:{'import.meta.env.VITE_GA_MEASUREMENT_ID':JSON.stringify(measurementId)},build:{outDir:buildDirectory,emptyOutDir:true}});
  const context=await browser.newContext({viewport:{width:1280,height:900},serviceWorkers:'block'}),page=await context.newPage();page.setDefaultTimeout(60000);
  await context.addInitScript(()=>Object.defineProperty(navigator,'webdriver',{configurable:true,get:()=>false}));
  page.on('pageerror',error=>report.errors.push({label:'Blocked tag application',message:error.message}));
  const consoleErrors=[];page.on('console',message=>{if(message.type()==='error')consoleErrors.push(message.text());});
  const before=report.googleRequests.length;await intercept(context,{blocked:true,application:true,label:'Blocked tag application'});
  await page.goto(`${productionUrl}?fracture=0`);await page.waitForFunction(()=>window.rockLab?.ready&&window.rockLab.audio.getState().loaded===16);
  const tag=await browserState(page);verifyTag(tag,'Blocked tag application');assert.equal(report.googleRequests.length-before,1);assert.equal(report.googleRequests.at(-1).action,'aborted');
  await page.evaluate(()=>{window.rockLab.renderer.setAnimationLoop(null);window.rockLab.audio.setMuted(true);});
  const generation=await page.evaluate(()=>window.rockLab.getStats().generationCount);await page.locator('#tab-shape').click();await page.locator('[data-family="all"]').click();await page.locator('#shape-search').fill('');await page.locator('#shapes [data-shape="smallBlock"]').click();await page.waitForFunction(generation=>window.rockLab.state.shape==='smallBlock'&&window.rockLab.getStats().generationCount>generation,generation);
  await page.evaluate(()=>window.advanceTime(0));assert.deepEqual(await browserState(page),tag,'Ordinary studio interactions do not add analytics action events');
  const screenshot=path.join(output,'blocked-analytics-studio.png');await page.screenshot({path:screenshot});
  assert.ok(consoleErrors.every(message=>message.includes('ERR_BLOCKED_BY_CLIENT')),`Only the deliberately blocked tag may report a resource error: ${JSON.stringify(consoleErrors)}`);
  report.application={ready:true,publicAudioLoaded:16,blockedTagRequests:1,selectedShape:'smallBlock',shapeControlWorks:true,noActionEvents:true,expectedBlockedResourceErrors:consoleErrors.length,screenshot};await context.close();
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.unexpectedRequests,[]);assert.deepEqual(await hashes(),report.sourceHashes,'Analytics QA covers one frozen source revision');report.passed=true;
  console.log(JSON.stringify({passed:true,gates:report.checks.length,application:report.application,googleRequests:report.googleRequests.length,externalRequestsAllowed:report.externalRequestsAllowed,output},null,2));
}catch(error){report.passed=false;report.failure=error.stack;throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser?.close();}
