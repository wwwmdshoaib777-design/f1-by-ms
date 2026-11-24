import * as THREE from 'three';
import { F1_DRIVERS, getTeamById } from '../data/f1Roster';
import {
  Difficulty,
  F1Driver,
  F1Team,
  FiaNotice,
  FlagState,
  RaceSettings,
  TelemetrySnapshot,
  TimingEntry,
  TyreCompound,
} from '../types/f1';
import { TrackSpline } from './trackMath';

export interface PlayerInputs {
  throttle: boolean;
  brake: boolean;
  steerLeft: boolean;
  steerRight: boolean;
  steerAnalog?: number; // -1 (right) .. +1 (left)
  reverse?: boolean;
  ers: boolean;
  drsPressed: boolean;
}

export interface CarState {
  driver: F1Driver;
  team: F1Team;
  isPlayer: boolean;
  position: THREE.Vector3;
  yaw: number;
  moveYaw: number;
  pitch: number;
  roll: number;
  speed: number; // m/s (negative when reversing)
  steerAngle: number; // -1..1
  trackT: number;
  lateralOffset: number;
  lap: number; // 1-indexed current lap
  completedLaps: number;
  totalProgress: number;
  lapStartTimeMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  compound: TyreCompound;
  nextPitCompound: TyreCompound;
  compoundsUsed: TyreCompound[];
  pitStops: number;
  plannedPitLap: number | null;
  tyreWear: number; // 100 -> 0
  tyreTempC: number;
  ers: number; // 0..100
  ersDeploying: boolean;
  drsAllowed: boolean;
  drsActive: boolean;
  drsDetectionGapOk: boolean;
  pitRequested: boolean;
  inPitLane: boolean;
  pitPhase: 'none' | 'entering' | 'servicing' | 'exiting';
  pitTimer: number;
  penaltySeconds: number;
  finished: boolean;
  finishTimeMs: number;
  offTrack: boolean;
  onKerb: boolean;
  braking: boolean;
  lockingUp: boolean;
  bottoming: boolean;
  slipstream: boolean;
  aiTargetLat: number;
  aiPaceFactor: number;
  lastProgressBucket: number;
}

const COMPOUND_SPEC: Record<
  TyreCompound,
  { gripMult: number; wearPerSec: number; optimalTemp: number }
> = {
  SOFT: { gripMult: 1.09, wearPerSec: 0.48, optimalTemp: 102 },
  MEDIUM: { gripMult: 1.02, wearPerSec: 0.3, optimalTemp: 96 },
  HARD: { gripMult: 0.96, wearPerSec: 0.18, optimalTemp: 90 },
};

const DIFFICULTY_SPEED: Record<Difficulty, number> = {
  rookie: 0.86,
  pro: 0.96,
  legend: 1.03,
};

const _pos = new THREE.Vector3();
const _tan = new THREE.Vector3();
const _right = new THREE.Vector3();

export class RaceSimulation {
  public readonly spline: TrackSpline;
  public settings: RaceSettings;
  public readonly cars: CarState[] = [];
  public readonly playerCar: CarState;
  public readonly mandatoryPitRequired: boolean;

  public phase: 'countdown' | 'racing' | 'paused' | 'finished' = 'countdown';
  public countdownTimer = 0;
  public countdownLights = 0; // 0..5, -1 = lights out
  public raceElapsedMs = 0;
  public fastestLapMs: number | null = null;
  public fastestLapDriverCode: string | null = null;

  public flagState: FlagState = 'GREEN';
  public vscActive = false;
  public vscTimer = 0;
  public vscDeltaKmh = 148;
  private vscTriggered = false;
  private vscOverspeedTimer = 0;

  public trackLimitStrikes = 0;
  private wallHitCooldown = 0;

  public reactionTimeMs: number | null = null;
  private lightsOutTimestampMs: number | null = null;
  private drsAnnounced = false;
  private stopHoldTimer = 0;
  private lastBrakeInput = false;
  private lastThrottleInput = false;
  private throttlePos = 0;
  private brakePos = 0;

  private noticeSeq = 1;
  private notices: Array<FiaNotice & { expiresAtMs: number }> = [];

  private prevDrsZoneActive = false;
  private drsJustTriggered = false;

