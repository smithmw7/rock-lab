import assert from 'node:assert/strict';

// Independent separating-axis audit of actual world-space footprint polygons.
// A shared corner/edge is allowed; positive area overlap above floating-point
// tolerance is not. This does not use the generator's neighbor/fit algorithm.
export function assertNonOverlappingFootprints(footprints, label = 'Path') {
  const polygons = footprints.map((entry, index) => {
    assert.ok(Array.isArray(entry.points) && entry.points.length >= 3, `${label} footprint ${index} is a polygon`);
    for (const point of entry.points) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.z), `${label} footprint is finite`);
    let area = 0, orientation = 0;
    for (let i = 0; i < entry.points.length; i++) {
      const a = entry.points[i], b = entry.points[(i + 1) % entry.points.length], c = entry.points[(i + 2) % entry.points.length];
      area += a.x * b.z - b.x * a.z;
      const turn = (b.x - a.x) * (c.z - b.z) - (b.z - a.z) * (c.x - b.x);
      if (Math.abs(turn) > 1e-8) { if (!orientation) orientation = Math.sign(turn); assert.equal(Math.sign(turn), orientation, `${label} footprint ${index} must be convex for exact SAT`); }
    }
    assert.ok(Math.abs(area) > 1e-7, `${label} footprint ${index} has nonzero area`);
    return { points: entry.points, index: entry.pieceIndex ?? index, minX: Math.min(...entry.points.map(p => p.x)), maxX: Math.max(...entry.points.map(p => p.x)), minZ: Math.min(...entry.points.map(p => p.z)), maxZ: Math.max(...entry.points.map(p => p.z)) };
  });
  function separated(a, b) {
    for (const polygon of [a, b]) for (let i = 0; i < polygon.points.length; i++) {
      const p = polygon.points[i], q = polygon.points[(i + 1) % polygon.points.length];
      const dx = q.x - p.x, dz = q.z - p.z, length = Math.hypot(dx, dz); if (length < 1e-10) continue;
      const nx = -dz / length, nz = dx / length;
      const aa = a.points.map(point => nx * point.x + nz * point.z), bb = b.points.map(point => nx * point.x + nz * point.z);
      if (Math.min(Math.max(...aa), Math.max(...bb)) - Math.max(Math.min(...aa), Math.min(...bb)) <= 2e-6) return true;
    }
    return false;
  }
  let pairs = 0;
  for (let i = 0; i < polygons.length; i++) for (let j = i + 1; j < polygons.length; j++) {
    const a = polygons[i], b = polygons[j];
    if (a.maxX <= b.minX + 2e-6 || b.maxX <= a.minX + 2e-6 || a.maxZ <= b.minZ + 2e-6 || b.maxZ <= a.minZ + 2e-6) continue;
    assert.ok(separated(a, b), `${label} pieces ${a.index} and ${b.index} overlap`); pairs++;
  }
  return { polygons: polygons.length, candidatePairs: pairs };
}

export function assertPathDiagnostics(data, { meshes, triangles }, label = 'Path') {
  assert.ok(data && typeof data === 'object', `${label} exposes layout diagnostics`);
  assert.equal(data.pieces, meshes, `${label} reports its actual mesh count`);
  assert.equal(data.triangles, triangles, `${label} reports its actual triangles`);
  assert.ok(meshes > 0 && meshes <= 128 && triangles <= 80000, `${label} respects declared geometry budgets`);
  assert.ok(Number.isFinite(data.length) && data.length > 0, `${label} reports actual curve length`);
  assert.equal(typeof data.truncated, 'boolean');
  assert.ok(Number.isInteger(data.skipped) && data.skipped >= 0);
  assert.ok(Array.isArray(data.warnings));
  if (data.truncated) assert.ok(data.warnings.length > 0, `${label} explains truncation`);
}
