import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { F1Driver, F1Team, TyreCompound } from '../types/f1';
import {
  createAeroWheelCoverTexture,
  createCarbonWeaveTexture,
  createContactShadowTexture,
  createEngineCoverLiveryTexture,
  createFrontEndplateTexture,
  createLiveWheelScreenController,
  createNoseconeLiveryTexture,
  createRearWingBannerTexture,
  createSteeringWheelScreenTexture,
  createTeamLiveryTexture,
  createTyreSidewallTexture,
  createTyreTreadTexture,
  LiveWheelScreenController,
} from './proceduralTextures';

export interface F1CarRig {
  root: THREE.Group;
  wheels: THREE.Group[];
  frontWheelPivots: THREE.Group[];
  brakeGlowMats: THREE.MeshStandardMaterial[];
  drsFlap: THREE.Object3D;
  rearRainLight: THREE.MeshStandardMaterial;
  setCompound: (compound: TyreCompound) => void;
  setDrsOpen: (open: boolean, dt: number) => void;
  setBrakingOrErs: (braking: boolean, ers: boolean, speedMs?: number) => void;
  setHelmetVisible: (visible: boolean) => void;
  updateWheelDisplay: (
    speedKmh: number,
    gear: number,
    rpm: number,
    ersPercent: number,
    ersDeploying: boolean,
    drsActive: boolean,
    drsAllowed: boolean,
  ) => void;
  updateMotion: (speedMs: number, steerAngle: number, dt: number) => void;
  dispose: () => void;
}

const sharedContactShadowTex = createContactShadowTexture();
const sharedCarbonWeaveTex = createCarbonWeaveTexture();
const sharedWheelScreenTex = createSteeringWheelScreenTexture();
const sharedTyreTreadTex = createTyreTreadTexture();
const sharedAeroCoverTex = createAeroWheelCoverTexture();
const sharedTyreTexByCompound: Record<TyreCompound, THREE.CanvasTexture> = {
  SOFT: createTyreSidewallTexture('SOFT'),
  MEDIUM: createTyreSidewallTexture('MEDIUM'),
  HARD: createTyreSidewallTexture('HARD'),
};

interface LoftStation {
  z: number;
  xCenter: number;
  yCenter: number;
  rx: number;
  ryTop: number;
  ryBot: number;
  power?: number;
}

interface LoftOptions {
  capFront?: boolean;
  capRear?: boolean;
  zUv?: boolean;
}

/**
 * Generates a smooth, watertight 3D lofted surface from cross-sectional stations along Z,
 * with optional Z-proportional UV mapping and rounded nose/tail dome caps.
 */
function createLoftedBodyGeometry(
  stations: LoftStation[],
  radialSegments = 28,
  options: LoftOptions = {},
): THREE.BufferGeometry {
  const ringVerts = radialSegments + 1;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const zStart = stations[0]?.z ?? 0;
  const zEnd = stations[stations.length - 1]?.z ?? 0;
  const zSpan = Math.abs(zStart - zEnd) || 1;

  for (let sIdx = 0; sIdx < stations.length; sIdx++) {
    const st = stations[sIdx];
    const p = st.power ?? 2.4;
    const uCoord = options.zUv
      ? Math.max(0, Math.min(1, Math.abs(zStart - st.z) / zSpan))
      : sIdx / Math.max(1, stations.length - 1);

    for (let r = 0; r <= radialSegments; r++) {
      const vCoord = r / radialSegments;
      const theta = vCoord * Math.PI * 2;
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      const sx = Math.sign(cosT) * Math.pow(Math.abs(cosT), 2 / p);
      const sy = Math.sign(sinT) * Math.pow(Math.abs(sinT), 2 / p);

      const x = st.xCenter + sx * st.rx;
      const ry = sinT >= 0 ? st.ryTop : st.ryBot;
      const y = st.yCenter + sy * ry;

      positions.push(x, y, st.z);
      uvs.push(uCoord, vCoord);
    }
  }

  for (let sIdx = 0; sIdx < stations.length - 1; sIdx++) {
    for (let r = 0; r < radialSegments; r++) {
      const a = sIdx * ringVerts + r;
      const b = a + ringVerts;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, b, c, c, b, d);
    }
  }

  if (options.capFront && stations.length > 0) {
    const st0 = stations[0];
    const apexIdx = positions.length / 3;
    const tipBulge = Math.max(0.018, st0.rx * 0.42);
    positions.push(st0.xCenter, st0.yCenter + (st0.ryTop - st0.ryBot) * 0.25, st0.z + tipBulge);
    uvs.push(0, 0.25);
    for (let r = 0; r < radialSegments; r++) {
      indices.push(apexIdx, r, r + 1);
    }
  }

  if (options.capRear && stations.length > 0) {
    const stN = stations[stations.length - 1];
    const baseRingStart = (stations.length - 1) * ringVerts;
    const apexIdx = positions.length / 3;
    const tailBulge = Math.max(0.018, stN.rx * 0.4);
    positions.push(stN.xCenter, stN.yCenter, stN.z - tailBulge);
    uvs.push(1, 0.25);
    for (let r = 0; r < radialSegments; r++) {
      indices.push(apexIdx, baseRingStart + r + 1, baseRingStart + r);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

interface SweptWingSpec {
  xStart: number;
  xEnd: number;
  spanSegs?: number;
  profileSegs?: number;
  zLead: (absX: number, tAbs: number) => number;
  yHeight: (absX: number, tAbs: number) => number;
  chord: (absX: number, tAbs: number) => number;
  pitch: (absX: number, tAbs: number) => number;
  roll?: (x: number, tAbs: number) => number;
  thickness: number;
  camber: number;
}

/**
 * Generates a swept, gullwing-arched, twisted cambered 3D airfoil wing element with closed wingtips
 * and verified outward-facing normals.
 */
function createSweptWingElementGeo(spec: SweptWingSpec): THREE.BufferGeometry {
  const spanSegs = spec.spanSegs ?? 32;
  const profileSegs = spec.profileSegs ?? 16; // must be even
  const halfProf = profileSegs / 2;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const ringsVertCount = profileSegs + 1;
  const maxSpan = Math.max(Math.abs(spec.xStart), Math.abs(spec.xEnd), 0.001);

  for (let i = 0; i <= spanSegs; i++) {
    const u = i / spanSegs;
    const x = THREE.MathUtils.lerp(spec.xStart, spec.xEnd, u);
    const absX = Math.abs(x);
    const tAbs = Math.min(1, absX / maxSpan);

    const zL = spec.zLead(absX, tAbs);
    const yBase = spec.yHeight(absX, tAbs);
    const c = spec.chord(absX, tAbs);
    const pitch = spec.pitch(absX, tAbs);
    const roll = spec.roll ? spec.roll(x, tAbs) : 0;

    const cosP = Math.cos(pitch);
    const sinP = Math.sin(pitch);
    const cosR = Math.cos(roll);
    const sinR = Math.sin(roll);

    // Local chord pivot at leading edge (s = 0 is leading edge, s = 1 is trailing edge)
    for (let j = 0; j <= profileSegs; j++) {
      let s: number;
      let yLocal: number;
      if (j <= halfProf) {
        // Upper cambered surface: trailing edge (s=1) -> leading edge (s=0)
        const frac = j / halfProf; // 0..1
        s = 1 - frac;
        const naca = Math.sin(Math.pow(s, 0.72) * Math.PI);
        yLocal = spec.thickness * 0.62 * naca + spec.camber * Math.sin(s * Math.PI);
      } else {
        // Lower airfoil surface: leading edge (s=0) -> trailing edge (s=1)
        const frac = (j - halfProf) / halfProf; // 0..1
        s = frac;
        const naca = Math.sin(Math.pow(s, 0.72) * Math.PI);
        yLocal = -spec.thickness * 0.34 * naca + spec.camber * 0.42 * Math.sin(s * Math.PI);
      }

      const zLocal = -s * c; // 0 at leading edge, -c at trailing edge
      // Pitch nose-up/down around X axis (positive pitch lifts leading edge or drops trailing edge: +pitch -> trailing edge rises)
      const zP = zLocal * cosP;
      const yP = -zLocal * sinP + yLocal * cosP;

      // Apply slight upward wingtip dihedral curl around Z axis near outer wingtips
      const dxRoll = -yP * sinR;
      const dyRoll = yP * cosR;

      positions.push(x + dxRoll, yBase + dyRoll, zL + zP);
      uvs.push(u, j / profileSegs);
    }
  }

  for (let i = 0; i < spanSegs; i++) {
    for (let j = 0; j < profileSegs; j++) {
      const a = i * ringsVertCount + j;
      const b = (i + 1) * ringsVertCount + j;
      const c = a + 1;
      const d = b + 1;
      indices.push(a, c, b, c, d, b);
    }
  }

  // Cap xStart tip (-X)
  const startCenterIdx = positions.length / 3;
  let sx = 0, sy = 0, sz = 0;
  for (let j = 0; j < profileSegs; j++) {
    sx += positions[j * 3];
    sy += positions[j * 3 + 1];
    sz += positions[j * 3 + 2];
  }
  positions.push(sx / profileSegs, sy / profileSegs, sz / profileSegs);
  uvs.push(0, 0.5);
  for (let j = 0; j < profileSegs; j++) {
    indices.push(startCenterIdx, j + 1, j);
  }

  // Cap xEnd tip (+X)
  const endRingStart = spanSegs * ringsVertCount;
  const endCenterIdx = positions.length / 3;
  let ex = 0, ey = 0, ez = 0;
  for (let j = 0; j < profileSegs; j++) {
    const idx = (endRingStart + j) * 3;
    ex += positions[idx];
    ey += positions[idx + 1];
    ez += positions[idx + 2];
  }
  positions.push(ex / profileSegs, ey / profileSegs, ez / profileSegs);
  uvs.push(1, 0.5);
  for (let j = 0; j < profileSegs; j++) {
    indices.push(endCenterIdx, endRingStart + j, endRingStart + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a sculpted 2025 F1 blended curved front wing endplate shell for left (-1) or right (+1) side.
 */
function createBlendedEndplateGeo(side: number): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(2.36, 0.088);
  shape.lineTo(2.85, 0.095);
  shape.bezierCurveTo(2.86, 0.25, 2.74, 0.39, 2.54, 0.415);
  shape.bezierCurveTo(2.42, 0.425, 2.34, 0.36, 2.32, 0.27);
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.022,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 16,
  });
  geo.translate(0, 0, -0.011);
  geo.rotateY(-Math.PI / 2);

  // Sculpt graceful outward outwash flare + top curl & clean planar Z/Y UVs
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uvs = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const pz = pos.getZ(i);
    const yNorm = Math.max(0, Math.min(1, (py - 0.09) / 0.33));
    const flare = side * (Math.pow(yNorm, 1.35) * 0.055);
    const zCurve = side * ((2.86 - pz) * 0.045);
    pos.setX(i, px + flare + zCurve);
    // U = 0 (trailing edge) -> 1 (leading edge), V = 0 (bottom) -> 1 (top)
    uvs.setXY(i, (pz - 2.32) / 0.56, yNorm);
  }
  pos.needsUpdate = true;
  uvs.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a razor-thin beveled carbon over-wheel aero deflector mounted cleanly onto the steering knuckle.
 */
function createOverWheelDeflectorGeo(side: number): THREE.BufferGeometry {
  // Crescent arc in local (z, y) plane wrapping tyre upper-front inner shoulder (r = 0.388 .. 0.428)
  const shape = new THREE.Shape();
  const rInner = 0.384;
  const rOuter = 0.432;
  const aStart = 0.16 * Math.PI; // forward-upper (z > 0)
  const aEnd = 0.66 * Math.PI;   // over crown toward rear-top
  const steps = 16;

  for (let i = 0; i <= steps; i++) {
    const a = THREE.MathUtils.lerp(aStart, aEnd, i / steps);
    const taper = Math.sin((i / steps) * Math.PI);
    const rOut = THREE.MathUtils.lerp(rInner + 0.014, rOuter, Math.pow(taper, 0.55));
    const pz = Math.cos(a) * rOut;
    const py = Math.sin(a) * rOut;
    if (i === 0) shape.moveTo(pz, py);
    else shape.lineTo(pz, py);
  }
  for (let i = steps; i >= 0; i--) {
    const a = THREE.MathUtils.lerp(aStart, aEnd, i / steps);
    const pz = Math.cos(a) * rInner;
    const py = Math.sin(a) * rInner;
    shape.lineTo(pz, py);
  }
  shape.closePath();

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.012,
    bevelEnabled: true,
    bevelThickness: 0.003,
    bevelSize: 0.003,
    bevelSegments: 1,
  });
  geo.translate(0, 0, -0.006);
  geo.rotateY(-Math.PI / 2);

  // Subtle inward/outward wheel-shoulder contour wrap toward tyre crown
  const pos = geo.attributes.position as THREE.BufferAttribute;
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const py = pos.getY(i);
    const bend = side * Math.max(0, (py - 0.28) * 0.28);
    pos.setX(i, px + bend);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

/**
 * Creates a true cambered aerodynamic airfoil wing geometry (rounded leading edge at +Z,
 * tapered trailing edge at -Z, extruded smoothly across X span).
 */
function createAirfoilWingGeometry(
  span: number,
  chord: number,
  thickness: number,
  camber: number,
): THREE.BufferGeometry {
  const halfC = chord * 0.5;
  const shape = new THREE.Shape();
  shape.moveTo(halfC, 0);
  shape.bezierCurveTo(
    halfC * 0.65,
    thickness * 0.72 + camber,
    -halfC * 0.15,
    thickness * 0.55 + camber,
    -halfC,
    -thickness * 0.08,
  );
  shape.bezierCurveTo(
    -halfC * 0.2,
    -thickness * 0.28 + camber * 0.35,
    halfC * 0.65,
    -thickness * 0.45,
    halfC,
    0,
  );

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: span,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.006,
    bevelSegments: 2,
    curveSegments: 14,
  });
  geo.translate(0, 0, -span * 0.5);
  geo.rotateY(-Math.PI / 2);
  return geo;
}

