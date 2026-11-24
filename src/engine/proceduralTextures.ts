import * as THREE from 'three';
import { TyreCompound } from '../types/f1';

function setAnisotropy(tex: THREE.Texture, renderer?: THREE.WebGLRenderer) {
  if (renderer) {
    tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  }
}

export function createAsphaltTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Realistic worn mineral asphalt with dual dark racing-line rubber groove
  ctx.fillStyle = '#22262e';
  ctx.fillRect(0, 0, 1024, 1024);

  const groove = ctx.createLinearGradient(0, 0, 1024, 0);
  groove.addColorStop(0, 'rgba(10, 12, 16, 0.36)');
  groove.addColorStop(0.14, 'rgba(42, 46, 56, 0.08)');
  groove.addColorStop(0.34, 'rgba(8, 10, 14, 0.48)');
  groove.addColorStop(0.5, 'rgba(20, 24, 30, 0.20)');
  groove.addColorStop(0.66, 'rgba(8, 10, 14, 0.48)');
  groove.addColorStop(0.86, 'rgba(42, 46, 56, 0.08)');
  groove.addColorStop(1, 'rgba(10, 12, 16, 0.36)');
  ctx.fillStyle = groove;
  ctx.fillRect(0, 0, 1024, 1024);

  // Fine stone aggregate grain + subtle rubber marbling
  for (let i = 0; i < 82000; i++) {
    const x = Math.random() * 1024;
    const y = Math.random() * 1024;
    const shade = 22 + Math.floor(Math.random() * 44);
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
    ctx.fillRect(x, y, 1.4, 2.0);
  }

  // Subtle longitudinal paving machine seams
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(340, 0, 2, 1024);
  ctx.fillRect(682, 0, 2, 1024);

  // Crisp FIA white track edge lines
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(24, 0, 18, 1024);
  ctx.fillRect(982, 0, 18, 1024);

  // Outer weathered asphalt shoulder
  ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
  ctx.fillRect(0, 0, 24, 1024);
  ctx.fillRect(1000, 0, 24, 1024);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createAsphaltBumpTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#808080';
  ctx.fillRect(0, 0, 512, 512);

  for (let i = 0; i < 32000; i++) {
    const v = 70 + Math.floor(Math.random() * 120);
    ctx.fillStyle = `rgb(${v},${v},${v})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 1.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createAstroturfTexture(
  turfHex = '#14532d',
  accentHex = '#166534',
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = turfHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let y = 0; y < 256; y += 16) {
    ctx.fillStyle = (y / 16) % 2 === 0 ? accentHex : turfHex;
    ctx.fillRect(0, y, 256, 16);
  }
  for (let i = 0; i < 3000; i++) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createRunoffTexture(
  stripeColor = '#b91c1c',
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#292d36';
  ctx.fillRect(0, 0, 256, 256);

  // High-friction painted FIA runoff stripes (Paul Ricard / Monza / Spa style)
  ctx.fillStyle = stripeColor;
  for (let y = -256; y < 512; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(256, y + 128);
    ctx.lineTo(256, y + 148);
    ctx.lineTo(0, y + 20);
    ctx.closePath();
    ctx.fill();
  }

  // Subtle grit over stripes
  for (let i = 0; i < 3500; i++) {
    ctx.fillStyle = 'rgba(15, 18, 24, 0.28)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createGravelTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#7c6b53';
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 9000; i++) {
    const shade = Math.random();
    ctx.fillStyle =
      shade < 0.33 ? '#9a866a' : shade < 0.66 ? '#63533f' : '#b29c7d';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createKerbTexture(
  primary = '#dc2626',
  secondary = '#f8fafc',
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const stripeH = 64;
  for (let y = 0; y < 512; y += stripeH) {
    ctx.fillStyle = (y / stripeH) % 2 === 0 ? primary : secondary;
    ctx.fillRect(0, y, 128, stripeH);
  }

  // Tyre rubber scuffs along the apex
  ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
  ctx.fillRect(0, 0, 32, 512);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.08)';
  ctx.fillRect(32, 0, 28, 512);

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createStartFinishTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 512, 256);

  const cell = 32;
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 16; col++) {
      ctx.fillStyle = (row + col) % 2 === 0 ? '#f8fafc' : '#0f172a';
      ctx.fillRect(col * cell, 64 + row * cell, cell, cell);
    }
  }

  ctx.fillStyle = '#e10600';
  ctx.fillRect(0, 54, 512, 10);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createBrakingBoardTexture(meters: number, renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(0, 0, 256, 192);
  ctx.strokeStyle = '#e10600';
  ctx.lineWidth = 14;
  ctx.strokeRect(7, 7, 242, 178);

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 104px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(meters), 128, 102);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createSponsorBannerTexture(
  label: string,
  bgHex = '#0f172a',
  accentHex = '#e10600',
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 512, 128);
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 114, 512, 14);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 46px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createContactShadowTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(128, 128, 18, 128, 128, 124);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.82)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.42)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createCarbonWeaveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#111317';
  ctx.fillRect(0, 0, 128, 128);

  const step = 8;
  for (let y = 0; y < 128; y += step) {
    for (let x = 0; x < 128; x += step) {
      const diag = ((x + y) / step) % 2 === 0;
      ctx.fillStyle = diag ? '#1c2028' : '#0c0e12';
      ctx.fillRect(x, y, step - 1, step - 1);
      ctx.fillStyle = diag ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(x + 1, y + 1, step - 3, 2);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(6, 6);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTeamLiveryTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  teamShortName: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 512, 256);

  // Sleek aerodynamic upper & lower sidepod contrast sweep (Monoposto-style)
  ctx.fillStyle = secondaryHex;
  ctx.beginPath();
  ctx.moveTo(0, 196);
  ctx.bezierCurveTo(180, 180, 320, 95, 512, 58);
  ctx.lineTo(512, 256);
  ctx.lineTo(0, 256);
  ctx.closePath();
  ctx.fill();

  // Sharp neon/team accent pinstripe along the downwash ridge
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(0, 192);
  ctx.bezierCurveTo(180, 176, 320, 91, 512, 54);
  ctx.stroke();

  // Cooling louver gills near rear sidepod shoulder
  ctx.fillStyle = 'rgba(8, 10, 14, 0.72)';
  for (let i = 0; i < 6; i++) {
    ctx.fillRect(110 + i * 16, 48 + i * 3, 7, 34);
  }

  // Crisp team branding wordmark along sidepod flank
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 40px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName.toUpperCase(), 268, 128);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSteeringWheelScreenTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, 256, 160);

  // Top RPM LED bar (5 green, 5 red, 5 blue)
  for (let i = 0; i < 15; i++) {
    ctx.fillStyle = i < 5 ? '#22c55e' : i < 10 ? '#ef4444' : '#3b82f6';
    ctx.beginPath();
    ctx.arc(16 + i * 16, 16, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Central Gear & Delta OLED Screen
  ctx.fillStyle = '#111827';
  ctx.fillRect(38, 34, 180, 108);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 3;
  ctx.strokeRect(38, 34, 180, 108);

  ctx.fillStyle = '#38bdf8';
  ctx.font = 'bold 18px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('ERS 94%', 48, 56);

  ctx.fillStyle = '#22c55e';
  ctx.textAlign = 'right';
  ctx.fillText('DRS', 208, 56);

  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 54px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('8', 128, 114);

  // Rotary dials on sides
  const dialColors = ['#ef4444', '#facc15', '#38bdf8'];
  dialColors.forEach((col, i) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(18, 54 + i * 38, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(238, 54 + i * 38, 9, 0, Math.PI * 2);
    ctx.fill();
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function drawCurvedArcText(
  ctx: CanvasRenderingContext2D,
  text: string,
  cx: number,
  cy: number,
  radius: number,
  centerAngle: number,
  charSpacingRad: number,
  flipBottom = false,
) {
  const totalSpan = (text.length - 1) * charSpacingRad;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const angle = flipBottom
      ? centerAngle + totalSpan * 0.5 - i * charSpacingRad
      : centerAngle - totalSpan * 0.5 + i * charSpacingRad;
    ctx.save();
    ctx.translate(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
    ctx.rotate(angle + (flipBottom ? -Math.PI / 2 : Math.PI / 2));
    ctx.fillText(ch, 0, 0);
    ctx.restore();
  }
}

export function createTyreSidewallTexture(compound: TyreCompound): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d')!;

  // Smooth vulcanized F1 racing rubber base (exposed 3D sidewall sits cleanly in r = 337..508)
  ctx.fillStyle = '#14171d';
  ctx.fillRect(0, 0, 1024, 1024);

  const rad = ctx.createRadialGradient(512, 512, 320, 512, 512, 510);
  rad.addColorStop(0, '#101318');
  rad.addColorStop(0.24, '#222631');
  rad.addColorStop(0.62, '#1b1f28');
  rad.addColorStop(0.92, '#13161c');
  rad.addColorStop(1, '#0e1015');
  ctx.fillStyle = rad;
  ctx.beginPath();
  ctx.arc(512, 512, 510, 0, Math.PI * 2);
  ctx.fill();

  // Subtle moulded rubber bead & shoulder ribs
  for (const rRib of [348, 360, 482, 496]) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(512, 512, rRib, 0, Math.PI * 2);
    ctx.stroke();
  }

  const ringColor =
    compound === 'SOFT' ? '#ff2424' : compound === 'MEDIUM' ? '#ffd60a' : '#f8fafc';

  // Monoposto / Pirelli P-Zero dual thick compound arcs across left & right sidewall windows
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 28;
  ctx.lineCap = 'butt';
  ctx.beginPath();
  ctx.arc(512, 512, 422, -Math.PI * 0.25, Math.PI * 0.25);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(512, 512, 422, Math.PI * 0.75, Math.PI * 1.25);
  ctx.stroke();

  // Inner thin compound pinstripe bordering the 18-inch forged rim lip
  ctx.strokeStyle = ringColor;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(512, 512, 366, 0, Math.PI * 2);
  ctx.stroke();

  // Crisp compound-colored curved PIRELLI & P ZERO lettering in top & bottom arc windows
  ctx.fillStyle = ringColor;
  ctx.font = 'italic 900 44px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  drawCurvedArcText(ctx, 'PIRELLI', 512, 512, 422, -Math.PI / 2, 0.132, false);
  drawCurvedArcText(ctx, 'P ZERO', 512, 512, 422, Math.PI / 2, 0.132, true);

  // Subtle tyre spec shoulder stamps
  ctx.fillStyle = 'rgba(203, 213, 225, 0.28)';
  ctx.font = 'bold 16px sans-serif';
  drawCurvedArcText(ctx, '305/720-18', 512, 512, 468, 0, 0.042, false);
  drawCurvedArcText(ctx, 'P ZERO F1', 512, 512, 468, Math.PI, 0.042, true);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createAeroWheelCoverTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Satin dark carbon-slate Monoposto 18-inch aero wheel cover disc
  const grad = ctx.createRadialGradient(256, 256, 28, 256, 256, 256);
  grad.addColorStop(0, '#101319');
  grad.addColorStop(0.28, '#1e232e');
  grad.addColorStop(0.68, '#151922');
  grad.addColorStop(0.92, '#242a37');
  grad.addColorStop(1, '#12151c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle concentric CNC lathe grooves
  for (let r = 68; r < 246; r += 10) {
    ctx.strokeStyle = r % 20 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.28)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(256, 256, r, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Dark recessed aero cooling slots & outer retaining rivets
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    ctx.strokeStyle = 'rgba(5, 7, 10, 0.85)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(256 + Math.cos(a) * 105, 256 + Math.sin(a) * 105);
    ctx.lineTo(256 + Math.cos(a) * 218, 256 + Math.sin(a) * 218);
    ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.beginPath();
    ctx.arc(256 + Math.cos(a + Math.PI / 10) * 234, 256 + Math.sin(a + Math.PI / 10) * 234, 3.2, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createTyreTreadTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  // Smooth Monoposto-grade slick racing rubber crown (U = axial width, V = circumference)
  const treadGrad = ctx.createLinearGradient(0, 0, 512, 0);
  treadGrad.addColorStop(0, '#11141a');
  treadGrad.addColorStop(0.14, '#1b1f27');
  treadGrad.addColorStop(0.32, '#242933');
  treadGrad.addColorStop(0.5, '#1e222b');
  treadGrad.addColorStop(0.68, '#242933');
  treadGrad.addColorStop(0.86, '#1b1f27');
  treadGrad.addColorStop(1, '#11141a');
  ctx.fillStyle = treadGrad;
  ctx.fillRect(0, 0, 512, 512);

  // Subtle circumferential rubber scrubbing lines so high-speed slick rotation reads smoothly
  for (let i = 0; i < 4500; i++) {
    const shade = 20 + Math.floor(Math.random() * 20);
    ctx.fillStyle = `rgba(${shade},${shade + 2},${shade + 5},0.35)`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 10 + Math.random() * 14);
  }

  // Subtle factory center mold seam + twin wear indicator dimple rows
  ctx.fillStyle = 'rgba(255, 255, 255, 0.045)';
  ctx.fillRect(254, 0, 4, 512);

  for (let y = 24; y < 512; y += 64) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
    ctx.beginPath();
    ctx.arc(146, y, 4, 0, Math.PI * 2);
    ctx.arc(366, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, 3);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createDriverNumberTexture(
  num: number,
  bgHex: string,
  textHex = '#ffffff',
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = bgHex;
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = textHex;
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(num), 64, 68);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createGrassGroundTexture(
  baseHex = '#1e3522',
  speckleHex = '#27442c',
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = baseHex;
  ctx.fillRect(0, 0, 512, 512);

  // Seamless organic mottled grass/earth patches (no tiled grid stripes)
  for (let i = 0; i < 180; i++) {
    const x = Math.random() * 512;
    const y = Math.random() * 512;
    const r = 18 + Math.random() * 44;
    ctx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.025)' : 'rgba(0,0,0,0.035)';
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  for (let i = 0; i < 22000; i++) {
    ctx.fillStyle = i % 3 === 0 ? speckleHex : i % 5 === 0 ? 'rgba(255,255,255,0.03)' : 'rgba(0,0,0,0.11)';
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 2.2, 2.2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(140, 140);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createPitLaneTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1b1e25';
  ctx.fillRect(0, 0, 512, 512);

  // Fine asphalt speckle
  for (let i = 0; i < 14000; i++) {
    const shade = 22 + Math.floor(Math.random() * 24);
    ctx.fillStyle = `rgb(${shade},${shade + 2},${shade + 5})`;
    ctx.fillRect(Math.random() * 512, Math.random() * 512, 1.5, 2);
  }

  // Fast-lane white boundary & pit box red-white stripe border
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(22, 0, 14, 512);
  ctx.fillRect(210, 0, 10, 512);

  ctx.fillStyle = '#e10600';
  for (let y = 0; y < 512; y += 64) {
    ctx.fillRect(468, y, 16, 32);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(468, y + 32, 16, 32);
    ctx.fillStyle = '#e10600';
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createCatchFenceTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 256, 256);

  // Diagonal wire chain-link mesh
  ctx.strokeStyle = 'rgba(203, 213, 225, 0.72)';
  ctx.lineWidth = 2;
  const step = 24;
  for (let i = -256; i < 512; i += step) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 256, 256);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(i + 256, 0);
    ctx.lineTo(i, 256);
    ctx.stroke();
  }

  // Horizontal FIA high-tensile catch cables
  ctx.fillStyle = 'rgba(148, 163, 184, 0.92)';
  for (const y of [16, 72, 128, 184, 240]) {
    ctx.fillRect(0, y, 256, 5);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createBarrierSponsorTexture(
  wallHex: string,
  accentHex: string,
  _label: string,
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const panels = [
    { name: 'ARAMCO', bg: '#0b4f3a', fg: '#ffffff', stripe: '#22c55e' },
    { name: 'PIRELLI', bg: '#111827', fg: '#facc15', stripe: '#e10600' },
    { name: 'ROLEX', bg: '#064e3b', fg: '#fef08a', stripe: '#d97706' },
    { name: 'DHL', bg: '#facc15', fg: '#b91c1c', stripe: '#dc2626' },
    { name: 'CRYPTO.COM', bg: '#0a1936', fg: '#ffffff', stripe: '#38bdf8' },
    { name: 'MSC CRUISES', bg: wallHex, fg: '#f8fafc', stripe: accentHex },
    { name: 'LENOVO', bg: '#111827', fg: '#ffffff', stripe: '#e10600' },
    { name: 'HEINEKEN 0.0', bg: '#0284c7', fg: '#ffffff', stripe: '#e10600' },
  ];

  const pw = 2048 / panels.length;
  panels.forEach((p, idx) => {
    const x0 = idx * pw;
    ctx.fillStyle = p.bg;
    ctx.fillRect(x0, 0, pw, 128);

    ctx.fillStyle = p.stripe;
    ctx.fillRect(x0, 0, pw, 14);
    ctx.fillRect(x0, 114, pw, 14);

    // Concrete/Armco seam rib
    ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
    ctx.fillRect(x0, 0, 4, 128);

    ctx.fillStyle = p.fg;
    ctx.font = 'bold 34px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.name, x0 + pw * 0.5, 66);
  });

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createDrsBoardTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#090d14';
  ctx.fillRect(0, 0, 256, 128);
  ctx.strokeStyle = '#10b981';
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 246, 118);

  ctx.fillStyle = '#22c55e';
  ctx.font = 'bold 74px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('DRS', 128, 68);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createCrowdStandTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 0, 256, 128);

  const colors = ['#ef4444', '#f8fafc', '#38bdf8', '#facc15', '#fb923c', '#22c55e', '#cbd5e1'];
  for (let row = 4; row < 124; row += 10) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, row + 6, 256, 3);
    for (let col = 2; col < 254; col += 6) {
      if (Math.random() > 0.14) {
        ctx.fillStyle = colors[Math.floor(Math.random() * colors.length)];
        ctx.fillRect(col, row, 4, 5);
      }
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createBuildingFacadeTexture(
  isNight: boolean,
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = isNight ? '#0b1220' : '#d8cfc0';
  ctx.fillRect(0, 0, 256, 512);

  const cols = 8;
  const rows = 20;
  const cellW = 256 / cols;
  const cellH = 512 / rows;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * cellW + 4;
      const y = r * cellH + 4;
      const w = cellW - 8;
      const h = cellH - 8;
      if (isNight) {
        const lit = Math.random();
        if (lit > 0.42) {
          ctx.fillStyle =
            lit > 0.85 ? '#38bdf8' : lit > 0.65 ? '#fef08a' : '#e2e8f0';
        } else {
          ctx.fillStyle = '#141e33';
        }
      } else {
        ctx.fillStyle = Math.random() > 0.25 ? '#334155' : '#475569';
      }
      ctx.fillRect(x, y, w, h);
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createPitLimitTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, 256, 256);

  ctx.fillStyle = '#f8fafc';
  ctx.beginPath();
  ctx.arc(128, 128, 108, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = '#e10600';
  ctx.lineWidth = 22;
  ctx.beginPath();
  ctx.arc(128, 128, 96, 0, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#0f172a';
  ctx.font = 'bold 104px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('80', 128, 134);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createWaterTexture(
  deepHex = '#0c3559',
  shimmerHex = '#1d6fa3',
  renderer?: THREE.WebGLRenderer,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = deepHex;
  ctx.fillRect(0, 0, 256, 256);

  for (let i = 0; i < 420; i++) {
    ctx.fillStyle = i % 3 === 0 ? shimmerHex : 'rgba(255,255,255,0.08)';
    ctx.fillRect(Math.random() * 256, Math.random() * 256, 10 + Math.random() * 24, 2);
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(36, 36);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

export function createSkidmarkTexture(renderer?: THREE.WebGLRenderer): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.clearRect(0, 0, 128, 256);

  const grad = ctx.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(8, 10, 12, 0)');
  grad.addColorStop(0.2, 'rgba(8, 10, 12, 0.58)');
  grad.addColorStop(0.82, 'rgba(8, 10, 12, 0.68)');
  grad.addColorStop(1, 'rgba(8, 10, 12, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(24, 0, 18, 256);
  ctx.fillRect(86, 0, 18, 256);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  setAnisotropy(tex, renderer);
  return tex;
}

function getReadableInkColor(hex: string): string {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2) || '00', 16) / 255;
  const g = parseInt(clean.slice(2, 4) || '00', 16) / 255;
  const b = parseInt(clean.slice(4, 6) || '00', 16) / 255;
  const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return lum > 0.62 ? '#0b0f17' : '#ffffff';
}

export function createNoseconeLiveryTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  driverNumber: number,
  teamShortName: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const ctx = canvas.getContext('2d')!;

  const inkColor = getReadableInkColor(primaryHex);
  const topY = 384; // V = 0.25 (top spine) maps to canvasY = (1 - 0.25) * 512 = 384 under flipY=true

  // 1. Primary glossy team paint across entire monocoque shell
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 1024, 512);

  // 2. Sculpted carbon-black / secondary belly wrap covering underside (V = 0.5..1.0 -> canvasY = 0..256)
  //    plus a subtle upward diagonal flank cut along left (y~256) and right (y~512/0) lower cheeks
  ctx.fillStyle = '#0d1017';
  ctx.fillRect(0, 0, 1024, 266);
  ctx.fillRect(0, 502, 1024, 10);

  // Tapered cheek livery slash sweeping back toward cockpit flanks
  ctx.fillStyle = secondaryHex;
  ctx.beginPath();
  ctx.moveTo(0, 260);
  ctx.bezierCurveTo(320, 270, 680, 294, 1024, 306);
  ctx.lineTo(1024, 240);
  ctx.lineTo(0, 240);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(0, 506);
  ctx.bezierCurveTo(320, 496, 680, 472, 1024, 462);
  ctx.lineTo(1024, 512);
  ctx.lineTo(0, 512);
  ctx.closePath();
  ctx.fill();

  // Sharp accent pinstripe outlining the cheek livery split on both flanks
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(48, 265);
  ctx.bezierCurveTo(340, 274, 680, 296, 1024, 308);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(48, 501);
  ctx.bezierCurveTo(340, 492, 680, 470, 1024, 460);
  ctx.stroke();

  // 3. Exposed carbon-fiber nosecone crash tip + accent collar ring
  ctx.fillStyle = '#11151d';
  ctx.fillRect(0, 0, 42, 512);
  ctx.fillStyle = accentHex;
  ctx.fillRect(42, 0, 8, 512);

  // 4. Tapered F1 aerodynamic center spear along the top spine (canvasY = 384)
  ctx.fillStyle = secondaryHex;
  ctx.beginPath();
  ctx.moveTo(50, topY - 12);
  ctx.lineTo(420, topY - 30);
  ctx.lineTo(450, topY);
  ctx.lineTo(420, topY + 30);
  ctx.lineTo(50, topY + 12);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = accentHex;
  ctx.beginPath();
  ctx.moveTo(50, topY - 5);
  ctx.lineTo(395, topY - 11);
  ctx.lineTo(415, topY);
  ctx.lineTo(395, topY + 11);
  ctx.lineTo(50, topY + 5);
  ctx.closePath();
  ctx.fill();

  // Twin crisp sponsor pinstripes flanking upper nose crest
  ctx.fillStyle = inkColor;
  ctx.globalAlpha = 0.88;
  ctx.fillRect(72, topY - 40, 280, 4);
  ctx.fillRect(72, topY + 36, 280, 4);
  ctx.globalAlpha = 1;

  // 5. Constructor emblem near nose pylon bridge (U ~ 0.17 -> z ~ 2.66), upright facing front (+PI/2)
  ctx.save();
  ctx.translate(184, topY);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = '#0b0e14';
  ctx.fillRect(-34, -18, 68, 36);
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(-34, -18, 68, 36);
  ctx.fillStyle = '#ffffff';
  ctx.font = '900 18px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName.toUpperCase().slice(0, 4), 0, 1);
  ctx.restore();

  // 6. Crisp FIA Nose Driver Number on upper front bulkhead bridge (U ~ 0.44 -> z ~ 1.97)
  ctx.save();
  ctx.translate(468, topY);
  ctx.rotate(Math.PI / 2);
  ctx.font = 'italic 900 84px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 10;
  ctx.strokeStyle = 'rgba(8, 11, 18, 0.72)';
  ctx.strokeText(String(driverNumber), 0, 2);
  ctx.fillStyle = inkColor === '#0b0f17' ? '#0f172a' : '#ffffff';
  ctx.fillText(String(driverNumber), 0, 2);
  ctx.restore();

  // 7. Forward bulkhead sponsor wordmark behind driver number (U ~ 0.64 -> z ~ 1.44)
  ctx.save();
  ctx.translate(650, topY);
  ctx.rotate(Math.PI / 2);
  ctx.fillStyle = inkColor;
  ctx.font = '800 22px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName.toUpperCase(), 0, 0);
  ctx.restore();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function createFrontEndplateTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  teamShortName: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  const ink = getReadableInkColor(primaryHex);
  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 256, 128);

  // Diagonal carbon lower corner
  ctx.fillStyle = secondaryHex;
  ctx.beginPath();
  ctx.moveTo(0, 88);
  ctx.lineTo(256, 56);
  ctx.lineTo(256, 128);
  ctx.lineTo(0, 128);
  ctx.closePath();
  ctx.fill();

  // Accent upper edge stripe
  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 256, 16);

  ctx.fillStyle = ink;
  ctx.font = 'italic 900 34px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName.toUpperCase(), 128, 62);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return tex;
}

export function createEngineCoverLiveryTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  teamShortName: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = primaryHex;
  ctx.fillRect(0, 0, 512, 256);

  // Diagonal Monoposto-style rear cowling split
  ctx.fillStyle = secondaryHex;
  ctx.beginPath();
  ctx.moveTo(220, 0);
  ctx.lineTo(512, 0);
  ctx.lineTo(512, 256);
  ctx.lineTo(140, 256);
  ctx.closePath();
  ctx.fill();

  // Bold accent slash separating primary & carbon tail
  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 14;
  ctx.beginPath();
  ctx.moveTo(220, 0);
  ctx.lineTo(140, 256);
  ctx.stroke();

  // Team branding along engine cover flanks (both left and right sides)
  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 28px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName.toUpperCase(), 190, 48);
  ctx.fillText(teamShortName.toUpperCase(), 190, 208);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createRearWingBannerTexture(
  primaryHex: string,
  secondaryHex: string,
  accentHex: string,
  teamShortName: string,
): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = secondaryHex === '#0A0C0E' || secondaryHex === '#141418' ? primaryHex : secondaryHex;
  ctx.fillRect(0, 0, 512, 128);

  ctx.fillStyle = accentHex;
  ctx.fillRect(0, 0, 512, 14);
  ctx.fillRect(0, 114, 512, 14);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 52px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(teamShortName.toUpperCase(), 256, 66);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface LiveWheelScreenController {
  texture: THREE.CanvasTexture;
  update: (
    speedKmh: number,
    gear: number,
    rpm: number,
    ersPercent: number,
    ersDeploying: boolean,
    drsActive: boolean,
    drsAllowed: boolean,
  ) => void;
  dispose: () => void;
}

export function createLiveWheelScreenController(): LiveWheelScreenController {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;

  let lastKey = '';

  const draw = (
    speedKmh: number,
    gear: number,
    rpm: number,
    ersPercent: number,
    ersDeploying: boolean,
    drsActive: boolean,
    drsAllowed: boolean,
  ) => {
    const clampedRpm = Math.max(0, Math.min(1, (rpm - 5400) / 7800));
    const litLeds = Math.round(clampedRpm * 15);
    const ersBucket = Math.round(ersPercent);
    const key = `${speedKmh}|${gear}|${litLeds}|${ersBucket}|${ersDeploying ? 1 : 0}|${drsActive ? 1 : 0}|${drsAllowed ? 1 : 0}`;
    if (key === lastKey) return;
    lastKey = key;

    ctx.fillStyle = '#090d14';
    ctx.fillRect(0, 0, 256, 160);

    // Top 15-LED Shift Light Bar (5 green, 5 red, 5 blue)
    for (let i = 0; i < 15; i++) {
      const active = i < litLeds;
      ctx.fillStyle = !active
        ? '#1e293b'
        : i < 5
          ? '#22c55e'
          : i < 10
            ? '#ef4444'
            : '#38bdf8';
      ctx.beginPath();
      ctx.arc(16 + i * 16, 16, 5.2, 0, Math.PI * 2);
      ctx.fill();
    }

    // Main Central Carbon-Bezel OLED Screen
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(36, 32, 184, 114);
    ctx.strokeStyle = drsActive ? '#22c55e' : ersDeploying ? '#38bdf8' : '#334155';
    ctx.lineWidth = 3;
    ctx.strokeRect(36, 32, 184, 114);

    // Top-left ERS & Top-right DRS status badges
    ctx.fillStyle = ersDeploying ? '#38bdf8' : '#94a3b8';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`ERS ${ersBucket}%`, 46, 50);

    if (drsActive) {
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(158, 40, 52, 20);
      ctx.fillStyle = '#052e16';
    } else if (drsAllowed) {
      ctx.fillStyle = '#14532d';
      ctx.fillRect(158, 40, 52, 20);
      ctx.fillStyle = '#4ade80';
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(158, 40, 52, 20);
      ctx.fillStyle = '#64748b';
    }
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('DRS', 184, 51);

    // Large Central Gear Number + Side KM/H Speed Readout
    ctx.fillStyle = '#facc15';
    ctx.font = 'bold 58px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(gear === 0 ? 'N' : String(gear), 96, 98);

    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 30px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(String(speedKmh), 208, 94);
    ctx.fillStyle = '#94a3b8';
    ctx.font = 'bold 11px sans-serif';
    ctx.fillText('KM/H', 208, 116);

    // Bottom ERS charge bar inside OLED
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(46, 130, 164, 8);
    ctx.fillStyle = ersDeploying ? '#38bdf8' : '#0ea5e9';
    ctx.fillRect(46, 130, (164 * Math.max(0, Math.min(100, ersPercent))) / 100, 8);

    // Colored Rotary Switches on sides
    const dialColors = ['#ef4444', '#facc15', '#38bdf8'];
    dialColors.forEach((col, i) => {
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(17, 52 + i * 38, 8.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(239, 52 + i * 38, 8.5, 0, Math.PI * 2);
      ctx.fill();
    });

    tex.needsUpdate = true;
  };

  draw(0, 0, 9400, 100, false, false, false);

  return {
    texture: tex,
    update: draw,
    dispose() {
      tex.dispose();
    },
  };
}
