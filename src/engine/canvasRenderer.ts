import {
  AudioAnalysisFrame,
  CharacterOverlayElement,
  DEFAULT_PROCEDURAL_ANIMATION,
  EngineConfig,
  IsolatedMotionRegion,
  LipstickStyleConfig,
  MouthAnchorConfig,
  MouthChartStyleId,
  ProceduralAnimationConfig,
  TrackedPoint,
  VISEME_LIBRARY,
  VisemeCode,
} from '../types/studio';

export interface LoadedSpriteImages {
  [key: string]: HTMLImageElement;
}

let filterCanvas: HTMLCanvasElement | null = null;
let filterCtx: CanvasRenderingContext2D | null = null;

// Offscreen canvas for real-time 2D Optical Patch Mouth Tracking
const TRACK_W = 240;
const TRACK_H = 135;
const PATCH_R = 7; // 15x15 template patch
let trackCanvas: HTMLCanvasElement | null = null;
let trackCtx: CanvasRenderingContext2D | null = null;
let referencePatchData: Uint8ClampedArray | null = null;
let lastTrackedTrackSpace: { tx: number; ty: number } | null = null;
let trackHistoryTrail: Array<{ x: number; y: number }> = [];

function ensureTrackCanvas() {
  if (!trackCanvas) {
    trackCanvas = document.createElement('canvas');
    trackCanvas.width = TRACK_W;
    trackCanvas.height = TRACK_H;
    trackCtx = trackCanvas.getContext('2d', { willReadFrequently: true });
  }
  return { trackCanvas, trackCtx };
}

/**
 * Captures the reference visual patch around the user's pinned mouth coordinate
 * on the first set frame so automatic frame-by-frame tracking can follow it!
 */
export function captureMouthTrackingTemplate(
  source: HTMLVideoElement | HTMLImageElement | null,
  config: EngineConfig
): void {
  if (!source) {
    referencePatchData = null;
    lastTrackedTrackSpace = null;
    trackHistoryTrail = [];
    return;
  }

  const { trackCtx: tCtx } = ensureTrackCanvas();
  if (!tCtx) return;

  try {
    tCtx.clearRect(0, 0, TRACK_W, TRACK_H);
    tCtx.drawImage(source, 0, 0, TRACK_W, TRACK_H);

    const charX = config.characterTransform.x * TRACK_W;
    const charY = config.characterTransform.y * TRACK_H;
    const scaleX = TRACK_W / 1280;
    const scaleY = TRACK_H / 720;

    const anchorX = config.mouthTracker.trackAnchorX ?? config.mouthAnchor.offsetX;
    const anchorY = config.mouthTracker.trackAnchorY ?? config.mouthAnchor.offsetY;

    const tx = Math.round(
      charX + anchorX * config.characterTransform.scale * scaleX
    );
    const ty = Math.round(
      charY + anchorY * config.characterTransform.scale * scaleY
    );

    const clampedX = Math.max(PATCH_R + 1, Math.min(TRACK_W - PATCH_R - 2, tx));
    const clampedY = Math.max(PATCH_R + 1, Math.min(TRACK_H - PATCH_R - 2, ty));

    const side = PATCH_R * 2 + 1;
    const patch = tCtx.getImageData(clampedX - PATCH_R, clampedY - PATCH_R, side, side);
    referencePatchData = new Uint8ClampedArray(patch.data);
    lastTrackedTrackSpace = { tx: clampedX, ty: clampedY };
    trackHistoryTrail = [];
  } catch {
    referencePatchData = null;
  }
}

/**
 * Automatically tracks where the pinned mouth region moved in the current video frame
 * using Sum of Absolute Differences (SAD) optical patch matching.
 */
export function computeLiveTrackedMouthOffset(
  video: HTMLVideoElement | null,
  hasVideo: boolean,
  config: EngineConfig
): TrackedPoint {
  const baseLipX =
    config.mouthAnchor.offsetX + (config.mouthAnchor.lipSegmentOffsetX || 0);
  const baseLipY =
    config.mouthAnchor.offsetY + (config.mouthAnchor.lipSegmentOffsetY || 0);

  const baseOffset = {
    offsetX: baseLipX,
    offsetY: baseLipY,
    confidence: 1,
  };

  if (
    !config.mouthTracker.enabled ||
    !hasVideo ||
    !video ||
    video.readyState < 2
  ) {
    return baseOffset;
  }

  if (!referencePatchData || !lastTrackedTrackSpace) {
    captureMouthTrackingTemplate(video, config);
    return baseOffset;
  }

  const { trackCtx: tCtx } = ensureTrackCanvas();
  if (!tCtx) return baseOffset;

  try {
    tCtx.drawImage(video, 0, 0, TRACK_W, TRACK_H);
    const frameData = tCtx.getImageData(0, 0, TRACK_W, TRACK_H).data;

    const searchR = Math.max(6, Math.min(36, Math.round(config.mouthTracker.searchRadiusPx * 0.22)));
    const centerTx = lastTrackedTrackSpace.tx;
    const centerTy = lastTrackedTrackSpace.ty;
    const side = PATCH_R * 2 + 1;

    let bestSad = Number.POSITIVE_INFINITY;
    let bestTx = centerTx;
    let bestTy = centerTy;

    const minX = Math.max(PATCH_R + 1, centerTx - searchR);
    const maxX = Math.min(TRACK_W - PATCH_R - 2, centerTx + searchR);
    const minY = Math.max(PATCH_R + 1, centerTy - searchR);
    const maxY = Math.min(TRACK_H - PATCH_R - 2, centerTy + searchR);

    for (let cy = minY; cy <= maxY; cy += 1) {
      for (let cx = minX; cx <= maxX; cx += 1) {
        let sad = 0;
        let pIdx = 0;

        for (let py = -PATCH_R; py <= PATCH_R; py += 2) {
          const rowOffset = (cy + py) * TRACK_W;
          for (let px = -PATCH_R; px <= PATCH_R; px += 2) {
            const fIdx = (rowOffset + (cx + px)) * 4;
            pIdx = ((py + PATCH_R) * side + (px + PATCH_R)) * 4;

            sad +=
              Math.abs(frameData[fIdx] - referencePatchData[pIdx]) +
              Math.abs(frameData[fIdx + 1] - referencePatchData[pIdx + 1]) +
              Math.abs(frameData[fIdx + 2] - referencePatchData[pIdx + 2]);
          }
        }

        // Small distance regularization so flat regions stay anchored
        const distPenalty = (Math.abs(cx - centerTx) + Math.abs(cy - centerTy)) * 6;
        const totalScore = sad + distPenalty;

        if (totalScore < bestSad) {
          bestSad = totalScore;
          bestTx = cx;
          bestTy = cy;
        }
      }
    }

    const alpha = Math.max(0.15, Math.min(0.85, 1 - config.mouthTracker.smoothing * 0.65));
    const smoothTx = lastTrackedTrackSpace.tx * (1 - alpha) + bestTx * alpha;
    const smoothTy = lastTrackedTrackSpace.ty * (1 - alpha) + bestTy * alpha;
    lastTrackedTrackSpace = { tx: smoothTx, ty: smoothTy };

    const charX = config.characterTransform.x * TRACK_W;
    const charY = config.characterTransform.y * TRACK_H;
    const scaleX = TRACK_W / 1280;
    const scaleY = TRACK_H / 720;
    const charScale = Math.max(0.25, config.characterTransform.scale);

    const trackedOffsetX = Math.round((smoothTx - charX) / (charScale * scaleX));
    const trackedOffsetY = Math.round((smoothTy - charY) / (charScale * scaleY));

    const anchorX = config.mouthTracker.trackAnchorX ?? config.mouthAnchor.offsetX;
    const anchorY = config.mouthTracker.trackAnchorY ?? config.mouthAnchor.offsetY;

    // Motion delta from the independent tracking anchor point applied to the independent lip segment
    const deltaX = trackedOffsetX - anchorX;
    const deltaY = trackedOffsetY - anchorY;

    trackHistoryTrail.push({ x: baseLipX + deltaX, y: baseLipY + deltaY });
    if (trackHistoryTrail.length > 18) {
      trackHistoryTrail.shift();
    }

    return {
      offsetX: baseLipX + deltaX,
      offsetY: baseLipY + deltaY,
      confidence: Math.max(0.4, Math.min(0.99, 1 - bestSad / 45000)),
    };
  } catch {
    return baseOffset;
  }
}

/**
 * Samples the RGB color from the user's uploaded character image near the mouth anchor
 * so the optional Face Skin Patch Mask automatically matches the character's face color!
 */
export function sampleCharacterFaceColor(
  img: HTMLImageElement,
  offsetX: number,
  offsetY: number
): string {
  try {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = 120;
    tempCanvas.height = 120;
    const ctx = tempCanvas.getContext('2d');
    if (!ctx) return '#F3B882';

    const aspect = img.naturalWidth / Math.max(1, img.naturalHeight);
    const drawH = 360;
    const drawW = drawH * aspect;

    // Map stage character-space (offsetX, offsetY) where character center is (0, -20)
    const normX = (offsetX + drawW / 2) / drawW;
    const normY = (offsetY + 20 + drawH / 2) / drawH;

    const sx = Math.max(0, Math.min(119, Math.floor(normX * 120)));
    const sy = Math.max(0, Math.min(119, Math.floor(normY * 120)));

    ctx.drawImage(img, 0, 0, 120, 120);
    // Sample slightly above/beside the mouth center to get clean cheek skin tone rather than dark lip line
    const sampleY = Math.max(0, sy - 6);
    const pixel = ctx.getImageData(sx, sampleY, 1, 1).data;
    if (pixel[3] < 40) return '#F3B882';

    const toHex = (n: number) => n.toString(16).padStart(2, '0');
    return `#${toHex(pixel[0])}${toHex(pixel[1])}${toHex(pixel[2])}`;
  } catch {
    return '#F3B882';
  }
}