/**
 * Creates an ergonomic butterfly F1 steering wheel profile.
 */
function createButterflyWheelGeometry(): THREE.BufferGeometry {
  const s = new THREE.Shape();
  s.moveTo(-0.075, 0.072);
  s.lineTo(0.075, 0.072);
  s.quadraticCurveTo(0.135, 0.068, 0.145, 0.025);
  s.lineTo(0.138, -0.048);
  s.quadraticCurveTo(0.125, -0.076, 0.075, -0.068);
  s.quadraticCurveTo(0.04, -0.048, 0, -0.052);
  s.quadraticCurveTo(-0.04, -0.048, -0.075, -0.068);
  s.quadraticCurveTo(-0.125, -0.076, -0.138, -0.048);
  s.lineTo(-0.145, 0.025);
  s.quadraticCurveTo(-0.135, 0.068, -0.075, 0.072);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.006,
    bevelSize: 0.006,
    bevelSegments: 2,
  });
  geo.translate(0, 0, -0.014);
  return geo;
}

/**
 * Creates the crowned 18-inch F1 slick tread & rounded shoulder up to r = 0.346m
 * so it joins seamlessly with the exposed 3D bulged Pirelli sidewall with zero overlap.
 */
function createRoundedTyreTreadGeo(radius: number, width: number): THREE.BufferGeometry {
  const hw = width * 0.5;
  const pts = [
    new THREE.Vector2(0.346, -hw + 0.014),
    new THREE.Vector2(radius - 0.010, -hw + 0.028),
    new THREE.Vector2(radius - 0.003, -hw + 0.048),
    new THREE.Vector2(radius - 0.0005, -hw + 0.082),
    new THREE.Vector2(radius, 0),
    new THREE.Vector2(radius - 0.0005, hw - 0.082),
    new THREE.Vector2(radius - 0.003, hw - 0.048),
    new THREE.Vector2(radius - 0.010, hw - 0.028),
    new THREE.Vector2(0.346, hw - 0.014),
  ];
  const geo = new THREE.LatheGeometry(pts, 44);
  geo.rotateZ(Math.PI / 2);

  // Swap UVs so U = axial tyre width (0..1) and V = circumferential wrap (0..1)
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const uOrig = uv.getX(i);
    const vOrig = uv.getY(i);
    uv.setXY(i, vOrig, uOrig);
  }
  uv.needsUpdate = true;
  return geo;
}

/**
 * Creates a true 3D bulged rubber sidewall ring from outer shoulder (0.346m) to rim bead (0.228m),
 * placed at axial offset dx relative to hw so normals face cleanly outward toward +X.
 */
