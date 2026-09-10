import * as THREE from 'three';

const EPS = 1e-6;
const Y = new THREE.Vector3(0, 1, 0);
const BASE_AXES = { X: new THREE.Vector3(1, 0, 0), Y, Z: new THREE.Vector3(0, 0, 1) };

// Static triangle BVHs are built once per drag. We deliberately read the source
// meshes even in Collider view, where their visible flags are false. Footprint
// and side probes are bounded; this is a placement aid, not a collision solver.
function triangleCache(group, worldSpace = true) {
  group.updateWorldMatrix(true, true);
  const inverse = group.matrixWorld.clone().invert(), points = [], owners = [];
  const p = new THREE.Vector3();
  group.traverse(node => {
    if (!node.isMesh || !node.geometry?.attributes.position || node.userData.sceneCollider || node.userData.sceneHelper) return;
    const geometry = node.geometry, position = geometry.attributes.position, index = geometry.index;
    const matrix = worldSpace ? node.matrixWorld : inverse.clone().multiply(node.matrixWorld);
    const count = index ? index.count : position.count;
    for (let i = 0; i + 2 < count; i += 3) {
      for (let j = 0; j < 3; j++) {
        p.fromBufferAttribute(position, index ? index.getX(i + j) : i + j).applyMatrix4(matrix);
        points.push(p.x, p.y, p.z);
      }
      owners.push(node);
    }
  });
  const vertices = new Float64Array(points), count = vertices.length / 9;
  const order = Array.from({ length: count }, (_, i) => i), centers = new Float64Array(count * 3);
  const boxes = new Float64Array(count * 6), normals = new Float64Array(count * 3);
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3(), normal = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    const offset = i * 9;
    a.fromArray(vertices, offset); b.fromArray(vertices, offset + 3); c.fromArray(vertices, offset + 6);
    normal.crossVectors(b.clone().sub(a), c.clone().sub(a)).normalize().toArray(normals, i * 3);
    for (let axis = 0; axis < 3; axis++) {
      const lo = Math.min(vertices[offset + axis], vertices[offset + 3 + axis], vertices[offset + 6 + axis]);
      const hi = Math.max(vertices[offset + axis], vertices[offset + 3 + axis], vertices[offset + 6 + axis]);
      boxes[i * 6 + axis] = lo; boxes[i * 6 + axis + 3] = hi; centers[i * 3 + axis] = (lo + hi) / 2;
    }
  }
  const nodes = [];
  function build(start, end) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < end; i++) for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], boxes[order[i] * 6 + axis]);
      max[axis] = Math.max(max[axis], boxes[order[i] * 6 + axis + 3]);
    }
    const node = { min, max, start, end, left: -1, right: -1 }, id = nodes.push(node) - 1;
    if (end - start <= 12) return id;
    let axis = 0;
    for (let j = 1; j < 3; j++) if (max[j] - min[j] > max[axis] - min[axis]) axis = j;
    const middle = (min[axis] + max[axis]) / 2;
    let split = start;
    for (let i = start; i < end; i++) if (centers[order[i] * 3 + axis] < middle) {
      [order[i], order[split]] = [order[split], order[i]]; split++;
    }
    if (split <= start + (end - start) * .05 || split >= end - (end - start) * .05) {
      const sorted = order.slice(start, end).sort((i, j) => centers[i * 3 + axis] - centers[j * 3 + axis]);
      for (let i = 0; i < sorted.length; i++) order[start + i] = sorted[i];
      split = (start + end) >> 1;
    }
    node.left = build(start, split); node.right = build(split, end); return id;
  }
  if (count) build(0, count);
  const bounds = count ? new THREE.Box3(new THREE.Vector3(...nodes[0].min), new THREE.Vector3(...nodes[0].max)) : new THREE.Box3();
  function ray(origin, direction, maximum = Infinity, acceptNormal) {
    let closest = maximum, hit = null;
    const o = [origin.x, origin.y, origin.z], d = [direction.x, direction.y, direction.z];
    function intersects(node) {
      let near = 0, far = closest;
      for (let axis = 0; axis < 3; axis++) {
        if (Math.abs(d[axis]) < EPS) { if (o[axis] < node.min[axis] - EPS || o[axis] > node.max[axis] + EPS) return false; }
        else {
          let a = (node.min[axis] - o[axis]) / d[axis], b = (node.max[axis] - o[axis]) / d[axis];
          if (a > b) [a, b] = [b, a]; near = Math.max(near, a); far = Math.min(far, b);
          if (near > far + EPS) return false;
        }
      }
      return true;
    }
    function visit(id) {
      const node = nodes[id]; if (!intersects(node)) return;
      if (node.left >= 0) { visit(node.left); visit(node.right); return; }
      for (let at = node.start; at < node.end; at++) {
        const tri = order[at], n = tri * 3, i = tri * 9;
        if (acceptNormal && !acceptNormal(normals[n], normals[n + 1], normals[n + 2])) continue;
        const ax = vertices[i], ay = vertices[i + 1], az = vertices[i + 2];
        const ex = vertices[i + 3] - ax, ey = vertices[i + 4] - ay, ez = vertices[i + 5] - az;
        const fx = vertices[i + 6] - ax, fy = vertices[i + 7] - ay, fz = vertices[i + 8] - az;
        const px = d[1] * fz - d[2] * fy, py = d[2] * fx - d[0] * fz, pz = d[0] * fy - d[1] * fx;
        const determinant = ex * px + ey * py + ez * pz;
        if (Math.abs(determinant) < 1e-12) continue;
        const inv = 1 / determinant, tx = o[0] - ax, ty = o[1] - ay, tz = o[2] - az;
        const u = (tx * px + ty * py + tz * pz) * inv;
        if (u < -EPS || u > 1 + EPS) continue;
        const qx = ty * ez - tz * ey, qy = tz * ex - tx * ez, qz = tx * ey - ty * ex;
        const v = (d[0] * qx + d[1] * qy + d[2] * qz) * inv;
        if (v < -EPS || u + v > 1 + EPS) continue;
        const distance = (fx * qx + fy * qy + fz * qz) * inv;
        if (distance < -EPS || distance > closest + EPS) continue;
        closest = Math.max(0, distance);
        hit = { point: origin.clone().addScaledVector(direction, closest), normal: new THREE.Vector3(normals[n], normals[n + 1], normals[n + 2]), distance: closest, interior: Math.min(u, v, 1 - u - v), mesh: owners[tri] };
      }
    }
    if (count) visit(0); return hit;
  }
  // Vertex probes supplement the regular footprint with narrow tips and rims.
  const samples = [];
  const sampleCount = Math.min(vertices.length / 3, 160);
  for (let i = 0; i < sampleCount; i++) samples.push(new THREE.Vector3().fromArray(vertices, Math.floor(i * (vertices.length / 3) / sampleCount) * 3));
  // Always retain exact global extrema, including tiny nested geometry.
  for (let axis = 0; axis < 3; axis++) for (const sign of [-1, 1]) {
    let best = -Infinity, offset = -1;
    for (let i = 0; i < vertices.length; i += 3) if (vertices[i + axis] * sign > best) { best = vertices[i + axis] * sign; offset = i; }
    if (offset >= 0) samples.push(new THREE.Vector3().fromArray(vertices, offset));
  }
  // Branch-and-bound support point: exact extrema of the triangle mesh, without
  // walking every vertex on each drag frame. This keeps ground contact exact
  // under arbitrary parent rotation and nonuniform scale.
  function extreme(direction) {
    let score = -Infinity, point = null;
    const d = [direction.x, direction.y, direction.z];
    const bound = node => d.reduce((sum, value, axis) => sum + value * (value >= 0 ? node.max[axis] : node.min[axis]), 0);
    function visit(id) {
      const node = nodes[id]; if (bound(node) <= score) return;
      if (node.left >= 0) {
        const left = bound(nodes[node.left]), right = bound(nodes[node.right]);
        if (left > right) { visit(node.left); visit(node.right); } else { visit(node.right); visit(node.left); }
        return;
      }
      for (let at = node.start; at < node.end; at++) for (let vertex = 0; vertex < 3; vertex++) {
        const i = order[at] * 9 + vertex * 3, value = vertices[i] * d[0] + vertices[i + 1] * d[1] + vertices[i + 2] * d[2];
        if (value > score) { score = value; point = new THREE.Vector3().fromArray(vertices, i); }
      }
    }
    if (count) visit(0); return point;
  }
  return { bounds, ray, samples, extreme };
}

