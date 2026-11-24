import * as THREE from 'three';

export function detectSoftwareWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export function createStudioRenderer(
  container: HTMLElement,
  isSoftwareGl: boolean,
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.setSize(container.clientWidth || 800, container.clientHeight || 500);
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  container.appendChild(renderer.domElement);
  return renderer;
}

export function scheduleAfterSoftwareDraw(
  renderer: THREE.WebGLRenderer,
  setHandle: (id: number) => void,
  cb: () => void,
) {
  const gl = renderer.getContext() as WebGL2RenderingContext;
  if (!gl || typeof gl.fenceSync !== 'function') {
    setHandle(window.setTimeout(cb, 80));
    return;
  }
  const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  gl.flush();
  const poll = () => {
    const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
    if (state === gl.UNSIGNALED) {
      setHandle(window.setTimeout(poll, 5));
    } else {
      if (sync) gl.deleteSync(sync);
      setHandle(window.setTimeout(cb, 80));
    }
  };
  setHandle(window.setTimeout(poll, 5));
}

export function formatLapTime(ms: number | null): string {
  if (ms === null || ms <= 0 || !Number.isFinite(ms)) return '--:--.---';
  const totalSec = ms / 1000;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const millis = Math.floor(ms % 1000);
  return `${mins}:${String(secs).padStart(2, '0')}.${String(millis).padStart(3, '0')}`;
}
