export enum VisemeCode {
  DROP = 'DROP',         // Silent / No Audio -> Mouth Dropped / Closed Neutral
  BMP = 'B,M,P',         // Chart #1: Closed Lips (B, M, P)
  AEI = 'A,E,I',         // Chart #2: Wide Open Mouth + Tongue (A, E, I)
  L = 'L',               // Chart #3: Open Mouth + Raised Tongue Tip (L)
  QW = 'Q,W',            // Chart #4: Small Round Pucker (Q, W)
  TH = 'TH',             // Chart #5: Tongue Between Teeth (TH)
  N = 'N',               // Chart #6: Parted Lips + Teeth Line (N)
  CDGK = 'C,D,G,K,S,T',  // Chart #7: Clenched Teeth Grin (C, D, G, K, N, R, S, T, X, Y, Z)
  FV = 'F,V',            // Chart #8: Upper Teeth on Lower Lip (F, V)
  EE = 'EE',             // Chart #9: Wide Smile + Teeth (EE)
  O = 'O',               // Chart #10: Vertical Oval Open (O)
  U = 'U',               // Chart #11: Medium Round Open (U)
  CHJSH = 'CH,J,SH',     // Chart #12: Flared Square Pursed Lips (CH, J, SH)
}

export const MOUTH_CHART_12_ORDER: VisemeCode[] = [
  VisemeCode.BMP,
  VisemeCode.AEI,
  VisemeCode.L,
  VisemeCode.QW,
  VisemeCode.TH,
  VisemeCode.N,
  VisemeCode.CDGK,
  VisemeCode.FV,
  VisemeCode.EE,
  VisemeCode.O,
  VisemeCode.U,
  VisemeCode.CHJSH,
];

export enum MotionPhase {
  SILENCE = 'SILENCE_DROP',
  RISING = 'RISING_LIFT',
  PEAK = 'PEAK_OPEN',
  HOLD = 'ACTIVE_HOLD',
  FALLING = 'FALLING_CLOSE',
}

export type MouthChartStyleId =
  | 'studio-12'
  | 'cartoon-34'
  | 'manga-bw'
  | 'toon-boom'
  | 'anime-cel'
  | 'chibi-pop';

export type CharacterPresetId =
  | 'arjun-2d'
  | 'mina-toon'
  | 'robobot-rig'
  | 'custom-character'
  | 'mouth-only-overlay';

export interface VisemeMetadata {
  code: VisemeCode;
  chartNumber: number; // 0 for DROP, 1..12 for the 12 chart shapes
  shortCode: string;
  nameBn: string;
  nameEn: string;
  phonemes: string;
  jawOpenness: number; // 0.0 to 1.0
  lipWidth: number;    // 0.4 to 1.25
  mouthOpenness: number;
  mouthWidth: number;
  defaultLiftPx: number;
  color: string;
  badgeBg: string;
  descriptionBn: string;
}

export interface AudioAnalysisFrame {
  frame: number;
  time?: number;
  timeSec?: number;
  rms: number;           // 0.0 to 1.0 normalized amplitude
  db: number;            // -60 to 0 dB
  deltaRms: number;      // Frame-to-frame derivative (rising vs falling)
  zcr?: number;
  centroid?: number;
  zeroCrossingRate?: number;
  spectralCentroid?: number;
  viseme: VisemeCode;
  phase: MotionPhase;
  liftY: number;         // Vertical character/jaw lift in px
  squashStretch?: number;
  squashX?: number;      // Horizontal scale factor
  stretchY?: number;     // Vertical scale factor
  headTiltDeg: number;   // Subtle head/jaw tilt angle
  browLiftPx: number;    // Eyebrow lift on vocal peaks
  isDropped: boolean;    // True when silent (below threshold) -> mouth dropped
}

export interface LipSyncCue {
  id: string;
  startFrame: number;
  endFrame: number;
  startTime: number;
  endTime: number;
  viseme: VisemeCode;
  phase: MotionPhase;
  avgRms?: number;
  peakRms?: number;
  peakDb?: number;
  liftPx: number;
  isDropped?: boolean;
  locked?: boolean;
  isManualOverride?: boolean;
  note?: string;
}

