import JSZip from 'jszip';
import {
  CustomSpriteMap,
  EngineConfig,
  LipSyncCue,
  MOUTH_CHART_12_ORDER,
  MotionPhase,
  VisemeCode,
  ZipAssetEntry,
} from '../types/studio';

/**
 * Normalizes any phoneme string or legacy code to one of the 12 Mouth Chart VisemeCodes (or DROP).
 */
export function normalizeToMouthChartCode(raw: string): VisemeCode {
  const clean = raw.trim().toUpperCase();

  // Direct match
  for (const val of Object.values(VisemeCode)) {
    if (val.toUpperCase() === clean) return val;
  }

  if (clean === 'X' || clean.includes('DROP') || clean.includes('SILENCE') || clean.includes('NEUTRAL') || clean.includes('REST')) {
    return VisemeCode.DROP;
  }
  if (clean === 'A' || clean === 'M' || clean.includes('BMP') || clean.includes('B,M,P') || clean.includes('CLOSED')) {
    return VisemeCode.BMP;
  }
  if (clean === 'D' || clean.includes('AEI') || clean.includes('A,E,I') || clean === 'AH' || clean === 'AA') {
    return VisemeCode.AEI;
  }
  if (clean === 'H' || clean === 'L') {
    return VisemeCode.L;
  }
  if (clean.includes('QW') || clean.includes('Q,W') || clean === 'W' || clean === 'R' || clean.includes('WO')) {
    return VisemeCode.QW;
  }
  if (clean.includes('TH')) {
    return VisemeCode.TH;
  }
  if (clean === 'N' || clean === 'NG') {
    return VisemeCode.N;
  }
  if (clean === 'B' || clean.includes('CDGK') || clean.includes('C,D,G') || clean === 'S' || clean === 'K' || clean === 'T') {
    return VisemeCode.CDGK;
  }
  if (clean === 'G' || clean === 'F' || clean === 'V' || clean.includes('FV') || clean.includes('F,V')) {
    return VisemeCode.FV;
  }
  if (clean === 'C' || clean === 'EE' || clean.includes('SMILE')) {
    return VisemeCode.EE;
  }
  if (clean === 'E' || clean === 'O' || clean.includes('OH') || clean.includes('SURPRISED')) {
    return VisemeCode.O;
  }
  if (clean === 'F_OLD' || clean === 'U' || clean === 'UH' || clean === 'OO') {
    return VisemeCode.U;
  }
  if (clean.includes('CH') || clean.includes('SH') || clean === 'J') {
    return VisemeCode.CHJSH;
  }

  return VisemeCode.CDGK;
}

export function inferSpriteTargetFromFilename(
  filename: string
): VisemeCode | 'head' | 'body' | 'eyes' | 'unassigned' {
  const base = filename
    .split('/')
    .pop()!
    .replace(/\.[^/.]+$/, '')
    .trim()
    .toLowerCase();

  if (base.includes('head') || base.includes('face')) return 'head';
  if (base.includes('body') || base.includes('torso')) return 'body';
  if (base.includes('eye')) return 'eyes';

  if (base === 'x' || base.includes('drop') || base.includes('silence') || base.includes('neutral') || base.includes('rest')) {
    return VisemeCode.DROP;
  }
  if (base.includes('aei') || base.includes('a_e_i') || base === 'ah' || base === '01' || base === '1') {
    return VisemeCode.AEI;
  }
  if (base === 'l' || base === 'mouth_l' || base === '02' || base === '2') {
    return VisemeCode.L;
  }
  if (base.includes('qw') || base.includes('q_w') || base === 'w' || base === '03' || base === '3') {
    return VisemeCode.QW;
  }
  if (base.includes('th') || base === '04' || base === '4') {
    return VisemeCode.TH;
  }
  if (base === 'n' || base === 'mouth_n' || base === '05' || base === '5') {
    return VisemeCode.N;
  }
  if (base.includes('cdg') || base.includes('stz') || base === 's' || base === '06' || base === '6') {
    return VisemeCode.CDGK;
  }
  if (base.includes('bmp') || base.includes('b_m_p') || base === 'm' || base === 'closed' || base === '07' || base === '7') {
    return VisemeCode.BMP;
  }
  if (base.includes('fv') || base.includes('f_v') || base === 'f' || base === '08' || base === '8') {
    return VisemeCode.FV;
  }
  if (base.includes('ee') || base.includes('smile') || base === '09' || base === '9') {
    return VisemeCode.EE;
  }
  if (base === 'o' || base.includes('oh') || base === '10') {
    return VisemeCode.O;
  }
  if (base === 'u' || base === 'uh' || base === '11') {
    return VisemeCode.U;
  }
  if (base.includes('ch') || base.includes('sh') || base === '12') {
    return VisemeCode.CHJSH;
  }

  return 'unassigned';
}