function createBulgedSidewallGeo(): THREE.BufferGeometry {
  const rMax = 0.346;
  const pts = [
    new THREE.Vector2(rMax, -0.014),
    new THREE.Vector2(0.332, 0.001),
    new THREE.Vector2(0.308, 0.010),
    new THREE.Vector2(0.282, 0.013),
    new THREE.Vector2(0.254, 0.005),
    new THREE.Vector2(0.236, -0.008),
    new THREE.Vector2(0.228, -0.018),
  ];
  const geo = new THREE.LatheGeometry(pts, 44);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    uvs[i * 2] = 0.5 + px / (rMax * 2);
    uvs[i * 2 + 1] = 0.5 + pz / (rMax * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

/**
 * Creates the 3D 18-inch forged metallic rim lip & stepped barrel recess (4.2cm depth).
 */
function createRimBarrelGeo(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0.232, -0.014),
    new THREE.Vector2(0.228, -0.007),
    new THREE.Vector2(0.220, -0.008),
    new THREE.Vector2(0.212, -0.048),
    new THREE.Vector2(0.205, -0.056),
  ];
  const geo = new THREE.LatheGeometry(pts, 40);
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

/**
 * Creates the recessed 3D Monoposto carbon-aero wheel cover dish seated inside the 18-inch barrel.
 */
function createAeroCoverDishGeo(): THREE.BufferGeometry {
  const rMax = 0.213;
  const pts = [
    new THREE.Vector2(rMax, -0.048),
    new THREE.Vector2(0.175, -0.040),
    new THREE.Vector2(0.125, -0.030),
    new THREE.Vector2(0.072, -0.020),
    new THREE.Vector2(0.052, -0.014),
    new THREE.Vector2(0.001, -0.016),
  ];
  const geo = new THREE.LatheGeometry(pts, 40);
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const uvs = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const px = pos.getX(i);
    const pz = pos.getZ(i);
    uvs[i * 2] = 0.5 + px / (rMax * 2);
    uvs[i * 2 + 1] = 0.5 + pz / (rMax * 2);
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.rotateZ(-Math.PI / 2);
  return geo;
}

/**
 * Merges 10 sculpted 3D radial aero blades + hub lock collar into a single draw-call geometry (+X outer).
 */
function createAeroVanesAndRingGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const blade = new THREE.BoxGeometry(0.010, 0.013, 0.132);
    // Align radially outward along YZ plane & match the concave aero cover cone slope (-0.19 rad)
    blade.rotateY(-0.19);
    blade.translate(-0.030, 0, 0.140);
    blade.rotateX(a);
    parts.push(blade);
  }
  const innerRing = new THREE.TorusGeometry(0.062, 0.0055, 8, 32);
  innerRing.rotateY(Math.PI / 2);
  innerRing.translate(-0.016, 0, 0);
  parts.push(innerRing);

  return mergeGeometries(parts, false);
}

/**
 * Creates the 5-spoke open inner rim structure visible around the glowing brake disc & caliper (+X side).
 */
function createInnerOpenSpokesGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.BoxGeometry(0.018, 0.022, 0.142);
    spoke.translate(-0.032, 0, 0.140);
    spoke.rotateX(a);
    parts.push(spoke);
  }
  const hubRing = new THREE.TorusGeometry(0.072, 0.012, 8, 24);
  hubRing.rotateY(Math.PI / 2);
  hubRing.translate(-0.032, 0, 0);
  parts.push(hubRing);

  return mergeGeometries(parts, false);
}

/**
 * Creates the protruding 3D hexagonal center-lock nut + anodized retaining collar (+X outer).
 */
function createCenterLockHubGeo(): THREE.BufferGeometry {
  const collar = new THREE.CylinderGeometry(0.048, 0.054, 0.014, 24);
  collar.rotateZ(-Math.PI / 2);
  collar.translate(-0.013, 0, 0);

  const hexNut = new THREE.CylinderGeometry(0.031, 0.037, 0.022, 6);
  hexNut.rotateZ(-Math.PI / 2);
  hexNut.translate(-0.003, 0, 0);

  return mergeGeometries([collar, hexNut], false);
}

/**
 * Builds shared sculpted front wing & over-wheel deflector geometries once for all 20 cars.
 */
const sharedFwMainplaneGeo = createSweptWingElementGeo({
  xStart: -1.03,
  xEnd: 1.03,
  spanSegs: 40,
  zLead: (_absX, t) => 3.12 - 0.28 * Math.pow(t, 1.35),
  yHeight: (_absX, t) => 0.080 + 0.022 * Math.sin(t * Math.PI * 0.72) + 0.024 * Math.pow(t, 3.2),
  chord: (_absX, t) => 0.27 - 0.045 * Math.pow(t, 1.4),
  pitch: (_absX, t) => 0.04 + 0.08 * t,
  roll: (x, t) => Math.sign(x) * 0.26 * Math.pow(Math.max(0, t - 0.78) / 0.22, 1.4),
  thickness: 0.026,
  camber: 0.015,
});

const sharedFwMainLipTrimGeo = createSweptWingElementGeo({
  xStart: -1.01,
  xEnd: 1.01,
  spanSegs: 34,
  zLead: (_absX, t) => 3.125 - 0.28 * Math.pow(t, 1.35),
  yHeight: (_absX, t) => 0.080 + 0.022 * Math.sin(t * Math.PI * 0.72) + 0.024 * Math.pow(t, 3.2),
  chord: () => 0.026,
  pitch: (_absX, t) => 0.04 + 0.08 * t,
  roll: (x, t) => Math.sign(x) * 0.26 * Math.pow(Math.max(0, t - 0.78) / 0.22, 1.4),
  thickness: 0.018,
  camber: 0.004,
});

const sharedFwFlap2Geo = createSweptWingElementGeo({
  xStart: -1.022,
  xEnd: 1.022,
  spanSegs: 40,
  zLead: (_absX, t) => 2.89 - 0.26 * Math.pow(t, 1.32),
  yHeight: (_absX, t) => 0.106 + 0.018 * Math.sin(t * Math.PI * 0.78) + 0.032 * Math.pow(t, 2.8),
  chord: (_absX, t) => 0.175 + 0.022 * Math.sin(t * Math.PI) - 0.038 * Math.pow(t, 2.2),
  pitch: (_absX, t) => 0.11 + 0.11 * Math.sin(t * Math.PI * 0.75),
  roll: (x, t) => Math.sign(x) * 0.28 * Math.pow(Math.max(0, t - 0.76) / 0.24, 1.4),
  thickness: 0.021,
  camber: 0.014,
});

function createSplitFwFlapPair(specFactory: (side: number) => SweptWingSpec): THREE.BufferGeometry {
  const left = createSweptWingElementGeo(specFactory(-1));
  const right = createSweptWingElementGeo(specFactory(1));
  return mergeGeometries([left, right], false);
}

const sharedFwFlap3Geo = createSplitFwFlapPair((side) => ({
  xStart: side < 0 ? -1.015 : 0.105,
  xEnd: side < 0 ? -0.105 : 1.015,
  spanSegs: 20,
  zLead: (_absX, t) => 2.74 - 0.24 * Math.pow(t, 1.25),
  yHeight: (_absX, t) => 0.140 + 0.018 * Math.sin(t * Math.PI * 0.8) + 0.042 * Math.pow(t, 2.4),
  chord: (_absX, t) => 0.145 + 0.024 * Math.sin(t * Math.PI) - 0.032 * Math.pow(t, 2.5),
  pitch: (_absX, t) => 0.20 + 0.10 * Math.sin(t * Math.PI * 0.8),
  roll: (x, t) => Math.sign(x) * 0.30 * Math.pow(Math.max(0, t - 0.74) / 0.26, 1.4),
  thickness: 0.018,
  camber: 0.013,
}));

const sharedFwFlap4Geo = createSplitFwFlapPair((side) => ({
  xStart: side < 0 ? -1.008 : 0.138,
  xEnd: side < 0 ? -0.138 : 1.008,
  spanSegs: 20,
  zLead: (_absX, t) => 2.61 - 0.21 * Math.pow(t, 1.22),
  yHeight: (_absX, t) => 0.178 + 0.022 * Math.sin(t * Math.PI * 0.85) + 0.056 * Math.pow(t, 2.2),
  chord: (_absX, t) => 0.115 + 0.032 * Math.sin(t * Math.PI) - 0.035 * Math.pow(t, 2.4),
  pitch: (_absX, t) => 0.28 + 0.11 * Math.sin(t * Math.PI * 0.85),
  roll: (x, t) => Math.sign(x) * 0.32 * Math.pow(Math.max(0, t - 0.72) / 0.28, 1.4),
  thickness: 0.015,
  camber: 0.011,
}));

function createSlotGapBracketsGeo(): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (const side of [-1, 1]) {
    for (const ax of [0.34, 0.58, 0.80]) {
      const t = ax / 1.03;
      const zCenter = 2.75 - 0.24 * Math.pow(t, 1.3);
      const yBase = 0.138 + 0.032 * Math.pow(t, 2.4);
      const fin = new THREE.BoxGeometry(0.008, 0.095, 0.34);
      fin.rotateX(0.18);
      fin.translate(side * ax, yBase, zCenter);
      parts.push(fin);
    }
  }
  return mergeGeometries(parts, false);
}

const sharedFwSlotBracketsGeo = createSlotGapBracketsGeo();
const sharedFwEndplateLeftGeo = createBlendedEndplateGeo(-1);
const sharedFwEndplateRightGeo = createBlendedEndplateGeo(1);
const sharedOverWheelDeflectorLeftGeo = createOverWheelDeflectorGeo(-1);
const sharedOverWheelDeflectorRightGeo = createOverWheelDeflectorGeo(1);

const frontTyreTreadGeo = createRoundedTyreTreadGeo(0.360, 0.315);
const rearTyreTreadGeo = createRoundedTyreTreadGeo(0.360, 0.410);
const sharedSidewallGeo = createBulgedSidewallGeo();
const sharedRimBarrelGeo = createRimBarrelGeo();
const sharedAeroCoverGeo = createAeroCoverDishGeo();
const sharedAeroVanesGeo = createAeroVanesAndRingGeo();
const sharedInnerSpokesGeo = createInnerOpenSpokesGeo();
const sharedCenterLockGeo = createCenterLockHubGeo();
const sharedButterflyWheelGeo = createButterflyWheelGeometry();

