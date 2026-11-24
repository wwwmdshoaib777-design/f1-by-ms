import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PaddockMenu from './components/PaddockMenu';
import RaceCanvas from './components/RaceCanvas';
import RaceHUD, { ChampionshipHudContext } from './components/RaceHUD';
import { F1_CIRCUITS, getCircuitById } from './data/f1Circuits';
import { FIA_POINTS, getTeamById } from './data/f1Roster';
import { F1AudioEngine } from './engine/audioEngine';
import { PlayerInputs, RaceSimulation } from './engine/raceEngine';
import { TrackSpline } from './engine/trackMath';
import {
  CameraMode,
  ChampionshipSeason,
  ControlSettings,
  Difficulty,
  RaceMode,
  RaceSettings,
  TelemetrySnapshot,
  TyreCompound,
} from './types/f1';

const SEASON_STORAGE_KEY = 'apex_grid_f1_season_v2';
const CONTROLS_STORAGE_KEY = 'apex_grid_f1_controls_v3';

const DEFAULT_CALENDAR = F1_CIRCUITS.map((c) => c.id);

const DEFAULT_CONTROLS: ControlSettings = {
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
  touchControlStyle: 'buttons',
};

function createFreshSeason(
  seasonNumber: number,
  driverId = 'leclerc',
  difficulty: Difficulty = 'pro',
  raceLaps = 5,
  bestLapsByCircuit: Record<string, { timeMs: number; driverCode: string }> = {},
): ChampionshipSeason {
  const firstCircuit = DEFAULT_CALENDAR[0] ?? 'monza';
  return {
    seasonNumber,
    driverId,
    difficulty,
    raceLaps,
    calendarCircuitIds: DEFAULT_CALENDAR,
    currentRoundIndex: 0,
    weekend: {
      circuitId: firstCircuit,
      practiceCompleted: false,
      practiceBestLapMs: null,
      practiceLapsRun: 0,
      qualifyingCompleted: false,
      qualifyingGridSlot: null,
      qualifyingLapMs: null,
    },
    driverPoints: {},
    constructorPoints: {},
    driverWins: {},
    roundResults: [],
    completed: false,
    bestLapsByCircuit,
  };
}

function loadSeason(): ChampionshipSeason {
  try {
    const raw = localStorage.getItem(SEASON_STORAGE_KEY);
    if (!raw) return createFreshSeason(1);
    const parsed = JSON.parse(raw) as Partial<ChampionshipSeason>;
    const base = createFreshSeason(
      parsed.seasonNumber ?? 1,
      parsed.driverId ?? 'leclerc',
      parsed.difficulty ?? 'pro',
      parsed.raceLaps ?? 5,
      parsed.bestLapsByCircuit ?? {},
    );
    const cal =
      Array.isArray(parsed.calendarCircuitIds) && parsed.calendarCircuitIds.length > 0
        ? parsed.calendarCircuitIds
        : DEFAULT_CALENDAR;
    const roundIdx = Math.max(0, Math.min(cal.length - 1, parsed.currentRoundIndex ?? 0));
    return {
      ...base,
      ...parsed,
      calendarCircuitIds: cal,
      currentRoundIndex: roundIdx,
      weekend: {
        ...base.weekend,
        ...(parsed.weekend ?? {}),
        circuitId: parsed.weekend?.circuitId ?? cal[roundIdx],
      },
      driverPoints: parsed.driverPoints ?? {},
      constructorPoints: parsed.constructorPoints ?? {},
      driverWins: parsed.driverWins ?? {},
      roundResults: Array.isArray(parsed.roundResults) ? parsed.roundResults : [],
    };
  } catch {
    return createFreshSeason(1);
  }
}

function loadControls(): ControlSettings {
  try {
    const raw = localStorage.getItem(CONTROLS_STORAGE_KEY);
    if (!raw) return DEFAULT_CONTROLS;
    return { ...DEFAULT_CONTROLS, ...(JSON.parse(raw) as Partial<ControlSettings>) };
  } catch {
    return DEFAULT_CONTROLS;
  }
}

