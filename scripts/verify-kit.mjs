import assert from 'node:assert/strict';
import { MeshBasicMaterial } from 'three';
import { buildAsset, disposeAsset } from '../src/geometry.js';
import { KIT_SHAPES } from '../src/kit-geometry.js';

// Tiny bevel faces must survive triangulation and displacement subdivision.
// An open sliver can render correctly yet fail when its part is fractured.
// Weld only for this audit, then require two triangles at every geometric edge.
const material = new MeshBasicMaterial();
let cases = 0, meshes = 0, auditedEdges = 0;
try {
  for (const shape of KIT_SHAPES) for (const level of [0, 1]) for (const displacement of [0, 1]) {
    const options = { shape, seed: 19423, facets: level, roughness: level, bevel: level, displacement, geometryNoiseScale: 8 };
    const group = buildAsset(options, material);
    try {
      group.traverse(mesh => {
        if (!mesh.isMesh) return;
        const geometry = mesh.geometry, position = geometry.attributes.position;
        const description = `${shape} / detail-wear-bevel ${level} / displacement ${displacement} / ${mesh.name || meshes}`;
        assert.equal(geometry.index, null, `${description}: expected nonindexed upload geometry`);
        assert.equal(position.count % 3, 0, `${description}: incomplete triangle`);
        const keys = [];
        for (let vertex = 0; vertex < position.count; vertex++) {
          const coordinates = [position.getX(vertex), position.getY(vertex), position.getZ(vertex)];
          assert.ok(coordinates.every(Number.isFinite), `${description}: invalid coordinate`);
          keys.push(coordinates.map(value => Math.round(value * 1e6)).join(','));
        }
        const edges = new Map();
        for (let triangle = 0; triangle < position.count; triangle += 3) for (let corner = 0; corner < 3; corner++) {
          const a = keys[triangle + corner], b = keys[triangle + (corner + 1) % 3];
          if (a === b) continue;
          const key = a < b ? `${a}|${b}` : `${b}|${a}`;
          edges.set(key, (edges.get(key) || 0) + 1);
        }
        assert.ok(edges.size > 0, `${description}: missing surface edges`);
        for (const [edge, count] of edges) assert.equal(count, 2, `${description}: boundary or nonmanifold edge ${edge}`);
        auditedEdges += edges.size;
        meshes++;
      });
      cases++;
    } finally { disposeAsset(group); }
  }
  console.log(JSON.stringify({ passed: true, shapes: KIT_SHAPES.size, cases, meshes, auditedEdges, weldTolerance: .000001, checks: ['Closed new-kit pieces at minimum and maximum detail, wear, bevel, and displacement'] }, null, 2));
} finally { material.dispose(); }
