import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {SCENE_PRESETS} from '../src/scene-presets.js';

// Render the actual authored scenes through the app's renderer and materials.
// Only this isolated browser's layout changes; scene lighting and framing are
// identical to choosing a gallery card in the studio.
const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','scene-gallery');
await fs.mkdir(output,{recursive:true});
await fs.mkdir(path.join(project,'public','scene-gallery'),{recursive:true});
const hash=async()=>createHash('sha256').update(await fs.readFile(path.join(project,'src','scene-presets.js'))).digest('hex');
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5207/',sourceHash:await hash(),scenes:[],errors:[]};
const browser=await chromium.launch({channel:'chrome',headless:true});
try{
  const page=await browser.newPage({viewport:{width:960,height:600},deviceScaleFactor:1});
  page.setDefaultTimeout(45000);
  page.on('pageerror',error=>report.errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());});
  await page.goto(report.url);
  await page.waitForFunction(()=>window.rockLab?.ready);
  await page.addStyleTag({content:'html,body{overflow:hidden!important}#stage{position:fixed!important;inset:0!important;width:960px!important;height:600px!important;max-height:none!important;min-height:0!important;margin:0!important;border:0!important}#stage>:not(canvas){display:none!important}'});
  await page.waitForFunction(()=>window.rockLab.renderer.domElement.clientWidth===960&&window.rockLab.renderer.domElement.clientHeight===600);
  for(const preset of SCENE_PRESETS){
    assert.equal(await page.evaluate(id=>window.rockLab.loadScenePreset(id),preset.id),true);
    await page.evaluate(()=>window.advanceTime(500));
    const data=await page.evaluate(()=>{
      const lab=window.rockLab;
      lab.renderer.render(lab.scene,lab.camera);
      const image=document.createElement('canvas');image.width=640;image.height=400;
      image.getContext('2d').drawImage(lab.renderer.domElement,0,0,640,400);
      return{image:image.toDataURL('image/webp',.91),scene:lab.sceneEditor.getSnapshot()};
    });
    assert.equal(data.scene.instances,preset.objectCount);
    assert.equal(data.scene.selectedId,null);
    const buffer=Buffer.from(data.image.split(',')[1],'base64');
    const filename=path.join(project,'public',preset.thumbnail);
    await fs.writeFile(filename,buffer);
    report.scenes.push({id:preset.id,file:preset.thumbnail,bytes:buffer.length,objects:data.scene.instances,triangles:data.scene.triangles});
    console.log(`${preset.title}: ${data.scene.instances} objects, ${Math.round(buffer.length/1024)} KB`);
  }
  assert.equal(await hash(),report.sourceHash,'Preset data changed while rendering; regenerate thumbnails.');
  assert.deepEqual(report.errors,[]);
  const cards=await Promise.all(SCENE_PRESETS.map(async preset=>`<figure><img src="data:image/webp;base64,${(await fs.readFile(path.join(project,'public',preset.thumbnail))).toString('base64')}"><figcaption>${preset.title}</figcaption></figure>`));
  await page.setViewportSize({width:1280,height:900});
  await page.goto('about:blank');
  await page.setContent(`<style>body{margin:0;background:#101519;color:#e1e7eb;font:16px system-ui}main{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;padding:12px}figure{margin:0;background:#202a30;border-radius:8px;overflow:hidden}img{display:block;width:100%}figcaption{padding:12px 16px}</style><main>${cards.join('')}</main>`);
  await page.screenshot({path:path.join(output,'thumbnails-contact-sheet.png'),fullPage:true});
}finally{
  await fs.writeFile(path.join(output,'thumbnail-report.json'),JSON.stringify(report,null,2));
  await browser.close();
}
