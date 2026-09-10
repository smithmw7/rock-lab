import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {GROUND_PRESETS} from '../src/ground-catalog.js';

// Isolated Chrome, real Ground controls and native recipe download/import.
// One fixed camera and manually advanced frames isolate the ground's GPU
// appearance from animation, asset regeneration and changing light settings.
const project=fileURLToPath(new URL('..',import.meta.url)),output=path.join(project,'output','natural-grounds');
await fs.mkdir(output,{recursive:true});
const ids=['meadow','dryGrass','forestDirt','rockySoil'];
const settingsKeys=['ground','groundScale','groundWetness','reflection'];
const sources=['src/main.js','src/ground.js','src/ground-catalog.js','src/ground-styles.css','src/catalog.js','src/tooltips.js','index.html',...(await fs.readdir(path.join(project,'src'))).filter(name=>name.includes('ground')&&name.endsWith('.js')&&!['ground.js','ground-catalog.js'].includes(name)).map(name=>`src/${name}`)];
const hashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,createHash('sha256').update(await fs.readFile(path.join(project,name))).digest('hex')])));
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5227/',sourceHashes:await hashes(),checks:{},grounds:{},captures:[],errors:[],warnings:[],requestFailures:[]};
const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,hasTouch:true,acceptDownloads:true}),page=await context.newPage();
page.setDefaultTimeout(45000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});
page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),failure:request.failure()?.errorText}));
const advance=(ms=0)=>page.evaluate(ms=>window.advanceTime(ms),ms);
const settings=options=>Object.fromEntries(settingsKeys.map(key=>[key,options[key]]));
const almost=(actual,expected,label,tolerance=1e-5)=>assert.ok(Math.abs(actual-expected)<=tolerance,`${label}: ${actual} versus ${expected}`);