/**
 * Automatically slices a single uploaded Mouth Chart Sheet image (like the 4x3, 3x3, or 2x5 sheets)
 * into individual transparent mouth sprites and maps them to the 12 Mouth Chart expressions!
 */
export async function sliceMouthChartSheetImage(
  file: File,
  cols = 4,
  rows = 3,
  removeSolidBackground = true
): Promise<CustomSpriteMap> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const sheetW = img.naturalWidth;
      const sheetH = img.naturalHeight;
      const cellW = Math.floor(sheetW / cols);
      const cellH = Math.floor(sheetH / rows);

      const spriteMap: CustomSpriteMap = {};
      const order = MOUTH_CHART_12_ORDER;

      let cellIndex = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (cellIndex >= order.length) break;

          const canvas = document.createElement('canvas');
          // Crop inner 82% of the cell to exclude text captions below each mouth on reference charts
          const cropW = Math.floor(cellW * 0.88);
          const cropH = Math.floor(cellH * 0.72);
          const offsetX = Math.floor(c * cellW + cellW * 0.06);
          const offsetY = Math.floor(r * cellH + cellH * 0.06);

          canvas.width = cropW;
          canvas.height = cropH;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, offsetX, offsetY, cropW, cropH, 0, 0, cropW, cropH);

            if (removeSolidBackground) {
              const imgData = ctx.getImageData(0, 0, cropW, cropH);
              const d = imgData.data;
              // Sample top-left corner pixel as background color key
              const bgR = d[0];
              const bgG = d[1];
              const bgB = d[2];
              const tolerance = 38;

              for (let i = 0; i < d.length; i += 4) {
                const dr = Math.abs(d[i] - bgR);
                const dg = Math.abs(d[i + 1] - bgG);
                const db = Math.abs(d[i + 2] - bgB);
                if (dr + dg + db < tolerance * 2.4) {
                  d[i + 3] = 0; // Make background transparent
                }
              }
              ctx.putImageData(imgData, 0, 0);
            }

            const dataUrl = canvas.toDataURL('image/png');
            const targetViseme = order[cellIndex];
            spriteMap[targetViseme] = dataUrl;
          }

          cellIndex++;
        }
      }

      // Also assign BMP or first closed-looking sprite to DROP fallback if needed
      URL.revokeObjectURL(url);
      resolve(spriteMap);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load mouth chart sheet image'));
    };
    img.src = url;
  });
}

