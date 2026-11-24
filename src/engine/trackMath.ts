import * as THREE from 'three';
import { DrsZone, F1Circuit } from '../types/f1';

export interface TrackSample {
  t: number;
  position: THREE.Vector3;
  tangent: THREE.Vector3;
  right: THREE.Vector3; // Horizontal perpendicular to tangent (XZ plane)
  curvature: number; // Signed curvature (+ = right/left turn)
  absCurvature: number;
  leftWallOffset: number; // Distance from centerline to left barrier (m)
  rightWallOffset: number; // Distance from centerline to right barrier (m)
}

export class TrackSpline {
  public readonly circuit: F1Circuit;
  public readonly curve: THREE.CatmullRomCurve3;
  public readonly samples: TrackSample[] = [];
  public readonly sampleCount = 2000;
  public readonly totalLength: number;

  // Bounding box for SVG minimap projection
  public readonly minX: number;
  public readonly maxX: number;
  public readonly minZ: number;
  public readonly maxZ: number;

  constructor(circuit: F1Circuit) {
    this.circuit = circuit;
    const pts = circuit.controlPoints.map((p) => new THREE.Vector3(p.x, p.y, p.z));
    this.curve = new THREE.CatmullRomCurve3(pts, true, 'centripetal', 0.5);
    this.totalLength = this.curve.getLength();

    const up = new THREE.Vector3(0, 1, 0);
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    const halfW = circuit.trackWidth * 0.5;
    const isStreet = circuit.environment === 'harbor' || circuit.environment === 'nightcity';
    const baseWallOffset =
      circuit.environment === 'harbor'
        ? halfW + 2.7
        : circuit.environment === 'nightcity'
          ? halfW + 3.8
          : halfW + 7.4;

    for (let i = 0; i < this.sampleCount; i++) {
      const t = i / this.sampleCount;
      const position = this.curve.getPointAt(t);
      const tangent = this.curve.getTangentAt(t).normalize();

      // Horizontal right vector on XZ plane
      const right = new THREE.Vector3().crossVectors(tangent, up);
      right.y = 0;
      if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
      right.normalize();

      if (position.x < minX) minX = position.x;
      if (position.x > maxX) maxX = position.x;
      if (position.z < minZ) minZ = position.z;
      if (position.z > maxZ) maxZ = position.z;

      this.samples.push({
        t,
        position,
        tangent,
        right,
        curvature: 0,
        absCurvature: 0,
        leftWallOffset: baseWallOffset,
        rightWallOffset: baseWallOffset,
      });
    }

    this.minX = minX;
    this.maxX = maxX;
    this.minZ = minZ;
    this.maxZ = maxZ;

    // Compute signed curvature over an arc-length invariant ~16m window
    const stepArc = this.totalLength / this.sampleCount;
    const w = Math.max(4, Math.round(8.5 / stepArc));
    for (let i = 0; i < this.sampleCount; i++) {
      const prev = this.samples[(i - w + this.sampleCount) % this.sampleCount];
      const next = this.samples[(i + w) % this.sampleCount];
      const dTan = new THREE.Vector3().subVectors(next.tangent, prev.tangent);
      dTan.y = 0;
      const signed = dTan.dot(this.samples[i].right) / (stepArc * w * 2);
      this.samples[i].curvature = signed;
      this.samples[i].absCurvature = Math.abs(signed);
    }

    // Compute authentic asymmetric corner runoff pockets (wide gravel traps on corner outsides)
    const rawLeft = new Float32Array(this.sampleCount);
    const rawRight = new Float32Array(this.sampleCount);
    const maxFlare = isStreet ? 2.4 : 14.5;
    const innerFlareMax = isStreet ? 0.6 : 2.8;

    for (let i = 0; i < this.sampleCount; i++) {
      // Look ahead & slightly behind so braking entry + exit zones open up before apex
      let peakRightTurn = 0;
      let peakLeftTurn = 0;
      for (let look = -14; look <= 28; look += 4) {
        const s = this.samples[(i + look + this.sampleCount) % this.sampleCount];
        const weight = look >= 0 ? 1.0 - look / 36 : 1.0 + look / 20;
        if (s.curvature > 0.0022) {
          peakRightTurn = Math.max(peakRightTurn, s.curvature * weight);
        } else if (s.curvature < -0.0022) {
          peakLeftTurn = Math.max(peakLeftTurn, -s.curvature * weight);
        }
      }

      // Curvature > 0 = turning right (left side is outside); Curvature < 0 = turning left (right side is outside)
      const leftIntensity = THREE.MathUtils.clamp((peakRightTurn - 0.0022) / 0.011, 0, 1);
      const rightIntensity = THREE.MathUtils.clamp((peakLeftTurn - 0.0022) / 0.011, 0, 1);

      let extraLeft = leftIntensity * maxFlare + rightIntensity * innerFlareMax;
      let extraRight = rightIntensity * maxFlare + leftIntensity * innerFlareMax;

      // Keep pit lane straight corridor right-side completely clear for pit entry/box/garages
      const t = i / this.sampleCount;
      const inPitZone =
        t >= circuit.pitEntryT - 0.015 || t <= circuit.pitExitT + 0.015;
      if (inPitZone) {
        extraRight = Math.max(extraRight, isStreet ? 12.2 : 8.2);
      }

      // Guard Suzuka figure-8 bridge clearance so walls stay neat along overpass/underpass
      if (circuit.id === 'suzuka' && ((t > 0.46 && t < 0.56) || (t > 0.72 && t < 0.82))) {
        extraLeft = Math.min(extraLeft, 2.2);
        extraRight = Math.min(extraRight, 2.2);
      }

      rawLeft[i] = baseWallOffset + extraLeft;
      rawRight[i] = baseWallOffset + extraRight;
    }

    // Smooth with a wide moving average so barriers curve cleanly into & out of gravel traps
    const smoothRadius = 24;
    const smoothedL = new Float32Array(this.sampleCount);
    const smoothedR = new Float32Array(this.sampleCount);
    for (let i = 0; i < this.sampleCount; i++) {
      let sumL = 0;
      let sumR = 0;
      let count = 0;
      for (let k = -smoothRadius; k <= smoothRadius; k += 2) {
        const idx = (i + k + this.sampleCount) % this.sampleCount;
        sumL += rawLeft[idx];
        sumR += rawRight[idx];
        count++;
      }
      smoothedL[i] = sumL / count;
      smoothedR[i] = sumR / count;
    }

    // Guarantee zero inside-wall self-intersection (turn radius must strictly exceed inside barrier offset)
    const clampedL = new Float32Array(this.sampleCount);
    const clampedR = new Float32Array(this.sampleCount);
    for (let i = 0; i < this.sampleCount; i++) {
      let localMaxPosCurv = 0;
      let localMaxNegCurv = 0;
      for (let k = -24; k <= 24; k += 2) {
        const ks = this.samples[(i + k + this.sampleCount) % this.sampleCount];
        if (ks.curvature > localMaxPosCurv) localMaxPosCurv = ks.curvature;
        if (ks.curvature < -localMaxNegCurv) localMaxNegCurv = -ks.curvature;
      }

      // curvature > 0 turns right (+right is inside); curvature < 0 turns left (-right is inside)
      const rightInsideLimit =
        localMaxPosCurv > 0.004 ? Math.max(halfW + 1.35, (1 / localMaxPosCurv) * 0.56) : 999;
      const leftInsideLimit =
        localMaxNegCurv > 0.004 ? Math.max(halfW + 1.35, (1 / localMaxNegCurv) * 0.56) : 999;

      clampedL[i] = Math.min(smoothedL[i], leftInsideLimit);
      clampedR[i] = Math.min(smoothedR[i], rightInsideLimit);
    }

    // Gentle transition smooth + strict anti-fold clamp so inside barrier never folds inward
    for (let i = 0; i < this.sampleCount; i++) {
      let sumL = 0;
      let sumR = 0;
      let count = 0;
      for (let k = -8; k <= 8; k++) {
        const idx = (i + k + this.sampleCount) % this.sampleCount;
        sumL += clampedL[idx];
        sumR += clampedR[idx];
        count++;
      }
      this.samples[i].leftWallOffset = Math.min(clampedL[i], sumL / count);
      this.samples[i].rightWallOffset = Math.min(clampedR[i], sumR / count);
    }

    // Final iterative monotonicity enforcement: guarantee (wall[i+1] - wall[i]) · tangent > 0 everywhere
    for (let pass = 0; pass < 4; pass++) {
      for (let i = 0; i < this.sampleCount; i++) {
        const a = this.samples[i];
        const b = this.samples[(i + 1) % this.sampleCount];
        const minDot = stepArc * 0.15;

        const lDot =
          (b.position.x - b.right.x * b.leftWallOffset - (a.position.x - a.right.x * a.leftWallOffset)) *
            a.tangent.x +
          (b.position.z - b.right.z * b.leftWallOffset - (a.position.z - a.right.z * a.leftWallOffset)) *
            a.tangent.z;
        if (lDot <= minDot) {
          const reduced = Math.max(halfW + 1.25, Math.min(a.leftWallOffset, b.leftWallOffset) * 0.9);
          a.leftWallOffset = reduced;
          b.leftWallOffset = reduced;
        }

        const rDot =
          (b.position.x + b.right.x * b.rightWallOffset - (a.position.x + a.right.x * a.rightWallOffset)) *
            a.tangent.x +
          (b.position.z + b.right.z * b.rightWallOffset - (a.position.z + a.right.z * a.rightWallOffset)) *
            a.tangent.z;
        if (rDot <= minDot) {
          const reduced = Math.max(halfW + 1.25, Math.min(a.rightWallOffset, b.rightWallOffset) * 0.9);
          a.rightWallOffset = reduced;
          b.rightWallOffset = reduced;
        }
      }
    }
  }