export type CustomSpriteMap = Partial<
  Record<
    VisemeCode | 'head' | 'body' | 'eyes' | 'customCharacter' | 'customBackground',
    string
  >
>;

export interface ZipAssetEntry {
  filename: string;
  fileName?: string;
  path?: string;
  type: 'listing' | 'sprite' | 'audio' | 'config' | 'other' | 'unknown';
  sizeBytes?: number;
  assignedTarget?: VisemeCode | 'head' | 'body' | 'eyes' | 'customCharacter' | 'unassigned';
  mappedTarget?: VisemeCode | 'head' | 'body' | 'eyes' | 'customCharacter' | 'unassigned';
  blobUrl?: string;
  previewUrl?: string;
  textContent?: string;
  rawText?: string;
}

export interface MouthAnchorConfig {
  offsetX: number;              // Relative X offset on character/stage (-960 to +960 px)
  offsetY: number;              // Relative Y offset on character/stage (-960 to +960 px)
  lipSegmentOffsetX?: number;   // Independent Lip Segment X offset (-500 to +500 px)
  lipSegmentOffsetY?: number;   // Independent Lip Segment Y offset (-500 to +500 px)
  upperLipOffsetY?: number;     // Independent Upper Lip vertical shift (-45 to +45 px)
  lowerLipOffsetY?: number;     // Independent Lower Lip vertical shift (-45 to +45 px)
  scale: number;                // Mouth size multiplier (0.25 to 3.5)
  rotationDeg: number;          // Mouth angle (-180 to +180 deg)
  flipX?: boolean;              // Horizontal flip for mouth/lip segment
  skinMaskEnabled: boolean;     // Covers original painted static mouth on uploaded image
  skinMaskColor: string;        // Hex color of skin patch
  skinMaskRadius: number;       // Size of skin cover ellipse
}

export interface CharacterTransformConfig {
  x: number;               // Normalized 0.1 to 0.9 across stage width (default 0.5)
  y: number;               // Normalized 0.1 to 0.9 across stage height (default 0.64)
  scale: number;           // Character overall scale (0.25 to 3.0, default 1.0)
  rotationDeg?: number;    // Character rotation in degrees (-180 to +180, default 0)
  flipX?: boolean;         // Horizontal flip
}

export interface CharacterOverlayElement {
  id: string;
  name: string;
  imageUrl: string;
  x: number;               // Normalized 0.05 to 0.95 across stage width
  y: number;               // Normalized 0.05 to 0.95 across stage height
  scale: number;           // 0.2 to 3.0
  rotationDeg: number;     // -180 to +180
  flipX: boolean;
  opacity: number;         // 0.1 to 1.0
  visible: boolean;
  attachMouth?: boolean;   // If true, the talking mouth follows this overlay character!
}

export interface TimelineSplitClip {
  id: string;
  label: string;
  startTime: number;
  endTime: number;
  lipSyncEnabled: boolean;
  muted: boolean;
  color: string;
}

export type SelectedCanvasLayer =
  | 'mouth'
  | 'lip-segment'
  | 'tracker'
  | 'character'
  | 'overlay'
  | 'background'
  | 'none';

export type PerKeyLiftMap = Record<VisemeCode, number>;

export interface LipstickStyleConfig {
  presetId: 'classic-ink' | 'ruby-red' | 'coral-pink' | 'berry-plum' | 'matte-nude' | 'custom';
  lipColor: string;
  lipThickness: number;    // 0.6 to 2.2 multiplier
  lipGloss: boolean;       // Specular highlight on lower lip
  teethColor: string;
  tongueColor: string;
}

export type ExportResolutionId = 'youtube-1080p' | 'hd-720p' | 'reels-9-16' | 'square-1-1';

export interface ExportResolutionSpec {
  id: ExportResolutionId;
  label: string;
  shortLabel?: string;
  width: number;
  height: number;
  aspectLabel: string;
}

