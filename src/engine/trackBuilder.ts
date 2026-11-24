import * as THREE from 'three';
import { F1_TEAMS } from '../data/f1Roster';
import { CircuitEnvironment, F1Circuit, FlagState } from '../types/f1';
import {
  createAsphaltBumpTexture,
  createAsphaltTexture,
  createAstroturfTexture,
  createBarrierSponsorTexture,
  createBrakingBoardTexture,
  createBuildingFacadeTexture,
  createCatchFenceTexture,
  createCrowdStandTexture,
  createDrsBoardTexture,
  createGrassGroundTexture,
  createGravelTexture,
  createKerbTexture,
  createPitLaneTexture,
  createPitLimitTexture,
  createRunoffTexture,
  createSkidmarkTexture,
  createSponsorBannerTexture,
  createStartFinishTexture,
  createWaterTexture,
} from './proceduralTextures';
import { TrackSpline } from './trackMath';

export interface BuiltTrackScene {
  group: THREE.Group;
  setCountdownLights: (lightsLit: number) => void;
  setFlagState: (flag: FlagState) => void;
  dispose: () => void;
}

interface EnvPalette {
  zenithColor: number;
  horizonColor: number;
  fogColor: number;
  fogDensity: number;
  groundBase: string;
  groundSpeckle: string;
  sunColor: number;
  sunIntensity: number;
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  kerbPrimary: string;
  runoffStripe: string;
  wallHex: string;
  wallAccentHex: string;
  turfPrimary: string;
  turfSecondary: string;
}

function getEnvironmentPalette(env: CircuitEnvironment): EnvPalette {
  switch (env) {
    case 'nightcity': // Singapore Marina Bay
      return {
        zenithColor: 0x020617,
        horizonColor: 0x0e1d3d,
        fogColor: 0x081022,
        fogDensity: 0.00055,
        groundBase: '#111827',
        groundSpeckle: '#1f2937',
        sunColor: 0xe0f2fe,
        sunIntensity: 1.9,
        hemiSky: 0x60a5fa,
        hemiGround: 0x0f172a,
        hemiIntensity: 1.15,
        kerbPrimary: '#e10600',
        runoffStripe: '#0284c7',
        wallHex: '#1e293b',
        wallAccentHex: '#e10600',
        turfPrimary: '#1e293b',
        turfSecondary: '#334155',
      };
    case 'harbor': // Monaco (Monte Carlo Riviera Sunlight)
      return {
        zenithColor: 0x1653b8,
        horizonColor: 0x99d1fc,
        fogColor: 0x8cc6f2,
        fogDensity: 0.00044,
        groundBase: '#454e5c',
        groundSpeckle: '#5c6676',
        sunColor: 0xfff8ea,
        sunIntensity: 2.55,
        hemiSky: 0xdbeafe,
        hemiGround: 0x3b4252,
        hemiIntensity: 0.98,
        kerbPrimary: '#e10600',
        runoffStripe: '#dc2626',
        wallHex: '#334155',
        wallAccentHex: '#e10600',
        turfPrimary: '#1e293b',
        turfSecondary: '#334155',
      };
    case 'twilight': // Suzuka
      return {
        zenithColor: 0x1e2547,
        horizonColor: 0x9a5d4e,
        fogColor: 0x4f445e,
        fogDensity: 0.00048,
        groundBase: '#1b3122',
        groundSpeckle: '#264430',
        sunColor: 0xfdba74,
        sunIntensity: 2.25,
        hemiSky: 0x93c5fd,
        hemiGround: 0x1e293b,
        hemiIntensity: 0.9,
        kerbPrimary: '#e10600',
        runoffStripe: '#dc2626',
        wallHex: '#cbd5e1',
        wallAccentHex: '#e10600',
        turfPrimary: '#14532d',
        turfSecondary: '#166534',
      };
    case 'british': // Silverstone
      return {
        zenithColor: 0x3b526e,
        horizonColor: 0xa4b8cc,
        fogColor: 0x8fa4b8,
        fogDensity: 0.00046,
        groundBase: '#233b24',
        groundSpeckle: '#2e4e30',
        sunColor: 0xf8fafc,
        sunIntensity: 2.05,
        hemiSky: 0xcbd5e1,
        hemiGround: 0x1f2d1f,
        hemiIntensity: 0.98,
        kerbPrimary: '#111827',
        runoffStripe: '#1d4ed8',
        wallHex: '#475569',
        wallAccentHex: '#1d4ed8',
        turfPrimary: '#15803d',
        turfSecondary: '#166534',
      };
    case 'ardennes': // Spa-Francorchamps
      return {
        zenithColor: 0x244d7a,
        horizonColor: 0x8fb5d9,
        fogColor: 0x779bc0,
        fogDensity: 0.00042,
        groundBase: '#1a361e',
        groundSpeckle: '#244929',
        sunColor: 0xfff7ed,
        sunIntensity: 2.25,
        hemiSky: 0xbae6fd,
        hemiGround: 0x1c2b1e,
        hemiIntensity: 0.9,
        kerbPrimary: '#dc2626',
        runoffStripe: '#facc15',
        wallHex: '#334155',
        wallAccentHex: '#facc15',
        turfPrimary: '#14532d',
        turfSecondary: '#166534',
      };
    case 'stadium': // Interlagos
      return {
        zenithColor: 0x1d4ed8,
        horizonColor: 0x93c5fd,
        fogColor: 0x7fb4e8,
        fogDensity: 0.00046,
        groundBase: '#264222',
        groundSpeckle: '#33572d',
        sunColor: 0xfffbeb,
        sunIntensity: 2.4,
        hemiSky: 0xe0f2fe,
        hemiGround: 0x293b24,
        hemiIntensity: 0.92,
        kerbPrimary: '#16a34a',
        runoffStripe: '#facc15',
        wallHex: '#e2e8f0',
        wallAccentHex: '#16a34a',
        turfPrimary: '#15803d',
        turfSecondary: '#166534',
      };
    case 'parkland': // Monza
    default:
      return {
        zenithColor: 0x1e56a8,
        horizonColor: 0x9bcaf5,
        fogColor: 0x8bb9e6,
        fogDensity: 0.00045,
        groundBase: '#223d23',
        groundSpeckle: '#2d522e',
        sunColor: 0xfff4dc,
        sunIntensity: 2.35,
        hemiSky: 0xdbeafe,
        hemiGround: 0x223823,
        hemiIntensity: 0.92,
        kerbPrimary: '#16a34a',
        runoffStripe: '#dc2626',
        wallHex: '#334155',
        wallAccentHex: '#16a34a',
        turfPrimary: '#14532d',
        turfSecondary: '#166534',
      };
  }
}

