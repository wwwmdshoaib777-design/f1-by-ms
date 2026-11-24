import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { getDriverById, getTeamById } from '../data/f1Roster';
import { buildF1CarModel, F1CarRig } from '../engine/f1CarModel';
import {
  createStudioRenderer,
  detectSoftwareWebGL,
  scheduleAfterSoftwareDraw,
} from '../engine/webglUtils';
import { TyreCompound } from '../types/f1';

interface GaragePreviewCanvasProps {
  driverId: string;
  compound: TyreCompound;
}

export default function GaragePreviewCanvas({
  driverId,
  compound,
}: GaragePreviewCanvasProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const carRigRef = useRef<F1CarRig | null>(null);
  const isSoftwareRef = useRef(false);

  // Mount WebGL scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    isSoftwareRef.current = isSoftwareGl;
    const renderer = createStudioRenderer(container, isSoftwareGl);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0e1118);
    scene.fog = new THREE.FogExp2(0x0e1118, 0.045);
    sceneRef.current = scene;

    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    const camera = new THREE.PerspectiveCamera(
      36,
      (container.clientWidth || 600) / (container.clientHeight || 340),
      0.1,
      100,
    );
    camera.position.set(3.45, 1.48, 4.05);
    camera.lookAt(0, 0.42, 0.15);

    // 3-point studio motorsport lighting
    const hemi = new THREE.HemisphereLight(0xcbd5e1, 0x0f172a, 0.78);
    scene.add(hemi);

    const keyLight = new THREE.DirectionalLight(0xfff5e8, 2.5);
    keyLight.position.set(5, 8, 5);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.bias = -0.0005;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.35);
    rimLight.position.set(-6, 3, -5);
    scene.add(rimLight);

    // Sleek dark turntable plinth
    const plinthGeo = new THREE.CylinderGeometry(3.4, 3.6, 0.14, 48);
    const plinthMat = new THREE.MeshStandardMaterial({
      color: 0x161b24,
      roughness: 0.35,
      metalness: 0.5,
    });
    const plinth = new THREE.Mesh(plinthGeo, plinthMat);
    plinth.position.y = -0.07;
    plinth.receiveShadow = !isSoftwareGl;
    scene.add(plinth);

    const ringGeo = new THREE.RingGeometry(3.32, 3.4, 48);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xe10600 });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.y = 0.005;
    scene.add(ring);

    const floorGeo = new THREE.PlaneGeometry(40, 40);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0b0d12,
      roughness: 0.65,
      metalness: 0.25,
    });
    const floor = new THREE.Mesh(floorGeo, floorMat);
    floor.position.y = -0.14;
    scene.add(floor);

    const driver = getDriverById(driverId);
    const team = getTeamById(driver.teamId);
    const rig = buildF1CarModel(team, driver, compound, !isSoftwareGl);
    rig.root.rotation.y = 0.55;
    scene.add(rig.root);
    carRigRef.current = rig;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    let dragging = false;
    let lastX = 0;
    const onPointerDown = (e: PointerEvent) => {
      dragging = true;
      lastX = e.clientX;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragging || !carRigRef.current) return;
      const dx = e.clientX - lastX;
      lastX = e.clientX;
      carRigRef.current.root.rotation.y += dx * 0.01;
    };
    const onPointerUp = () => {
      dragging = false;
    };
    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const dt = Math.min(0.05, clock.getDelta());
      if (carRigRef.current && !dragging) {
        carRigRef.current.root.rotation.y += dt * 0.28;
      }
      renderer.render(scene, camera);
      if (isSoftwareGl) {
        scheduleAfterSoftwareDraw(renderer, (id) => {
          frameId = id;
        }, tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    };

    tick();

    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth || 600;
      const h = container.clientHeight || 340;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    const ro = new ResizeObserver(handleResize);
    ro.observe(container);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      ro.disconnect();
      carRigRef.current?.dispose();
      plinthGeo.dispose();
      plinthMat.dispose();
      ringGeo.dispose();
      ringMat.dispose();
      floorGeo.dispose();
      floorMat.dispose();
      renderer.dispose();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []);

  // Swap car livery & compound when selection changes
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    const prevYaw = carRigRef.current ? carRigRef.current.root.rotation.y : 0.55;
    if (carRigRef.current) {
      scene.remove(carRigRef.current.root);
      carRigRef.current.dispose();
    }
    const driver = getDriverById(driverId);
    const team = getTeamById(driver.teamId);
    const nextRig = buildF1CarModel(team, driver, compound, !isSoftwareRef.current);
    nextRig.root.rotation.y = prevYaw;
    scene.add(nextRig.root);
    carRigRef.current = nextRig;
  }, [driverId, compound]);

  return (
    <div
      ref={mountRef}
      title="Drag to rotate 3D F1 car"
      className="relative w-full h-full min-h-[280px] overflow-hidden rounded-lg border border-white/10 bg-[#0E1118] cursor-grab active:cursor-grabbing"
    />
  );
}
