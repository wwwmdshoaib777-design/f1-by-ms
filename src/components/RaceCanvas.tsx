import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildF1CarModel, F1CarRig } from '../engine/f1CarModel';
import { PlayerInputs, RaceSimulation } from '../engine/raceEngine';
import { buildTrackEnvironment } from '../engine/trackBuilder';
import {
  createStudioRenderer,
  detectSoftwareWebGL,
  scheduleAfterSoftwareDraw,
} from '../engine/webglUtils';
import { F1AudioEngine } from '../engine/audioEngine';
import { CameraMode, TyreCompound } from '../types/f1';

interface RaceCanvasProps {
  simulation: RaceSimulation;
  cameraMode: CameraMode;
  audioEngine: F1AudioEngine;
  touchInputsRef: React.MutableRefObject<Partial<PlayerInputs>>;
  onTelemetry: (snapshot: ReturnType<RaceSimulation['getTelemetrySnapshot']>) => void;
  onCameraCycle: () => void;
  onTogglePause: () => void;
  onRequestPit: () => void;
}

const _camTargetPos = new THREE.Vector3();
const _camTargetLook = new THREE.Vector3();
const _smoothedLook = new THREE.Vector3();
const _forward = new THREE.Vector3();
const _up = new THREE.Vector3(0, 1, 0);
const _right = new THREE.Vector3();

