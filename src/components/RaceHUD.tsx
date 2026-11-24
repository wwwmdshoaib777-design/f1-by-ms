import { useMemo, useRef, useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Flag,
  Gamepad2,
  Pause,
  Play,
  RotateCcw,
  Sliders,
  Trophy,
  Undo2,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { FIA_POINTS } from '../data/f1Roster';
import { PlayerInputs } from '../engine/raceEngine';
import { TrackSpline } from '../engine/trackMath';
import { formatLapTime } from '../engine/webglUtils';
import {
  CameraMode,
  ControlSettings,
  F1Circuit,
  RaceMode,
  TelemetrySnapshot,
  TyreCompound,
} from '../types/f1';

export interface ChampionshipHudContext {
  roundNumber: number;
  totalRounds: number;
  isFinalRound: boolean;
}

interface RaceHUDProps {
  circuit: F1Circuit;
  spline: TrackSpline;
  mode: RaceMode;
  telemetry: TelemetrySnapshot;
  cameraMode: CameraMode;
  isMuted: boolean;
  controlSettings: ControlSettings;
  championshipContext?: ChampionshipHudContext | null;
  touchInputsRef: React.MutableRefObject<Partial<PlayerInputs>>;
  onCycleCamera: () => void;
  onToggleMute: () => void;
  onTogglePause: () => void;
  onRequestPit: () => void;
  onSelectNextCompound: (c: TyreCompound) => void;
  onSwapPracticeCompound?: (c: TyreCompound) => void;
  onResetCarToTrack: () => void;
  onFinishPractice?: () => void;
  onStartQualifyingFromPractice?: () => void;
  onUpdateControls: (patch: Partial<ControlSettings>) => void;
  onRestartRace: () => void;
  onStartGpFromQualifying?: (gridSlot: number) => void;
  onExitToPaddock: () => void;
}

const CAMERA_LABELS: Record<CameraMode, string> = {
  tcam: 'T-Cam',
  chase: 'Chase',
  cockpit: 'Cockpit',
  heli: 'Heli',
};

const COMPOUND_COLOR: Record<TyreCompound, string> = {
  SOFT: '#EF4444',
  MEDIUM: '#FACC15',
  HARD: '#E2E8F0',
};

export default function RaceHUD({
  circuit,
  spline,
  mode,
  telemetry,
  cameraMode,
  isMuted,
  controlSettings,
  championshipContext,
  touchInputsRef,
  onCycleCamera,
  onToggleMute,
  onTogglePause,
  onRequestPit,
  onSelectNextCompound,
  onSwapPracticeCompound,
  onResetCarToTrack,
  onFinishPractice,
  onStartQualifyingFromPractice,
  onUpdateControls,
  onRestartRace,
  onStartGpFromQualifying,
  onExitToPaddock,
}: RaceHUDProps) {
  const [towerExpanded, setTowerExpanded] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [showTouchPad, setShowTouchPad] = useState(() => {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(pointer: coarse)').matches;
    }
    return false;
  });
  const [sliderKnob, setSliderKnob] = useState(0); // -1..1 visual
  const sliderRef = useRef<HTMLDivElement | null>(null);
  const sliderPointerId = useRef<number | null>(null);

  const svgMap = useMemo(() => spline.getSvgOutline(180, 125, 14), [spline]);

  const setTouchKey = (
    key: 'throttle' | 'brake' | 'steerLeft' | 'steerRight' | 'reverse' | 'ers' | 'drsPressed',
    val: boolean,
  ) => {
    touchInputsRef.current[key] = val;
  };

  const updateAnalogSlider = (clientX: number) => {
    const el = sliderRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const norm = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1; // -1 (left edge) .. +1 (right edge)
    const clamped = Math.max(-1, Math.min(1, norm));
    setSliderKnob(clamped);
    // steerAnalog: +1 is steer left, -1 is steer right
    touchInputsRef.current.steerAnalog = -clamped;
  };

  const releaseAnalogSlider = () => {
    sliderPointerId.current = null;
    setSliderKnob(0);
    touchInputsRef.current.steerAnalog = 0;
  };

  const visibleStandings = useMemo(() => {
    const all = telemetry.standings;
    if (all.length <= 10) return all;
    const playerIdx = all.findIndex((s) => s.isPlayer);
    if (playerIdx < 8) return all.slice(0, 10);
    return [
      ...all.slice(0, 4),
      ...all.slice(Math.max(4, playerIdx - 2), Math.min(all.length, playerIdx + 3)),
    ];
  }, [telemetry.standings]);

  const qualifyingGridResult = useMemo(() => {
    if (mode !== 'qualifying' || telemetry.phase !== 'finished') return null;
    const lapMs = telemetry.bestLapMs ?? telemetry.lastLapMs ?? 42000;
    const adjustedMs = lapMs + telemetry.penaltySeconds * 1000;
    const poleAvgMs =
      circuit.environment === 'harbor'
        ? 49
        : circuit.environment === 'nightcity'
          ? 54
          : 67;
    const benchmarkPoleMs = (spline.totalLength / poleAvgMs) * 1000;
    const deltaRatio = (adjustedMs - benchmarkPoleMs) / benchmarkPoleMs;
    const gridPos = Math.max(1, Math.min(20, Math.round(1 + deltaRatio * 65)));
    return { lapMs, adjustedMs, gridPos };
  }, [
    mode,
    telemetry.phase,
    telemetry.bestLapMs,
    telemetry.lastLapMs,
    telemetry.penaltySeconds,
    circuit.environment,
    spline.totalLength,
  ]);

  const playerPointsEarned = useMemo(() => {
    if (mode !== 'grand_prix' || telemetry.phase !== 'finished') return 0;
    const playerRow = telemetry.standings.find((s) => s.isPlayer);
    if (!playerRow) return 0;
    const idx = playerRow.position - 1;
    let pts = idx >= 0 && idx < FIA_POINTS.length ? FIA_POINTS[idx] : 0;
    if (
      telemetry.fastestLapDriverCode === playerRow.code &&
      playerRow.position <= 10
    ) {
      pts += 1;
    }
    return pts;
  }, [mode, telemetry.phase, telemetry.standings, telemetry.fastestLapDriverCode]);

  const rpmSegments = 12;
  const litRpmSegments = Math.round(
    Math.max(0, Math.min(1, (telemetry.rpm - 5500) / 8000)) * rpmSegments,
  );

  const sessionLabel =
    mode === 'practice'
      ? 'FP1 PRACTICE'
      : mode === 'qualifying'
        ? 'QUALI'
        : championshipContext
          ? `R${championshipContext.roundNumber} GP`
          : 'F1 LIVE';

  return (
    <div className="pointer-events-none fixed inset-0 z-20 flex flex-col justify-between p-3 sm:p-4 select-none">
      {/* Top Row */}
      <div className="flex items-start justify-between gap-3">
        {/* Left: Broadcast Timing Tower */}
        <div className="pointer-events-auto w-60 rounded-lg border border-white/10 bg-[#0B0D11]/92 overflow-hidden">
          <button
            type="button"
            onClick={() => setTowerExpanded((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 border-b border-white/10 text-left hover:bg-white/5 transition-colors"
          >
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display text-xs font-bold tracking-wide text-[#E10600] whitespace-nowrap">
                {sessionLabel}
              </span>
              <span className="text-xs text-slate-300 truncate">{circuit.city}</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="font-mono-tabular text-xs font-semibold text-white">
                {mode === 'practice'
                  ? `L${telemetry.currentLap}`
                  : `L${telemetry.currentLap}/${telemetry.totalLaps}`}
              </span>
              {towerExpanded ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              )}
            </div>
          </button>

          {/* Compact Rules / Practice Info Strip */}
          <div className="px-2.5 py-1.5 border-b border-white/10 bg-[#121620] flex items-center justify-between text-[11px] font-mono-tabular">
            {mode === 'practice' ? (
              <>
                <span className="text-emerald-400 font-medium">Free Run</span>
                <span className="text-slate-300">
                  Best {formatLapTime(telemetry.bestLapMs)}
                </span>
              </>
            ) : (
              <>
                <span
                  className={
                    telemetry.trackLimitStrikes >= 3
                      ? 'text-amber-400 font-semibold'
                      : 'text-slate-400'
                  }
                >
                  Walls {telemetry.trackLimitStrikes}/3
                </span>
                {telemetry.penaltySeconds > 0 ? (
                  <span className="text-red-400 font-bold">+{telemetry.penaltySeconds}s PEN</span>
                ) : telemetry.mandatoryPitRequired ? (
                  <span
                    className={
                      telemetry.mandatoryPitSatisfied ? 'text-emerald-400' : 'text-amber-300'
                    }
                  >
                    {telemetry.mandatoryPitSatisfied ? '2-Comp OK' : 'Pit Req'}
                  </span>
                ) : (
                  <span className="text-slate-400">
                    DRS {telemetry.drsRaceEnabled ? 'Active' : 'Lap 2'}
                  </span>
                )}
              </>
            )}
          </div>

          {towerExpanded && (
            <div className="divide-y divide-white/5">
              {visibleStandings.map((row) => (
                <div
                  key={row.driverId}
                  className={`flex items-center justify-between px-2.5 py-1 text-xs ${
                    row.isPlayer ? 'bg-[#E10600]/20 text-white font-semibold' : 'text-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-mono-tabular w-4 text-right text-slate-400">
                      {row.position}
                    </span>
                    <span
                      className="w-1 h-3.5 rounded-xs shrink-0"
                      style={{ backgroundColor: row.teamColor }}
                    />
                    <span className="font-display tracking-wide">{row.code}</span>
                    {row.penaltySeconds > 0 && (
                      <span className="text-[10px] font-mono-tabular text-red-400">
                        +{row.penaltySeconds}s
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-mono-tabular text-[11px] text-slate-300">
                      {mode === 'practice'
                        ? row.bestLapMs
                          ? formatLapTime(row.bestLapMs)
                          : 'OUT'
                        : row.inPit
                          ? 'PIT'
                          : row.position === 1
                            ? 'LEADER'
                            : `+${row.gapSeconds.toFixed(1)}s`}
                    </span>
                    <span
                      className="font-mono-tabular text-[10px] font-bold w-4 text-center"
                      style={{ color: COMPOUND_COLOR[row.compound] }}
                    >
                      {row.compound[0]}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Center: Start Lights / Notices */}
        <div className="flex flex-col items-center gap-2 max-w-md">
          {(telemetry.phase === 'countdown' || telemetry.countdownLights === -1) && (
            <div className="rounded-lg border border-white/15 bg-[#0B0D11]/95 px-5 py-3 flex flex-col items-center gap-2">
              <div className="flex items-center gap-3">
                {[1, 2, 3, 4, 5].map((n) => {
                  const lit = telemetry.countdownLights >= n;
                  return (
                    <div
                      key={n}
                      className={`w-6 h-6 rounded-full border transition-colors duration-100 ${
                        lit
                          ? 'bg-[#E10600] border-red-300 shadow-[0_0_12px_rgba(225,6,0,0.85)]'
                          : 'bg-[#1C1F26] border-white/15'
                      }`}
                    />
                  );
                })}
              </div>
              <span className="font-display text-xs font-bold tracking-wider text-slate-200">
                {telemetry.countdownLights === -1
                  ? 'LIGHTS OUT AND AWAY WE GO'
                  : 'HOLD THROTTLE TO REV LAUNCH'}
              </span>
            </div>
          )}

          {telemetry.vscActive && (
            <div className="rounded-md border border-amber-400/60 bg-amber-950/90 px-4 py-1.5 text-center">
              <div className="font-display text-xs font-bold text-amber-300">
                VIRTUAL SAFETY CAR · {telemetry.vscTimerRemaining.toFixed(1)}s
              </div>
              <div className="font-mono-tabular text-[11px] text-amber-100">
                Max Speed {telemetry.vscDeltaKmh} km/h · Current {telemetry.speedKmh} km/h
              </div>
            </div>
          )}

          {telemetry.inPitLane && (
            <div className="rounded-md border border-amber-400/40 bg-[#0B0D11]/92 px-4 py-1.5 text-center">
              <span className="font-display text-xs font-bold text-amber-300">
                {telemetry.pitTimerRemaining > 0
                  ? `PIT SERVICE · ${telemetry.pitTimerRemaining.toFixed(1)}s · FITTING ${telemetry.nextPitCompound}`
                  : 'PIT LANE LIMITER · 80 KM/H'}
              </span>
            </div>
          )}


          {telemetry.slipstream && telemetry.phase === 'racing' && (
            <div className="rounded-md border border-cyan-400/35 bg-[#0B0D11]/90 px-3 py-1">
              <span className="font-display text-xs font-semibold text-cyan-300">
                SLIPSTREAM TOW
              </span>
            </div>
          )}

          {telemetry.fiaNotices.slice(-2).map((notice) => {
            const borderCls =
              notice.tone === 'penalty'
                ? 'border-red-500/60 text-red-300'
                : notice.tone === 'warning'
                  ? 'border-amber-400/50 text-amber-300'
                  : notice.tone === 'success'
                    ? 'border-emerald-400/50 text-emerald-300'
                    : 'border-white/20 text-slate-200';
            return (
              <div
                key={notice.id}
                className={`rounded-md border bg-[#0B0D11]/94 px-3.5 py-1.5 text-center ${borderCls}`}
              >
                <div className="font-display text-xs font-bold">{notice.title}</div>
                <div className="text-[11px] text-slate-300">{notice.detail}</div>
              </div>
            );
          })}
        </div>

        {/* Right: Quick Toolbar & Circuit Minimap */}
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-[#0B0D11]/90 p-1.5">
            {mode === 'practice' && onFinishPractice && (
              <button
                type="button"
                onClick={onFinishPractice}
                className="px-2.5 py-1.5 rounded-md bg-[#E10600] hover:bg-red-600 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 mr-1"
              >
                Finish Practice
              </button>
            )}
            <button
              type="button"
              onClick={onResetCarToTrack}
              title="Recover Car to Track (Backspace)"
              className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
            >
              <Undo2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onCycleCamera}
              title="Cycle Camera (C)"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-slate-200 hover:bg-white/10 transition-colors whitespace-nowrap shrink-0"
            >
              <Camera className="w-3.5 h-3.5 text-slate-300" />
              <span>{CAMERA_LABELS[cameraMode]}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowTouchPad((v) => !v)}
              title="On-Screen Steering & Pedals"
              className={`p-1.5 rounded-md transition-colors ${
                showTouchPad ? 'bg-[#E10600] text-white' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <Gamepad2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={onToggleMute}
              title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
              className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
            >
              {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={onTogglePause}
              title="Pause & Controls Tuning (Esc)"
              className="p-1.5 rounded-md text-slate-300 hover:bg-white/10 transition-colors"
            >
              {telemetry.phase === 'paused' ? (
                <Play className="w-4 h-4" />
              ) : (
                <Pause className="w-4 h-4" />
              )}
            </button>
          </div>

          <div className="hidden sm:block rounded-lg border border-white/10 bg-[#0B0D11]/88 p-2">
            <svg width="180" height="125" viewBox="0 0 180 125" className="overflow-visible">
              <path
                d={svgMap.pathD}
                fill="none"
                stroke="#334155"
                strokeWidth="5"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <path
                d={svgMap.pathD}
                fill="none"
                stroke="#64748B"
                strokeWidth="2"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle cx={svgMap.startPoint.x} cy={svgMap.startPoint.y} r="3.2" fill="#FFFFFF" />
              {telemetry.standings.map((car) => {
                const pt = svgMap.mapPoint(car.worldX, car.worldZ);
                return (
                  <circle
                    key={car.driverId}
                    cx={pt.x}
                    cy={pt.y}
                    r={car.isPlayer ? 4.4 : 2.6}
                    fill={car.isPlayer ? '#E10600' : car.teamColor}
                    stroke={car.isPlayer ? '#FFFFFF' : '#0B0D11'}
                    strokeWidth={car.isPlayer ? 1.5 : 0.7}
                  />
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {/* Responsive On-Screen Controls (Buttons OR Analog Drag Steer Slider) */}
      {showTouchPad && (
        <div className="pointer-events-auto flex items-end justify-between gap-4 px-2 mb-2">
          {controlSettings.touchControlStyle === 'slider' ? (
            <div className="flex flex-col gap-1.5">
              <div
                ref={sliderRef}
                onPointerDown={(e) => {
                  e.currentTarget.setPointerCapture(e.pointerId);
                  sliderPointerId.current = e.pointerId;
                  updateAnalogSlider(e.clientX);
                }}
                onPointerMove={(e) => {
                  if (sliderPointerId.current === e.pointerId) {
                    updateAnalogSlider(e.clientX);
                  }
                }}
                onPointerUp={releaseAnalogSlider}
                onPointerCancel={releaseAnalogSlider}
                className="relative w-52 h-14 rounded-xl border border-white/20 bg-[#0B0D11]/92 touch-none flex items-center justify-center cursor-ew-resize"
              >
                <div className="w-40 h-1.5 rounded-full bg-white/15 relative">
                  <div
                    className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-10 h-10 rounded-lg bg-[#E10600] border border-white/40 flex items-center justify-center text-[10px] font-bold text-white"
                    style={{ left: `${(sliderKnob * 0.5 + 0.5) * 100}%` }}
                  >
                    STEER
                  </div>
                </div>
              </div>
              <span className="text-[10px] text-slate-400 text-center">
                Drag slider for smooth steering
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onPointerDown={() => setTouchKey('steerLeft', true)}
                onPointerUp={() => setTouchKey('steerLeft', false)}
                onPointerLeave={() => setTouchKey('steerLeft', false)}
                onPointerCancel={() => setTouchKey('steerLeft', false)}
                className="w-16 h-14 rounded-lg border border-white/20 bg-[#0B0D11]/90 text-sm font-bold text-white active:bg-[#E10600] touch-none"
              >
                LEFT
              </button>
              <button
                type="button"
                onPointerDown={() => setTouchKey('steerRight', true)}
                onPointerUp={() => setTouchKey('steerRight', false)}
                onPointerLeave={() => setTouchKey('steerRight', false)}
                onPointerCancel={() => setTouchKey('steerRight', false)}
                className="w-16 h-14 rounded-lg border border-white/20 bg-[#0B0D11]/90 text-sm font-bold text-white active:bg-[#E10600] touch-none"
              >
                RIGHT
              </button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <button
              type="button"
              onPointerDown={() => setTouchKey('ers', true)}
              onPointerUp={() => setTouchKey('ers', false)}
              onPointerLeave={() => setTouchKey('ers', false)}
              onPointerCancel={() => setTouchKey('ers', false)}
              className="px-4 h-14 rounded-lg border border-cyan-400/35 bg-[#0B0D11]/90 text-xs font-bold text-cyan-300 active:bg-cyan-600 active:text-white touch-none"
            >
              ERS
            </button>
            <button
              type="button"
              onPointerDown={() => setTouchKey('brake', true)}
              onPointerUp={() => setTouchKey('brake', false)}
              onPointerLeave={() => setTouchKey('brake', false)}
              onPointerCancel={() => setTouchKey('brake', false)}
              className="w-20 h-14 rounded-lg border border-red-500/40 bg-[#0B0D11]/90 text-xs font-bold text-red-400 active:bg-red-600 active:text-white touch-none"
            >
              BRAKE
            </button>
            {!controlSettings.autoThrottle && (
              <button
                type="button"
                onPointerDown={() => setTouchKey('throttle', true)}
                onPointerUp={() => setTouchKey('throttle', false)}
                onPointerLeave={() => setTouchKey('throttle', false)}
                onPointerCancel={() => setTouchKey('throttle', false)}
                className="w-24 h-14 rounded-lg border border-emerald-500/40 bg-[#0B0D11]/90 text-xs font-bold text-emerald-400 active:bg-emerald-600 active:text-white touch-none"
              >
                GAS
              </button>
            )}
          </div>
        </div>
      )}

      {/* Bottom Center Telemetry & Strategy Dock */}
      <div className="flex flex-col items-center">
        <button
          type="button"
          onClick={() => setDockCollapsed((v) => !v)}
          className="pointer-events-auto flex items-center gap-1.5 px-3 py-1 rounded-t-md border border-b-0 border-white/10 bg-[#0B0D11]/90 text-[11px] font-medium text-slate-300 hover:text-white transition-colors"
        >
          {dockCollapsed ? (
            <>
              <ChevronUp className="w-3.5 h-3.5" />
              <span>Show Telemetry</span>
            </>
          ) : (
            <>
              <ChevronDown className="w-3.5 h-3.5" />
              <span>Hide Telemetry</span>
            </>
          )}
        </button>

        {!dockCollapsed && (
          <div className="pointer-events-auto w-full max-w-[920px] rounded-lg border border-white/10 bg-[#0B0D11]/90 px-4 py-1.5 grid grid-cols-1 md:grid-cols-3 items-center gap-3">
            {/* Left Cluster */}
            <div className="flex items-center justify-between md:justify-start gap-5">
              <div>
                <div className="text-[11px] text-slate-400">
                  {mode === 'practice' ? 'Pace Rank' : 'Position'}
                </div>
                <div className="font-display text-2xl font-bold text-white leading-tight">
                  P{telemetry.position}
                  <span className="text-sm font-normal text-slate-400">
                    /{telemetry.totalCars}
                  </span>
                </div>
              </div>

              <div className="h-8 w-px bg-white/10" />

              <div>
                <div className="text-[11px] text-slate-400">
                  {mode === 'practice'
                    ? `Lap ${telemetry.currentLap} · Sector ${telemetry.sector}`
                    : `Lap ${telemetry.currentLap}/${telemetry.totalLaps} · S${telemetry.sector}`}
                </div>
                <div className="font-mono-tabular text-base font-bold text-white">
                  {formatLapTime(telemetry.currentLapMs)}
                </div>
                <div className="font-mono-tabular text-[11px] text-slate-400">
                  Best: {formatLapTime(telemetry.bestLapMs)}
                </div>
              </div>
            </div>

            {/* Center Cluster */}
            <div className="flex flex-col items-center gap-1.5">
              <div className="flex items-center gap-1">
                {Array.from({ length: rpmSegments }).map((_, idx) => {
                  const active = idx < litRpmSegments;
                  const color = idx < 4 ? '#22C55E' : idx < 8 ? '#EF4444' : '#38BDF8';
                  return (
                    <span
                      key={idx}
                      className="w-3.5 h-1.5 rounded-xs transition-colors"
                      style={{ backgroundColor: active ? color : '#1E293B' }}
                    />
                  );
                })}
              </div>

              <div className="flex items-baseline gap-4">
                <div className="flex items-baseline gap-1">
                  <span className="font-mono-tabular text-3xl font-bold text-white">
                    {telemetry.speedKmh}
                  </span>
                  <span className="text-[11px] font-medium text-slate-400">km/h</span>
                </div>

                <div className="w-9 h-9 rounded-md border border-white/15 bg-[#161B26] flex items-center justify-center">
                  <span
                    className={`font-display text-xl font-bold ${
                      telemetry.gear === -1 ? 'text-red-400' : 'text-amber-400'
                    }`}
                  >
                    {telemetry.gear === -1 ? 'R' : telemetry.gear === 0 ? 'N' : telemetry.gear}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setTouchKey('drsPressed', true)}
                  disabled={!telemetry.drsAllowed}
                  className={`px-2.5 py-1 rounded text-xs font-display font-bold border transition-colors whitespace-nowrap ${
                    telemetry.drsActive
                      ? 'bg-emerald-500 text-slate-950 border-emerald-300'
                      : telemetry.drsAllowed
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-400/50 hover:bg-emerald-500/35'
                        : 'bg-white/5 text-slate-500 border-white/10'
                  }`}
                >
                  DRS {telemetry.drsActive ? 'OPEN' : telemetry.drsAllowed ? 'READY' : telemetry.drsRaceEnabled ? 'OFF' : 'L2'}
                </button>
              </div>

              <div className="w-full max-w-[290px] flex items-center gap-2 text-[10px] font-mono-tabular">
                <span className={telemetry.ersDeploying ? 'text-cyan-300 font-bold' : 'text-slate-400'}>
                  ERS {telemetry.ersPercent}%
                </span>
                <div className="flex-1 h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className="h-full bg-cyan-400 transition-all duration-75"
                    style={{ width: `${telemetry.ersPercent}%` }}
                  />
                </div>
                {/* Live steering axis indicator */}
                <div className="w-10 h-1.5 rounded-full bg-slate-800 relative overflow-hidden">
                  <div
                    className="absolute top-0 bottom-0 w-2 bg-amber-400 rounded-full"
                    style={{ left: `${((-telemetry.steer * 0.5 + 0.5) * 80).toFixed(0)}%` }}
                  />
                </div>
                <div className="flex items-center gap-1">
                  <span
                    className={`w-2.5 h-2.5 rounded-xs ${
                      telemetry.brake > 0 ? 'bg-red-500' : 'bg-slate-800'
                    }`}
                  />
                  <span
                    className={`w-2.5 h-2.5 rounded-xs ${
                      telemetry.throttle > 0 ? 'bg-emerald-500' : 'bg-slate-800'
                    }`}
                  />
                </div>
              </div>
            </div>

            {/* Right Cluster */}
            <div className="flex items-center justify-between md:justify-end gap-3">
              <div className="text-right">
                <div className="flex items-center justify-end gap-1.5 text-xs">
                  <span
                    className="font-display font-bold"
                    style={{ color: COMPOUND_COLOR[telemetry.compound] }}
                  >
                    {telemetry.compound}
                  </span>
                  <span className="text-slate-400">·</span>
                  <span className="font-mono-tabular font-semibold text-white">
                    {telemetry.tyreWear}%
                  </span>
                </div>
                <div className="text-[11px] font-mono-tabular text-slate-400">
                  {telemetry.tyreTempC}°C · {mode === 'practice' ? 'Swap:' : 'Next:'}{' '}
                  {(['SOFT', 'MEDIUM', 'HARD'] as TyreCompound[]).map((c) => {
                    const isSelected =
                      mode === 'practice'
                        ? telemetry.compound === c
                        : telemetry.nextPitCompound === c;
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() =>
                          mode === 'practice' && onSwapPracticeCompound
                            ? onSwapPracticeCompound(c)
                            : onSelectNextCompound(c)
                        }
                        className={`ml-1 px-1.5 py-0.5 rounded text-[10px] font-bold border transition-colors ${
                          isSelected
                            ? 'border-white/50 bg-white/15 text-white'
                            : 'border-white/10 text-slate-400 hover:text-white'
                        }`}
                      >
                        {c[0]}
                      </button>
                    );
                  })}
                </div>
              </div>

              {mode !== 'practice' && (
                <button
                  type="button"
                  onClick={onRequestPit}
                  className={`flex items-center gap-1.5 px-3 py-2 rounded-md text-xs font-semibold border transition-colors whitespace-nowrap shrink-0 ${
                    telemetry.pitRequested
                      ? 'bg-amber-500 text-slate-950 border-amber-300'
                      : 'bg-white/5 text-slate-200 border-white/15 hover:bg-white/10'
                  }`}
                >
                  <Wrench className="w-3.5 h-3.5" />
                  <span>{telemetry.pitRequested ? 'Box Confirmed' : 'Box This Lap'}</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Pause Modal with Live Steering & Control Calibration */}
      {telemetry.phase === 'paused' && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/75 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/15 bg-[#12161F] p-6 space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-slate-400">
                  {circuit.grandPrixName} · {mode === 'practice' ? 'Practice Laps' : mode === 'qualifying' ? 'Qualifying' : 'Grand Prix'}
                </p>
                <h2 className="font-display text-2xl font-bold text-white">Session Paused</h2>
              </div>
              <button
                type="button"
                onClick={() => {
                  onResetCarToTrack();
                  onTogglePause();
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-xs text-slate-200"
              >
                <Undo2 className="w-3.5 h-3.5" />
                <span>Recover Car</span>
              </button>
            </div>

            {/* Live Control & Smoothness Calibration */}
            <div className="rounded-lg border border-white/10 bg-[#0B0D11] p-4 space-y-3.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-semibold text-white">
                  <Sliders className="w-3.5 h-3.5 text-[#E10600]" />
                  <span>Live Controls &amp; Smoothness Tuning</span>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateControls({
                      steeringSensitivity: 1.0,
                      steeringSmoothness: 0.25,
                      highSpeedStability: 0.65,
                      pedalSmoothness: 0.2,
                      cameraSmoothness: 0.2,
                      cameraLookAhead: 0.25,
                    })
                  }
                  className="text-[11px] text-slate-400 hover:text-white underline"
                >
                  Reset Balanced
                </button>
              </div>

              {(
                [
                  {
                    key: 'steeringSensitivity',
                    label: 'Steering Sensitivity',
                    min: 0.55,
                    max: 1.55,
                    step: 0.05,
                    fmt: (v: number) => `${v.toFixed(2)}x`,
                  },
                  {
                    key: 'steeringSmoothness',
                    label: 'Steering Smoothness',
                    min: 0,
                    max: 1,
                    step: 0.05,
                    fmt: (v: number) => `${Math.round(v * 100)}%`,
                  },
                  {
                    key: 'highSpeedStability',
                    label: 'High-Speed Stability',
                    min: 0,
                    max: 1,
                    step: 0.05,
                    fmt: (v: number) => `${Math.round(v * 100)}%`,
                  },
                  {
                    key: 'pedalSmoothness',
                    label: 'Throttle & Brake Smoothness',
                    min: 0,
                    max: 1,
                    step: 0.05,
                    fmt: (v: number) => `${Math.round(v * 100)}%`,
                  },
                  {
                    key: 'cameraSmoothness',
                    label: 'Camera Smoothness',
                    min: 0,
                    max: 1,
                    step: 0.05,
                    fmt: (v: number) => `${Math.round(v * 100)}%`,
                  },
                ] as const
              ).map((s) => (
                <div key={s.key} className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">{s.label}</span>
                    <span className="font-mono-tabular font-semibold text-white">
                      {s.fmt(controlSettings[s.key])}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={s.min}
                    max={s.max}
                    step={s.step}
                    value={controlSettings[s.key]}
                    onChange={(e) =>
                      onUpdateControls({ [s.key]: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#E10600]"
                  />
                </div>
              ))}

              <div className="grid grid-cols-2 gap-2 text-xs">
                <button
                  type="button"
                  onClick={() =>
                    onUpdateControls({ steeringAssist: !controlSettings.steeringAssist })
                  }
                  className={`px-3 py-2 rounded-md border text-left transition-colors ${
                    controlSettings.steeringAssist
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-[#12161F] text-slate-400'
                  }`}
                >
                  Spin Guard: {controlSettings.steeringAssist ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() => onUpdateControls({ absAssist: !controlSettings.absAssist })}
                  className={`px-3 py-2 rounded-md border text-left transition-colors ${
                    controlSettings.absAssist
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-[#12161F] text-slate-400'
                  }`}
                >
                  ABS Braking: {controlSettings.absAssist ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateControls({ autoThrottle: !controlSettings.autoThrottle })
                  }
                  className={`px-3 py-2 rounded-md border text-left transition-colors ${
                    controlSettings.autoThrottle
                      ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                      : 'border-white/10 bg-[#12161F] text-slate-400'
                  }`}
                >
                  Auto-Throttle: {controlSettings.autoThrottle ? 'ON' : 'OFF'}
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateControls({
                      touchControlStyle:
                        controlSettings.touchControlStyle === 'buttons' ? 'slider' : 'buttons',
                    })
                  }
                  className="px-3 py-2 rounded-md border border-white/10 bg-[#12161F] text-slate-200 text-left hover:border-white/25"
                >
                  Pad: {controlSettings.touchControlStyle === 'slider' ? 'Steer Slider' : 'L/R Buttons'}
                </button>
              </div>

              <div className="pt-2 border-t border-white/10 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-slate-400">
                <div>Throttle / Brake: W/S or Arrows</div>
                <div>Steer: A/D or Arrows</div>
                <div>Reverse / Reset: R / Backspace</div>
                <div>DRS / ERS / Pit: F / Space / P</div>
              </div>
            </div>

            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                onClick={onTogglePause}
                className="w-full py-2.5 px-4 rounded-lg bg-[#E10600] hover:bg-red-600 text-white font-semibold text-sm transition-colors"
              >
                Resume Session
              </button>
              {mode === 'practice' && onFinishPractice && (
                <button
                  type="button"
                  onClick={() => {
                    onTogglePause();
                    onFinishPractice();
                  }}
                  className="w-full py-2.5 px-4 rounded-lg border border-emerald-400/40 bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 font-semibold text-sm transition-colors"
                >
                  End Practice Session
                </button>
              )}
              <button
                type="button"
                onClick={onRestartRace}
                className="w-full py-2.5 px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-slate-100 font-medium text-sm transition-colors flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" />
                <span>Restart Session</span>
              </button>
              <button
                type="button"
                onClick={onExitToPaddock}
                className="w-full py-2.5 px-4 rounded-lg border border-white/10 text-slate-300 hover:text-white hover:bg-white/5 font-medium text-sm transition-colors"
              >
                Return to Paddock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Practice Session Completed Modal */}
      {telemetry.phase === 'finished' && mode === 'practice' && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/15 bg-[#12161F] p-6 space-y-5">
            <div>
              <p className="text-xs text-slate-400">{circuit.grandPrixName} · Free Practice Summary</p>
              <h2 className="font-display text-2xl font-bold text-white">
                Practice Session Complete
              </h2>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B0D11] p-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Completed Timed Laps</span>
                <span className="font-mono-tabular font-bold text-white">
                  {telemetry.completedLaps}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Best Practice Lap</span>
                <span className="font-mono-tabular font-bold text-emerald-400">
                  {formatLapTime(telemetry.bestLapMs)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Last Lap Time</span>
                <span className="font-mono-tabular text-slate-200">
                  {formatLapTime(telemetry.lastLapMs)}
                </span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2">
                <span className="text-slate-400">Compounds Tested</span>
                <span className="font-mono-tabular text-slate-200">
                  {telemetry.compoundsUsed.join(', ')}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {onStartQualifyingFromPractice && (
                <button
                  type="button"
                  onClick={onStartQualifyingFromPractice}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#E10600] hover:bg-red-600 text-sm font-semibold text-white transition-colors"
                >
                  Proceed to Qualifying
                </button>
              )}
              <button
                type="button"
                onClick={onRestartRace}
                className="py-2.5 px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors"
              >
                More Laps
              </button>
              <button
                type="button"
                onClick={onExitToPaddock}
                className="py-2.5 px-4 rounded-lg border border-white/10 text-sm text-slate-300 hover:text-white"
              >
                Paddock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Qualifying Result Modal */}
      {telemetry.phase === 'finished' && mode === 'qualifying' && qualifyingGridResult && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-lg rounded-xl border border-white/15 bg-[#12161F] p-6 space-y-5">
            <div>
              <p className="text-xs text-slate-400">
                {circuit.grandPrixName} · Qualifying Shootout
              </p>
              <h2 className="font-display text-2xl font-bold text-white">
                Qualified P{qualifyingGridResult.gridPos} on the Grid
              </h2>
            </div>

            <div className="rounded-lg border border-white/10 bg-[#0B0D11] p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-400">Flying Lap Time</span>
                <span className="font-mono-tabular font-bold text-white">
                  {formatLapTime(qualifyingGridResult.lapMs)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-400">Track Limits / Penalties</span>
                <span className="font-mono-tabular text-amber-300">
                  {telemetry.penaltySeconds > 0 ? `+${telemetry.penaltySeconds}s` : 'Clean Lap'}
                </span>
              </div>
              <div className="flex justify-between border-t border-white/10 pt-2">
                <span className="text-slate-300 font-medium">Official Starting Grid</span>
                <span className="font-display font-bold text-[#E10600]">
                  P{qualifyingGridResult.gridPos}
                </span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              {onStartGpFromQualifying && (
                <button
                  type="button"
                  onClick={() => onStartGpFromQualifying(qualifyingGridResult.gridPos)}
                  className="flex-1 py-2.5 px-4 rounded-lg bg-[#E10600] hover:bg-red-600 text-sm font-semibold text-white transition-colors"
                >
                  Start Grand Prix from P{qualifyingGridResult.gridPos}
                </button>
              )}
              <button
                type="button"
                onClick={onRestartRace}
                className="py-2.5 px-4 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors"
              >
                Retry Flying Lap
              </button>
              <button
                type="button"
                onClick={onExitToPaddock}
                className="py-2.5 px-4 rounded-lg border border-white/10 text-sm text-slate-300 hover:text-white"
              >
                Paddock
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Grand Prix Checkered Flag Classification Modal */}
      {telemetry.phase === 'finished' && mode === 'grand_prix' && (
        <div className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-2xl max-h-[88vh] flex flex-col rounded-xl border border-white/15 bg-[#12161F] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between gap-4">
              <div>
                <p className="text-xs text-slate-400">
                  {championshipContext
                    ? `Round ${championshipContext.roundNumber}/${championshipContext.totalRounds} · `
                    : ''}
                  {circuit.grandPrixName} · {circuit.name}
                </p>
                <h2 className="font-display text-2xl font-bold text-white flex items-center gap-2">
                  <Flag className="w-5 h-5 text-[#E10600]" />
                  <span>Checkered Flag — P{telemetry.position} Finish</span>
                </h2>
              </div>
              <div className="text-right space-y-1">
                {championshipContext && (
                  <div className="font-display text-sm font-bold text-amber-400 flex items-center justify-end gap-1">
                    <Trophy className="w-4 h-4" />
                    <span>+{playerPointsEarned} PTS</span>
                  </div>
                )}
                {telemetry.fastestLapDriverCode && (
                  <div className="font-mono-tabular text-xs text-purple-300">
                    FL: {telemetry.fastestLapDriverCode} · {formatLapTime(telemetry.fastestLapMs)}
                  </div>
                )}
              </div>
            </div>

            {telemetry.penaltySeconds > 0 && (
              <div className="px-6 py-2 bg-red-950/50 border-b border-red-500/30 text-xs text-red-200 flex items-center justify-between">
                <span>FIA Steward Penalties Applied</span>
                <span className="font-mono-tabular font-bold">+{telemetry.penaltySeconds}s</span>
              </div>
            )}

            <div className="flex-1 overflow-y-auto divide-y divide-white/5 px-6">
              {telemetry.standings.map((row, idx) => {
                let pts = idx < FIA_POINTS.length ? FIA_POINTS[idx] : 0;
                const hasFl = telemetry.fastestLapDriverCode === row.code && row.position <= 10;
                if (hasFl) pts += 1;
                return (
                  <div
                    key={row.driverId}
                    className={`flex items-center justify-between py-2.5 text-sm ${
                      row.isPlayer
                        ? 'text-white font-semibold bg-[#E10600]/15 -mx-3 px-3 rounded'
                        : 'text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="font-mono-tabular w-6 text-right text-slate-400">
                        {row.position}
                      </span>
                      <span
                        className="w-1.5 h-4 rounded-xs"
                        style={{ backgroundColor: row.teamColor }}
                      />
                      <span className="font-display font-bold w-10">{row.code}</span>
                      <span>{row.name}</span>
                      {hasFl && (
                        <span className="font-mono-tabular text-[11px] text-purple-300">
                          FL +1
                        </span>
                      )}
                      {row.penaltySeconds > 0 && (
                        <span className="font-mono-tabular text-[11px] text-red-400">
                          +{row.penaltySeconds}s
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-5 font-mono-tabular text-xs">
                      <span className="text-slate-400">
                        Stops: {row.pitStops} ({row.compoundsUsed.map((c) => c[0]).join('→')})
                      </span>
                      <span className="w-14 text-right">
                        {row.position === 1 ? 'WINNER' : `+${row.gapSeconds.toFixed(1)}s`}
                      </span>
                      <span className="w-10 text-right text-amber-400 font-semibold">
                        {pts > 0 ? `+${pts}` : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex items-center justify-end gap-3 bg-[#0B0D11]">
              {!championshipContext && (
                <button
                  type="button"
                  onClick={onRestartRace}
                  className="px-4 py-2 rounded-lg border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white transition-colors"
                >
                  Race Again
                </button>
              )}
              <button
                type="button"
                onClick={onExitToPaddock}
                className="px-5 py-2 rounded-lg bg-[#E10600] hover:bg-red-600 text-sm font-semibold text-white transition-colors"
              >
                {championshipContext
                  ? championshipContext.isFinalRound
                    ? 'View Championship Finale'
                    : 'Advance to Next Round'
                  : 'Return to Paddock'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
