import { useMemo, useState } from 'react';
import {
  Award,
  Check,
  ChevronRight,
  Flag,
  Play,
  RotateCcw,
  Sliders,
  Timer,
  Trophy,
} from 'lucide-react';
import { F1_CIRCUITS, getCircuitById } from '../data/f1Circuits';
import { F1_DRIVERS, F1_TEAMS, getDriverById, getTeamById } from '../data/f1Roster';
import { TrackSpline } from '../engine/trackMath';
import { formatLapTime } from '../engine/webglUtils';
import {
  ChampionshipSeason,
  ControlSettings,
  Difficulty,
  RaceMode,
  RaceSettings,
  TyreCompound,
} from '../types/f1';
import GaragePreviewCanvas from './GaragePreviewCanvas';

interface PaddockMenuProps {
  season: ChampionshipSeason;
  practiceSettings: RaceSettings;
  controlSettings: ControlSettings;
  onUpdatePracticeSettings: (patch: Partial<RaceSettings>) => void;
  onUpdateControlSettings: (patch: Partial<ControlSettings>) => void;
  onStartChampionshipSession: (
    mode: RaceMode,
    compound: TyreCompound,
    gridSlot?: number,
  ) => void;
  onSkipQualifying: () => void;
  onStartPracticeSession: () => void;
  onStartNewSeason: (driverId: string, difficulty: Difficulty, raceLaps: number) => void;
}

type PaddockTab = 'championship' | 'practice' | 'drivers' | 'controls';
type StandingsSubTab = 'drivers' | 'constructors' | 'results';