export const EXPORT_RESOLUTIONS: Record<ExportResolutionId, ExportResolutionSpec> = {
  'youtube-1080p': {
    id: 'youtube-1080p',
    label: '1080p Full HD (16:9)',
    shortLabel: '1080p · 16:9',
    width: 1920,
    height: 1080,
    aspectLabel: '16:9',
  },
  'hd-720p': {
    id: 'hd-720p',
    label: '720p Studio HD (16:9)',
    shortLabel: '720p · 16:9',
    width: 1280,
    height: 720,
    aspectLabel: '16:9',
  },
  'reels-9-16': {
    id: 'reels-9-16',
    label: '1080x1920 Shorts/Reels (9:16)',
    shortLabel: 'Shorts · 9:16',
    width: 1080,
    height: 1920,
    aspectLabel: '9:16',
  },
  'square-1-1': {
    id: 'square-1-1',
    label: '1080x1080 Square (1:1)',
    shortLabel: 'Square · 1:1',
    width: 1080,
    height: 1080,
    aspectLabel: '1:1',
  },
};

export const DEFAULT_PER_KEY_LIFT: PerKeyLiftMap = {
  [VisemeCode.DROP]: 0,
  [VisemeCode.BMP]: 4,
  [VisemeCode.AEI]: 24,
  [VisemeCode.L]: 15,
  [VisemeCode.QW]: 11,
  [VisemeCode.TH]: 10,
  [VisemeCode.N]: 9,
  [VisemeCode.CDGK]: 8,
  [VisemeCode.FV]: 7,
  [VisemeCode.EE]: 14,
  [VisemeCode.O]: 26,
  [VisemeCode.U]: 16,
  [VisemeCode.CHJSH]: 12,
};

export type BackgroundMode = 'solid' | 'gradient' | 'green-screen' | 'custom-image';

export interface BackgroundConfig {
  mode: BackgroundMode;
  color1: string;
  color2: string;
  customBgUrl?: string;
  removeCharacterBg: boolean; // Auto Chroma-Key background removal on uploaded character/video
  chromaKeyColor: string;     // Default #FFFFFF or sampled corner color
  chromaTolerance: number;    // 5 to 120
  offsetX?: number;           // Direct movable background X offset in px
  offsetY?: number;           // Direct movable background Y offset in px
  scale?: number;             // Background zoom scale (default 1.0)
}

export interface MouthTrackerConfig {
  enabled: boolean;           // Auto-track moving character's mouth across video frames
  showTrackBox: boolean;      // Kept false so preview screen stays clean without tracking overlays
  searchRadiusPx: number;     // Search window radius per frame (20 to 160 px)
  smoothing: number;          // 0.0 to 0.9 tracking stabilization
  trackAnchorX?: number;      // Independent tracking sensor X position on character (-960 to +960 px)
  trackAnchorY?: number;      // Independent tracking sensor Y position on character (-960 to +960 px)
  isInitialized?: boolean;
}

export type LiftingTargetMode = 'mouth-only' | 'character-and-mouth' | 'character-only';

export type ProceduralTriggerMode =
  | 'audio-idle-hybrid'
  | 'audio-frequency'
  | 'idle-sine';

export interface ProceduralAnimationConfig {
  enabled: boolean;
  triggerMode: ProceduralTriggerMode;
  headTiltWithSpeech: boolean;
  headTiltIntensity: number;       // 0 to 100 (default 68)
  hairMovementIntensity: number;   // 0 to 100 (default 65)
  leavesFloatIntensity: number;    // 0 to 100 (default 62)
  leavesCount: number;             // 0 to 28 (default 12)
  waveSpeedHz: number;             // 0.3 to 3.5 (default 1.3)
  physicsSpringDamping: number;    // 10 to 95 (default 68)
}

export const DEFAULT_PROCEDURAL_ANIMATION: ProceduralAnimationConfig = {
  enabled: true,
  triggerMode: 'audio-idle-hybrid',
  headTiltWithSpeech: true,
  headTiltIntensity: 68,
  hairMovementIntensity: 65,
  leavesFloatIntensity: 62,
  leavesCount: 12,
  waveSpeedHz: 1.3,
  physicsSpringDamping: 68,
};