export async function parseUploadedZipFile(file: File): Promise<{
  entries: ZipAssetEntry[];
  spriteMap: CustomSpriteMap;
  parsedCues: LipSyncCue[] | null;
  parsedConfigPartial: Partial<EngineConfig> | null;
  rawListingText: string | null;
}> {
  const zip = await JSZip.loadAsync(file);
  const entries: ZipAssetEntry[] = [];
  const spriteMap: CustomSpriteMap = {};
  let parsedCues: LipSyncCue[] | null = null;
  let parsedConfigPartial: Partial<EngineConfig> | null = null;
  let rawListingText: string | null = null;

  const fileNames = Object.keys(zip.files).sort();

  for (const relativePath of fileNames) {
    const zipObj = zip.files[relativePath];
    if (zipObj.dir) continue;
    if (relativePath.includes('__MACOSX') || relativePath.split('/').pop()?.startsWith('._')) {
      continue;
    }

    const cleanName = relativePath.split('/').pop() || relativePath;
    const ext = cleanName.split('.').pop()?.toLowerCase() || '';

    if (['png', 'jpg', 'jpeg', 'webp', 'svg', 'gif'].includes(ext)) {
      const blob = await zipObj.async('blob');
      const mimeMap: Record<string, string> = {
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        webp: 'image/webp',
        svg: 'image/svg+xml',
        gif: 'image/gif',
      };
      const typedBlob = new Blob([blob], { type: mimeMap[ext] || 'image/png' });
      const blobUrl = URL.createObjectURL(typedBlob);
      const assignedTarget = inferSpriteTargetFromFilename(cleanName);

      if (assignedTarget !== 'unassigned') {
        spriteMap[assignedTarget] = blobUrl;
      }

      entries.push({
        filename: cleanName,
        path: relativePath,
        type: 'sprite',
        blobUrl,
        assignedTarget,
        sizeBytes: typedBlob.size,
      });
    } else if (['json', 'tsv', 'csv', 'dat', 'txt'].includes(ext)) {
      const textContent = await zipObj.async('string');
      const u8 = await zipObj.async('uint8array');
      entries.push({
        filename: cleanName,
        path: relativePath,
        type: 'listing',
        textContent,
        sizeBytes: u8.byteLength,
      });

      if (!rawListingText) {
        rawListingText = textContent;
      }

      const parsed = parseListingText(textContent, 24);
      if (parsed.cues.length > 0 && !parsedCues) {
        parsedCues = parsed.cues;
      }
      if (parsed.configPartial && !parsedConfigPartial) {
        parsedConfigPartial = parsed.configPartial;
      }
    } else {
      const u8 = await zipObj.async('uint8array');
      entries.push({
        filename: cleanName,
        path: relativePath,
        type: 'other',
        sizeBytes: u8.byteLength,
      });
    }
  }

  const unassignedSprites = entries.filter(
    (e) => e.type === 'sprite' && e.assignedTarget === 'unassigned' && e.blobUrl
  );
  let orderIdx = 0;
  for (const entry of unassignedSprites) {
    while (orderIdx < MOUTH_CHART_12_ORDER.length && spriteMap[MOUTH_CHART_12_ORDER[orderIdx]]) {
      orderIdx++;
    }
    if (orderIdx < MOUTH_CHART_12_ORDER.length && entry.blobUrl) {
      const code = MOUTH_CHART_12_ORDER[orderIdx];
      entry.assignedTarget = code;
      spriteMap[code] = entry.blobUrl;
      orderIdx++;
    }
  }

  return {
    entries,
    spriteMap,
    parsedCues,
    parsedConfigPartial,
    rawListingText,
  };
}

