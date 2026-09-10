import * as THREE from 'three';
import { prepareFractureGeometry } from './fracture-material.js';
import { encodeGeometry, decodeGeometry, fractureGeometryData } from './fracture-worker.js';

export const FRACTURE_DEFAULTS = {
  method: 'voronoi', fragmentCount: 12, mode: '3D', projectionAxis: 'auto', projectionNormal: [0, 0, 0],
  impactEnabled: true, impactSource: 'tap', impactPoint: [0, 0, 0], impactRadius: 0.65,
  seed: 19423, useApproximation: false, approximationNeighborCount: 12,
  fracturePlanes: { x: true, y: true, z: true }, innerUVScale: [1, 1], innerUVOffset: [0, 0], seedPoints: [],
  sliceNormal: [0, 1, 0], sliceOrigin: [0, 1.4, 0], sliceSpace: 'world',
  impulse: 1.8, gravity: 9.81, friction: 0.65, restitution: 0.18, maxGeneration: 2, maxFragments: 120,
};

const numeric = (value, fallback, min, max) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : fallback));
const choice = (value, values, fallback) => values.includes(value) ? value : fallback;
const vector = (value, fallback, min = -100, max = 100) => fallback.map((v, i) => numeric(value?.[i], v, min, max));

export function sanitizeFractureOptions(input = {}) {
  const d = FRACTURE_DEFAULTS, options = {
    method: choice(input.method, ['voronoi', 'simple', 'slice'], d.method),
    fragmentCount: Math.round(numeric(input.fragmentCount, d.fragmentCount, 2, 48)),
    mode: choice(input.mode, ['3D', '2.5D'], d.mode),
    projectionAxis: choice(input.projectionAxis, ['auto', 'x', 'y', 'z'], d.projectionAxis),
    projectionNormal: vector(input.projectionNormal, d.projectionNormal, -1, 1),
    impactEnabled: input.impactEnabled === undefined ? d.impactEnabled : !!input.impactEnabled,
    impactSource: choice(input.impactSource, ['tap', 'custom'], d.impactSource),
    impactPoint: vector(input.impactPoint, d.impactPoint),
    impactRadius: numeric(input.impactRadius, d.impactRadius, 0.05, 5),
    seed: Math.round(numeric(input.seed, d.seed, 0, 4294967295)),
    useApproximation: input.useApproximation === undefined ? d.useApproximation : !!input.useApproximation,
    approximationNeighborCount: Math.round(numeric(input.approximationNeighborCount, d.approximationNeighborCount, 4, 48)),
    fracturePlanes: Object.fromEntries(['x', 'y', 'z'].map(axis => [axis, input.fracturePlanes?.[axis] === undefined ? true : !!input.fracturePlanes[axis]])),
    innerUVScale: vector(input.innerUVScale, d.innerUVScale, 0.01, 20),
    innerUVOffset: vector(input.innerUVOffset, d.innerUVOffset, -20, 20),
    seedPoints: Array.isArray(input.seedPoints) ? input.seedPoints.slice(0, 48).filter(point => Array.isArray(point) && point.length >= 3 && point.slice(0, 3).every(v => Number.isFinite(Number(v)))).map(point => vector(point, [0, 0, 0])) : [],
    sliceNormal: vector(input.sliceNormal, d.sliceNormal, -1, 1),
    sliceOrigin: vector(input.sliceOrigin, d.sliceOrigin),
    sliceSpace: choice(input.sliceSpace, ['local', 'world'], d.sliceSpace),
    impulse: numeric(input.impulse, d.impulse, 0, 8), gravity: numeric(input.gravity, d.gravity, 0, 30),
    friction: numeric(input.friction, d.friction, 0, 2), restitution: numeric(input.restitution, d.restitution, 0, 1),
    maxGeneration: Math.round(numeric(input.maxGeneration, d.maxGeneration, 1, 4)),
    maxFragments: Math.round(numeric(input.maxFragments, d.maxFragments, 16, 160)),
  };
  if (new THREE.Vector3(...options.sliceNormal).lengthSq() < 1e-8) options.sliceNormal = [0, 1, 0];
  else options.sliceNormal = new THREE.Vector3(...options.sliceNormal).normalize().toArray();
  return options;
}

let rapierReady, RAPIER;
const initializeRapier = () => rapierReady ||= import('@dimforge/rapier3d-compat').then(async module => {
  RAPIER = module.default ?? module;
  await RAPIER.init();
  return RAPIER;
});
const triangleCount = geometry => (geometry.index?.count || geometry.attributes.position.count) / 3;