  constructor(spline: TrackSpline, settings: RaceSettings, playerGridSlot?: number) {
    this.spline = spline;
    this.settings = { ...settings };
    this.mandatoryPitRequired =
      settings.mode === 'grand_prix' && settings.totalLaps >= 5;

    const isPractice = settings.mode === 'practice';
    const isQualifying = settings.mode === 'qualifying';
    const playerDriver =
      F1_DRIVERS.find((d) => d.id === settings.driverId) ?? F1_DRIVERS[0];

    let gridDrivers: F1Driver[];
    const othersRanked = F1_DRIVERS.filter((d) => d.id !== playerDriver.id).sort((a, b) => {
      const scoreA = a.skillRating * getTeamById(a.teamId).carPerformance;
      const scoreB = b.skillRating * getTeamById(b.teamId).carPerformance;
      return scoreB - scoreA;
    });

    if (isQualifying || isPractice) {
      gridDrivers = [playerDriver, ...othersRanked];
    } else {
      const slot = Math.max(0, Math.min(othersRanked.length, (playerGridSlot ?? 8) - 1));
      gridDrivers = [...othersRanked.slice(0, slot), playerDriver, ...othersRanked.slice(slot)];
    }

    const halfW = spline.circuit.trackWidth * 0.5;
    const gridSpacingM = 11.5;

    gridDrivers.forEach((driver, idx) => {
      const team = getTeamById(driver.teamId);
      const isPlayer = driver.id === playerDriver.id;

      let startT: number;
      let lat: number;
      let initSpeed = 0;

      if (isQualifying) {
        if (isPlayer) {
          startT = 0.88;
          lat = 0;
          initSpeed = 70;
        } else {
          // Distribute all 19 real rival F1 cars cleanly ahead on track outside [0.80..0.95]
          startT = TrackSpline.wrapT(0.03 + ((idx - 1) / Math.max(1, gridDrivers.length - 1)) * 0.74);
          lat = (idx % 2 === 0 ? -1 : 1) * halfW * 0.25;
          initSpeed = 72;
        }
      } else if (isPractice) {
        if (isPlayer) {
          startT = 0.89;
          lat = 0;
          initSpeed = 62;
        } else {
          startT = TrackSpline.wrapT(0.03 + ((idx - 1) / Math.max(1, gridDrivers.length - 1)) * 0.76);
          lat = (idx % 2 === 0 ? -1 : 1) * halfW * 0.28;
          initSpeed = 68;
        }
      } else {
        startT = TrackSpline.wrapT(1 - (16 + idx * gridSpacingM) / spline.totalLength);
        lat = idx % 2 === 0 ? -halfW * 0.36 : halfW * 0.36;
      }

      const s = spline.getSampleAt(startT);
      const wx = s.position.x + s.right.x * lat;
      const wy = s.position.y;
      const wz = s.position.z + s.right.z * lat;
      const yaw = Math.atan2(s.tangent.x, s.tangent.z);

      const diffMult = DIFFICULTY_SPEED[settings.difficulty];
      const aiPace =
        diffMult *
        (0.93 + (team.carPerformance - 0.93) * 0.8 + (driver.skillRating - 0.93) * 0.7);

      const aiCompounds: TyreCompound[] = ['SOFT', 'MEDIUM', 'HARD'];
      const compound: TyreCompound = isPlayer
        ? settings.startingTyre
        : aiCompounds[idx % 3 === 0 ? 0 : idx % 2 === 0 ? 1 : 2];

      const nextCompound: TyreCompound = compound === 'SOFT' ? 'MEDIUM' : 'HARD';
      const plannedPitLap =
        !isPlayer && this.mandatoryPitRequired
          ? Math.max(2, Math.floor(settings.totalLaps * 0.45) + (idx % 2))
          : null;

      const car: CarState = {
        driver,
        team,
        isPlayer,
        position: new THREE.Vector3(wx, wy, wz),
        yaw,
        moveYaw: yaw,
        pitch: 0,
        roll: 0,
        speed: initSpeed,
        steerAngle: 0,
        trackT: startT,
        lateralOffset: lat,
        lap: 0,
        completedLaps: 0,
        totalProgress: startT - 1,
        lapStartTimeMs: 0,
        lastLapMs: null,
        bestLapMs: null,
        compound,
        nextPitCompound: nextCompound,
        compoundsUsed: [compound],
        pitStops: 0,
        plannedPitLap,
        tyreWear: 100,
        tyreTempC: 88,
        ers: 100,
        ersDeploying: false,
        drsAllowed: false,
        drsActive: false,
        drsDetectionGapOk: isPractice || isQualifying,
        pitRequested: false,
        inPitLane: false,
        pitPhase: 'none',
        pitTimer: 0,
        penaltySeconds: 0,
        finished: false,
        finishTimeMs: 0,
        offTrack: false,
        onKerb: false,
        braking: false,
        lockingUp: false,
        bottoming: false,
        slipstream: false,
        aiTargetLat: lat * 0.65,
        aiPaceFactor: aiPace,
        lastProgressBucket: Math.floor(startT * 10),
      };

      this.cars.push(car);
    });

    this.playerCar = this.cars.find((c) => c.isPlayer) ?? this.cars[0];

    if (isQualifying) {
      this.phase = 'racing';
      this.countdownLights = 0;
      this.pushNotice('QUALIFYING FLYING LAP', 'Set a clean lap time to earn your grid slot', 'info');
    } else if (isPractice) {
      this.phase = 'racing';
      this.countdownLights = 0;
      this.pushNotice(
        'FREE PRACTICE · GREEN TRACK',
        'Test tyres, braking points & racing lines · End session anytime',
        'info',
      );
    }
  }

  public updateControlSettings(patch: Partial<RaceSettings>) {
    this.settings = { ...this.settings, ...patch };
  }

  public swapPracticeCompound(compound: TyreCompound) {
    if (this.settings.mode !== 'practice') {
      this.setNextPitCompound(compound);
      return;
    }
    this.playerCar.compound = compound;
    this.playerCar.nextPitCompound = compound;
    this.playerCar.tyreWear = 100;
    this.playerCar.tyreTempC = COMPOUND_SPEC[compound].optimalTemp - 6;
    if (!this.playerCar.compoundsUsed.includes(compound)) {
      this.playerCar.compoundsUsed.push(compound);
    }
    this.pushNotice(`FITTED ${compound} TYRES`, 'Fresh telemetry set ready for flying laps', 'success', 2600);
  }

  public resetPlayerToTrack() {
    const car = this.playerCar;
    const s = this.spline.getSampleAt(car.trackT);
    car.lateralOffset = 0;
    car.position.set(s.position.x, s.position.y, s.position.z);
    car.yaw = Math.atan2(s.tangent.x, s.tangent.z);
    car.moveYaw = car.yaw;
    car.pitch = 0;
    car.roll = 0;
    car.steerAngle = 0;
    car.speed = this.phase === 'racing' ? 22 : 0;
    car.pitPhase = 'none';
    car.inPitLane = false;
    car.pitRequested = false;
    this.pushNotice('CAR RECOVERED TO TRACK', 'Aligned to racing centerline', 'info', 2200);
  }

  public finishPracticeSession() {
    if (this.settings.mode !== 'practice') return;
    this.flagState = 'CHEQUERED';
    this.phase = 'finished';
    this.playerCar.finished = true;
    this.playerCar.finishTimeMs = this.raceElapsedMs;
  }

  private pushNotice(
    title: string,
    detail: string,
    tone: FiaNotice['tone'] = 'info',
    durationMs = 4200,
  ) {
    this.notices.push({
      id: this.noticeSeq++,
      title,
      detail,
      tone,
      expiresAtMs: this.raceElapsedMs + durationMs,
    });
    if (this.notices.length > 4) this.notices.shift();
  }

  public consumeDrsChimeFlag(): boolean {
    const v = this.drsJustTriggered;
    this.drsJustTriggered = false;
    return v;
  }

  public togglePause() {
    if (this.phase === 'racing') this.phase = 'paused';
    else if (this.phase === 'paused') this.phase = 'racing';
  }

  public requestPitStop(compound?: TyreCompound) {
    if (compound) {
      this.playerCar.nextPitCompound = compound;
      return;
    }
    this.playerCar.pitRequested = !this.playerCar.pitRequested;
    this.pushNotice(
      this.playerCar.pitRequested ? 'BOX THIS LAP' : 'STAY OUT',
      this.playerCar.pitRequested
        ? `Pit crew ready with ${this.playerCar.nextPitCompound} tyres`
        : 'Pit stop cancelled',
      'info',
      2600,
    );
  }

  public setNextPitCompound(compound: TyreCompound) {
    this.playerCar.nextPitCompound = compound;
  }

