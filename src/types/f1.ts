export type TyreCompound = 'SOFT' | 'MEDIUM' | 'HARD';

export type CameraMode = 'tcam' | 'chase' | 'cockpit' | 'heli';

export type RaceMode = 'practice' | 'qualifying' | 'grand_prix';

export type Difficulty = 'rookie' | 'pro' | 'legend';

export type FlagState = 'GREEN' | 'YELLOW' | 'VSC' | 'BLUE' | 'CHEQUERED';

export type SteeringControlStyle = 'buttons' | 'slider' | 'auto';

export type CircuitEnvironment =
  | 'parkland'
  | 'harbor'
  | 'british'
  | 'ardennes'
  | 'twilight'
  | 'stadium'
  | 'nightcity';

export interface F1Team {
  id: string;
  name: string;
  shortName: string;
  chassis: string;
  powerUnit: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  carPerformance: number; // 0.92 - 1.00
}

export interface F1Driver {
  id: string;
  code: string; // 3-letter FIA code e.g. VER, LEC, HAM
  name: string;
  number: number;
  nationality: string;
  flagCode: string;
  teamId: string;
  helmetPrimary: string;
  helmetAccent: string;
  skillRating: number; // 0.90 - 1.00
}

export interface DrsZone {
  name: string;
  detectionT: number;
  startT: number;
  endT: number;
}

export interface CircuitPoint {
  x: number;
  y: number;
  z: number;
}

export interface F1Circuit {
  id: string;
  name: string;
  grandPrixName: string;
  country: string;
  city: string;
  lengthKm: number;
  turns: number;
  lapRecord: string;
  lapRecordHolder: string;
  description: string;
  environment: CircuitEnvironment;
  trackWidth: number;
  keyCorners: string[];
  drsZones: DrsZone[];
  pitEntryT: number;
  pitExitT: number;
  controlPoints: CircuitPoint[];
}

export interface ControlSettings {
  steeringSensitivity: number; // 0.55 .. 1.55
  steeringSmoothness: number; // 0.0 (Direct) .. 1.0 (Silky Smooth)
  highSpeedStability: number; // 0.0 .. 1.0
  pedalSmoothness: number; // 0.0 (Instant) .. 1.0 (Progressive)
  cameraSmoothness: number; // 0.0 (Rigid Locked) .. 1.0 (Cinematic Follow)
  cameraLookAhead: number; // 0.0 .. 1.0
  steeringAssist: boolean;
  absAssist: boolean;
  brakingAssist: boolean;
  racingLineAssist: boolean;
  autoThrottle: boolean;
  touchControlStyle: SteeringControlStyle;
}

export interface RaceSettings {
  circuitId: string;
  driverId: string;
  mode: RaceMode;
  totalLaps: number;
  startingTyre: TyreCompound;
  difficulty: Difficulty;
  brakingAssist: boolean;
  racingLineAssist: boolean;
  steeringSensitivity: number;
  steeringSmoothness: number;
  highSpeedStability: number;
  pedalSmoothness: number;
  cameraSmoothness: number;
  cameraLookAhead: number;
  steeringAssist: boolean;
  absAssist: boolean;
  autoThrottle: boolean;
}

export interface FiaNotice {
  id: number;
  title: string;
  detail: string;
  tone: 'info' | 'warning' | 'penalty' | 'success';
}

export interface TimingEntry {
  driverId: string;
  code: string;
  name: string;
  teamId: string;
  teamColor: string;
  position: number;
  lap: number;
  progress: number; // 0..1
  gapSeconds: number;
  intervalSeconds: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  compound: TyreCompound;
  tyreWear: number; // 0..100 (100 = fresh)
  inPit: boolean;
  pitStops: number;
  compoundsUsed: TyreCompound[];
  penaltySeconds: number;
  finished: boolean;
  isPlayer: boolean;
  worldX: number;
  worldZ: number;
}

export interface TelemetrySnapshot {
  phase: 'countdown' | 'racing' | 'paused' | 'finished';
  countdownLights: number; // 0..5, -1 = lights out!
  speedKmh: number;
  gear: number; // -1 = R, 0 = N, 1..8
  rpm: number; // 4000..15000
  throttle: number; // 0..1
  brake: number; // 0..1
  steer: number; // -1..1
  ersPercent: number; // 0..100
  ersDeploying: boolean;
  drsZoneAvailable: boolean;
  drsRaceEnabled: boolean; // FIA rule: DRS activates from Lap 2 in races
  drsAllowed: boolean;
  drsActive: boolean;
  compound: TyreCompound;
  nextPitCompound: TyreCompound;
  tyreWear: number; // 100..0
  tyreTempC: number;
  compoundsUsed: TyreCompound[];
  mandatoryPitRequired: boolean;
  mandatoryPitSatisfied: boolean;
  pitRequested: boolean;
  inPitLane: boolean;
  pitTimerRemaining: number;
  position: number;
  totalCars: number;
  currentLap: number;
  totalLaps: number;
  currentLapMs: number;
  lastLapMs: number | null;
  bestLapMs: number | null;
  completedLaps: number;
  sector: 1 | 2 | 3;
  offTrack: boolean;
  slipstream: boolean;
  flagState: FlagState;
  vscActive: boolean;
  vscDeltaKmh: number;
  vscTimerRemaining: number;
  trackLimitStrikes: number;
  penaltySeconds: number;
  reactionTimeMs: number | null;
  fiaNotices: FiaNotice[];
  fastestLapDriverCode: string | null;
  fastestLapMs: number | null;
  standings: TimingEntry[];
}

export interface ChampionshipWeekendState {
  circuitId: string;
  practiceCompleted: boolean;
  practiceBestLapMs: number | null;
  practiceLapsRun: number;
  qualifyingCompleted: boolean;
  qualifyingGridSlot: number | null;
  qualifyingLapMs: number | null;
}

export interface ChampionshipRoundResult {
  roundNumber: number;
  circuitId: string;
  grandPrixName: string;
  winnerName: string;
  winnerCode: string;
  winnerTeamColor: string;
  podiumCodes: string[];
  playerPosition: number;
  playerPointsEarned: number;
  fastestLapCode: string | null;
  fastestLapMs: number | null;
}

export interface ChampionshipSeason {
  seasonNumber: number;
  driverId: string;
  difficulty: Difficulty;
  raceLaps: number;
  calendarCircuitIds: string[];
  currentRoundIndex: number; // 0 .. calendarCircuitIds.length - 1
  weekend: ChampionshipWeekendState;
  driverPoints: Record<string, number>;
  constructorPoints: Record<string, number>;
  driverWins: Record<string, number>;
  roundResults: ChampionshipRoundResult[];
  completed: boolean;
  bestLapsByCircuit: Record<string, { timeMs: number; driverCode: string }>;
}