export default function PaddockMenu({
  season,
  practiceSettings,
  controlSettings,
  onUpdatePracticeSettings,
  onUpdateControlSettings,
  onStartChampionshipSession,
  onSkipQualifying,
  onStartPracticeSession,
  onStartNewSeason,
}: PaddockMenuProps) {
  const [activeTab, setActiveTab] = useState<PaddockTab>('championship');
  const [standingsTab, setStandingsTab] = useState<StandingsSubTab>('drivers');
  const [champCompound, setChampCompound] = useState<TyreCompound>('SOFT');
  const [showNewSeasonWizard, setShowNewSeasonWizard] = useState(false);

  // New Season Wizard drafts
  const [draftDriverId, setDraftDriverId] = useState(season.driverId);
  const [draftDifficulty, setDraftDifficulty] = useState<Difficulty>(season.difficulty);
  const [draftLaps, setDraftLaps] = useState<number>(season.raceLaps);

  const champDriver = getDriverById(season.driverId);
  const champTeam = getTeamById(champDriver.teamId);
  const currentRoundCircuitId =
    season.calendarCircuitIds[
      Math.min(season.currentRoundIndex, season.calendarCircuitIds.length - 1)
    ];
  const currentRoundCircuit = getCircuitById(currentRoundCircuitId);

  const practiceCircuit = getCircuitById(practiceSettings.circuitId);
  const practiceDriver = getDriverById(practiceSettings.driverId);
  const practiceTeam = getTeamById(practiceDriver.teamId);

  const showcaseDriverId =
    activeTab === 'championship' ? season.driverId : practiceSettings.driverId;
  const showcaseCompound =
    activeTab === 'championship' ? champCompound : practiceSettings.startingTyre;
  const showcaseDriver = activeTab === 'championship' ? champDriver : practiceDriver;
  const showcaseTeam = activeTab === 'championship' ? champTeam : practiceTeam;

  const circuitOutlines = useMemo(() => {
    const map = new Map<string, ReturnType<TrackSpline['getSvgOutline']>>();
    for (const c of F1_CIRCUITS) {
      map.set(c.id, new TrackSpline(c).getSvgOutline(220, 120, 16));
    }
    return map;
  }, []);

  const sortedDriversStanding = useMemo(() => {
    return [...F1_DRIVERS].sort((a, b) => {
      const ptsA = season.driverPoints[a.id] ?? 0;
      const ptsB = season.driverPoints[b.id] ?? 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      const winsA = season.driverWins[a.id] ?? 0;
      const winsB = season.driverWins[b.id] ?? 0;
      if (winsB !== winsA) return winsB - winsA;
      return b.skillRating - a.skillRating;
    });
  }, [season.driverPoints, season.driverWins]);

  const sortedConstructorsStanding = useMemo(() => {
    return [...F1_TEAMS].sort((a, b) => {
      const ptsA = season.constructorPoints[a.id] ?? 0;
      const ptsB = season.constructorPoints[b.id] ?? 0;
      if (ptsB !== ptsA) return ptsB - ptsA;
      return b.carPerformance - a.carPerformance;
    });
  }, [season.constructorPoints]);

  const playerWdcRank =
    sortedDriversStanding.findIndex((d) => d.id === season.driverId) + 1;
  const playerWdcPts = season.driverPoints[season.driverId] ?? 0;

  const primaryAction = () => {
    if (activeTab === 'practice') {
      onStartPracticeSession();
      return;
    }
    if (season.completed) {
      setActiveTab('championship');
      setShowNewSeasonWizard(true);
      return;
    }
    if (!season.weekend.qualifyingCompleted) {
      onStartChampionshipSession('qualifying', champCompound);
    } else {
      onStartChampionshipSession(
        'grand_prix',
        champCompound,
        season.weekend.qualifyingGridSlot ?? 12,
      );
    }
  };

  const primaryCtaLabel =
    activeTab === 'practice'
      ? `Launch ${practiceSettings.mode === 'practice' ? 'Practice Laps' : practiceSettings.mode === 'qualifying' ? 'Qualifying' : 'Quick Race'}`
      : season.completed
        ? 'Start Next Season'
        : season.weekend.qualifyingCompleted
          ? `Start Round ${season.currentRoundIndex + 1} GP`
          : `Round ${season.currentRoundIndex + 1} Qualifying`;

  return (
    <div className="min-h-screen bg-[#0B0D11] text-slate-100 flex flex-col">
      {/* Clean Three-Zone Top Bar */}
      <header className="border-b border-white/10 bg-[#0E1118] px-6 py-3.5">
        <div className="max-w-[1400px] mx-auto flex items-center justify-between gap-6">
          <span className="font-display text-xl font-bold tracking-tight text-white whitespace-nowrap shrink-0">
            APEX GRID <span className="text-[#E10600]">F1</span>
          </span>

          <nav className="flex items-center gap-6 text-sm font-medium overflow-x-auto">
            {(
              [
                ['championship', 'Championship'],
                ['practice', 'Free Practice'],
                ['drivers', 'Teams & Drivers'],
                ['controls', 'Controls & Settings'],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setActiveTab(id)}
                className={`py-1 border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === id
                    ? 'border-[#E10600] text-white'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>

          <button
            type="button"
            onClick={primaryAction}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#E10600] hover:bg-red-600 text-white text-sm font-semibold transition-colors whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>{primaryCtaLabel}</span>
          </button>
        </div>
      </header>

      {/* Main Workspace */}
      <main className="flex-1 max-w-[1400px] w-full mx-auto px-6 py-6 space-y-6">
        {/* ======================== CHAMPIONSHIP HUB TAB ======================== */}
        {activeTab === 'championship' && (
          <div className="space-y-6">
            {/* Season Banner & 7-Round Calendar Strip */}
            <div className="rounded-xl border border-white/10 bg-[#11141C] p-5 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <div className="text-xs text-slate-400">
                    FIA Formula 1 World Championship · Season {season.seasonNumber}
                  </div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    {season.completed
                      ? `Season ${season.seasonNumber} Complete — Final Classification`
                      : `Round ${season.currentRoundIndex + 1} of ${season.calendarCircuitIds.length} · ${currentRoundCircuit.grandPrixName}`}
                  </h1>
                </div>

                <div className="flex items-center gap-5">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Your WDC Standing</div>
                    <div className="font-mono-tabular text-lg font-bold text-white">
                      P{playerWdcRank}{' '}
                      <span className="text-sm font-normal text-amber-400">
                        · {playerWdcPts} pts
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowNewSeasonWizard((v) => !v)}
                    className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 bg-[#0B0D11] hover:border-white/30 text-xs font-medium text-slate-200 transition-colors"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>New Championship</span>
                  </button>
                </div>
              </div>

              {/* New Season Setup Wizard Drawer */}
              {showNewSeasonWizard && (
                <div className="rounded-xl border border-white/15 bg-[#0B0D11] p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-base font-bold text-white">
                        Configure New Championship Season
                      </h2>
                      <p className="text-xs text-slate-400">
                        Select your seat, race distance, and AI pace for a fresh 7-round title fight.
                      </p>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block">Championship Driver</label>
                      <select
                        value={draftDriverId}
                        onChange={(e) => setDraftDriverId(e.target.value)}
                        className="w-full rounded-lg border border-white/15 bg-[#12161F] px-3 py-2 text-sm text-white focus:outline-none focus:border-[#E10600]"
                      >
                        {F1_DRIVERS.map((d) => (
                          <option key={d.id} value={d.id}>
                            #{d.number} {d.name} ({getTeamById(d.teamId).shortName})
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block">Grand Prix Laps</label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#12161F] border border-white/10">
                        {[3, 5, 10].map((laps) => (
                          <button
                            key={laps}
                            type="button"
                            onClick={() => setDraftLaps(laps)}
                            className={`py-1.5 rounded text-xs font-mono-tabular font-semibold ${
                              draftLaps === laps
                                ? 'bg-white text-slate-950'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {laps} Laps
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block">AI Difficulty</label>
                      <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#12161F] border border-white/10">
                        {(['rookie', 'pro', 'legend'] as Difficulty[]).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setDraftDifficulty(d)}
                            className={`py-1.5 rounded text-xs font-medium capitalize ${
                              draftDifficulty === d
                                ? 'bg-white text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="flex justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={() => setShowNewSeasonWizard(false)}
                      className="px-4 py-2 rounded-lg border border-white/10 text-xs text-slate-300 hover:text-white"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        onStartNewSeason(draftDriverId, draftDifficulty, draftLaps);
                        setShowNewSeasonWizard(false);
                      }}
                      className="px-5 py-2 rounded-lg bg-[#E10600] hover:bg-red-600 text-xs font-semibold text-white"
                    >
                      Launch Season {season.seasonNumber + 1}
                    </button>
                  </div>
                </div>
              )}

              {/* 7-Round Calendar Strip */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5">
                {season.calendarCircuitIds.map((cid, idx) => {
                  const c = getCircuitById(cid);
                  const result = season.roundResults.find((r) => r.roundNumber === idx + 1);
                  const isCurrent = !season.completed && idx === season.currentRoundIndex;
                  return (
                    <div
                      key={cid}
                      className={`rounded-lg border p-3 transition-colors ${
                        isCurrent
                          ? 'border-[#E10600] bg-[#181D2B]'
                          : result
                            ? 'border-emerald-500/30 bg-[#0D1318]'
                            : 'border-white/10 bg-[#0B0D11]'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[11px] font-mono-tabular">
                        <span className={isCurrent ? 'text-[#E10600] font-bold' : 'text-slate-400'}>
                          R{idx + 1}
                        </span>
                        {result ? (
                          <span className="text-emerald-400 font-semibold">
                            P{result.playerPosition} (+{result.playerPointsEarned})
                          </span>
                        ) : isCurrent ? (
                          <span className="text-white font-semibold">ACTIVE</span>
                        ) : (
                          <span className="text-slate-500">NEXT</span>
                        )}
                      </div>
                      <div className="font-display text-xs font-bold text-white mt-1 truncate">
                        {c.city}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">{c.country}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Championship Body: 2-Column Balanced Split */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-7 items-start">
              {/* Left Column (7 cols): Weekend Sessions OR Season Finale + Standings */}
              <div className="lg:col-span-7 space-y-6">
                {season.completed ? (
                  /* Season Finale Champion Podium */
                  <div className="rounded-xl border border-amber-400/40 bg-[#141824] p-6 space-y-5">
                    <div className="flex items-center gap-3">
                      <Trophy className="w-8 h-8 text-amber-400" />
                      <div>
                        <div className="text-xs text-amber-300 font-semibold uppercase tracking-wider">
                          Season {season.seasonNumber} World Champions
                        </div>
                        <h2 className="font-display text-2xl font-bold text-white">
                          {sortedDriversStanding[0].name} Wins the Drivers&apos; Title
                        </h2>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {sortedDriversStanding.slice(0, 3).map((d, idx) => {
                        const t = getTeamById(d.teamId);
                        return (
                          <div
                            key={d.id}
                            className="rounded-lg border border-white/10 bg-[#0B0D11] p-4"
                          >
                            <div className="flex items-center justify-between text-xs text-slate-400">
                              <span className="font-mono-tabular font-bold text-amber-400">
                                P{idx + 1}
                              </span>
                              <span>{t.shortName}</span>
                            </div>
                            <div className="font-display text-base font-bold text-white mt-1">
                              {d.name}
                            </div>
                            <div className="font-mono-tabular text-sm text-slate-300 mt-0.5">
                              {season.driverPoints[d.id] ?? 0} pts · {season.driverWins[d.id] ?? 0} wins
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0B0D11] px-4 py-3 text-sm">
                      <span className="text-slate-300">
                        Constructors&apos; Champion:{' '}
                        <strong className="text-white">
                          {sortedConstructorsStanding[0].name}
                        </strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowNewSeasonWizard(true)}
                        className="px-4 py-2 rounded-lg bg-[#E10600] hover:bg-red-600 text-xs font-semibold text-white"
                      >
                        Start Season {season.seasonNumber + 1}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Current Grand Prix Weekend 3-Stage Flow */
                  <div className="rounded-xl border border-white/10 bg-[#11141C] p-5 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="max-w-md space-y-1">
                        <div className="text-xs text-slate-400">
                          {currentRoundCircuit.country} · {currentRoundCircuit.lengthKm.toFixed(3)} km ·{' '}
                          {currentRoundCircuit.turns} Turns · {season.raceLaps}-Lap Feature Race
                        </div>
                        <h2 className="font-display text-xl font-bold text-white">
                          {currentRoundCircuit.name}
                        </h2>
                        <p className="text-xs text-slate-400 leading-relaxed">
                          {currentRoundCircuit.description}
                        </p>
                      </div>

                      <div className="rounded-lg bg-[#0B0D11] border border-white/10 p-2 shrink-0">
                        {circuitOutlines.get(currentRoundCircuit.id) && (
                          <svg width="160" height="86" viewBox="0 0 220 120">
                            <path
                              d={circuitOutlines.get(currentRoundCircuit.id)!.pathD}
                              fill="none"
                              stroke="#E10600"
                              strokeWidth="5"
                              strokeLinejoin="round"
                            />
                            <circle
                              cx={circuitOutlines.get(currentRoundCircuit.id)!.startPoint.x}
                              cy={circuitOutlines.get(currentRoundCircuit.id)!.startPoint.y}
                              r="4.5"
                              fill="#FFFFFF"
                            />
                          </svg>
                        )}
                      </div>
                    </div>

                    {/* Weekend Progression Steps */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      {/* Stage 1: FP1 Practice */}
                      <div className="rounded-lg border border-white/10 bg-[#0B0D11] p-4 flex flex-col justify-between gap-3">
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-display font-bold text-slate-200">
                              1. FP1 PRACTICE LAPS
                            </span>
                            {season.weekend.practiceCompleted && (
                              <Check className="w-4 h-4 text-emerald-400" />
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {season.weekend.practiceBestLapMs
                              ? `Best Lap ${formatLapTime(season.weekend.practiceBestLapMs)} (${season.weekend.practiceLapsRun}L)`
                              : 'Dial in braking points, kerbs & tyre feel'}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onStartChampionshipSession('practice', champCompound)}
                          className="w-full py-2 px-3 rounded-md border border-white/15 bg-white/5 hover:bg-white/10 text-xs font-semibold text-white transition-colors"
                        >
                          {season.weekend.practiceCompleted ? 'More Practice Laps' : 'Start Practice'}
                        </button>
                      </div>

                      {/* Stage 2: Qualifying */}
                      <div
                        className={`rounded-lg border p-4 flex flex-col justify-between gap-3 ${
                          !season.weekend.qualifyingCompleted
                            ? 'border-[#E10600]/60 bg-[#151926]'
                            : 'border-emerald-500/35 bg-[#0B0D11]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-display font-bold text-white">
                              2. QUALIFYING
                            </span>
                            {season.weekend.qualifyingCompleted && (
                              <span className="font-mono-tabular font-bold text-emerald-400">
                                P{season.weekend.qualifyingGridSlot}
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {season.weekend.qualifyingCompleted
                              ? `Grid P${season.weekend.qualifyingGridSlot} · ${formatLapTime(season.weekend.qualifyingLapMs)}`
                              : '1 flying hot lap to set your Grand Prix grid slot'}
                          </p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <button
                            type="button"
                            onClick={() => onStartChampionshipSession('qualifying', champCompound)}
                            className={`w-full py-2 px-3 rounded-md text-xs font-semibold transition-colors ${
                              !season.weekend.qualifyingCompleted
                                ? 'bg-[#E10600] hover:bg-red-600 text-white'
                                : 'border border-white/15 bg-white/5 hover:bg-white/10 text-slate-200'
                            }`}
                          >
                            {season.weekend.qualifyingCompleted ? 'Re-Run Qualifying' : 'Run Qualifying'}
                          </button>
                          {!season.weekend.qualifyingCompleted && (
                            <button
                              type="button"
                              onClick={onSkipQualifying}
                              className="text-[11px] text-slate-400 hover:text-white transition-colors"
                            >
                              Skip to Race (Start P12)
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Stage 3: Feature Grand Prix */}
                      <div
                        className={`rounded-lg border p-4 flex flex-col justify-between gap-3 ${
                          season.weekend.qualifyingCompleted
                            ? 'border-[#E10600] bg-[#171B29]'
                            : 'border-white/10 bg-[#0B0D11]'
                        }`}
                      >
                        <div>
                          <div className="flex items-center justify-between text-xs">
                            <span className="font-display font-bold text-white">
                              3. GRAND PRIX
                            </span>
                            <Flag className="w-3.5 h-3.5 text-[#E10600]" />
                          </div>
                          <p className="text-[11px] text-slate-400 mt-1">
                            {season.weekend.qualifyingCompleted
                              ? `Starting P${season.weekend.qualifyingGridSlot} · ${season.raceLaps} Laps`
                              : `${season.raceLaps} Laps · 25-18-15 FIA points +1 FL`}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            onStartChampionshipSession(
                              'grand_prix',
                              champCompound,
                              season.weekend.qualifyingGridSlot ?? 12,
                            )
                          }
                          className={`w-full py-2 px-3 rounded-md text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 ${
                            season.weekend.qualifyingCompleted
                              ? 'bg-[#E10600] hover:bg-red-600 text-white'
                              : 'border border-white/15 bg-white/5 hover:bg-white/10 text-white'
                          }`}
                        >
                          <span>Start Grand Prix</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Standings & Round Results Table */}
                <div className="rounded-xl border border-white/10 bg-[#11141C] overflow-hidden">
                  <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div className="flex items-center gap-4 text-xs font-semibold">
                      {(
                        [
                          ['drivers', 'Drivers Championship'],
                          ['constructors', 'Constructors'],
                          ['results', `Round History (${season.roundResults.length})`],
                        ] as const
                      ).map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          onClick={() => setStandingsTab(id)}
                          className={`py-1 border-b-2 transition-colors ${
                            standingsTab === id
                              ? 'border-[#E10600] text-white'
                              : 'border-transparent text-slate-400 hover:text-white'
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {standingsTab === 'drivers' && (
                    <div className="divide-y divide-white/5 max-h-[380px] overflow-y-auto">
                      {sortedDriversStanding.map((d, idx) => {
                        const t = getTeamById(d.teamId);
                        const pts = season.driverPoints[d.id] ?? 0;
                        const wins = season.driverWins[d.id] ?? 0;
                        return (
                          <div
                            key={d.id}
                            className={`flex items-center justify-between px-4 py-2 text-xs ${
                              d.id === season.driverId
                                ? 'bg-[#E10600]/15 text-white font-semibold'
                                : 'text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono-tabular w-5 text-slate-400">
                                {idx + 1}
                              </span>
                              <span
                                className="w-1.5 h-3.5 rounded-xs"
                                style={{ backgroundColor: t.primaryColor }}
                              />
                              <span>{d.name}</span>
                              <span className="text-[11px] text-slate-500">{t.shortName}</span>
                            </div>
                            <div className="flex items-center gap-4 font-mono-tabular">
                              {wins > 0 && (
                                <span className="text-[11px] text-amber-300">{wins}W</span>
                              )}
                              <span className="font-bold text-white w-14 text-right">
                                {pts} pts
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {standingsTab === 'constructors' && (
                    <div className="divide-y divide-white/5">
                      {sortedConstructorsStanding.map((t, idx) => {
                        const pts = season.constructorPoints[t.id] ?? 0;
                        return (
                          <div
                            key={t.id}
                            className={`flex items-center justify-between px-4 py-2.5 text-xs ${
                              t.id === champTeam.id ? 'bg-white/5 text-white font-semibold' : 'text-slate-300'
                            }`}
                          >
                            <div className="flex items-center gap-2.5">
                              <span className="font-mono-tabular w-5 text-slate-400">
                                {idx + 1}
                              </span>
                              <span
                                className="w-1.5 h-3.5 rounded-xs"
                                style={{ backgroundColor: t.primaryColor }}
                              />
                              <span>{t.name}</span>
                            </div>
                            <span className="font-mono-tabular font-bold text-white">
                              {pts} pts
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {standingsTab === 'results' && (
                    <div className="divide-y divide-white/5">
                      {season.roundResults.length === 0 ? (
                        <div className="px-4 py-8 text-center text-xs text-slate-400">
                          No Grands Prix completed yet in Season {season.seasonNumber}.
                        </div>
                      ) : (
                        season.roundResults.map((res) => (
                          <div
                            key={res.roundNumber}
                            className="flex items-center justify-between px-4 py-2.5 text-xs"
                          >
                            <div>
                              <div className="font-display font-bold text-white">
                                R{res.roundNumber} · {res.grandPrixName}
                              </div>
                              <div className="text-[11px] text-slate-400">
                                Winner: {res.winnerName} · Podium {res.podiumCodes.join(' / ')}
                              </div>
                            </div>
                            <div className="text-right font-mono-tabular">
                              <div className="font-bold text-white">
                                You: P{res.playerPosition} (+{res.playerPointsEarned} pts)
                              </div>
                              {res.fastestLapCode && (
                                <div className="text-[11px] text-purple-300">
                                  FL: {res.fastestLapCode} · {formatLapTime(res.fastestLapMs)}
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Right Column (5 cols): 3D Team Car Showroom & Weekend Tyre Strategy */}
              <aside className="lg:col-span-5 space-y-5">
                <div className="rounded-xl border border-white/10 bg-[#11141C] p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-xs text-slate-400">
                        {showcaseTeam.name} · {showcaseTeam.chassis}
                      </div>
                      <div className="font-display text-lg font-bold text-white">
                        #{showcaseDriver.number} {showcaseDriver.name}
                      </div>
                    </div>
                    <span
                      className="w-3 h-8 rounded-xs"
                      style={{ backgroundColor: showcaseTeam.primaryColor }}
                    />
                  </div>

                  <div className="h-[260px]">
                    <GaragePreviewCanvas
                      driverId={showcaseDriverId}
                      compound={showcaseCompound}
                    />
                  </div>

                  {/* Championship Tyre Compound Choice */}
                  <div className="space-y-1.5 pt-1">
                    <label className="text-xs text-slate-400 block">
                      Weekend Tyre Compound Allocation
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(
                        [
                          ['SOFT', '#EF4444', 'Max Grip'],
                          ['MEDIUM', '#FACC15', 'Balanced'],
                          ['HARD', '#E2E8F0', 'Endurance'],
                        ] as [TyreCompound, string, string][]
                      ).map(([comp, color, desc]) => (
                        <button
                          key={comp}
                          type="button"
                          onClick={() => setChampCompound(comp)}
                          className={`py-2 px-2.5 rounded-lg border text-left transition-colors ${
                            champCompound === comp
                              ? 'border-white/50 bg-white/10'
                              : 'border-white/10 bg-[#0B0D11] hover:border-white/25'
                          }`}
                        >
                          <div className="font-display text-xs font-bold" style={{ color }}>
                            {comp}
                          </div>
                          <div className="text-[11px] text-slate-400">{desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-white/10 pt-3 flex items-center justify-between text-xs text-slate-400">
                    <span>Difficulty: <strong className="text-white capitalize">{season.difficulty}</strong></span>
                    <span>Distance: <strong className="text-white font-mono-tabular">{season.raceLaps} Laps</strong></span>
                    <button
                      type="button"
                      onClick={() => setActiveTab('controls')}
                      className="text-slate-300 hover:text-white underline"
                    >
                      Tune Controls
                    </button>
                  </div>
                </div>
              </aside>
            </div>
          </div>
        )}

        {/* ======================== FREE PRACTICE TAB (Repurposed Single-Session Setup) ======================== */}
        {activeTab === 'practice' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <section className="lg:col-span-7 space-y-4">
              <div className="flex items-baseline justify-between">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white">
                    Free Practice &amp; Solo Track Testing
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Pick any circuit to run unlimited practice laps, hot-lap qualifying, or standalone races without affecting Championship points.
                  </p>
                </div>
                <span className="text-xs text-slate-400 font-mono-tabular">
                  {F1_CIRCUITS.length} Circuits
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {F1_CIRCUITS.map((circuit) => {
                  const active = circuit.id === practiceSettings.circuitId;
                  const outline = circuitOutlines.get(circuit.id);
                  const bestRecord = season.bestLapsByCircuit[circuit.id];
                  return (
                    <button
                      key={circuit.id}
                      type="button"
                      onClick={() => onUpdatePracticeSettings({ circuitId: circuit.id })}
                      className={`text-left rounded-xl border p-4 transition-colors ${
                        active
                          ? 'border-[#E10600] bg-[#141824]'
                          : 'border-white/10 bg-[#11141C] hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs text-slate-400 truncate">
                            {circuit.country} · {circuit.city}
                          </div>
                          <div className="font-display text-base font-bold text-white truncate">
                            {circuit.grandPrixName}
                          </div>
                        </div>
                        <span className="font-mono-tabular text-xs text-slate-300 shrink-0">
                          {circuit.lengthKm.toFixed(3)} km
                        </span>
                      </div>

                      <div className="my-3 flex items-center justify-center rounded-lg bg-[#0B0D11] py-2 border border-white/5">
                        {outline && (
                          <svg width="200" height="96" viewBox="0 0 220 120">
                            <path
                              d={outline.pathD}
                              fill="none"
                              stroke={active ? '#E10600' : '#475569'}
                              strokeWidth="4.5"
                              strokeLinejoin="round"
                            />
                            <circle
                              cx={outline.startPoint.x}
                              cy={outline.startPoint.y}
                              r="4"
                              fill="#FFFFFF"
                            />
                          </svg>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-400 font-mono-tabular">
                        <span>
                          {circuit.turns} Turns · {circuit.drsZones.length} DRS
                        </span>
                        <span>
                          {bestRecord
                            ? `PB ${formatLapTime(bestRecord.timeMs)}`
                            : `Rec ${circuit.lapRecord}`}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            <aside className="lg:col-span-5 space-y-5">
              <div className="rounded-xl border border-white/10 bg-[#11141C] p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">
                      {practiceTeam.name} · {practiceTeam.chassis}
                    </div>
                    <div className="font-display text-lg font-bold text-white">
                      #{practiceDriver.number} {practiceDriver.name}
                    </div>
                  </div>
                  <span
                    className="w-3 h-8 rounded-xs"
                    style={{ backgroundColor: practiceTeam.primaryColor }}
                  />
                </div>

                <div className="h-[240px]">
                  <GaragePreviewCanvas
                    driverId={practiceSettings.driverId}
                    compound={practiceSettings.startingTyre}
                  />
                </div>

                <div className="border-t border-white/10 pt-3">
                  <div className="text-xs text-slate-400">Selected Test Track</div>
                  <div className="font-display text-base font-bold text-white">
                    {practiceCircuit.name}
                  </div>
                  <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                    {practiceCircuit.description}
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#11141C] p-5 space-y-4">
                <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                  <Timer className="w-4 h-4 text-[#E10600]" />
                  <span>Practice Session Configuration</span>
                </h2>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">Track Session Mode</label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-[#0B0D11] border border-white/10">
                    {(
                      [
                        ['practice', 'Practice Laps'],
                        ['qualifying', 'Hot Lap'],
                        ['grand_prix', 'Quick Race'],
                      ] as [RaceMode, string][]
                    ).map(([m, label]) => (
                      <button
                        key={m}
                        type="button"
                        onClick={() => onUpdatePracticeSettings({ mode: m })}
                        className={`py-2 px-2 rounded-md text-xs font-semibold transition-colors ${
                          practiceSettings.mode === m
                            ? 'bg-[#E10600] text-white'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {practiceSettings.mode === 'grand_prix' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block">Race Distance</label>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#0B0D11] border border-white/10">
                        {[3, 5, 10].map((laps) => (
                          <button
                            key={laps}
                            type="button"
                            onClick={() => onUpdatePracticeSettings({ totalLaps: laps })}
                            className={`py-1.5 rounded text-xs font-mono-tabular font-semibold ${
                              practiceSettings.totalLaps === laps
                                ? 'bg-white text-slate-950'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {laps}L
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs text-slate-400 block">AI Pace</label>
                      <div className="grid grid-cols-3 gap-1 p-1 rounded-lg bg-[#0B0D11] border border-white/10">
                        {(['rookie', 'pro', 'legend'] as Difficulty[]).map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => onUpdatePracticeSettings({ difficulty: d })}
                            className={`py-1.5 rounded text-xs font-medium capitalize ${
                              practiceSettings.difficulty === d
                                ? 'bg-white text-slate-950 font-semibold'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {d}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">Starting Tyre Compound</label>
                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        ['SOFT', '#EF4444', 'Max Grip'],
                        ['MEDIUM', '#FACC15', 'Balanced'],
                        ['HARD', '#E2E8F0', 'Endurance'],
                      ] as [TyreCompound, string, string][]
                    ).map(([comp, color, desc]) => (
                      <button
                        key={comp}
                        type="button"
                        onClick={() => onUpdatePracticeSettings({ startingTyre: comp })}
                        className={`py-2 px-2.5 rounded-lg border text-left transition-colors ${
                          practiceSettings.startingTyre === comp
                            ? 'border-white/50 bg-white/10'
                            : 'border-white/10 bg-[#0B0D11] hover:border-white/25'
                        }`}
                      >
                        <div className="font-display text-xs font-bold" style={{ color }}>
                          {comp}
                        </div>
                        <div className="text-[11px] text-slate-400">{desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <button
                  type="button"
                  onClick={onStartPracticeSession}
                  className="w-full py-3 px-5 rounded-lg bg-[#E10600] hover:bg-red-600 text-white font-display text-base font-bold tracking-wide transition-colors flex items-center justify-center gap-2"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>
                    Start {practiceCircuit.city}{' '}
                    {practiceSettings.mode === 'practice'
                      ? 'Practice Laps'
                      : practiceSettings.mode === 'qualifying'
                        ? 'Hot Lap'
                        : 'Quick Race'}
                  </span>
                </button>
              </div>
            </aside>
          </div>
        )}

        {/* ======================== TEAMS & DRIVERS TAB ======================== */}
        {activeTab === 'drivers' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <div>
                <h1 className="font-display text-2xl font-bold text-white">
                  Constructors &amp; Official 20-Driver Grid
                </h1>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select your Free Practice car below, or start a new Championship Season in any team seat.
                </p>
              </div>
              <span className="text-xs text-slate-400">10 Teams · 20 Drivers</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {F1_TEAMS.map((team) => {
                const teamDrivers = F1_DRIVERS.filter((d) => d.teamId === team.id);
                return (
                  <div
                    key={team.id}
                    className="rounded-xl border border-white/10 bg-[#11141C] p-4 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-2.5 h-5 rounded-xs shrink-0"
                          style={{ backgroundColor: team.primaryColor }}
                        />
                        <div className="min-w-0">
                          <div className="font-display text-sm font-bold text-white truncate">
                            {team.name}
                          </div>
                          <div className="text-xs text-slate-400">
                            {team.chassis} · {team.powerUnit}
                          </div>
                        </div>
                      </div>
                      <span className="font-mono-tabular text-xs text-slate-400">
                        {Math.round(team.carPerformance * 100)} PWR
                      </span>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      {teamDrivers.map((drv) => {
                        const isPracticeSel = drv.id === practiceSettings.driverId;
                        const isChampSel = drv.id === season.driverId;
                        return (
                          <button
                            key={drv.id}
                            type="button"
                            onClick={() => {
                              onUpdatePracticeSettings({ driverId: drv.id });
                              setDraftDriverId(drv.id);
                            }}
                            className={`flex flex-col justify-between px-3 py-2 rounded-lg border text-left transition-colors ${
                              isPracticeSel
                                ? 'border-[#E10600] bg-[#E10600]/15 text-white'
                                : 'border-white/10 bg-[#0B0D11] text-slate-300 hover:border-white/25'
                            }`}
                          >
                            <div className="flex items-center justify-between w-full">
                              <span className="font-mono-tabular text-xs font-bold text-slate-200">
                                #{drv.number}
                              </span>
                              {isChampSel && (
                                <span className="text-[10px] font-semibold text-amber-400">
                                  CHMP
                                </span>
                              )}
                            </div>
                            <div className="font-display text-xs font-bold truncate mt-1">
                              {drv.name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {drv.flagCode} · {drv.code}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ======================== CONTROLS & SMOOTHNESS SETTINGS TAB ======================== */}
        {activeTab === 'controls' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            <section className="lg:col-span-7 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="font-display text-2xl font-bold text-white flex items-center gap-2.5">
                    <Sliders className="w-6 h-6 text-[#E10600]" />
                    <span>Controls, Smoothness &amp; Settings</span>
                  </h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Fine-tune steering rack damping, high-speed stability, pedal modulation, and camera follow feel.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    onUpdateControlSettings({
                      steeringSensitivity: 1.0,
                      steeringSmoothness: 0.25,
                      highSpeedStability: 0.65,
                      pedalSmoothness: 0.20,
                      cameraSmoothness: 0.20,
                      cameraLookAhead: 0.25,
                      steeringAssist: false,
                      absAssist: true,
                      brakingAssist: false,
                      racingLineAssist: true,
                      autoThrottle: false,
                    })
                  }
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/15 bg-[#11141C] hover:border-white/30 text-xs font-medium text-slate-200 transition-colors"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Reset Defaults</span>
                </button>
              </div>

              {/* Instant Handling Profiles */}
              <div className="rounded-xl border border-white/10 bg-[#11141C] p-4 space-y-3">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Quick Handling Presets
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  {(
                    [
                      [
                        'Raw Direct Sim',
                        'Zero input lag · full manual braking & sharp turn-in',
                        {
                          steeringSensitivity: 1.15,
                          steeringSmoothness: 0.05,
                          highSpeedStability: 0.35,
                          pedalSmoothness: 0.05,
                          cameraSmoothness: 0.05,
                          cameraLookAhead: 0.1,
                          steeringAssist: false,
                          absAssist: false,
                          brakingAssist: false,
                        },
                      ],
                      [
                        'F1 Balanced',
                        'Realistic rack feel · high-speed aero calm',
                        {
                          steeringSensitivity: 1.0,
                          steeringSmoothness: 0.25,
                          highSpeedStability: 0.65,
                          pedalSmoothness: 0.2,
                          cameraSmoothness: 0.2,
                          cameraLookAhead: 0.25,
                          steeringAssist: false,
                          absAssist: true,
                          brakingAssist: false,
                        },
                      ],
                      [
                        'Smooth Pad',
                        'Filtered keyboard/touch inputs · progressive flow',
                        {
                          steeringSensitivity: 0.9,
                          steeringSmoothness: 0.65,
                          highSpeedStability: 0.85,
                          pedalSmoothness: 0.45,
                          cameraSmoothness: 0.55,
                          cameraLookAhead: 0.4,
                          steeringAssist: true,
                          absAssist: true,
                        },
                      ],
                    ] as const
                  ).map(([name, desc, patch]) => {
                    const isMatch =
                      Math.abs(controlSettings.steeringSmoothness - patch.steeringSmoothness) < 0.04 &&
                      Math.abs(controlSettings.steeringSensitivity - patch.steeringSensitivity) < 0.04 &&
                      Math.abs(controlSettings.highSpeedStability - patch.highSpeedStability) < 0.04;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => onUpdateControlSettings({ ...patch })}
                        className={`p-3 rounded-lg border text-left transition-colors ${
                          isMatch
                            ? 'border-[#E10600] bg-[#E10600]/15'
                            : 'border-white/10 bg-[#0B0D11] hover:border-white/25'
                        }`}
                      >
                        <div className="font-display text-xs font-bold text-white">{name}</div>
                        <div className="text-[11px] text-slate-400 mt-1 leading-snug">{desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Precision Controls & Smoothness Sliders */}
              <div className="rounded-xl border border-white/10 bg-[#11141C] p-5 space-y-5">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Steering, Pedals &amp; Camera Smoothness
                </div>

                {(
                  [
                    {
                      key: 'steeringSensitivity',
                      label: 'Steering Sensitivity',
                      desc: 'Overall turn-in bite from tight hairpins (Monaco) to fast chicanes',
                      min: 0.55,
                      max: 1.55,
                      step: 0.05,
                      format: (v: number) => `${v.toFixed(2)}x`,
                      leftHint: '0.55x Calm',
                      rightHint: '1.55x Sharp',
                    },
                    {
                      key: 'steeringSmoothness',
                      label: 'Steering Smoothness (Damping)',
                      desc: 'Filters digital keyboard or tap sharpness; 0% is raw direct rack',
                      min: 0,
                      max: 1,
                      step: 0.05,
                      format: (v: number) => `${Math.round(v * 100)}%`,
                      leftHint: '0% Direct Snap',
                      rightHint: '100% Silky Smooth',
                    },
                    {
                      key: 'highSpeedStability',
                      label: 'High-Speed Stability',
                      desc: 'Progressively steadies steering angle above 220 km/h on straights',
                      min: 0,
                      max: 1,
                      step: 0.05,
                      format: (v: number) => `${Math.round(v * 100)}%`,
                      leftHint: '0% Raw Linear',
                      rightHint: '100% Planted Aero',
                    },
                    {
                      key: 'pedalSmoothness',
                      label: 'Throttle & Brake Smoothness',
                      desc: 'Modulates pedal application speed to tame rear traction & lockups',
                      min: 0,
                      max: 1,
                      step: 0.05,
                      format: (v: number) => `${Math.round(v * 100)}%`,
                      leftHint: '0% Instant',
                      rightHint: '100% Progressive',
                    },
                    {
                      key: 'cameraSmoothness',
                      label: 'Camera Follow Smoothness',
                      desc: 'Controls chase & T-cam tracking stiffness vs fluid weight follow',
                      min: 0,
                      max: 1,
                      step: 0.05,
                      format: (v: number) => `${Math.round(v * 100)}%`,
                      leftHint: '0% Rigid Locked',
                      rightHint: '100% Fluid Follow',
                    },
                    {
                      key: 'cameraLookAhead',
                      label: 'Camera Apex Look-Ahead',
                      desc: 'Pans sightline smoothly toward the corner apex as you turn in',
                      min: 0,
                      max: 1,
                      step: 0.05,
                      format: (v: number) => `${Math.round(v * 100)}%`,
                      leftHint: '0% Fixed Forward',
                      rightHint: '100% Wide Apex View',
                    },
                  ] as const
                ).map((item) => {
                  const val = controlSettings[item.key];
                  return (
                    <div key={item.key} className="space-y-1.5 pb-3 border-b border-white/5 last:border-b-0 last:pb-0">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="text-sm font-semibold text-white">{item.label}</div>
                          <div className="text-xs text-slate-400">{item.desc}</div>
                        </div>
                        <span className="font-mono-tabular text-sm font-bold text-white shrink-0">
                          {item.format(val)}
                        </span>
                      </div>
                      <input
                        type="range"
                        min={item.min}
                        max={item.max}
                        step={item.step}
                        value={val}
                        onChange={(e) =>
                          onUpdateControlSettings({
                            [item.key]: parseFloat(e.target.value),
                          })
                        }
                        className="w-full accent-[#E10600]"
                      />
                      <div className="flex justify-between text-[11px] font-mono-tabular text-slate-500">
                        <span>{item.leftHint}</span>
                        <span>{item.rightHint}</span>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Assists & Pad Mode */}
              <div className="rounded-xl border border-white/10 bg-[#11141C] p-5 space-y-3">
                <div className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Driving Assists &amp; Input Layout
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {(
                    [
                      [
                        'steeringAssist',
                        'Spin Guard Assist',
                        'Prevents extreme spinouts (>40° slide) with zero continuous auto-steering',
                      ],
                      [
                        'absAssist',
                        'Anti-Lock Braking (ABS)',
                        'Prevents wheel lockup & lets you trail-brake into apexes',
                      ],
                      [
                        'autoThrottle',
                        'Auto-Throttle Mode',
                        'Automatically accelerates when not braking (ideal for steering focus)',
                      ],
                      [
                        'brakingAssist',
                        'Corner Braking Assist',
                        'Helps trim excessive entry speed before tight hairpins',
                      ],
                      [
                        'racingLineAssist',
                        '3D Dynamic Racing Line',
                        'Shows optimal apex & braking zones directly on asphalt',
                      ],
                    ] as const
                  ).map(([key, title, desc]) => {
                    const enabled = controlSettings[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => onUpdateControlSettings({ [key]: !enabled })}
                        className={`p-3.5 rounded-lg border text-left transition-colors ${
                          enabled
                            ? 'border-emerald-400/40 bg-emerald-500/10'
                            : 'border-white/10 bg-[#0B0D11] hover:border-white/25'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-white">{title}</span>
                          <span
                            className={`text-xs font-mono-tabular font-bold ${
                              enabled ? 'text-emerald-400' : 'text-slate-500'
                            }`}
                          >
                            {enabled ? 'ON' : 'OFF'}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 mt-1">{desc}</p>
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() =>
                      onUpdateControlSettings({
                        touchControlStyle:
                          controlSettings.touchControlStyle === 'buttons' ? 'slider' : 'buttons',
                      })
                    }
                    className="p-3.5 rounded-lg border border-white/10 bg-[#0B0D11] hover:border-white/25 text-left transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-white">
                        On-Screen Steering Pad
                      </span>
                      <span className="text-xs font-mono-tabular font-bold text-amber-300">
                        {controlSettings.touchControlStyle === 'slider' ? 'SLIDER' : 'BUTTONS'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Switch between L/R buttons or continuous analog drag steering slider
                    </p>
                  </button>
                </div>
              </div>
            </section>

            <aside className="lg:col-span-5 space-y-4">
              <div className="rounded-xl border border-white/10 bg-[#11141C] p-5 space-y-4">
                <h2 className="font-display text-base font-bold text-white flex items-center gap-2">
                  <Award className="w-4 h-4 text-[#E10600]" />
                  <span>Keyboard &amp; Sporting Rules Reference</span>
                </h2>

                <div className="space-y-2 text-xs">
                  {[
                    ['Throttle', 'W or Up Arrow (or Auto-Throttle)'],
                    ['Brake / Hold to Reverse', 'S or Down Arrow'],
                    ['Dedicated Reverse Gear', 'R'],
                    ['Steer Left / Right', 'A / D or Left / Right Arrows'],
                    ['Recover Car to Track', 'Backspace (or HUD Undo icon)'],
                    ['ERS Overtake Boost', 'Space or E'],
                    ['Activate DRS Flap', 'F or Shift (in DRS Zone)'],
                    ['Box / Pit Stop', 'P'],
                    ['Cycle Camera', 'C (T-Cam / Chase / Cockpit / Heli)'],
                    ['Pause & Live Tuning', 'Escape'],
                  ].map(([action, key]) => (
                    <div
                      key={action}
                      className="flex items-center justify-between rounded-lg border border-white/10 bg-[#0B0D11] px-3 py-2"
                    >
                      <span className="text-slate-300">{action}</span>
                      <span className="font-mono-tabular font-semibold text-white">{key}</span>
                    </div>
                  ))}
                </div>
              </div>
            </aside>
          </div>
        )}
      </main>
    </div>
  );
}