export interface LocalStudioProject {
  id: string;
  name: string;
  description: string;
  date: string;                    // YYYY-MM-DD user-input or creation date
  createdAt: number;
  updatedAt: number;
  thumbnailDataUrl?: string;
  config: EngineConfig;
  cues?: LipSyncCue[];
  splitClips?: TimelineSplitClip[];
  characterOverlays?: CharacterOverlayElement[];
  customSprites?: CustomSpriteMap;
  mediaSourceTitle?: string;
}

export interface LayerVisibilityConfig {
  mouthLayer: boolean;
  characterLayer: boolean;
  overlayLayer?: boolean;
  liftingLayer?: boolean;
  proceduralLayer?: boolean;
  backgroundLayer: boolean;
}

export interface TrackedPoint {
  offsetX: number;
  offsetY: number;
  confidence: number;
}

export interface EngineConfig {
  fps: number;                  // 12, 24, 30, 60
  silenceThresholdDb: number;   // e.g. -42 dB (below this -> VisemeCode.DROP)
  risingSensitivity: number;    // Delta RMS threshold to trigger RISING phase
  peakThresholdDb: number;      // e.g. -14 dB (triggers wide open AEI / O + max lift)
  maxLiftPx: number;            // Global master lift multiplier / cap (px)
  liftingTarget?: LiftingTargetMode; // Which part lifts: mouth-only, character-and-mouth, or character-only
  perKeyLiftPx: PerKeyLiftMap;  // Individual lifting (px) for each of the 12 mouth keys!
  squashIntensity: number;      // 0.0 to 0.25 squash & stretch factor
  holdSmoothingFrames: number;  // Minimum frames to hold a viseme to prevent jitter
  mouthChartStyle: MouthChartStyleId;
  lipstickStyle: LipstickStyleConfig;
  background: BackgroundConfig;
  mouthTracker: MouthTrackerConfig;
  proceduralAnimation?: ProceduralAnimationConfig;
  layers: LayerVisibilityConfig;
  exportResolution: ExportResolutionId;
  autoDropSilentCues: boolean;
  videoCartoonFilter: 'none' | 'rotoscope-2d' | 'comic-cel' | 'cel-shade' | 'ink-outline';
  videoOpacity: number;
  showStageGuides: boolean;
  showHudTelemetry: boolean;
  characterPreset: CharacterPresetId;
  stageDragMode: 'mouth-pin' | 'character-move' | 'overlay-move';
  characterTransform: CharacterTransformConfig;
  mouthAnchor: MouthAnchorConfig;
}