export function parseListingText(
  text: string,
  defaultFps = 24
): { cues: LipSyncCue[]; configPartial: Partial<EngineConfig> | null } {
  const trimmed = text.trim();
  if (!trimmed) return { cues: [], configPartial: null };

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const obj = JSON.parse(trimmed);
      const rawArray = Array.isArray(obj)
        ? obj
        : Array.isArray(obj.activeAutoListing)
        ? obj.activeAutoListing
        : Array.isArray(obj.cues)
        ? obj.cues
        : Array.isArray(obj.mouthCues)
        ? obj.mouthCues
        : [];

      const fps = Number(obj.config?.fps || obj.fps || defaultFps);
      const cues: LipSyncCue[] = [];

      for (let i = 0; i < rawArray.length; i++) {
        const item = rawArray[i];
        const rawCode = String(item.mouthChart || item.viseme || item.value || item.mouth || 'DROP');
        const viseme = normalizeToMouthChartCode(rawCode);
        const isDropped = viseme === VisemeCode.DROP;

        const startTime = Number(item.startTime ?? item.start ?? (item.startFrame || 0) / fps);
        const endTime = Number(
          item.endTime ?? item.end ?? (item.endFrame ? (item.endFrame + 1) / fps : startTime + 0.12)
        );
        const startFrame = Number(item.startFrame ?? Math.round(startTime * fps));
        const endFrame = Number(
          item.endFrame ?? Math.max(startFrame, Math.round(endTime * fps) - 1)
        );
        const liftPx = isDropped
          ? 0
          : Number(item.liftPx ?? (viseme === VisemeCode.AEI || viseme === VisemeCode.O ? 24 : 12));
        const phase = (item.phase ||
          (isDropped
            ? MotionPhase.SILENCE
            : viseme === VisemeCode.AEI || viseme === VisemeCode.O
            ? MotionPhase.PEAK
            : MotionPhase.HOLD)) as MotionPhase;

        cues.push({
          id: `imported-json-${i}`,
          startFrame,
          endFrame,
          startTime: Number(startTime.toFixed(3)),
          endTime: Number(endTime.toFixed(3)),
          viseme,
          phase,
          peakDb: Number(item.peakDb ?? (isDropped ? -55 : -12)),
          avgRms: Number(item.avgRms ?? (isDropped ? 0.01 : 0.45)),
          liftPx,
          isDropped,
          locked: true,
        });
      }

      const configPartial: Partial<EngineConfig> | null = obj.config
        ? {
            fps: obj.config.fps,
            silenceThresholdDb: obj.config.silenceThresholdDb,
            peakThresholdDb: obj.config.peakThresholdDb,
            maxLiftPx: obj.config.maxLiftPx,
            holdSmoothingFrames: obj.config.holdSmoothingFrames,
          }
        : null;

      return { cues, configPartial };
    } catch {
      // Fall through
    }
  }

  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  if (lines[0]?.toLowerCase().startsWith('mohoswitch')) {
    const entries: Array<{ frame: number; viseme: VisemeCode }> = [];
    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(/\s+/);
      if (parts.length >= 2) {
        const frameNum = parseInt(parts[0], 10);
        const viseme = normalizeToMouthChartCode(parts.slice(1).join(''));
        if (!isNaN(frameNum)) {
          entries.push({ frame: Math.max(0, frameNum - 1), viseme });
        }
      }
    }
    const cues: LipSyncCue[] = [];
    for (let i = 0; i < entries.length; i++) {
      const cur = entries[i];
      const nextFrame = i < entries.length - 1 ? entries[i + 1].frame - 1 : cur.frame + 4;
      const isDropped = cur.viseme === VisemeCode.DROP;
      cues.push({
        id: `moho-${i}`,
        startFrame: cur.frame,
        endFrame: Math.max(cur.frame, nextFrame),
        startTime: Number((cur.frame / defaultFps).toFixed(3)),
        endTime: Number(((nextFrame + 1) / defaultFps).toFixed(3)),
        viseme: cur.viseme,
        phase: isDropped ? MotionPhase.SILENCE : MotionPhase.HOLD,
        peakDb: isDropped ? -55 : -14,
        avgRms: isDropped ? 0.01 : 0.5,
        liftPx: isDropped ? 0 : cur.viseme === VisemeCode.AEI ? 24 : 10,
        isDropped,
        locked: true,
      });
    }
    return { cues, configPartial: null };
  }

  const cues: LipSyncCue[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.toLowerCase().startsWith('start')) continue;
    const parts = line.split(/\t+/).map((s) => s.trim());
    if (parts.length >= 2) {
      const t0 = parseFloat(parts[0]);
      const t1 = parts.length >= 3 ? parseFloat(parts[1]) : t0 + 0.15;
      const rawViseme = parts.length >= 3 ? parts[2] : parts[1];
      if (!isNaN(t0)) {
        const viseme = normalizeToMouthChartCode(rawViseme);
        const isDropped = viseme === VisemeCode.DROP;
        const startFrame = Math.round(t0 * defaultFps);
        const endFrame = Math.max(
          startFrame,
          Math.round((isNaN(t1) ? t0 + 0.15 : t1) * defaultFps) - 1
        );
        const liftPx =
          parts[3] && !isNaN(parseFloat(parts[3]))
            ? parseFloat(parts[3])
            : isDropped
            ? 0
            : viseme === VisemeCode.AEI
            ? 24
            : 12;

        cues.push({
          id: `tsv-${i}`,
          startFrame,
          endFrame,
          startTime: Number(t0.toFixed(3)),
          endTime: Number((isNaN(t1) ? t0 + 0.15 : t1).toFixed(3)),
          viseme,
          phase: isDropped
            ? MotionPhase.SILENCE
            : viseme === VisemeCode.AEI
            ? MotionPhase.PEAK
            : MotionPhase.HOLD,
          peakDb: isDropped ? -55 : -15,
          avgRms: isDropped ? 0.01 : 0.48,
          liftPx,
          isDropped,
          locked: true,
        });
      }
    }
  }

  return { cues, configPartial: null };
}