function saveSeason(season: ChampionshipSeason) {
  try {
    localStorage.setItem(SEASON_STORAGE_KEY, JSON.stringify(season));
  } catch {
    // Ignore quota errors
  }
}

const CAMERA_ORDER: CameraMode[] = ['tcam', 'chase', 'cockpit', 'heli'];

export default function App() {
  const [screen, setScreen] = useState<'paddock' | 'racing'>('paddock');
  const [sessionSource, setSessionSource] = useState<'championship' | 'practice'>('championship');
  const [raceRunId, setRaceRunId] = useState(0);
  const [qualifyingGridSlot, setQualifyingGridSlot] = useState<number | undefined>(undefined);
  const [cameraMode, setCameraMode] = useState<CameraMode>('tcam');
  const [isMuted, setIsMuted] = useState(false);

  const [season, setSeason] = useState<ChampionshipSeason>(loadSeason);
  const [controlSettings, setControlSettings] = useState<ControlSettings>(loadControls);

  const [practiceSettings, setPracticeSettings] = useState<RaceSettings>(() => ({
    circuitId: 'monza',
    driverId: 'leclerc',
    mode: 'practice',
    totalLaps: 5,
    startingTyre: 'SOFT',
    difficulty: 'pro',
    ...loadControls(),
  }));

  const [activeRaceSettings, setActiveRaceSettings] = useState<RaceSettings>(practiceSettings);
  const [telemetry, setTelemetry] = useState<TelemetrySnapshot | null>(null);
  const recordedFinishRef = useRef<number>(-1);
  const touchInputsRef = useRef<Partial<PlayerInputs>>({});

  const audioEngine = useMemo(() => new F1AudioEngine(), []);

  useEffect(() => {
    return () => {
      audioEngine.dispose();
    };
  }, [audioEngine]);

  const activeCircuit = useMemo(
    () => getCircuitById(activeRaceSettings.circuitId),
    [activeRaceSettings.circuitId],
  );

  const raceSession = useMemo(() => {
    if (screen !== 'racing') return null;
    const spline = new TrackSpline(activeCircuit);
    const sim = new RaceSimulation(spline, activeRaceSettings, qualifyingGridSlot);
    return { spline, sim };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, raceRunId]);

  const handleUpdatePracticeSettings = useCallback((patch: Partial<RaceSettings>) => {
    setPracticeSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateControlSettings = useCallback(
    (patch: Partial<ControlSettings>) => {
      setControlSettings((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(CONTROLS_STORAGE_KEY, JSON.stringify(next));
        } catch {
          // Ignore storage error
        }
        return next;
      });
      setPracticeSettings((prev) => ({ ...prev, ...patch }));
      setActiveRaceSettings((prev) => ({ ...prev, ...patch }));
      raceSession?.sim.updateControlSettings(patch);
    },
    [raceSession],
  );

  const launchSession = useCallback(
    (source: 'championship' | 'practice', runSettings: RaceSettings, gridSlot?: number) => {
      audioEngine.unlock();
      recordedFinishRef.current = -1;
      setSessionSource(source);
      setActiveRaceSettings({ ...runSettings, ...controlSettings });
      setQualifyingGridSlot(gridSlot);
      setRaceRunId((n) => n + 1);
      setScreen('racing');
    },
    [audioEngine, controlSettings],
  );

  const handleStartChampionshipSession = useCallback(
    (mode: RaceMode, compound: TyreCompound, gridSlot?: number) => {
      const roundCircuitId =
        season.calendarCircuitIds[
          Math.min(season.currentRoundIndex, season.calendarCircuitIds.length - 1)
        ];
      launchSession(
        'championship',
        {
          circuitId: roundCircuitId,
          driverId: season.driverId,
          mode,
          totalLaps: season.raceLaps,
          startingTyre: compound,
          difficulty: season.difficulty,
          ...controlSettings,
        },
        gridSlot,
      );
    },
    [season, controlSettings, launchSession],
  );

  const handleSkipQualifying = useCallback(() => {
    setSeason((prev) => {
      const next: ChampionshipSeason = {
        ...prev,
        weekend: {
          ...prev.weekend,
          qualifyingCompleted: true,
          qualifyingGridSlot: 12,
          qualifyingLapMs: null,
        },
      };
      saveSeason(next);
      return next;
    });
  }, []);

  const handleStartPracticeSession = useCallback(() => {
    launchSession('practice', {
      ...practiceSettings,
      ...controlSettings,
    });
  }, [practiceSettings, controlSettings, launchSession]);

  const handleStartQualifyingFromPractice = useCallback(() => {
    if (sessionSource === 'championship') {
      handleStartChampionshipSession('qualifying', activeRaceSettings.startingTyre);
    } else {
      launchSession('practice', {
        ...activeRaceSettings,
        mode: 'qualifying',
      });
    }
  }, [sessionSource, handleStartChampionshipSession, activeRaceSettings, launchSession]);

  const handleStartGpFromQualifying = useCallback(
    (gridSlot: number) => {
      if (sessionSource === 'championship') {
        handleStartChampionshipSession('grand_prix', activeRaceSettings.startingTyre, gridSlot);
      } else {
        launchSession(
          'practice',
          {
            ...activeRaceSettings,
            mode: 'grand_prix',
          },
          gridSlot,
        );
      }
    },
    [sessionSource, handleStartChampionshipSession, activeRaceSettings, launchSession],
  );

  const handleRestartRace = useCallback(() => {
    audioEngine.unlock();
    recordedFinishRef.current = -1;
    setRaceRunId((n) => n + 1);
  }, [audioEngine]);

  const handleExitToPaddock = useCallback(() => {
    audioEngine.updateTelemetry(5000, 0, 1, false, true);
    setTelemetry(null);
    setScreen('paddock');
  }, [audioEngine]);

  const handleCycleCamera = useCallback(() => {
    setCameraMode((prev) => {
      const idx = CAMERA_ORDER.indexOf(prev);
      return CAMERA_ORDER[(idx + 1) % CAMERA_ORDER.length];
    });
  }, []);

  const handleToggleMute = useCallback(() => {
    audioEngine.unlock();
    const next = !audioEngine.isMuted();
    audioEngine.setMuted(next);
    setIsMuted(next);
  }, [audioEngine]);

  const handleTogglePause = useCallback(() => {
    raceSession?.sim.togglePause();
  }, [raceSession]);

  const handleRequestPit = useCallback(() => {
    raceSession?.sim.requestPitStop();
  }, [raceSession]);

  const handleSelectNextCompound = useCallback(
    (compound: TyreCompound) => {
      raceSession?.sim.setNextPitCompound(compound);
    },
    [raceSession],
  );

  const handleSwapPracticeCompound = useCallback(
    (compound: TyreCompound) => {
      raceSession?.sim.swapPracticeCompound(compound);
    },
    [raceSession],
  );

  const handleResetCarToTrack = useCallback(() => {
    raceSession?.sim.resetPlayerToTrack();
  }, [raceSession]);

  const handleFinishPractice = useCallback(() => {
    raceSession?.sim.finishPracticeSession();
  }, [raceSession]);

  const handleStartNewSeason = useCallback(
    (driverId: string, difficulty: Difficulty, raceLaps: number) => {
      setSeason((prev) => {
        const fresh = createFreshSeason(
          prev.seasonNumber + 1,
          driverId,
          difficulty,
          raceLaps,
          prev.bestLapsByCircuit,
        );
        saveSeason(fresh);
        return fresh;
      });
    },
    [],
  );

  const handleTelemetry = useCallback(
    (snap: TelemetrySnapshot) => {
      setTelemetry(snap);

      if (snap.phase === 'finished' && recordedFinishRef.current !== raceRunId) {
        recordedFinishRef.current = raceRunId;

        setSeason((prev) => {
          const nextBest = { ...prev.bestLapsByCircuit };
          if (snap.bestLapMs !== null) {
            const existing = nextBest[activeCircuit.id];
            if (!existing || snap.bestLapMs < existing.timeMs) {
              const playerEntry = snap.standings.find((s) => s.isPlayer);
              nextBest[activeCircuit.id] = {
                timeMs: snap.bestLapMs,
                driverCode: playerEntry?.code ?? 'YOU',
              };
            }
          }

          let updated: ChampionshipSeason = {
            ...prev,
            bestLapsByCircuit: nextBest,
          };

          if (sessionSource === 'championship') {
            if (activeRaceSettings.mode === 'practice') {
              updated = {
                ...updated,
                weekend: {
                  ...updated.weekend,
                  practiceCompleted: true,
                  practiceLapsRun:
                    updated.weekend.practiceLapsRun + Math.max(1, snap.completedLaps),
                  practiceBestLapMs:
                    snap.bestLapMs !== null &&
                    (updated.weekend.practiceBestLapMs === null ||
                      snap.bestLapMs < updated.weekend.practiceBestLapMs)
                      ? snap.bestLapMs
                      : updated.weekend.practiceBestLapMs,
                },
              };
            } else if (activeRaceSettings.mode === 'qualifying' && raceSession) {
              const lapMs = snap.bestLapMs ?? snap.lastLapMs ?? 42000;
              const adjustedMs = lapMs + snap.penaltySeconds * 1000;
              const poleAvgMs =
                activeCircuit.environment === 'harbor'
                  ? 49
                  : activeCircuit.environment === 'nightcity'
                    ? 54
                    : 67;
              const benchmarkPoleMs = (raceSession.spline.totalLength / poleAvgMs) * 1000;
              const deltaRatio = (adjustedMs - benchmarkPoleMs) / benchmarkPoleMs;
              const gridPos = Math.max(1, Math.min(20, Math.round(1 + deltaRatio * 65)));

              updated = {
                ...updated,
                weekend: {
                  ...updated.weekend,
                  qualifyingCompleted: true,
                  qualifyingGridSlot: gridPos,
                  qualifyingLapMs: lapMs,
                },
              };
            } else if (activeRaceSettings.mode === 'grand_prix') {
              const nextDriverPts = { ...prev.driverPoints };
              const nextTeamPts = { ...prev.constructorPoints };
              const nextWins = { ...prev.driverWins };
              let playerPts = 0;

              snap.standings.forEach((row, idx) => {
                let pts = idx < FIA_POINTS.length ? FIA_POINTS[idx] : 0;
                const hasFastestLap =
                  snap.fastestLapDriverCode === row.code && row.position <= 10;
                if (hasFastestLap) pts += 1;

                if (pts > 0) {
                  nextDriverPts[row.driverId] = (nextDriverPts[row.driverId] ?? 0) + pts;
                  nextTeamPts[row.teamId] = (nextTeamPts[row.teamId] ?? 0) + pts;
                }
                if (row.position === 1) {
                  nextWins[row.driverId] = (nextWins[row.driverId] ?? 0) + 1;
                }
                if (row.isPlayer) {
                  playerPts = pts;
                }
              });

              const winner = snap.standings[0];
              const winnerTeam = getTeamById(winner.teamId);
              const playerRow = snap.standings.find((s) => s.isPlayer);

              const roundResult = {
                roundNumber: prev.currentRoundIndex + 1,
                circuitId: activeCircuit.id,
                grandPrixName: activeCircuit.grandPrixName,
                winnerName: winner.name,
                winnerCode: winner.code,
                winnerTeamColor: winnerTeam.primaryColor,
                podiumCodes: snap.standings.slice(0, 3).map((s) => s.code),
                playerPosition: playerRow?.position ?? snap.position,
                playerPointsEarned: playerPts,
                fastestLapCode: snap.fastestLapDriverCode,
                fastestLapMs: snap.fastestLapMs,
              };

              const nextRoundIndex = prev.currentRoundIndex + 1;
              const seasonFinished = nextRoundIndex >= prev.calendarCircuitIds.length;
              const nextCircuitId = seasonFinished
                ? prev.calendarCircuitIds[prev.currentRoundIndex]
                : prev.calendarCircuitIds[nextRoundIndex];

              updated = {
                ...updated,
                driverPoints: nextDriverPts,
                constructorPoints: nextTeamPts,
                driverWins: nextWins,
                roundResults: [...prev.roundResults, roundResult],
                currentRoundIndex: seasonFinished ? prev.currentRoundIndex : nextRoundIndex,
                completed: seasonFinished,
                weekend: {
                  circuitId: nextCircuitId,
                  practiceCompleted: false,
                  practiceBestLapMs: null,
                  practiceLapsRun: 0,
                  qualifyingCompleted: false,
                  qualifyingGridSlot: null,
                  qualifyingLapMs: null,
                },
              };
            }
          }

          saveSeason(updated);
          return updated;
        });
      }
    },
    [raceRunId, sessionSource, activeRaceSettings.mode, activeCircuit, raceSession],
  );

  const championshipHudContext: ChampionshipHudContext | null = useMemo(() => {
    if (sessionSource !== 'championship') return null;
    const idx = season.calendarCircuitIds.indexOf(activeRaceSettings.circuitId);
    const roundNumber = idx >= 0 ? idx + 1 : season.currentRoundIndex + 1;
    const totalRounds = season.calendarCircuitIds.length;
    return {
      roundNumber,
      totalRounds,
      isFinalRound: roundNumber >= totalRounds,
    };
  }, [sessionSource, season.calendarCircuitIds, season.currentRoundIndex, activeRaceSettings.circuitId]);

  if (screen === 'paddock' || !raceSession) {
    return (
      <PaddockMenu
        season={season}
        practiceSettings={practiceSettings}
        controlSettings={controlSettings}
        onUpdatePracticeSettings={handleUpdatePracticeSettings}
        onUpdateControlSettings={handleUpdateControlSettings}
        onStartChampionshipSession={handleStartChampionshipSession}
        onSkipQualifying={handleSkipQualifying}
        onStartPracticeSession={handleStartPracticeSession}
        onStartNewSeason={handleStartNewSeason}
      />
    );
  }

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#0B0D11]">
      <RaceCanvas
        simulation={raceSession.sim}
        cameraMode={cameraMode}
        audioEngine={audioEngine}
        touchInputsRef={touchInputsRef}
        onTelemetry={handleTelemetry}
        onCameraCycle={handleCycleCamera}
        onTogglePause={handleTogglePause}
        onRequestPit={handleRequestPit}
      />
      {telemetry && (
        <RaceHUD
          circuit={activeCircuit}
          spline={raceSession.spline}
          mode={activeRaceSettings.mode}
          telemetry={telemetry}
          cameraMode={cameraMode}
          isMuted={isMuted}
          controlSettings={controlSettings}
          championshipContext={championshipHudContext}
          touchInputsRef={touchInputsRef}
          onCycleCamera={handleCycleCamera}
          onToggleMute={handleToggleMute}
          onTogglePause={handleTogglePause}
          onRequestPit={handleRequestPit}
          onSelectNextCompound={handleSelectNextCompound}
          onSwapPracticeCompound={handleSwapPracticeCompound}
          onResetCarToTrack={handleResetCarToTrack}
          onFinishPractice={handleFinishPractice}
          onStartQualifyingFromPractice={handleStartQualifyingFromPractice}
          onUpdateControls={handleUpdateControlSettings}
          onRestartRace={handleRestartRace}
          onStartGpFromQualifying={handleStartGpFromQualifying}
          onExitToPaddock={handleExitToPaddock}
        />
      )}
    </div>
  );
}
