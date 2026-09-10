import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHash } from 'node:crypto';
import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import { createFractureLab } from '../src/fracture.js';

// Exercise real convex hulls and the shared fracture controller. Only capture
// the world so test fragments can be placed on controlled physical trajectories.
let capturedWorld;
const nativeCreate = RAPIER.World.prototype.createRigidBody;
RAPIER.World.prototype.createRigidBody = function (...args) {
  capturedWorld = this;
  return nativeCreate.apply(this, args);
};
const outer = new THREE.MeshStandardMaterial(), inner = new THREE.MeshStandardMaterial();
const output = new URL('../output/fracture-settling/wake-report.json', import.meta.url);
const sourceURL = new URL('../src/fracture.js', import.meta.url);
const hash = async () => createHash('sha256').update(await fs.readFile(sourceURL)).digest('hex');
const report = { sourceHash: await hash(), cases: [], passed: false };
const pose = body => [body.translation(), body.rotation()];
const resting = body => body.userData?.resting === true || body.isSleeping();
const simulate = (lab, seconds) => { for (let frame = 0; frame < Math.round(seconds * 60); frame++) lab.step(1 / 60); };

async function setup(parts) {
  const source = new THREE.Group(), scene = new THREE.Scene();
  for (const { size, position, geometry, rotation } of parts) {
    const mesh = new THREE.Mesh(geometry || new THREE.BoxGeometry(...size), outer);
    mesh.position.set(...position); source.add(mesh);
    if (rotation) mesh.rotation.set(...rotation);
  }
  scene.add(source);
  const lab = await createFractureLab({ scene, outerMaterial: outer, innerMaterial: inner });
  lab.update({ method: 'simple', fragmentCount: 2, impulse: 0, restitution: 0, fracturePlanes: { x: true, y: false, z: false } });
  lab.setSource(source); assert.equal(lab.setEnabled(true), true);
  const world = capturedWorld;
  const bodies = () => {
    const result = [];
    world.forEachRigidBody(body => { if (body.userData?.generation > 0) result.push(body); });
    return result;
  };
  const tap = y => lab.tap(new THREE.Raycaster(new THREE.Vector3(0, y, 12), new THREE.Vector3(0, 0, -1)));
  return { lab, world, bodies, tap, dispose() { lab.dispose(); source.traverse(mesh => mesh.geometry?.dispose()); source.removeFromParent(); } };
}

async function check(name, test) {
  try {
    const evidence = await test(); report.cases.push({ name, passed: true, ...evidence });
  } catch (error) {
    report.cases.push({ name, passed: false, error: error.stack });
  }
  console.log(JSON.stringify(report.cases.at(-1)));
}