/**
 * Builds a Monoposto-inspired modern ground-effect Formula 1 Car with sculpted airfoils,
 * smooth continuous monocoque + roll-hoop engine cowling, ergonomic butterfly steering wheel,
 * and dished 3D Pirelli tyres. Grounded at y = 0. +Z is forward.
 */
export function buildF1CarModel(
  team: F1Team,
  driver: F1Driver,
  compound: TyreCompound = 'SOFT',
  castShadow = false,
  isPlayer = false,
): F1CarRig {
  const root = new THREE.Group();
  const rigDisposables: Array<{ dispose: () => void }> = [];
  const trackRes = <T extends { dispose: () => void }>(res: T): T => {
    rigDisposables.push(res);
    return res;
  };

  const bodyMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(team.primaryColor),
      metalness: 0.42,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    }),
  );

  const secondaryMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(team.secondaryColor),
      metalness: 0.36,
      roughness: 0.24,
      clearcoat: 0.85,
      clearcoatRoughness: 0.09,
    }),
  );

  const noseLiveryTex = trackRes(
    createNoseconeLiveryTexture(
      team.primaryColor,
      team.secondaryColor,
      team.accentColor,
      driver.number,
      team.shortName,
    ),
  );
  const noseLiveryMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      map: noseLiveryTex,
      metalness: 0.36,
      roughness: 0.16,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    }),
  );

  const engineCoverTex = trackRes(
    createEngineCoverLiveryTexture(
      team.primaryColor,
      team.secondaryColor,
      team.accentColor,
      team.shortName,
    ),
  );
  const engineCoverMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      map: engineCoverTex,
      metalness: 0.38,
      roughness: 0.17,
      clearcoat: 1.0,
      clearcoatRoughness: 0.05,
    }),
  );

  const liveryTex = trackRes(
    createTeamLiveryTexture(
      team.primaryColor,
      team.secondaryColor,
      team.accentColor,
      team.shortName,
    ),
  );
  const liveryMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      map: liveryTex,
      metalness: 0.38,
      roughness: 0.17,
      clearcoat: 1.0,
      clearcoatRoughness: 0.04,
    }),
  );

  const rwBannerTex = trackRes(
    createRearWingBannerTexture(
      team.primaryColor,
      team.secondaryColor,
      team.accentColor,
      team.shortName,
    ),
  );
  const rwBannerMat = trackRes(
    new THREE.MeshStandardMaterial({
      map: rwBannerTex,
      roughness: 0.28,
      metalness: 0.22,
    }),
  );

  const accentMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(team.accentColor),
      metalness: 0.35,
      roughness: 0.19,
      clearcoat: 0.88,
    }),
  );

  const carbonMat = new THREE.MeshStandardMaterial({
    map: sharedCarbonWeaveTex,
    color: 0xffffff,
    metalness: 0.32,
    roughness: 0.42,
  });

  const darkVoidMat = new THREE.MeshStandardMaterial({
    color: 0x050608,
    roughness: 0.92,
    metalness: 0.08,
  });

  const centerLockMat = trackRes(
    new THREE.MeshStandardMaterial({
      color: 0xcbd5e1,
      metalness: 0.92,
      roughness: 0.16,
    }),
  );

  const helmetMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(driver.helmetPrimary),
    metalness: 0.54,
    roughness: 0.12,
    clearcoat: 1.0,
  });

  const visorMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(driver.helmetAccent),
    metalness: 0.94,
    roughness: 0.04,
    clearcoat: 1.0,
    iridescence: 0.92,
  });

  const rearRainLight = new THREE.MeshStandardMaterial({
    color: 0x7f1d1d,
    emissive: new THREE.Color(0xff1e00),
    emissiveIntensity: 0.4,
    roughness: 0.2,
  });

  // 1. Contact Shadow
  const shadowPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(2.95, 6.5),
    new THREE.MeshBasicMaterial({
      map: sharedContactShadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.82,
    }),
  );
  shadowPlane.rotation.x = -Math.PI / 2;
  shadowPlane.position.y = 0.016;
  root.add(shadowPlane);

  // 2. Sculpted Carbon Venturi Floor, Floor-Edge Airfoil Wings & Multi-Strake Diffuser
  const floorShape = new THREE.Shape();
  floorShape.moveTo(0, 1.46);
  floorShape.lineTo(0.42, 1.34);
  floorShape.lineTo(0.92, 0.86);
  floorShape.lineTo(0.96, -1.34);
  floorShape.lineTo(0.66, -2.18);
  floorShape.lineTo(-0.66, -2.18);
  floorShape.lineTo(-0.96, -1.34);
  floorShape.lineTo(-0.92, 0.86);
  floorShape.lineTo(-0.42, 1.34);
  floorShape.closePath();

  const floorGeo = new THREE.ExtrudeGeometry(floorShape, {
    depth: 0.036,
    bevelEnabled: true,
    bevelThickness: 0.012,
    bevelSize: 0.018,
    bevelSegments: 2,
  });
  floorGeo.rotateX(Math.PI / 2);
  const floor = new THREE.Mesh(floorGeo, carbonMat);
  floor.position.set(0, 0.105, 0);
  floor.castShadow = castShadow;
  root.add(floor);

  const edgeBladeGeo = createAirfoilWingGeometry(2.12, 0.08, 0.022, 0.008);
  edgeBladeGeo.rotateY(Math.PI / 2);
  for (const side of [-1, 1]) {
    for (let f = 0; f < 3; f++) {
      const fence = new THREE.Mesh(new THREE.BoxGeometry(0.016, 0.16, 0.56), carbonMat);
      fence.position.set(side * (0.50 + f * 0.17), 0.15, 0.96);
      fence.rotation.y = side * 0.15;
      root.add(fence);
    }

    const edgeBlade = new THREE.Mesh(edgeBladeGeo, carbonMat);
    edgeBlade.position.set(side * 0.96, 0.13, -0.32);
    edgeBlade.rotation.z = side * 0.2;
    root.add(edgeBlade);

    const edgeStripe = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.018, 1.95), accentMat);
    edgeStripe.position.set(side * 0.98, 0.135, -0.32);
    root.add(edgeStripe);

    for (const sx of [0.24, 0.48]) {
      const strake = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.22, 0.54), carbonMat);
      strake.position.set(side * sx, 0.195, -2.16);
      root.add(strake);
    }
  }

  const diffuserRamp = new THREE.Mesh(
    createAirfoilWingGeometry(1.22, 0.58, 0.04, 0.01),
    carbonMat,
  );
  diffuserRamp.position.set(0, 0.20, -2.12);
  diffuserRamp.rotation.x = 0.26;
  root.add(diffuserRamp);

  const fwEndplateTex = trackRes(
    createFrontEndplateTexture(
      team.primaryColor,
      team.secondaryColor,
      team.accentColor,
      team.shortName,
    ),
  );
  const fwEndplateMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      map: fwEndplateTex,
      metalness: 0.34,
      roughness: 0.18,
      clearcoat: 0.92,
      clearcoatRoughness: 0.05,
    }),
  );

  // 3. Smooth Continuous 15-Station Monocoque Spoon Nose + Rear Tub Loft + T-Tray Keel
  const frontMonocoqueGeo = trackRes(
    createLoftedBodyGeometry(
      [
        { z: 3.12, xCenter: 0, yCenter: 0.150, rx: 0.044, ryTop: 0.022, ryBot: 0.014, power: 2.1 },
        { z: 3.04, xCenter: 0, yCenter: 0.158, rx: 0.072, ryTop: 0.032, ryBot: 0.021, power: 2.3 },
        { z: 2.90, xCenter: 0, yCenter: 0.174, rx: 0.105, ryTop: 0.044, ryBot: 0.030, power: 2.5 },
        { z: 2.70, xCenter: 0, yCenter: 0.198, rx: 0.132, ryTop: 0.056, ryBot: 0.042, power: 2.6 },
        { z: 2.46, xCenter: 0, yCenter: 0.232, rx: 0.154, ryTop: 0.072, ryBot: 0.060, power: 2.8 },
        { z: 2.20, xCenter: 0, yCenter: 0.272, rx: 0.176, ryTop: 0.088, ryBot: 0.078, power: 2.9 },
        { z: 1.92, xCenter: 0, yCenter: 0.314, rx: 0.198, ryTop: 0.106, ryBot: 0.102, power: 3.0 },
        { z: 1.62, xCenter: 0, yCenter: 0.352, rx: 0.228, ryTop: 0.130, ryBot: 0.134, power: 3.1 },
        { z: 1.32, xCenter: 0, yCenter: 0.380, rx: 0.268, ryTop: 0.150, ryBot: 0.166, power: 3.15 },
        { z: 1.02, xCenter: 0, yCenter: 0.394, rx: 0.304, ryTop: 0.168, ryBot: 0.192, power: 3.2 },
        { z: 0.76, xCenter: 0, yCenter: 0.394, rx: 0.320, ryTop: 0.174, ryBot: 0.204, power: 3.2 },
        { z: 0.50, xCenter: 0, yCenter: 0.386, rx: 0.322, ryTop: 0.175, ryBot: 0.202, power: 3.2 },
      ],
      36,
      { capFront: true, zUv: true },
    ),
  );
  const monocoque = new THREE.Mesh(frontMonocoqueGeo, noseLiveryMat);
  monocoque.castShadow = castShadow;
  root.add(monocoque);

  const rearTubGeo = trackRes(
    createLoftedBodyGeometry(
      [
        { z: 0.50, xCenter: 0, yCenter: 0.386, rx: 0.322, ryTop: 0.175, ryBot: 0.202, power: 3.2 },
        { z: 0.18, xCenter: 0, yCenter: 0.370, rx: 0.320, ryTop: 0.175, ryBot: 0.196, power: 3.2 },
        { z: -0.35, xCenter: 0, yCenter: 0.360, rx: 0.265, ryTop: 0.220, ryBot: 0.200, power: 2.6 },
        { z: -1.10, xCenter: 0, yCenter: 0.350, rx: 0.165, ryTop: 0.200, ryBot: 0.195, power: 2.2 },
        { z: -1.85, xCenter: 0, yCenter: 0.310, rx: 0.095, ryTop: 0.140, ryBot: 0.140, power: 2.0 },
        { z: -2.32, xCenter: 0, yCenter: 0.280, rx: 0.045, ryTop: 0.075, ryBot: 0.075, power: 2.0 },
      ],
      28,
      { capRear: true, zUv: true },
    ),
  );
  const rearTub = new THREE.Mesh(rearTubGeo, secondaryMat);
  rearTub.castShadow = castShadow;
  root.add(rearTub);

  // Nose-Tip Driver Cooling NACA Duct & Under-Chassis Front T-Tray Carbon Splitter
  const nacaInlet = new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.022, 0.032, 12), darkVoidMat);
  nacaInlet.scale.set(1.35, 1, 0.55);
  nacaInlet.rotation.x = Math.PI / 2 - 0.18;
  nacaInlet.position.set(0, 0.156, 3.128);
  root.add(nacaInlet);

  const tTrayBib = new THREE.Mesh(
    trackRes(createAirfoilWingGeometry(0.28, 0.54, 0.024, 0)),
    carbonMat,
  );
  tTrayBib.position.set(0, 0.102, 1.56);
  root.add(tTrayBib);

  const tTraySkid = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.01, 0.12), centerLockMat);
  tTraySkid.position.set(0, 0.094, 1.78);
  root.add(tTraySkid);

  // FIA Forward Nose Camera Pods (twin sculpted horizontal winglets + anodized barrels + lenses)
  const camWingletGeo = trackRes(createAirfoilWingGeometry(0.088, 0.095, 0.014, 0));
  const camPodGeo = trackRes(new THREE.CylinderGeometry(0.018, 0.021, 0.155, 12));
  camPodGeo.rotateX(Math.PI / 2);
  const camLensMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      color: 0x0f172a,
      metalness: 0.9,
      roughness: 0.05,
      clearcoat: 1.0,
    }),
  );
  for (const side of [-1, 1]) {
    const stalk = new THREE.Mesh(camWingletGeo, carbonMat);
    stalk.position.set(side * 0.175, 0.244, 2.52);
    root.add(stalk);

    const pod = new THREE.Mesh(camPodGeo, carbonMat);
    pod.position.set(side * 0.218, 0.244, 2.53);
    root.add(pod);

    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.014, 12), camLensMat);
    lens.position.set(side * 0.218, 0.244, 2.609);
    root.add(lens);
  }

  // Sculpted Teardrop Roll-Hoop Airbox & Engine Cover Cowling (blends behind helmet!)
  const engineCoverGeo = trackRes(
    createLoftedBodyGeometry(
      [
        { z: 0.02, xCenter: 0, yCenter: 0.72, rx: 0.15, ryTop: 0.22, ryBot: 0.18, power: 2.1 },
        { z: -0.22, xCenter: 0, yCenter: 0.70, rx: 0.21, ryTop: 0.24, ryBot: 0.24, power: 2.2 },
        { z: -0.72, xCenter: 0, yCenter: 0.62, rx: 0.18, ryTop: 0.26, ryBot: 0.24, power: 2.1 },
        { z: -1.38, xCenter: 0, yCenter: 0.48, rx: 0.11, ryTop: 0.21, ryBot: 0.18, power: 2.0 },
        { z: -1.96, xCenter: 0, yCenter: 0.35, rx: 0.06, ryTop: 0.10, ryBot: 0.10, power: 2.0 },
      ],
      22,
    ),
  );
  const engineCover = new THREE.Mesh(engineCoverGeo, engineCoverMat);
  engineCover.castShadow = castShadow;
  root.add(engineCover);

  // Stainless Multi-Probe Pitot Sensor Boom forward of cockpit bulkhead
  const pitot = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.007, 0.16, 8), centerLockMat);
  pitot.position.set(0, 0.562, 1.06);
  pitot.rotation.x = 0.22;
  root.add(pitot);

  const chassisFlowWing = new THREE.Mesh(
    trackRes(createAirfoilWingGeometry(0.16, 0.07, 0.012, 0.004)),
    carbonMat,
  );
  chassisFlowWing.position.set(0, 0.566, 0.92);
  root.add(chassisFlowWing);

  // Sculpted Dorsal Shark Fin + Airbox Intake + Overhead T-Cam
  const finShape = new THREE.Shape();
  finShape.moveTo(-0.22, 0.91);
  finShape.lineTo(-1.42, 0.93);
  finShape.lineTo(-2.00, 0.44);
  finShape.lineTo(-0.56, 0.66);
  finShape.closePath();
  const finGeo = new THREE.ExtrudeGeometry(finShape, {
    depth: 0.02,
    bevelEnabled: true,
    bevelThickness: 0.004,
    bevelSize: 0.004,
  });
  finGeo.translate(0, 0, -0.01);
  finGeo.rotateY(-Math.PI / 2);
  root.add(new THREE.Mesh(finGeo, secondaryMat));

  const finTopTrim = new THREE.Mesh(new THREE.BoxGeometry(0.026, 0.022, 1.18), accentMat);
  finTopTrim.position.set(0, 0.935, -0.82);
  root.add(finTopTrim);

  // Dark recessed Airbox Intake Mouth
  const airboxVoid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.095, 0.11, 0.08, 16),
    darkVoidMat,
  );
  airboxVoid.rotation.x = Math.PI / 2;
  airboxVoid.position.set(0, 0.85, 0.01);
  root.add(airboxVoid);

  const tCamStalk = new THREE.Mesh(
    createAirfoilWingGeometry(0.04, 0.08, 0.022, 0),
    carbonMat,
  );
  tCamStalk.rotation.z = Math.PI / 2;
  tCamStalk.position.set(0, 1.00, -0.22);
  root.add(tCamStalk);

  const tCamBar = new THREE.Mesh(
    createAirfoilWingGeometry(0.44, 0.07, 0.032, 0),
    new THREE.MeshStandardMaterial({
      color: driver.number % 2 === 0 ? 0xfacc15 : 0x111827,
      roughness: 0.24,
    }),
  );
  tCamBar.position.set(0, 1.07, -0.22);
  root.add(tCamBar);

  // 4. Sculpted Deep-Undercut Downwash Sidepods + Overbite Shark-Lip + Airfoil Wing Mirrors
  const mirrorPodGeo = createAirfoilWingGeometry(0.16, 0.095, 0.052, 0.012);
  const shoulderWingGeo = createAirfoilWingGeometry(0.12, 0.34, 0.018, 0.008);

  for (const side of [-1, 1]) {
    const sidepodGeo = createLoftedBodyGeometry(
      [
        { z: 0.86, xCenter: side * 0.48, yCenter: 0.39, rx: 0.24, ryTop: 0.105, ryBot: 0.115, power: 2.7 },
        { z: 0.56, xCenter: side * 0.54, yCenter: 0.37, rx: 0.295, ryTop: 0.148, ryBot: 0.165, power: 2.5 },
        { z: -0.04, xCenter: side * 0.52, yCenter: 0.335, rx: 0.275, ryTop: 0.148, ryBot: 0.165, power: 2.4 },
        { z: -0.78, xCenter: side * 0.40, yCenter: 0.275, rx: 0.20, ryTop: 0.125, ryBot: 0.135, power: 2.2 },
        { z: -1.48, xCenter: side * 0.24, yCenter: 0.215, rx: 0.11, ryTop: 0.078, ryBot: 0.088, power: 2.0 },
        { z: -1.92, xCenter: side * 0.14, yCenter: 0.185, rx: 0.048, ryTop: 0.04, ryBot: 0.048, power: 2.0 },
      ],
      24,
    );
    const pod = new THREE.Mesh(sidepodGeo, liveryMat);
    pod.castShadow = castShadow;
    root.add(pod);

    const sharkLip = new THREE.Mesh(
      createAirfoilWingGeometry(0.36, 0.15, 0.028, 0.01),
      bodyMat,
    );
    sharkLip.position.set(side * 0.50, 0.475, 0.85);
    sharkLip.rotation.y = side * -0.14;
    root.add(sharkLip);

    const inletVoid = new THREE.Mesh(new THREE.BoxGeometry(0.31, 0.14, 0.06), darkVoidMat);
    inletVoid.position.set(side * 0.50, 0.39, 0.83);
    inletVoid.rotation.y = side * -0.14;
    root.add(inletVoid);

    const shoulderWing = new THREE.Mesh(shoulderWingGeo, carbonMat);
    shoulderWing.position.set(side * 0.43, 0.52, 0.72);
    shoulderWing.rotation.z = side * -0.16;
    root.add(shoulderWing);

    // Sculpted Wing Mirrors on Tapered Carbon Stalks
    const mirrorStalkMain = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.015, 0.26, 6), carbonMat);
    mirrorStalkMain.rotation.z = Math.PI / 2;
    mirrorStalkMain.position.set(side * 0.44, 0.615, 0.62);
    root.add(mirrorStalkMain);

    const mirrorPod = new THREE.Mesh(mirrorPodGeo, bodyMat);
    mirrorPod.position.set(side * 0.58, 0.635, 0.62);
    mirrorPod.rotation.y = side * -0.18;
    root.add(mirrorPod);
  }

  // 5. Sculpted Continuous Gullwing 4-Element Swept Carbon Front Wing + Titanium Slot Brackets + Blended S-Diveplate Endplates
  for (const pylonSide of [-1, 1]) {
    const pylon = new THREE.Mesh(
      trackRes(createAirfoilWingGeometry(0.088, 0.22, 0.016, 0)),
      carbonMat,
    );
    pylon.rotation.z = Math.PI / 2;
    pylon.position.set(pylonSide * 0.056, 0.125, 2.94);
    root.add(pylon);
  }

  const fwMainplane = new THREE.Mesh(sharedFwMainplaneGeo, carbonMat);
  fwMainplane.castShadow = castShadow;
  root.add(fwMainplane);

  const fwMainLip = new THREE.Mesh(sharedFwMainLipTrimGeo, accentMat);
  root.add(fwMainLip);

  const fwFlap2 = new THREE.Mesh(sharedFwFlap2Geo, bodyMat);
  fwFlap2.castShadow = castShadow;
  root.add(fwFlap2);

  const fwFlap3 = new THREE.Mesh(sharedFwFlap3Geo, secondaryMat);
  fwFlap3.castShadow = castShadow;
  root.add(fwFlap3);

  const fwFlap4 = new THREE.Mesh(sharedFwFlap4Geo, accentMat);
  fwFlap4.castShadow = castShadow;
  root.add(fwFlap4);

  const fwSlotBrackets = new THREE.Mesh(sharedFwSlotBracketsGeo, centerLockMat);
  root.add(fwSlotBrackets);

  const footplateGeo = trackRes(createAirfoilWingGeometry(0.068, 0.46, 0.016, 0.004));
  for (const side of [-1, 1]) {
    const endplate = new THREE.Mesh(
      side < 0 ? sharedFwEndplateLeftGeo : sharedFwEndplateRightGeo,
      fwEndplateMat,
    );
    endplate.position.set(side * 1.015, 0, 0);
    endplate.castShadow = castShadow;
    root.add(endplate);

    // Sculpted S-curve outer endplate diveplane winglet
    const diveCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(side * 1.045, 0.17, 2.80),
      new THREE.Vector3(side * 1.078, 0.225, 2.66),
      new THREE.Vector3(side * 1.088, 0.275, 2.48),
      new THREE.Vector3(side * 1.072, 0.255, 2.36),
    ]);
    const sDiveGeo = trackRes(new THREE.TubeGeometry(diveCurve, 14, 0.015, 6, false));
    sDiveGeo.scale(1.2, 0.42, 1.0);
    root.add(new THREE.Mesh(sDiveGeo, accentMat));

    // Lower carbon footplate edge blade hugging the endplate base
    const footplate = new THREE.Mesh(footplateGeo, carbonMat);
    footplate.position.set(side * 1.05, 0.088, 2.58);
    root.add(footplate);
  }

  // 6. Sculpted Open Cockpit Coaming, Headrest Bolsters, Butterfly Steering Wheel & Halo
  const coamingCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.24, 0.54, 0.02),
    new THREE.Vector3(-0.25, 0.54, 0.45),
    new THREE.Vector3(0, 0.53, 0.68),
    new THREE.Vector3(0.25, 0.54, 0.45),
    new THREE.Vector3(0.24, 0.54, 0.02),
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(coamingCurve, 20, 0.035, 8, false), carbonMat));

  const cockpitTub = new THREE.Mesh(
    new THREE.CylinderGeometry(0.21, 0.21, 0.14, 16),
    darkVoidMat,
  );
  cockpitTub.scale.set(1.05, 1, 1.8);
  cockpitTub.position.set(0, 0.47, 0.30);
  root.add(cockpitTub);

  const headrest = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.20, 0.14, 16, 1, false, Math.PI * 0.55, Math.PI * 0.9),
    carbonMat,
  );
  headrest.position.set(0, 0.58, 0.14);
  root.add(headrest);

  const shoulders = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.21, 0.16, 14),
    secondaryMat,
  );
  shoulders.scale.set(1.25, 0.7, 0.8);
  shoulders.position.set(0, 0.555, 0.21);
  root.add(shoulders);

  // Ergonomic Animated Butterfly F1 Steering Wheel (live OLED for player car)
  const steeringWheelGroup = new THREE.Group();
  steeringWheelGroup.position.set(0, 0.625, 0.56);
  steeringWheelGroup.rotation.x = -0.34;

  const wheelBody = new THREE.Mesh(sharedButterflyWheelGeo, carbonMat);
  steeringWheelGroup.add(wheelBody);

  for (const side of [-1, 1]) {
    const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.019, 0.021, 0.115, 10), secondaryMat);
    grip.position.set(side * 0.128, -0.008, 0);
    steeringWheelGroup.add(grip);

    const paddle = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.032, 0.012), accentMat);
    paddle.position.set(side * 0.092, 0.01, 0.022);
    steeringWheelGroup.add(paddle);
  }

  let liveScreenCtrl: LiveWheelScreenController | null = null;
  if (isPlayer) {
    liveScreenCtrl = createLiveWheelScreenController();
    rigDisposables.push(liveScreenCtrl);
  }
  const wheelScreenMat = trackRes(
    new THREE.MeshBasicMaterial({
      map: liveScreenCtrl ? liveScreenCtrl.texture : sharedWheelScreenTex,
    }),
  );
  const wheelScreen = new THREE.Mesh(new THREE.PlaneGeometry(0.165, 0.104), wheelScreenMat);
  wheelScreen.position.set(0, 0.01, -0.022);
  wheelScreen.rotation.y = Math.PI;
  steeringWheelGroup.add(wheelScreen);

  const steeringColumn = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, 0.22, 8),
    carbonMat,
  );
  steeringColumn.rotation.x = Math.PI / 2 - 0.34;
  steeringColumn.position.set(0, 0.585, 0.66);
  root.add(steeringColumn);
  root.add(steeringWheelGroup);

  // Driver Aerodynamic Helmet + Rear Spoiler + Iridescent Visor (grouped for Cockpit visibility toggle)
  const helmetGroup = new THREE.Group();
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.152, 24, 18), helmetMat);
  helmet.scale.set(0.94, 1.0, 1.12);
  helmet.position.set(0, 0.685, 0.21);
  helmetGroup.add(helmet);

  const helmetSpoiler = new THREE.Mesh(
    createAirfoilWingGeometry(0.16, 0.09, 0.025, 0.006),
    accentMat,
  );
  helmetSpoiler.position.set(0, 0.765, 0.09);
  helmetSpoiler.rotation.x = 0.28;
  helmetGroup.add(helmetSpoiler);

  const visor = new THREE.Mesh(
    new THREE.CylinderGeometry(0.154, 0.154, 0.074, 22, 1, false, -0.88, 1.76),
    visorMat,
  );
  visor.position.set(0, 0.695, 0.23);
  helmetGroup.add(visor);
  root.add(helmetGroup);

  const haloCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.22, 0.59, 0.02),
    new THREE.Vector3(-0.20, 0.80, 0.42),
    new THREE.Vector3(0, 0.84, 0.74),
    new THREE.Vector3(0.20, 0.80, 0.42),
    new THREE.Vector3(0.22, 0.59, 0.02),
  ]);
  root.add(new THREE.Mesh(new THREE.TubeGeometry(haloCurve, 26, 0.026, 10, false), bodyMat));

  const haloPillar = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.26, 10), bodyMat);
  haloPillar.position.set(0, 0.70, 0.76);
  haloPillar.rotation.x = 0.44;
  root.add(haloPillar);

  const haloTopAccent = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.012, 0.26), accentMat);
  haloTopAccent.position.set(0, 0.845, 0.59);
  haloTopAccent.rotation.x = 0.14;
  root.add(haloTopAccent);

  // 7. Cambered Airfoil Rear Wing, Articulated Trailing-Hinge DRS Flap & Double Beam Wing
  const swanShape = new THREE.Shape();
  swanShape.moveTo(-2.06, 0.36);
  swanShape.lineTo(-1.92, 0.36);
  swanShape.quadraticCurveTo(-1.98, 0.76, -2.06, 0.96);
  swanShape.lineTo(-2.20, 0.96);
  swanShape.quadraticCurveTo(-2.14, 0.70, -2.06, 0.36);
  const swanGeo = new THREE.ExtrudeGeometry(swanShape, { depth: 0.036, bevelEnabled: false });
  swanGeo.translate(0, 0, -0.018);
  swanGeo.rotateY(-Math.PI / 2);
  root.add(new THREE.Mesh(swanGeo, carbonMat));

  const drsPod = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.032, 0.30, 12), carbonMat);
  drsPod.rotation.x = Math.PI / 2;
  drsPod.position.set(0, 0.96, -2.14);
  root.add(drsPod);

  // Double-Element Cambered Beam Wing
  const beamWingGeo = createAirfoilWingGeometry(0.94, 0.16, 0.032, 0.012);
  for (let b = 0; b < 2; b++) {
    const beamWing = new THREE.Mesh(beamWingGeo, carbonMat);
    beamWing.position.set(0, 0.45 + b * 0.075, -2.16 - b * 0.08);
    beamWing.rotation.x = 0.22 + b * 0.08;
    root.add(beamWing);
  }

  // Sculpted Cutaway Curved Rear Wing Endplates
  const rwEndShape = new THREE.Shape();
  rwEndShape.moveTo(-2.28, 0.38);
  rwEndShape.lineTo(-1.98, 0.40);
  rwEndShape.quadraticCurveTo(-1.88, 0.88, -2.02, 1.03);
  rwEndShape.lineTo(-2.40, 1.03);
  rwEndShape.quadraticCurveTo(-2.42, 0.66, -2.28, 0.38);
  rwEndShape.closePath();
  const rwEndGeo = new THREE.ExtrudeGeometry(rwEndShape, {
    depth: 0.028,
    bevelEnabled: true,
    bevelThickness: 0.008,
    bevelSize: 0.008,
  });
  rwEndGeo.translate(0, 0, -0.014);
  rwEndGeo.rotateY(-Math.PI / 2);

  for (const side of [-1, 1]) {
    const rwEnd = new THREE.Mesh(rwEndGeo, secondaryMat);
    rwEnd.position.set(side * 0.56, 0, 0);
    rwEnd.castShadow = castShadow;
    root.add(rwEnd);

    const rwTrim = new THREE.Mesh(new THREE.BoxGeometry(0.034, 0.055, 0.34), accentMat);
    rwTrim.position.set(side * 0.565, 0.96, -2.20);
    root.add(rwTrim);
  }

  const rearMainPlane = new THREE.Mesh(
    createAirfoilWingGeometry(1.10, 0.27, 0.048, 0.022),
    carbonMat,
  );
  rearMainPlane.position.set(0, 0.86, -2.14);
  rearMainPlane.rotation.x = 0.22;
  root.add(rearMainPlane);

  // Mechanical Trailing-Edge DRS Flap Pivot with Team Sponsor Graphic Face
  const drsPivot = new THREE.Group();
  drsPivot.position.set(0, 1.00, -2.31);
  drsPivot.rotation.x = 0.44;
  const drsFlap = new THREE.Mesh(
    createAirfoilWingGeometry(1.08, 0.21, 0.036, 0.014),
    accentMat,
  );
  drsFlap.position.set(0, 0, 0.105);
  drsPivot.add(drsFlap);

  const rearWingFace = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.21), rwBannerMat);
  rearWingFace.position.set(0, 0.02, 0.088);
  rearWingFace.rotation.y = Math.PI;
  rearWingFace.rotation.x = -0.18;
  drsPivot.add(rearWingFace);

  const frontWingFace = new THREE.Mesh(new THREE.PlaneGeometry(1.04, 0.21), rwBannerMat);
  frontWingFace.position.set(0, 0.02, 0.124);
  frontWingFace.rotation.x = -0.18;
  drsPivot.add(frontWingFace);

  root.add(drsPivot);

  // Exhaust Tailpipe + Twin Wastegates + FIA Rear Rain/ERS Light
  const exhaustMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.92,
    roughness: 0.16,
  });
  const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.058, 0.22, 14), exhaustMat);
  exhaust.rotation.x = Math.PI / 2;
  exhaust.position.set(0, 0.42, -2.22);
  root.add(exhaust);

  for (const side of [-1, 1]) {
    const wg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.18, 10), exhaustMat);
    wg.rotation.x = Math.PI / 2;
    wg.position.set(side * 0.085, 0.39, -2.22);
    root.add(wg);
  }

  const rainLightMesh = new THREE.Mesh(new THREE.BoxGeometry(0.085, 0.145, 0.05), rearRainLight);
  rainLightMesh.position.set(0, 0.28, -2.37);
  root.add(rainLightMesh);

  // 8. Carbon Wishbones, Pushrods, Curved Brembo Calipers, Glowing Discs & 3D Dished Pirelli Tyres
  const wheelRadius = 0.360;
  const frontWheelZ = 1.82;
  const rearWheelZ = -1.72;
  const wheelTrackX = 0.96;

  const tyreTreadMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      map: sharedTyreTreadTex,
      roughness: 0.78,
      metalness: 0.02,
      clearcoat: 0.04,
      clearcoatRoughness: 0.6,
    }),
  );

  const rimMetalMat = trackRes(
    new THREE.MeshStandardMaterial({
      color: 0x475569,
      metalness: 0.88,
      roughness: 0.22,
    }),
  );

  const aeroCoverMat = trackRes(
    new THREE.MeshPhysicalMaterial({
      map: sharedAeroCoverTex,
      metalness: 0.42,
      roughness: 0.34,
      clearcoat: 0.3,
      clearcoatRoughness: 0.28,
    }),
  );

  const aeroVaneMat = trackRes(
    new THREE.MeshStandardMaterial({
      color: 0x3b4458,
      metalness: 0.78,
      roughness: 0.26,
    }),
  );

  const sidewallMatsByCompound: Record<TyreCompound, THREE.MeshPhysicalMaterial> = {
    SOFT: trackRes(
      new THREE.MeshPhysicalMaterial({
        map: sharedTyreTexByCompound.SOFT,
        roughness: 0.58,
        metalness: 0.03,
        clearcoat: 0.06,
        clearcoatRoughness: 0.55,
      }),
    ),
    MEDIUM: trackRes(
      new THREE.MeshPhysicalMaterial({
        map: sharedTyreTexByCompound.MEDIUM,
        roughness: 0.58,
        metalness: 0.03,
        clearcoat: 0.06,
        clearcoatRoughness: 0.55,
      }),
    ),
    HARD: trackRes(
      new THREE.MeshPhysicalMaterial({
        map: sharedTyreTexByCompound.HARD,
        roughness: 0.58,
        metalness: 0.03,
        clearcoat: 0.06,
        clearcoatRoughness: 0.55,
      }),
    ),
  };

  const nutCollarMatByCompound: Record<TyreCompound, THREE.MeshStandardMaterial> = {
    SOFT: trackRes(new THREE.MeshStandardMaterial({ color: 0xff2424, metalness: 0.65, roughness: 0.25 })),
    MEDIUM: trackRes(new THREE.MeshStandardMaterial({ color: 0xffd60a, metalness: 0.65, roughness: 0.25 })),
    HARD: trackRes(new THREE.MeshStandardMaterial({ color: 0xf8fafc, metalness: 0.55, roughness: 0.25 })),
  };

  const wheels: THREE.Group[] = [];
  const sidewallMeshes: THREE.Mesh[] = [];
  const nutCollarMeshes: THREE.Mesh[] = [];
  const frontWheelPivots: THREE.Group[] = [];
  const brakeGlowMats: THREE.MeshStandardMaterial[] = [];

  const wheelConfigs = [
    { x: -wheelTrackX, z: frontWheelZ, width: 0.315, isFront: true },
    { x: wheelTrackX, z: frontWheelZ, width: 0.315, isFront: true },
    { x: -wheelTrackX, z: rearWheelZ, width: 0.410, isFront: false },
    { x: wheelTrackX, z: rearWheelZ, width: 0.410, isFront: false },
  ];

  const caliperGeo = new THREE.TorusGeometry(0.20, 0.036, 8, 12, Math.PI * 0.42);
  caliperGeo.rotateY(Math.PI / 2);

  // Look-clean slim carbon wishbone A-arms, steering tie-rod, brake scoop & upright-mounted over-wheel deflectors
  const armGeo = trackRes(createAirfoilWingGeometry(0.70, 0.040, 0.015, 0));
  for (const wc of wheelConfigs) {
    const sideSign = Math.sign(wc.x);
    for (const dy of [-0.088, 0.104]) {
      const armFront = new THREE.Mesh(armGeo, carbonMat);
      armFront.position.set(wc.x * 0.52, wheelRadius + dy, wc.z + 0.14);
      armFront.rotation.y = sideSign * 0.28;
      root.add(armFront);

      const armRear = new THREE.Mesh(armGeo, carbonMat);
      armRear.position.set(wc.x * 0.52, wheelRadius + dy, wc.z - 0.15);
      armRear.rotation.y = sideSign * -0.28;
      root.add(armRear);
    }

    if (wc.isFront) {
      const trackRod = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.70, 6), carbonMat);
      trackRod.rotation.z = Math.PI / 2;
      trackRod.position.set(wc.x * 0.52, wheelRadius - 0.024, wc.z + 0.04);
      root.add(trackRod);
    }

    const pushrod = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.70, 6), carbonMat);
    pushrod.rotation.z = Math.PI / 2 - sideSign * 0.24;
    pushrod.position.set(wc.x * 0.52, wheelRadius + 0.052, wc.z);
    root.add(pushrod);

    const pivot = new THREE.Group();
    pivot.position.set(wc.x, wheelRadius, wc.z);
    root.add(pivot);
    if (wc.isFront) frontWheelPivots.push(pivot);

    // Sculpted Brake Duct Scoop + Upright-Mounted Carbon Over-Wheel Aero Deflector (steers cleanly with wheel!)
    const duct = new THREE.Mesh(
      trackRes(createAirfoilWingGeometry(0.21, 0.24, 0.062, 0.014)),
      carbonMat,
    );
    duct.rotation.z = Math.PI / 2;
    duct.position.set(-sideSign * (wc.width * 0.5 + 0.022), 0, 0.03);
    pivot.add(duct);

    if (wc.isFront) {
      const deflector = new THREE.Mesh(
        sideSign < 0 ? sharedOverWheelDeflectorLeftGeo : sharedOverWheelDeflectorRightGeo,
        carbonMat,
      );
      deflector.position.set(-sideSign * (wc.width * 0.5 + 0.034), 0, 0);
      pivot.add(deflector);

      const deflectorStay = new THREE.Mesh(new THREE.BoxGeometry(0.036, 0.014, 0.08), carbonMat);
      deflectorStay.position.set(-sideSign * (wc.width * 0.5 + 0.022), 0.175, 0.21);
      pivot.add(deflectorStay);
    }

    const caliper = new THREE.Mesh(caliperGeo, accentMat);
    caliper.position.x = -sideSign * 0.10;
    caliper.rotation.x = Math.PI * 0.85;
    pivot.add(caliper);

    // Glowing Carbon-Ceramic Brake Disc inside hub
    const brakeGlowMat = trackRes(
      new THREE.MeshStandardMaterial({
        color: 0x334155,
        emissive: new THREE.Color(0xff4500),
        emissiveIntensity: 0,
        roughness: 0.38,
        metalness: 0.72,
      }),
    );
    brakeGlowMats.push(brakeGlowMat);
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(0.21, 0.21, 0.048, 20),
      brakeGlowMat,
    );
    disc.rotation.z = Math.PI / 2;
    disc.position.x = -Math.sign(wc.x) * 0.11;
    pivot.add(disc);

    // Rotating Monoposto Wheel Group: Slick Tread + Seamless 3D Bulged Sidewalls + 18-inch Rim & Aero Cover
    const wheelGroup = new THREE.Group();
    const treadMesh = new THREE.Mesh(
      wc.isFront ? frontTyreTreadGeo : rearTyreTreadGeo,
      tyreTreadMat,
    );
    treadMesh.castShadow = castShadow;
    wheelGroup.add(treadMesh);

    const hw = wc.width * 0.5;
    const isRightWheel = wc.x > 0;

    // Outer wheel face (mirrors cleanly for left/right wheels so text & aero blades always read right-side outward)
    const outerFace = new THREE.Group();
    outerFace.rotation.y = isRightWheel ? 0 : Math.PI;

    const outerSidewall = new THREE.Mesh(sharedSidewallGeo, sidewallMatsByCompound[compound]);
    outerSidewall.position.x = hw;
    outerFace.add(outerSidewall);
    sidewallMeshes.push(outerSidewall);

    const outerRimBarrel = new THREE.Mesh(sharedRimBarrelGeo, rimMetalMat);
    outerRimBarrel.position.x = hw;
    outerFace.add(outerRimBarrel);

    const outerAeroCover = new THREE.Mesh(sharedAeroCoverGeo, aeroCoverMat);
    outerAeroCover.position.x = hw;
    outerFace.add(outerAeroCover);

    const outerAeroVanes = new THREE.Mesh(sharedAeroVanesGeo, aeroVaneMat);
    outerAeroVanes.position.x = hw;
    outerFace.add(outerAeroVanes);

    const outerCenterLock = new THREE.Mesh(sharedCenterLockGeo, centerLockMat);
    outerCenterLock.position.x = hw;
    outerFace.add(outerCenterLock);

    const nutCollar = new THREE.Mesh(
      new THREE.TorusGeometry(0.044, 0.0055, 8, 24),
      nutCollarMatByCompound[compound],
    );
    nutCollar.rotation.y = Math.PI / 2;
    nutCollar.position.x = hw - 0.008;
    outerFace.add(nutCollar);
    nutCollarMeshes.push(nutCollar);

    wheelGroup.add(outerFace);

    // Inner wheel face (open 5-spoke rim barrel revealing brake disc & glowing Brembo caliper)
    const innerFace = new THREE.Group();
    innerFace.rotation.y = isRightWheel ? Math.PI : 0;

    const innerSidewall = new THREE.Mesh(sharedSidewallGeo, sidewallMatsByCompound[compound]);
    innerSidewall.position.x = hw;
    innerFace.add(innerSidewall);
    sidewallMeshes.push(innerSidewall);

    const innerRimBarrel = new THREE.Mesh(sharedRimBarrelGeo, rimMetalMat);
    innerRimBarrel.position.x = hw;
    innerFace.add(innerRimBarrel);

    const innerSpokes = new THREE.Mesh(sharedInnerSpokesGeo, rimMetalMat);
    innerSpokes.position.x = hw;
    innerFace.add(innerSpokes);

    wheelGroup.add(innerFace);

    pivot.add(wheelGroup);
    wheels.push(wheelGroup);
  }

  let currentDrsAngle = 0.44;
  let currentBrakeGlow = 0;

  return {
    root,
    wheels,
    frontWheelPivots,
    brakeGlowMats,
    drsFlap: drsPivot,
    rearRainLight,
    setCompound(newCompound: TyreCompound) {
      const nextMat = sidewallMatsByCompound[newCompound];
      const nextCollarMat = nutCollarMatByCompound[newCompound];
      for (const sm of sidewallMeshes) {
        sm.material = nextMat;
      }
      for (const nm of nutCollarMeshes) {
        nm.material = nextCollarMat;
      }
    },
    setDrsOpen(open: boolean, dt: number) {
      const targetAngle = open ? -0.04 : 0.44;
      currentDrsAngle = THREE.MathUtils.damp(currentDrsAngle, targetAngle, 15, dt);
      drsPivot.rotation.x = currentDrsAngle;
    },
    setBrakingOrErs(braking: boolean, ers: boolean, speedMs = 0) {
      if (braking) {
        rearRainLight.emissiveIntensity = 3.6;
      } else if (ers) {
        rearRainLight.emissiveIntensity = 1.9;
      } else {
        rearRainLight.emissiveIntensity = 0.28;
      }

      const targetGlow = braking && speedMs > 18 ? Math.min(3.4, (speedMs / 72) * 3.1) : 0;
      currentBrakeGlow = THREE.MathUtils.lerp(currentBrakeGlow, targetGlow, 0.25);
      for (const bm of brakeGlowMats) {
        bm.emissiveIntensity = currentBrakeGlow;
      }
    },
    setHelmetVisible(visible: boolean) {
      helmetGroup.visible = visible;
    },
    updateWheelDisplay(
      speedKmh: number,
      gear: number,
      rpm: number,
      ersPercent: number,
      ersDeploying: boolean,
      drsActive: boolean,
      drsAllowed: boolean,
    ) {
      if (liveScreenCtrl) {
        liveScreenCtrl.update(speedKmh, gear, rpm, ersPercent, ersDeploying, drsActive, drsAllowed);
      }
    },
    updateMotion(speedMs: number, steerAngle: number, dt: number) {
      const spinDelta = (speedMs / wheelRadius) * dt;
      for (const w of wheels) {
        w.rotation.x += spinDelta;
      }
      for (const fp of frontWheelPivots) {
        fp.rotation.y = steerAngle * 0.45;
      }
      steeringWheelGroup.rotation.z = -steerAngle * 0.78;
    },
    dispose() {
      for (const r of rigDisposables) r.dispose();
    },
  };
}
