import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const project=fileURLToPath(new URL('..',import.meta.url));
const output=path.join(project,'output','turntable');await fs.mkdir(output,{recursive:true});
const report={url:process.env.ROCK_LAB_URL||'http://127.0.0.1:5207/',checks:{},errors:[],warnings:[]};
const sourceFiles=['src/main.js','src/fracture.js','src/menu.js'];
const hashes=async()=>Object.fromEntries(await Promise.all(sourceFiles.map(async file=>[file,createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex')])));
report.sourceHashes=await hashes();
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});page.setDefaultTimeout(45000);
page.on('pageerror',error=>report.errors.push(error.message));
page.on('console',message=>{if(message.type()==='error')report.errors.push(message.text());if(message.type()==='warning')report.warnings.push(message.text());});

function browserSnapshot(){
  const lab=window.rockLab,roots=[];lab.scene.traverse(object=>{if(object.userData.generated&&object.userData.options)roots.push(object);});
  const sourceMeshes=[];for(const root of roots)root.traverse(object=>{if(object.isMesh)sourceMeshes.push(object);});
  const worldPoints=meshes=>meshes.map(mesh=>{
    mesh.updateWorldMatrix(true,false);const attribute=mesh.geometry.attributes.position,point=mesh.position.clone(),points=[];
    for(let i=0;i<attribute.count;i++){point.fromBufferAttribute(attribute,i).applyMatrix4(mesh.matrixWorld);points.push(...point);}
    return points;
  });
  const bodies=lab.fracture?.getMeshes()||[];
  return{
    stats:lab.getStats(),text:JSON.parse(window.render_game_to_text()),checked:document.querySelector('#rotate').checked,
    camera:lab.camera.position.toArray(),cameraQuaternion:lab.camera.quaternion.toArray(),
    sourceVisible:roots.every(root=>{for(let current=root;current;current=current.parent)if(!current.visible)return false;return true;}),
    sourceAngle:roots[0]?.parent.rotation.y,sourcePoints:worldPoints(sourceMeshes),intactPoints:bodies.every(mesh=>mesh.userData.generation===0)?worldPoints(bodies):null,
    bodyPose:JSON.stringify(bodies.map(mesh=>({id:mesh.uuid,position:mesh.position.toArray(),quaternion:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),geometry:mesh.geometry.uuid}))),
    bodies:bodies.length,
  };
}
const snapshot=()=>page.evaluate(browserSnapshot);
const advance=ms=>page.evaluate(ms=>window.advanceTime(ms),ms);
const distance=(a,b)=>Math.hypot(...a.map((value,index)=>value-b[index]));
async function viewAction(action){await page.locator('#menu-view').click();await page.locator(`[data-menu-action="${action}"]`).click();}
async function menuAgreement(expected){
  await page.locator('#menu-view').click();assert.equal(await page.locator('[data-menu-action="turntable"]').getAttribute('aria-checked'),String(expected));assert.equal(await page.locator('#rotate').isChecked(),expected);await page.keyboard.press('Escape');
}
async function fracture(enabled){
  await page.locator('#tab-fracture').click();await page.locator('#fr-enabled').setChecked(enabled);
  await page.waitForFunction(enabled=>Boolean(window.rockLab.fracture?.getStats().enabled)===enabled,enabled);
}
async function checkbox(enabled){await page.locator('#tab-studio').click();await page.locator('#rotate').setChecked(enabled);}
function cloneMatchesSource(value,label){
  assert.ok(value.intactPoints?.length>0);assert.equal(value.intactPoints.length,value.sourcePoints.length);
  let maximumError=0;
  for(let part=0;part<value.sourcePoints.length;part++){
    assert.equal(value.sourcePoints[part].length,value.intactPoints[part].length);
    for(let i=0;i<value.sourcePoints[part].length;i++)maximumError=Math.max(maximumError,Math.abs(value.sourcePoints[part][i]-value.intactPoints[part][i]));
  }
  assert.ok(maximumError<3e-6,`${label} keeps current source orientation (error ${maximumError})`);return maximumError;
}
async function orbitWithFixedBodies(label){
  const before=await snapshot();await advance(900);const after=await snapshot();
  assert.equal(after.stats.fracture.enabled,true);assert.equal(after.stats.fracture.paused,true);assert.equal(after.stats.turntable,true);assert.equal(after.stats.turntableMode,'camera');
  assert.equal(after.checked,true);assert.equal(after.bodyPose,before.bodyPose,`${label} leaves paused physics bodies fixed`);assert.equal(after.sourceAngle,before.sourceAngle,`${label} leaves the hidden source fixed`);
  const moved=distance(before.camera,after.camera);assert.ok(moved>.05,`${label} visibly orbits the camera`);return{cameraDistance:moved,bodies:after.bodies,pausedBodiesFixed:true};
}
async function capture(name){await page.screenshot({path:path.join(output,`${name}.png`)});}

try{
  await page.goto(report.url);await page.waitForFunction(()=>window.rockLab?.ready);await page.locator('#sound-toggle').click();
  await page.locator('#tab-shape').click();await page.locator('[data-family="all"]').click();await page.locator('#shapes [data-shape="hammer"]').click();await page.waitForFunction(()=>window.rockLab.state.shape==='hammer');
  await page.locator('#tab-fracture').click();await page.locator('#fr-method').selectOption('simple');
  for(const [id,value] of [['fr-fragmentCount',2],['fr-gravity',0],['fr-impulse',0]])await page.locator(`#${id}`).evaluate((input,value)=>{input.value=String(value);input.dispatchEvent(new Event('input',{bubbles:true}));},value);

  // Order one: start the ordinary asset turntable, then enable destruction.
  // Destruction now defaults on, so explicitly prepare the ordinary-asset case.
  await fracture(false);
  await checkbox(true);const assetBefore=await snapshot();await advance(900);const assetAfter=await snapshot();
  assert.equal(assetAfter.stats.turntable,true);assert.equal(assetAfter.stats.turntableMode,'asset');assert.ok(Math.abs(assetAfter.sourceAngle-assetBefore.sourceAngle)>.1);assert.ok(distance(assetAfter.camera,assetBefore.camera)<1e-6);await menuAgreement(true);
  await fracture(true);const enabled=await snapshot();assert.equal(enabled.checked,true);assert.equal(enabled.stats.turntable,true);assert.equal(enabled.sourceVisible,false);
  const sourceError=cloneMatchesSource(enabled,'Enabling fracture');
  await page.locator('#fr-pause').click();await page.waitForFunction(()=>window.rockLab.fracture.getStats().paused);
  report.checks.turntableThenFracture={normalAssetRotation:true,sourceWorldPositionError:sourceError,...await orbitWithFixedBodies('Intact fracture preview')};await menuAgreement(true);await capture('intact-fracture-orbit');

  // Reframing must not reset the orientation already baked into the bodies.
  const beforeFrame=await snapshot();await viewAction('frame');const afterFrame=await snapshot();
  assert.equal(afterFrame.sourceAngle,beforeFrame.sourceAngle);assert.equal(afterFrame.bodyPose,beforeFrame.bodyPose);cloneMatchesSource(afterFrame,'Frame while destruction is active');
  report.checks.framePreservesSourceOrientation=true;

  // Actual pointer input, computed from the current moving camera. The large
  // hammer head gives a solid hit target without pausing the camera turntable.
  const point=await page.evaluate(()=>{
    const lab=window.rockLab,candidates=lab.fracture.getMeshes().filter(mesh=>mesh.userData.materialSlot==='primary');
    for(const mesh of candidates)mesh.geometry.computeBoundingSphere();candidates.sort((a,b)=>b.geometry.boundingSphere.radius-a.geometry.boundingSphere.radius);
    const mesh=candidates[0];mesh.updateWorldMatrix(true,false);const point=mesh.geometry.boundingSphere.center.clone().applyMatrix4(mesh.matrixWorld).project(lab.camera),rect=lab.renderer.domElement.getBoundingClientRect();
    return{x:rect.left+(point.x+1)*rect.width/2,y:rect.top+(1-point.y)*rect.height/2};
  });
  await page.mouse.click(point.x,point.y);await page.waitForFunction(()=>window.rockLab.fracture.getStats().generation===1&&!window.rockLab.fracture.getStats().busy);
  const broken=await snapshot();assert.equal(broken.stats.fracture.fragments,2);assert.equal(broken.checked,true);report.checks.actualTapWhileTurning={fragments:2,...await orbitWithFixedBodies('Broken preview')};await capture('tap-fracture-while-turning');
  await page.locator('#tab-fracture').click();
  await page.locator('#fr-gravity').evaluate(input=>{input.value='9.81';input.dispatchEvent(new Event('input',{bubbles:true}));});
  const beforeResume=await snapshot();await page.locator('#fr-pause').click();await page.waitForFunction(()=>!window.rockLab.fracture.getStats().paused);await advance(500);
  const moving=await snapshot();assert.equal(moving.stats.fracture.enabled,true);assert.equal(moving.stats.fracture.paused,false);assert.equal(moving.stats.turntable,true);assert.equal(moving.stats.turntableMode,'camera');assert.equal(moving.checked,true);
  assert.notEqual(moving.bodyPose,beforeResume.bodyPose,'Resumed Rapier debris moves while the turntable camera orbits');const movingCameraDistance=distance(moving.camera,beforeResume.camera);assert.ok(movingCameraDistance>.05);
  await page.locator('#fr-pause').click();await page.waitForFunction(()=>window.rockLab.fracture.getStats().paused);
  report.checks.resumedPhysicsWhileTurning={debrisMoved:true,cameraDistance:movingCameraDistance,bothModesRemainEnabled:true,pausedAgain:await orbitWithFixedBodies('Paused again after live physics')};
  await page.locator('#tab-fracture').click();await page.locator('#fr-reset').click();await page.waitForFunction(()=>window.rockLab.fracture.getStats().generation===0);
  const reset=await snapshot();assert.equal(reset.checked,true);assert.equal(reset.sourceAngle,enabled.sourceAngle);cloneMatchesSource(reset,'Reset while turning');
  report.checks.resetKeepsCameraTurntable=await orbitWithFixedBodies('Reset preview');await menuAgreement(true);

  // Order two: destruction stays on when the turntable is stopped and started.
  await viewAction('turntable');assert.equal((await snapshot()).stats.fracture.enabled,true);await menuAgreement(false);
  await advance(1600);const stoppedBefore=await snapshot();await advance(400);const stoppedAfter=await snapshot();
  assert.equal(stoppedAfter.stats.turntable,false);assert.equal(stoppedAfter.stats.fracture.enabled,true);assert.equal(stoppedAfter.bodyPose,stoppedBefore.bodyPose);assert.ok(distance(stoppedAfter.camera,stoppedBefore.camera)<.002,'Stopped turntable settles after OrbitControls damping');
  await checkbox(true);assert.equal((await snapshot()).stats.fracture.enabled,true);await menuAgreement(true);
  report.checks.fractureThenTurntable={stoppingPreservesDestruction:true,...await orbitWithFixedBodies('Restarted camera turntable')};

  // Leaving destruction restores the same intact orientation and resumes the
  // ordinary assembly turntable rather than rotating the Rapier scene graph.
  const beforeDisable=await snapshot();await fracture(false);const afterDisable=await snapshot();
  assert.equal(afterDisable.sourceVisible,true);assert.equal(afterDisable.checked,true);assert.equal(afterDisable.stats.turntableMode,'asset');assert.ok(Math.abs(afterDisable.sourceAngle-beforeDisable.sourceAngle)<.08,'Disabling fracture does not reset the source angle');
  await advance(1600);const resumedBefore=await snapshot();await advance(700);const resumedAfter=await snapshot();
  assert.ok(Math.abs(resumedAfter.sourceAngle-resumedBefore.sourceAngle)>.1);assert.ok(distance(resumedAfter.camera,resumedBefore.camera)<.002);assert.equal(resumedAfter.stats.fracture.enabled,false);await menuAgreement(true);
  report.checks.disableFractureResumesAssetTurntable={turntableRemainsEnabled:true,assemblyRotates:true,cameraSettles:true};await capture('normal-turntable-after-fracture');

  await checkbox(false);await menuAgreement(false);const final=await snapshot();assert.equal(final.stats.turntable,false);assert.equal(final.stats.fracture.enabled,false);
  assert.equal(final.text.turntable.enabled,false);assert.equal(final.text.turntable.mode,'asset');report.checks.debugStateAndMenuAgreement=true;
  assert.deepEqual(report.errors,[]);assert.deepEqual(await hashes(),report.sourceHashes,'One frozen runtime revision must cover this run');report.passed=true;
  console.log(JSON.stringify({passed:true,checks:report.checks,errors:report.errors,warnings:report.warnings,output},null,2));
}catch(error){report.passed=false;report.failure=error.stack;await capture('failure').catch(()=>{});throw error;}
finally{await fs.writeFile(path.join(output,'report.json'),JSON.stringify(report,null,2));await browser.close();}