export function buildTrackEnvironment(
  scene: THREE.Scene,
  spline: TrackSpline,
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  showRacingLine = true,
): BuiltTrackScene {
  const circuit: F1Circuit = spline.circuit;
  const palette = getEnvironmentPalette(circuit.environment);
  const group = new THREE.Group();
  const disposables: Array<{ dispose: () => void }> = [];
  const N = spline.sampleCount;
  const halfW = circuit.trackWidth * 0.5;
  const vergeWidth = 2.2;
  const barrierHeight = 1.28;
  const isNight = circuit.environment === 'nightcity';

  const trackGeo = <T extends THREE.BufferGeometry>(g: T): T => {
    disposables.push(g);
    return g;
  };
  const trackMat = <T extends THREE.Material>(m: T): T => {
    disposables.push(m);
    return m;
  };
  const trackTex = <T extends THREE.Texture>(t: T): T => {
    disposables.push(t);
    return t;
  };

  scene.background = new THREE.Color(palette.horizonColor);
  scene.fog = new THREE.FogExp2(palette.fogColor, palette.fogDensity);

  const sunVec = new THREE.Vector3(240, 360, 190).normalize();

  // 1. Atmospheric Gradient Sky Dome with Sun Disc, Soft Cloud Wisps & Night Starfield
  const skyGeo = trackGeo(new THREE.SphereGeometry(3100, 32, 20));
  const skyMat = trackMat(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        topColor: { value: new THREE.Color(palette.zenithColor) },
        bottomColor: { value: new THREE.Color(palette.horizonColor) },
        sunDir: { value: sunVec },
        sunCol: { value: new THREE.Color(palette.sunColor) },
        isNight: { value: isNight ? 1.0 : 0.0 },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        uniform vec3 topColor;
        uniform vec3 bottomColor;
        uniform vec3 sunDir;
        uniform vec3 sunCol;
        uniform float isNight;
        varying vec3 vWorldPos;

        float hash(vec2 p) {
          return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
        }
        float noise(vec2 p) {
          vec2 i = floor(p);
          vec2 f = fract(p);
          f = f * f * (3.0 - 2.0 * f);
          float a = hash(i);
          float b = hash(i + vec2(1.0, 0.0));
          float c = hash(i + vec2(0.0, 1.0));
          float d = hash(i + vec2(1.0, 1.0));
          return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
        }

        void main() {
          vec3 dir = normalize(vWorldPos);
          float h = max(dir.y, 0.0);
          float t = pow(h, 0.55);
          vec3 sky = mix(bottomColor, topColor, t);

          if (isNight > 0.5) {
            float star = step(0.9965, hash(floor(dir.xz * 260.0 + dir.y * 140.0))) * smoothstep(0.08, 0.45, dir.y);
            sky += vec3(0.85, 0.92, 1.0) * star * 0.9;
          } else {
            // Soft atmospheric clouds
            vec2 cloudUv = dir.xz / (dir.y + 0.18) * 1.4;
            float n = noise(cloudUv) * 0.65 + noise(cloudUv * 2.4) * 0.35;
            float cloudMask = smoothstep(0.56, 0.82, n) * smoothstep(0.03, 0.25, dir.y);
            sky = mix(sky, mix(bottomColor, vec3(1.0), 0.78), cloudMask * 0.42);

            // Warm sun disc + halo
            float sDot = max(dot(dir, sunDir), 0.0);
            sky += sunCol * (pow(sDot, 14.0) * 0.28 + smoothstep(0.9985, 0.9996, sDot) * 1.2);
          }

          gl_FragColor = vec4(sky, 1.0);
        }
      `,
    }),
  );
  group.add(new THREE.Mesh(skyGeo, skyMat));

  // 2. Lighting Rig
  const hemi = new THREE.HemisphereLight(
    palette.hemiSky,
    palette.hemiGround,
    palette.hemiIntensity,
  );
  group.add(hemi);

  const sun = new THREE.DirectionalLight(palette.sunColor, palette.sunIntensity);
  sun.position.set(340, 520, 260);
  if (!isSoftwareGl) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 40;
    sun.shadow.camera.far = 2200;
    sun.shadow.camera.left = -1250;
    sun.shadow.camera.right = 1250;
    sun.shadow.camera.top = 1250;
    sun.shadow.camera.bottom = -1250;
    sun.shadow.bias = -0.0005;
  }
  group.add(sun);

  // 3. Sculpted 3D Surrounding Terrain Mesh (4800m for 1:1 full-scale 7km Spa & Monza)
  const terrainSize = 4800;
  const terrainSegs = isSoftwareGl ? 68 : 116;
  const terrainGeo = trackGeo(new THREE.PlaneGeometry(terrainSize, terrainSize, terrainSegs, terrainSegs));
  terrainGeo.rotateX(-Math.PI / 2);

  const subStep = 5;
  const subSamples: Array<{ x: number; y: number; z: number }> = [];
  for (let i = 0; i < N; i += subStep) {
    const p = spline.samples[i].position;
    subSamples.push({ x: p.x, y: p.y, z: p.z });
  }

  const computeTerrainHeight = (vx: number, vz: number): { y: number; isWater: boolean; dist: number } => {
    let minDistSq = Infinity;
    let nearestY = 0;
    let closeMinY = Infinity;
    for (let si = 0; si < subSamples.length; si++) {
      const sp = subSamples[si];
      const dx = vx - sp.x;
      const dz = vz - sp.z;
      const dSq = dx * dx + dz * dz;
      if (dSq < minDistSq) {
        minDistSq = dSq;
        nearestY = sp.y;
      }
      if (dSq < 64 * 64 && sp.y < closeMinY) {
        closeMinY = sp.y;
      }
    }

    const baseTrackY = closeMinY < Infinity ? closeMinY : nearestY;
    const dist = Math.sqrt(minDistSq);
    const rawBlend = THREE.MathUtils.clamp((dist - (halfW + 26)) / 92, 0, 1);
    const smoothBlend = rawBlend * rawBlend * (3 - 2 * rawBlend);

    let relief = 0;
    let isWater = false;
    const waveA = Math.sin(vx * 0.0048) * Math.cos(vz * 0.0048);
    const waveB = Math.sin(vx * 0.011 + 1.2) * Math.sin(vz * 0.01 - 0.6);

    if (circuit.environment === 'ardennes') {
      relief = 24 + waveA * 34 + waveB * 14 + Math.max(0, (dist - 140) * 0.075);
    } else if (circuit.environment === 'harbor') {
      const inPortHercule = vx > -48 && vx < 560 && vz > 248 && vz < 640;
      const inMedSea = vx > 565 || vz > 545;
      isWater = (inPortHercule || inMedSea) && dist > halfW + 17;
      if (isWater) {
        relief = -2.8;
      } else {
        const hillRise = Math.max(0, (240 - vz) * 0.068) + Math.max(0, (vx + 120) * 0.022);
        relief = 3.2 + hillRise + waveA * 10 + waveB * 4;
      }
    } else if (circuit.environment === 'nightcity') {
      const inBay = vx > -455 && vx < 360 && vz > -385 && vz < 385 && dist > halfW + 26;
      isWater = inBay;
      relief = inBay ? -1.8 : 0.25 + Math.max(0, waveB * 1.2);
    } else if (circuit.environment === 'stadium') {
      const inGuarapiranga = vx < -820 && vz > -500 && vz < 680 && dist > halfW + 40;
      isWater = inGuarapiranga;
      relief = inGuarapiranga ? -3.0 : 8 + waveA * 16 + Math.min(34, Math.max(0, (dist - 90) * 0.055));
    } else if (circuit.environment === 'twilight') {
      relief = 14 + waveA * 24 + waveB * 11;
    } else {
      relief = 4 + waveA * 11 + waveB * 4.5;
    }

    const y =
      rawBlend <= 0.001
        ? baseTrackY - 0.34
        : isWater
          ? THREE.MathUtils.lerp(baseTrackY - 0.34, -2.8, smoothBlend)
          : THREE.MathUtils.lerp(baseTrackY - 0.34, baseTrackY + relief, smoothBlend);
    return { y, isWater, dist };
  };

  const posAttr = terrainGeo.attributes.position as THREE.BufferAttribute;
  for (let vi = 0; vi < posAttr.count; vi++) {
    const vx = posAttr.getX(vi);
    const vz = posAttr.getZ(vi);
    posAttr.setY(vi, computeTerrainHeight(vx, vz).y);
  }
  terrainGeo.computeVertexNormals();

  const groundTex = trackTex(
    createGrassGroundTexture(palette.groundBase, palette.groundSpeckle, renderer),
  );
  const groundMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: groundTex,
      roughness: 0.94,
      metalness: 0.02,
    }),
  );
  const terrainMesh = new THREE.Mesh(terrainGeo, groundMat);
  terrainMesh.receiveShadow = !isSoftwareGl;
  group.add(terrainMesh);

  // 4. Shimmering Harbor, Marina Bay & Interlagos Lake Water Planes
  if (
    circuit.environment === 'harbor' ||
    circuit.environment === 'nightcity' ||
    circuit.environment === 'stadium'
  ) {
    const waterTex = trackTex(
      createWaterTexture(
        isNight ? '#061529' : circuit.environment === 'stadium' ? '#0c4a6e' : '#084b7a',
        isNight ? '#1e40af' : '#22b3e8',
        renderer,
      ),
    );
    const wSizeX = isNight ? 900 : circuit.environment === 'stadium' ? 950 : 2100;
    const wSizeZ = isNight ? 840 : circuit.environment === 'stadium' ? 1250 : 2100;
    const waterGeo = trackGeo(new THREE.PlaneGeometry(wSizeX, wSizeZ));
    const waterMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: waterTex,
        roughness: 0.14,
        metalness: 0.42,
      }),
    );
    const waterMesh = new THREE.Mesh(waterGeo, waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.set(
      isNight ? -48 : circuit.environment === 'stadium' ? -1280 : 340,
      isNight ? -0.45 : -0.65,
      isNight ? 0 : circuit.environment === 'stadium' ? 90 : 430,
    );
    group.add(waterMesh);
  }

  // 5. Layered Track Surface: 1024px Asphalt -> Astroturf Verge -> Dynamic Gravel/Runoff -> Barrier -> Embankment
  const roadVerts = new Float32Array((N + 1) * 2 * 3);
  const roadUVs = new Float32Array((N + 1) * 2 * 2);
  const roadIndices: number[] = [];

  const vergeVertsL: number[] = [];
  const vergeVertsR: number[] = [];
  const vergeUVs: number[] = [];

  const runoffVertsL: number[] = [];
  const runoffVertsR: number[] = [];
  const runoffUVsL: number[] = [];
  const runoffUVsR: number[] = [];
  const runoffIdxL: number[] = [];
  const runoffIdxR: number[] = [];

  const embankVertsL: number[] = [];
  const embankVertsR: number[] = [];
  const embankUVsL: number[] = [];
  const embankUVsR: number[] = [];

  const kerbVerts: number[] = [];
  const kerbUVs: number[] = [];
  const kerbIndices: number[] = [];

  const barrierVertsLeft: number[] = [];
  const barrierVertsRight: number[] = [];
  const barrierUVsLeft: number[] = [];
  const barrierUVsRight: number[] = [];
  const barrierIdxLeft: number[] = [];
  const barrierIdxRight: number[] = [];

  const fenceVertsLeft: number[] = [];
  const fenceVertsRight: number[] = [];
  const fenceUVsLeft: number[] = [];
  const fenceUVsRight: number[] = [];

  const isStreetCircuit = circuit.environment === 'harbor' || circuit.environment === 'nightcity';
  const apronWidth = isStreetCircuit ? 9.5 : 28;

  for (let i = 0; i <= N; i++) {
    const s = spline.samples[i % N];
    const p = s.position;
    const r = s.right;
    const vCoord = (i / N) * (spline.totalLength / 15);
    const wallU = (i / N) * (spline.totalLength / 145);
    const fenceU = (i / N) * (spline.totalLength / 6);

    const lx = p.x - r.x * halfW;
    const ly = p.y + 0.03;
    const lz = p.z - r.z * halfW;
    const rx = p.x + r.x * halfW;
    const ry = p.y + 0.03;
    const rz = p.z + r.z * halfW;

    const vBase = i * 6;
    roadVerts[vBase] = lx;
    roadVerts[vBase + 1] = ly;
    roadVerts[vBase + 2] = lz;
    roadVerts[vBase + 3] = rx;
    roadVerts[vBase + 4] = ry;
    roadVerts[vBase + 5] = rz;

    const uBase = i * 4;
    roadUVs[uBase] = 0;
    roadUVs[uBase + 1] = vCoord;
    roadUVs[uBase + 2] = 1;
    roadUVs[uBase + 3] = vCoord;

    // Astroturf / FIA Verge directly outside white track limit lines
    const vlx = p.x - r.x * (halfW + vergeWidth);
    const vlz = p.z - r.z * (halfW + vergeWidth);
    const vrx = p.x + r.x * (halfW + vergeWidth);
    const vrz = p.z + r.z * (halfW + vergeWidth);

    vergeVertsL.push(vlx, p.y + 0.004, vlz, lx, p.y + 0.014, lz);
    vergeVertsR.push(rx, p.y + 0.014, rz, vrx, p.y + 0.004, vrz);
    vergeUVs.push(0, vCoord, 1, vCoord);

    // Dynamic wide corner gravel traps / painted street circuit runoffs
    const leftWallOff = s.leftWallOffset;
    const rightWallOff = s.rightWallOffset;
    const olx = p.x - r.x * leftWallOff;
    const olz = p.z - r.z * leftWallOff;
    const orx = p.x + r.x * rightWallOff;
    const orz = p.z + r.z * rightWallOff;

    const leftRunoffRepeatU = Math.max(0.5, (leftWallOff - (halfW + vergeWidth)) / 5.5);
    const rightRunoffRepeatU = Math.max(0.5, (rightWallOff - (halfW + vergeWidth)) / 5.5);

    runoffVertsL.push(olx, p.y - 0.03, olz, vlx, p.y - 0.004, vlz);
    runoffUVsL.push(0, vCoord, leftRunoffRepeatU, vCoord);
    runoffVertsR.push(vrx, p.y - 0.004, vrz, orx, p.y - 0.03, orz);
    runoffUVsR.push(0, vCoord, rightRunoffRepeatU, vCoord);

    // Outer embankment apron sloping cleanly from barrier base down into rolling 3D terrain
    const elx = p.x - r.x * (leftWallOff + apronWidth);
    const elz = p.z - r.z * (leftWallOff + apronWidth);
    const erx = p.x + r.x * (rightWallOff + apronWidth);
    const erz = p.z + r.z * (rightWallOff + apronWidth);

    embankVertsL.push(elx, p.y - 1.5, elz, olx, p.y - 0.08, olz);
    embankUVsL.push(0, vCoord * 0.5, 2.2, vCoord * 0.5);
    embankVertsR.push(orx, p.y - 0.08, orz, erx, p.y - 1.5, erz);
    embankUVsR.push(0, vCoord * 0.5, 2.2, vCoord * 0.5);

    barrierVertsLeft.push(olx, p.y - 0.15, olz, olx, p.y + barrierHeight, olz);
    barrierUVsLeft.push(wallU, 0, wallU, 1);

    barrierVertsRight.push(orx, p.y - 0.15, orz, orx, p.y + barrierHeight, orz);
    barrierUVsRight.push(wallU, 0, wallU, 1);

    fenceVertsLeft.push(olx, p.y + barrierHeight, olz, olx, p.y + barrierHeight + 2.35, olz);
    fenceUVsLeft.push(fenceU, 0, fenceU, 1);

    fenceVertsRight.push(orx, p.y + barrierHeight, orz, orx, p.y + barrierHeight + 2.35, orz);
    fenceUVsRight.push(fenceU, 0, fenceU, 1);

    if (i < N) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      roadIndices.push(a, b, c, b, d, c);
      runoffIdxL.push(a, b, c, b, d, c);
      runoffIdxR.push(a, b, c, b, d, c);
      barrierIdxLeft.push(a, c, b, b, c, d);
      barrierIdxRight.push(a, b, c, b, d, c);
    }
  }

  const roadGeo = trackGeo(new THREE.BufferGeometry());
  roadGeo.setAttribute('position', new THREE.BufferAttribute(roadVerts, 3));
  roadGeo.setAttribute('uv', new THREE.BufferAttribute(roadUVs, 2));
  roadGeo.setIndex(roadIndices);
  roadGeo.computeVertexNormals();

  const asphaltTex = trackTex(createAsphaltTexture(renderer));
  const asphaltBump = trackTex(createAsphaltBumpTexture(renderer));
  const roadMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: asphaltTex,
      bumpMap: asphaltBump,
      bumpScale: 0.055,
      roughness: 0.84,
      metalness: 0.04,
    }),
  );
  const roadMesh = new THREE.Mesh(roadGeo, roadMat);
  roadMesh.receiveShadow = !isSoftwareGl;
  group.add(roadMesh);

  // Astroturf / FIA Track-Limit Verges
  const turfTex = trackTex(
    createAstroturfTexture(palette.turfPrimary, palette.turfSecondary, renderer),
  );
  const turfMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: turfTex,
      roughness: 0.85,
      metalness: 0.02,
    }),
  );
  for (const [verts, idx] of [
    [vergeVertsL, runoffIdxL],
    [vergeVertsR, runoffIdxR],
  ] as const) {
    const vGeo = trackGeo(new THREE.BufferGeometry());
    vGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    vGeo.setAttribute('uv', new THREE.Float32BufferAttribute(vergeUVs, 2));
    vGeo.setIndex(idx);
    vGeo.computeVertexNormals();
    const vMesh = new THREE.Mesh(vGeo, turfMat);
    vMesh.receiveShadow = !isSoftwareGl;
    group.add(vMesh);
  }

  // Outer Gravel Traps / High-Friction Runoff Aprons
  const isStreet = circuit.environment === 'harbor' || circuit.environment === 'nightcity';
  const runoffTex = trackTex(
    isStreet
      ? createRunoffTexture(palette.runoffStripe, renderer)
      : createGravelTexture(renderer),
  );
  const runoffMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: runoffTex,
      roughness: isStreet ? 0.62 : 0.96,
      metalness: 0.04,
    }),
  );
  for (const [verts, uvs, idx] of [
    [runoffVertsL, runoffUVsL, runoffIdxL],
    [runoffVertsR, runoffUVsR, runoffIdxR],
  ] as const) {
    const rGeo = trackGeo(new THREE.BufferGeometry());
    rGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    rGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    rGeo.setIndex(idx);
    rGeo.computeVertexNormals();
    const rMesh = new THREE.Mesh(rGeo, runoffMat);
    rMesh.receiveShadow = !isSoftwareGl;
    group.add(rMesh);
  }

  // Outer Terrain-Blended Grass/Urban Embankment Skirt (eliminates terrain cell seams)
  for (const [verts, uvs, idx] of [
    [embankVertsL, embankUVsL, runoffIdxL],
    [embankVertsR, embankUVsR, runoffIdxR],
  ] as const) {
    const eGeo = trackGeo(new THREE.BufferGeometry());
    eGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    eGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    eGeo.setIndex(idx);
    eGeo.computeVertexNormals();
    const eMesh = new THREE.Mesh(eGeo, groundMat);
    eMesh.receiveShadow = !isSoftwareGl;
    group.add(eMesh);
  }

  // FIA Raised Inside-Apex & Outside-Exit Corner Kerbs
  const kerbTex = trackTex(createKerbTexture(palette.kerbPrimary, '#f8fafc', renderer));
  const kerbMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: kerbTex,
      roughness: 0.46,
      metalness: 0.08,
    }),
  );

  const kerbWidth = 1.95;
  const appendKerbRibbon = (side: 1 | -1, sampleIndices: number[]) => {
    if (sampleIndices.length < 2) return;
    const startVert = kerbVerts.length / 3;
    const innerEdge = halfW - 0.16;
    const outerEdge = halfW + kerbWidth;
    for (let k = 0; k < sampleIndices.length; k++) {
      const idx = sampleIndices[k];
      const s = spline.samples[idx];
      const p = s.position;
      const r = s.right;
      const vCoord = k * 0.34;
      const x1 = p.x + r.x * side * innerEdge;
      const z1 = p.z + r.z * side * innerEdge;
      const x2 = p.x + r.x * side * outerEdge;
      const z2 = p.z + r.z * side * outerEdge;

      if (side > 0) {
        kerbVerts.push(x1, p.y + 0.055, z1, x2, p.y + 0.125, z2);
      } else {
        kerbVerts.push(x2, p.y + 0.125, z2, x1, p.y + 0.055, z1);
      }
      kerbUVs.push(0, vCoord, 1, vCoord);

      const currVertCount = kerbVerts.length / 3;
      if (currVertCount - startVert >= 4) {
        const v = currVertCount - 4;
        kerbIndices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      }
    }
  };

  let segStart = -1;
  let segSide: 1 | -1 = 1;
  for (let i = 0; i <= N; i++) {
    const s = spline.samples[i % N];
    const isCorner = i < N && s.absCurvature > 0.0038;
    if (isCorner) {
      const side: 1 | -1 = s.curvature >= 0 ? 1 : -1;
      if (segStart === -1) {
        segStart = i;
        segSide = side;
      } else if (side !== segSide) {
        const apexRun: number[] = [];
        for (let k = segStart; k < i; k++) apexRun.push(k % N);
        appendKerbRibbon(segSide, apexRun);
        segStart = i;
        segSide = side;
      }
    } else if (segStart !== -1) {
      const apexRun: number[] = [];
      for (let k = segStart; k < i; k++) apexRun.push(k % N);
      appendKerbRibbon(segSide, apexRun);

      // Corner exit kerb on outer edge downstream of apex
      const exitLen = Math.min(22, Math.max(8, apexRun.length));
      const exitRun: number[] = [];
      for (let k = Math.max(segStart, i - 3); k < i + exitLen; k++) {
        exitRun.push(k % N);
      }
      appendKerbRibbon((-segSide) as 1 | -1, exitRun);
      segStart = -1;
    }
  }

  if (kerbIndices.length > 0) {
    const kerbGeo = trackGeo(new THREE.BufferGeometry());
    kerbGeo.setAttribute('position', new THREE.Float32BufferAttribute(kerbVerts, 3));
    kerbGeo.setAttribute('uv', new THREE.Float32BufferAttribute(kerbUVs, 2));
    kerbGeo.setIndex(kerbIndices);
    kerbGeo.computeVertexNormals();
    group.add(new THREE.Mesh(kerbGeo, kerbMat));
  }

  // Multi-Sponsor Safety Barriers & Galvanized Wire Catch Fencing
  const wallTex = trackTex(
    createBarrierSponsorTexture(palette.wallHex, palette.wallAccentHex, '', renderer),
  );
  const barrierMat = trackMat(
    new THREE.MeshStandardMaterial({
      map: wallTex,
      roughness: 0.48,
      metalness: 0.32,
      side: THREE.DoubleSide,
    }),
  );

  for (const [verts, uvs, indices] of [
    [barrierVertsLeft, barrierUVsLeft, barrierIdxLeft],
    [barrierVertsRight, barrierUVsRight, barrierIdxRight],
  ] as const) {
    const bGeo = trackGeo(new THREE.BufferGeometry());
    bGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    bGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    bGeo.setIndex(indices);
    bGeo.computeVertexNormals();
    group.add(new THREE.Mesh(bGeo, barrierMat));
  }

  const fenceTex = trackTex(createCatchFenceTexture(renderer));
  const fenceMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: fenceTex,
      transparent: true,
      alphaTest: 0.25,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );

  for (const [verts, uvs, indices] of [
    [fenceVertsLeft, fenceUVsLeft, barrierIdxLeft],
    [fenceVertsRight, fenceUVsRight, barrierIdxRight],
  ] as const) {
    const fGeo = trackGeo(new THREE.BufferGeometry());
    fGeo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    fGeo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    fGeo.setIndex(indices);
    group.add(new THREE.Mesh(fGeo, fenceMat));
  }

  // Catch-Fence Uprights (InstancedMesh seated cleanly on flared left/right wall offsets)
  const postGeo = trackGeo(new THREE.BoxGeometry(0.15, 3.65, 0.15));
  const postMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x64748b, metalness: 0.72, roughness: 0.32 }),
  );
  const postStep = 10;
  const postCount = Math.floor(N / postStep) * 2;
  const postInst = new THREE.InstancedMesh(postGeo, postMat, postCount);
  const dummy = new THREE.Object3D();
  let pIdx = 0;
  for (let i = 0; i < N; i += postStep) {
    const s = spline.samples[i];
    for (const side of [-1, 1] as const) {
      if (pIdx >= postCount) break;
      const wallOff = side > 0 ? s.rightWallOffset : s.leftWallOffset;
      dummy.position.set(
        s.position.x + s.right.x * side * wallOff,
        s.position.y + 1.82,
        s.position.z + s.right.z * side * wallOff,
      );
      dummy.rotation.set(0, Math.atan2(s.tangent.x, s.tangent.z), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      postInst.setMatrixAt(pIdx++, dummy.matrix);
    }
  }
  postInst.count = pIdx;
  postInst.instanceMatrix.needsUpdate = true;
  postInst.computeBoundingSphere();
  group.add(postInst);

  // Red & Blue FIA Tecpro Impact Barriers along Outer Corner Runoffs
  const tecproGeo = trackGeo(new THREE.BoxGeometry(1.6, 1.35, 3.9));
  const tecproMatRed = trackMat(new THREE.MeshStandardMaterial({ color: 0xdc2626, roughness: 0.45 }));
  const tecproMatBlue = trackMat(new THREE.MeshStandardMaterial({ color: 0x1d4ed8, roughness: 0.45 }));
  let tecIdx = 0;
  for (let i = 0; i < N; i += 6) {
    const s = spline.samples[i];
    if (s.absCurvature > 0.0052) {
      const outerSide = s.curvature >= 0 ? -1 : 1;
      const outerWallOff = outerSide > 0 ? s.rightWallOffset : s.leftWallOffset;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const block = new THREE.Mesh(tecproGeo, tecIdx % 2 === 0 ? tecproMatRed : tecproMatBlue);
      block.position.set(
        s.position.x + s.right.x * outerSide * (outerWallOff - 0.9),
        s.position.y + 0.68,
        s.position.z + s.right.z * outerSide * (outerWallOff - 0.9),
      );
      block.rotation.y = yaw;
      group.add(block);
      tecIdx++;
    }
  }

  // 6. Dynamic 3D F1 Optimal Racing Line + Corner Braking Ribbon
  if (showRacingLine) {
    const lineVerts: number[] = [];
    const lineColors: number[] = [];
    const lineIndices: number[] = [];
    const lineHalfW = 0.6;
    const c = new THREE.Color();

    for (let i = 0; i <= N; i++) {
      const idx = i % N;
      const s = spline.samples[idx];
      const look1 = spline.samples[(idx + 12) % N].absCurvature;
      const look2 = spline.samples[(idx + 28) % N].absCurvature;
      const peakCurv = Math.max(s.absCurvature, look1 * 0.92, look2 * 0.72);

      const avgSigned =
        (s.curvature +
          spline.samples[(idx - 8 + N) % N].curvature * 0.6 +
          spline.samples[(idx + 8) % N].curvature * 0.6) /
        2.2;
      const apexOffset = THREE.MathUtils.clamp(avgSigned * 620, -halfW * 0.56, halfW * 0.56);

      const cx = s.position.x + s.right.x * apexOffset;
      const cy = s.position.y + 0.05;
      const cz = s.position.z + s.right.z * apexOffset;

      lineVerts.push(
        cx - s.right.x * lineHalfW,
        cy,
        cz - s.right.z * lineHalfW,
        cx + s.right.x * lineHalfW,
        cy,
        cz + s.right.z * lineHalfW,
      );

      if (peakCurv > 0.0082) c.setHex(0xef4444);
      else if (peakCurv > 0.0046) c.setHex(0xfacc15);
      else c.setHex(0x22c55e);

      lineColors.push(c.r, c.g, c.b, c.r, c.g, c.b);
      if (i < N) {
        const a = i * 2;
        lineIndices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }

    const lineGeo = trackGeo(new THREE.BufferGeometry());
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVerts, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    lineGeo.setIndex(lineIndices);

    const lineMat = trackMat(
      new THREE.MeshBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.6,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    group.add(new THREE.Mesh(lineGeo, lineMat));
  }

  // 7. Braking Zone Skidmarks + 150m / 100m / 50m Distance Boards + TV Camera Cranes
  const boardTex150 = trackTex(createBrakingBoardTexture(150, renderer));
  const boardTex100 = trackTex(createBrakingBoardTexture(100, renderer));
  const boardTex50 = trackTex(createBrakingBoardTexture(50, renderer));
  const boardGeo = trackGeo(new THREE.BoxGeometry(1.85, 1.3, 0.16));
  const boardPostGeo = trackGeo(new THREE.BoxGeometry(0.14, 1.7, 0.14));
  const boardMats = [boardTex150, boardTex100, boardTex50].map((tex) =>
    trackMat(new THREE.MeshBasicMaterial({ map: tex })),
  );

  const skidTex = trackTex(createSkidmarkTexture(renderer));
  const skidGeo = trackGeo(new THREE.PlaneGeometry(3.4, 52));
  const skidMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: skidTex,
      transparent: true,
      opacity: 0.72,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );

  const craneArmMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.6 }));
  const cranePodMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.4 }));

  let lastBoardIdx = -90;
  for (let i = 45; i < N - 30; i++) {
    const prevCurv = spline.samples[(i - 20 + N) % N].absCurvature;
    const currCurv = spline.samples[i].absCurvature;
    if (prevCurv < 0.0032 && currCurv > 0.0062 && i - lastBoardIdx > 78) {
      lastBoardIdx = i;
      const outerSide = spline.samples[i].curvature >= 0 ? -1 : 1;

      const skidS = spline.samples[(i - 18 + N) % N];
      const skidYaw = Math.atan2(skidS.tangent.x, skidS.tangent.z);
      const skidMesh = new THREE.Mesh(skidGeo, skidMat);
      skidMesh.position.set(
        skidS.position.x + skidS.right.x * outerSide * (halfW * 0.35),
        skidS.position.y + 0.042,
        skidS.position.z + skidS.right.z * outerSide * (halfW * 0.35),
      );
      skidMesh.rotation.order = 'YXZ';
      skidMesh.rotation.y = skidYaw;
      skidMesh.rotation.x = -Math.PI / 2;
      group.add(skidMesh);

      const offsets = [38, 25, 13];
      offsets.forEach((back, bIdx) => {
        const s = spline.samples[(i - back + N) % N];
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        const outerWallOff = outerSide > 0 ? s.rightWallOffset : s.leftWallOffset;
        const boardDist = Math.min(outerWallOff - 1.35, halfW + 4.4);
        const bx = s.position.x + s.right.x * outerSide * boardDist;
        const bz = s.position.z + s.right.z * outerSide * boardDist;

        const board = new THREE.Mesh(boardGeo, boardMats[bIdx]);
        board.position.set(bx, s.position.y + 1.75, bz);
        board.rotation.y = yaw;
        group.add(board);

        const post = new THREE.Mesh(boardPostGeo, postMat);
        post.position.set(bx, s.position.y + 0.85, bz);
        post.rotation.y = yaw;
        group.add(post);
      });

      // Corner TV Broadcast Camera Crane seated cleanly outside outer barrier
      const apexS = spline.samples[i];
      const craneWallOff = outerSide > 0 ? apexS.rightWallOffset : apexS.leftWallOffset;
      const crane = new THREE.Group();
      crane.position.set(
        apexS.position.x + apexS.right.x * outerSide * (craneWallOff + 4.2),
        apexS.position.y,
        apexS.position.z + apexS.right.z * outerSide * (craneWallOff + 4.2),
      );
      const mast = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.55, 11, 0.55)), craneArmMat);
      mast.position.y = 5.5;
      const jib = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(6.5, 0.4, 0.4)), craneArmMat);
      jib.position.set(-outerSide * 2.4, 11, 0);
      const camHead = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.75, 0.85)), cranePodMat);
      camHead.position.set(-outerSide * 5.2, 10.6, 0);
      crane.add(mast, jib, camHead);
      crane.rotation.y = Math.atan2(apexS.tangent.x, apexS.tangent.z);
      group.add(crane);
    }
  }

  // 8. Painted 20-Car F1 Starting Grid Boxes
  const gridBoxMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xf8fafc,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const gridLineLong = trackGeo(new THREE.PlaneGeometry(0.18, 3.4));
  const gridLineFront = trackGeo(new THREE.PlaneGeometry(2.2, 0.2));

  for (let idx = 0; idx < 20; idx++) {
    const distBehind = 16 + idx * 11.5;
    const t = TrackSpline.wrapT(1 - distBehind / spline.totalLength);
    const s = spline.getSampleAt(t);
    const lat = idx % 2 === 0 ? -halfW * 0.38 : halfW * 0.38;
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);

    const slot = new THREE.Group();
    slot.position.set(
      s.position.x + s.right.x * lat,
      s.position.y + 0.045,
      s.position.z + s.right.z * lat,
    );
    slot.rotation.y = yaw;

    const frontBar = new THREE.Mesh(gridLineFront, gridBoxMat);
    frontBar.rotation.x = -Math.PI / 2;
    frontBar.position.set(0, 0, 2.2);
    slot.add(frontBar);

    for (const side of [-1, 1]) {
      const sideBar = new THREE.Mesh(gridLineLong, gridBoxMat);
      sideBar.rotation.x = -Math.PI / 2;
      sideBar.position.set(side * 1.05, 0, 0.65);
      slot.add(sideBar);
    }
    group.add(slot);
  }

  // 9. Pit Lane Corridor, 80 km/h Gantry, Pit Wall & Color-Coded 10-Team Paddock Complex
  const pitBuildSamples: THREE.Vector3[] = [];
  const pitSteps = 60;
  const span = 1 - circuit.pitEntryT + circuit.pitExitT;
  for (let i = 0; i <= pitSteps; i++) {
    const frac = i / pitSteps;
    const t = TrackSpline.wrapT(circuit.pitEntryT + frac * span);
    const s = spline.getSampleAt(t);
    const bell = Math.sin(frac * Math.PI);
    const lat = halfW + 1.8 + bell * 8.4;
    pitBuildSamples.push(
      new THREE.Vector3(
        s.position.x + s.right.x * lat,
        s.position.y + 0.022,
        s.position.z + s.right.z * lat,
      ),
    );
  }
  const pitCurve = new THREE.CatmullRomCurve3(pitBuildSamples, false);
  const pitTubeVerts: number[] = [];
  const pitTubeUVs: number[] = [];
  const pitTubeIdx: number[] = [];
  const upVec = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i <= 68; i++) {
    const u = i / 68;
    const pt = pitCurve.getPointAt(u);
    const tan = pitCurve.getTangentAt(u).normalize();
    const r = new THREE.Vector3().crossVectors(tan, upVec).normalize();
    pitTubeVerts.push(pt.x - r.x * 3.6, pt.y, pt.z - r.z * 3.6, pt.x + r.x * 3.6, pt.y, pt.z + r.z * 3.6);
    pitTubeUVs.push(0, u * 18, 1, u * 18);
    if (i < 68) {
      const a = i * 2;
      pitTubeIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  }
  const pitGeo = trackGeo(new THREE.BufferGeometry());
  pitGeo.setAttribute('position', new THREE.Float32BufferAttribute(pitTubeVerts, 3));
  pitGeo.setAttribute('uv', new THREE.Float32BufferAttribute(pitTubeUVs, 2));
  pitGeo.setIndex(pitTubeIdx);
  pitGeo.computeVertexNormals();
  const pitTex = trackTex(createPitLaneTexture(renderer));
  const pitMat = trackMat(new THREE.MeshStandardMaterial({ map: pitTex, roughness: 0.74 }));
  group.add(new THREE.Mesh(pitGeo, pitMat));

  // Painted Pit Service Stop Box at t = 0.992 (aligned with stepPitStopFlow)
  const pitBoxSample = spline.getSampleAt(0.992);
  const pitBoxYaw = Math.atan2(pitBoxSample.tangent.x, pitBoxSample.tangent.z);
  const pitBoxGroup = new THREE.Group();
  pitBoxGroup.position.set(
    pitBoxSample.position.x + pitBoxSample.right.x * (halfW + 8.6),
    pitBoxSample.position.y + 0.04,
    pitBoxSample.position.z + pitBoxSample.right.z * (halfW + 8.6),
  );
  pitBoxGroup.rotation.y = pitBoxYaw;
  const pitStopMat = trackMat(
    new THREE.MeshBasicMaterial({
      color: 0xfacc15,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  );
  const pitStopLineFront = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(3.2, 0.32)), pitStopMat);
  pitStopLineFront.rotation.x = -Math.PI / 2;
  pitStopLineFront.position.set(0, 0, 2.8);
  pitBoxGroup.add(pitStopLineFront);
  for (const side of [-1, 1]) {
    const sLine = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(0.28, 6.2)), pitStopMat);
    sLine.rotation.x = -Math.PI / 2;
    sLine.position.set(side * 1.5, 0, 0);
    pitBoxGroup.add(sLine);
  }
  group.add(pitBoxGroup);

  // Pit Entry 80 km/h Speed Limit Gantry
  const pitLimitTex = trackTex(createPitLimitTexture(renderer));
  const pitLimitMat = trackMat(new THREE.MeshBasicMaterial({ map: pitLimitTex, side: THREE.DoubleSide }));
  const pitEntrySample = spline.getSampleAt(TrackSpline.wrapT(circuit.pitEntryT + 0.028));
  const pitEntryYaw = Math.atan2(pitEntrySample.tangent.x, pitEntrySample.tangent.z);
  const pitGantry = new THREE.Group();
  pitGantry.position.set(
    pitEntrySample.position.x + pitEntrySample.right.x * (halfW + 8.0),
    pitEntrySample.position.y,
    pitEntrySample.position.z + pitEntrySample.right.z * (halfW + 8.0),
  );
  pitGantry.rotation.y = pitEntryYaw;
  const pGantryMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.6 }));
  for (const sx of [-3.6, 3.6]) {
    const pCol = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(0.4, 5.2, 0.4)), pGantryMat);
    pCol.position.set(sx, 2.6, 0);
    pitGantry.add(pCol);
  }
  const pBeam = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(7.6, 0.5, 0.5)), pGantryMat);
  pBeam.position.set(0, 5.0, 0);
  const pSign = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(2.1, 2.1)), pitLimitMat);
  pSign.position.set(0, 5.1, -0.28);
  pSign.rotation.y = Math.PI;
  pitGantry.add(pBeam, pSign);
  group.add(pitGantry);

  const startSample = spline.getSampleAt(0);
  const startYaw = Math.atan2(startSample.tangent.x, startSample.tangent.z);

  // Team Pit Wall Timing Stand
  const pitWallGroup = new THREE.Group();
  pitWallGroup.position.set(
    startSample.position.x + startSample.right.x * (halfW + 2.2),
    startSample.position.y,
    startSample.position.z + startSample.right.z * (halfW + 2.2),
  );
  pitWallGroup.rotation.y = startYaw;
  const wallBaseMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.5 }));
  const wallCanopyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.35, metalness: 0.5 }));
  const pitWallBase = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 1.35, 138)), wallBaseMat);
  pitWallBase.position.y = 0.68;
  pitWallGroup.add(pitWallBase);
  const pitWallCanopy = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.3, 0.25, 102)), wallCanopyMat);
  pitWallCanopy.position.y = 3.35;
  pitWallGroup.add(pitWallCanopy);
  group.add(pitWallGroup);

  // 10-Team Color-Coded Paddock & Pit Garages Building
  const pitBuildingGroup = new THREE.Group();
  pitBuildingGroup.position.set(
    startSample.position.x + startSample.right.x * (halfW + 21.0),
    startSample.position.y,
    startSample.position.z + startSample.right.z * (halfW + 21.0),
  );
  pitBuildingGroup.rotation.y = startYaw;

  const garageBodyMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.42, metalness: 0.42 }));
  const garageGlassMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x09111e, roughness: 0.12, metalness: 0.9 }));
  const garageTrimMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.32 }));
  const garageShutterMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.6 }));

  const garageBox = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.5, 9.6, 175)), garageBodyMat);
  garageBox.position.y = 4.8;
  pitBuildingGroup.add(garageBox);

  const paddockClubGlass = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(12.9, 3.2, 162)), garageGlassMat);
  paddockClubGlass.position.y = 6.6;
  pitBuildingGroup.add(paddockClubGlass);

  const garageStripe = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(13.1, 0.85, 175)), garageTrimMat);
  garageStripe.position.y = 9.75;
  pitBuildingGroup.add(garageStripe);

  const bayGeo = trackGeo(new THREE.BoxGeometry(0.4, 3.2, 11.2));
  const baySignGeo = trackGeo(new THREE.BoxGeometry(0.45, 0.65, 12.5));
  for (let b = 0; b < 10; b++) {
    const teamColor = F1_TEAMS[b]?.primaryColor ?? '#e10600';
    const bay = new THREE.Mesh(bayGeo, garageShutterMat);
    bay.position.set(-6.28, 1.6, -72 + b * 16);
    const bayTeamSign = new THREE.Mesh(
      baySignGeo,
      trackMat(new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.35 })),
    );
    bayTeamSign.position.set(-6.32, 3.65, -72 + b * 16);
    pitBuildingGroup.add(bay, bayTeamSign);
  }
  group.add(pitBuildingGroup);

  // 10. Start/Finish Strip + FIA 5-Lights Gantry
  const sfTex = trackTex(createStartFinishTexture(renderer));
  const sfGeo = trackGeo(new THREE.PlaneGeometry(circuit.trackWidth - 0.6, 6.0));
  const sfMat = trackMat(
    new THREE.MeshBasicMaterial({
      map: sfTex,
      transparent: true,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  );
  const sfMesh = new THREE.Mesh(sfGeo, sfMat);
  sfMesh.position.set(startSample.position.x, startSample.position.y + 0.046, startSample.position.z);
  sfMesh.rotation.order = 'YXZ';
  sfMesh.rotation.y = startYaw;
  sfMesh.rotation.x = -Math.PI / 2;
  group.add(sfMesh);

  const gantryGroup = new THREE.Group();
  gantryGroup.position.copy(startSample.position);
  gantryGroup.rotation.y = startYaw;

  const gantryMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.65, roughness: 0.3 }),
  );
  const pillarGeo = trackGeo(new THREE.BoxGeometry(1.0, 8.8, 1.0));
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeo, gantryMat);
    pillar.position.set(side * (halfW + 1.8), 4.4, 0);
    gantryGroup.add(pillar);
  }
  const bridge = new THREE.Mesh(
    trackGeo(new THREE.BoxGeometry(circuit.trackWidth + 4.6, 1.5, 1.5)),
    gantryMat,
  );
  bridge.position.set(0, 8.1, 0);
  gantryGroup.add(bridge);

  const f1BannerTex = trackTex(
    createSponsorBannerTexture('FORMULA 1 GRAND PRIX', '#111827', '#e10600', renderer),
  );
  const f1BannerMat = trackMat(new THREE.MeshBasicMaterial({ map: f1BannerTex }));
  const f1BannerMesh = new THREE.Mesh(
    trackGeo(new THREE.PlaneGeometry(circuit.trackWidth + 2.5, 1.35)),
    f1BannerMat,
  );
  f1BannerMesh.position.set(0, 8.15, -0.78);
  f1BannerMesh.rotation.y = Math.PI;
  gantryGroup.add(f1BannerMesh);

  const lightPods: THREE.MeshStandardMaterial[] = [];
  const podGeo = trackGeo(new THREE.SphereGeometry(0.38, 12, 12));
  for (let i = 0; i < 5; i++) {
    const podMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x260808,
        emissive: new THREE.Color(0xff1100),
        emissiveIntensity: 0,
        roughness: 0.2,
      }),
    );
    const pod = new THREE.Mesh(podGeo, podMat);
    pod.position.set((i - 2) * 1.55, 6.95, -0.68);
    gantryGroup.add(pod);
    lightPods.push(podMat);
  }
  group.add(gantryGroup);

  // 11. Overhanging Sponsor Gantries + FIA LED Marshal Flag Panels
  const sponsorLabels = ['PIRELLI P ZERO', 'ARAMCO', 'ROLEX', 'DHL', 'CRYPTO.COM'];
  const sponsorMats = sponsorLabels.map((lbl, idx) => {
    const tex = trackTex(
      createSponsorBannerTexture(
        lbl,
        idx === 2 ? '#064e3b' : '#0f172a',
        idx === 0 ? '#facc15' : idx === 3 ? '#f59e0b' : '#e10600',
        renderer,
      ),
    );
    return trackMat(new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide }));
  });

  const marshalLedMats: THREE.MeshStandardMaterial[] = [];
  const sPillarGeo = trackGeo(new THREE.BoxGeometry(0.65, 7.4, 0.65));
  const sSignGeo = trackGeo(new THREE.BoxGeometry(circuit.trackWidth + 7.6, 1.95, 0.55));
  const ledGeo = trackGeo(new THREE.BoxGeometry(0.35, 1.45, 1.25));

  const gantryTs =
    circuit.id === 'monaco'
      ? [0.11, 0.32, 0.73, 0.89]
      : [0.16, 0.38, 0.60, 0.78, 0.90];
  gantryTs.forEach((gt, idx) => {
    const s = spline.getSampleAt(gt);
    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const sg = new THREE.Group();
    sg.position.copy(s.position);
    sg.rotation.y = yaw;

    for (const side of [-1, 1]) {
      const pil = new THREE.Mesh(sPillarGeo, gantryMat);
      pil.position.set(side * (halfW + 3.8), 3.7, 0);
      sg.add(pil);
    }
    const sign = new THREE.Mesh(sSignGeo, sponsorMats[idx % sponsorMats.length]);
    sign.position.set(0, 6.9, 0);
    sg.add(sign);

    const ledMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x052e16,
        emissive: new THREE.Color(0x22c55e),
        emissiveIntensity: 1.2,
      }),
    );
    marshalLedMats.push(ledMat);
    const ledBoard = new THREE.Mesh(ledGeo, ledMat);
    ledBoard.position.set(-(halfW + 3.4), 2.75, 0);
    sg.add(ledBoard);

    group.add(sg);
  });

  // DRS Zone Start Strip Lines + Illuminated Trackside DRS Signboards
  const drsBoardMat = trackMat(
    new THREE.MeshStandardMaterial({
      color: 0x10b981,
      emissive: new THREE.Color(0x059669),
      emissiveIntensity: 0.75,
    }),
  );
  const drsSignTex = trackTex(createDrsBoardTexture(renderer));
  const drsSignMat = trackMat(new THREE.MeshBasicMaterial({ map: drsSignTex, side: THREE.DoubleSide }));
  const drsSignGeo = trackGeo(new THREE.PlaneGeometry(2.4, 1.2));
  const drsGeo = trackGeo(new THREE.PlaneGeometry(circuit.trackWidth * 0.88, 1.25));

  for (const dz of circuit.drsZones) {
    const sStart = spline.getSampleAt(dz.startT);
    const yaw = Math.atan2(sStart.tangent.x, sStart.tangent.z);
    const marker = new THREE.Mesh(drsGeo, drsBoardMat);
    marker.position.set(sStart.position.x, sStart.position.y + 0.046, sStart.position.z);
    marker.rotation.order = 'YXZ';
    marker.rotation.y = yaw;
    marker.rotation.x = -Math.PI / 2;
    group.add(marker);

    for (const side of [-1, 1] as const) {
      const signWallOff = side > 0 ? sStart.rightWallOffset : sStart.leftWallOffset;
      const signDist = Math.min(signWallOff - 1.35, halfW + 4.2);
      const sign = new THREE.Mesh(drsSignGeo, drsSignMat);
      sign.position.set(
        sStart.position.x + sStart.right.x * side * signDist,
        sStart.position.y + 2.0,
        sStart.position.z + sStart.right.z * side * signDist,
      );
      sign.rotation.y = yaw;
      group.add(sign);
    }
  }

  // 12. Crowd-Filled Grandstands at Key Viewing Sections
  const standMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.72 }));
  const crowdTex = trackTex(createCrowdStandTexture(renderer));
  const crowdMat = trackMat(new THREE.MeshStandardMaterial({ map: crowdTex, roughness: 0.82 }));
  const roofMat = trackMat(
    new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.35, metalness: 0.38 }),
  );
  const standShellGeo = trackGeo(new THREE.BoxGeometry(12, 5.5, 68));
  const standCrowdGeo = trackGeo(new THREE.BoxGeometry(10.5, 3.8, 66));
  const standRoofGeo = trackGeo(new THREE.BoxGeometry(15.5, 0.55, 70));

  const standConfigs: ReadonlyArray<readonly [number, -1 | 1]> =
    circuit.id === 'monaco'
      ? [
          [0.03, -1],
          [0.95, -1],
          [0.14, 1],
          [0.35, -1],
          [0.72, -1],
        ]
      : [
          [0.02, -1],
          [0.95, -1],
          [0.14, 1],
          [0.36, -1],
          [0.54, 1],
          [0.74, -1],
        ];

  for (const [st, side] of standConfigs) {
    const s = spline.getSampleAt(st);
    const wallOff = side > 0 ? s.rightWallOffset : s.leftWallOffset;
    const standDist = Math.max(halfW + 21.5, wallOff + 13.0);
    const sx = s.position.x + s.right.x * side * standDist;
    const sz = s.position.z + s.right.z * side * standDist;

    const yaw = Math.atan2(s.tangent.x, s.tangent.z);
    const standRotY = yaw + (side > 0 ? Math.PI : 0);
    const cosR = Math.cos(standRotY);
    const sinR = Math.sin(standRotY);

    // Ensure the full 70m × 16m grandstand footprint never touches or clips ANY track segment or barrier
    let standClear = true;
    const minReqCenterDist = halfW + 5.0;
    for (let lz = -35; lz <= 35 && standClear; lz += 7) {
      for (let lx = -11; lx <= 4 && standClear; lx += 5) {
        const wx = sx + lx * cosR + lz * sinR;
        const wz = sz - lx * sinR + lz * cosR;
        for (let k = 0; k < N; k += 4) {
          const other = spline.samples[k];
          const d = Math.hypot(wx - other.position.x, wz - other.position.z);
          if (d < minReqCenterDist) {
            standClear = false;
            break;
          }
        }
      }
    }
    if (!standClear) continue;

    const stand = new THREE.Group();
    stand.position.set(sx, s.position.y, sz);
    stand.rotation.y = standRotY;

    const shell = new THREE.Mesh(standShellGeo, standMat);
    shell.position.set(-4.5, 2.75, 0);
    stand.add(shell);

    const crowd = new THREE.Mesh(standCrowdGeo, crowdMat);
    crowd.position.set(-2.2, 4.4, 0);
    crowd.rotation.z = -0.34;
    stand.add(crowd);

    const roof = new THREE.Mesh(standRoofGeo, roofMat);
    roof.position.set(-3.2, 10.6, 0);
    roof.rotation.z = -0.15;
    stand.add(roof);
    group.add(stand);
  }

  // 13. Real-Life Circuit Landmarks
  if (circuit.id === 'monaco') {
    // 13a. Continuous Swept 3D Louis II Tunnel (t = 0.580 .. 0.692) with Coastal Pillars & Overhead Lights
    const tunnelStartT = 0.580;
    const tunnelEndT = 0.692;
    const tunnelSegs = 72;
    const tunnelInnerHalfW = halfW + 2.4;
    const wallH = 3.8;
    const crownH = 5.9;
    const archSteps = 6; // profile verts per ring across ceiling: inland base -> inland eave -> ceiling curve -> sea eave

    const tVerts: number[] = [];
    const tIdx: number[] = [];
    const colsPerRing = archSteps + 1;

    const tunnelConcreteMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x2a313c,
        roughness: 0.78,
        metalness: 0.08,
        side: THREE.DoubleSide,
      }),
    );
    const tunnelOuterStoneMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x94a3b8, roughness: 0.82 }),
    );
    const tunnelLightMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xfef3c7 }));

    for (let k = 0; k <= tunnelSegs; k++) {
      const t = tunnelStartT + (k / tunnelSegs) * (tunnelEndT - tunnelStartT);
      const s = spline.getSampleAt(t);
      const p = s.position;
      const r = s.right; // +r = Inland (Monte Carlo cliff), -r = Seaward (Mediterranean side)

      // Ring vertices from +r floor -> +r wall top -> curved ceiling arch -> -r wall top
      for (let a = 0; a <= archSteps; a++) {
        let lat = 0;
        let h = 0;
        if (a === 0) {
          lat = tunnelInnerHalfW;
          h = -0.2;
        } else {
          const frac = (a - 1) / (archSteps - 1); // 0..1 across roof from +r wall to -r eave
          lat = THREE.MathUtils.lerp(tunnelInnerHalfW, -tunnelInnerHalfW, frac);
          h = wallH + Math.sin(frac * Math.PI) * (crownH - wallH);
        }
        tVerts.push(p.x + r.x * lat, p.y + h, p.z + r.z * lat);
      }

      if (k < tunnelSegs) {
        for (let a = 0; a < archSteps; a++) {
          const r0 = k * colsPerRing + a;
          const r1 = r0 + colsPerRing;
          tIdx.push(r0, r0 + 1, r1, r0 + 1, r1 + 1, r1);
        }
      }

      // Overhead glowing sodium/LED ceiling strip lights + coastal arcade sea-view columns
      if (k > 1 && k < tunnelSegs - 1 && k % 3 === 0) {
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        const lamp = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.1, 0.16, 4.2)), tunnelLightMat);
        lamp.position.set(p.x, p.y + crownH - 0.14, p.z);
        lamp.rotation.y = yaw;
        group.add(lamp);

        // Seaward coastal structural column on -r side (between bays, glimpses of harbor & sea!)
        const col = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(0.95, wallH + 0.4, 1.4)),
          tunnelOuterStoneMat,
        );
        col.position.set(
          p.x - r.x * tunnelInnerHalfW,
          p.y + wallH * 0.5,
          p.z - r.z * tunnelInnerHalfW,
        );
        col.rotation.y = yaw;
        group.add(col);
      }
    }

    const tunnelGeo = trackGeo(new THREE.BufferGeometry());
    tunnelGeo.setAttribute('position', new THREE.Float32BufferAttribute(tVerts, 3));
    tunnelGeo.setIndex(tIdx);
    tunnelGeo.computeVertexNormals();
    group.add(new THREE.Mesh(tunnelGeo, tunnelConcreteMat));

    // Tunnel Entrance & Exit Stone Portals
    for (const ptT of [tunnelStartT, tunnelEndT]) {
      const s = spline.getSampleAt(ptT);
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const portal = new THREE.Group();
      portal.position.copy(s.position);
      portal.rotation.y = yaw;
      const lintel = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(tunnelInnerHalfW * 2 + 2.4, 1.8, 2.0)),
        tunnelOuterStoneMat,
      );
      lintel.position.set(0, crownH + 0.4, 0);
      portal.add(lintel);
      for (const side of [-1, 1]) {
        const jamb = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(1.4, crownH + 0.8, 2.0)),
          tunnelOuterStoneMat,
        );
        jamb.position.set(side * (tunnelInnerHalfW + 0.5), (crownH + 0.4) * 0.5, 0);
        portal.add(jamb);
      }
      group.add(portal);
    }

    // 13b. Stade Nautique Rainier III (Iconic Turquoise Swimming Pool beside Piscine chicanes)
    const poolGroup = new THREE.Group();
    poolGroup.position.set(-22, -0.15, 366);
    poolGroup.rotation.y = -0.12;
    const poolDeckMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.7 }));
    const poolWaterMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x06b6d4,
        emissive: new THREE.Color(0x0284c7),
        emissiveIntensity: 0.35,
        roughness: 0.12,
        metalness: 0.25,
      }),
    );
    const poolDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(44, 0.9, 76)), poolDeckMat);
    poolDeck.position.y = 0.2;
    const poolBasin = new THREE.Mesh(trackGeo(new THREE.PlaneGeometry(34, 62)), poolWaterMat);
    poolBasin.rotation.x = -Math.PI / 2;
    poolBasin.position.y = 0.68;
    poolGroup.add(poolDeck, poolBasin);
    group.add(poolGroup);

    // 13c. Beaux-Arts Casino de Monte-Carlo overlooking Casino Square (Turn 4 crest)
    const casinoGroup = new THREE.Group();
    casinoGroup.position.set(175, 25.2, -536);
    casinoGroup.rotation.y = 0.24;
    const casinoStoneMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf1e5cf, roughness: 0.58 }));
    const casinoDomeMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x2d6a62, roughness: 0.36, metalness: 0.32 }),
    );
    const casinoMain = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(64, 18, 28)), casinoStoneMat);
    casinoMain.position.y = 9;
    casinoGroup.add(casinoMain);
    for (const dx of [-21, 21]) {
      const dome = new THREE.Mesh(trackGeo(new THREE.SphereGeometry(7.2, 16, 12)), casinoDomeMat);
      dome.position.set(dx, 19, 0);
      casinoGroup.add(dome);
    }
    group.add(casinoGroup);

    // 13d. Port Hercule Concrete Promenade Quay + 18 Moored Superyachts in Harbor Basin
    const quayMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.78 }));
    const quayPier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(10, 1.4, 245)), quayMat);
    quayPier.position.set(-40, -0.3, 385);
    const quayNorth = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(360, 1.4, 12)), quayMat);
    quayNorth.position.set(135, -0.3, 254);
    group.add(quayPier, quayNorth);

    const hullGeo = trackGeo(new THREE.BoxGeometry(8.4, 2.8, 30));
    const deckGeo = trackGeo(new THREE.BoxGeometry(6.4, 2.6, 18));
    const bridgeGeo = trackGeo(new THREE.BoxGeometry(4.6, 2.2, 7.5));
    const mastGeo = trackGeo(new THREE.CylinderGeometry(0.14, 0.22, 12, 6));
    const hullMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.18 }));
    const yachtGlassMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.12, metalness: 0.88 }),
    );

    for (let yIdx = 0; yIdx < 18; yIdx++) {
      const yacht = new THREE.Group();
      const hull = new THREE.Mesh(hullGeo, hullMat);
      hull.position.y = 0.7;
      const deck = new THREE.Mesh(deckGeo, hullMat);
      deck.position.set(0, 3.1, -1.5);
      const bridge = new THREE.Mesh(bridgeGeo, yachtGlassMat);
      bridge.position.set(0, 5.1, -1);
      const mast = new THREE.Mesh(mastGeo, hullMat);
      mast.position.set(0, 10.4, -1);
      yacht.add(hull, deck, bridge, mast);

      const col = yIdx % 6;
      const row = Math.floor(yIdx / 6);
      yacht.position.set(40 + col * 46, -0.45, 295 + row * 72);
      yacht.rotation.y = (row % 2 === 0 ? 0.15 : -0.18) + (col % 3) * 0.06;
      group.add(yacht);
    }

    // 13e. Mediterranean Palm Trees along Beau Rivage, Casino Gardens & Harbor Promenade
    const palmTrunkGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.45, 9.5, 6));
    const palmCrownGeo = trackGeo(new THREE.ConeGeometry(3.8, 3.2, 7));
    const palmTrunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x6b4f35, roughness: 0.9 }));
    const palmCrownMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x15803d, roughness: 0.8 }));
    const palmCount = 96;
    const pTrunkInst = new THREE.InstancedMesh(palmTrunkGeo, palmTrunkMat, palmCount);
    const pCrownInst = new THREE.InstancedMesh(palmCrownGeo, palmCrownMat, palmCount);
    let pPlaced = 0;
    for (let pt = 0; pt < N && pPlaced < palmCount; pt += 12) {
      const s = spline.samples[pt];
      if (pt / N > 0.56 && pt / N < 0.70) continue; // skip tunnel
      const side = (pPlaced % 2 === 0 ? -1 : 1) as -1 | 1;
      const wallOff = side > 0 ? s.rightWallOffset : s.leftWallOffset;
      const px = s.position.x + s.right.x * side * (wallOff + 3.2);
      const pz = s.position.z + s.right.z * side * (wallOff + 3.2);
      const info = computeTerrainHeight(px, pz);
      if (info.isWater) continue;

      dummy.position.set(px, s.position.y + 4.4, pz);
      dummy.rotation.set(0, pPlaced * 0.7, 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pTrunkInst.setMatrixAt(pPlaced, dummy.matrix);

      dummy.position.set(px, s.position.y + 9.2, pz);
      dummy.rotation.set(Math.PI, pPlaced * 0.7, 0);
      dummy.updateMatrix();
      pCrownInst.setMatrixAt(pPlaced, dummy.matrix);
      pPlaced++;
    }
    pTrunkInst.count = pPlaced;
    pCrownInst.count = pPlaced;
    pTrunkInst.instanceMatrix.needsUpdate = true;
    pCrownInst.instanceMatrix.needsUpdate = true;
    pTrunkInst.computeBoundingSphere();
    pCrownInst.computeBoundingSphere();
    group.add(pTrunkInst, pCrownInst);
  }

  if (circuit.id === 'monza') {
    // 13f. Iconic Historic 1922 Monza Steep Concrete Oval Banking Ruins flanking Curva Grande / Serraglio
    const bankingMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x7c838e, roughness: 0.92, side: THREE.DoubleSide }),
    );
    const bankCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-420, 0, 740),
      new THREE.Vector3(-920, 0, 720),
      new THREE.Vector3(-1195, 0, 420),
      new THREE.Vector3(-1215, 0, -40),
      new THREE.Vector3(-1040, 0, -390),
    ]);
    const bankVerts: number[] = [];
    const bankIdx: number[] = [];
    const bSegs = 44;
    for (let i = 0; i <= bSegs; i++) {
      const u = i / bSegs;
      const pt = bankCurve.getPointAt(u);
      const tan = bankCurve.getTangentAt(u).normalize();
      const radOut = new THREE.Vector3(-tan.z, 0, tan.x).normalize();
      bankVerts.push(pt.x, pt.y + 0.1, pt.z);
      bankVerts.push(pt.x + radOut.x * 26, pt.y + 15.5, pt.z + radOut.z * 26);
      if (i < bSegs) {
        const a = i * 2;
        bankIdx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const bankGeo = trackGeo(new THREE.BufferGeometry());
    bankGeo.setAttribute('position', new THREE.Float32BufferAttribute(bankVerts, 3));
    bankGeo.setIndex(bankIdx);
    bankGeo.computeVertexNormals();
    group.add(new THREE.Mesh(bankGeo, bankingMat));

    // Iconic Monza Cantilevered Podium Truss overlooking Start/Finish Straight
    const podiumGroup = new THREE.Group();
    podiumGroup.position.set(
      startSample.position.x + startSample.right.x * (halfW + 7.5),
      startSample.position.y,
      startSample.position.z + startSample.right.z * (halfW + 7.5),
    );
    podiumGroup.rotation.y = startYaw;
    const trussMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xe10600, roughness: 0.35, metalness: 0.4 }));
    const deckMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, roughness: 0.45 }));
    const pStalk = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(1.4, 9.5, 5.2)), trussMat);
    pStalk.position.y = 4.75;
    const pCantilever = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(9.5, 1.1, 14.0)), deckMat);
    pCantilever.position.set(-4.2, 9.4, 0);
    podiumGroup.add(pStalk, pCantilever);
    group.add(podiumGroup);
  }

  if (circuit.id === 'silverstone') {
    // 13g. Iconic Silverstone Wing Angled Gullwing Glass Roof above Hamilton Straight Paddock
    const wingMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.72, roughness: 0.24 }),
    );
    const wingGroup = new THREE.Group();
    wingGroup.position.set(
      startSample.position.x + startSample.right.x * (halfW + 21.0),
      startSample.position.y + 10.6,
      startSample.position.z + startSample.right.z * (halfW + 21.0),
    );
    wingGroup.rotation.y = startYaw;
    for (const segZ of [-48, 0, 48]) {
      const leaf = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(20, 0.7, 54)), wingMat);
      leaf.position.set(-2.5, 1.2, segZ);
      leaf.rotation.z = -0.18;
      wingGroup.add(leaf);
    }
    group.add(wingGroup);

    // Heritage Silverstone Stone & Steel Track Overpass Bridge on Wellington Straight (t = 0.29)
    const brSample = spline.getSampleAt(0.29);
    const brGroup = new THREE.Group();
    brGroup.position.copy(brSample.position);
    brGroup.rotation.y = Math.atan2(brSample.tangent.x, brSample.tangent.z);
    const brMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.5, metalness: 0.4 }));
    const brDeck = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(circuit.trackWidth + 14, 2.2, 5.4)), brMat);
    brDeck.position.y = 8.4;
    brGroup.add(brDeck);
    for (const side of [-1, 1]) {
      const pier = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(2.4, 8.8, 5.2)), brMat);
      pier.position.set(side * (halfW + 6.5), 4.4, 0);
      brGroup.add(pier);
    }
    group.add(brGroup);
  }

  if (circuit.id === 'spa') {
    // 13h. Iconic Spa-Francorchamps Eau Rouge Steep Valley Concrete Escarpment & Endurance Chalet
    const cliffMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x3f4752, roughness: 0.9 }));
    const chaletMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x7c2d12, roughness: 0.75 }));
    const chaletRoofMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.6 }));
    for (let i = Math.floor(N * 0.11); i <= Math.floor(N * 0.185); i += 5) {
      const s = spline.samples[i];
      if (s.position.y < 1.5) continue;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);
      const retaining = new THREE.Mesh(
        trackGeo(new THREE.BoxGeometry(circuit.trackWidth + 9, s.position.y + 1.2, 16)),
        cliffMat,
      );
      retaining.position.set(s.position.x, s.position.y * 0.5 - 0.6, s.position.z);
      retaining.rotation.y = yaw;
      group.add(retaining);
    }

    // Iconic Eau Rouge Belgian Chalet overlooking Raidillon Entry
    const erSample = spline.getSampleAt(0.125);
    const chalet = new THREE.Group();
    chalet.position.set(
      erSample.position.x - erSample.right.x * (halfW + 24),
      erSample.position.y + 1.0,
      erSample.position.z - erSample.right.z * (halfW + 24),
    );
    chalet.rotation.y = Math.atan2(erSample.tangent.x, erSample.tangent.z);
    const cBody = new THREE.Mesh(trackGeo(new THREE.BoxGeometry(16, 10, 26)), chaletMat);
    cBody.position.y = 5;
    const cRoof = new THREE.Mesh(trackGeo(new THREE.ConeGeometry(16, 6, 4)), chaletRoofMat);
    cRoof.position.y = 13;
    cRoof.rotation.y = Math.PI / 4;
    chalet.add(cBody, cRoof);
    group.add(chalet);
  }

  if (circuit.id === 'interlagos') {
    // 13i. Iconic Interlagos White-Red-Green Concrete Control Tower overlooking Start/Finish
    const towerMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.55 }));
    const towerGlass = trackMat(new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.15, metalness: 0.85 }));
    const towerGroup = new THREE.Group();
    towerGroup.position.set(
      startSample.position.x + startSample.right.x * (halfW + 32),
      startSample.position.y,
      startSample.position.z + startSample.right.z * (halfW + 32),
    );
    const tShaft = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(3.4, 4.2, 26, 12)), towerMat);
    tShaft.position.y = 13;
    const tPod = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(7.2, 5.4, 5.5, 16)), towerGlass);
    tPod.position.y = 27.5;
    const tCap = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(7.8, 7.2, 1.4, 16)), towerMat);
    tCap.position.y = 30.8;
    towerGroup.add(tShaft, tPod, tCap);
    group.add(towerGroup);
  }

  if (circuit.id === 'suzuka') {
    const bridgeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.72 }));
    const pierGeo = trackGeo(new THREE.BoxGeometry(2.8, 14.5, 2.8));
    const isNearUnderpassRoad = (px: number, pz: number) => {
      for (let k = 0; k < N; k += 5) {
        const ls = spline.samples[k];
        if (ls.position.y > 4.0) continue;
        if (Math.hypot(px - ls.position.x, pz - ls.position.z) < halfW + 11) return true;
      }
      return false;
    };

    for (let i = Math.floor(N * 0.70); i <= Math.floor(N * 0.88); i += 4) {
      const s = spline.samples[i];
      if (s.position.y > 4.2) {
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        const soffit = new THREE.Mesh(
          trackGeo(new THREE.BoxGeometry(circuit.trackWidth + 5, 1.4, 14)),
          bridgeMat,
        );
        soffit.position.set(s.position.x, s.position.y - 0.74, s.position.z);
        soffit.rotation.y = yaw;
        group.add(soffit);

        if (i % 12 === 0 && s.position.y > 8.5) {
          for (const side of [-1, 1]) {
            const px = s.position.x + s.right.x * side * (halfW + 3.4);
            const pz = s.position.z + s.right.z * side * (halfW + 3.4);
            if (isNearUnderpassRoad(px, pz)) continue;
            const pier = new THREE.Mesh(pierGeo, bridgeMat);
            pier.position.set(px, s.position.y * 0.5 - 0.6, pz);
            group.add(pier);
          }
        }
      }
    }

    // Iconic Yellow & Black Dunlop Tyre Arch Bridge at Dunlop Curve (t = 0.23)
    const dunlopS = spline.getSampleAt(0.23);
    const dunlopArch = new THREE.Group();
    dunlopArch.position.copy(dunlopS.position);
    dunlopArch.rotation.y = Math.atan2(dunlopS.tangent.x, dunlopS.tangent.z);
    const dunlopTyreMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.72 }),
    );
    const dunlopGoldMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0xfacc15, roughness: 0.35 }),
    );
    const archSpan = trackGeo(new THREE.TorusGeometry(halfW + 4.5, 2.2, 10, 26, Math.PI));
    const dArch = new THREE.Mesh(archSpan, dunlopTyreMat);
    dArch.position.y = 0.5;
    const dStripe = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(halfW + 4.5, 2.35, 8, 26, Math.PI * 0.55)),
      dunlopGoldMat,
    );
    dStripe.position.y = 0.5;
    dStripe.rotation.z = Math.PI * 0.225;
    dunlopArch.add(dArch, dStripe);
    group.add(dunlopArch);

    // Upgraded Suzuka Circuit Plaza Ferris Wheel with Illuminated Hub & 24 Gondolas (clear at 1:1 scale)
    const wheelGroup = new THREE.Group();
    wheelGroup.position.set(657, 74, -458);
    wheelGroup.rotation.y = -0.62;
    const wheelRing = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(60, 1.9, 10, 48)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          emissive: 0xe10600,
          emissiveIntensity: 0.8,
        }),
      ),
    );
    const wheelSpokeGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 120, 6));
    const spokeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
    wheelGroup.add(wheelRing);
    for (let k = 0; k < 12; k++) {
      const sp = new THREE.Mesh(wheelSpokeGeo, spokeMat);
      sp.rotation.z = (k / 12) * Math.PI;
      wheelGroup.add(sp);
    }
    const podGeo = trackGeo(new THREE.BoxGeometry(3.2, 3.6, 3.2));
    const podRed = trackMat(new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xef4444, emissiveIntensity: 0.45 }));
    const podWhite = trackMat(new THREE.MeshStandardMaterial({ color: 0xf8fafc, emissive: 0xfef08a, emissiveIntensity: 0.45 }));
    for (let g = 0; g < 24; g++) {
      const ang = (g / 24) * Math.PI * 2;
      const pod = new THREE.Mesh(podGeo, g % 2 === 0 ? podRed : podWhite);
      pod.position.set(Math.cos(ang) * 60, Math.sin(ang) * 60, 0);
      wheelGroup.add(pod);
    }
    for (const lx of [-32, 32]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.6, 2.5, 82, 8)), spokeMat);
      leg.position.set(lx, -38, 0);
      leg.rotation.z = lx > 0 ? 0.36 : -0.36;
      wheelGroup.add(leg);
    }
    group.add(wheelGroup);
  }

  if (circuit.id === 'singapore') {
    const mbsGroup = new THREE.Group();
    mbsGroup.position.set(-48, 0, -54);
    mbsGroup.rotation.y = 0.22;
    const mbsPlinth = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(190, 3.4, 78)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.6 })),
    );
    mbsPlinth.position.y = 0.6;
    mbsGroup.add(mbsPlinth);
    const mbsTowerMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        emissive: 0x38bdf8,
        emissiveIntensity: 0.46,
        metalness: 0.78,
        roughness: 0.18,
      }),
    );
    const towerBaseGeo = trackGeo(new THREE.BoxGeometry(20, 158, 32));
    for (const tx of [-52, 0, 52]) {
      const tower = new THREE.Mesh(towerBaseGeo, mbsTowerMat);
      tower.position.set(tx, 79, 0);
      mbsGroup.add(tower);
    }
    const skyPark = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(176, 11, 40)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0x0f172a,
          emissive: 0xfacc15,
          emissiveIntensity: 0.42,
          metalness: 0.65,
        }),
      ),
    );
    skyPark.position.set(10, 162, 0);
    mbsGroup.add(skyPark);
    group.add(mbsGroup);

    // Double-Helix Illuminated Pedestrian Bridge spanning Marina Bay edge
    const helixGroup = new THREE.Group();
    helixGroup.position.set(220, 4.5, 290);
    helixGroup.rotation.y = -0.78;
    const helixMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xf8fafc,
        emissive: 0x8b5cf6,
        emissiveIntensity: 0.9,
        metalness: 0.6,
      }),
    );
    const helixDeck = new THREE.Mesh(
      trackGeo(new THREE.BoxGeometry(14, 1.4, 175)),
      trackMat(new THREE.MeshStandardMaterial({ color: 0x334155 })),
    );
    helixGroup.add(helixDeck);
    for (let r = -70; r <= 70; r += 14) {
      const ring = new THREE.Mesh(trackGeo(new THREE.TorusGeometry(8.5, 0.45, 6, 16)), helixMat);
      ring.position.set(0, 3.8, r);
      helixGroup.add(ring);
    }
    group.add(helixGroup);

    // Singapore Flyer Observation Wheel (scaled cleanly to 1:1 waterfront plaza)
    const flyerGroup = new THREE.Group();
    flyerGroup.position.set(482, 72, 238);
    flyerGroup.rotation.y = 0.75;
    const flyer = new THREE.Mesh(
      trackGeo(new THREE.TorusGeometry(62, 1.9, 10, 48)),
      trackMat(
        new THREE.MeshStandardMaterial({
          color: 0xf8fafc,
          emissive: 0x38bdf8,
          emissiveIntensity: 1.0,
        }),
      ),
    );
    flyerGroup.add(flyer);
    const fSpokeGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.45, 124, 6));
    const fSpokeMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x94a3b8 }));
    for (let k = 0; k < 12; k++) {
      const sp = new THREE.Mesh(fSpokeGeo, fSpokeMat);
      sp.rotation.z = (k / 12) * Math.PI;
      flyerGroup.add(sp);
    }
    const capsuleGeo = trackGeo(new THREE.BoxGeometry(3.4, 4.2, 3.4));
    const capsuleMat = trackMat(
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x7dd3fc, emissiveIntensity: 0.95 }),
    );
    for (let c = 0; c < 24; c++) {
      const ang = (c / 24) * Math.PI * 2;
      const cap = new THREE.Mesh(capsuleGeo, capsuleMat);
      cap.position.set(Math.cos(ang) * 62, Math.sin(ang) * 62, 0);
      flyerGroup.add(cap);
    }
    const flyerSupportMat = trackMat(new THREE.MeshStandardMaterial({ color: 0xcbd5e1 }));
    for (const lx of [-32, 32]) {
      const leg = new THREE.Mesh(trackGeo(new THREE.CylinderGeometry(1.5, 2.2, 82, 8)), flyerSupportMat);
      leg.position.set(lx, -38, 0);
      leg.rotation.z = lx > 0 ? 0.35 : -0.35;
      flyerGroup.add(leg);
    }
    group.add(flyerGroup);

    // Iconic Anderson Bridge Steel Arch Truss anchored accurately at t = 0.583
    const abSample = spline.getSampleAt(0.583);
    const abGroup = new THREE.Group();
    abGroup.position.copy(abSample.position);
    abGroup.rotation.y = Math.atan2(abSample.tangent.x, abSample.tangent.z);
    const abSteelMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: 0xe2e8f0,
        emissive: 0x93c5fd,
        emissiveIntensity: 0.25,
        metalness: 0.55,
      }),
    );
    const abArchGeo = trackGeo(new THREE.TorusGeometry(9.5, 0.45, 8, 22, Math.PI));
    for (const side of [-1, 1]) {
      const arch = new THREE.Mesh(abArchGeo, abSteelMat);
      arch.position.set(side * (halfW + 1.2), 0.2, 0);
      arch.rotation.y = Math.PI / 2;
      abGroup.add(arch);
    }
    group.add(abGroup);
  }

  // 14. Instanced City Skyscrapers / Mediterranean Apartments OR Two-Part Forest Trees
  const isNearTrack = (x: number, z: number, minClearance: number) => {
    const minSq = minClearance * minClearance;
    for (let i = 0; i < N; i += 6) {
      const p = spline.samples[i].position;
      const dx = x - p.x;
      const dz = z - p.z;
      if (dx * dx + dz * dz < minSq) return true;
    }
    return false;
  };

  if (circuit.environment === 'nightcity' || circuit.environment === 'harbor') {
    const facadeTex = trackTex(createBuildingFacadeTexture(isNight, renderer));
    const count = 280;
    const bldgGeo = trackGeo(new THREE.BoxGeometry(1, 1, 1));
    const bldgMat = trackMat(
      new THREE.MeshStandardMaterial({
        map: facadeTex,
        color: isNight ? 0xe2e8f0 : 0xf4ece0,
        emissive: new THREE.Color(isNight ? 0x1e3a8a : 0x000000),
        emissiveIntensity: isNight ? 0.45 : 0,
        roughness: isNight ? 0.3 : 0.65,
        metalness: isNight ? 0.65 : 0.08,
      }),
    );
    const inst = new THREE.InstancedMesh(bldgGeo, bldgMat, count);
    let placed = 0;
    let attempts = 0;
    const spread = isNight ? 2100 : 1650;
    while (placed < count && attempts < count * 14) {
      attempts++;
      const x = (Math.random() - 0.5) * spread;
      const z = (Math.random() - 0.5) * spread;
      if (isNearTrack(x, z, halfW + 32)) continue;
      if (circuit.environment === 'nightcity' && x > -465 && x < 370 && z > -395 && z < 395) continue;
      if (circuit.environment === 'harbor') {
        const info = computeTerrainHeight(x, z);
        if (info.isWater) continue;
        // Keep Pit Complex, Swimming Pool & Casino plaza clear of random towers
        if (x > -305 && x < -255 && z > 180 && z < 400) continue;
        if (x > -60 && x < 20 && z > 310 && z < 425) continue;
        if (x > 125 && x < 225 && z > -570 && z < -495) continue;
        const h = 16 + Math.random() * 44;
        const w = 18 + Math.random() * 24;
        dummy.position.set(x, info.y + h * 0.5 - 1.2, z);
        dummy.scale.set(w, h, w);
        dummy.rotation.set(0, Math.floor(Math.random() * 4) * (Math.PI / 2), 0);
        dummy.updateMatrix();
        inst.setMatrixAt(placed++, dummy.matrix);
        continue;
      }

      const h = 42 + Math.random() * 135;
      const w = 22 + Math.random() * 26;
      dummy.position.set(x, h * 0.5 - 0.5, z);
      dummy.scale.set(w, h, w);
      dummy.rotation.set(0, Math.floor(Math.random() * 4) * (Math.PI / 2), 0);
      dummy.updateMatrix();
      inst.setMatrixAt(placed++, dummy.matrix);
    }
    inst.count = placed;
    inst.instanceMatrix.needsUpdate = true;
    inst.computeBoundingSphere();
    group.add(inst);

    if (isNight) {
      const lampMat = trackMat(new THREE.MeshBasicMaterial({ color: 0xf8fafc }));
      const poleMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x334155 }));
      const poleGeo = trackGeo(new THREE.CylinderGeometry(0.28, 0.38, 16, 6));
      const headGeo = trackGeo(new THREE.BoxGeometry(3.4, 0.9, 1.1));
      for (let i = 0; i < N; i += 36) {
        const s = spline.samples[i];
        const yaw = Math.atan2(s.tangent.x, s.tangent.z);
        for (const side of [-1, 1] as const) {
          const wallOff = side > 0 ? s.rightWallOffset : s.leftWallOffset;
          const pole = new THREE.Mesh(poleGeo, poleMat);
          pole.position.set(
            s.position.x + s.right.x * side * (wallOff + 1.2),
            s.position.y + 8,
            s.position.z + s.right.z * side * (wallOff + 1.2),
          );
          group.add(pole);

          const head = new THREE.Mesh(headGeo, lampMat);
          head.position.set(
            s.position.x + s.right.x * side * (wallOff + 0.1),
            s.position.y + 16.0,
            s.position.z + s.right.z * side * (wallOff + 0.1),
          );
          head.rotation.y = yaw;
          group.add(head);
        }
      }
    }
  } else {
    const count = 420;
    const trunkGeo = trackGeo(new THREE.CylinderGeometry(0.45, 0.7, 5.5, 6));
    const trunkMat = trackMat(new THREE.MeshStandardMaterial({ color: 0x4a3525, roughness: 0.92 }));
    const crownGeo = trackGeo(new THREE.ConeGeometry(5.0, 16.5, 8));
    const crownMat = trackMat(
      new THREE.MeshStandardMaterial({
        color: circuit.environment === 'twilight' ? 0x1e3a2b : 0x24552a,
        roughness: 0.88,
      }),
    );

    const trunkInst = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    const crownInst = new THREE.InstancedMesh(crownGeo, crownMat, count);
    const c = new THREE.Color();
    let placed = 0;
    let attempts = 0;
    while (placed < count && attempts < count * 12) {
      attempts++;
      const x = (Math.random() - 0.5) * 2650;
      const z = (Math.random() - 0.5) * 2650;
      if (isNearTrack(x, z, halfW + 38)) continue;
      if (circuit.environment === 'stadium' && x < -800 && z > -520 && z < 700) continue;

      const s = 0.8 + Math.random() * 1.15;
      const proj = spline.projectPosition(x, z);
      const baseDist = Math.sqrt(proj.distanceSq);
      const rawBlend = THREE.MathUtils.clamp((baseDist - (halfW + 30)) / 92, 0, 1);
      const smooth = rawBlend * rawBlend * (3 - 2 * rawBlend);
      const waveA = Math.sin(x * 0.0048) * Math.cos(z * 0.0048);
      const waveB = Math.sin(x * 0.011 + 1.2) * Math.sin(z * 0.01 - 0.6);
      let relief = 4 + waveA * 11 + waveB * 4.5;
      if (circuit.environment === 'ardennes') {
        relief = 24 + waveA * 34 + waveB * 14 + Math.max(0, (baseDist - 140) * 0.075);
      } else if (circuit.environment === 'stadium') {
        relief = 8 + waveA * 16 + Math.min(34, Math.max(0, (baseDist - 90) * 0.055));
      } else if (circuit.environment === 'twilight') {
        relief = 14 + waveA * 24 + waveB * 11;
      }
      const groundY = THREE.MathUtils.lerp(
        proj.sample.position.y - 0.34,
        proj.sample.position.y + relief,
        smooth,
      );

      dummy.position.set(x, groundY + 2.5 * s, z);
      dummy.scale.set(s, s, s);
      dummy.rotation.set(0, Math.random() * Math.PI * 2, 0);
      dummy.updateMatrix();
      trunkInst.setMatrixAt(placed, dummy.matrix);

      dummy.position.set(x, groundY + 10.8 * s, z);
      dummy.updateMatrix();
      crownInst.setMatrixAt(placed, dummy.matrix);

      c.setHSL(0.32 + (Math.random() - 0.5) * 0.06, 0.38, 0.16 + Math.random() * 0.12);
      crownInst.setColorAt(placed, c);
      placed++;
    }
    trunkInst.count = placed;
    crownInst.count = placed;
    trunkInst.instanceMatrix.needsUpdate = true;
    crownInst.instanceMatrix.needsUpdate = true;
    if (crownInst.instanceColor) crownInst.instanceColor.needsUpdate = true;
    trunkInst.computeBoundingSphere();
    crownInst.computeBoundingSphere();
    group.add(trunkInst, crownInst);
  }

  scene.add(group);

  return {
    group,
    setCountdownLights(lightsLit: number) {
      for (let i = 0; i < lightPods.length; i++) {
        lightPods[i].emissiveIntensity = i < lightsLit ? 4.8 : 0;
      }
    },
    setFlagState(flag: FlagState) {
      let col = 0x22c55e;
      if (flag === 'YELLOW' || flag === 'VSC') col = 0xfacc15;
      else if (flag === 'BLUE') col = 0x3b82f6;
      else if (flag === 'CHEQUERED') col = 0xf8fafc;
      for (const m of marshalLedMats) {
        m.emissive.setHex(col);
      }
    },
    dispose() {
      scene.remove(group);
      for (const d of disposables) d.dispose();
    },
  };
}