async function snapshot(){return page.evaluate(()=>{
  const lab=window.rockLab,floor=lab.scene.getObjectByName('Procedural ground surface'),roots=[];
  lab.scene.updateMatrixWorld(true);lab.scene.traverseVisible(node=>{if(node.userData.generated)roots.push(node);});
  const meshes=[],min=[Infinity,Infinity,Infinity],max=[-Infinity,-Infinity,-Infinity];
  for(const root of roots)root.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;const position=mesh.geometry.attributes.position,point=mesh.position.clone();let signature=2166136261;
    for(let i=0;i<position.count;i++){point.fromBufferAttribute(position,i).applyMatrix4(mesh.matrixWorld);for(let axis=0;axis<3;axis++){min[axis]=Math.min(min[axis],point.getComponent(axis));max[axis]=Math.max(max[axis],point.getComponent(axis));}for(let axis=0;axis<3;axis++)signature=Math.imul(signature^Math.round(position.array[i*3+axis]*1e5),16777619);}
    meshes.push({id:mesh.uuid,geometry:mesh.geometry.uuid,signature:signature>>>0,materials:(Array.isArray(mesh.material)?mesh.material:[mesh.material]).map(material=>material.uuid)});
  });
  const uniforms=floor.material.userData.shader?.uniforms;
  return{state:structuredClone(lab.state),recipe:lab.recipe(),mode:lab.workspaceMode,scene:lab.sceneEditor.getSnapshot(),ground:lab.ground.getStats(),floor:{id:floor.uuid,geometry:floor.geometry.uuid,material:floor.material.uuid,y:floor.position.y,rotation:floor.rotation.toArray(),uniforms:uniforms?Object.fromEntries(['uGroundType','uGroundScale','uGroundWetness','uGroundReflection'].map(key=>[key,uniforms[key].value])):null},meshes,bounds:{min,max},camera:lab.camera.position.toArray(),target:lab.controls.target.toArray(),generation:lab.getStats().generationCount,resources:{...lab.renderer.info.memory,programs:lab.renderer.info.programs.length}};
});}
async function ground(id){await page.locator('#tab-ground').click();await page.locator(`#grounds button[data-ground="${id}"]`).click();await advance();const value=await snapshot();assert.equal(value.state.ground,id);assert.equal(value.ground.ground,id);assert.equal(value.floor.uniforms.uGroundType,GROUND_PRESETS.findIndex(preset=>preset.key===id));assert.equal(await page.locator('#grounds button.active').getAttribute('data-ground'),id);return value;}
async function range(id,value){const input=page.locator(`#${id}`);await input.scrollIntoViewIfNeeded();await input.evaluate((node,value)=>{node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));},value);await advance();assert.equal(Number(await input.inputValue()),value);assert.equal((await snapshot()).state[id],value);}
async function groundView(){await page.evaluate(()=>{const lab=window.rockLab;lab.controls.target.set(0,.5,0);lab.camera.position.set(6.8,7.8,9);lab.camera.zoom=.7;lab.camera.updateProjectionMatrix();lab.controls.update();lab.camera.updateMatrixWorld();});await advance();}
async function pixels(name,{save=false}={}){
  await advance();
  const data=await page.evaluate(name=>{
    const source=window.rockLab.renderer.domElement,canvas=document.createElement('canvas');canvas.width=source.width;canvas.height=source.height;const ctx=canvas.getContext('2d');ctx.drawImage(source,0,0);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height).data;
    (window.__naturalGroundPixels??={})[name]={pixels,width:canvas.width,height:canvas.height};
    const patch={x:Math.floor(canvas.width*.72),y:Math.floor(canvas.height*.65),width:Math.floor(canvas.width*.22),height:Math.floor(canvas.height*.2)},sum=[0,0,0],square=[0,0,0],colors=new Set();let count=0,hash=2166136261;
    for(const value of pixels)hash=Math.imul(hash^value,16777619);
    for(let y=patch.y;y<patch.y+patch.height;y++)for(let x=patch.x;x<patch.x+patch.width;x++){
      const index=(y*canvas.width+x)*4;for(let channel=0;channel<3;channel++){sum[channel]+=pixels[index+channel];square[channel]+=pixels[index+channel]**2;}colors.add(`${pixels[index]},${pixels[index+1]},${pixels[index+2]}`);count++;
    }
    const mean=sum.map(value=>value/count),std=square.map((value,channel)=>Math.sqrt(Math.max(0,value/count-mean[channel]**2)));
    return{hash:(hash>>>0).toString(16),width:canvas.width,height:canvas.height,patch:{...patch,mean,std,uniqueColors:colors.size},png:canvas.toDataURL('image/png').split(',')[1]};
  },name);
  const {png,...stats}=data;if(save){const filename=path.join(output,`${name}.png`);await fs.writeFile(filename,Buffer.from(png,'base64'));stats.filename=filename;report.captures.push(filename);}return stats;
}
async function difference(a,b){return page.evaluate(({a,b})=>{
  const first=window.__naturalGroundPixels[a],second=window.__naturalGroundPixels[b];if(first.width!==second.width||first.height!==second.height)throw new Error('Pixel comparison requires the same camera viewport');
  let changed=0,changedAny=0,absolute=0,maximum=0,patchChanged=0,patchAbsolute=0,patchCount=0;const width=first.width,height=first.height;
  for(let index=0;index<first.pixels.length;index+=4){let local=0;for(let channel=0;channel<3;channel++){const value=Math.abs(first.pixels[index+channel]-second.pixels[index+channel]);absolute+=value;local=Math.max(local,value);}if(local>3)changed++;if(local>0)changedAny++;maximum=Math.max(maximum,local);const pixel=index/4,x=pixel%width,y=Math.floor(pixel/width);if(x>=width*.72&&x<width*.94&&y>=height*.65&&y<height*.85){patchCount++;if(local>3)patchChanged++;for(let channel=0;channel<3;channel++)patchAbsolute+=Math.abs(first.pixels[index+channel]-second.pixels[index+channel]);}}
  return{changed,changedAny,changedFraction:changed/(width*height),meanDifference:absolute/(width*height*3),maximum,patchChangedFraction:patchChanged/patchCount,patchMeanDifference:patchAbsolute/(patchCount*3)};
},{a,b});}
async function captureUi(name){await advance();const filename=path.join(output,`${name}.png`);await page.screenshot({path:filename});report.captures.push(filename);}
async function contactSheet(items){
  const tab=await context.newPage();await tab.setViewportSize({width:1400,height:1000});const cards=await Promise.all(items.map(async item=>`<figure><img src="data:image/png;base64,${(await fs.readFile(item.filename)).toString('base64')}"><figcaption>${item.label}</figcaption></figure>`));
  await tab.setContent(`<style>body{margin:0;background:#121b22;color:#e4e9ed;font:16px system-ui}main{display:grid;grid-template-columns:repeat(2,1fr);gap:10px;padding:10px}figure{margin:0;background:#263038}img{display:block;width:100%;height:430px;object-fit:contain}figcaption{padding:12px 16px}</style><main>${cards.join('')}</main>`);const filename=path.join(output,'natural-ground-contact-sheet.png');await tab.screenshot({path:filename,fullPage:true});report.captures.push(filename);await tab.close();return filename;
}
async function exportFile(name){await page.locator('#menu-file').click();const event=page.waitForEvent('download');await page.locator('#save-recipe').click();const download=await event,filename=path.join(output,`${name}.json`);await download.saveAs(filename);assert.equal(await download.failure(),null);return{filename,data:JSON.parse(await fs.readFile(filename,'utf8'))};}
async function importFile(filename){
  await page.evaluate(()=>{window.__naturalGroundImported=false;const toast=document.querySelector('#toast'),observer=new MutationObserver(()=>{if(['Scene restored','Asset recipe restored'].includes(toast.textContent)){window.__naturalGroundImported=true;observer.disconnect();}});observer.observe(toast,{childList:true,subtree:true,characterData:true});});
  await page.locator('#menu-file').click();const event=page.waitForEvent('filechooser');await page.locator('#load-recipe').click();await(await event).setFiles(filename);await page.waitForFunction(()=>window.__naturalGroundImported);await advance();
}
function stable(before,after,label){assert.equal(after.generation,before.generation,`${label}: ground change does not regenerate assets`);assert.deepEqual(after.meshes,before.meshes,`${label}: object GPU meshes/materials remain unchanged`);assert.deepEqual(after.bounds,before.bounds,`${label}: object contact positions stay fixed`);for(const key of['id','geometry','material','y','rotation'])assert.deepEqual(after.floor[key],before.floor[key],`${label}: same flat floor ${key}`);assert.deepEqual(after.camera,before.camera,`${label}: camera stays fixed`);assert.deepEqual(after.target,before.target,`${label}: camera target stays fixed`);}