  public step(dtRaw: number, inputs: PlayerInputs) {
    if (this.phase === 'paused') return;
    const dt = Math.min(0.05, Math.max(0.001, dtRaw));

    if (this.notices.length > 0) {
      this.notices = this.notices.filter((n) => n.expiresAtMs > this.raceElapsedMs);
    }

    // FIA 5-Lights Countdown sequence
    if (this.phase === 'countdown') {
      this.countdownTimer += dt;
      if (this.countdownTimer < 0.7) this.countdownLights = 1;
      else if (this.countdownTimer < 1.4) this.countdownLights = 2;
      else if (this.countdownTimer < 2.1) this.countdownLights = 3;
      else if (this.countdownTimer < 2.8) this.countdownLights = 4;
      else if (this.countdownTimer < 3.5) this.countdownLights = 5;
      else if (this.countdownTimer < 4.25) {
        this.countdownLights = 5;
      } else {
        this.countdownLights = -1;
        this.phase = 'racing';
        this.lightsOutTimestampMs = performance.now();
        for (const c of this.cars) {
          c.lap = 1;
          c.lapStartTimeMs = 0;
        }
      }
      return;
    }

    if (this.phase === 'racing') {
      this.raceElapsedMs += dt * 1000;
      if (this.countdownTimer > 6.5 && this.countdownLights === -1) {
        this.countdownLights = 0;
      } else {
        this.countdownTimer += dt;
      }

      if (
        this.reactionTimeMs === null &&
        this.lightsOutTimestampMs !== null &&
        (inputs.throttle || this.settings.autoThrottle)
      ) {
        this.reactionTimeMs = Math.round(performance.now() - this.lightsOutTimestampMs);
        const sec = (this.reactionTimeMs / 1000).toFixed(2);
        this.pushNotice(
          `START REACTION · ${sec}s`,
          this.reactionTimeMs < 320 ? 'Lightning F1 launch off the line!' : 'Clean getaway',
          this.reactionTimeMs < 320 ? 'success' : 'info',
          3000,
        );
      }

      // Dynamic Virtual Safety Car (VSC) around mid-race in 5L/10L Grand Prix
      if (
        this.settings.mode === 'grand_prix' &&
        this.settings.totalLaps >= 5 &&
        !this.vscTriggered &&
        this.playerCar.lap === Math.ceil(this.settings.totalLaps * 0.55) &&
        this.playerCar.trackT > 0.28
      ) {
        this.vscTriggered = true;
        this.vscActive = true;
        this.vscTimer = 8.5;
        this.flagState = 'VSC';
        this.pushNotice(
          'VIRTUAL SAFETY CAR DEPLOYED',
          `Respect speed delta <= ${this.vscDeltaKmh} km/h · Overtaking suspended`,
          'warning',
          6000,
        );
      }

      if (this.vscActive) {
        this.vscTimer -= dt;
        const speedKmh = Math.abs(this.playerCar.speed) * 3.6;
        if (speedKmh > this.vscDeltaKmh + 14 && !this.playerCar.inPitLane) {
          this.vscOverspeedTimer += dt;
          if (this.vscOverspeedTimer > 1.8) {
            this.vscOverspeedTimer = 0;
            this.playerCar.penaltySeconds += 5;
            this.pushNotice(
              '+5s TIME PENALTY',
              'FIA Race Control: VSC speed delta infringement',
              'penalty',
              4500,
            );
          }
        } else {
          this.vscOverspeedTimer = Math.max(0, this.vscOverspeedTimer - dt);
        }

        if (this.vscTimer <= 0) {
          this.vscActive = false;
          this.flagState = 'GREEN';
          this.pushNotice('VSC ENDING · GREEN FLAG', 'Full racing speed resumed', 'success', 3200);
        }
      }
    }

    for (const car of this.cars) {
      if (car.isPlayer && this.phase === 'racing' && !car.finished) {
        this.stepPlayerCar(car, dt, inputs);
      } else {
        this.stepAiCar(car, dt);
      }
      this.updateLapTracking(car);
    }

    this.resolveCollisionsAndSlipstream(dt);

    if (this.playerCar.finished && this.phase === 'racing') {
      this.flagState = 'CHEQUERED';
      if (this.mandatoryPitRequired && this.playerCar.compoundsUsed.length < 2) {
        this.playerCar.penaltySeconds += 20;
        this.pushNotice(
          '+20s PENALTY · TYRE RULE',
          'Did not use 2 dry tyre compounds during Grand Prix',
          'penalty',
          6000,
        );
      }
      this.phase = 'finished';
    }
  }