  public static wrapT(t: number): number {
    const r = t % 1;
    return r < 0 ? r + 1 : r;
  }

  /** Signed shortest delta from tA to tB in [-0.5, 0.5] */
  public static deltaT(tA: number, tB: number): number {
    let d = TrackSpline.wrapT(tB) - TrackSpline.wrapT(tA);
    if (d > 0.5) d -= 1;
    if (d < -0.5) d += 1;
    return d;
  }

  public getSampleAt(t: number): TrackSample {
    const wrapped = TrackSpline.wrapT(t);
    const idx = Math.floor(wrapped * this.sampleCount) % this.sampleCount;
    return this.samples[idx];
  }

  public getWallOffsetsAt(t: number): { left: number; right: number } {
    const wrapped = TrackSpline.wrapT(t);
    const fIdx = wrapped * this.sampleCount;
    const i0 = Math.floor(fIdx) % this.sampleCount;
    const i1 = (i0 + 1) % this.sampleCount;
    const alpha = fIdx - Math.floor(fIdx);
    const s0 = this.samples[i0];
    const s1 = this.samples[i1];
    return {
      left: THREE.MathUtils.lerp(s0.leftWallOffset, s1.leftWallOffset, alpha),
      right: THREE.MathUtils.lerp(s0.rightWallOffset, s1.rightWallOffset, alpha),
    };
  }