try{
  const url=new URL(report.url);url.searchParams.set('fracture','0');await page.goto(url.href);await page.waitForFunction(()=>window.rockLab?.ready);
  await page.evaluate(()=>{window.rockLab.renderer.setAnimationLoop(null);window.rockLab.audio.setMuted(true);});
  await page.locator('#tab-shape').click();await page.locator('[data-family="all"]').click();await page.locator('#shape-search').fill('');await page.locator('#shapes [data-shape="boulder"]').click();await advance();
  await page.locator('#tab-studio').click();await page.locator('#rotate').uncheck();await page.locator('#lighting').selectOption('soft');await page.locator('#tab-ground').click();await groundView();
  assert.equal(GROUND_PRESETS.length,12);assert.deepEqual(GROUND_PRESETS.slice(-4).map(preset=>preset.key),ids);assert.equal(await page.locator('#grounds button[data-ground]').count(),12);assert.equal((await page.locator('#ground-count').textContent()).trim(),'12 types');report.checks.catalog={total:12,newIds:ids};
  const initial=await snapshot();assert.ok(initial.meshes.length);almost(initial.floor.y,-.005,'Ground surface stays on the existing contact plane');assert.ok(initial.bounds.min[1]>=-.001&&initial.bounds.min[1]<.03,'Test asset sits on ground');
  const cards=[];for(const id of ids){
    const before=await snapshot(),current=await ground(id),preset=GROUND_PRESETS.find(preset=>preset.key===id);stable(before,current,`${id} pick`);assert.deepEqual(settings(current.state),{ground:id,groundScale:preset.scale,groundWetness:preset.wetness,reflection:preset.reflection});assert.equal(current.floor.uniforms.uGroundScale,preset.scale);assert.equal(current.floor.uniforms.uGroundWetness,preset.wetness);assert.equal(current.floor.uniforms.uGroundReflection,preset.reflection);
    const appearance=await pixels(`${id}-default`,{save:true});assert.ok(appearance.patch.uniqueColors>80,`${id}: real ground patch contains procedural color detail`);assert.ok(Math.max(...appearance.patch.std)>1.5,`${id}: floor patch is not a flat fill`);const repeat=await pixels('repeat');assert.equal(repeat.hash,appearance.hash,`${id}: static render is deterministic`);
    report.grounds[id]={label:preset.label,preset:settings(current.state),appearance};cards.push({label:preset.label,filename:appearance.filename});
  }
  report.checks.distinctPairs=[];for(let a=0;a<ids.length;a++)for(let b=a+1;b<ids.length;b++){const delta=await difference(`${ids[a]}-default`,`${ids[b]}-default`);assert.ok(delta.patchChangedFraction>.5&&delta.patchMeanDifference>3,`${ids[a]} / ${ids[b]}: substantially distinct rendered ground patches`);report.checks.distinctPairs.push({a:ids[a],b:ids[b],...delta});}
  report.checks.contactSheet=await contactSheet(cards);await captureUi('natural-ground-desktop');

  for(const id of ids){
    await ground(id);const baseline=await snapshot();await range('groundWetness',.6);await range('reflection',.65);await range('groundScale',.5);await pixels('small');await range('groundScale',2);await pixels('large');if(['meadow','dryGrass'].includes(id))await pixels(`${id}-scale-2`,{save:true});const scale=await difference('small','large');assert.ok(scale.patchChangedFraction>.15&&scale.patchMeanDifference>1,`${id}: texture scale changes the actual ground pattern`);
    await range('groundScale',1);await range('reflection',0);await pixels('reflection-off');const passes=(await snapshot()).ground.reflectionPasses;await advance();assert.equal((await snapshot()).ground.reflectionPasses,passes,`${id}: zero strength stops the planar pass`);assert.equal((await snapshot()).ground.reflectionEnabled,false);
    // Natural surfaces intentionally retain a mostly diffuse finish. Measure
    // their subtle pixel change together with the real reflection-pass count;
    // do not require the strong mirror contrast expected from wet asphalt.
    await range('reflection',.85);await pixels('reflection-on');const reflection=await difference('reflection-off','reflection-on');assert.ok(reflection.changedAny>100&&reflection.maximum>=1,`${id}: reflection changes actual pixels`);assert.equal((await snapshot()).ground.reflectionEnabled,true);assert.ok((await snapshot()).ground.reflectionPasses>passes,`${id}: reflection renders a real pass`);
    await range('groundWetness',0);await pixels(`${id}-dry`,{save:true});await range('groundWetness',1);await pixels(`${id}-wet`,{save:true});const wetness=await difference(`${id}-dry`,`${id}-wet`);assert.ok(wetness.changed>1000&&wetness.meanDifference>1,`${id}: wetness changes actual finish`);stable(baseline,await snapshot(),`${id} controls`);
    report.grounds[id].controls={scale,reflection,wetness,disabledPassStable:true,enabledPassObserved:true};
  }

  const cycles=[];for(let cycle=0;cycle<3;cycle++){const samples=[];for(const preset of GROUND_PRESETS){await ground(preset.key);samples.push({id:preset.key,...(await snapshot()).resources});}cycles.push(samples);}assert.deepEqual(cycles[2],cycles[1],'Cycling all twelve grounds retains no additional GPU resources after warmup');report.checks.resources={cycles:3,samples:cycles[2]};

  report.checks.files=[];for(const[index,id]of ids.entries()){
    await ground(id);await range('groundScale',Number((1.3+index*.1).toFixed(2)));await range('groundWetness',Number((.27+index*.1).toFixed(2)));await range('reflection',Number((.39+index*.1).toFixed(2)));const expected=settings((await snapshot()).state),exported=await exportFile(`${id}-recipe`);assert.deepEqual(settings(exported.data.options),expected);await ground('studio');await importFile(exported.filename);const restored=await snapshot();assert.deepEqual(settings(restored.state),expected,`${id}: native import restores all ground settings`);assert.deepEqual(restored.recipe.options,exported.data.options,`${id}: complete object options survive file roundtrip`);assert.equal(restored.ground.ground,id);report.checks.files.push({id,settings:expected,nativeDownloadAndImport:true,filename:exported.filename});
  }

  await ground('meadow');await range('groundScale',1.7);await range('groundWetness',.31);await range('reflection',.23);const objectDraft=settings((await snapshot()).state);
  await page.locator('#mode-scene').click();await page.locator('#scene-add').click();await advance();const sceneBefore=await snapshot();await ground('forestDirt');await range('groundScale',2.2);await range('groundWetness',.57);await range('reflection',.41);const sceneAfter=await snapshot(),sceneEnvironment=settings(sceneAfter.state);assert.deepEqual(sceneAfter.scene.objects,sceneBefore.scene.objects,'Changing Scene ground preserves every object recipe and transform');assert.deepEqual(settings(sceneAfter.recipe.scene.environment),sceneEnvironment);
  await page.locator('#mode-object').click();await advance();assert.deepEqual(settings((await snapshot()).state),objectDraft,'Object draft restores its own natural ground');await page.locator('#mode-scene').click();await advance();assert.deepEqual(settings((await snapshot()).state),sceneEnvironment,'Scene restores its separate ground environment');
  const sceneFile=await exportFile('natural-ground-scene-recipe');await ground('dryGrass');await importFile(sceneFile.filename);const sceneRestored=await snapshot();assert.equal(sceneRestored.mode,'scene');assert.deepEqual(settings(sceneRestored.state),sceneEnvironment);assert.deepEqual(sceneRestored.scene.objects,sceneAfter.scene.objects,'Scene file preserves object instances');await page.locator('#mode-object').click();await advance();assert.deepEqual(settings((await snapshot()).state),objectDraft,'Scene import retains the saved Object ground');report.checks.environments={object:objectDraft,scene:sceneEnvironment,instances:sceneAfter.scene.instances,separateDrafts:true,nativeSceneFile:true};

  await ground('meadow');const help=await page.evaluate(()=>({labels:['reflection','groundWetness','groundScale'].map(id=>{const control=document.getElementById(id),label=[...document.querySelectorAll('label')].find(label=>label.htmlFor===id||label.contains(control)),trigger=label?.matches('.parameter-help-label')?label:label?.querySelector('.parameter-help-label');return{id,associated:!!label,help:!!trigger,described:!!control.getAttribute('aria-describedby')};}),cardTooltips:document.querySelectorAll('#grounds button[title],#grounds button.parameter-help-label,#grounds button .parameter-help-label').length}));assert.ok(help.labels.every(label=>label.associated&&label.help&&label.described));assert.equal(help.cardTooltips,0);report.checks.parameterHelp=help;
  const scaleHelp=page.locator('label[for="groundScale"] .parameter-help-label,label[for="groundScale"].parameter-help-label').first();await scaleHelp.hover();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));await captureUi('ground-scale-desktop-help');await page.keyboard.press('Escape');
  await page.setViewportSize({width:390,height:844});await advance();await page.locator('#tab-ground').tap();const cardLayout=await page.locator('#grounds').evaluate(root=>({viewport:innerWidth,documentWidth:document.documentElement.scrollWidth,width:root.getBoundingClientRect().width,cards:[...root.querySelectorAll('button')].map(button=>({id:button.dataset.ground,rect:button.getBoundingClientRect().toJSON(),label:button.querySelector('span').getBoundingClientRect().toJSON(),scrollWidth:button.querySelector('span').scrollWidth,clientWidth:button.querySelector('span').clientWidth}))}));assert.ok(cardLayout.documentWidth<=cardLayout.viewport+1);for(const card of cardLayout.cards){assert.ok(card.rect.left>=0&&card.rect.right<=390,'All ground cards stay within narrow viewport');assert.ok(card.rect.width>=60&&card.rect.height>=60,'Ground cards retain usable touch targets');assert.ok(card.scrollWidth<=card.clientWidth+1,`${card.id}: card label is not clipped horizontally`);}report.checks.narrowCards=cardLayout;
  for(const id of ids){await page.locator(`#grounds button[data-ground="${id}"]`).tap();await advance();assert.equal((await snapshot()).state.ground,id,`${id}: narrow card tap selects rendered ground`);}await page.locator('#grounds button[data-ground="meadow"]').scrollIntoViewIfNeeded();await captureUi('natural-ground-narrow-cards');
  await scaleHelp.scrollIntoViewIfNeeded();await scaleHelp.tap();await page.waitForFunction(()=>[...document.querySelectorAll('.parameter-tooltip')].some(node=>!node.hidden));const tooltip=await page.locator('.parameter-tooltip:visible').boundingBox();assert.ok(tooltip.x>=0&&tooltip.x+tooltip.width<=391);await captureUi('natural-ground-narrow-help');await page.keyboard.press('Escape');report.checks.narrowTouchHelp={visible:true,withinViewport:true};
  assert.deepEqual(report.errors,[]);assert.deepEqual(report.warnings,[]);assert.deepEqual(report.requestFailures,[]);assert.deepEqual(await hashes(),report.sourceHashes,'All checks cover one frozen natural-ground runtime revision');report.passed=true;
  console.log(JSON.stringify({passed:true,grounds:ids,checks:Object.keys(report.checks),captures:report.captures.length,output,errors:report.errors,warnings:report.warnings},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await captureUi('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