  private stepPlayerCar(car: CarState, dt: number, inputs: PlayerInputs) {
    const circuit = this.spline.circuit;
    const halfW = circuit.trackWidth * 0.5;
    const isPractice = this.settings.mode === 'practice';

    if (car.pitPhase !== 'none' || (car.pitRequested && this.isNearPitEntry(car.trackT))) {
      this.stepPitStopFlow(car, dt);
      return;
    }

    const upcomingCurv = Math.max(
      this.spline.getUpcomingCurvature(car.trackT, 44),
      this.spline.getUpcomingCurvature(car.trackT, 94),
    );
    const isStreet = circuit.environment === 'harbor' || circuit.environment === 'nightcity';
    const absLat = Math.abs(car.lateralOffset);
    car.onKerb = absLat > halfW - 0.15 && absLat <= halfW + 1.95;
    // Touching or crossing white border lines never incurs track-limit time penalties;
    // offTrack strictly models realistic grass/gravel runoff grip outside the circuit kerb.
    car.offTrack = !isStreet && absLat > halfW + 2.15;

    if (this.wallHitCooldown > 0) this.wallHitCooldown -= dt;

    // Tyre grip & aerodynamic downforce physics
    const inGravelTrap = !isStreet && absLat > halfW + 2.7;
    const comp = COMPOUND_SPEC[car.compound];
    const wearFactor = 0.8 + 0.2 * (car.tyreWear / 100);
    const surfaceGrip = inGravelTrap ? 0.62 : car.offTrack ? 0.82 : car.onKerb ? 0.98 : 1.0;
    const aeroDownforce = 1.0 + Math.min(0.32, (Math.max(0, car.speed) / 92) * 0.32);
    const totalGrip = comp.gripMult * wearFactor * surfaceGrip * aeroDownforce;

    // DRS Rule: Active from Lap 2 in Grands Prix (always enabled in Practice & Qualifying)
    const drsRaceEnabled =
      this.settings.mode !== 'grand_prix' ||
      this.settings.totalLaps === 1 ||
      car.lap >= 2;

    if (
      drsRaceEnabled &&
      !this.drsAnnounced &&
      this.settings.mode === 'grand_prix' &&
      this.settings.totalLaps > 1
    ) {
      this.drsAnnounced = true;
      this.pushNotice(
        'DRS ENABLED',
        'Drag Reduction System now available within 1.0s',
        'success',
        3500,
      );
    }

    const activeZone = this.spline.getActiveDrsZone(car.trackT);
    const inDrsZone = activeZone !== null;
    if (inDrsZone && !this.prevDrsZoneActive) {
      car.drsDetectionGapOk =
        this.settings.mode !== 'grand_prix' || this.isWithinOneSecondAhead(car);
    }
    this.prevDrsZoneActive = inDrsZone;
    car.drsAllowed = !this.vscActive && drsRaceEnabled && inDrsZone && car.drsDetectionGapOk;

    if (inputs.drsPressed && car.drsAllowed && !car.drsActive) {
      car.drsActive = true;
      this.drsJustTriggered = true;
    }
    if (!inDrsZone || inputs.brake || this.vscActive) {
      car.drsActive = false;
    }

    const wantBrake = inputs.brake;
    const wantThrottle =
      inputs.throttle || (this.settings.autoThrottle && !wantBrake && !inputs.reverse);

    // ERS Deployment & MGU-K Braking Harvest
    if (inputs.ers && car.ers > 2 && wantThrottle && !wantBrake && !this.vscActive) {
      car.ersDeploying = true;
      car.ers = Math.max(0, car.ers - 14.5 * dt);
    } else {
      car.ersDeploying = false;
      if (wantBrake && car.speed > 15) {
        car.ers = Math.min(100, car.ers + 14.0 * dt);
      } else {
        car.ers = Math.min(100, car.ers + 2.2 * dt);
      }
    }

    const teamPerf = car.team.carPerformance;
    let maxSpeed = 94.0 * (0.96 + (teamPerf - 0.92) * 0.5);
    if (car.drsActive) maxSpeed += 5.8;
    if (car.ersDeploying) maxSpeed += 4.4;
    if (car.slipstream) maxSpeed += 3.2;
    if (inGravelTrap) maxSpeed *= 0.58;
    else if (car.offTrack) maxSpeed *= 0.82;

    let throttleAmt = wantThrottle ? 1 : 0;
    let brakeAmt = wantBrake ? 1 : 0;

    // Optional Corner Braking Assist (smooth deceleration into heavy braking zones)
    if (this.settings.brakingAssist && upcomingCurv > 0.006 && car.speed > 0) {
      const safeCornerSpeed = Math.max(22, Math.sqrt(20.5 / (upcomingCurv + 0.0002)));
      if (car.speed > safeCornerSpeed * 1.1) {
        throttleAmt = 0;
        brakeAmt = Math.max(brakeAmt, 0.72);
      }
    }

    this.lastThrottleInput = throttleAmt > 0;
    this.lastBrakeInput = brakeAmt > 0;

    // Pedal actuation with user-tunable smoothness (0 = instant, 1 = progressive modulation)
    const pedalSmooth = THREE.MathUtils.clamp(this.settings.pedalSmoothness ?? 0.2, 0, 1);
    const pedalRate = THREE.MathUtils.lerp(44.0, 7.5, pedalSmooth);
    this.throttlePos = THREE.MathUtils.damp(this.throttlePos, throttleAmt, pedalRate, dt);
    this.brakePos = THREE.MathUtils.damp(this.brakePos, brakeAmt, pedalRate * 1.15, dt);
    car.braking = this.brakePos > 0.15 && car.speed > 4;

    // Reverse logic: explicit Reverse OR holding Brake at standstill
    if (car.speed <= 1.2 && (inputs.reverse || wantBrake)) {
      this.stopHoldTimer += dt;
    } else {
      this.stopHoldTimer = 0;
    }
    const reversing =
      (Boolean(inputs.reverse) && car.speed <= 2.5) ||
      (wantBrake && car.speed <= 0.6 && this.stopHoldTimer > 0.25);

    car.lockingUp =
      !this.settings.absAssist &&
      this.brakePos > 0.72 &&
      car.speed > 36 &&
      Math.abs(car.steerAngle) > 0.52;
    car.bottoming = (car.speed > 76 && car.onKerb) || (car.speed > 86 && Math.random() < 0.2);

    const speedSq = car.speed * car.speed;
    const dragCoeff = car.drsActive ? 0.00118 : 0.00145;
    const slipstreamDragMult = car.slipstream ? 0.86 : 1.0;
    const aeroDrag = dragCoeff * slipstreamDragMult * speedSq;

    if (reversing) {
      car.speed = Math.max(-16.0, car.speed - 19.0 * dt);
    } else if (this.throttlePos > 0.02 && this.brakePos < 0.15) {
      if (car.speed < 0) {
        car.speed = Math.min(0, car.speed + 46.0 * dt);
      } else {
        // Traction-limited low-speed launch -> peak mid-range hybrid torque -> aero drag taper
        const speedFrac = THREE.MathUtils.clamp(car.speed / Math.max(70, maxSpeed), 0, 1);
        const tractionCap =
          (11.4 + 6.4 * Math.min(1, car.speed / 30)) * comp.gripMult * wearFactor * surfaceGrip;
        const driveForce =
          (29.2 * (1 - 0.44 * speedFrac) + (car.ersDeploying ? 4.8 : 0)) *
          (0.94 + (teamPerf - 0.92) * 0.75);
        const netAccel =
          Math.min(tractionCap + (car.ersDeploying ? 2.2 : 0), driveForce) * this.throttlePos -
          aeroDrag -
          (inGravelTrap ? 12.0 : car.offTrack ? 2.4 : 0);
        car.speed = THREE.MathUtils.clamp(car.speed + netAccel * dt, 0, maxSpeed);
      }
    } else if (this.brakePos > 0.02) {
      // Real F1 aero-downforce braking: ~4.6G at 300 km/h tapering to ~2.1G at low speed (~96m 300->80)
      const aeroBrakeBoost = Math.pow(THREE.MathUtils.clamp(car.speed / 86, 0, 1), 1.45);
      const absMult = this.settings.absAssist ? 1.04 : car.lockingUp ? 0.82 : 1.0;
      const tyreBrakeMult = (0.94 + 0.06 * comp.gripMult) * (0.88 + 0.12 * (car.tyreWear / 100));
      const decel =
        (18.5 + 16.8 * aeroBrakeBoost) * surfaceGrip * tyreBrakeMult * absMult + aeroDrag;
      car.speed = Math.max(0, car.speed - decel * this.brakePos * dt);
    } else {
      const coastDrag = (inGravelTrap ? 15.5 : 2.8) + aeroDrag;
      if (car.speed >= 0) {
        car.speed = Math.max(0, car.speed - coastDrag * dt);
      } else {
        car.speed = Math.min(0, car.speed + 12.0 * dt);
      }
    }

    // Wheelbase-true F1 steering with user-tunable Sensitivity, Smoothness & High-Speed Stability
    const digitalSteer = (inputs.steerLeft ? 1 : 0) - (inputs.steerRight ? 1 : 0);
    const rawTargetSteer = THREE.MathUtils.clamp(
      (inputs.steerAnalog ?? 0) + digitalSteer,
      -1,
      1,
    );
    const sensitivity = THREE.MathUtils.clamp(this.settings.steeringSensitivity || 1.0, 0.55, 1.55);
    const steerSmooth = THREE.MathUtils.clamp(this.settings.steeringSmoothness ?? 0.25, 0, 1);
    const steerStability = THREE.MathUtils.clamp(this.settings.highSpeedStability ?? 0.65, 0, 1);

    const baseSteerRate = THREE.MathUtils.lerp(44.0, 8.2, steerSmooth);
    const steerApplySpeed =
      baseSteerRate * (rawTargetSteer === 0 ? 1.2 : 1.0) * Math.sqrt(sensitivity);
    car.steerAngle = THREE.MathUtils.damp(car.steerAngle, rawTargetSteer, steerApplySpeed, dt);

    const absSpeed = Math.abs(car.speed);
    // Zero turntable spinning at 0 km/h; rises cleanly from standstill up to full turn-in authority
    const wheelTurn = absSpeed < 0.7 ? 0 : Math.min(1, absSpeed / 12.2);
    const highSpeedCurve =
      1.0 / (1.0 + steerStability * Math.pow(absSpeed / 82, 1.7) * 0.56);
    const trailBrakeBite =
      this.brakePos > 0.12 && absSpeed > 14 && Math.abs(car.steerAngle) > 0.15 ? 1.16 : 1.0;
    const reverseSign = car.speed < -0.2 ? -1 : 1;

    const yawRate =
      car.steerAngle *
      reverseSign *
      2.48 *
      sensitivity *
      wheelTurn *
      highSpeedCurve *
      trailBrakeBite *
      Math.min(1.16, totalGrip * 0.96);

    car.yaw += yawRate * dt;
    const targetRoll = THREE.MathUtils.clamp(-yawRate * absSpeed * 0.00055, -0.045, 0.045);
    car.roll = THREE.MathUtils.damp(car.roll, targetRoll, 16, dt);

    // Velocity heading (moveYaw) follows car nose (yaw) limited by tire lateral grip + cornering scrub drag
    if (car.speed <= 0.6) {
      car.moveYaw = car.yaw;
    } else {
      const slipErr = Math.atan2(Math.sin(car.yaw - car.moveYaw), Math.cos(car.yaw - car.moveYaw));
      const absSlip = Math.abs(slipErr);
      if (absSlip > 0.045 && car.speed > 8) {
        car.speed = Math.max(0, car.speed - Math.min(18.0, absSlip * absSpeed * 0.52) * dt);
      }
      const lateralGripRate =
        (inGravelTrap ? 4.8 : car.offTrack ? 7.4 : 13.2) *
        totalGrip *
        (car.lockingUp ? 0.62 : 1.0);
      const maxSlipAlpha = 1 - Math.exp(-lateralGripRate * dt);
      car.moveYaw += slipErr * maxSlipAlpha;
    }

    car.position.x += Math.sin(car.moveYaw) * car.speed * dt;
    car.position.z += Math.cos(car.moveYaw) * car.speed * dt;

    const proj = this.spline.projectPosition(
      car.position.x,
      car.position.z,
      car.trackT,
      car.position.y,
    );
    car.trackT = proj.t;
    car.lateralOffset = proj.lateralOffset;

    // Spin-Guard Assist (only engages during extreme >40 deg slides; zero continuous track pull)
    if (this.settings.steeringAssist && car.speed > 18) {
      const trackYaw = Math.atan2(proj.sample.tangent.x, proj.sample.tangent.z);
      const angleDiff = Math.atan2(Math.sin(trackYaw - car.yaw), Math.cos(trackYaw - car.yaw));
      if (Math.abs(angleDiff) > 0.72) {
        const correctionSign = Math.sign(angleDiff);
        const excess = Math.abs(angleDiff) - 0.72;
        car.yaw += correctionSign * excess * 1.45 * dt;
      }
    }

    car.position.y = THREE.MathUtils.damp(car.position.y, proj.sample.position.y, 24, dt);
    const brakeDive =
      this.brakePos * (car.speed > 8 ? 0.038 : 0.01) - this.throttlePos * 0.015;
    car.pitch = THREE.MathUtils.damp(car.pitch, -proj.sample.tangent.y * 0.65 + brakeDive, 16, dt);

    // Physical Barrier Glance-Off + Wall-Hit-Only Penalty System
    const walls = this.spline.getWallOffsetsAt(car.trackT);
    const wallLimit = (car.lateralOffset >= 0 ? walls.right : walls.left) - 1.15;
    if (Math.abs(car.lateralOffset) > wallLimit) {
      const sign = Math.sign(car.lateralOffset);
      car.lateralOffset = sign * (wallLimit - 0.18);
      car.position.x = proj.sample.position.x + proj.sample.right.x * car.lateralOffset;
      car.position.z = proj.sample.position.z + proj.sample.right.z * car.lateralOffset;

      const trackYaw = Math.atan2(proj.sample.tangent.x, proj.sample.tangent.z);
      const angleDiff = Math.atan2(Math.sin(trackYaw - car.yaw), Math.cos(trackYaw - car.yaw));
      const impactNormalSpeed = Math.abs(Math.sin(angleDiff)) * Math.abs(car.speed);

      if (
        !isPractice &&
        this.wallHitCooldown <= 0 &&
        (impactNormalSpeed > 3.2 || Math.abs(car.speed) > 18)
      ) {
        this.wallHitCooldown = 2.6;
        this.trackLimitStrikes += 1;
        if (impactNormalSpeed > 18) {
          car.penaltySeconds += 5;
          this.pushNotice(
            '+5s PENALTY · BARRIER IMPACT',
            'Heavy wall collision detected by FIA telemetry',
            'penalty',
            4500,
          );
        } else if (this.trackLimitStrikes < 3) {
          this.pushNotice(
            `BARRIER CONTACT (${this.trackLimitStrikes}/3)`,
            'Avoid hitting track walls · 3rd hit incurs +5s penalty',
            'warning',
            3200,
          );
        } else {
          car.penaltySeconds += 5;
          this.pushNotice(
            '+5s TIME PENALTY · WALL HIT',
            `Repeated barrier collisions (${this.trackLimitStrikes})`,
            'penalty',
            4500,
          );
        }
      }

      car.yaw += angleDiff * 0.65;
      car.moveYaw = car.yaw;
      car.speed = Math.max(wantThrottle ? 14 : 0, car.speed * 0.84);
    }

    const cornerLoad = Math.abs(car.steerAngle) * (absSpeed / 50);
    const wearMult = isPractice ? 0.45 : 1.0;
    const wearDelta =
      comp.wearPerSec * wearMult * (0.52 + cornerLoad * 0.85 + (car.offTrack ? 0.6 : 0)) * dt;
    car.tyreWear = Math.max(8, car.tyreWear - wearDelta);
    const targetTemp = comp.optimalTemp + cornerLoad * 13 - (1 - this.throttlePos) * 5;
    car.tyreTempC = THREE.MathUtils.damp(car.tyreTempC, targetTemp, 1.5, dt);
  }