function applyDeterministicVideoCartoonFilter(
  ctx: CanvasRenderingContext2D,
  video: HTMLVideoElement,
  width: number,
  height: number,
  mode: EngineConfig['videoCartoonFilter'],
  opacity: number
) {
  if (mode === 'none') {
    ctx.save();
    ctx.globalAlpha = opacity;
    ctx.drawImage(video, 0, 0, width, height);
    ctx.restore();
    return;
  }

  const procW = 320;
  const procH = 180;
  if (!filterCanvas) {
    filterCanvas = document.createElement('canvas');
    filterCanvas.width = procW;
    filterCanvas.height = procH;
    filterCtx = filterCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!filterCtx || !filterCanvas) return;

  filterCtx.drawImage(video, 0, 0, procW, procH);
  const imgData = filterCtx.getImageData(0, 0, procW, procH);
  const data = imgData.data;
  const copy = new Uint8ClampedArray(data);

  const levels = mode === 'rotoscope-2d' ? 4 : 6;
  const step = 255 / levels;

  for (let y = 1; y < procH - 1; y++) {
    for (let x = 1; x < procW - 1; x++) {
      const idx = (y * procW + x) * 4;
      const rightIdx = (y * procW + (x + 1)) * 4;
      const downIdx = ((y + 1) * procW + x) * 4;

      const lum = copy[idx] * 0.299 + copy[idx + 1] * 0.587 + copy[idx + 2] * 0.114;
      const lumR = copy[rightIdx] * 0.299 + copy[rightIdx + 1] * 0.587 + copy[rightIdx + 2] * 0.114;
      const lumD = copy[downIdx] * 0.299 + copy[downIdx + 1] * 0.587 + copy[downIdx + 2] * 0.114;

      const edgeMag = Math.abs(lum - lumR) + Math.abs(lum - lumD);
      const isInkEdge = edgeMag > (mode === 'ink-outline' ? 26 : 34);

      if (mode === 'ink-outline') {
        if (isInkEdge) {
          data[idx] = 15;
          data[idx + 1] = 23;
          data[idx + 2] = 42;
        } else {
          data[idx] = Math.min(255, Math.round(copy[idx] * 0.25 + 215));
          data[idx + 1] = Math.min(255, Math.round(copy[idx + 1] * 0.25 + 212));
          data[idx + 2] = Math.min(255, Math.round(copy[idx + 2] * 0.25 + 205));
        }
      } else {
        if (isInkEdge) {
          data[idx] = 18;
          data[idx + 1] = 22;
          data[idx + 2] = 34;
        } else {
          data[idx] = Math.round(Math.floor(copy[idx] / step) * step);
          data[idx + 1] = Math.round(Math.floor(copy[idx + 1] / step) * step);
          data[idx + 2] = Math.round(Math.floor(copy[idx + 2] / step) * step);
        }
      }
    }
  }

  filterCtx.putImageData(imgData, 0, 0);
  ctx.save();
  ctx.globalAlpha = opacity;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(filterCanvas, 0, 0, width, height);
  ctx.restore();
}

// Smart real-time mouth co-articulation state so phoneme transitions glide smoothly without snapping
const smartMouthMorphState = {
  openFactor: 1.0,
  widthFactor: 1.0,
  jawGlideY: 0.0,
};

// Smart real-time 2nd-order Spring-Damper + Follow-Through state for Character & Mouth Lifting
const smartLiftingPhysicsState = {
  liftPx: 0,
  velocityPx: 0,
  followLiftPx: 0,
  followVelPx: 0,
  squashAmt: 0,
  arcPhase: 0,
  lastFrameIdx: -1,
};