export default function RaceCanvas({
  simulation,
  cameraMode,
  audioEngine,
  touchInputsRef,
  onTelemetry,
  onCameraCycle,
  onTogglePause,
  onRequestPit,
}: RaceCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const cameraModeRef = useRef<CameraMode>(cameraMode);
  const onTelemetryRef = useRef(onTelemetry);
  const onCameraCycleRef = useRef(onCameraCycle);
  const onTogglePauseRef = useRef(onTogglePause);
  const onRequestPitRef = useRef(onRequestPit);
  const [contextLost, setContextLost] = useState(false);

  cameraModeRef.current = cameraMode;
  onTelemetryRef.current = onTelemetry;
  onCameraCycleRef.current = onCameraCycle;
  onTogglePauseRef.current = onTogglePause;
  onRequestPitRef.current = onRequestPit;

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    const renderer = createStudioRenderer(container, isSoftwareGl);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setContextLost(true);
    };
    const handleContextRestored = () => setContextLost(false);
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      62,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.2,
      4200,
    );

    const builtTrack = buildTrackEnvironment(
      scene,
      simulation.spline,
      renderer,
      isSoftwareGl,
      simulation.settings.racingLineAssist,
    );

    // Build all F1 cars (player rig gets live interactive steering wheel OLED)
    const carRigs = new Map<string, { rig: F1CarRig; lastCompound: TyreCompound }>();
    for (const car of simulation.cars) {
      const rig = buildF1CarModel(
        car.team,
        car.driver,
        car.compound,
        !isSoftwareGl,
        car.isPlayer,
      );
      rig.root.position.copy(car.position);
      rig.root.rotation.y = car.yaw;
      scene.add(rig.root);
      carRigs.set(car.driver.id, { rig, lastCompound: car.compound });
    }

    // Zero-GC Titanium Floor Sparks Particle Pool
    const sparkCount = 90;
    const sparkPositions = new Float32Array(sparkCount * 3);
    const sparkVelocities = new Float32Array(sparkCount * 3);
    const sparkLife = new Float32Array(sparkCount);
    let sparkCursor = 0;

    const sparkGeo = new THREE.BufferGeometry();
    sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
    const sparkMat = new THREE.PointsMaterial({
      color: 0xffb703,
      size: 0.24,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
    sparkPoints.frustumCulled = false;
    scene.add(sparkPoints);

    const spawnSparks = (x: number, y: number, z: number, yaw: number, speed: number, count: number) => {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      for (let s = 0; s < count; s++) {
        const i = sparkCursor;
        sparkCursor = (sparkCursor + 1) % sparkCount;
        const i3 = i * 3;
        sparkPositions[i3] = x - fx * 1.9 + (Math.random() - 0.5) * 0.6;
        sparkPositions[i3 + 1] = y + 0.12 + Math.random() * 0.1;
        sparkPositions[i3 + 2] = z - fz * 1.9 + (Math.random() - 0.5) * 0.6;
        sparkVelocities[i3] = -fx * speed * 0.25 + (Math.random() - 0.5) * 4;
        sparkVelocities[i3 + 1] = 1.6 + Math.random() * 2.8;
        sparkVelocities[i3 + 2] = -fz * speed * 0.25 + (Math.random() - 0.5) * 4;
        sparkLife[i] = 0.25 + Math.random() * 0.25;
      }
    };

    // Zero-GC Tyre Lockup Smoke & Gravel Dust Pool
    const smokeCount = 72;
    const smokePositions = new Float32Array(smokeCount * 3);
    const smokeVelocities = new Float32Array(smokeCount * 3);
    const smokeColors = new Float32Array(smokeCount * 3);
    const smokeLife = new Float32Array(smokeCount);
    for (let i = 0; i < smokeCount; i++) smokePositions[i * 3 + 1] = -999;
    let smokeCursor = 0;

    const smokeGeo = new THREE.BufferGeometry();
    smokeGeo.setAttribute('position', new THREE.BufferAttribute(smokePositions, 3));
    smokeGeo.setAttribute('color', new THREE.BufferAttribute(smokeColors, 3));
    const smokeMat = new THREE.PointsMaterial({
      size: 0.72,
      vertexColors: true,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    });
    const smokePoints = new THREE.Points(smokeGeo, smokeMat);
    smokePoints.frustumCulled = false;
    scene.add(smokePoints);

    const spawnTyreSmoke = (
      x: number,
      y: number,
      z: number,
      yaw: number,
      isGravel: boolean,
    ) => {
      const fx = Math.sin(yaw);
      const fz = Math.cos(yaw);
      const rx = fz;
      const rz = -fx;
      for (const side of [-1, 1]) {
        const i = smokeCursor;
        smokeCursor = (smokeCursor + 1) % smokeCount;
        const i3 = i * 3;
        const axialZ = isGravel ? -1.65 : 1.78;
        smokePositions[i3] = x + fx * axialZ + rx * side * 0.96 + (Math.random() - 0.5) * 0.22;
        smokePositions[i3 + 1] = y + 0.14 + Math.random() * 0.1;
        smokePositions[i3 + 2] = z + fz * axialZ + rz * side * 0.96 + (Math.random() - 0.5) * 0.22;
        smokeVelocities[i3] = (Math.random() - 0.5) * 1.4;
        smokeVelocities[i3 + 1] = 0.8 + Math.random() * 1.3;
        smokeVelocities[i3 + 2] = (Math.random() - 0.5) * 1.4;
        if (isGravel) {
          smokeColors[i3] = 0.72;
          smokeColors[i3 + 1] = 0.62;
          smokeColors[i3 + 2] = 0.46;
        } else {
          smokeColors[i3] = 0.88;
          smokeColors[i3 + 1] = 0.90;
          smokeColors[i3 + 2] = 0.94;
        }
        smokeLife[i] = 0.38 + Math.random() * 0.24;
      }
    };

    const pCar = simulation.playerCar;
    _forward.set(Math.sin(pCar.yaw), 0, Math.cos(pCar.yaw));
    camera.position
      .copy(pCar.position)
      .addScaledVector(_forward, -7.5)
      .add(new THREE.Vector3(0, 2.8, 0));
    _smoothedLook.set(pCar.position.x, pCar.position.y + 0.9, pCar.position.z);
    camera.lookAt(_smoothedLook);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const keys = new Set<string>();
    let drsPressedOnce = false;

    const clearAllInputs = () => {
      keys.clear();
      const t = touchInputsRef.current;
      t.throttle = false;
      t.brake = false;
      t.steerLeft = false;
      t.steerRight = false;
      t.steerAnalog = 0;
      t.reverse = false;
      t.ers = false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      audioEngine.unlock();
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'KeyF' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        drsPressedOnce = true;
      }
      if (e.code === 'KeyC' && !e.repeat) {
        onCameraCycleRef.current();
      }
      if (e.code === 'Escape' && !e.repeat) {
        onTogglePauseRef.current();
      }
      if (e.code === 'KeyP' && !e.repeat) {
        onRequestPitRef.current();
      }
      if (e.code === 'Backspace' && !e.repeat) {
        e.preventDefault();
        simulation.resetPlayerToTrack();
      }
      keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keys.delete(e.code);
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearAllInputs);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;
    let uiTimer = 0;

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, clock.getDelta()));

      const touch = touchInputsRef.current;
      const inputs: PlayerInputs = {
        throttle: keys.has('KeyW') || keys.has('ArrowUp') || Boolean(touch.throttle),
        brake: keys.has('KeyS') || keys.has('ArrowDown') || Boolean(touch.brake),
        steerLeft: keys.has('KeyA') || keys.has('ArrowLeft') || Boolean(touch.steerLeft),
        steerRight: keys.has('KeyD') || keys.has('ArrowRight') || Boolean(touch.steerRight),
        steerAnalog: touch.steerAnalog ?? 0,
        reverse: keys.has('KeyR') || Boolean(touch.reverse),
        ers: keys.has('Space') || keys.has('KeyE') || Boolean(touch.ers),
        drsPressed: drsPressedOnce || Boolean(touch.drsPressed),
      };
      drsPressedOnce = false;
      touch.drsPressed = false;

      simulation.step(dt, inputs);

      builtTrack.setCountdownLights(simulation.countdownLights);
      builtTrack.setFlagState(simulation.flagState);
      audioEngine.handleCountdownLights(simulation.countdownLights);
      if (simulation.consumeDrsChimeFlag()) {
        audioEngine.triggerDrsChime();
      }

      // Sync all 3D car rigs + spawn titanium floor sparks & tyre smoke for all cars
      const pPos = simulation.playerCar.position;
      for (const car of simulation.cars) {
        const entry = carRigs.get(car.driver.id);
        if (!entry) continue;
        const { rig } = entry;

        if (entry.lastCompound !== car.compound) {
          rig.setCompound(car.compound);
          entry.lastCompound = car.compound;
        }

        rig.root.position.copy(car.position);
        rig.root.rotation.order = 'YXZ';
        rig.root.rotation.y = car.yaw;
        rig.root.rotation.x = car.pitch;
        rig.root.rotation.z = car.roll;

        rig.updateMotion(car.speed, car.steerAngle, dt);
        rig.setDrsOpen(car.drsActive, dt);
        rig.setBrakingOrErs(
          car.braking,
          car.ersDeploying,
          car.speed,
        );

        const dx = car.position.x - pPos.x;
        const dz = car.position.z - pPos.z;
        const nearPlayer = car.isPlayer || dx * dx + dz * dz < 13225;

        if (nearPlayer && car.bottoming) {
          spawnSparks(car.position.x, car.position.y, car.position.z, car.yaw, car.speed, car.isPlayer ? 3 : 2);
        }
        if (nearPlayer && (car.lockingUp || (car.offTrack && car.speed > 18))) {
          spawnTyreSmoke(
            car.position.x,
            car.position.y,
            car.position.z,
            car.yaw,
            car.offTrack && !car.lockingUp,
          );
        }
      }

      // Update spark particles
      const sparkAttr = sparkGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < sparkCount; i++) {
        if (sparkLife[i] > 0) {
          sparkLife[i] -= dt;
          const i3 = i * 3;
          sparkVelocities[i3 + 1] -= 9.8 * dt;
          sparkPositions[i3] += sparkVelocities[i3] * dt;
          sparkPositions[i3 + 1] += sparkVelocities[i3 + 1] * dt;
          sparkPositions[i3 + 2] += sparkVelocities[i3 + 2] * dt;
          if (sparkLife[i] <= 0) {
            sparkPositions[i3 + 1] = -999;
          }
        }
      }
      sparkAttr.needsUpdate = true;

      // Update tyre smoke/dust particles
      const smokeAttr = smokeGeo.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < smokeCount; i++) {
        if (smokeLife[i] > 0) {
          smokeLife[i] -= dt;
          const i3 = i * 3;
          smokePositions[i3] += smokeVelocities[i3] * dt;
          smokePositions[i3 + 1] += smokeVelocities[i3 + 1] * dt;
          smokePositions[i3 + 2] += smokeVelocities[i3 + 2] * dt;
          if (smokeLife[i] <= 0) {
            smokePositions[i3 + 1] = -999;
          }
        }
      }
      smokeAttr.needsUpdate = true;

      // Camera Choreography with user-tunable Smoothness, Apex Look-Ahead, FOV & kerb feel
      const player = simulation.playerCar;
      _forward.set(Math.sin(player.yaw), 0, Math.cos(player.yaw));
      _right.crossVectors(_forward, _up).normalize();
      const mode = cameraModeRef.current;

      const camSmooth = THREE.MathUtils.clamp(simulation.settings.cameraSmoothness ?? 0.2, 0, 1);
      const camLookAhead = THREE.MathUtils.clamp(simulation.settings.cameraLookAhead ?? 0.25, 0, 1);

      const speedNorm = Math.min(1, Math.abs(player.speed) / 92);
      const targetFov =
        mode === 'cockpit'
          ? 68 + speedNorm * 9
          : mode === 'tcam'
            ? 64 + speedNorm * 11
            : 58 + speedNorm * 13;
      camera.fov = THREE.MathUtils.damp(camera.fov, targetFov, 12, dt);
      camera.updateProjectionMatrix();

      const shakeAmp =
        (player.onKerb ? 0.025 : 0) +
        (player.offTrack ? 0.032 : 0) +
        (speedNorm > 0.85 ? 0.008 : 0);
      const shakeY = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0;
      const shakeX = shakeAmp > 0 ? (Math.random() - 0.5) * shakeAmp : 0;

      const apexLookOffset = -player.steerAngle * 2.2 * camLookAhead;
      const chaseDamp = THREE.MathUtils.lerp(42.0, 8.5, camSmooth);
      const lookDamp = THREE.MathUtils.lerp(52.0, 11.0, camSmooth);
      const lookAlpha = camSmooth <= 0.02 ? 1 : 1 - Math.exp(-lookDamp * dt);

      if (mode === 'tcam') {
        carRigs.get(player.driver.id)?.rig.setHelmetVisible(true);
        _camTargetPos
          .copy(player.position)
          .addScaledVector(_forward, -0.24)
          .addScaledVector(_up, 1.30);
        _camTargetLook
          .copy(player.position)
          .addScaledVector(_forward, 22)
          .addScaledVector(_right, apexLookOffset * 0.5)
          .addScaledVector(_up, 0.42);
        camera.position.copy(_camTargetPos);
        camera.position.y += shakeY;
        camera.position.x += shakeX;
        _smoothedLook.lerp(_camTargetLook, lookAlpha);
        camera.lookAt(_smoothedLook);
      } else if (mode === 'cockpit') {
        carRigs.get(player.driver.id)?.rig.setHelmetVisible(false);
        _camTargetPos
          .copy(player.position)
          .addScaledVector(_forward, 0.22)
          .addScaledVector(_up, 0.80);
        _camTargetLook
          .copy(player.position)
          .addScaledVector(_forward, 20)
          .addScaledVector(_right, apexLookOffset * 0.45)
          .addScaledVector(_up, 0.48);
        camera.position.copy(_camTargetPos);
        camera.position.y += shakeY;
        _smoothedLook.lerp(_camTargetLook, lookAlpha);
        camera.lookAt(_smoothedLook);
      } else if (mode === 'heli') {
        carRigs.get(player.driver.id)?.rig.setHelmetVisible(true);
        _camTargetPos
          .copy(player.position)
          .addScaledVector(_forward, -16)
          .addScaledVector(_right, 7.5)
          .addScaledVector(_up, 12.5);
        _camTargetLook.copy(player.position).addScaledVector(_forward, 10);
        const heliDamp = THREE.MathUtils.lerp(18.0, 5.5, camSmooth);
        camera.position.lerp(_camTargetPos, 1 - Math.exp(-heliDamp * dt));
        _smoothedLook.lerp(_camTargetLook, 1 - Math.exp(-heliDamp * dt));
        camera.lookAt(_smoothedLook);
      } else {
        carRigs.get(player.driver.id)?.rig.setHelmetVisible(true);
        _camTargetPos
          .copy(player.position)
          .addScaledVector(_forward, -6.3)
          .addScaledVector(_up, 2.2);
        _camTargetLook
          .copy(player.position)
          .addScaledVector(_forward, 16)
          .addScaledVector(_right, apexLookOffset * 0.7)
          .addScaledVector(_up, 0.85);
        const posAlpha = camSmooth <= 0.02 ? 1 : 1 - Math.exp(-chaseDamp * dt);
        camera.position.lerp(_camTargetPos, posAlpha);
        camera.position.y += shakeY * 0.6;
        _smoothedLook.lerp(_camTargetLook, lookAlpha);
        camera.lookAt(_smoothedLook);
      }

      renderer.render(scene, camera);

      uiTimer += dt;
      if (uiTimer >= 0.05) {
        uiTimer = 0;
        const snap = simulation.getTelemetrySnapshot();

        carRigs.get(player.driver.id)?.rig.updateWheelDisplay(
          snap.speedKmh,
          snap.gear,
          snap.rpm,
          snap.ersPercent,
          snap.ersDeploying,
          snap.drsActive,
          snap.drsAllowed,
        );

        audioEngine.updateTelemetry(
          snap.rpm,
          snap.throttle,
          snap.gear,
          snap.ersDeploying,
          snap.phase === 'paused' || snap.phase === 'finished',
        );
        onTelemetryRef.current(snap);
      }

      if (isSoftwareGl) {
        scheduleAfterSoftwareDraw(
          renderer,
          (id) => {
            frameId = id;
          },
          tick,
        );
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || window.innerWidth;
      const h = container.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearAllInputs);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      for (const { rig } of carRigs.values()) {
        rig.dispose();
      }
      sparkGeo.dispose();
      sparkMat.dispose();
      smokeGeo.dispose();
      smokeMat.dispose();
      builtTrack.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, [simulation, audioEngine, touchInputsRef]);

  return (
    <div className="relative w-full h-full bg-[#0B0D11] overflow-hidden">
      <div ref={mountRef} className="w-full h-full" />
      {contextLost && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#0B0D11]/95 text-slate-200 z-30">
          <div className="text-center space-y-2 p-6 border border-white/10 rounded-lg bg-[#12161F]">
            <p className="font-display text-xl font-bold">Graphics Context Interrupted</p>
            <p className="text-sm text-slate-400">Restoring 3D track viewport...</p>
          </div>
        </div>
      )}
    </div>
  );
}