export const VISEME_LIBRARY: Record<VisemeCode, VisemeMetadata> = {
  [VisemeCode.DROP]: {
    code: VisemeCode.DROP,
    chartNumber: 0,
    shortCode: 'DROP',
    nameBn: 'অডিও নেই (মাউথ ড্রপ)',
    nameEn: 'Silent Mouth Drop',
    phonemes: 'Silence / Pause',
    jawOpenness: 0.0,
    lipWidth: 0.72,
    mouthOpenness: 0.0,
    mouthWidth: 0.72,
    defaultLiftPx: 0,
    color: '#64748B',
    badgeBg: 'rgba(100, 116, 139, 0.2)',
    descriptionBn: 'যেখানে কোনো অডিও সিগন্যাল নেই সেখানে অটোমেটিক মুখ বন্ধ (ড্রপ) থাকবে',
  },
  [VisemeCode.BMP]: {
    code: VisemeCode.BMP,
    chartNumber: 1,
    shortCode: 'B,M,P',
    nameBn: 'চার্ট ১: ঠোঁট চাপা (B,M,P)',
    nameEn: 'Closed Pressed Lips',
    phonemes: 'B, M, P, ব, ম, প',
    jawOpenness: 0.02,
    lipWidth: 0.86,
    mouthOpenness: 0.02,
    mouthWidth: 0.86,
    defaultLiftPx: 4,
    color: '#38BDF8',
    badgeBg: 'rgba(56, 189, 248, 0.18)',
    descriptionBn: 'কথা শুরু বা শেষের প, ব, ম ধ্বনিতে দুই ঠোঁট একসাথে চাপা থাকবে',
  },
  [VisemeCode.AEI]: {
    code: VisemeCode.AEI,
    chartNumber: 2,
    shortCode: 'A,E,I',
    nameBn: 'চার্ট ২: বড় হাঁ মুখ (A,E,I)',
    nameEn: 'Wide Open Vowel',
    phonemes: 'A, E, I, আ, এ',
    jawOpenness: 0.92,
    lipWidth: 1.05,
    mouthOpenness: 0.92,
    mouthWidth: 1.05,
    defaultLiftPx: 24,
    color: '#F43F5E',
    badgeBg: 'rgba(244, 63, 94, 0.22)',
    descriptionBn: 'উচ্চ অডিও পিক ও স্বরধ্বনিতে মুখ বড় করে খোলা, দাঁত ও জিহ্বা দৃশ্যমান',
  },
  [VisemeCode.L]: {
    code: VisemeCode.L,
    chartNumber: 3,
    shortCode: 'L',
    nameBn: 'চার্ট ৩: জিহ্বা উপরে (L)',
    nameEn: 'Tongue Tip Raised',
    phonemes: 'L, ল, ড়',
    jawOpenness: 0.65,
    lipWidth: 0.92,
    mouthOpenness: 0.65,
    mouthWidth: 0.92,
    defaultLiftPx: 15,
    color: '#FB923C',
    badgeBg: 'rgba(251, 146, 60, 0.20)',
    descriptionBn: 'খোলা মুখে জিহ্বার অগ্রভাগ উপরের দাঁতের পাটির কাছে উঠবে',
  },
  [VisemeCode.QW]: {
    code: VisemeCode.QW,
    chartNumber: 4,
    shortCode: 'Q,W',
    nameBn: 'চার্ট ৪: ছোট গোল ঠোঁট (Q,W)',
    nameEn: 'Tight Round Pucker',
    phonemes: 'Q, W, ওয়া, কু',
    jawOpenness: 0.34,
    lipWidth: 0.42,
    mouthOpenness: 0.34,
    mouthWidth: 0.42,
    defaultLiftPx: 11,
    color: '#A855F7',
    badgeBg: 'rgba(168, 85, 247, 0.20)',
    descriptionBn: 'ঠোঁট দুটি ছোট গোল হয়ে সামনের দিকে সংকুচিত হবে',
  },
  [VisemeCode.TH]: {
    code: VisemeCode.TH,
    chartNumber: 5,
    shortCode: 'TH',
    nameBn: 'চার্ট ৫: দাঁতের মাঝে জিহ্বা (TH)',
    nameEn: 'Tongue Between Teeth',
    phonemes: 'TH, ত, থ, দ, ধ',
    jawOpenness: 0.38,
    lipWidth: 0.88,
    mouthOpenness: 0.38,
    mouthWidth: 0.88,
    defaultLiftPx: 10,
    color: '#2DD4BF',
    badgeBg: 'rgba(45, 212, 191, 0.20)',
    descriptionBn: 'উপরের দাঁত ও নিচের ঠোঁটের মাঝখানে জিহ্বার ডগা দেখা যাবে',
  },
  [VisemeCode.N]: {
    code: VisemeCode.N,
    chartNumber: 6,
    shortCode: 'N',
    nameBn: 'চার্ট ৬: হালকা খোলা দাঁত (N)',
    nameEn: 'Parted Nasal Teeth',
    phonemes: 'N, NG, ন, ণ, ঙ',
    jawOpenness: 0.32,
    lipWidth: 0.84,
    mouthOpenness: 0.32,
    mouthWidth: 0.84,
    defaultLiftPx: 9,
    color: '#60A5FA',
    badgeBg: 'rgba(96, 165, 250, 0.20)',
    descriptionBn: 'ঠোঁট সামান্য ফাঁকা হয়ে উপরের দাঁতের সারি ও জিহ্বা দেখা যাবে',
  },
  [VisemeCode.CDGK]: {
    code: VisemeCode.CDGK,
    chartNumber: 7,
    shortCode: 'C,D,G,K,S',
    nameBn: 'চার্ট ৭: দাঁত চাপা হাসি (C,D,G,K,S)',
    nameEn: 'Clenched Teeth Consonant',
    phonemes: 'C, D, G, K, R, S, T, Y, Z, ক, গ, চ, স',
    jawOpenness: 0.28,
    lipWidth: 0.98,
    mouthOpenness: 0.28,
    mouthWidth: 0.98,
    defaultLiftPx: 8,
    color: '#FBBF24',
    badgeBg: 'rgba(251, 191, 36, 0.20)',
    descriptionBn: 'দুই পাটির দাঁত একসাথে লেগে থেকে চওড়া ব্যঞ্জনধ্বনি উচ্চারণ',
  },
  [VisemeCode.FV]: {
    code: VisemeCode.FV,
    chartNumber: 8,
    shortCode: 'F,V',
    nameBn: 'চার্ট ৮: ঠোঁটে দাঁত (F,V)',
    nameEn: 'Teeth on Lower Lip',
    phonemes: 'F, V, ফ, ভ',
    jawOpenness: 0.22,
    lipWidth: 0.82,
    mouthOpenness: 0.22,
    mouthWidth: 0.82,
    defaultLiftPx: 7,
    color: '#34D399',
    badgeBg: 'rgba(52, 211, 153, 0.20)',
    descriptionBn: 'উপরের সামনের দাঁত নিচের ঠোঁটের ওপর হালকা চাপ দেবে',
  },
  [VisemeCode.EE]: {
    code: VisemeCode.EE,
    chartNumber: 9,
    shortCode: 'EE',
    nameBn: 'চার্ট ৯: চওড়া ই-হাসি (EE)',
    nameEn: 'Wide Smile Vowel',
    phonemes: 'EE, EY, ই, ঈ',
    jawOpenness: 0.50,
    lipWidth: 1.15,
    mouthOpenness: 0.50,
    mouthWidth: 1.15,
    defaultLiftPx: 14,
    color: '#10B981',
    badgeBg: 'rgba(16, 185, 129, 0.20)',
    descriptionBn: 'ঠোঁট দুই পাশে চওড়া হয়ে দাঁত ও জিহ্বা সহ ই/ঈ উচ্চারণ',
  },
  [VisemeCode.O]: {
    code: VisemeCode.O,
    chartNumber: 10,
    shortCode: 'O',
    nameBn: 'চার্ট ১০: লম্বা গোল মুখ (O)',
    nameEn: 'Vertical Oval O',
    phonemes: 'O, OH, ও, অ',
    jawOpenness: 0.96,
    lipWidth: 0.66,
    mouthOpenness: 0.96,
    mouthWidth: 0.66,
    defaultLiftPx: 26,
    color: '#EC4899',
    badgeBg: 'rgba(236, 72, 153, 0.22)',
    descriptionBn: 'অডিও পিকে লম্বাটে গোল হাঁ মুখ (ও ধ্বনি)',
  },
  [VisemeCode.U]: {
    code: VisemeCode.U,
    chartNumber: 11,
    shortCode: 'U',
    nameBn: 'চার্ট ১১: মাঝারি গোল মুখ (U)',
    nameEn: 'Rounded U Vowel',
    phonemes: 'U, OO, উ, ঊ',
    jawOpenness: 0.56,
    lipWidth: 0.54,
    mouthOpenness: 0.56,
    mouthWidth: 0.54,
    defaultLiftPx: 16,
    color: '#8B5CF6',
    badgeBg: 'rgba(139, 92, 246, 0.20)',
    descriptionBn: 'উ বা ঊ ধ্বনির জন্য মাঝারি গোল খোলা মুখ ও জিহ্বা',
  },
  [VisemeCode.CHJSH]: {
    code: VisemeCode.CHJSH,
    chartNumber: 12,
    shortCode: 'CH,J,SH',
    nameBn: 'চার্ট ১২: চাপা ঠোঁট (CH,J,SH)',
    nameEn: 'Flared Pursed Consonant',
    phonemes: 'CH, J, SH, চ, ছ, জ, শ, ষ',
    jawOpenness: 0.36,
    lipWidth: 0.78,
    mouthOpenness: 0.36,
    mouthWidth: 0.78,
    defaultLiftPx: 12,
    color: '#06B6D4',
    badgeBg: 'rgba(6, 182, 212, 0.20)',
    descriptionBn: 'ঠোঁট সামনের দিকে চৌকো হয়ে মাঝখানে দাঁতের ফাঁকা রেখা',
  },
};