  private stepAiCar(car: CarState, dt: number) {
    const halfW = this.spline.circuit.trackWidth * 0.5;

    if (
      car.pitPhase !== 'none' ||
      (car.plannedPitLap !== null &&
        car.lap >= car.plannedPitLap &&
        car.pitStops === 0 &&
        this.isNearPitEntry(car.trackT))
    ) {
      this.stepPitStopFlow(car, dt);
      return;
    }

    const basePace = car.finished ? 0.55 : car.aiPaceFactor;
    const curvNear = this.spline.getUpcomingCurvature(car.trackT, 34);
    const curvMid = this.spline.getUpcomingCurvature(car.trackT, 78);
    const curvFar = this.spline.getUpcomingCurvature(car.trackT, 135);
    const maxCurv = Math.max(curvNear, curvMid * 0.92, curvFar * 0.74);

    const compGrip = COMPOUND_SPEC[car.compound].gripMult * (0.85 + 0.15 * (car.tyreWear / 100));
    let targetSpeed = 93.0 * basePace;

    if (this.vscActive) {
      targetSpeed = Math.min(targetSpeed, this.vscDeltaKmh / 3.6);
    } else if (maxCurv > 0.0028) {
      const cornerLimit = Math.sqrt(18.5 / (maxCurv + 0.0002)) * basePace * compGrip;
      targetSpeed = Math.min(targetSpeed, Math.max(24, cornerLimit));
    }

    const activeZone = this.spline.getActiveDrsZone(car.trackT);
    car.drsActive =
      !this.vscActive &&
      !car.finished &&
      (this.settings.mode !== 'grand_prix' || car.lap >= 2) &&
      activeZone !== null &&
      this.isWithinOneSecondAhead(car) &&
      maxCurv < 0.0046;
    if (car.drsActive) targetSpeed += 4.6;
    if (car.slipstream) targetSpeed += 2.6;

    let desiredLat = Math.sin(car.trackT * Math.PI * 6) * 0.85;
    for (const other of this.cars) {
      if (other === car) continue;
      const dT = TrackSpline.deltaT(car.trackT, other.trackT);
      if (dT > 0 && dT < 0.025) {
        const latDiff = Math.abs(car.lateralOffset - other.lateralOffset);
        if (latDiff < 3.4) {
          desiredLat = other.lateralOffset > 0 ? -halfW * 0.52 : halfW * 0.52;
          if (car.speed > other.speed && dT < 0.009 && latDiff < 2.1) {
            targetSpeed = Math.min(targetSpeed, other.speed * 0.96);
          }
        }
      }
      if (other.lap > car.lap && dT < 0 && dT > -0.028) {
        desiredLat = other.lateralOffset >= 0 ? -halfW * 0.65 : halfW * 0.65;
      }
    }

    const prevLat = car.lateralOffset;
    car.aiTargetLat = THREE.MathUtils.damp(car.aiTargetLat, desiredLat, 3.6, dt);

    if (car.speed < targetSpeed) {
      const aiAccel = 26 * basePace * (1 - 0.35 * THREE.MathUtils.clamp(car.speed / 95, 0, 1));
      car.speed = Math.min(targetSpeed, car.speed + aiAccel * dt);
      car.ersDeploying = car.drsActive;
      car.braking = false;
    } else {
      const aiAeroBrake = 24 + 26 * Math.pow(THREE.MathUtils.clamp(car.speed / 86, 0, 1), 1.4);
      const prevSpeed = car.speed;
      car.speed = Math.max(targetSpeed, car.speed - aiAeroBrake * dt);
      car.ersDeploying = false;
      car.braking = prevSpeed - targetSpeed > 4.5 && car.speed > 18;
    }

    const dProgress = (car.speed * dt) / this.spline.totalLength;
    car.trackT = TrackSpline.wrapT(car.trackT + dProgress);
    car.lateralOffset = THREE.MathUtils.damp(
      car.lateralOffset,
      THREE.MathUtils.clamp(car.aiTargetLat, -halfW * 0.74, halfW * 0.74),
      4.5,
      dt,
    );

    const curv = this.spline.getInterpolatedFrame(car.trackT, _pos, _tan, _right);
    car.position.set(
      _pos.x + _right.x * car.lateralOffset,
      _pos.y,
      _pos.z + _right.z * car.lateralOffset,
    );
    const latVel = (car.lateralOffset - prevLat) / Math.max(0.001, dt);
    car.yaw = Math.atan2(_tan.x, _tan.z) + THREE.MathUtils.clamp(latVel * 0.012, -0.14, 0.14);
    car.moveYaw = car.yaw;
    car.steerAngle = THREE.MathUtils.clamp(-curv * 35 + latVel * 0.04, -0.8, 0.8);
    car.roll = THREE.MathUtils.damp(car.roll, -car.steerAngle * 0.036, 8, dt);
    car.pitch = THREE.MathUtils.damp(
      car.pitch,
      -_tan.y * 0.6 + (car.braking ? 0.025 : car.ersDeploying ? -0.012 : 0),
      10,
      dt,
    );
    car.onKerb = Math.abs(car.lateralOffset) > halfW - 0.15;
    car.bottoming = car.speed > 83 && (car.onKerb || Math.random() < 0.08);
    car.lockingUp = car.braking && car.speed > 45 && Math.abs(curv) > 0.011;

    car.tyreWear = Math.max(22, car.tyreWear - COMPOUND_SPEC[car.compound].wearPerSec * 0.65 * dt);
  }