/**
 * Snapshot target geometry at drag start. snap() returns a WORLD-SPACE offset
 * without changing the selected transform. Recreate the session if geometry or
 * targets change. Horizontal projectToGround deliberately adds a world-Y
 * placement correction; otherwise corrections remain in the requested axes.
 * Bounded probes resolve real triangle surfaces, but are not continuous mesh
 * collision detection and can miss details smaller than the probe spacing.
 */
export function createSurfaceSnapSession({ object, targets = [], distance = .3 }) {
  if (!object?.isObject3D) throw new TypeError('Surface snapping needs an Object3D.');
  if (!Number.isFinite(distance) || distance <= 0) throw new RangeError('Snap distance must be positive.');
  let source = triangleCache(object, false), candidates = targets.filter(target => target?.isObject3D && target !== object && !isDescendant(target, object) && !isDescendant(object, target)).map(target => ({ target, cache: triangleCache(target) }));
  let disposed = false;
  function snap({ axes = 'XYZ', space = 'world', quaternion, projectToGround = false } = {}) {
    const offset = new THREE.Vector3();
    if (disposed || source.bounds.isEmpty()) return { offset, kind: null };
    object.updateWorldMatrix(true, false);
    const matrix = object.matrixWorld.clone(), inverse = matrix.clone().invert();
    if (!matrix.elements.every(Number.isFinite) || Math.abs(matrix.determinant()) < 1e-12) return { offset, kind: null };
    const rotation = space === 'local' ? quaternion?.clone() ?? object.getWorldQuaternion(new THREE.Quaternion()) : new THREE.Quaternion();
    const allowed = [...new Set(axes)].filter(axis => BASE_AXES[axis]).map(axis => BASE_AXES[axis].clone().applyQuaternion(rotation).normalize());
    if (!allowed.length) return { offset, kind: null };
    const bounds = source.bounds.clone().applyMatrix4(matrix), center = bounds.getCenter(new THREE.Vector3()), diagonal = bounds.getSize(new THREE.Vector3()).length() + 1;
    function selectedRay(origin, direction) {
      const localOrigin = origin.clone().sub(offset).applyMatrix4(inverse), localEnd = origin.clone().add(direction).sub(offset).applyMatrix4(inverse);
      const localDirection = localEnd.sub(localOrigin).normalize();
      const hit = source.ray(localOrigin, localDirection);
      return hit ? hit.point.applyMatrix4(matrix).add(offset) : null;
    }
    let kind = null, target;
    // Magnetize an actual side-facing surface along one of the active handles.
    // A single nearest side correction avoids competing corner magnets.
    const nearBox = bounds.clone().expandByScalar(distance * 1.05);
    const nearby = candidates.filter(entry => entry.cache.bounds.intersectsBox(nearBox));
    let bestSide = null;
    for (const axis of allowed) {
      if (Math.abs(axis.y) > .8) continue;
      const u = new THREE.Vector3().crossVectors(axis, Y).normalize();
      if (u.lengthSq() < .5) continue;
      const v = new THREE.Vector3().crossVectors(axis, u).normalize();
      const half = bounds.getSize(new THREE.Vector3()).multiplyScalar(.5);
      const extent = direction => Math.abs(direction.x) * half.x + Math.abs(direction.y) * half.y + Math.abs(direction.z) * half.z;
      for (const sign of [-1, 1]) {
        const direction = axis.clone().multiplyScalar(sign), contacts = new Map();
        for (let j = 0; j < 5; j++) for (let k = 0; k < 5; k++) {
          const origin = center.clone().addScaledVector(u, (j / 4 * 2 - 1) * extent(u) * .999).addScaledVector(v, (k / 4 * 2 - 1) * extent(v) * .999).addScaledVector(direction, diagonal);
          const front = selectedRay(origin, direction.clone().negate()); if (!front) continue;
          const start = front.clone().addScaledVector(direction, -distance);
          for (const entry of nearby) {
            const hit = entry.cache.ray(start, direction, distance * 2, (x, y, z) => x * direction.x + y * direction.y + z * direction.z < -.35 && Math.abs(y) < .85);
            if (!hit) continue;
            const delta = hit.distance - distance;
            const previous = contacts.get(entry.target);
            // Resolve the deepest sampled overlap on this facing surface before
            // choosing the nearest magnet, so a glancing zero-gap sample cannot
            // hide penetration elsewhere on a slanted face.
            if (previous === undefined || delta < previous) contacts.set(entry.target, delta);
          }
        }
        for (const [target, delta] of contacts) if (!bestSide || Math.abs(delta) < Math.abs(bestSide.delta)) bestSide = { delta, direction, target };
      }
    }
    if (bestSide) { offset.addScaledVector(bestSide.direction, bestSide.delta); kind = 'edge'; target = bestSide.target; }
    // Lower-envelope probes prevent the object's center or bounding-box floor
    // from masquerading as its actual underside (arches, rotated stock, etc.).
    const vertical = projectToGround ? Y.clone() : allowed.reduce((sum, axis) => sum.addScaledVector(axis, axis.dot(Y)), new THREE.Vector3());
    if (vertical.y > 1e-4) {
      const shifted = bounds.clone().translate(offset), footPoints = [], seen = new Set();
      function addFoot(x, z) {
        const key = `${Math.round(x * 1e5)}:${Math.round(z * 1e5)}`; if (seen.has(key)) return; seen.add(key);
        const bottom = selectedRay(new THREE.Vector3(x, shifted.min.y - 1, z), Y); if (bottom) footPoints.push(bottom);
      }
      for (let x = 0; x < 7; x++) for (let z = 0; z < 7; z++) addFoot(THREE.MathUtils.lerp(shifted.min.x, shifted.max.x, x / 6), THREE.MathUtils.lerp(shifted.min.z, shifted.max.z, z / 6));
      for (const sample of source.samples) { const p = sample.clone().applyMatrix4(matrix).add(offset); addFoot(p.x, p.z); }
      const elements = matrix.elements, lowest = source.extreme(new THREE.Vector3(-elements[1], -elements[5], -elements[9])).applyMatrix4(matrix).add(offset);
      addFoot(lowest.x, lowest.z);
      const floorDelta = -lowest.y;
      let support = projectToGround || Math.abs(floorDelta / Math.sqrt(vertical.y)) <= distance ? { delta: floorDelta, kind: 'ground' } : null;
      for (const foot of footPoints) {
        const top = projectToGround ? Math.max(shifted.max.y + distance, foot.y + distance) : foot.y + distance;
        for (const entry of candidates) {
          const box = entry.cache.bounds;
          if (foot.x < box.min.x - EPS || foot.x > box.max.x + EPS || foot.z < box.min.z - EPS || foot.z > box.max.z + EPS || box.min.y > top) continue;
          const hit = entry.cache.ray(new THREE.Vector3(foot.x, top, foot.z), new THREE.Vector3(0, -1, 0), projectToGround ? Infinity : distance * 2, (x, y) => y > .15);
          // A zero-area edge touch is a side contact, not a platform.
          if (!hit || hit.interior < 1e-7) continue;
          const delta = hit.point.y - foot.y;
          if ((projectToGround || Math.abs(delta / Math.sqrt(vertical.y)) <= distance + EPS) && (!support || delta > support.delta)) support = { delta, kind: 'surface', target: entry.target };
        }
      }
      if (support) {
        offset.addScaledVector(vertical, support.delta / vertical.y);
        if (Math.abs(support.delta) > EPS || !kind) { kind = support.kind; target = support.target; }
      }
    }
    if (![offset.x, offset.y, offset.z].every(Number.isFinite)) return { offset: new THREE.Vector3(), kind: null };
    return { offset, kind, ...(target ? { target } : {}) };
  }
  return { snap, dispose() { disposed = true; source = null; candidates = []; } };
}

function isDescendant(node, parent) { for (let p = node.parent; p; p = p.parent) if (p === parent) return true; return false; }