export function drawVisemeMouth(
  ctx: CanvasRenderingContext2D,
  viseme: VisemeCode,
  x: number,
  y: number,
  scale: number,
  loadedSprites: LoadedSpriteImages,
  chartStyle: MouthChartStyleId = 'studio-12',
  isRobobot = false,
  rotationDeg = 0,
  lipstickStyle?: LipstickStyleConfig,
  waveformRms = 0.5,
  upperLipOffsetY = 0,
  lowerLipOffsetY = 0
) {
  ctx.save();

  // Dynamic waveform + phoneme co-articulation smoothing so the mouth layer animates fluidly
  const meta = VISEME_LIBRARY[viseme] || VISEME_LIBRARY[VisemeCode.DROP];
  const isSilentDrop = viseme === VisemeCode.DROP || waveformRms <= 0.012;

  const targetOpenFactor = isSilentDrop
    ? 0.86
    : Math.max(
        0.76,
        Math.min(1.3, 0.76 + waveformRms * 0.54 + meta.mouthOpenness * 0.14)
      );
  const targetWidthFactor = isSilentDrop
    ? 0.96
    : Math.max(
        0.9,
        Math.min(1.12, 0.92 + waveformRms * 0.12 + (meta.mouthWidth - 0.85) * 0.22)
      );
  const targetJawGlideY = isSilentDrop
    ? 0
    : meta.mouthOpenness * 2.8 + waveformRms * 2.2;

  // Asymmetric spring interpolation: crisp syllable opening, feather-smooth closing
  const openLerp = targetOpenFactor > smartMouthMorphState.openFactor ? 0.48 : 0.32;
  smartMouthMorphState.openFactor +=
    (targetOpenFactor - smartMouthMorphState.openFactor) * openLerp;
  smartMouthMorphState.widthFactor +=
    (targetWidthFactor - smartMouthMorphState.widthFactor) * 0.38;
  smartMouthMorphState.jawGlideY +=
    (targetJawGlideY - smartMouthMorphState.jawGlideY) * 0.36;

  const waveOpenFactor = smartMouthMorphState.openFactor;
  const waveWidthFactor = smartMouthMorphState.widthFactor;

  ctx.translate(x, y + smartMouthMorphState.jawGlideY * scale);
  if (rotationDeg !== 0) {
    ctx.rotate((rotationDeg * Math.PI) / 180);
  }

  ctx.scale(scale * waveWidthFactor, scale * waveOpenFactor);

  const customImg = loadedSprites[viseme];
  if (customImg && customImg.complete && customImg.naturalWidth > 0) {
    const targetW = 92;
    const aspect = customImg.naturalHeight / customImg.naturalWidth;
    const targetH = targetW * aspect;
    ctx.drawImage(customImg, -targetW / 2, -targetH / 2, targetW, targetH);
    ctx.restore();
    return;
  }

  if (isRobobot) {
    const meta = VISEME_LIBRARY[viseme];
    const openPx = isSilentDrop
      ? 5
      : 6 + meta.mouthOpenness * 30 * waveOpenFactor;
    const wPx = 62 * meta.mouthWidth;

    ctx.fillStyle = '#090D16';
    ctx.strokeStyle = meta.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(-wPx / 2, -openPx / 2, wPx, openPx, 6);
    ctx.fill();
    ctx.stroke();

    const bars = 7;
    const barW = (wPx - 16) / bars;
    ctx.fillStyle = meta.color;
    for (let i = 0; i < bars; i++) {
      const centerDist = 1 - Math.abs(i - (bars - 1) / 2) / (bars / 2);
      const barH = Math.max(3, (openPx - 8) * centerDist);
      ctx.fillRect(-wPx / 2 + 8 + i * barW + 1, -barH / 2, barW - 3, barH);
    }
    ctx.restore();
    return;
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const isManga = chartStyle === 'manga-bw';
  const isCartoon34 = chartStyle === 'cartoon-34';
  const hasLipstick = Boolean(lipstickStyle && lipstickStyle.presetId !== 'classic-ink');

  const outlineColor = hasLipstick && lipstickStyle ? lipstickStyle.lipColor : '#231924';
  const mouthCavityColor = isManga ? '#09090B' : isCartoon34 ? '#581C23' : '#2E1A2F';
  const teethColor =
    lipstickStyle?.teethColor || (isManga ? '#FFFFFF' : '#FDF8E7');
  const tongueColor =
    lipstickStyle?.tongueColor || (isManga ? '#CBD5E1' : isCartoon34 ? '#FB7185' : '#F27D72');

  // If a stylized Lipstick Style is enabled, draw sculpted upper & lower lips behind the mouth interior
  const upperShift = upperLipOffsetY * 0.45;
  const lowerShift = lowerLipOffsetY * 0.45;
  if (hasLipstick && lipstickStyle) {
    const meta = VISEME_LIBRARY[viseme];
    const lipW = 28 * meta.mouthWidth;
    const lipH = 7 + meta.mouthOpenness * 21;
    const thick = lipstickStyle.lipThickness || 1.3;

    ctx.save();
    ctx.fillStyle = lipstickStyle.lipColor;
    ctx.strokeStyle = '#1E111A';
    ctx.lineWidth = 1.6;

    // Upper Cupid's bow lip
    ctx.beginPath();
    ctx.moveTo(-lipW - 3 * thick, 1 + upperShift);
    ctx.quadraticCurveTo(-lipW * 0.45, -lipH - 6 * thick + upperShift, -4, -lipH - 2 * thick + upperShift);
    ctx.quadraticCurveTo(0, -lipH + 1.5 + upperShift, 4, -lipH - 2 * thick + upperShift);
    ctx.quadraticCurveTo(lipW * 0.45, -lipH - 6 * thick + upperShift, lipW + 3 * thick, 1 + upperShift);
    ctx.quadraticCurveTo(0, -lipH * 0.55 + upperShift, -lipW - 3 * thick, 1 + upperShift);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Lower full lip
    ctx.beginPath();
    ctx.moveTo(-lipW - 2 * thick, lowerShift);
    ctx.quadraticCurveTo(0, lipH + 8 * thick + lowerShift, lipW + 2 * thick, lowerShift);
    ctx.quadraticCurveTo(0, lipH * 0.55 + lowerShift, -lipW - 2 * thick, lowerShift);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  const drawCheekAndChinMarks = (w: number, chinY: number) => {
    ctx.strokeStyle = outlineColor;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.arc(-w - 5, 0, 7, -0.5, 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(w + 5, 0, 7, Math.PI - 0.5, Math.PI + 0.5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-8, chinY);
    ctx.quadraticCurveTo(0, chinY + 3, 8, chinY);
    ctx.stroke();
  };

  if (isCartoon34) {
    drawCartoon34Mouth(ctx, viseme, outlineColor, mouthCavityColor, teethColor, tongueColor);
    ctx.restore();
    return;
  }

  switch (viseme) {
    case VisemeCode.DROP: {
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.8;
      ctx.beginPath();
      ctx.moveTo(-27, -2);
      ctx.quadraticCurveTo(0, 4, 27, -2);
      ctx.stroke();

      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-7, 9);
      ctx.quadraticCurveTo(0, 12, 7, 9);
      ctx.stroke();
      break;
    }

    case VisemeCode.BMP: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;
      ctx.beginPath();
      ctx.moveTo(-22, -4);
      ctx.quadraticCurveTo(0, -1, 22, -4);
      ctx.quadraticCurveTo(26, 6, 18, 8);
      ctx.quadraticCurveTo(0, 9, -18, 8);
      ctx.quadraticCurveTo(-26, 6, -22, -4);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      drawCheekAndChinMarks(24, 15);
      break;
    }

    case VisemeCode.AEI: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-34, -13);
      ctx.quadraticCurveTo(0, -7, 34, -13);
      ctx.bezierCurveTo(38, 12, 22, 24, 0, 24);
      ctx.bezierCurveTo(-22, 24, -38, 12, -34, -13);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.moveTo(-30, -16);
      ctx.quadraticCurveTo(0, -10, 30, -16);
      ctx.lineTo(26, -3);
      ctx.quadraticCurveTo(0, 1, -26, -3);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.moveTo(-18, 16);
      ctx.quadraticCurveTo(-8, 6, 0, 11);
      ctx.quadraticCurveTo(8, 6, 18, 16);
      ctx.lineTo(18, 26);
      ctx.lineTo(-18, 26);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, 23, 21, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-34, -13);
      ctx.quadraticCurveTo(0, -7, 34, -13);
      ctx.bezierCurveTo(38, 12, 22, 24, 0, 24);
      ctx.bezierCurveTo(-22, 24, -38, 12, -34, -13);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(35, 30);
      break;
    }

    case VisemeCode.L: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-34, -12);
      ctx.quadraticCurveTo(0, -6, 34, -12);
      ctx.bezierCurveTo(37, 10, 20, 21, 0, 21);
      ctx.bezierCurveTo(-20, 21, -37, 10, -34, -12);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.moveTo(-17, 21);
      ctx.quadraticCurveTo(-14, -7, 0, -5);
      ctx.quadraticCurveTo(14, -7, 17, 21);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -11, 24, 6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 21, 18, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-34, -12);
      ctx.quadraticCurveTo(0, -6, 34, -12);
      ctx.bezierCurveTo(37, 10, 20, 21, 0, 21);
      ctx.bezierCurveTo(-20, 21, -37, 10, -34, -12);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(35, 27);
      break;
    }

    case VisemeCode.QW: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-29, 8);
      ctx.bezierCurveTo(-32, -16, 32, -16, 29, 8);
      ctx.quadraticCurveTo(0, 14, -29, 8);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -11, 16, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.moveTo(-16, 13);
      ctx.quadraticCurveTo(-8, 1, 0, 6);
      ctx.quadraticCurveTo(8, 1, 16, 13);
      ctx.closePath();
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-29, 8);
      ctx.bezierCurveTo(-32, -16, 32, -16, 29, 8);
      ctx.quadraticCurveTo(0, 14, -29, 8);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(30, 20);
      break;
    }

    case VisemeCode.TH: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-31, 8);
      ctx.bezierCurveTo(-34, -16, 34, -16, 31, 8);
      ctx.quadraticCurveTo(0, 14, -31, 8);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.ellipse(0, 5, 19, 11, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -10, 22, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 12, 20, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-31, 8);
      ctx.bezierCurveTo(-34, -16, 34, -16, 31, 8);
      ctx.quadraticCurveTo(0, 14, -31, 8);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(32, 20);
      break;
    }

    case VisemeCode.N: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-32, -9);
      ctx.quadraticCurveTo(0, -6, 32, -9);
      ctx.bezierCurveTo(36, 8, 20, 16, 0, 16);
      ctx.bezierCurveTo(-20, 16, -36, 8, -32, -9);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -4, 24, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 9, 26, 9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      if (isManga) {
        ctx.fillStyle = '#94A3B8';
        ctx.fillRect(-28, -9, 56, 5);
      }
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-32, -9);
      ctx.quadraticCurveTo(0, -6, 32, -9);
      ctx.bezierCurveTo(36, 8, 20, 16, 0, 16);
      ctx.bezierCurveTo(-20, 16, -36, 8, -32, -9);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(33, 22);
      break;
    }

    case VisemeCode.CDGK: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-34, -9);
      ctx.quadraticCurveTo(0, -6, 34, -9);
      ctx.bezierCurveTo(38, 9, 22, 17, 0, 17);
      ctx.bezierCurveTo(-22, 17, -38, 9, -34, -9);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -7, 27, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 13, 27, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-34, -9);
      ctx.quadraticCurveTo(0, -6, 34, -9);
      ctx.bezierCurveTo(38, 9, 22, 17, 0, 17);
      ctx.bezierCurveTo(-22, 17, -38, 9, -34, -9);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(35, 23);
      break;
    }

    case VisemeCode.FV: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-25, 6);
      ctx.bezierCurveTo(-24, -12, 24, -12, 25, 6);
      ctx.quadraticCurveTo(18, 11, 10, 5);
      ctx.quadraticCurveTo(0, -1, -10, 5);
      ctx.quadraticCurveTo(-18, 11, -25, 6);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -7, 15, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-25, 6);
      ctx.bezierCurveTo(-24, -12, 24, -12, 25, 6);
      ctx.quadraticCurveTo(18, 11, 10, 5);
      ctx.quadraticCurveTo(0, -1, -10, 5);
      ctx.quadraticCurveTo(-18, 11, -25, 6);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(27, 16);
      break;
    }

    case VisemeCode.EE: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-23, -6);
      ctx.quadraticCurveTo(0, -2, 23, -6);
      ctx.bezierCurveTo(26, 8, 14, 15, 0, 15);
      ctx.bezierCurveTo(-14, 15, -26, 8, -23, -6);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -5, 16, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.ellipse(0, 12, 14, 5.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-23, -6);
      ctx.quadraticCurveTo(0, -2, 23, -6);
      ctx.bezierCurveTo(26, 8, 14, 15, 0, 15);
      ctx.bezierCurveTo(-14, 15, -26, 8, -23, -6);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(24, 21);
      break;
    }

    case VisemeCode.O: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.ellipse(0, 4, 12, 19, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -13, 9, 4, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.ellipse(0, 13, 11, 8, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, 21, 8, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.ellipse(0, 4, 12, 19, 0, 0, Math.PI * 2);
      ctx.stroke();

      drawCheekAndChinMarks(15, 27);
      break;
    }

    case VisemeCode.U: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-17, -8);
      ctx.quadraticCurveTo(0, -13, 17, -8);
      ctx.bezierCurveTo(20, 6, 11, 17, 0, 17);
      ctx.bezierCurveTo(-11, 17, -20, 6, -17, -8);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -9, 13, 4.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = tongueColor;
      ctx.beginPath();
      ctx.ellipse(0, 10, 12, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, 16, 10, 3.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-17, -8);
      ctx.quadraticCurveTo(0, -13, 17, -8);
      ctx.bezierCurveTo(20, 6, 11, 17, 0, 17);
      ctx.bezierCurveTo(-11, 17, -20, 6, -17, -8);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(19, 22);
      break;
    }

    case VisemeCode.CHJSH: {
      ctx.fillStyle = mouthCavityColor;
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 3.2;

      ctx.beginPath();
      ctx.moveTo(-33, -10);
      ctx.quadraticCurveTo(0, -6, 33, -10);
      ctx.bezierCurveTo(37, 10, 21, 19, 0, 19);
      ctx.bezierCurveTo(-21, 19, -37, 10, -33, -10);
      ctx.closePath();
      ctx.fill();

      ctx.save();
      ctx.clip();
      ctx.fillStyle = teethColor;
      ctx.beginPath();
      ctx.ellipse(0, -7, 25, 6.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.ellipse(0, 14, 25, 7.5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.moveTo(-33, -10);
      ctx.quadraticCurveTo(0, -6, 33, -10);
      ctx.bezierCurveTo(37, 10, 21, 19, 0, 19);
      ctx.bezierCurveTo(-21, 19, -37, 10, -33, -10);
      ctx.closePath();
      ctx.stroke();

      drawCheekAndChinMarks(34, 25);
      break;
    }
  }

  // Optional Lip Gloss Specular Shine
  if (lipstickStyle?.lipGloss && lipstickStyle.presetId !== 'classic-ink') {
    const meta = VISEME_LIBRARY[viseme];
    const glossY = 4 + meta.mouthOpenness * 15;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-9, glossY);
    ctx.quadraticCurveTo(-2, glossY + 2, 7, glossY - 0.5);
    ctx.stroke();

    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(11, glossY - 1.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  ctx.restore();
}

function drawCartoon34Mouth(
  ctx: CanvasRenderingContext2D,
  viseme: VisemeCode,
  outlineColor: string,
  cavityColor: string,
  teethColor: string,
  tongueColor: string
) {
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = 3.2;

  if (viseme === VisemeCode.DROP || viseme === VisemeCode.BMP) {
    ctx.beginPath();
    if (viseme === VisemeCode.DROP) {
      ctx.moveTo(-26, -6);
      ctx.quadraticCurveTo(-4, 4, 24, 6);
    } else {
      ctx.moveTo(-26, -3);
      ctx.quadraticCurveTo(0, -1, 24, 3);
    }
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-8, 12);
    ctx.quadraticCurveTo(2, 14, 10, 15);
    ctx.stroke();
    return;
  }

  if (viseme === VisemeCode.QW || viseme === VisemeCode.U) {
    ctx.fillStyle = cavityColor;
    ctx.beginPath();
    ctx.moveTo(8, -8);
    ctx.bezierCurveTo(-14, -10, -16, 14, 0, 14);
    ctx.bezierCurveTo(10, 14, 6, -2, 8, -8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-6, 20);
    ctx.quadraticCurveTo(2, 19, 8, 22);
    ctx.stroke();
    return;
  }

  if (viseme === VisemeCode.FV) {
    ctx.fillStyle = teethColor;
    ctx.beginPath();
    ctx.moveTo(-26, -8);
    ctx.quadraticCurveTo(0, 2, 26, 2);
    ctx.lineTo(20, 13);
    ctx.quadraticCurveTo(-6, 9, -24, -1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(-12, 4);
    ctx.lineTo(-9, 11);
    ctx.moveTo(0, 7);
    ctx.lineTo(3, 14);
    ctx.moveTo(12, 9);
    ctx.lineTo(15, 16);
    ctx.stroke();
    return;
  }

  const openH =
    viseme === VisemeCode.AEI || viseme === VisemeCode.O
      ? 30
      : viseme === VisemeCode.L || viseme === VisemeCode.EE
      ? 20
      : 13;
  const widthScale = viseme === VisemeCode.O ? 0.72 : 1.0;

  ctx.save();
  ctx.scale(widthScale, 1);

  ctx.fillStyle = cavityColor;
  ctx.beginPath();
  ctx.moveTo(-28, -12);
  ctx.quadraticCurveTo(2, -4, 30, -4);
  ctx.quadraticCurveTo(22, openH - 4, 18, openH);
  ctx.bezierCurveTo(-4, openH + 2, -28, openH - 6, -28, -12);
  ctx.closePath();
  ctx.fill();

  ctx.save();
  ctx.clip();
  ctx.fillStyle = tongueColor;
  ctx.beginPath();
  ctx.ellipse(-6, openH - 2, 22, 12, 0.25, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = teethColor;
  ctx.beginPath();
  ctx.moveTo(-30, -14);
  ctx.quadraticCurveTo(2, -6, 32, -6);
  ctx.lineTo(28, 2);
  ctx.quadraticCurveTo(-2, 0, -30, -6);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  ctx.beginPath();
  ctx.moveTo(-28, -12);
  ctx.quadraticCurveTo(2, -4, 30, -4);
  ctx.quadraticCurveTo(22, openH - 4, 18, openH);
  ctx.bezierCurveTo(-4, openH + 2, -28, openH - 6, -28, -12);
  ctx.closePath();
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(-4, openH + 8);
  ctx.quadraticCurveTo(6, openH + 6, 12, openH + 10);
  ctx.stroke();

  ctx.restore();
}

export function renderMouthChartThumbnail(
  canvas: HTMLCanvasElement,
  viseme: VisemeCode,
  chartStyle: MouthChartStyleId,
  loadedSprites: LoadedSpriteImages,
  lipstickStyle?: LipstickStyleConfig
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);

  ctx.fillStyle = chartStyle === 'manga-bw' ? '#F8FAFC' : '#F3EFEA';
  ctx.fillRect(0, 0, w, h);

  drawVisemeMouth(
    ctx,
    viseme,
    w / 2,
    h / 2 - 2,
    0.92,
    loadedSprites,
    chartStyle,
    false,
    0,
    lipstickStyle
  );
}

/**
 * Draws the user's own uploaded 2D character image (`loadedSprites.customCharacter`)
 * with automatic audio-peak lifting, squash & stretch, skin-patch mask, and pinned Mouth Chart expression!
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace('#', '');
  const num = parseInt(clean.length === 3 ? clean.replace(/(.)/g, '$1$1') : clean, 16);
  if (Number.isNaN(num)) return { r: 255, g: 255, b: 255 };
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
  };
}

function drawImageWithChromaCutout(
  ctx: CanvasRenderingContext2D,
  source: HTMLImageElement | HTMLVideoElement,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
  keyHex: string,
  tolerance: number
) {
  const procW = 360;
  const procH = 360;
  if (!filterCanvas) {
    filterCanvas = document.createElement('canvas');
  }
  if (filterCanvas.width !== procW || filterCanvas.height !== procH) {
    filterCanvas.width = procW;
    filterCanvas.height = procH;
    filterCtx = filterCanvas.getContext('2d', { willReadFrequently: true });
  }
  if (!filterCtx) {
    ctx.drawImage(source, dx, dy, dw, dh);
    return;
  }

  filterCtx.clearRect(0, 0, procW, procH);
  filterCtx.drawImage(source, 0, 0, procW, procH);
  try {
    const imgData = filterCtx.getImageData(0, 0, procW, procH);
    const data = imgData.data;
    // Sample top-left pixel or use user's chromaKeyColor
    const keyRgb = keyHex ? hexToRgb(keyHex) : { r: data[0], g: data[1], b: data[2] };
    const thresh = Math.max(12, tolerance * 1.8);

    for (let i = 0; i < data.length; i += 4) {
      const dist =
        Math.abs(data[i] - keyRgb.r) +
        Math.abs(data[i + 1] - keyRgb.g) +
        Math.abs(data[i + 2] - keyRgb.b);
      if (dist < thresh) {
        data[i + 3] = 0;
      }
    }
    filterCtx.putImageData(imgData, 0, 0);
    ctx.drawImage(filterCanvas, dx, dy, dw, dh);
  } catch {
    ctx.drawImage(source, dx, dy, dw, dh);
  }
}

function drawCustomUploadedCharacter(
  ctx: CanvasRenderingContext2D,
  loadedSprites: LoadedSpriteImages,
  removeBg?: boolean,
  chromaColor?: string,
  chromaTolerance?: number,
  drawCharacterLayer = true,
  hairWaveSwayPx = 0
) {
  const charImg = loadedSprites.customCharacter;

  ctx.save();

  if (drawCharacterLayer && charImg && charImg.complete && charImg.naturalWidth > 0) {
    const aspect = charImg.naturalWidth / Math.max(1, charImg.naturalHeight);
    const drawH = 360;
    const drawW = drawH * aspect;
    // Apply subtle continuous upper-crown hair/head sine-wave shear if procedural hair motion is active
    if (Math.abs(hairWaveSwayPx) > 0.05) {
      ctx.transform(1, 0, (hairWaveSwayPx * 0.0014), 1, 0, 0);
    }
    if (removeBg) {
      drawImageWithChromaCutout(
        ctx,
        charImg,
        -drawW / 2,
        -20 - drawH / 2,
        drawW,
        drawH,
        chromaColor || '#FFFFFF',
        chromaTolerance || 45
      );
    } else {
      ctx.drawImage(charImg, -drawW / 2, -20 - drawH / 2, drawW, drawH);
    }
  }

  ctx.restore();
}

// Lightweight Spring-Damper Physics State for Procedural Animation (Zero External APIs)
interface ProceduralPhysicsState {
  headTiltDeg: number;
  headTiltVel: number;
  headBobY: number;
  headBobVel: number;
  headSwayX: number;
  headSwayVel: number;
  hairPhase: number;
  windBoost: number;
  lastTimestampMs: number;
}

const proceduralPhysics: ProceduralPhysicsState = {
  headTiltDeg: 0,
  headTiltVel: 0,
  headBobY: 0,
  headBobVel: 0,
  headSwayX: 0,
  headSwayVel: 0,
  hairPhase: 0,
  windBoost: 0,
  lastTimestampMs: 0,
};

interface ComputedProceduralOffsets {
  active: boolean;
  timeSec: number;
  headTiltRad: number;
  headTiltDeg: number;
  headOffsetX: number;
  headOffsetY: number;
  hairSwayPx: number;
  hairSecondarySwayPx: number;
  hairVerticalWavePx: number;
  foliageTimePhase: number;
  foliageIntensityRatio: number;
  leavesCount: number;
  windAudioBoost: number;
}

function computeProceduralAnimationOffsets(
  currentFrame: AudioAnalysisFrame,
  config: EngineConfig,
  idleClockSec?: number
): ComputedProceduralOffsets {
  const proc: ProceduralAnimationConfig =
    config.proceduralAnimation || DEFAULT_PROCEDURAL_ANIMATION;
  const isLayerOn = config.layers.proceduralLayer !== false && proc.enabled;

  if (!isLayerOn) {
    return {
      active: false,
      timeSec: 0,
      headTiltRad: 0,
      headTiltDeg: 0,
      headOffsetX: 0,
      headOffsetY: 0,
      hairSwayPx: 0,
      hairSecondarySwayPx: 0,
      hairVerticalWavePx: 0,
      foliageTimePhase: 0,
      foliageIntensityRatio: 0,
      leavesCount: 0,
      windAudioBoost: 0,
    };
  }

  const frameSec =
    currentFrame.timeSec ??
    currentFrame.time ??
    currentFrame.frame / Math.max(1, config.fps);
  // Combine timeline frame time with continuous idle timer so procedural motion works both while playing & idle
  const baseTimeSec =
    idleClockSec !== undefined ? frameSec + idleClockSec * 0.85 : frameSec;

  const omega = Math.max(0.25, proc.waveSpeedHz) * Math.PI * 2;
  const isSpeaking = !currentFrame.isDropped && currentFrame.rms > 0.035;
  const audioEnergy = isSpeaking ? Math.min(1, currentFrame.rms * 1.45) : 0;
  const audioFreqNorm = Math.min(
    1,
    (currentFrame.spectralCentroid || currentFrame.zcr || 0.35) * 1.4
  );

  const useAudio =
    proc.triggerMode === 'audio-idle-hybrid' ||
    proc.triggerMode === 'audio-frequency';
  const useIdle =
    proc.triggerMode === 'audio-idle-hybrid' ||
    proc.triggerMode === 'idle-sine';

  // 1. Lightweight Spring-Damper Physics for Head Tilt & Position with Speech
  const headIntensity = (proc.headTiltIntensity ?? 68) / 100;
  const speechTiltTargetDeg =
    useAudio && proc.headTiltWithSpeech && isSpeaking
      ? (currentFrame.headTiltDeg ||
          Math.sin(frameSec * 7.5 + audioFreqNorm * 4) * 5.2) *
          (0.65 + audioEnergy * 0.85) *
          headIntensity
      : 0;
  const idleTiltTargetDeg =
    useIdle && proc.headTiltWithSpeech
      ? Math.sin(baseTimeSec * omega * 0.42) * 2.1 * headIntensity
      : 0;

  const targetTiltDeg = speechTiltTargetDeg + idleTiltTargetDeg;
  const targetBobY =
    (useAudio && isSpeaking
      ? -Math.abs(Math.sin(frameSec * 9.2)) * 5.5 * audioEnergy
      : 0) +
    (useIdle ? Math.sin(baseTimeSec * omega * 0.55) * 2.6 : 0);
  const targetSwayX =
    (useAudio && isSpeaking
      ? Math.cos(frameSec * 5.4) * 3.2 * audioEnergy
      : 0) +
    (useIdle ? Math.cos(baseTimeSec * omega * 0.36) * 2.2 : 0);

  const dampingFactor = Math.max(
    0.55,
    Math.min(0.92, (proc.physicsSpringDamping ?? 68) / 100)
  );
  const stiffness = 0.24;

  proceduralPhysics.headTiltVel =
    (proceduralPhysics.headTiltVel +
      (targetTiltDeg - proceduralPhysics.headTiltDeg) * stiffness) *
    dampingFactor;
  proceduralPhysics.headTiltDeg += proceduralPhysics.headTiltVel;

  proceduralPhysics.headBobVel =
    (proceduralPhysics.headBobVel +
      (targetBobY * headIntensity - proceduralPhysics.headBobY) * stiffness) *
    dampingFactor;
  proceduralPhysics.headBobY += proceduralPhysics.headBobVel;

  proceduralPhysics.headSwayVel =
    (proceduralPhysics.headSwayVel +
      (targetSwayX * headIntensity - proceduralPhysics.headSwayX) * stiffness) *
    dampingFactor;
  proceduralPhysics.headSwayX += proceduralPhysics.headSwayVel;

  // Smooth audio wind boost for hair & foliage
  const targetWindBoost = useAudio ? audioEnergy * (0.6 + audioFreqNorm * 0.6) : 0;
  proceduralPhysics.windBoost =
    proceduralPhysics.windBoost * 0.84 + targetWindBoost * 0.16;

  // 2. Hair Sine-Wave + Audio Frequency Offsets
  const hairRatio = (proc.hairMovementIntensity ?? 65) / 100;
  const hairWaveAmp =
    hairRatio *
    (useIdle ? 11.5 : 3.5) *
    (1 + proceduralPhysics.windBoost * 1.15);
  const hairSwayPx =
    Math.sin(baseTimeSec * omega) * hairWaveAmp +
    Math.sin(baseTimeSec * omega * 2.15 + 0.9) * (hairWaveAmp * 0.35);
  const hairSecondarySwayPx =
    Math.cos(baseTimeSec * omega * 0.85 - 0.65) * (hairWaveAmp * 0.88);
  const hairVerticalWavePx =
    Math.sin(baseTimeSec * omega * 1.35 + 1.4) * (hairWaveAmp * 0.42);

  // 3. Leaves & Foliage Smooth Floating Parameters
  const foliageRatio = (proc.leavesFloatIntensity ?? 62) / 100;

  return {
    active: true,
    timeSec: baseTimeSec,
    headTiltRad: (proceduralPhysics.headTiltDeg * Math.PI) / 180,
    headTiltDeg: proceduralPhysics.headTiltDeg,
    headOffsetX: proceduralPhysics.headSwayX,
    headOffsetY: proceduralPhysics.headBobY,
    hairSwayPx,
    hairSecondarySwayPx,
    hairVerticalWavePx,
    foliageTimePhase: baseTimeSec * Math.max(0.3, proc.waveSpeedHz),
    foliageIntensityRatio: foliageRatio,
    leavesCount: foliageRatio > 0.02 ? Math.round(proc.leavesCount ?? 12) : 0,
    windAudioBoost: proceduralPhysics.windBoost,
  };
}

/**
 * Renders smooth procedural swaying background foliage branches & floating leaves
 * using pure sine-wave physics without external APIs or heavy visual assets.
 */
function drawProceduralFoliageAndLeaves(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  proc: ComputedProceduralOffsets,
  layerPass: 'background-foliage' | 'foreground-leaves'
) {
  if (!proc.active || proc.foliageIntensityRatio <= 0.02) return;

  const t = proc.foliageTimePhase;
  const amp = proc.foliageIntensityRatio * (1 + proc.windAudioBoost * 0.85);
  const scaleFactor = height / 720;

  ctx.save();

  if (layerPass === 'background-foliage') {
    // Draw subtle swaying botanical branches in top-left and top-right corners
    const branches = [
      { baseX: 0, baseY: 42 * scaleFactor, dir: 1, phase: 0.2 },
      { baseX: width, baseY: 58 * scaleFactor, dir: -1, phase: 1.9 },
    ];

    for (const br of branches) {
      const swayDeg =
        Math.sin(t * 1.5 + br.phase) * 7.5 * amp +
        Math.cos(t * 0.85 + br.phase) * 3.2 * amp;
      ctx.save();
      ctx.translate(br.baseX, br.baseY);
      ctx.scale(br.dir * scaleFactor, scaleFactor);
      ctx.rotate((swayDeg * Math.PI) / 180);

      // Branch stem
      ctx.strokeStyle = 'rgba(21, 128, 61, 0.55)';
      ctx.lineWidth = 3.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-10, 0);
      ctx.quadraticCurveTo(68, 18, 148, 52);
      ctx.stroke();

      // 5 swaying leaves along the branch
      const leafNodes = [
        { x: 36, y: 10, ang: 0.45, sz: 18, color: '#22C55E' },
        { x: 64, y: 18, ang: -0.52, sz: 21, color: '#16A34A' },
        { x: 92, y: 29, ang: 0.5, sz: 19, color: '#4ADE80' },
        { x: 118, y: 39, ang: -0.44, sz: 17, color: '#15803D' },
        { x: 145, y: 51, ang: 0.15, sz: 20, color: '#22C55E' },
      ];

      leafNodes.forEach((lf, idx) => {
        const localFlutter =
          Math.sin(t * 2.4 + idx * 1.1 + br.phase) * 0.18 * amp;
        ctx.save();
        ctx.translate(lf.x, lf.y);
        ctx.rotate(lf.ang + localFlutter);
        ctx.fillStyle = lf.color;
        ctx.globalAlpha = 0.78;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.quadraticCurveTo(lf.sz * 0.6, -lf.sz * 0.42, lf.sz * 1.35, 0);
        ctx.quadraticCurveTo(lf.sz * 0.6, lf.sz * 0.42, 0, 0);
        ctx.closePath();
        ctx.fill();

        // Central leaf vein
        ctx.strokeStyle = 'rgba(240, 253, 244, 0.45)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(2, 0);
        ctx.lineTo(lf.sz * 1.05, 0);
        ctx.stroke();
        ctx.restore();
      });

      ctx.restore();
    }

    ctx.restore();
    return;
  }

  // FOREGROUND / MIDGROUND FLOATING LEAVES
  const count = Math.max(0, Math.min(28, proc.leavesCount));
  const leafPalette = ['#22C55E', '#4ADE80', '#10B981', '#84CC16', '#F59E0B'];

  for (let i = 0; i < count; i++) {
    const seed = (i + 1) * 1.6180339;
    const speedY = 24 + (i % 4) * 9;
    const rawY =
      ((t * speedY * (0.75 + amp * 0.45) + seed * 190) % (height + 90)) - 45;
    const baseX = ((seed * 347.1) % 0.92 + 0.04) * width;
    const swayRadius = (26 + (i % 5) * 11) * amp * scaleFactor;
    const x =
      baseX +
      Math.sin(t * (1.1 + (i % 3) * 0.35) + seed * 4.2) * swayRadius +
      Math.cos(t * 0.65 + seed) * (swayRadius * 0.35);

    const rotAngle =
      Math.sin(t * (1.4 + (i % 4) * 0.25) + seed * 3.1) * 0.85 +
      t * (i % 2 === 0 ? 0.45 : -0.45);
    const leafSize = (11 + (i % 4) * 3.5) * scaleFactor;
    const tiltSquash = 0.55 + 0.45 * Math.abs(Math.cos(t * 1.6 + seed));

    ctx.save();
    ctx.translate(x, rawY);
    ctx.rotate(rotAngle);
    ctx.scale(1, tiltSquash);
    ctx.globalAlpha = 0.76;

    ctx.fillStyle = leafPalette[i % leafPalette.length];
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.lineWidth = 1.2;

    ctx.beginPath();
    ctx.moveTo(-leafSize, 0);
    ctx.quadraticCurveTo(0, -leafSize * 0.68, leafSize, 0);
    ctx.quadraticCurveTo(0, leafSize * 0.68, -leafSize, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Subtle central vein
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-leafSize * 0.75, 0);
    ctx.lineTo(leafSize * 0.75, 0);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

let isolatedSnapshotCanvas: HTMLCanvasElement | null = null;
let isolatedSnapshotCtx: CanvasRenderingContext2D | null = null;

/**
 * Selectively isolates circular/elliptical regions of a static image and animates
 * each isolated element with natural movement (pendulum sway, sine float, audio bounce,
 * circular orbit, or manual pose) controlled by intuitive tap-and-drag vectors.
 */
function renderIsolatedMotionRegions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  regions: IsolatedMotionRegion[],
  currentFrame: AudioAnalysisFrame,
  config: EngineConfig,
  timeSec: number
) {
  const activeRegions = regions.filter((r) => r.enabled);
  if (activeRegions.length === 0) return;

  if (!isolatedSnapshotCanvas) {
    isolatedSnapshotCanvas = document.createElement('canvas');
  }
  if (
    isolatedSnapshotCanvas.width !== width ||
    isolatedSnapshotCanvas.height !== height
  ) {
    isolatedSnapshotCanvas.width = width;
    isolatedSnapshotCanvas.height = height;
    isolatedSnapshotCtx = isolatedSnapshotCanvas.getContext('2d');
  }
  if (!isolatedSnapshotCtx) return;

  // Capture clean snapshot of the static scene before moving isolated parts
  isolatedSnapshotCtx.clearRect(0, 0, width, height);
  isolatedSnapshotCtx.drawImage(ctx.canvas, 0, 0, width, height);

  const scaleX = width / 1280;
  const scaleY = height / 720;

  activeRegions.forEach((reg, idx) => {
    const cx = reg.anchorX * width;
    const cy = reg.anchorY * height;
    const r = Math.max(18, reg.radiusPx * scaleY);
    const omega = Math.max(0.25, reg.speedHz || 1.3) * Math.PI * 2;
    const seed = idx * 0.85;

    let dx = 0;
    let dy = 0;
    let rotRad = 0;

    if (reg.motionType === 'pendulum-sway') {
      const s = Math.sin(timeSec * omega + seed);
      dx = reg.dragVectorX * s * scaleX;
      dy = reg.dragVectorY * s * scaleY;
      rotRad = ((reg.rotationAmpDeg * s) * Math.PI) / 180;
    } else if (reg.motionType === 'sine-float') {
      const s = Math.sin(timeSec * omega + seed);
      const c = Math.cos(timeSec * omega * 0.78 + seed);
      dx = reg.dragVectorX * s * scaleX;
      dy = reg.dragVectorY * c * scaleY;
      rotRad = ((reg.rotationAmpDeg * 0.55 * s) * Math.PI) / 180;
    } else if (reg.motionType === 'audio-bounce') {
      const audioBoost = currentFrame.isDropped
        ? 0
        : Math.min(1.35, currentFrame.rms * 1.75);
      const idleSubtle = Math.sin(timeSec * omega + seed) * 0.22;
      const factor = audioBoost + idleSubtle;
      dx = reg.dragVectorX * factor * scaleX;
      dy = reg.dragVectorY * factor * scaleY;
      rotRad = ((reg.rotationAmpDeg * factor) * Math.PI) / 180;
    } else if (reg.motionType === 'circular-orbit') {
      dx = reg.dragVectorX * Math.cos(timeSec * omega + seed) * scaleX;
      dy = reg.dragVectorY * Math.sin(timeSec * omega + seed) * scaleY;
      rotRad =
        ((reg.rotationAmpDeg * Math.sin(timeSec * omega + seed)) * Math.PI) /
        180;
    } else {
      // 'manual-pose'
      dx = reg.dragVectorX * scaleX;
      dy = reg.dragVectorY * scaleY;
      rotRad = (reg.rotationAmpDeg * Math.PI) / 180;
    }

    // 1. Optional background infill under the original position when the element moves away
    if (
      reg.patchInfill &&
      (Math.hypot(dx, dy) > 1.5 || Math.abs(rotRad) > 0.02)
    ) {
      ctx.save();
      const bgFill =
        config.background.mode === 'green-screen'
          ? '#00FF00'
          : config.background.color1 || '#D8D4CE';
      const grad = ctx.createRadialGradient(cx, cy, r * 0.15, cx, cy, r * 0.96);
      grad.addColorStop(0, bgFill);
      grad.addColorStop(0.75, bgFill);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = grad;
      ctx.globalAlpha = 0.82;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // 2. Draw the isolated circular patch at its new animated position & pivot rotation
    ctx.save();
    ctx.translate(cx + dx, cy + dy);
    ctx.rotate(rotRad);

    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    ctx.drawImage(
      isolatedSnapshotCanvas!,
      cx - r,
      cy - r,
      r * 2,
      r * 2,
      -r,
      -r,
      r * 2,
      r * 2
    );

    ctx.restore();
  });
}

export function renderStudioStage(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  currentFrame: AudioAnalysisFrame,
  config: EngineConfig,
  videoElement: HTMLVideoElement | null,
  hasUploadedVideo: boolean,
  loadedSprites: LoadedSpriteImages,
  characterOverlays?: CharacterOverlayElement[],
  idleClockSec?: number
) {
  ctx.clearRect(0, 0, width, height);

  // Compute procedural animation offsets (Head speech tilt, Hair wave, Leaves float)
  const procOffsets = computeProceduralAnimationOffsets(
    currentFrame,
    config,
    idleClockSec
  );

  // =========================================================================
  // LAYER 3: BACKGROUND LAYER (Solid, Gradient, Green Screen, or Custom Image)
  // =========================================================================
  if (config.layers.backgroundLayer) {
    const bg = config.background;
    if (
      bg.mode === 'custom-image' &&
      loadedSprites.customBackground &&
      loadedSprites.customBackground.complete &&
      loadedSprites.customBackground.naturalWidth > 0
    ) {
      ctx.save();
      const bgScale = bg.scale || 1;
      const bgOx = bg.offsetX || 0;
      const bgOy = bg.offsetY || 0;
      ctx.translate(width / 2 + bgOx, height / 2 + bgOy);
      ctx.scale(bgScale, bgScale);
      ctx.drawImage(
        loadedSprites.customBackground,
        -width / 2,
        -height / 2,
        width,
        height
      );
      ctx.restore();
    } else if (bg.mode === 'green-screen') {
      ctx.fillStyle = '#00FF00';
      ctx.fillRect(0, 0, width, height);
    } else if (bg.mode === 'gradient') {
      const grad = ctx.createLinearGradient(0, 0, width, height);
      grad.addColorStop(0, bg.color1 || '#1E293B');
      grad.addColorStop(1, bg.color2 || '#0F172A');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
    } else {
      ctx.fillStyle = bg.color1 || '#D8D4CE';
      ctx.fillRect(0, 0, width, height);
    }
  } else {
    ctx.fillStyle = '#0D0D0F';
    ctx.fillRect(0, 0, width, height);
  }

  // Procedural swaying background foliage (if enabled and not in pure green-screen mode)
  if (
    procOffsets.active &&
    config.background.mode !== 'green-screen' &&
    config.layers.backgroundLayer
  ) {
    drawProceduralFoliageAndLeaves(
      ctx,
      width,
      height,
      procOffsets,
      'background-foliage'
    );
  }

  // =========================================================================
  // LAYER 2A: VIDEO CHARACTER LAYER (if a video is uploaded)
  // =========================================================================
  if (
    config.layers.characterLayer &&
    hasUploadedVideo &&
    videoElement &&
    videoElement.readyState >= 2
  ) {
    if (config.background.removeCharacterBg) {
      drawImageWithChromaCutout(
        ctx,
        videoElement,
        0,
        0,
        width,
        height,
        config.background.chromaKeyColor,
        config.background.chromaTolerance
      );
    } else {
      applyDeterministicVideoCartoonFilter(
        ctx,
        videoElement,
        width,
        height,
        config.videoCartoonFilter,
        config.videoOpacity
      );
    }
  }

  // =========================================================================
  // COMPUTE LIVE TRACKED MOUTH ANCHOR (Follows moving character in video!)
  // =========================================================================
  const trackedPoint = computeLiveTrackedMouthOffset(
    videoElement,
    hasUploadedVideo,
    config
  );

  const effectiveMouthAnchor: MouthAnchorConfig = {
    ...config.mouthAnchor,
    offsetX: trackedPoint.offsetX,
    offsetY: trackedPoint.offsetY,
  };

  const baseAnchorX = config.characterTransform.x * width;
  const baseAnchorY = config.characterTransform.y * height;
  const charScale = config.characterTransform.scale;
  const charRotRad = ((config.characterTransform.rotationDeg || 0) * Math.PI) / 180;
  const charFlipX = config.characterTransform.flipX ? -1 : 1;

  // =========================================================================
  // SMART SMOOTH SPRING-DAMPER LIFTING ENGINE (Zero Robotic Step-Jumps!)
  // =========================================================================
  const isLiftingLayerActive =
    config.layers.liftingLayer !== false && config.maxLiftPx > 0;
  const keyLiftVal = config.perKeyLiftPx?.[currentFrame.viseme] ?? 0;
  const liftFactor = isLiftingLayerActive
    ? Math.min(1.8, config.maxLiftPx / 20)
    : 0;

  // Combine pre-smoothed audio contour (`currentFrame.liftY`) with per-key lift and live RMS envelope
  const rmsContour = currentFrame.isDropped
    ? 0
    : Math.max(0.35, Math.min(1.18, 0.45 + currentFrame.rms * 0.95));
  const rawKeyTarget =
    !isLiftingLayerActive || currentFrame.isDropped
      ? 0
      : keyLiftVal * liftFactor * 0.56 * rmsContour;
  const preSmoothedFrameLift = isLiftingLayerActive
    ? (currentFrame.liftY || 0) * 0.62
    : 0;
  const desiredLiftTarget = !isLiftingLayerActive
    ? 0
    : preSmoothedFrameLift > 0
    ? preSmoothedFrameLift * 0.65 + rawKeyTarget * 0.35
    : rawKeyTarget;

  const curveMode = config.liftingCurveMode || 'smart-organic';
  const smoothnessNorm = Math.max(
    0,
    Math.min(1, (config.liftingSmoothness ?? 88) / 100)
  );

  if (!isLiftingLayerActive) {
    smartLiftingPhysicsState.liftPx = 0;
    smartLiftingPhysicsState.velocityPx = 0;
    smartLiftingPhysicsState.followLiftPx = 0;
    smartLiftingPhysicsState.followVelPx = 0;
    smartLiftingPhysicsState.squashAmt = 0;
  } else if (curveMode === 'classic-linear' && smoothnessNorm < 0.15) {
    smartLiftingPhysicsState.liftPx = desiredLiftTarget;
    smartLiftingPhysicsState.followLiftPx = desiredLiftTarget;
    smartLiftingPhysicsState.velocityPx = 0;
  } else {
    // Second-Order Spring-Damper with Asymmetric Attack & Feather-Soft Landing
    const isRising = desiredLiftTarget > smartLiftingPhysicsState.liftPx;
    const baseStiffness =
      curveMode === 'spring-bounce'
        ? 0.32
        : curveMode === 'feather-glide'
        ? 0.14
        : 0.22 - smoothnessNorm * 0.07;
    const stiffness = isRising
      ? baseStiffness * 1.28
      : baseStiffness * (0.68 - smoothnessNorm * 0.16);
    const damping =
      curveMode === 'spring-bounce'
        ? 0.72
        : curveMode === 'feather-glide'
        ? 0.82
        : 0.76 + smoothnessNorm * 0.08;

    const force =
      (desiredLiftTarget - smartLiftingPhysicsState.liftPx) * stiffness;
    smartLiftingPhysicsState.velocityPx =
      smartLiftingPhysicsState.velocityPx * damping + force;
    smartLiftingPhysicsState.liftPx += smartLiftingPhysicsState.velocityPx;

    if (smartLiftingPhysicsState.liftPx < 0.04 && desiredLiftTarget === 0) {
      smartLiftingPhysicsState.liftPx = 0;
      smartLiftingPhysicsState.velocityPx = 0;
    } else if (smartLiftingPhysicsState.liftPx < 0) {
      smartLiftingPhysicsState.liftPx = 0;
      smartLiftingPhysicsState.velocityPx *= 0.25;
    }

    // Secondary Follow-Through Spring (delayed overlapping action for natural head/mouth follow-through)
    const followForce =
      (smartLiftingPhysicsState.liftPx -
        smartLiftingPhysicsState.followLiftPx) *
      0.19;
    smartLiftingPhysicsState.followVelPx =
      smartLiftingPhysicsState.followVelPx * 0.78 + followForce;
    smartLiftingPhysicsState.followLiftPx +=
      smartLiftingPhysicsState.followVelPx;
  }

  const activeLiftOffset = smartLiftingPhysicsState.liftPx;
  const followLiftOffset = smartLiftingPhysicsState.followLiftPx;
  const liftVelocity = smartLiftingPhysicsState.velocityPx;

  const targetMode = config.liftingTarget || 'character-and-mouth';
  const bodyLiftY =
    targetMode === 'mouth-only'
      ? 0
      : targetMode === 'character-only'
      ? activeLiftOffset * 0.85
      : activeLiftOffset * 0.62;
  const jawDrop =
    targetMode === 'character-only' ? 0 : followLiftOffset;

  // Natural S-curve micro-arc & expressive nod so lifting never looks like a stiff vertical elevator
  smartLiftingPhysicsState.arcPhase += 0.09;
  const liftRatio =
    isLiftingLayerActive && config.maxLiftPx > 0
      ? Math.min(1, activeLiftOffset / Math.max(12, config.maxLiftPx * 0.75))
      : 0;
  const smartLiftArcX =
    isLiftingLayerActive && curveMode !== 'classic-linear' && targetMode !== 'mouth-only'
      ? Math.sin(smartLiftingPhysicsState.arcPhase) * liftRatio * 2.2 * (width / 1280)
      : 0;
  const smartLiftTiltRad =
    isLiftingLayerActive && curveMode !== 'classic-linear' && targetMode !== 'mouth-only'
      ? ((liftVelocity * 0.14 + Math.cos(smartLiftingPhysicsState.arcPhase) * liftRatio * 0.85) *
          Math.PI) /
        180
      : 0;

  // Apply smooth mouth-only vertical lift to effectiveMouthAnchor when in mouth-only mode
  if (targetMode === 'mouth-only' && followLiftOffset > 0) {
    effectiveMouthAnchor.offsetY -= followLiftOffset * 0.48;
  }

  // Smoothly interpolated Squash & Stretch coupled to both lift height and spring velocity
  const targetSquashAmt =
    isLiftingLayerActive && config.squashIntensity > 0
      ? Math.max(
          -0.06,
          Math.min(
            0.2,
            ((activeLiftOffset / 30) * 0.82 + (liftVelocity / 12) * 0.25) *
              config.squashIntensity
          )
        )
      : 0;
  smartLiftingPhysicsState.squashAmt +=
    (targetSquashAmt - smartLiftingPhysicsState.squashAmt) * 0.28;
  const squashAmt = smartLiftingPhysicsState.squashAmt;
  const stretchScaleX = 1 - squashAmt * 0.52;
  const stretchScaleY = 1 + squashAmt;

  const isBlinking = false;

  // =========================================================================
  // LAYER 2: INDEPENDENT CHARACTER LAYER (Body, Head, Eyes / Custom Image)
  // =========================================================================
  const isVideoCharacterOnly =
    hasUploadedVideo && !loadedSprites.customCharacter && config.characterPreset === 'custom-character';

  if (config.layers.characterLayer) {
    ctx.save();
    // Apply subtle procedural head/body sway + smart lifting S-curve micro-arc
    const customCharTiltRad =
      (config.characterPreset === 'custom-character' && procOffsets.active
        ? procOffsets.headTiltRad * 0.65
        : 0) + smartLiftTiltRad;
    const customCharOffsetX =
      (config.characterPreset === 'custom-character' && procOffsets.active
        ? procOffsets.headOffsetX * (width / 1280)
        : 0) + smartLiftArcX;
    const customCharOffsetY =
      config.characterPreset === 'custom-character' && procOffsets.active
        ? procOffsets.headOffsetY * (height / 720)
        : 0;

    ctx.translate(
      baseAnchorX + customCharOffsetX,
      baseAnchorY - bodyLiftY + customCharOffsetY
    );
    ctx.rotate(charRotRad + customCharTiltRad);
    ctx.scale(charScale * charFlipX * stretchScaleX, charScale * stretchScaleY);

    if (config.characterPreset === 'custom-character' && !isVideoCharacterOnly) {
      drawCustomUploadedCharacter(
        ctx,
        loadedSprites,
        config.background.removeCharacterBg,
        config.background.chromaKeyColor,
        config.background.chromaTolerance,
        true,
        procOffsets.active ? procOffsets.hairSwayPx : 0
      );
    } else if (config.characterPreset === 'robobot-rig') {
      drawRoboBotCharacter(
        ctx,
        currentFrame,
        jawDrop,
        isBlinking,
        loadedSprites,
        procOffsets
      );
    } else if (config.characterPreset === 'mina-toon') {
      drawMinaCharacter(
        ctx,
        jawDrop,
        isBlinking,
        procOffsets
      );
    } else if (config.characterPreset !== 'mouth-only-overlay' && !isVideoCharacterOnly) {
      drawArjunCharacter(
        ctx,
        jawDrop,
        isBlinking,
        loadedSprites,
        procOffsets
      );
    }

    ctx.restore();
  }

  // =========================================================================
  // LAYER 2B: SELECTIVELY ISOLATED & ANIMATED STATIC IMAGE ELEMENTS
  //           (Tap-and-Drag Region Isolation + Natural Pendulum/Sine/Audio Motion!)
  // =========================================================================
  const isolatedRegions = config.proceduralAnimation?.isolatedRegions;
  if (
    isolatedRegions &&
    isolatedRegions.length > 0 &&
    config.layers.proceduralLayer !== false
  ) {
    renderIsolatedMotionRegions(
      ctx,
      width,
      height,
      isolatedRegions,
      currentFrame,
      config,
      procOffsets.timeSec ||
        (currentFrame.timeSec ?? currentFrame.frame / Math.max(1, config.fps))
    );
  }

  // =========================================================================
  // LAYER 3: INDEPENDENT LIP SEGMENT / MOUTH LAYER (Smaller, Audio-Synced!)
  // =========================================================================
  if (config.layers.mouthLayer) {
    // Include subtle procedural head speech tilt & offset so the mouth naturally tilts slightly with speech!
    const procMouthDx = procOffsets.active ? procOffsets.headOffsetX * 0.85 : 0;
    const procMouthDy = procOffsets.active ? procOffsets.headOffsetY * 0.85 : 0;
    const procMouthRotDeg = procOffsets.active ? procOffsets.headTiltDeg * 0.75 : 0;

    // Independent stage coordinates for the Mouth / Lip Segment Layer
    // Base stage reference is (width * 0.5, height * 0.64) + independent offsets + optical tracking delta
    const mouthStageX =
      width * 0.5 + (effectiveMouthAnchor.offsetX + procMouthDx) * (width / 1280);
    const mouthStageY =
      height * 0.64 +
      (3 + effectiveMouthAnchor.offsetY + procMouthDy + jawDrop * 0.28) * (height / 720) -
      (targetMode === 'character-and-mouth' ? bodyLiftY : 0);

    const isRobobotMouth = config.characterPreset === 'robobot-rig';
    const baseMouthScale =
      (config.characterPreset === 'mouth-only-overlay' || isVideoCharacterOnly
        ? 1.05
        : 0.88) *
      effectiveMouthAnchor.scale *
      (height / 720);

    ctx.save();
    ctx.translate(mouthStageX, mouthStageY);
    if (effectiveMouthAnchor.flipX) {
      ctx.scale(-1, 1);
    }

    if (effectiveMouthAnchor.skinMaskEnabled) {
      ctx.save();
      ctx.rotate(((effectiveMouthAnchor.rotationDeg + procMouthRotDeg) * Math.PI) / 180);
      ctx.fillStyle = effectiveMouthAnchor.skinMaskColor || '#F3B882';
      ctx.beginPath();
      ctx.ellipse(
        0,
        0,
        effectiveMouthAnchor.skinMaskRadius * 1.2 * baseMouthScale,
        effectiveMouthAnchor.skinMaskRadius * 0.85 * baseMouthScale,
        0,
        0,
        Math.PI * 2
      );
      ctx.fill();
      ctx.restore();
    }

    const activeViseme = currentFrame.isDropped
      ? VisemeCode.DROP
      : currentFrame.viseme;

    drawVisemeMouth(
      ctx,
      activeViseme,
      0,
      0,
      baseMouthScale,
      loadedSprites,
      config.mouthChartStyle,
      isRobobotMouth,
      effectiveMouthAnchor.rotationDeg + procMouthRotDeg,
      config.lipstickStyle,
      currentFrame.isDropped ? 0 : currentFrame.rms,
      effectiveMouthAnchor.upperLipOffsetY || 0,
      effectiveMouthAnchor.lowerLipOffsetY || 0
    );

    ctx.restore();
  }

  // =========================================================================
  // LAYER 1B: EXTRA CHARACTER OVERLAY ELEMENTS (Zoom, Scale, Rotate, Move)
  // =========================================================================
  if (
    config.layers.overlayLayer !== false &&
    characterOverlays &&
    characterOverlays.length > 0
  ) {
    for (let idx = 0; idx < characterOverlays.length; idx++) {
      const ov = characterOverlays[idx];
      if (!ov.visible) continue;
      const ovImg = loadedSprites[`overlay_${ov.id}`];
      const ovWaveX = procOffsets.active
        ? Math.sin(procOffsets.timeSec * 2.2 + idx) * (procOffsets.hairSwayPx * 0.35)
        : 0;
      const ovWaveY = procOffsets.active
        ? Math.cos(procOffsets.timeSec * 1.8 + idx) * (procOffsets.hairVerticalWavePx * 0.45)
        : 0;
      const ox = ov.x * width + ovWaveX;
      const oy =
        ov.y * height - (ov.attachMouth ? activeLiftOffset * 0.5 : 0) + ovWaveY;
      const oRot =
        ((ov.rotationDeg || 0) * Math.PI) / 180 +
        (procOffsets.active ? procOffsets.headTiltRad * 0.35 : 0);
      const oFlip = ov.flipX ? -1 : 1;

      ctx.save();
      ctx.globalAlpha = Math.max(0.1, Math.min(1, ov.opacity ?? 1));
      ctx.translate(ox, oy);
      ctx.rotate(oRot);
      ctx.scale(ov.scale * oFlip, ov.scale);

      if (ovImg && ovImg.complete && ovImg.naturalWidth > 0) {
        const aspect = ovImg.naturalWidth / Math.max(1, ovImg.naturalHeight);
        const drawH = 280;
        const drawW = drawH * aspect;
        if (config.background.removeCharacterBg) {
          drawImageWithChromaCutout(
            ctx,
            ovImg,
            -drawW / 2,
            -drawH / 2,
            drawW,
            drawH,
            config.background.chromaKeyColor || '#FFFFFF',
            config.background.chromaTolerance || 42
          );
        } else {
          ctx.drawImage(ovImg, -drawW / 2, -drawH / 2, drawW, drawH);
        }
      }

      if (ov.attachMouth && config.layers.mouthLayer) {
        drawVisemeMouth(
          ctx,
          currentFrame.viseme,
          0,
          12,
          0.95 * config.mouthAnchor.scale,
          loadedSprites,
          config.mouthChartStyle,
          false,
          config.mouthAnchor.rotationDeg,
          config.lipstickStyle
        );
      }

      ctx.restore();
    }
  }

  // =========================================================================
  // LAYER 4: PROCEDURAL FLOATING LEAVES / FOLIAGE PASS
  // =========================================================================
  if (procOffsets.active && procOffsets.leavesCount > 0) {
    drawProceduralFoliageAndLeaves(
      ctx,
      width,
      height,
      procOffsets,
      'foreground-leaves'
    );
  }

  if (config.showHudTelemetry) {
    drawStageTelemetryHud(ctx, width, height, currentFrame, config.mouthChartStyle);
  }
}

function drawArjunCharacter(
  ctx: CanvasRenderingContext2D,
  jawDrop: number,
  isBlinking: boolean,
  loadedSprites: LoadedSpriteImages,
  proc?: ComputedProceduralOffsets
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 150, 115, 18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (loadedSprites.body && loadedSprites.body.complete) {
    ctx.drawImage(loadedSprites.body, -110, 35, 220, 130);
  } else {
    ctx.fillStyle = '#0284C7';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4.5;
    ctx.beginPath();
    ctx.moveTo(-98, 155);
    ctx.quadraticCurveTo(-92, 52, -45, 48);
    ctx.lineTo(45, 48);
    ctx.quadraticCurveTo(92, 52, 98, 155);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.moveTo(-36, 48);
    ctx.quadraticCurveTo(0, 74, 36, 48);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.fillStyle = '#E09F67';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.roundRect(-22, 16, 44, 42, 10);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  // Apply Procedural Head Position & Speech Tilt around the neck pivot (0, 18)
  if (proc?.active) {
    ctx.translate(proc.headOffsetX, 18 + proc.headOffsetY);
    ctx.rotate(proc.headTiltRad);
    ctx.translate(0, -18);
  }

  const hairSway = proc?.active ? proc.hairSwayPx : 0;
  const hairSec = proc?.active ? proc.hairSecondarySwayPx : 0;
  const hairVert = proc?.active ? proc.hairVerticalWavePx : 0;

  if (loadedSprites.head && loadedSprites.head.complete) {
    ctx.drawImage(loadedSprites.head, -115, -155, 230, 195);
  } else {
    ctx.fillStyle = '#E09F67';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(-86, -45, 16, 22, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.ellipse(86, -45, 16, 22, 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#F3B882';
    ctx.beginPath();
    ctx.moveTo(-82, -65);
    ctx.bezierCurveTo(-84, -142, 84, -142, 82, -65);
    ctx.bezierCurveTo(84, 5 + jawDrop * 0.45, 42, 34 + jawDrop * 0.75, 0, 34 + jawDrop * 0.75);
    ctx.bezierCurveTo(-42, 34 + jawDrop * 0.75, -84, 5 + jawDrop * 0.45, -82, -65);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(244, 63, 94, 0.18)';
    ctx.beginPath();
    ctx.ellipse(-48, -22, 16, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(48, -22, 16, 9, 0, 0, Math.PI * 2);
    ctx.fill();

    // Procedural Sine-Wave Animated Hair Silhouette + Flowing Hair Strands!
    ctx.fillStyle = '#1E293B';
    ctx.beginPath();
    ctx.moveTo(-85, -58);
    ctx.bezierCurveTo(
      -96 + hairSway * 0.45,
      -135 + hairVert * 0.5,
      -35 + hairSway * 0.95,
      -168 + hairVert,
      12 + hairSway * 1.15,
      -158 + hairVert * 0.7
    );
    ctx.bezierCurveTo(
      68 + hairSway * 0.9,
      -164 - hairVert * 0.6,
      98 + hairSec * 0.55,
      -120,
      84,
      -58
    );
    ctx.quadraticCurveTo(55 + hairSec * 0.6, -102 + hairVert * 0.4, 15 + hairSway * 0.5, -96);
    ctx.quadraticCurveTo(-22 + hairSway * 0.65, -110 - hairVert * 0.5, -52 + hairSec * 0.4, -92);
    ctx.quadraticCurveTo(-72, -90, -85, -58);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Dynamic procedural hair tufts on the crown that float smoothly with sine-wave offsets
    ctx.beginPath();
    ctx.moveTo(-14, -152);
    ctx.quadraticCurveTo(
      -4 + hairSway * 1.4,
      -182 + hairVert * 1.1,
      26 + hairSway * 1.65,
      -168 + hairVert * 0.9
    );
    ctx.quadraticCurveTo(8 + hairSway * 0.8, -154, -14, -152);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  const browY = -78 - (proc?.active ? Math.abs(proc.headOffsetY) * 0.35 : 0);
  if (loadedSprites.eyes && loadedSprites.eyes.complete) {
    ctx.drawImage(loadedSprites.eyes, -65, -75, 130, 42);
  } else {
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-54, browY + 3);
    ctx.quadraticCurveTo(-34, browY - 6, -16, browY + 1);
    ctx.moveTo(16, browY + 1);
    ctx.quadraticCurveTo(34, browY - 6, 54, browY + 3);
    ctx.stroke();

    if (isBlinking) {
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(-50, -52);
      ctx.quadraticCurveTo(-34, -46, -18, -52);
      ctx.moveTo(18, -52);
      ctx.quadraticCurveTo(34, -46, 50, -52);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#FFFFFF';
      ctx.strokeStyle = '#0F172A';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.ellipse(-34, -52, 17, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.ellipse(34, -52, 17, 19, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#0F172A';
      ctx.beginPath();
      ctx.arc(-32, -51, 8.5, 0, Math.PI * 2);
      ctx.arc(32, -51, 8.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(-35, -55, 3.2, 0, Math.PI * 2);
      ctx.arc(29, -55, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.2;
    ctx.beginPath();
    ctx.moveTo(0, -42);
    ctx.lineTo(-6, -24);
    ctx.lineTo(3, -21);
    ctx.stroke();
  }

  ctx.restore();
}

function drawMinaCharacter(
  ctx: CanvasRenderingContext2D,
  jawDrop: number,
  isBlinking: boolean,
  proc?: ComputedProceduralOffsets
) {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  ctx.beginPath();
  ctx.ellipse(0, 150, 110, 16, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = '#E11D48';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-90, 155);
  ctx.quadraticCurveTo(-84, 54, -40, 48);
  ctx.lineTo(40, 48);
  ctx.quadraticCurveTo(84, 54, 90, 155);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FCD3A1';
  ctx.beginPath();
  ctx.roundRect(-18, 18, 36, 38, 9);
  ctx.fill();
  ctx.stroke();

  ctx.save();
  // Apply Procedural Head Position & Speech Tilt around the neck pivot (0, 18)
  if (proc?.active) {
    ctx.translate(proc.headOffsetX, 18 + proc.headOffsetY);
    ctx.rotate(proc.headTiltRad);
    ctx.translate(0, -18);
  }

  const hairSway = proc?.active ? proc.hairSwayPx : 0;
  const hairSec = proc?.active ? proc.hairSecondarySwayPx : 0;
  const hairVert = proc?.active ? proc.hairVerticalWavePx : 0;

  // Animated twin hair buns / pigtails with continuous sine-wave spring offset
  ctx.fillStyle = '#312E81';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(-78 + hairSway * 0.9, -112 + hairVert * 0.95, 28, 0, Math.PI * 2);
  ctx.arc(78 + hairSec * 0.9, -112 - hairVert * 0.95, 28, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#FDE0BC';
  ctx.beginPath();
  ctx.moveTo(-78, -62);
  ctx.bezierCurveTo(-80, -138, 80, -138, 78, -62);
  ctx.bezierCurveTo(78, 8 + jawDrop * 0.4, 38, 32 + jawDrop * 0.7, 0, 32 + jawDrop * 0.7);
  ctx.bezierCurveTo(-38, 32 + jawDrop * 0.7, -78, 8 + jawDrop * 0.4, -78, -62);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Animated front bangs with continuous sine-wave flow
  ctx.fillStyle = '#3730A3';
  ctx.beginPath();
  ctx.moveTo(-80, -58);
  ctx.bezierCurveTo(
    -84 + hairSway * 0.45,
    -138 + hairVert * 0.4,
    84 + hairSway * 0.45,
    -138 - hairVert * 0.4,
    80,
    -58
  );
  ctx.quadraticCurveTo(45 + hairSway * 0.65, -95 + hairVert * 0.4, 18 + hairSway * 0.45, -76);
  ctx.quadraticCurveTo(0 + hairSec * 0.5, -104, -18 + hairSway * 0.45, -76);
  ctx.quadraticCurveTo(-45 + hairSway * 0.65, -95 - hairVert * 0.4, -80, -58);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  const browY = -76 - (proc?.active ? Math.abs(proc.headOffsetY) * 0.35 : 0);
  ctx.strokeStyle = '#1E1B4B';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.moveTo(-52, browY);
  ctx.quadraticCurveTo(-34, browY - 8, -16, browY);
  ctx.moveTo(16, browY);
  ctx.quadraticCurveTo(34, browY - 8, 52, browY);
  ctx.stroke();

  if (isBlinking) {
    ctx.beginPath();
    ctx.moveTo(-50, -48);
    ctx.quadraticCurveTo(-34, -40, -18, -48);
    ctx.moveTo(18, -48);
    ctx.quadraticCurveTo(34, -40, 50, -48);
    ctx.stroke();
  } else {
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#0F172A';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.ellipse(-34, -48, 18, 21, 0, 0, Math.PI * 2);
    ctx.ellipse(34, -48, 18, 21, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#4F46E5';
    ctx.beginPath();
    ctx.arc(-33, -47, 11, 0, Math.PI * 2);
    ctx.arc(33, -47, 11, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.arc(-33, -47, 6, 0, Math.PI * 2);
    ctx.arc(33, -47, 6, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(-37, -53, 4, 0, Math.PI * 2);
    ctx.arc(29, -53, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawRoboBotCharacter(
  ctx: CanvasRenderingContext2D,
  frame: AudioAnalysisFrame,
  jawDrop: number,
  isBlinking: boolean,
  _loadedSprites: LoadedSpriteImages,
  proc?: ComputedProceduralOffsets
) {
  ctx.fillStyle = '#334155';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.roundRect(-85, 52, 170, 102, 18);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#94A3B8';
  ctx.fillRect(-16, 15, 32, 42);
  ctx.strokeRect(-16, 15, 32, 42);

  ctx.save();
  if (proc?.active) {
    ctx.translate(proc.headOffsetX, 18 + proc.headOffsetY);
    ctx.rotate(proc.headTiltRad);
    ctx.translate(0, -18);
  }

  const antennaSway = proc?.active ? proc.hairSwayPx * 1.15 : 0;

  ctx.strokeStyle = '#64748B';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(0, -130);
  ctx.quadraticCurveTo(antennaSway * 0.45, -148, antennaSway, -162);
  ctx.stroke();

  const beaconColor = VISEME_LIBRARY[frame.viseme].color;
  ctx.fillStyle = beaconColor;
  ctx.beginPath();
  ctx.arc(antennaSway, -168, 10 + frame.rms * 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#475569';
  ctx.strokeStyle = '#0F172A';
  ctx.lineWidth = 4.5;
  ctx.beginPath();
  ctx.roundRect(-88, -130, 176, 162 + jawDrop * 0.6, 24);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#090D16';
  ctx.beginPath();
  ctx.roundRect(-70, -104, 140, 58, 12);
  ctx.fill();

  ctx.fillStyle = '#38BDF8';
  if (isBlinking) {
    ctx.fillRect(-52, -76, 32, 5);
    ctx.fillRect(20, -76, 32, 5);
  } else {
    ctx.beginPath();
    ctx.roundRect(-52, -90 - frame.browLiftPx * 0.4, 32, 28, 6);
    ctx.roundRect(20, -90 - frame.browLiftPx * 0.4, 32, 28, 6);
    ctx.fill();
  }

  ctx.restore();
}

function drawStageTelemetryHud(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  frame: AudioAnalysisFrame,
  chartStyle: MouthChartStyleId
) {
  const meta = VISEME_LIBRARY[frame.viseme];

  ctx.save();
  ctx.fillStyle = 'rgba(11, 15, 23, 0.85)';
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.2)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(18, 18, 345, 92, 8);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = chartStyle === 'manga-bw' ? '#F8FAFC' : '#F3EFEA';
  ctx.strokeStyle = meta.color;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(28, 28, 76, 72, 6);
  ctx.fill();
  ctx.stroke();

  drawVisemeMouth(ctx, frame.viseme, 66, 62, 0.78, {}, chartStyle, false, 0);

  ctx.textAlign = 'left';
  ctx.fillStyle = meta.color;
  ctx.font = '700 13px "JetBrains Mono", monospace';
  ctx.fillText(
    frame.isDropped ? 'NO AUDIO · AUTO DROPPED' : `CHART: [ ${meta.shortCode} ]`,
    116,
    45
  );

  ctx.fillStyle = '#F8FAFC';
  ctx.font = '600 13px "Plus Jakarta Sans", sans-serif';
  ctx.fillText(meta.nameBn, 116, 67);

  ctx.fillStyle = '#CBD5E1';
  ctx.font = '500 12px "JetBrains Mono", monospace';
  ctx.fillText(
    `F:${String(frame.frame).padStart(4, '0')} · ${frame.db.toFixed(1)}dB · ${
      frame.isDropped ? 'Mouth Drop (0px)' : `Lift +${frame.liftY.toFixed(1)}px`
    }`,
    116,
    90
  );

  const meterX = width - 38;
  const meterY = 24;
  const meterH = height - 48;
  ctx.fillStyle = 'rgba(11, 15, 23, 0.78)';
  ctx.beginPath();
  ctx.roundRect(meterX - 6, meterY, 24, meterH, 6);
  ctx.fill();
  ctx.stroke();

  const fillRatio = Math.max(0, Math.min(1, (frame.db + 60) / 60));
  const activeBarH = fillRatio * (meterH - 16);
  const barGrad = ctx.createLinearGradient(0, meterY + meterH, 0, meterY);
  barGrad.addColorStop(0, '#10B981');
  barGrad.addColorStop(0.65, '#F59E0B');
  barGrad.addColorStop(1, '#EF4444');
  ctx.fillStyle = barGrad;
  ctx.beginPath();
  ctx.roundRect(meterX, meterY + meterH - 8 - activeBarH, 12, activeBarH, 3);
  ctx.fill();

  ctx.restore();
}