  private isNearPitEntry(t: number): boolean {
    const d = Math.abs(TrackSpline.deltaT(t, this.spline.circuit.pitEntryT));
    return d < 0.022;
  }

  private stepPitStopFlow(car: CarState, dt: number) {
    const halfW = this.spline.circuit.trackWidth * 0.5;
    const pitLat = halfW + 8.6;
    const exitT = this.spline.circuit.pitExitT;

    if (car.pitPhase === 'none') {
      car.pitPhase = 'entering';
      car.inPitLane = true;
      car.drsActive = false;
      car.ersDeploying = false;
    }

    if (car.pitPhase === 'entering') {
      car.speed = THREE.MathUtils.damp(car.speed, 22.2, 5.5, dt);
      const dProgress = (car.speed * dt) / this.spline.totalLength;
      car.trackT = TrackSpline.wrapT(car.trackT + dProgress);
      car.lateralOffset = THREE.MathUtils.damp(car.lateralOffset, pitLat, 4.5, dt);

      const distToBox = Math.abs(TrackSpline.deltaT(car.trackT, 0.992));
      if (distToBox < 0.015) {
        car.pitPhase = 'servicing';
        car.pitTimer = 2.2;
        car.speed = 0;
      }
    } else if (car.pitPhase === 'servicing') {
      car.speed = 0;
      car.pitTimer -= dt;
      if (car.pitTimer <= 0) {
        car.compound = car.nextPitCompound;
        if (!car.compoundsUsed.includes(car.compound)) {
          car.compoundsUsed.push(car.compound);
        }
        car.pitStops += 1;
        car.tyreWear = 100;
        car.tyreTempC = COMPOUND_SPEC[car.compound].optimalTemp - 10;
        car.pitRequested = false;
        car.pitPhase = 'exiting';
        if (car.isPlayer && this.mandatoryPitRequired && car.compoundsUsed.length >= 2) {
          this.pushNotice(
            'MANDATORY TYRE RULE SATISFIED',
            `Fitted fresh ${car.compound} tyres (2.2s stop)`,
            'success',
            3600,
          );
        }
      }
    } else if (car.pitPhase === 'exiting') {
      car.speed = THREE.MathUtils.damp(car.speed, 24.5, 6.0, dt);
      const dProgress = (car.speed * dt) / this.spline.totalLength;
      car.trackT = TrackSpline.wrapT(car.trackT + dProgress);

      const distToExit = TrackSpline.deltaT(car.trackT, exitT);
      if (distToExit <= 0.01 || distToExit > 0.5) {
        car.lateralOffset = THREE.MathUtils.damp(car.lateralOffset, halfW * 0.4, 4.0, dt);
      }
      if (TrackSpline.deltaT(exitT, car.trackT) >= 0 && TrackSpline.deltaT(exitT, car.trackT) < 0.1) {
        car.pitPhase = 'none';
        car.inPitLane = false;
      }
    }

    this.spline.getInterpolatedFrame(car.trackT, _pos, _tan, _right);
    car.position.set(
      _pos.x + _right.x * car.lateralOffset,
      _pos.y,
      _pos.z + _right.z * car.lateralOffset,
    );
    car.yaw = Math.atan2(_tan.x, _tan.z);
    car.moveYaw = car.yaw;
    car.steerAngle = 0;
  }