  public getInterpolatedFrame(
    t: number,
    outPos: THREE.Vector3,
    outTan: THREE.Vector3,
    outRight: THREE.Vector3,
  ): number {
    const wrapped = TrackSpline.wrapT(t);
    const fIdx = wrapped * this.sampleCount;
    const i0 = Math.floor(fIdx) % this.sampleCount;
    const i1 = (i0 + 1) % this.sampleCount;
    const alpha = fIdx - Math.floor(fIdx);

    const s0 = this.samples[i0];
    const s1 = this.samples[i1];

    outPos.lerpVectors(s0.position, s1.position, alpha);
    outTan.lerpVectors(s0.tangent, s1.tangent, alpha).normalize();
    outRight.lerpVectors(s0.right, s1.right, alpha).normalize();
    return THREE.MathUtils.lerp(s0.curvature, s1.curvature, alpha);
  }

  /**
   * Projects world position (x, z) onto the track spline.
   * When hintT is provided, searches a local window first so figure-8 overpasses (Suzuka)
   * never snap to the crossing road underneath.
   */
  public projectPosition(
    x: number,
    z: number,
    hintT?: number,
    hintY?: number,
  ): {
    t: number;
    lateralOffset: number;
    distanceSq: number;
    sample: TrackSample;
  } {
    let bestIdx = 0;
    let bestDistSq = Infinity;

    if (hintT !== undefined) {
      const centerIdx = Math.floor(TrackSpline.wrapT(hintT) * this.sampleCount);
      const windowRadius = Math.floor(this.sampleCount * 0.055);
      for (let offset = -windowRadius; offset <= windowRadius; offset++) {
        const i = (centerIdx + offset + this.sampleCount) % this.sampleCount;
        const p = this.samples[i].position;
        const dx = x - p.x;
        const dz = z - p.z;
        const dy = hintY !== undefined ? (hintY - p.y) * 1.8 : 0;
        const dSq = dx * dx + dz * dz + dy * dy;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    } else {
      for (let i = 0; i < this.sampleCount; i++) {
        const p = this.samples[i].position;
        const dx = x - p.x;
        const dz = z - p.z;
        const dSq = dx * dx + dz * dz;
        if (dSq < bestDistSq) {
          bestDistSq = dSq;
          bestIdx = i;
        }
      }
    }

    const s = this.samples[bestIdx];
    const dx = x - s.position.x;
    const dz = z - s.position.z;
    // Refine t along tangent
    const along = dx * s.tangent.x + dz * s.tangent.z;
    const refinedT = TrackSpline.wrapT(s.t + along / this.totalLength);
    const refinedSample = this.getSampleAt(refinedT);
    const rdx = x - refinedSample.position.x;
    const rdz = z - refinedSample.position.z;
    const lateralOffset = rdx * refinedSample.right.x + rdz * refinedSample.right.z;

    return {
      t: refinedT,
      lateralOffset,
      distanceSq: bestDistSq,
      sample: refinedSample,
    };
  }

  public isInInterval(t: number, startT: number, endT: number): boolean {
    const w = TrackSpline.wrapT(t);
    const s = TrackSpline.wrapT(startT);
    const e = TrackSpline.wrapT(endT);
    if (s <= e) return w >= s && w <= e;
    return w >= s || w <= e;
  }

  public getActiveDrsZone(t: number): DrsZone | null {
    for (const z of this.circuit.drsZones) {
      if (this.isInInterval(t, z.startT, z.endT)) return z;
    }
    return null;
  }

  public getUpcomingCurvature(t: number, lookaheadMeters: number): number {
    const lookT = t + lookaheadMeters / this.totalLength;
    return this.getSampleAt(lookT).absCurvature;
  }

  /** Returns normalized SVG points (0..100 viewbox) for circuit preview & minimap */
  public getSvgOutline(width = 200, height = 140, pad = 14): {
    pathD: string;
    startPoint: { x: number; y: number };
    mapPoint: (wx: number, wz: number) => { x: number; y: number };
  } {
    const spanX = Math.max(1, this.maxX - this.minX);
    const spanZ = Math.max(1, this.maxZ - this.minZ);
    const scale = Math.min((width - pad * 2) / spanX, (height - pad * 2) / spanZ);
    const offsetX = (width - spanX * scale) * 0.5;
    const offsetY = (height - spanZ * scale) * 0.5;

    const mapPoint = (wx: number, wz: number) => ({
      x: offsetX + (wx - this.minX) * scale,
      y: offsetY + (wz - this.minZ) * scale,
    });

    const step = 6;
    const cmds: string[] = [];
    for (let i = 0; i < this.sampleCount; i += step) {
      const p = mapPoint(this.samples[i].position.x, this.samples[i].position.z);
      cmds.push(`${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`);
    }
    cmds.push('Z');
    const startPoint = mapPoint(this.samples[0].position.x, this.samples[0].position.z);
    return { pathD: cmds.join(' '), startPoint, mapPoint };
  }
}