try {
  await check('A pile with initially predictive floor contacts settles', async () => {
    const context = await setup([{ size: [1, 1, 1], position: [0, .509, 0] }]);
    try {
      // Start 9 mm above the floor. Rapier may preserve that initial positive
      // manifold distance even after the solver has brought the hull to rest.
      assert(await context.tap(.509)); simulate(context.lab, 10);
      const fragments = context.bodies();
      assert.equal(fragments.length, 2);
      assert.ok(fragments.every(resting), 'Actual loaded floor contacts must settle despite an initially positive cached manifold gap');
      const before = fragments.map(pose); simulate(context.lab, 2);
      assert.deepEqual(fragments.map(pose), before);
      return { initialFloorGap: .009, fragments: fragments.length, resting: fragments.filter(resting).length };
    } finally { context.dispose(); }
  });

  await check('Nearby long shards do not wake a separated pile', async () => {
    const context = await setup([
      { size: [1.2, 1, 1.2], position: [0, .5, 0] },
      { size: [8, .1, .1], position: [0, 5, 0] },
    ]);
    try {
      assert(await context.tap(.5)); simulate(context.lab, 8);
      const settled = context.bodies(), handles = new Set(settled.map(body => body.handle));
      assert.equal(settled.length, 2); assert.ok(settled.every(resting));
      const initial = settled.map(pose);
      assert(await context.tap(5));
      const incoming = context.bodies().filter(body => !handles.has(body.handle));
      incoming.forEach((body, index) => {
        body.setGravityScale(0, true);
        body.setTranslation({ x: 0, y: .5, z: index ? 10 : 1.5 }, true);
        body.setLinvel({ x: .2, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      });
      context.world.propagateModifiedBodyPositionsToColliders();
      let minimumHullGap = Infinity, awakeBodyFrames = 0;
      for (let frame = 0; frame < 120; frame++) {
        context.lab.step(1 / 60);
        for (const body of settled) {
          const contact = incoming[0].collider(0).contactCollider(body.collider(0), 10);
          minimumHullGap = Math.min(minimumHullGap, contact?.distance ?? 10);
          if (!resting(body)) awakeBodyFrames++;
        }
      }
      assert.ok(minimumHullGap > .8, `Counterexample must stay physically separated, got ${minimumHullGap}`);
      assert.equal(awakeBodyFrames, 0, 'Bounding-sphere overlap without a hull collision must never wake settled fragments');
      assert.deepEqual(settled.map(pose), initial, 'Nearby non-colliding motion must leave the pile exactly still');
      return { fragments: settled.length, minimumHullGap, awakeBodyFrames, observationSeconds: 2 };
    } finally { context.dispose(); }
  });

  await check('A gentle real hull collision still wakes the pile', async () => {
    const context = await setup([
      { size: [1.2, 1, 1.2], position: [0, .5, 0] },
      { size: [.8, .8, .8], position: [0, 6, 0] },
    ]);
    try {
      assert(await context.tap(.5)); simulate(context.lab, 8);
      const settled = context.bodies(), handles = new Set(settled.map(body => body.handle));
      assert.ok(settled.every(resting));
      assert(await context.tap(6));
      const incoming = context.bodies().filter(body => !handles.has(body.handle));
      incoming.forEach((body, index) => {
        body.setGravityScale(0, true); body.setTranslation({ x: 8 + index * 2, y: 5, z: 0 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      });
      const striker = incoming[0], vertices = striker.collider(0).shape.vertices;
      let maxX = -Infinity;
      for (let index = 0; index < vertices.length; index += 3) maxX = Math.max(maxX, vertices[index]);
      striker.setTranslation({ x: -.6 - maxX - .006, y: .5, z: 0 }, true);
      striker.setLinvel({ x: .2, y: 0, z: 0 }, true);
      context.world.propagateModifiedBodyPositionsToColliders();
      const awakened = new Set(); let contactFrames = 0;
      for (let frame = 0; frame < 18; frame++) {
        context.lab.step(1 / 60);
        let touching = false;
        for (const body of settled) {
          if (!resting(body)) awakened.add(body.handle);
          context.world.contactPair(striker.collider(0), body.collider(0), manifold => {
            // ContactDist is a cached manifold distance in Rapier. A real
            // positive solver impulse proves the gentle impact happened.
            for (let index = 0; index < manifold.numContacts(); index++) touching ||= manifold.contactImpulse(index) > 0;
          });
        }
        if (touching) contactFrames++;
      }
      assert.ok(contactFrames > 0, 'The wake case must include an actual close hull contact');
      assert.equal(awakened.size, settled.length, 'Low-speed incoming impact must release the connected pile');
      return { incomingSpeed: .2, contactFrames, awakened: awakened.size };
    } finally { context.dispose(); }
  });

  for (const separation of [
    { name: 'far separation at zero speed', gap: null, frames: 1 },
    { name: 'a 5 cm gap held for a quarter second', gap: .05, frames: 15 },
  ]) await check(`A previous contact wakes after ${separation.name}`, async () => {
    const context = await setup([
      { size: [10, 1, 10], position: [0, .5, 0] },
      { size: [.2, .2, .2], position: [0, 6, 0] },
    ]);
    try {
      assert(await context.tap(.5));
      const base = context.bodies(), handles = new Set(base.map(body => body.handle));
      assert(await context.tap(6));
      const incoming = context.bodies().filter(body => !handles.has(body.handle));
      incoming.forEach((body, index) => {
        body.setGravityScale(0, true); body.setTranslation({ x: index ? 15 : -5.045, y: .5, z: 0 }, true);
        body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
      });
      const striker = incoming[0], target = base.find(body => body.translation().x < 0);
      let loadedAtRest = false, initialSettleFrame = null;
      // A tiny rotating hull can remain in loaded contact while the heavy
      // grounded pieces finish settling. This creates a real persistent-contact
      // latch without reading or mutating the controller's private records.
      for (let frame = 0; frame < 240; frame++) {
        striker.setTranslation({ x: -5.045, y: .5, z: 0 }, true);
        striker.setAngvel({ x: 0, y: 3, z: 0 }, true);
        context.world.propagateModifiedBodyPositionsToColliders();
        context.lab.step(1 / 60);
        let loaded = false;
        context.world.contactPair(striker.collider(0), target.collider(0), manifold => {
          for (let index = 0; index < manifold.numContacts(); index++) loaded ||= manifold.contactImpulse(index) > 0;
        });
        if (base.every(resting) && loaded && !resting(striker)) {
          loadedAtRest = true; initialSettleFrame = frame; break;
        }
      }
      assert.ok(loadedAtRest, 'The incoming fragment must be in a loaded contact as the heavy pile finishes resting');
      striker.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      const vertices = striker.collider(0).shape.vertices;
      let maxX = -Infinity;
      for (let index = 0; index < vertices.length; index += 3) maxX = Math.max(maxX, vertices[index]);
      const placeWithGap = gap => {
        striker.setTranslation({ x: -5 - maxX - gap, y: .5, z: 0 }, true);
        for (let iteration = 0; iteration < 4; iteration++) {
          context.world.propagateModifiedBodyPositionsToColliders();
          const contact = striker.collider(0).contactCollider(target.collider(0), 30);
          assert.ok(contact && contact.normal1.x > .5, 'The controlled side approach must face the heavy target');
          if (Math.abs(contact.distance - gap) < .0001) return contact.distance;
          const position = striker.translation();
          striker.setTranslation({ x: position.x - (gap - contact.distance) / contact.normal1.x, y: .5, z: 0 }, true);
        }
        context.world.propagateModifiedBodyPositionsToColliders();
        return striker.collider(0).contactCollider(target.collider(0), 30)?.distance;
      };
      // Test both a far move outside the broadphase and a smaller sustained
      // separation inside the spatial hysteresis. Neither creates a new force.
      if (separation.gap === null) striker.setTranslation({ x: -20, y: .5, z: 0 }, true);
      else placeWithGap(separation.gap);
      striker.setLinvel({ x: 0, y: 0, z: 0 }, true); striker.setAngvel({ x: 0, y: 0, z: 0 }, true);
      context.world.propagateModifiedBodyPositionsToColliders();
      const actualGap = striker.collider(0).contactCollider(target.collider(0), 30)?.distance;
      if (separation.gap !== null) assert.ok(actualGap > .035 && actualGap < .065, `Expected approximately 5 cm actual hull separation, got ${actualGap}`);
      simulate(context.lab, separation.frames / 60);
      assert.ok(base.every(resting));
      placeWithGap(.006);
      striker.setLinvel({ x: .2, y: 0, z: 0 }, true);
      context.world.propagateModifiedBodyPositionsToColliders();
      let awakened = false, loadedFrames = 0;
      for (let frame = 0; frame < 18; frame++) {
        context.lab.step(1 / 60); awakened ||= !resting(target);
        let loaded = false;
        context.world.contactPair(striker.collider(0), target.collider(0), manifold => {
          for (let index = 0; index < manifold.numContacts(); index++) loaded ||= manifold.contactImpulse(index) > 0;
        });
        if (loaded) loadedFrames++;
      }
      assert.ok(loadedFrames > 0, 'Gentle re-entry must create a real new impact');
      assert.ok(awakened, 'A stale persistent-contact latch must not suppress a new gentle impact after separation');
      return { loadedAtRest, initialSettleFrame, separationGap: actualGap, separationSeconds: separation.frames / 60, incomingSpeed: .2, loadedFrames, awakened };
    } finally { context.dispose(); }
  });

  await check('Removing an intact support immediately releases carried fragments', async () => {
    const context = await setup([
      { size: [1.2, 2, 1.2], position: [0, 1, 0] },
      { size: [1.1, .8, 1.1], position: [0, 2.4, 0] },
    ]);
    try {
      assert(await context.tap(2.4)); simulate(context.lab, 8);
      const carried = context.bodies(); assert.ok(carried.every(resting));
      // No impulse or material/gravity change: the removed support itself must
      // invalidate rest, before newly created fragments have even taken a step.
      assert(await context.tap(1));
      const released = carried.filter(body => body.isDynamic() && !resting(body)).length;
      assert.equal(released, carried.length, 'Breaking an intact support must directly invalidate the rest dependency');
      return { carried: carried.length, immediatelyReleased: released };
    } finally { context.dispose(); }
  });

  await check('Support invalidation propagates through separately settled tiers', async () => {
    const context = await setup([
      { size: [1.2, 2, 1.2], position: [0, 1, 0] },
      { size: [1.1, .8, 1.1], position: [0, 2.4, 0] },
      { size: [1, .6, 1], position: [0, 3.1, 0] },
    ]);
    try {
      assert(await context.tap(2.4)); simulate(context.lab, 8);
      const middle = context.bodies(), middleHandles = new Set(middle.map(body => body.handle));
      assert.ok(middle.every(resting));
      assert(await context.tap(3.1)); simulate(context.lab, 8);
      const carried = context.bodies(), top = carried.filter(body => !middleHandles.has(body.handle));
      assert.equal(middle.length, 2); assert.equal(top.length, 2); assert.ok(carried.every(resting));
      assert(await context.tap(1));
      const middleReleased = middle.filter(body => body.isDynamic() && !resting(body)).length;
      const topReleased = top.filter(body => body.isDynamic() && !resting(body)).length;
      assert.equal(middleReleased, middle.length, 'The directly supported tier must wake immediately');
      assert.equal(topReleased, top.length, 'Upper rest groups must release when their supporting rest group wakes');
      return { middleReleased, topReleased, immediatelyReleased: middleReleased + topReleased };
    } finally { context.dispose(); }
  });

  await check('Side contact with a grounded pile cannot pin an airborne fragment', async () => {
    const context = await setup([
      { size: [10, 1, 10], position: [0, .5, 0] },
      { size: [.2, .2, .2], position: [-5.1, .5, 0] },
    ]);
    try {
      // Low gravity gives this slow fall time to resemble a quiet contact.
      // The small box touches only the vertical side of the grounded block.
      context.lab.update({ gravity: .1 });
      assert(await context.lab.fractureAll());
      const side = context.bodies().filter(body => body.translation().x < -5);
      assert.equal(side.length, 2);
      const initialHeight = new Map(side.map(body => [body.handle, body.translation().y]));
      let lateralContactFrames = 0, floatingRestFrames = 0;
      for (let frame = 0; frame < 120; frame++) {
        context.lab.step(1 / 60);
        let touchingSide = false;
        for (const body of side) {
          if (body.translation().y > .25 && resting(body)) floatingRestFrames++;
          context.world.contactPairsWith(body.collider(0), other => {
            const gap = body.collider(0).contactCollider(other, .006);
            if (gap && Math.abs(gap.normal1.y) < .1) touchingSide = true;
          });
        }
        if (touchingSide) lateralContactFrames++;
      }
      assert.ok(lateralContactFrames > 30, 'The slow airborne pieces must spend time touching the pile side');
      assert.equal(floatingRestFrames, 0, 'Lateral connection to a grounded island is not upward support');
      const maximumFall = Math.max(...side.map(body => initialHeight.get(body.handle) - body.translation().y));
      assert.ok(maximumFall > .01, 'Unsupported side fragments must continue descending');
      return { gravity: .1, lateralContactFrames, floatingRestFrames, maximumFall };
    } finally { context.dispose(); }
  });

  await check('Mass conditioning preserves hulls and centers of mass', async () => {
    const captured = [], nativeSetMass = RAPIER.Collider.prototype.setMassProperties;
    const matrix = body => {
      const inertia = body.effectiveAngularInertia();
      return [inertia.m11, inertia.m12, inertia.m13, inertia.m22, inertia.m23, inertia.m33];
    };
    RAPIER.Collider.prototype.setMassProperties = function (...args) {
      const body = this.parent();
      captured.push({
        body, collider: this, mass: body.mass(), inertia: body.principalInertia(), tensor: matrix(body),
        com: body.localCom(), vertices: Array.from(this.shape.vertices),
        localPosition: this.translationWrtParent(), localRotation: this.rotationWrtParent(),
      });
      return nativeSetMass.apply(this, args);
    };
    let context;
    try {
      context = await setup([
        { size: [.4, .002, .06], position: [-3, .5, 0] },
        { size: [2, 2, 2], position: [3, 1, 0] },
        { geometry: new THREE.ConeGeometry(.8, 1.5, 5), position: [0, 1, 0], rotation: [.2, .4, .1] },
      ]);
      assert(await context.lab.fractureAll());
      assert.equal(captured.length, context.bodies().length, 'Every dynamic hull must apply its mass properties');
      let tinyHulls = 0, unchangedLargeHulls = 0, asymmetricCenters = 0;
      for (const before of captured) {
        const { body, collider } = before, mass = body.mass(), inertia = body.principalInertia(), com = body.localCom();
        assert.ok([mass, inertia.x, inertia.y, inertia.z, com.x, com.y, com.z].every(Number.isFinite));
        assert.ok(mass >= .01 * (1 - 1e-5), 'Tiny clipping slivers must have a finite minimum dynamic mass');
        assert.ok(Math.min(inertia.x, inertia.y, inertia.z) >= mass * .02 ** 2 * (1 - 1e-4), 'Every rotation axis must retain a nonzero inertia floor');
        assert.deepEqual(Array.from(collider.shape.vertices), before.vertices, 'Stabilizing physical properties must not change collision geometry');
        const comError = Math.hypot(com.x - before.com.x, com.y - before.com.y, com.z - before.com.z);
        assert.ok(comError < 1e-6, `Conditioning must retain the local center of mass, error ${comError}`);
        assert.ok(Math.hypot(before.localPosition.x, before.localPosition.y, before.localPosition.z) < 1e-9);
        assert.ok(Math.hypot(before.localRotation.x, before.localRotation.y, before.localRotation.z) < 1e-9 && Math.abs(before.localRotation.w - 1) < 1e-9,
          'The current mass-property transfer relies on an identity collider pose in body coordinates');
        if (Math.hypot(before.com.x, before.com.y, before.com.z) > .01) asymmetricCenters++;
        if (before.mass < .01) tinyHulls++;
        if (before.mass >= .01 && Math.min(before.inertia.x, before.inertia.y, before.inertia.z) > before.mass * .02 ** 2) {
          const afterTensor = matrix(body), scale = Math.max(...before.tensor.map(Math.abs), 1e-9);
          assert.ok(Math.abs(mass - before.mass) <= before.mass * 1e-5);
          assert.ok(afterTensor.every((value, index) => Math.abs(value - before.tensor[index]) <= scale * 1e-4),
            'Well-conditioned hulls must preserve their full world inertia tensor');
          unchangedLargeHulls++;
        }
      }
      assert.ok(tinyHulls >= 2 && unchangedLargeHulls >= 2 && asymmetricCenters >= 1,
        'Fixture must cover tiny fragments, unchanged large fragments, and noncentral asymmetric mass');
      return { hulls: captured.length, tinyHulls, unchangedLargeHulls, asymmetricCenters };
    } finally { context?.dispose(); RAPIER.Collider.prototype.setMassProperties = nativeSetMass; }
  });

  await check('Initially overlapping hulls collide normally after separating and returning', async () => {
    const context = await setup([
      { size: [1.2, 1, 1.2], position: [0, .5, 0] },
      { size: [.8, .8, .8], position: [-.55, .5, 0] },
    ]);
    try {
      // The small source object overlaps an intact source part. Fracture it
      // from the exposed side so the initial intersection is real authored
      // geometry, not a penetration injected later by the test.
      assert(await context.lab.tap(new THREE.Raycaster(new THREE.Vector3(-5, .5, 0), new THREE.Vector3(1, 0, 0))));
      const fragments = context.bodies().sort((a, b) => a.translation().x - b.translation().x);
      assert.equal(fragments.length, 2);
      let intact;
      context.world.forEachRigidBody(body => { if (body.userData?.generation === 0) intact = body; });
      assert.ok(intact);
      fragments.forEach((body, index) => {
        body.setGravityScale(0, true); body.setLinvel({ x: 0, y: 0, z: 0 }, true); body.setAngvel({ x: 0, y: 0, z: 0 }, true);
        if (index) body.setTranslation({ x: 10, y: 5, z: 0 }, true);
      });
      context.world.propagateModifiedBodyPositionsToColliders();
      const striker = fragments[0], initialOverlap = striker.collider(0).contactCollider(intact.collider(0), 0)?.distance;
      assert.ok(initialOverlap < -.002, 'The controlled encounter must begin with a deeply overlapping authored hull');
      const initialPose = pose(striker); simulate(context.lab, .3);
      assert.deepEqual(pose(striker), initialPose, 'Pre-existing overlap must not generate separation kicks before an actual new encounter');

      striker.setTranslation({ x: -2, y: .5, z: 0 }, true);
      context.world.propagateModifiedBodyPositionsToColliders(); context.lab.step(1 / 60);
      const exitGap = striker.collider(0).contactCollider(intact.collider(0), 10)?.distance;
      assert.ok(exitGap > 1, 'The same collider pair must genuinely separate before returning');
      const vertices = striker.collider(0).shape.vertices; let maxX = -Infinity;
      for (let index = 0; index < vertices.length; index += 3) maxX = Math.max(maxX, vertices[index]);
      striker.setTranslation({ x: -.6 - maxX - .006, y: .5, z: 0 }, true);
      striker.setLinvel({ x: .5, y: 0, z: 0 }, true);
      context.world.propagateModifiedBodyPositionsToColliders();
      let loadedFrames = 0, maximumVelocityChange = 0;
      for (let frame = 0; frame < 30; frame++) {
        context.lab.step(1 / 60); maximumVelocityChange = Math.max(maximumVelocityChange, Math.abs(striker.linvel().x - .5));
        let loaded = false;
        context.world.contactPair(striker.collider(0), intact.collider(0), manifold => {
          for (let index = 0; index < manifold.numContacts(); index++) loaded ||= manifold.contactImpulse(index) > 0;
        });
        if (loaded) loadedFrames++;
      }
      assert.ok(loadedFrames > 0, 'Collision impulses must be restored for a formerly overlapping pair after separation');
      assert.ok(maximumVelocityChange > .1, 'The restored collider must physically respond to the new impact');
      return { initialOverlap, exitGap, loadedFrames, maximumVelocityChange };
    } finally { context.dispose(); }
  });

  assert.equal(await hash(), report.sourceHash, 'The entire wake suite must use one runtime revision');
  report.passed = report.cases.every(entry => entry.passed);
  assert.ok(report.passed, 'One or more fracture wake regressions failed');
} finally {
  RAPIER.World.prototype.createRigidBody = nativeCreate;
  outer.dispose(); inner.dispose();
  await fs.mkdir(new URL('../output/fracture-settling/', import.meta.url), { recursive: true });
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`);
}