  private updateLapTracking(car: CarState) {
    if (this.phase !== 'racing') return;

    const bucket = Math.floor(car.trackT * 10);
    if (car.lastProgressBucket === 9 && bucket === 0) {
      if (car.lap >= 1) {
        const lapMs = this.raceElapsedMs - car.lapStartTimeMs;
        if (lapMs > 4000) {
          car.lastLapMs = lapMs;
          car.completedLaps += 1;
          const isNewPb = car.bestLapMs === null || lapMs < car.bestLapMs;
          if (isNewPb) {
            car.bestLapMs = lapMs;
          }
          if (this.fastestLapMs === null || lapMs < this.fastestLapMs) {
            this.fastestLapMs = lapMs;
            this.fastestLapDriverCode = car.driver.code;
          }
          if (car.isPlayer && this.settings.mode === 'practice' && isNewPb) {
            const s = (lapMs / 1000).toFixed(3);
            this.pushNotice(`PURPLE PRACTICE LAP · ${s}s`, 'New session personal best', 'success', 3200);
          }
        }
      }
      car.lapStartTimeMs = this.raceElapsedMs;

      if (this.settings.mode === 'qualifying' && car.lap >= 1 && !car.finished) {
        car.finished = true;
        car.finishTimeMs = this.raceElapsedMs + car.penaltySeconds * 1000;
      } else if (
        this.settings.mode === 'grand_prix' &&
        car.lap >= this.settings.totalLaps &&
        !car.finished
      ) {
        car.finished = true;
        car.finishTimeMs = this.raceElapsedMs + car.penaltySeconds * 1000;
      } else {
        car.lap += 1;
      }
    } else if (car.lastProgressBucket === 0 && bucket === 9) {
      if (car.lap > 1) car.lap -= 1;
    }

    car.lastProgressBucket = bucket;
    car.totalProgress = Math.max(0, car.lap - 1) + car.trackT;
  }

  private isWithinOneSecondAhead(car: CarState): boolean {
    for (const other of this.cars) {
      if (other === car) continue;
      const dT = TrackSpline.deltaT(car.trackT, other.trackT);
      if (dT > 0 && dT < 0.045) {
        const distM = dT * this.spline.totalLength;
        const approxSec = distM / Math.max(25, Math.abs(car.speed));
        if (approxSec <= 1.05) return true;
      }
    }
    return false;
  }

  private resolveCollisionsAndSlipstream(dt: number) {
    for (const c of this.cars) c.slipstream = false;

    const minLatDist = 2.18;
    const minLongDist = 5.15;
    const invTotalLen = 1 / this.spline.totalLength;

    for (let i = 0; i < this.cars.length; i++) {
      const a = this.cars[i];
      if (a.inPitLane) continue;
      for (let j = i + 1; j < this.cars.length; j++) {
        const b = this.cars[j];
        if (b.inPitLane) continue;

        const dy = Math.abs(b.position.y - a.position.y);
        if (dy > 2.5) continue;

        const dTab = TrackSpline.deltaT(a.trackT, b.trackT);
        const longGapM = dTab * this.spline.totalLength;
        const absLong = Math.abs(longGapM);
        if (absLong > 50) continue;

        const latDiff = b.lateralOffset - a.lateralOffset;
        const absLat = Math.abs(latDiff);

        if (absLat < 2.6) {
          if (longGapM > 4.5 && longGapM < 48) a.slipstream = true;
          else if (longGapM < -4.5 && longGapM > -48) b.slipstream = true;
        }

        // Physical wheel-to-wheel & nose-to-tail bounding separation (updates AI trackT & lateralOffset directly!)
        if (absLong < minLongDist && absLat < minLatDist) {
          const latPen = minLatDist - absLat;
          const longPen = minLongDist - absLong;

          if (latPen < longPen * 0.85) {
            const latSign = latDiff >= 0 ? 1 : -1;
            const push = latPen * 0.52;
            const pushA = a.isPlayer ? push * 0.65 : push * 0.5;
            const pushB = b.isPlayer ? push * 0.65 : push * 0.5;
            a.lateralOffset -= latSign * pushA;
            b.lateralOffset += latSign * pushB;
            a.aiTargetLat = a.lateralOffset;
            b.aiTargetLat = b.lateralOffset;
            if (a.isPlayer) {
              this.spline.getInterpolatedFrame(a.trackT, _pos, _tan, _right);
              a.position.x -= _right.x * latSign * pushA;
              a.position.z -= _right.z * latSign * pushA;
            }
            if (b.isPlayer) {
              this.spline.getInterpolatedFrame(b.trackT, _pos, _tan, _right);
              b.position.x += _right.x * latSign * pushB;
              b.position.z += _right.z * latSign * pushB;
            }
          } else {
            const longSign = longGapM >= 0 ? 1 : -1;
            const push = longPen * 0.52;
            a.trackT = TrackSpline.wrapT(a.trackT - longSign * push * invTotalLen);
            b.trackT = TrackSpline.wrapT(b.trackT + longSign * push * invTotalLen);
            this.spline.getInterpolatedFrame(a.trackT, _pos, _tan, _right);
            a.position.set(_pos.x + _right.x * a.lateralOffset, _pos.y, _pos.z + _right.z * a.lateralOffset);
            this.spline.getInterpolatedFrame(b.trackT, _pos, _tan, _right);
            b.position.set(_pos.x + _right.x * b.lateralOffset, _pos.y, _pos.z + _right.z * b.lateralOffset);
          }

          const avgSpeed = (a.speed + b.speed) * 0.5;
          a.speed = THREE.MathUtils.lerp(a.speed, avgSpeed * 0.96, Math.min(1, 5 * dt));
          b.speed = THREE.MathUtils.lerp(b.speed, avgSpeed * 0.96, Math.min(1, 5 * dt));
        }
      }
    }
  }