/**
 * Formats the auto-listing code. When `config.autoDropSilentCues` is true,
 * silent intervals (`isDropped === true`) are automatically omitted from the active cue list
 * ("যেখানে কোন অডিও পাবে না মাথায় ড্রপ হবে সেখানে কোন লাগবে না যেখানে চলবে অ্যানিমেশন এর অটো লিস্টিং করা হবে").
 */
export function formatListingCode(
  cues: LipSyncCue[],
  config: EngineConfig,
  format: 'json' | 'tsv' | 'moho' | 'js-code'
): string {
  const exportedCues = config.autoDropSilentCues
    ? cues.filter((c) => !c.isDropped)
    : cues;

  if (format === 'json') {
    const payload = {
      studio: 'ToonSync 2D Mouth-Chart Auto-Listing',
      chartStyle: config.mouthChartStyle,
      silentFramesDropped: config.autoDropSilentCues,
      config: {
        fps: config.fps,
        silenceThresholdDb: config.silenceThresholdDb,
        peakThresholdDb: config.peakThresholdDb,
        maxLiftPx: config.maxLiftPx,
        holdSmoothingFrames: config.holdSmoothingFrames,
      },
      activeAutoListing: exportedCues.map((c) => ({
        startFrame: c.startFrame,
        endFrame: c.endFrame,
        startTime: c.startTime,
        endTime: c.endTime,
        mouthChart: c.viseme,
        phase: c.phase,
        peakDb: c.peakDb,
        liftPx: c.liftPx,
      })),
    };
    return JSON.stringify(payload, null, 2);
  }

  if (format === 'tsv') {
    const header = '# startTime\tendTime\tmouthChartShape\tliftPx\tphase\tpeakDb';
    const rows = exportedCues.map(
      (c) =>
        `${c.startTime.toFixed(3)}\t${c.endTime.toFixed(3)}\t${c.viseme}\t${c.liftPx}\t${c.phase}\t${c.peakDb}`
    );
    return [header, ...rows].join('\n');
  }

  if (format === 'moho') {
    const lines = ['MohoSwitch1'];
    // In Moho switch layers, include all transitions so silent frames switch back to DROP/Rest
    for (const c of cues) {
      lines.push(`${c.startFrame + 1} ${c.viseme}`);
    }
    return lines.join('\n');
  }

  return `// Deterministic 12-Mouth-Chart Auto-Listing Engine (Zero AI)
// Active Chart Shapes: A,E,I | L | Q,W | TH | N | C,D,G,K,S,T | B,M,P | F,V | EE | O | U | CH,J,SH
// Silent Audio Frames (< ${config.silenceThresholdDb}dB): AUTO-DROPPED (No Mouth Cue Needed)

export const MOUTH_CHART_AUTO_LISTING = ${JSON.stringify(
    exportedCues.map((c) => ({
      frames: `${c.startFrame}-${c.endFrame}`,
      time: `${c.startTime}s-${c.endTime}s`,
      mouthChart: c.viseme,
      liftPx: c.liftPx,
    })),
    null,
    2
  )};`;
}

export async function exportStudioZipBundle(
  cues: LipSyncCue[],
  config: EngineConfig,
  projectName = 'toonsync-mouth-chart-listing'
): Promise<void> {
  const zip = new JSZip();

  zip.file('mouth_chart_auto_listing.json', formatListingCode(cues, config, 'json'));
  zip.file('mouth_chart_cues.tsv', formatListingCode(cues, config, 'tsv'));
  zip.file('moho_mouth_switch.dat', formatListingCode(cues, config, 'moho'));
  zip.file('mouth_chart_rules.js', formatListingCode(cues, config, 'js-code'));

  const blob = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${projectName}.zip`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
