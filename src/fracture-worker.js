import * as THREE from 'three';
import { DestructibleMesh, FractureOptions, SliceOptions } from '@dgreenheck/three-pinata';

export function encodeGeometry(geometry) {
  const attributes = {};
  for (const name of ['position', 'normal', 'uv']) {
    const attribute = geometry.getAttribute(name);
    if (attribute) attributes[name] = { array: new Float32Array(attribute.array), itemSize: attribute.itemSize };
  }
  return {
    attributes,
    index: geometry.index ? new Uint32Array(geometry.index.array) : null,
    groups: geometry.groups.map(group => ({ ...group })),
  };
}

export function decodeGeometry(data) {
  const geometry = new THREE.BufferGeometry();
  for (const [name, attribute] of Object.entries(data.attributes)) {
    geometry.setAttribute(name, new THREE.BufferAttribute(attribute.array, attribute.itemSize));
  }
  if (data.index) geometry.setIndex(new THREE.BufferAttribute(data.index, 1));
  for (const group of data.groups || []) geometry.addGroup(group.start, group.count, group.materialIndex);
  return geometry;
}

function cleanGeometry(source) {
  // Pinata retains shared vertices and two index groups. Copy only referenced,
  // finite, nonzero-area triangles so colliders and bounds see the actual piece.
  const geometry = new THREE.BufferGeometry();
  const p = source.attributes.position, normal = source.attributes.normal, uv = source.attributes.uv;
  const indexAt = i => source.index ? source.index.getX(i) : i;
  const count = source.index?.count ?? p.count;
  const groups = source.groups.length ? source.groups : [{ start: 0, count, materialIndex: 0 }];
  const positions = [], normals = [], uvs = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  let volume = 0;
  for (const group of groups) {
    const start = positions.length / 3;
    for (let i = group.start; i < group.start + group.count; i += 3) {
      const ids = [indexAt(i), indexAt(i + 1), indexAt(i + 2)];
      a.fromBufferAttribute(p, ids[0]); b.fromBufferAttribute(p, ids[1]); c.fromBufferAttribute(p, ids[2]);
      const face = b.clone().sub(a).cross(c.clone().sub(a));
      if (![a, b, c].every(v => Number.isFinite(v.x + v.y + v.z)) || face.lengthSq() < 1e-16) continue;
      volume += a.dot(b.clone().cross(c)) / 6;
      for (const id of ids) {
        positions.push(p.getX(id), p.getY(id), p.getZ(id));
        const n = new THREE.Vector3().fromBufferAttribute(normal, id);
        if (!Number.isFinite(n.x + n.y + n.z) || n.lengthSq() < 1e-10) n.copy(face);
        n.normalize(); normals.push(n.x, n.y, n.z);
        uvs.push(uv?.getX(id) || 0, uv?.getY(id) || 0);
      }
    }
    geometry.addGroup(start, positions.length / 3 - start, group.materialIndex || 0);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeBoundingBox(); geometry.computeBoundingSphere();
  geometry.userData.volume = Math.abs(volume);
  return geometry;
}

/** This same function runs in a browser worker and in the Node core checks. */
export function fractureGeometryData({ geometry: data, options, impactPoint }) {
  const started = performance.now();
  const geometry = decodeGeometry(data), source = new DestructibleMesh(geometry);
  source.updateMatrixWorld(true);
  const textureScale = new THREE.Vector2(...options.innerUVScale), textureOffset = new THREE.Vector2(...options.innerUVOffset);
  let pieces = [];
  try {
    if (options.method === 'slice') {
      const sliceOptions = new SliceOptions(); sliceOptions.textureScale = textureScale; sliceOptions.textureOffset = textureOffset;
      pieces = source.slice(new THREE.Vector3(...options.sliceNormal), new THREE.Vector3(...options.sliceOrigin), sliceOptions);
    } else {
      const voronoiOptions = {
        mode: options.mode,
        projectionAxis: options.projectionAxis,
        useApproximation: options.useApproximation,
        approximationNeighborCount: options.approximationNeighborCount,
      };
      if (options.projectionNormal.some(value => Math.abs(value) > 1e-8)) voronoiOptions.projectionNormal = new THREE.Vector3(...options.projectionNormal).normalize();
      if (options.seedPoints.length) voronoiOptions.seedPoints = options.seedPoints.map(point => new THREE.Vector3(...point));
      if (options.impactEnabled && impactPoint) {
        voronoiOptions.impactPoint = new THREE.Vector3(...impactPoint);
        voronoiOptions.impactRadius = options.impactRadius;
      }
      pieces = source.fracture(new FractureOptions({
        fractureMethod: options.method, fragmentCount: options.fragmentCount,
        fracturePlanes: options.fracturePlanes, voronoiOptions,
        textureScale, textureOffset, seed: options.seed,
      }));
    }
    const fragments = [];
    for (const piece of pieces) {
      // Normalize both APIs: fracture() centers its geometry, slice() does not.
      piece.updateMatrixWorld(true);
      const cleaned = cleanGeometry(piece.geometry);
      if (cleaned.attributes.position.count < 12 || cleaned.userData.volume < 1e-8) { cleaned.dispose(); continue; }
      cleaned.applyMatrix4(piece.matrixWorld);
      cleaned.computeBoundingBox();
      const center = cleaned.boundingBox.getCenter(new THREE.Vector3());
      cleaned.translate(-center.x, -center.y, -center.z);
      fragments.push({ geometry: encodeGeometry(cleaned), position: center.toArray(), volume: cleaned.userData.volume });
      cleaned.dispose();
    }
    return { fragments, milliseconds: performance.now() - started };
  } finally {
    geometry.dispose();
    for (const piece of pieces) piece.geometry.dispose();
  }
}

if (typeof self !== 'undefined' && typeof document === 'undefined') {
  self.onmessage = ({ data }) => {
    try {
      const result = fractureGeometryData(data.payload);
      const transfer = result.fragments.flatMap(fragment => [
        ...Object.values(fragment.geometry.attributes).map(attribute => attribute.array.buffer),
        ...(fragment.geometry.index ? [fragment.geometry.index.buffer] : []),
      ]);
      self.postMessage({ id: data.id, result }, transfer);
    } catch (error) {
      self.postMessage({ id: data.id, error: error?.message || String(error) });
    }
  };
}