  public getTelemetrySnapshot(): TelemetrySnapshot {
    const isPractice = this.settings.mode === 'practice';
    const sorted = [...this.cars].sort((a, b) => {
      if (isPractice) {
        if (a.bestLapMs !== null && b.bestLapMs !== null) return a.bestLapMs - b.bestLapMs;
        if (a.bestLapMs !== null) return -1;
        if (b.bestLapMs !== null) return 1;
        return b.totalProgress - a.totalProgress;
      }
      if (a.finished && b.finished) return a.finishTimeMs - b.finishTimeMs;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.totalProgress - a.totalProgress;
    });

    const leader = sorted[0];
    const standings: TimingEntry[] = sorted.map((c, idx) => {
      const prev = idx > 0 ? sorted[idx - 1] : c;
      const gapMeters = Math.max(0, (leader.totalProgress - c.totalProgress) * this.spline.totalLength);
      const intMeters = Math.max(0, (prev.totalProgress - c.totalProgress) * this.spline.totalLength);
      const refSpeed = Math.max(45, Math.abs(c.speed) || 65);
      return {
        driverId: c.driver.id,
        code: c.driver.code,
        name: c.driver.name,
        teamId: c.team.id,
        teamColor: c.team.primaryColor,
        position: idx + 1,
        lap: Math.max(1, c.lap),
        progress: c.trackT,
        gapSeconds:
          idx === 0
            ? 0
            : isPractice && c.bestLapMs && leader.bestLapMs
              ? (c.bestLapMs - leader.bestLapMs) / 1000
              : c.finished && leader.finished
                ? (c.finishTimeMs - leader.finishTimeMs) / 1000
                : gapMeters / refSpeed + c.penaltySeconds,
        intervalSeconds: idx === 0 ? 0 : intMeters / refSpeed,
        lastLapMs: c.lastLapMs,
        bestLapMs: c.bestLapMs,
        compound: c.compound,
        tyreWear: Math.round(c.tyreWear),
        inPit: c.inPitLane,
        pitStops: c.pitStops,
        compoundsUsed: c.compoundsUsed,
        penaltySeconds: c.penaltySeconds,
        finished: c.finished,
        isPlayer: c.isPlayer,
        worldX: c.position.x,
        worldZ: c.position.z,
      };
    });

    const p = this.playerCar;
    const speedKmh = Math.round(Math.abs(p.speed) * 3.6);
    const gearThresholds = [0, 58, 102, 145, 188, 232, 274, 308];
    let gear = 0;
    if (p.speed < -0.5) {
      gear = -1;
    } else if (speedKmh > 2) {
      gear = 1;
      for (let g = 1; g < gearThresholds.length; g++) {
        if (speedKmh >= gearThresholds[g]) gear = g + 1;
      }
      gear = Math.min(8, gear);
    }

    const gearMin = gear <= 1 ? 0 : gearThresholds[gear - 1];
    const gearMax = gear >= 8 ? 350 : gearThresholds[Math.max(1, gear)];
    const bandFrac =
      gear <= 0
        ? 0
        : THREE.MathUtils.clamp((speedKmh - gearMin) / Math.max(1, gearMax - gearMin), 0, 1);
    const rpm =
      this.phase === 'countdown'
        ? 9400 + Math.sin(this.countdownTimer * 24) * 650
        : gear === -1
          ? Math.round(6200 + Math.min(1, speedKmh / 55) * 4500)
          : Math.round(5400 + bandFrac * 7800);

    const playerPos = standings.find((s) => s.isPlayer)?.position ?? 1;
    const sector: 1 | 2 | 3 = p.trackT < 0.333 ? 1 : p.trackT < 0.666 ? 2 : 3;
    const drsRaceEnabled =
      this.settings.mode !== 'grand_prix' ||
      this.settings.totalLaps === 1 ||
      p.lap >= 2;

    return {
      phase: this.phase,
      countdownLights: this.countdownLights,
      speedKmh,
      gear,
      rpm,
      throttle: this.phase === 'countdown' ? 0.45 : Number(this.throttlePos.toFixed(2)),
      brake: Number(this.brakePos.toFixed(2)),
      steer: p.steerAngle,
      ersPercent: Math.round(p.ers),
      ersDeploying: p.ersDeploying,
      drsZoneAvailable: this.spline.getActiveDrsZone(p.trackT) !== null,
      drsRaceEnabled,
      drsAllowed: p.drsAllowed,
      drsActive: p.drsActive,
      compound: p.compound,
      nextPitCompound: p.nextPitCompound,
      tyreWear: Math.round(p.tyreWear),
      tyreTempC: Math.round(p.tyreTempC),
      compoundsUsed: [...p.compoundsUsed],
      mandatoryPitRequired: this.mandatoryPitRequired,
      mandatoryPitSatisfied: !this.mandatoryPitRequired || p.compoundsUsed.length >= 2,
      pitRequested: p.pitRequested,
      inPitLane: p.inPitLane,
      pitTimerRemaining: Math.max(0, Number(p.pitTimer.toFixed(1))),
      position: playerPos,
      totalCars: this.cars.length,
      currentLap:
        this.settings.mode === 'qualifying'
          ? 1
          : isPractice
            ? Math.max(1, p.lap)
            : Math.min(this.settings.totalLaps, Math.max(1, p.lap)),
      totalLaps:
        this.settings.mode === 'qualifying'
          ? 1
          : isPractice
            ? 99
            : this.settings.totalLaps,
      currentLapMs:
        this.phase === 'racing' ? Math.max(0, this.raceElapsedMs - p.lapStartTimeMs) : 0,
      lastLapMs: p.lastLapMs,
      bestLapMs: p.bestLapMs,
      completedLaps: p.completedLaps,
      sector,
      offTrack: p.offTrack,
      slipstream: p.slipstream,
      flagState: this.flagState,
      vscActive: this.vscActive,
      vscDeltaKmh: this.vscDeltaKmh,
      vscTimerRemaining: Math.max(0, Number(this.vscTimer.toFixed(1))),
      trackLimitStrikes: this.trackLimitStrikes,
      penaltySeconds: p.penaltySeconds,
      reactionTimeMs: this.reactionTimeMs,
      fiaNotices: this.notices.map(({ id, title, detail, tone }) => ({
        id,
        title,
        detail,
        tone,
      })),
      fastestLapDriverCode: this.fastestLapDriverCode,
      fastestLapMs: this.fastestLapMs,
      standings,
    };
  }
}