/** Independent, disposable destruction preview. Source meshes remain untouched. */
export async function createFractureLab({ scene, outerMaterial, innerMaterial, getMaterials, onChange = () => {}, onMessage = () => {}, onEvent = () => {} }) {
  await initializeRapier();
  const container = new THREE.Group(); container.name = 'Rock Lab destruction'; scene.add(container);
  const world = new RAPIER.World({ x: 0, y: -FRACTURE_DEFAULTS.gravity, z: 0 });
  world.timestep = 1 / 60;
  const eventQueue = new RAPIER.EventQueue(true);
  const floor = world.createCollider(RAPIER.ColliderDesc.cuboid(30, 0.1, 30).setTranslation(0, -0.1, 0).setFriction(0.65).setRestitution(0.18));
  const records = new Map();
  const colliderRecords = new Map(), incomingMotion = new Map(), pendingImpacts = new Map(), collisionCooldown = new Map();
  const collisionDispatches = [];
  let simulationTime = 0;
  let options = sanitizeFractureOptions(), sourceRoot = null, sourceVisible = true, sourcePieces = 0;
  let enabled = false, paused = false, busy = false, disposed = false, accumulator = 0, revision = 0;
  let lastFractureMs = 0, failures = 0, message = 'Enable destruction, then tap a piece.', worker = null, workerRequest = null, requestId = 0;

  const getStats = () => ({
    enabled, paused, busy, meshes: records.size,
    fragments: [...records.values()].filter(record => record.generation > 0).length,
    sleeping: [...records.values()].filter(record => record.generation > 0 && record.body.isSleeping()).length,
    resting: [...records.values()].filter(record => record.generation > 0 && (record.restGroup || record.body.isSleeping())).length,
    active: [...records.values()].filter(record => record.generation > 0 && !record.restGroup && !record.body.isSleeping()).length,
    generation: Math.max(0, ...[...records.values()].map(record => record.generation)),
    lastFractureMs: Math.round(lastFractureMs * 10) / 10, failures, message,
    triangles: [...records.values()].reduce((sum, record) => sum + triangleCount(record.mesh.geometry), 0),
    sourcePieces, worker: typeof Worker !== 'undefined',
  });
  const notify = () => onChange(getStats());
  const say = text => { message = text; onMessage(text); notify(); };
  const emitEvent = event => {
    // Audio and other observers must never turn a completed geometry/physics
    // transaction into a reported fracture failure.
    try { onEvent(event); } catch (error) { console.warn('Fracture event listener failed:', error); }
  };
  const sourceSlot = mesh => mesh.userData.materialSlot || 'primary';
  const resolveMaterials = mesh => {
    const selected = getMaterials?.(mesh) || {};
    const outer = selected.outerMaterial ?? outerMaterial;
    const inner = selected.innerMaterial ?? innerMaterial ?? outer;
    if (!outer?.isMaterial || !inner?.isMaterial) throw new TypeError('Each fracture part needs valid outer and inner materials.');
    return { outerMaterial: outer, innerMaterial: inner };
  };
  const clearContactEvents = () => {
    eventQueue.clear(); incomingMotion.clear(); pendingImpacts.clear(); collisionCooldown.clear(); collisionDispatches.length = 0; simulationTime = 0;
  };
  const cancelJob = () => {
    revision++; busy = false; accumulator = 0;
    clearContactEvents();
    if (workerRequest) { clearTimeout(workerRequest.timeout); workerRequest.reject(new Error('Fracture preview changed.')); workerRequest = null; }
    if (worker) { worker.terminate(); worker = null; }
  };
  const removeRecord = record => {
    wakeRestGroup(record);
    colliderRecords.delete(record.collider.handle); incomingMotion.delete(record.collider.handle);
    pendingImpacts.delete(record.mesh.uuid); collisionCooldown.delete(record.mesh.uuid);
    if (record.body?.isValid()) world.removeRigidBody(record.body);
    record.mesh.removeFromParent(); record.mesh.geometry.dispose(); records.delete(record.mesh.uuid);
  };
  const clear = () => { for (const record of [...records.values()]) removeRecord(record); accumulator = 0; clearContactEvents(); };
  const registerRecord = record => {
    records.set(record.mesh.uuid, record); colliderRecords.set(record.collider.handle, record);
    record.createdAt = simulationTime;
    record.mesh.geometry.computeBoundingSphere();
    record.contactRadius = record.mesh.geometry.boundingSphere.radius;
    record.hullVertices = record.collider.shape.vertices;
    record.wakeRadius = record.contactRadius + record.mesh.geometry.boundingSphere.center.length();
    record.restTime = 0;
    record.restGroup = null;
    record.body.userData = { pieceId: record.mesh.uuid, generation: record.generation, resting: false };
    record.restPosition = new THREE.Vector3();
    record.restRotation = new THREE.Quaternion();
    container.add(record.mesh);
  };
  const makeBody = (mesh, dynamic) => {
    const vertices = mesh.geometry.attributes.position.array;
    const descriptor = RAPIER.ColliderDesc.convexHull(vertices);
    if (!descriptor) throw new Error('A fragment did not form a solid physics hull. The previous piece was retained.');
    // Rest groups own sleep and wake together; native sleep can otherwise
    // deactivate just one member while its supporting contacts still move.
    const bodyDescriptor = dynamic ? RAPIER.RigidBodyDesc.dynamic().setCanSleep(false).setCcdEnabled(true).setLinearDamping(0.18).setAngularDamping(0.3) : RAPIER.RigidBodyDesc.fixed();
    bodyDescriptor.setTranslation(mesh.position.x, mesh.position.y, mesh.position.z).setRotation(mesh.quaternion);
    const body = world.createRigidBody(bodyDescriptor);
    try {
      if (dynamic) descriptor.setActiveEvents(RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS).setContactForceEventThreshold(0);
      const collider = world.createCollider(descriptor.setFriction(options.friction).setRestitution(options.restitution).setDensity(1), body);
      return { body, collider };
    } catch (error) { world.removeRigidBody(body); throw error; }
  };

  function cloneSources() {
    if (!sourceRoot) return;
    sourceRoot.updateWorldMatrix(true, true);
    const candidates = [];
    try {
      sourceRoot.traverse(original => {
        if (!original.isMesh || !original.geometry?.attributes.position) return;
        const materials = resolveMaterials(original), materialSlot = sourceSlot(original);
        const geometry = original.geometry.clone();
        // Lock the material's object coordinates before physics recenters and
        // moves the render mesh. This keeps every exterior pattern attached.
        if (!geometry.hasAttribute('aRockPosition')) {
          const p = geometry.attributes.position, pattern = new Float32Array(p.count * 4);
          for (let i = 0; i < p.count; i++) { pattern[i * 4] = p.getX(i); pattern[i * 4 + 1] = p.getY(i); pattern[i * 4 + 2] = p.getZ(i); pattern[i * 4 + 3] = 1; }
          geometry.setAttribute('aRockPosition', new THREE.BufferAttribute(pattern, 4));
        }
        geometry.applyMatrix4(original.matrixWorld); geometry.computeBoundingBox();
        const center = geometry.boundingBox.getCenter(new THREE.Vector3()); geometry.translate(-center.x, -center.y, -center.z);
        const mesh = new THREE.Mesh(geometry, materials.outerMaterial); mesh.position.copy(center);
        mesh.userData.generation = 0;
        mesh.userData.materialSlot = materialSlot;
        mesh.castShadow = true; mesh.receiveShadow = true; mesh.name = `${original.name || 'Rock'} intact`;
        let physics;
        try { physics = makeBody(mesh, false); } catch (error) { geometry.dispose(); throw error; }
        candidates.push({ mesh, ...physics, generation: 0, materials, materialSlot, sourceMesh: original, patternMatrix: original.matrixWorld.clone().invert(), originalMatrix: original.matrixWorld.clone() });
      });
      if (!candidates.length) throw new Error('No solid mesh is available to fracture.');
      for (const record of candidates) registerRecord(record);
      sourcePieces = candidates.length; sourceRoot.visible = false;
      container.updateMatrixWorld(true);
    } catch (error) {
      for (const record of candidates) { if (record.body.isValid()) world.removeRigidBody(record.body); record.mesh.geometry.dispose(); }
      throw error;
    }
  }

  const runJob = payload => {
    if (typeof Worker === 'undefined') return Promise.resolve().then(() => fractureGeometryData(payload));
    if (!worker) {
      worker = new Worker(new URL('./fracture-worker.js', import.meta.url), { type: 'module' });
      worker.onmessage = ({ data }) => {
        if (!workerRequest || data.id !== workerRequest.id) return;
        const request = workerRequest; workerRequest = null; clearTimeout(request.timeout);
        if (data.error) request.reject(new Error(data.error)); else request.resolve(data.result);
      };
      worker.onerror = event => {
        if (workerRequest) { clearTimeout(workerRequest.timeout); workerRequest.reject(new Error(event.message || 'Fracture worker failed.')); workerRequest = null; }
        worker?.terminate(); worker = null;
      };
    }
    return new Promise((resolve, reject) => {
      const id = ++requestId;
      const timeout = setTimeout(() => {
        worker?.terminate(); worker = null; workerRequest = null;
        reject(new Error('Fracture exceeded the 15 second compute limit. Lower fragment count or geometry displacement. The original piece is retained.'));
      }, 15000);
      workerRequest = { id, resolve, reject, timeout };
      const transfers = Object.values(payload.geometry.attributes).map(attribute => attribute.array.buffer);
      if (payload.geometry.index) transfers.push(payload.geometry.index.buffer);
      worker.postMessage({ id, payload }, transfers);
    });
  };

  async function breakRecord(record, hit, requestedCount, operationRevision) {
    if (!records.has(record.mesh.uuid) || record.generation >= options.maxGeneration) return 0;
    const available = options.maxFragments - records.size + 1;
    if (available < 2) throw new Error(`The ${options.maxFragments}-piece budget is full. Reset or increase the body limit.`);
    const mesh = record.mesh;
    mesh.updateWorldMatrix(true, false);
    const reference = mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);
    reference.computeBoundingBox();
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
    const localToWorldPoint = values => new THREE.Vector3(...values).applyMatrix4(mesh.matrixWorld).toArray();
    const localToWorldDirection = values => new THREE.Vector3(...values).applyMatrix3(normalMatrix).normalize().toArray();
    const jobOptions = sanitizeFractureOptions({ ...options, fragmentCount: Math.min(requestedCount, available) });
    if (jobOptions.method === 'simple' && !Object.values(jobOptions.fracturePlanes).some(Boolean)) { reference.dispose(); throw new Error('Enable at least one simple fracture axis.'); }
    if (jobOptions.seedPoints.length === 1) { reference.dispose(); throw new Error('Custom Voronoi patterns need at least two seed points.'); }
    if (jobOptions.seedPoints.length > available) { reference.dispose(); throw new Error('The custom seed pattern exceeds the remaining fragment budget.'); }
    jobOptions.seedPoints = jobOptions.seedPoints.map(localToWorldPoint);
    if (jobOptions.projectionNormal.some(value => Math.abs(value) > 1e-8)) jobOptions.projectionNormal = localToWorldDirection(jobOptions.projectionNormal);
    if (jobOptions.sliceSpace === 'local') {
      jobOptions.sliceOrigin = localToWorldPoint(jobOptions.sliceOrigin); jobOptions.sliceNormal = localToWorldDirection(jobOptions.sliceNormal);
    }
    const center = reference.boundingBox.getCenter(new THREE.Vector3());
    const impact = jobOptions.impactSource === 'custom' ? new THREE.Vector3(...localToWorldPoint(jobOptions.impactPoint)) : hit?.point?.clone() || center;
    const started = performance.now();
    const staged = [];
    try {
      const result = await runJob({ geometry: encodeGeometry(reference), options: jobOptions, impactPoint: impact.toArray() });
      if (operationRevision !== revision || !enabled || disposed) return 0;
      lastFractureMs = performance.now() - started;
      if (result.fragments.length < 2) {
        const error = new Error(jobOptions.method === 'slice' ? 'The slice plane missed this piece. Move its origin through the mesh.' : 'This pattern produced fewer than two solid fragments. Try another seed or a wider impact radius.');
        if (jobOptions.method === 'slice') error.code = 'SLICE_MISSED';
        throw error;
      }
      if (result.fragments.length > available) throw new Error(`The result needs ${result.fragments.length} pieces, exceeding the remaining budget. The source piece was retained.`);
      const totalTriangles = result.fragments.reduce((sum, fragment) => sum + (fragment.geometry.index?.length || fragment.geometry.attributes.position.array.length / 3) / 3, 0);
      if (totalTriangles > 100000) throw new Error('This result exceeds 100,000 triangles. Reduce shape detail or fracture count. The source piece was retained.');
      for (const [index, fragment] of result.fragments.entries()) {
        const geometry = decodeGeometry(fragment.geometry);
        const next = new THREE.Mesh(geometry, [record.materials.outerMaterial, record.materials.innerMaterial]);
        next.userData.generation = record.generation + 1;
        next.userData.materialSlot = record.materialSlot;
        next.position.fromArray(fragment.position); next.castShadow = true; next.receiveShadow = true;
        next.name = `Fragment ${record.generation + 1}.${index + 1}`;
        let physics;
        try {
          prepareFractureGeometry(geometry, reference, { positionOffset: next.position, patternMatrix: record.patternMatrix });
          geometry.computeBoundingBox(); geometry.computeBoundingSphere();
          physics = makeBody(next, true);
        } catch (error) { geometry.dispose(); throw error; }
        staged.push({ mesh: next, ...physics, generation: record.generation + 1, materials: record.materials, materialSlot: record.materialSlot, sourceMesh: record.sourceMesh, patternMatrix: record.patternMatrix.clone() });
      }
      // Keep the original body and mesh alive until every fragment has valid
      // render attributes and a collider. Failed work never partly removes it.
      const velocity = record.body.linvel(), angularVelocity = record.body.angvel();
      removeRecord(record);
      for (const [index, next] of staged.entries()) {
        registerRecord(next);
        next.body.setLinvel(velocity, true); next.body.setAngvel(angularVelocity, true);
        const direction = next.mesh.position.clone().sub(impact);
        if (direction.lengthSq() < 1e-6) direction.set(Math.sin(index * 4.1), 0.7, Math.cos(index * 3.7));
        direction.normalize().addScaledVector(hit?.direction || new THREE.Vector3(), 0.35); direction.y += 0.42; direction.normalize();
        // The blast setting describes a launch speed. A minimum impulse made
        // tiny shards accelerate hundreds of times faster than larger pieces.
        const impulse = direction.multiplyScalar(options.impulse * next.body.mass());
        next.body.applyImpulse(impulse, true);
        // Add a bounded tumble instead of mass-scaled torque, whose inverse
        // inertia response becomes extreme on very small or thin fragments.
        const spin = options.impulse * 0.6;
        next.body.setAngvel({
          x: angularVelocity.x + Math.sin(index * 7.1 + options.seed) * spin,
          y: angularVelocity.y + Math.cos(index * 3.1) * spin,
          z: angularVelocity.z + Math.sin(index * 5.7) * spin,
        }, true);
      }
      container.updateMatrixWorld(true);
      emitEvent({ type: 'break', pieceId: mesh.uuid, materialSlot: record.materialSlot, position: { x: impact.x, y: impact.y, z: impact.z }, fragmentCount: staged.length });
      return staged.length;
    } catch (error) {
      for (const next of staged) {
        if (!records.has(next.mesh.uuid)) { if (next.body.isValid()) world.removeRigidBody(next.body); next.mesh.geometry.dispose(); }
      }
      throw error;
    } finally { reference.dispose(); }
  }

  const operation = async task => {
    if (!enabled || busy || disposed) return false;
    busy = true; accumulator = 0; const operationRevision = revision; notify();
    try {
      const count = await task(operationRevision);
      if (operationRevision === revision) say(count ? `Created ${count} solid fragments. Tap a fragment to break it again.` : 'No eligible piece was hit.');
      return !!count;
    } catch (error) {
      if (operationRevision === revision) { failures++; say(error.message || 'Fracture failed; the source piece was retained.'); }
      return false;
    } finally { if (operationRevision === revision) { busy = false; accumulator = 0; notify(); } }
  };

  function rememberIncomingMotion() {
    incomingMotion.clear();
    for (const record of records.values()) {
      if (record.generation === 0 || record.body.isSleeping()) continue;
      const velocity = record.body.linvel(), angular = record.body.angvel();
      incomingMotion.set(record.collider.handle, { velocity, angularSpeed: Math.hypot(angular.x, angular.y, angular.z), mass: Math.max(0.002, record.body.mass()) });
    }
  }

  function collectContactEvents() {
    eventQueue.drainContactForceEvents(event => {
      const first = colliderRecords.get(event.collider1()), second = colliderRecords.get(event.collider2());
      const firstDynamic = first?.generation > 0, secondDynamic = second?.generation > 0;
      if (!firstDynamic && !secondDynamic) return;
      const a = incomingMotion.get(event.collider1()), b = incomingMotion.get(event.collider2());
      if (!a && !b) return;
      const record = firstDynamic && (!secondDynamic || (a?.mass || 0) >= (b?.mass || 0)) ? first : second;
      // Fresh adjacent cut faces may need a few solver frames to separate.
      // This settling is part of the break sound, not a new debris impact.
      if (simulationTime - record.createdAt < 0.09) return;
      const direction = event.maxForceDirection();
      const relativeX = (a?.velocity.x || 0) - (b?.velocity.x || 0);
      const relativeY = (a?.velocity.y || 0) - (b?.velocity.y || 0);
      const relativeZ = (a?.velocity.z || 0) - (b?.velocity.z || 0);
      const normalSpeed = Math.abs(relativeX * direction.x + relativeY * direction.y + relativeZ * direction.z);
      const angularSpeed = (a?.angularSpeed || 0) * (first?.contactRadius || 0) + (b?.angularSpeed || 0) * (second?.contactRadius || 0);
      const approachSpeed = normalSpeed + angularSpeed * 0.2;
      const effectiveMass = a && b ? a.mass * b.mass / (a.mass + b.mass) : (a?.mass || b?.mass || 1);
      const impulseSpeed = event.totalForceMagnitude() * world.timestep / effectiveMass;
      // Both motion and a real solver impulse are required. A resting body's
      // weight produces force events too, but must never chatter continuously.
      if (!Number.isFinite(approachSpeed + impulseSpeed) || approachSpeed < 0.45 || impulseSpeed < 0.28) return;
      const strength = Math.min(1, Math.pow(Math.max(0, Math.min(approachSpeed, impulseSpeed * 1.5) - 0.3) / 5, 0.65));
      if (strength < 0.035) return;
      const previous = pendingImpacts.get(record.mesh.uuid);
      if (!previous || previous.strength < strength) pendingImpacts.set(record.mesh.uuid, { record, strength });
    });
  }

  function dispatchContactEvents() {
    while (collisionDispatches.length && simulationTime - collisionDispatches[0] >= 0.18) collisionDispatches.shift();
    const impacts = [...pendingImpacts.values()].sort((a, b) => b.strength - a.strength);
    pendingImpacts.clear();
    let dispatched = 0;
    for (const { record, strength } of impacts) {
      if (dispatched >= 2 || collisionDispatches.length >= 3) break;
      if (!records.has(record.mesh.uuid) || simulationTime - (collisionCooldown.get(record.mesh.uuid) ?? -Infinity) < 0.22) continue;
      const position = record.body.translation();
      collisionCooldown.set(record.mesh.uuid, simulationTime); collisionDispatches.push(simulationTime); dispatched++;
      emitEvent({ type: 'collision', pieceId: record.mesh.uuid, materialSlot: record.materialSlot, position: { x: position.x, y: position.y, z: position.z }, strength });
    }
  }

  function wakeRestGroup(record) {
    if (!record.restGroup) return;
    for (const member of record.restGroup) {
      member.restGroup = null; member.restTime = 0;
      member.body.userData.resting = false;
      member.body.setBodyType(RAPIER.RigidBodyType.Dynamic, true);
      member.body.setLinearDamping(0.18); member.body.setAngularDamping(0.3);
    }
  }

  function wakeNearbyResting(dt) {
    const resting = [...records.values()].filter(record => record.restGroup);
    if (!resting.length) return;
    const targets = resting.map(record => ({ record, position: record.body.translation() }));
    for (const record of records.values()) {
      if (record.generation === 0 || record.restGroup || record.body.isSleeping()) continue;
      const velocity = record.body.linvel(), angular = record.body.angvel();
      const speed = Math.hypot(velocity.x, velocity.y, velocity.z) + Math.hypot(angular.x, angular.y, angular.z) * record.wakeRadius;
      if (speed < 0.05 && simulationTime - record.createdAt > 0.35) continue;
      const position = record.body.translation();
      for (const target of targets) {
        if (!target.record.restGroup) continue;
        const reach = record.wakeRadius + target.record.wakeRadius + speed * dt + 0.04;
        const dx = position.x - target.position.x, dy = position.y - target.position.y, dz = position.z - target.position.z;
        if (dx * dx + dy * dy + dz * dz <= reach * reach) wakeRestGroup(target.record);
      }
    }
  }

  function settleRestingContacts(dt) {
    const dynamic = [...records.values()].filter(record => record.generation > 0 && !record.restGroup);
    for (const record of dynamic) if (!record.body.isSleeping()) {
      record.body.setAngularDamping(0.3); record.body.setLinearDamping(0.18);
    }
    // Free flight and deliberately slippery surfaces keep Rapier's ordinary
    // behavior. This assistance only handles the last small contact tremor.
    if (options.gravity <= 0 || options.friction < 0.1) {
      for (const record of dynamic) record.restTime = 0;
      return;
    }
    if (!dynamic.some(record => !record.body.isSleeping())) {
      for (const record of dynamic) record.restTime = 0;
      return;
    }

    const graph = new Map(dynamic.map(record => [record, { neighbors: new Set(), restGroups: new Set(), supported: false }]));
    for (const record of dynamic) {
      const node = graph.get(record), neighbors = [];
      world.contactPairsWith(record.collider, other => neighbors.push(other));
      for (const other of neighbors) {
        const neighbor = colliderRecords.get(other.handle);
        world.contactPair(record.collider, other, (manifold, flipped) => {
          let touching = false;
          for (let i = 0; i < manifold.numContacts(); i++) {
            const distance = manifold.contactDist(i);
            // Predictive contacts can exist centimetres apart. Require a real
            // loaded contact within Rapier's 5 mm tolerance plus 1 mm margin.
            if (distance <= 0.006 && manifold.contactImpulse(i) > 0) touching = true;
          }
          if (!touching) return;
          if (graph.has(neighbor)) node.neighbors.add(neighbor);
          else {
            if (neighbor?.restGroup) node.restGroups.add(neighbor.restGroup);
            if (manifold.normal().y * (flipped ? 1 : -1) > 0.25 && manifold.friction() >= 0.1) node.supported = true;
          }
        });
      }
    }

    // Quiet a supported contact group together. A still piece beside a moving
    // one must remain responsive; touching airborne pieces have no anchor.
    const visited = new Set();
    for (const first of dynamic) {
      if (visited.has(first)) continue;
      const group = [], queue = [first], restingNeighbors = new Set(); let supported = false;
      while (queue.length) {
        const record = queue.pop(); if (visited.has(record)) continue;
        visited.add(record); group.push(record);
        const node = graph.get(record); supported ||= node.supported;
        for (const restGroup of node.restGroups) restingNeighbors.add(restGroup);
        for (const neighbor of node.neighbors) if (!visited.has(neighbor)) queue.push(neighbor);
      }
      let ready = supported;
      for (const record of group) {
        if (record.body.isSleeping()) { record.restTime = 0; continue; }
        const velocity = record.body.linvel(), angular = record.body.angvel();
        const position = record.body.translation(), rotation = record.body.rotation();
        const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
        const surfaceSpeed = Math.hypot(angular.x, angular.y, angular.z) * record.contactRadius;
        // Contact resistance damps the last rocking motion of curved shards.
        // Normal damping returns as soon as a piece leaves support or speeds up.
        if (supported && speed < 0.25 && simulationTime - record.createdAt >= 0.35) {
          record.body.setAngularDamping(18); record.body.setLinearDamping(0.8);
        }
        if (!supported || speed > 0.25 || surfaceSpeed > 0.65 || simulationTime - record.createdAt < 0.35) {
          record.restTime = 0; ready = false; continue;
        }
        const dot = Math.abs(record.restRotation.x * rotation.x + record.restRotation.y * rotation.y + record.restRotation.z * rotation.z + record.restRotation.w * rotation.w);
        const norm = record.restRotation.length() * Math.hypot(rotation.x, rotation.y, rotation.z, rotation.w);
        const turn = 2 * Math.sqrt(Math.max(0, 1 - Math.min(1, dot / norm) ** 2)) * record.contactRadius;
        const travel = Math.hypot(position.x - record.restPosition.x, position.y - record.restPosition.y, position.z - record.restPosition.z) + turn;
        const envelope = Math.min(0.04, Math.max(0.004, record.contactRadius * 0.06));
        if (record.restTime === 0 || travel > envelope) {
          record.restPosition.set(position.x, position.y, position.z);
          record.restRotation.set(rotation.x, rotation.y, rotation.z, rotation.w);
          record.restTime = dt;
        } else record.restTime += dt;
        if (record.restTime < 0.65) ready = false;
      }
      if (ready) {
        const restGroup = new Set(group);
        for (const neighbors of restingNeighbors) for (const record of neighbors) {
          for (const member of record.restGroup || [record]) restGroup.add(member);
        }
        // Hold the settled pose with a fixed body. Wake the connected group
        // before an approaching fragment collides, or when a member is cut.
        // This avoids Rapier's unreliable manual-sleep transition on debris.
        for (const record of restGroup) {
          // Convex approximations can remain interlocked after their motion
          // stops. Qualify by stable poses instead of requiring zero overlap,
          // but never preserve a pose that leaves a shard below the floor.
          const p = record.body.translation(), q = record.body.rotation();
          const rowX = 2 * (q.x * q.y + q.w * q.z), rowY = 1 - 2 * (q.x * q.x + q.z * q.z), rowZ = 2 * (q.y * q.z - q.w * q.x);
          let minimumY = Infinity;
          for (let i = 0; i < record.hullVertices.length; i += 3) {
            minimumY = Math.min(minimumY, p.y + rowX * record.hullVertices[i] + rowY * record.hullVertices[i + 1] + rowZ * record.hullVertices[i + 2]);
          }
          if (minimumY < -0.002) record.body.setTranslation({ x: p.x, y: p.y - minimumY - 0.002, z: p.z }, false);
          record.body.setBodyType(RAPIER.RigidBodyType.Fixed, false);
          record.restGroup = restGroup; record.restTime = 0;
          record.body.userData.resting = true;
        }
      }
    }
  }

  const controller = {
    setSource(root) {
      if (disposed) return;
      cancelJob(); clear();
      if (sourceRoot) sourceRoot.visible = sourceVisible;
      sourceRoot = root; sourceVisible = root?.visible ?? true; sourcePieces = 0;
      if (enabled && root) {
        try { cloneSources(); say('Fresh asset ready. Tap a piece to fracture it.'); }
        catch (error) { enabled = false; sourceRoot.visible = sourceVisible; failures++; say(error.message); }
      }
      notify();
    },
    // Shared material uniforms/colors update existing pieces immediately. Call
    // this only when replacing material objects or reassigning source slots.
    // Resolve every pair first so a failed callback never partly rebinds debris.
    refreshMaterials() {
      if (disposed) return false;
      const pairs = new Map();
      try {
        for (const record of records.values()) if (!pairs.has(record.sourceMesh)) pairs.set(record.sourceMesh, resolveMaterials(record.sourceMesh));
      } catch (error) { failures++; say(error.message || 'Part material update failed. Existing materials were retained.'); return false; }
      for (const record of records.values()) {
        record.materials = pairs.get(record.sourceMesh); record.materialSlot = sourceSlot(record.sourceMesh);
        record.mesh.userData.materialSlot = record.materialSlot;
        record.mesh.material = record.generation === 0 ? record.materials.outerMaterial : [record.materials.outerMaterial, record.materials.innerMaterial];
      }
      notify(); return true;
    },
    update(next) {
      const previous = options;
      options = sanitizeFractureOptions({ ...options, ...next });
      if (['gravity', 'friction', 'restitution'].some(key => options[key] !== previous[key])) {
        for (const record of records.values()) wakeRestGroup(record);
      }
      world.gravity = { x: 0, y: -options.gravity, z: 0 };
      floor.setFriction(options.friction); floor.setRestitution(options.restitution);
      for (const record of records.values()) { record.collider.setFriction(options.friction); record.collider.setRestitution(options.restitution); }
      notify(); return options;
    },
    setEnabled(value) {
      if (disposed || enabled === !!value) return enabled;
      cancelJob(); clear(); enabled = !!value;
      if (enabled) {
        try { cloneSources(); say('Tap a piece to fracture it.'); }
        catch (error) { enabled = false; failures++; if (sourceRoot) sourceRoot.visible = sourceVisible; say(error.message); }
      } else { if (sourceRoot) sourceRoot.visible = sourceVisible; say('Destruction preview disabled.'); }
      notify(); return enabled;
    },
    tap(raycaster) {
      if (!enabled || busy) return Promise.resolve(false);
      container.updateMatrixWorld(true);
      const hit = raycaster.intersectObjects([...records.values()].map(record => record.mesh), false)[0];
      if (!hit) return Promise.resolve(false);
      const record = records.get(hit.object.uuid);
      if (record.generation >= options.maxGeneration) { say(`This piece reached generation ${options.maxGeneration}. Increase the limit or reset.`); return Promise.resolve(false); }
      return operation(rev => breakRecord(record, { point: hit.point, direction: raycaster.ray.direction.clone() }, options.fragmentCount, rev));
    },
    fractureAll() {
      return operation(async rev => {
        const targets = [...records.values()].filter(record => record.generation < options.maxGeneration);
        if (!targets.length) throw new Error('All pieces reached the generation limit. Reset or increase it.');
        const headroom = options.maxFragments - records.size;
        const perPiece = options.method === 'slice' ? 2 : Math.min(options.fragmentCount, Math.floor(headroom / targets.length) + 1);
        if (perPiece < 2) throw new Error('There is no room to fracture every piece. Raise the body limit or tap one piece.');
        let count = 0, missedSlices = 0;
        for (const record of targets) {
          if (rev !== revision) break;
          try { count += await breakRecord(record, null, perPiece, rev); }
          catch (error) {
            if (error.code === 'SLICE_MISSED') missedSlices++;
            else throw error;
          }
          notify();
          // Give controls, rendering, and cancellation an opportunity between
          // independent pieces even when a worker answers very quickly.
          await new Promise(resolve => setTimeout(resolve, 0));
        }
        if (!count && missedSlices && rev === revision) throw new Error('The slice plane missed every eligible piece. Move its origin through the assembly.');
        return count;
      });
    },
    reset() {
      if (disposed) return;
      cancelJob(); clear(); lastFractureMs = 0;
      if (enabled) {
        try { cloneSources(); say('Original assembly restored. Tap a piece to fracture it.'); }
        catch (error) { enabled = false; if (sourceRoot) sourceRoot.visible = sourceVisible; failures++; say(error.message); }
      }
      notify();
    },
    step(dt) {
      if (!enabled || paused || busy || disposed) { accumulator = 0; return; }
      accumulator += Math.min(0.1, Math.max(0, Number(dt) || 0));
      for (let count = 0; accumulator >= 1 / 60 && count < 6; count++) {
        wakeNearbyResting(1 / 60);
        rememberIncomingMotion(); world.step(eventQueue); simulationTime += 1 / 60; collectContactEvents(); settleRestingContacts(1 / 60); accumulator -= 1 / 60;
      }
      for (const record of [...records.values()]) {
        if (record.generation === 0) continue;
        const position = record.body.translation(), rotation = record.body.rotation();
        if (!Number.isFinite(position.x + position.y + position.z) || position.y < -8 || Math.hypot(position.x, position.z) > 28) { removeRecord(record); continue; }
        record.mesh.position.set(position.x, position.y, position.z); record.mesh.quaternion.set(rotation.x, rotation.y, rotation.z, rotation.w);
      }
      container.updateMatrixWorld(true);
      dispatchContactEvents();
    },
    setPaused(value) { paused = !!value; accumulator = 0; notify(); },
    getStats,
    getMeshes: () => [...records.values()].map(record => record.mesh),
    dispose() {
      if (disposed) return;
      cancelJob(); clear(); if (sourceRoot) sourceRoot.visible = sourceVisible;
      container.removeFromParent(); eventQueue.free(); world.free(); disposed = true; enabled = false;
    },
  };
  notify(); return controller;
}
