import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import * as THREE from 'three';
import { createFractureLab } from '../src/fracture.js';

/** Real fracture/physics integration for composite parts with shared materials. */
export async function verifyFractureMaterials() {
  const scene = new THREE.Scene(), source = new THREE.Group(), events = [], owned = [];
  const material = color => { const result = new THREE.MeshStandardMaterial({ color }); owned.push(result); return result; };
  const pairs = {
    primary: { outerMaterial: material('#63788c'), innerMaterial: material('#b4c0c8') },
    handle: { outerMaterial: material('#8f5c27'), innerMaterial: material('#e8bc74') },
    trim: { outerMaterial: material('#b69242'), innerMaterial: material('#665126') },
  };
  let failSlot = null, disposedMaterials = 0;
  const callbackMeshes = new Set();
  for (const [index, slot] of ['primary', 'handle', 'trim'].entries()) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(.85, 1.1, .8), pairs[slot].outerMaterial);
    mesh.position.set((index - 1) * 1.4, 2, 0); mesh.name = `${slot} source`; mesh.userData.materialSlot = slot;
    source.add(mesh);
  }
  scene.add(source);
  const lab = await createFractureLab({
    scene, ...pairs.primary,
    getMaterials(mesh) {
      assert.ok(source.children.includes(mesh), 'Resolver always receives the original source part, including on refresh');
      callbackMeshes.add(mesh);
      if (mesh.userData.materialSlot === failSlot) throw new Error('Test material resolver failure');
      return pairs[mesh.userData.materialSlot];
    },
    onEvent: event => events.push(event),
  });
  const validate = generation => {
    const counts = { primary: 0, handle: 0, trim: 0 };
    for (const mesh of lab.getMeshes()) {
      const slot = mesh.userData.materialSlot;
      assert.ok(Object.hasOwn(pairs, slot)); counts[slot]++;
      assert.equal(mesh.userData.generation, generation);
      if (generation === 0) assert.equal(mesh.material, pairs[slot].outerMaterial);
      else {
        assert.equal(mesh.material[0], pairs[slot].outerMaterial, `${slot} retains its outer material`);
        assert.equal(mesh.material[1], pairs[slot].innerMaterial, `${slot} retains its inner material`);
        assert.ok(mesh.geometry.groups.some(group => group.materialIndex === 1 && group.count > 0));
      }
    }
    assert.ok(Object.values(counts).every(count => count === 2 ** generation));
    return counts;
  };
  try {
    lab.setSource(source); assert.equal(lab.setEnabled(true), true);
    lab.update({ method: 'simple', fragmentCount: 2, seed: 117, maxGeneration: 3, maxFragments: 120, impulse: 0, gravity: 0, fracturePlanes: { x: true, y: false, z: false } });
    lab.setPaused(true); validate(0); assert.equal(callbackMeshes.size, 3);
    assert.deepEqual(events, []);
    assert.equal(await lab.fractureAll(), true); validate(1);
    assert.deepEqual(events.map(event => event.materialSlot).sort(), ['handle', 'primary', 'trim']);
    assert.ok(events.every(event => event.type === 'break' && event.fragmentCount === 2));

    // Edits to the shared objects appear on already-created debris immediately.
    pairs.handle.outerMaterial.color.set('#cd8032'); pairs.trim.innerMaterial.roughness = .37;
    assert.ok(lab.getMeshes().filter(mesh => mesh.userData.materialSlot === 'handle').every(mesh => mesh.material[0].color.getHexString() === 'cd8032'));
    assert.ok(lab.getMeshes().filter(mesh => mesh.userData.materialSlot === 'trim').every(mesh => mesh.material[1].roughness === .37));

    // Rebind while an actual second-generation fracture job is awaiting its
    // result. Both existing debris and subsequently committed pieces use it.
    const pending = lab.fractureAll(); assert.equal(lab.getStats().busy, true);
    const oldHandlePair = pairs.handle;
    pairs.handle = { outerMaterial: material('#4d3219'), innerMaterial: material('#f0bf6b') };
    const geometryIds = lab.getMeshes().map(mesh => mesh.geometry.uuid);
    assert.equal(lab.refreshMaterials(), true);
    assert.deepEqual(lab.getMeshes().map(mesh => mesh.geometry.uuid), geometryIds, 'Material replacement does not regenerate geometry');
    validate(1);
    assert.equal(await pending, true); const secondGeneration = validate(2);
    assert.ok(lab.getMeshes().every(mesh => mesh.material[0] !== oldHandlePair.outerMaterial));
    assert.equal(events.filter(event => event.type === 'break').length, 9);

    // A failure after earlier slots resolved must retain every old binding.
    const beforeFailure = lab.getMeshes().map(mesh => [...mesh.material]);
    const primaryPair = pairs.primary;
    pairs.primary = pairs.trim; failSlot = 'trim';
    assert.equal(lab.refreshMaterials(), false);
    for (const [i, mesh] of lab.getMeshes().entries()) assert.deepEqual(mesh.material, beforeFailure[i]);
    pairs.primary = primaryPair; failSlot = null;
    assert.equal(lab.refreshMaterials(), true); validate(2);

    // Solver notifications identify their source slot after pieces have moved.
    const fragmentSlots = new Map(lab.getMeshes().map(mesh => [mesh.uuid, mesh.userData.materialSlot]));
    events.length = 0; lab.update({ gravity: 9.81 }); lab.setPaused(false);
    for (let frame = 0; frame < 240; frame++) lab.step(1 / 60);
    const collisions = events.filter(event => event.type === 'collision');
    assert.ok(collisions.length > 0, 'Actual debris contact produces slot-aware events');
    for (const event of collisions) assert.equal(event.materialSlot, fragmentSlots.get(event.pieceId));

    events.length = 0; lab.reset(); validate(0); assert.deepEqual(events, []);
    lab.setEnabled(false); assert.equal(source.visible, true); assert.equal(lab.getMeshes().length, 0);
    lab.setEnabled(true); validate(0);
    for (const shared of owned) shared.addEventListener('dispose', () => disposedMaterials++);
    lab.dispose(); assert.equal(disposedMaterials, 0, 'Controller never disposes source/shared material objects');
    assert.equal(source.visible, true);
    return { passed: true, sourceSlots: 3, generations: 2, secondGeneration, collisionEvents: collisions.length, checks: ['per-part outer and inner pairs', 'repeated fracture', 'live shared edits', 'in-flight material replacement', 'atomic refresh failure', 'reset and re-enable', 'slot-aware break and collision events', 'shared material ownership'] };
  } finally {
    lab.dispose(); source.children.forEach(mesh => mesh.geometry.dispose()); owned.forEach(shared => shared.dispose());
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(await verifyFractureMaterials(), null, 2));
