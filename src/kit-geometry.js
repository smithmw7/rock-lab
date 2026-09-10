// Layouts use one shared unit system. Each entry is a closed convex part, so
// arch openings and furniture joints never require fracturing an open shell.
export const KIT_GROUPS = {
  primitives: ['smallBlock', 'mediumBlock', 'largeBlock', 'lowRamp', 'steepRamp', 'cornerRamp', 'platform'],
  architecture: ['roundArch', 'pointedArch', 'flatArch', 'bridge', 'roundColumn', 'squareColumn', 'brokenColumn', 'plinth', 'doorway'],
  furniture: ['bench', 'table', 'chair', 'stool'],
};
export const KIT_SHAPES = new Set(Object.values(KIT_GROUPS).flat());

export function createKitParts(shape, detail = 0.5) {
  const parts = [];
  const solid = (name, kind, position, size, extra = {}) => parts.push({ name, kind, position, size, ...extra });
  const block = (name, position, size, extra) => solid(name, 'block', position, size, extra);
  const cylinder = (name, position, size, extra) => solid(name, 'cylinder', position, size, extra);
  const prism = (name, section, depth, extra = {}) => parts.push({ name, kind: 'prism', section, depth, position: [0, 0, 0], ...extra });
  const archPiers = (height = 1.3, width = 0.45, center = 1.125, depth = 0.78) => {
    for (const sign of [-1, 1]) {
      block('Pier footing', [sign * center, .11, 0], [width + .22, .22, depth + .22], { grounded: true });
      block('Arch pier', [sign * center, (height + .12) / 2, 0], [width, height - .12, depth]);
    }
  };
  const interpolate = (a, b, t) => a.map((value, i) => value + (b[i] - value) * t);

  switch (shape) {
    case 'smallBlock': case 'mediumBlock': case 'largeBlock': {
      const size = { smallBlock: .8, mediumBlock: 1.5, largeBlock: 2.5 }[shape];
      block('Unit block', [0, size / 2, 0], [size, size, size], { grounded: true });
      break;
    }
    case 'lowRamp':
      prism('Shallow ramp', [[-1.4, 0], [1.4, 0], [1.4, .65], [-1.4, .07]], 1.7, { grounded: true });
      break;
    case 'steepRamp':
      prism('Steep ramp', [[-1, 0], [1, 0], [1, 1.8], [-1, .07]], 1.7, { grounded: true });
      break;
    case 'cornerRamp':
      block('Corner landing', [.85, .6, -.85], [1.25, 1.2, 1.25], { grounded: true });
      prism('First approach', [[-1.45, 0], [.27, 0], [.27, 1.2], [-1.45, .07]], 1.25, { position: [0, 0, -.85], grounded: true });
      prism('Returning approach', [[-1.45, 0], [.27, 0], [.27, 1.2], [-1.45, .07]], 1.25, { position: [.85, 0, 0], rotation: [0, Math.PI / 2, 0], grounded: true });
      break;
    case 'platform':
      block('Low platform', [0, .12, 0], [3.25, .24, 2.6], { grounded: true });
      break;
    case 'roundArch': {
      archPiers();
      const count = 7 + Math.round(detail * 4), inner = .9, outer = 1.35;
      for (let i = 0; i < count; i++) {
        const a = i / count * Math.PI - .026, b = (i + 1) / count * Math.PI + .026;
        const point = (r, angle) => [r * Math.cos(angle), 1.3 + r * Math.sin(angle)];
        prism(i === Math.floor(count / 2) ? 'Crown stone' : 'Arch stone', [point(inner, a), point(outer, a), point(outer, b), point(inner, b)], .8);
      }
      break;
    }
    case 'pointedArch': {
      archPiers();
      for (const sign of [-1, 1]) for (let i = 0; i < 3; i++) {
        const a = i / 3 - .027, b = (i + 1) / 3 + .027;
        const outer = t => interpolate([sign * 1.35, 1.27], [sign * -.025, 2.95], t);
        const inner = t => interpolate([sign * .9, 1.27], [sign * -.025, 2.4], t);
        prism('Pointed arch stone', [outer(a), outer(b), inner(b), inner(a)], .8);
      }
      break;
    }
    case 'flatArch':
      archPiers(2.15);
      for (let i = 0; i < 5; i++) {
        const a = -1.425 + i * .57 - .025, b = -1.425 + (i + 1) * .57 + .025;
        prism(i === 2 ? 'Flat arch keystone' : 'Flat arch voussoir', [[a * .91, 2.08], [b * .91, 2.08], [b, 2.52], [a, 2.52]], .94);
      }
      break;
    case 'bridge': {
      for (const sign of [-1, 1]) block('Bridge abutment', [sign * 1.43, .27, 0], [.64, .54, 1.92], { grounded: true });
      const count = 9;
      const under = x => .23 + .65 * Math.sqrt(Math.max(0, 1 - (x / 1.4) ** 2));
      for (let i = 0; i < count; i++) {
        const a = Math.max(-1.4, -1.4 + i / count * 2.8 - .028);
        const b = Math.min(1.4, -1.4 + (i + 1) / count * 2.8 + .028);
        prism('Arched bridge span', [[a, under(a)], [b, under(b)], [b, .99], [a, .99]], 1.7);
      }
      block('Level walking deck', [0, 1.075, 0], [3.5, .23, 1.92]);
      for (const sign of [-1, 1]) block('Low bridge parapet', [0, 1.3, sign * .865], [3.42, .28, .19]);
      break;
    }
    case 'roundColumn': case 'squareColumn':
      block('Column plinth', [0, .12, 0], [1.35, .24, 1.35], { grounded: true });
      solid('Column foot', shape === 'roundColumn' ? 'cylinder' : 'block', [0, .28, 0], [1.02, .22, 1.02]);
      solid('Column shaft', shape === 'roundColumn' ? 'cylinder' : 'block', [0, 1.35, 0], [.72, 2.1, .72]);
      solid('Capital neck', shape === 'roundColumn' ? 'cylinder' : 'block', [0, 2.39, 0], [.94, .2, .94]);
      block('Column capital', [0, 2.57, 0], [1.24, .28, 1.24]);
      break;
    case 'brokenColumn':
      block('Broken column base', [-.3, .12, -.18], [1.35, .24, 1.35], { grounded: true });
      cylinder('Sheared column stump', [-.3, .95, -.18], [.86, 1.6, .86], { cuts: [{ normal: [.35, 1, -.22], distance: .55 }, { normal: [-.45, 1, .3], distance: .74 }] });
      cylinder('Fallen shaft', [.74, .35, .85], [.68, 1.13, .68], { rotation: [0, .12, Math.PI / 2], grounded: true, cuts: [{ normal: [.25, 1, .1], distance: .45 }] });
      block('Broken chip', [-.86, .12, .88], [.42, .24, .38], { rotation: [0, .3, 0], grounded: true });
      break;
    case 'plinth':
      block('Pedestal foot', [0, .15, 0], [2, .3, 1.8], { grounded: true });
      block('Pedestal body', [0, .55, 0], [1.5, .62, 1.34]);
      block('Pedestal cap', [0, .93, 0], [1.94, .24, 1.74]);
      break;
    case 'doorway':
      block('Door threshold', [0, .09, 0], [2.6, .18, 1.3], { grounded: true });
      for (const sign of [-1, 1]) {
        block('Door jamb', [sign * .99, 1.29, 0], [.58, 2.36, 1.06]);
        block('Front jamb trim', [sign * .79, 1.31, .51], [.22, 2.38, .2]);
      }
      block('Door head', [0, 2.56, 0], [2.58, .34, 1.2]);
      block('Front lintel trim', [0, 2.43, .52], [1.76, .21, .24]);
      break;
    case 'bench':
      for (const z of [-.235, .235]) block('Bench seat board', [0, 1.02, z], [2.9, .22, .45]);
      for (const x of [-1.15, 1.15]) for (const z of [-.28, .28]) block('Bench leg', [x, .475, z], [.25, .95, .25], { grounded: true });
      for (const x of [-1.15, 1.15]) block('Bench cross brace', [x, .4, 0], [.25, .16, .82]);
      block('Bench stretcher', [0, .4, 0], [2.4, .17, .2]);
      break;
    case 'table':
      for (const z of [-.665, 0, .665]) block('Tabletop board', [0, 1.73, z], [3, .24, .65]);
      for (const x of [-1.2, 1.2]) for (const z of [-.72, .72]) block('Table leg', [x, .83, z], [.27, 1.66, .27], { grounded: true });
      for (const z of [-.72, .72]) block('Long table apron', [0, 1.51, z], [2.66, .29, .2]);
      for (const x of [-1.2, 1.2]) block('Side table apron', [x, 1.51, 0], [.2, .29, 1.48]);
      break;
    case 'chair':
      block('Chair seat', [0, 1.05, 0], [1.3, .22, 1.3]);
      for (const x of [-.46, .46]) {
        block('Chair front leg', [x, .51, .43], [.23, 1.02, .23], { grounded: true });
        block('Chair back post', [x, 1.12, -.43], [.23, 2.24, .23], { grounded: true });
        block('Chair side stretcher', [x, .42, 0], [.17, .14, 1.02]);
      }
      for (const y of [1.47, 1.8, 2.12]) block('Chair back slat', [0, y, -.43], [1.16, .2, .18]);
      block('Chair front stretcher', [0, .42, .43], [1.08, .14, .16]);
      break;
    case 'stool':
      cylinder('Round stool seat', [0, 1.04, 0], [1.52, .24, 1.52]);
      for (const x of [-.46, .46]) for (const z of [-.46, .46]) block('Splayed stool leg', [x, .49, z], [.2, .98, .2], { rotation: [Math.sign(z) * .09, 0, -Math.sign(x) * .09], grounded: true });
      for (const sign of [-1, 1]) {
        block('Stool cross brace', [0, .4, sign * .44], [1.06, .14, .15]);
        block('Stool side brace', [sign * .44, .4, 0], [.15, .14, 1.06]);
      }
      break;
  }
  return parts;
}
