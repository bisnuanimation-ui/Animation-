import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AudioAnalysisFrame,
  CharacterOverlayElement,
  CustomSpriteMap,
  DEFAULT_PER_KEY_LIFT,
  DEFAULT_PROCEDURAL_ANIMATION,
  EXPORT_RESOLUTIONS,
  ExportResolutionId,
  EngineConfig,
  LipSyncCue,
  LipstickStyleConfig,
  LocalStudioProject,
  MOUTH_CHART_12_ORDER,
  MouthAnchorConfig,
  ProceduralAnimationConfig,
  SelectedCanvasLayer,
  TimelineSplitClip,
  VISEME_LIBRARY,
  VisemeCode,
  ZipAssetEntry,
} from './types/studio';
import {
  deleteLocalProject,
  fileToDataUrl,
  saveLocalProject,
  seedDefaultProjectsIfEmpty,
} from './engine/localProjectStorage';
import { MobileHomeDashboard } from './components/MobileHomeDashboard';
import {
  StudioSoundFxId,
  StudioSoundPresetId,
  analyzeAudioBuffer,
  applyCuesToFrames,
  audioBufferToWavBlob,
  createDemoSpeechAudioBuffer,
  createStudioSoundFxBuffer,
  createStudioSoundPresetBuffer,
} from './engine/audioLipSyncEngine';
import {
  exportStudioZipBundle,
  parseListingText,
  parseUploadedZipFile,
  sliceMouthChartSheetImage,
} from './engine/zipListingParser';
import {
  LoadedSpriteImages,
  captureMouthTrackingTemplate,
  renderMouthChartThumbnail,
  renderStudioStage,
  sampleCharacterFaceColor,
} from './engine/canvasRenderer';
import { LIPSTICK_PRESETS, SettingsLogicModal } from './components/SettingsLogicModal';
import { InteractiveStageOverlay } from './components/InteractiveStageOverlay';
import { exportStandardMp4Video } from './engine/mp4VideoExporter';
import {
  ArrowLeft,
  ArrowUpFromLine,
  CheckCircle2,
  ChevronDown,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  Image as ImageIcon,
  Layers,
  Loader2,
  Maximize2,
  Mic,
  Minimize2,
  Minus,
  Music,
  Palette,
  Pause,
  Pencil,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Scissors,
  Search,
  Sparkles,
  Square,
  Subtitles,
  Trash2,
  Type,
  Undo2,
  Upload,
  UserPlus,
  Volume2,
  VolumeX,
  Wind,
  X,
  ZoomIn,
  ZoomOut,
  FolderOpen,
  Save,
} from 'lucide-react';

const INITIAL_CONFIG: EngineConfig = {
  fps: 24,
  silenceThresholdDb: -42,
  risingSensitivity: 0.035,
  peakThresholdDb: -14,
  maxLiftPx: 0,
  liftingTarget: 'character-and-mouth',
  perKeyLiftPx: { ...DEFAULT_PER_KEY_LIFT },
  squashIntensity: 0,
  holdSmoothingFrames: 2,
  mouthChartStyle: 'studio-12',
  lipstickStyle: {
    presetId: 'classic-ink',
    lipColor: '#231924',
    lipThickness: 1.3,
    lipGloss: false,
    teethColor: '#FDF8E7',
    tongueColor: '#F27D72',
  },
  background: {
    mode: 'solid',
    color1: '#D8D4CE',
    color2: '#1E293B',
    removeCharacterBg: false,
    chromaKeyColor: '#FFFFFF',
    chromaTolerance: 42,
  },
  mouthTracker: {
    enabled: true, // Auto-track enabled by default when user pins mouth on video!
    showTrackBox: false,
    searchRadiusPx: 95,
    smoothing: 0.45,
    trackAnchorX: 0,
    trackAnchorY: 0,
  },
  proceduralAnimation: {
    ...DEFAULT_PROCEDURAL_ANIMATION,
  },
  layers: {
    mouthLayer: true,
    characterLayer: true,
    overlayLayer: true,
    liftingLayer: false,
    proceduralLayer: true,
    backgroundLayer: true,
  },
  exportResolution: 'youtube-1080p',
  autoDropSilentCues: true,
  videoCartoonFilter: 'none',
  videoOpacity: 1.0,
  showStageGuides: false,
  showHudTelemetry: false,
  characterPreset: 'arjun-2d',
  stageDragMode: 'mouth-pin',
  characterTransform: {
    x: 0.5,
    y: 0.64,
    scale: 1.0,
    rotationDeg: 0,
    flipX: false,
  },
  mouthAnchor: {
    offsetX: 0,
    offsetY: 0,
    lipSegmentOffsetX: 0,
    lipSegmentOffsetY: 0,
    upperLipOffsetY: 0,
    lowerLipOffsetY: 0,
    scale: 0.82,
    rotationDeg: 0,
    flipX: false,
    skinMaskEnabled: false,
    skinMaskColor: '#F3B882',
    skinMaskRadius: 34,
  },
};

const STUDIO_BG_PRESETS = [
  { label: 'Studio Grey', mode: 'solid' as const, c1: '#D8D4CE', c2: '#BEB9B2' },
  { label: 'Pitch Black', mode: 'solid' as const, c1: '#0D0D0F', c2: '#0D0D0F' },
  { label: 'Green Screen', mode: 'green-screen' as const, c1: '#00FF00', c2: '#00FF00' },
  { label: 'Blue Screen', mode: 'solid' as const, c1: '#0047AB', c2: '#0047AB' },
  { label: 'Warm Cream', mode: 'solid' as const, c1: '#F5EFE6', c2: '#E8DEC8' },
  { label: 'Cyber Night', mode: 'gradient' as const, c1: '#0F172A', c2: '#311042' },
  { label: 'Sky Cartoon', mode: 'gradient' as const, c1: '#38BDF8', c2: '#E0F2FE' },
  { label: 'Sunset Toon', mode: 'gradient' as const, c1: '#F97316', c2: '#FDE047' },
];

function createSafeMediaRecorder(stream: MediaStream): {
  recorder: MediaRecorder;
  ext: string;
  mimeType: string;
} {
  const candidates = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=avc1,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4;codecs=h264,aac', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];

  for (const c of candidates) {
    try {
      if (
        typeof MediaRecorder.isTypeSupported === 'function' &&
        MediaRecorder.isTypeSupported(c.mime)
      ) {
        const rec = new MediaRecorder(stream, { mimeType: c.mime });
        return { recorder: rec, ext: c.ext, mimeType: c.mime };
      }
    } catch {
      // Try next candidate
    }
  }

  const fallbackRec = new MediaRecorder(stream);
  return {
    recorder: fallbackRec,
    ext: 'webm',
    mimeType: fallbackRec.mimeType || 'video/webm',
  };
}

const MouthKeyThumb: React.FC<{
  viseme: VisemeCode;
  config: EngineConfig;
  loadedSprites: LoadedSpriteImages;
  customUrl?: string;
}> = ({ viseme, config, loadedSprites, customUrl }) => {
  const ref = useRef<HTMLCanvasElement | null>(null);
  useEffect(() => {
    if (!ref.current) return;
    renderMouthChartThumbnail(
      ref.current,
      viseme,
      config.mouthChartStyle,
      loadedSprites,
      config.lipstickStyle
    );
  }, [viseme, config.mouthChartStyle, config.lipstickStyle, loadedSprites, customUrl]);

  return (
    <canvas
      ref={ref}
      width={80}
      height={48}
      className="w-14 h-9 rounded bg-[#F3EFEA] border border-zinc-700 object-contain shrink-0"
    />
  );
};

export type CapCutBottomTab =
  | 'character'
  | 'mouth-track'
  | 'audio'
  | 'lifting'
  | 'procedural'
  | 'background'
  | 'layers'
  | 'captions'
  | null;

export default function App() {
  // Mobile App Screen Flow: 'home' (Initial Home Dashboard with New Project & Saved Local Projects) | 'editor'
  const [activeScreen, setActiveScreen] = useState<'home' | 'editor'>('home');
  const [localProjects, setLocalProjects] = useState<LocalStudioProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeProjectName, setActiveProjectName] = useState<string>(
    'অর্জুনের কার্টুন ডায়ালগ (Episode 1)'
  );
  const [idleClockSec, setIdleClockSec] = useState<number>(0);

  const [config, setConfig] = useState<EngineConfig>(INITIAL_CONFIG);
  const [configHistory, setConfigHistory] = useState<EngineConfig[]>([]);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [frames, setFrames] = useState<AudioAnalysisFrame[]>([]);
  const [cues, setCues] = useState<LipSyncCue[]>([]);
  const [currentFrameIndex, setCurrentFrameIndex] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isFullscreenPreview, setIsFullscreenPreview] = useState<boolean>(false);

  const [mediaSourceTitle, setMediaSourceTitle] = useState<string>('Extracted audio1');
  const [hasUploadedVideo, setHasUploadedVideo] = useState<boolean>(false);
  const [filmstripThumbUrl, setFilmstripThumbUrl] = useState<string | null>(null);
  const hasCapturedInitialThumbRef = useRef<boolean>(false);

  // Resolution dropdown in Top Bar ("AI UHD ▾")
  const [showResDropdown, setShowResDropdown] = useState<boolean>(false);

  // Export & Download Modal State
  const [exportModalOpen, setExportModalOpen] = useState<boolean>(false);
  const [isExportingVideo, setIsExportingVideo] = useState<boolean>(false);
  const [exportProgressPct, setExportProgressPct] = useState<number>(0);
  const [exportedVideoUrl, setExportedVideoUrl] = useState<string | null>(null);
  const [exportedFilename, setExportedFilename] = useState<string>('toonsync-video.webm');

  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const [isRecordingMic, setIsRecordingMic] = useState<boolean>(false);

  // CapCut 6 Bottom Tabs: Character · Mouth Track · Audio · Background · Layers · Captions
  const [activeBottomTab, setActiveBottomTab] = useState<CapCutBottomTab>(null);

  // Full Studio Code & Listing Modal
  const [settingsOpen, setSettingsOpen] = useState<boolean>(false);
  const [settingsSection, setSettingsSection] = useState<
    'mouth-charts' | 'auto-listing' | 'dsp-logic'
  >('mouth-charts');

  const [zipEntries, setZipEntries] = useState<ZipAssetEntry[]>([]);
  const [customSprites, setCustomSprites] = useState<CustomSpriteMap>({});
  const [loadedSpritesState, setLoadedSpritesState] = useState<LoadedSpriteImages>({});
  const loadedSpriteImagesRef = useRef<LoadedSpriteImages>({});

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const activeSourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const activeRecorderRef = useRef<MediaRecorder | null>(null);
  const playbackStartTimeRef = useRef<number>(0);
  const playbackStartOffsetRef = useRef<number>(0);
  const rafIdRef = useRef<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const micChunksRef = useRef<Blob[]>([]);

  const [isDraggingStage, setIsDraggingStage] = useState<boolean>(false);
  const [isScrubbingTimeline, setIsScrubbingTimeline] = useState<boolean>(false);
  const [timelineZoom, setTimelineZoom] = useState<number>(1.8);
  const timelineScrollRef = useRef<HTMLDivElement | null>(null);
  const timelineTrackInnerRef = useRef<HTMLDivElement | null>(null);

  // Refs to prevent nested setState calls & stale closures
  const configRef = useRef<EngineConfig>(config);
  configRef.current = config;
  const framesRef = useRef<AudioAnalysisFrame[]>(frames);
  framesRef.current = frames;
  const cuesRef = useRef<LipSyncCue[]>(cues);
  cuesRef.current = cues;
  const configHistoryRef = useRef<EngineConfig[]>([]);
  const lastHistoryPushTimeRef = useRef<number>(0);

  // Interactive On-Screen Layer Selection (Starts clean 'none'; clicking any layer on stage or timeline selects & moves it directly)
  const [selectedCanvasLayer, setSelectedCanvasLayer] =
    useState<SelectedCanvasLayer>('none');
  const [selectedOverlayId, setSelectedOverlayId] = useState<string | null>(null);
  const [characterOverlays, setCharacterOverlays] = useState<
    CharacterOverlayElement[]
  >([]);

  // Timeline Slash / Split Tool Segments
  const [splitClips, setSplitClips] = useState<TimelineSplitClip[]>([
    {
      id: 'clip-1',
      label: 'Clip 1',
      startTime: 0,
      endTime: 8,
      lipSyncEnabled: true,
      muted: false,
      color: '#00C8E0',
    },
  ]);
  const [selectedSplitClipId, setSelectedSplitClipId] = useState<string>('clip-1');

  const showNotice = useCallback((msg: string) => {
    setStatusBanner(msg);
    setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 4000);
  }, []);

  // Load saved local projects from 100% Offline Device Storage (IndexedDB + LocalStorage) on launch
  useEffect(() => {
    let mounted = true;
    seedDefaultProjectsIfEmpty().then((projects) => {
      if (!mounted) return;
      setLocalProjects(projects);
      if (projects[0]) {
        setActiveProjectId(projects[0].id);
        setActiveProjectName(projects[0].name);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Continuous Idle Timer / Sine-Wave Clock for Procedural Animation (Hair, Leaves & Subtle Head Float)
  useEffect(() => {
    const procEnabled =
      config.proceduralAnimation?.enabled !== false &&
      config.layers.proceduralLayer !== false;
    if (!procEnabled || activeScreen !== 'editor' || isExportingVideo) return;

    let animId = 0;
    let lastUpdate = performance.now();
    const startWall = performance.now();

    const loop = (now: number) => {
      // Update at ~24fps when paused or playing so procedural hair & leaves float smoothly
      if (now - lastUpdate >= 41) {
        lastUpdate = now;
        setIdleClockSec((now - startWall) / 1000);
      }
      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animId);
  }, [
    activeScreen,
    config.layers.proceduralLayer,
    config.proceduralAnimation?.enabled,
    isExportingVideo,
  ]);

  const handleUpdateProceduralAnimation = useCallback(
    (patch: Partial<ProceduralAnimationConfig>) => {
      setConfig((prev) => {
        const currentProc =
          prev.proceduralAnimation || DEFAULT_PROCEDURAL_ANIMATION;
        const nextProc = { ...currentProc, ...patch };
        return {
          ...prev,
          proceduralAnimation: nextProc,
          layers: {
            ...prev.layers,
            proceduralLayer: nextProc.enabled,
          },
        };
      });
    },
    []
  );

  // Save current editor state to the active LocalStudioProject in offline storage
  const handleSaveCurrentProjectLocally = useCallback(
    async (silent = false) => {
      const targetId = activeProjectId || `proj-${Date.now()}`;
      const existing = localProjects.find((p) => p.id === targetId);
      const todayIso = new Date().toISOString().slice(0, 10);

      let thumbUrl = filmstripThumbUrl || existing?.thumbnailDataUrl;
      if (canvasRef.current) {
        try {
          const small = document.createElement('canvas');
          small.width = 160;
          small.height = 90;
          const sCtx = small.getContext('2d');
          if (sCtx) {
            sCtx.drawImage(canvasRef.current, 0, 0, 160, 90);
            thumbUrl = small.toDataURL('image/jpeg', 0.72);
          }
        } catch {
          // Ignore thumbnail errors
        }
      }

      const projectToSave: LocalStudioProject = {
        id: targetId,
        name: activeProjectName || existing?.name || 'Untitled Cartoon Project',
        description:
          existing?.description ||
          '2D Lip-Sync & Procedural Hair/Leaves/Head Animation Project',
        date: existing?.date || todayIso,
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
        thumbnailDataUrl: thumbUrl,
        config: configRef.current,
        cues: cuesRef.current,
        splitClips,
        characterOverlays,
        customSprites,
        mediaSourceTitle,
      };

      const updatedList = await saveLocalProject(projectToSave);
      setLocalProjects(updatedList);
      setActiveProjectId(targetId);
      if (!silent) {
        showNotice(
          `💾 "${projectToSave.name}" ফোনের লোকাল স্টোরেজে (Offline Storage) সেভ হয়েছে!`
        );
      }
    },
    [
      activeProjectId,
      activeProjectName,
      characterOverlays,
      customSprites,
      filmstripThumbUrl,
      localProjects,
      mediaSourceTitle,
      showNotice,
      splitClips,
    ]
  );

  const handleOpenLocalProject = useCallback(
    (proj: LocalStudioProject) => {
      setActiveProjectId(proj.id);
      setActiveProjectName(proj.name);
      setConfig({
        ...INITIAL_CONFIG,
        ...proj.config,
        proceduralAnimation: {
          ...DEFAULT_PROCEDURAL_ANIMATION,
          ...(proj.config.proceduralAnimation || {}),
        },
        layers: {
          ...INITIAL_CONFIG.layers,
          ...(proj.config.layers || {}),
        },
      });
      if (proj.cues && proj.cues.length > 0) {
        setCues(proj.cues);
      }
      if (proj.splitClips && proj.splitClips.length > 0) {
        setSplitClips(proj.splitClips);
      }
      if (proj.characterOverlays) {
        setCharacterOverlays(proj.characterOverlays);
      } else {
        setCharacterOverlays([]);
      }
      if (proj.customSprites) {
        setCustomSprites(proj.customSprites);
      } else {
        setCustomSprites({});
      }
      if (proj.mediaSourceTitle) {
        setMediaSourceTitle(proj.mediaSourceTitle);
      }
      hasCapturedInitialThumbRef.current = false;
      setActiveScreen('editor');
      showNotice(`📂 প্রজেক্ট "${proj.name}" লোকাল স্টোরেজ থেকে লোড হয়েছে!`);
    },
    [showNotice]
  );

  const handleCreateNewLocalProject = useCallback(
    async (newProj: LocalStudioProject, openImmediately: boolean) => {
      const updated = await saveLocalProject(newProj);
      setLocalProjects(updated);
      setActiveProjectId(newProj.id);
      setActiveProjectName(newProj.name);
      if (openImmediately) {
        handleOpenLocalProject(newProj);
      } else {
        showNotice(
          `✓ নতুন প্রজেক্ট "${newProj.name}" লোকাল স্টোরেজে সেভ হয়েছে এবং হোম লিস্টে যুক্ত হয়েছে!`
        );
      }
    },
    [handleOpenLocalProject, showNotice]
  );

  const handleDeleteLocalProject = useCallback(
    async (projectId: string) => {
      const updated = await deleteLocalProject(projectId);
      setLocalProjects(updated);
      if (activeProjectId === projectId) {
        setActiveProjectId(updated[0]?.id || null);
        if (updated[0]) setActiveProjectName(updated[0].name);
      }
      showNotice('🗑️ প্রজেক্টটি লোকাল স্টোরেজ থেকে ডিলিট করা হয়েছে।');
    },
    [activeProjectId, showNotice]
  );

  const handleDuplicateLocalProject = useCallback(
    async (proj: LocalStudioProject) => {
      const copy: LocalStudioProject = {
        ...proj,
        id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: `${proj.name} (Copy)`,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      const updated = await saveLocalProject(copy);
      setLocalProjects(updated);
      showNotice(`✓ "${copy.name}" ডুপ্লিকেট করে লোকাল স্টোরেজে সেভ করা হয়েছে!`);
    },
    [showNotice]
  );

  // Safe config updater: never calls setState inside another setState updater!
  const pushConfigUpdate = useCallback((updater: (prev: EngineConfig) => EngineConfig) => {
    const now = performance.now();
    if (now - lastHistoryPushTimeRef.current > 350) {
      lastHistoryPushTimeRef.current = now;
      const snapshot = configRef.current;
      configHistoryRef.current = [...configHistoryRef.current.slice(-14), snapshot];
      setConfigHistory(configHistoryRef.current);
    }
    setConfig((prev) => updater(prev));
  }, []);

  const handleUndo = useCallback(() => {
    const hist = configHistoryRef.current;
    if (hist.length === 0) return;
    const last = hist[hist.length - 1];
    const nextHist = hist.slice(0, -1);
    configHistoryRef.current = nextHist;
    setConfigHistory(nextHist);
    setConfig(last);
  }, []);

  // Allow Esc key to exit Full-Screen Canvas cleanly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreenPreview) {
        setIsFullscreenPreview(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isFullscreenPreview]);

  const getAudioContext = useCallback(() => {
    if (!audioCtxRef.current) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      audioCtxRef.current = new AudioCtx();
    }
    if (audioCtxRef.current.state === 'suspended') {
      audioCtxRef.current.resume();
    }
    return audioCtxRef.current;
  }, []);

  // Load custom sprites AND character overlay images WITHOUT restrictive crossOrigin
  useEffect(() => {
    const map: LoadedSpriteImages = {};
    let remaining = 0;
    const entries: Array<[string, string | undefined]> = [
      ...Object.entries(customSprites),
      ...characterOverlays.map(
        (ov): [string, string] => [`overlay_${ov.id}`, ov.imageUrl]
      ),
    ].filter(([, url]) => Boolean(url));

    if (entries.length === 0) {
      loadedSpriteImagesRef.current = {};
      setLoadedSpritesState((prev) =>
        Object.keys(prev).length === 0 ? prev : {}
      );
      return;
    }

    entries.forEach(([key, url]) => {
      if (url) {
        remaining++;
        const img = new Image();
        img.onload = () => {
          remaining--;
          if (remaining <= 0) {
            setLoadedSpritesState({ ...map });
          }
        };
        img.onerror = () => {
          remaining--;
          if (remaining <= 0) {
            setLoadedSpritesState({ ...map });
          }
        };
        img.src = url;
        map[key] = img;
      }
    });
    loadedSpriteImagesRef.current = map;
  }, [customSprites, characterOverlays]);

  const handleLoadDemoSpeech = useCallback(() => {
    const ctx = getAudioContext();
    const demoBuf = createDemoSpeechAudioBuffer(ctx);
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setHasUploadedVideo(false);
    setMediaSourceTitle('Extracted audio1');
    setAudioBuffer(demoBuf);
    setCurrentFrameIndex(0);
    setIsPlaying(false);
  }, [getAudioContext]);

  useEffect(() => {
    handleLoadDemoSpeech();
  }, [handleLoadDemoSpeech]);

  useEffect(() => {
    if (!audioBuffer) return;
    const result = analyzeAudioBuffer(audioBuffer, config);
    setFrames(result.frames);
    setCues(result.cues);
    setCurrentFrameIndex((prev) => Math.min(prev, Math.max(0, result.frames.length - 1)));
    setSplitClips((prev) => {
      if (prev.length <= 1) {
        return [
          {
            id: 'clip-1',
            label: 'Clip 1',
            startTime: 0,
            endTime: Number(audioBuffer.duration.toFixed(2)),
            lipSyncEnabled: true,
            muted: false,
            color: '#00C8E0',
          },
        ];
      }
      return prev;
    });
  }, [
    audioBuffer,
    config.fps,
    config.silenceThresholdDb,
    config.peakThresholdDb,
    config.risingSensitivity,
    config.holdSmoothingFrames,
  ]);

  // TIMELINE SLASH / SPLIT TOOL HANDLERS ("split video clips on the timeline using a slash/split tool")
  const handleSplitClipAtPlayhead = useCallback(() => {
    const totalDur = audioBuffer?.duration || 8;
    const playheadSec = Number((currentFrameIndex / config.fps).toFixed(2));

    const targetIdx = splitClips.findIndex(
      (c) => playheadSec > c.startTime + 0.15 && playheadSec < c.endTime - 0.15
    );

    if (targetIdx === -1) {
      showNotice(
        '✂️ প্লে-হেডটি ক্লিপের মাঝখানে রেখে Split ( / ) বাটনে ক্লিক করুন!'
      );
      return;
    }

    const target = splitClips[targetIdx];
    const leftClip: TimelineSplitClip = {
      ...target,
      id: `clip-${Date.now()}-a`,
      label: `Clip ${targetIdx + 1}A`,
      endTime: playheadSec,
    };
    const rightClip: TimelineSplitClip = {
      ...target,
      id: `clip-${Date.now()}-b`,
      label: `Clip ${targetIdx + 1}B`,
      startTime: playheadSec,
      endTime: Math.min(totalDur, target.endTime),
    };

    const nextClips = [
      ...splitClips.slice(0, targetIdx),
      leftClip,
      rightClip,
      ...splitClips.slice(targetIdx + 1),
    ].map((c, idx) => ({ ...c, label: `Clip ${idx + 1}` }));

    setSplitClips(nextClips);
    setSelectedSplitClipId(rightClip.id);
    showNotice(
      `✂️ স্ল্যাশ টুল দিয়ে ${playheadSec}s পজিশনে ভিডিও ক্লিপ ২ ভাগে Split করা হয়েছে!`
    );
  }, [audioBuffer?.duration, config.fps, currentFrameIndex, showNotice, splitClips]);

  const handleToggleSplitClipLipSync = useCallback((clipId: string) => {
    setSplitClips((prev) =>
      prev.map((c) =>
        c.id === clipId ? { ...c, lipSyncEnabled: !c.lipSyncEnabled } : c
      )
    );
  }, []);

  const handleDeleteSplitClip = useCallback(
    (clipId: string) => {
      if (splitClips.length <= 1) {
        showNotice('কমপক্ষে ১টি ক্লিপ টাইমলাইনে থাকতে হবে।');
        return;
      }
      const next = splitClips.filter((c) => c.id !== clipId);
      setSplitClips(next);
      if (next[0]) setSelectedSplitClipId(next[0].id);
      showNotice('🗑️ সিলেক্টেড স্প্লিট ক্লিপটি রিমুভ করা হয়েছে।');
    },
    [showNotice, splitClips]
  );

  const handleResetSplitClips = useCallback(() => {
    const totalDur = Number((audioBuffer?.duration || 8).toFixed(2));
    setSplitClips([
      {
        id: 'clip-1',
        label: 'Clip 1',
        startTime: 0,
        endTime: totalDur,
        lipSyncEnabled: true,
        muted: false,
        color: '#00C8E0',
      },
    ]);
    setSelectedSplitClipId('clip-1');
    showNotice('↺ সব স্প্লিট ক্লিপ আবার একত্র (Merge) করা হয়েছে।');
  }, [audioBuffer?.duration, showNotice]);

  // CHARACTER OVERLAY HANDLERS ("enable overlay features for character elements")
  const handleAddCharacterOverlay = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      const id = `ov-${Date.now()}`;
      const newOv: CharacterOverlayElement = {
        id,
        name: file.name.replace(/\.[^.]+$/, ''),
        imageUrl: url,
        x: 0.28 + (characterOverlays.length % 3) * 0.22,
        y: 0.56,
        scale: 0.85,
        rotationDeg: 0,
        flipX: false,
        opacity: 1,
        visible: true,
        attachMouth: true,
      };
      setCharacterOverlays((prev) => [...prev, newOv]);
      setSelectedCanvasLayer('overlay');
      setSelectedOverlayId(id);
      showNotice(
        `✓ ওভারলে ক্যারেক্টার "${newOv.name}" যোগ হয়েছে! স্ক্রিনে টেনে Zoom, Scale ও Rotate করুন।`
      );
    },
    [characterOverlays.length, showNotice]
  );

  const handleUpdateCharacterOverlay = useCallback(
    (id: string, patch: Partial<CharacterOverlayElement>) => {
      setCharacterOverlays((prev) =>
        prev.map((ov) => (ov.id === id ? { ...ov, ...patch } : ov))
      );
    },
    []
  );

  const handleDeleteCharacterOverlay = useCallback(
    (id: string) => {
      setCharacterOverlays((prev) => prev.filter((ov) => ov.id !== id));
      setSelectedCanvasLayer('character');
      setSelectedOverlayId(null);
      showNotice('🗑️ ওভারলে ক্যারেক্টার মুছে ফেলা হয়েছে।');
    },
    [showNotice]
  );

  const stopAudioPlayback = useCallback(() => {
    if (activeSourceNodeRef.current) {
      try {
        activeSourceNodeRef.current.onended = null;
        activeSourceNodeRef.current.stop();
        activeSourceNodeRef.current.disconnect();
      } catch {
        // Ignore
      }
      activeSourceNodeRef.current = null;
    }
    if (videoRef.current && hasUploadedVideo) {
      videoRef.current.pause();
    }
    if (rafIdRef.current) {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
    setIsPlaying(false);
  }, [hasUploadedVideo]);

  const startPlayback = useCallback(
    (startFrameIdx: number) => {
      if (!audioBuffer || frames.length === 0) return;
      stopAudioPlayback();

      const ctx = getAudioContext();
      const startFrame = startFrameIdx >= frames.length - 1 ? 0 : startFrameIdx;
      const offsetSec = startFrame / config.fps;

      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;

      const gain = ctx.createGain();
      gain.gain.value = isMuted ? 0 : 1;
      gainNodeRef.current = gain;

      source.connect(gain);
      gain.connect(ctx.destination);

      playbackStartTimeRef.current = ctx.currentTime;
      playbackStartOffsetRef.current = offsetSec;
      activeSourceNodeRef.current = source;

      if (videoRef.current && hasUploadedVideo) {
        videoRef.current.currentTime = offsetSec;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }

      source.start(0, offsetSec);
      setIsPlaying(true);

      const tick = () => {
        if (!audioCtxRef.current || !activeSourceNodeRef.current) return;
        const activeFrames = framesRef.current;
        const fpsNow = configRef.current.fps;
        const elapsed =
          audioCtxRef.current.currentTime -
          playbackStartTimeRef.current +
          playbackStartOffsetRef.current;
        const nextFrame = Math.floor(elapsed * fpsNow);

        if (nextFrame >= activeFrames.length) {
          setCurrentFrameIndex(0);
          stopAudioPlayback();
          return;
        }

        setCurrentFrameIndex(nextFrame);

        // Smoothly keep playhead visible inside the horizontally scrollable CapCut timeline
        if (timelineScrollRef.current && timelineTrackInnerRef.current) {
          const scrollEl = timelineScrollRef.current;
          const totalW = timelineTrackInnerRef.current.scrollWidth;
          const ratio = nextFrame / Math.max(1, activeFrames.length - 1);
          const playheadX = ratio * totalW;
          const viewLeft = scrollEl.scrollLeft;
          const viewWidth = scrollEl.clientWidth;
          if (playheadX > viewLeft + viewWidth * 0.85 || playheadX < viewLeft) {
            scrollEl.scrollLeft = Math.max(0, playheadX - viewWidth * 0.25);
          }
        }

        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);
    },
    [
      audioBuffer,
      config.fps,
      frames.length,
      getAudioContext,
      hasUploadedVideo,
      isMuted,
      stopAudioPlayback,
    ]
  );

  const handleTogglePlay = useCallback(() => {
    if (isPlaying) {
      stopAudioPlayback();
    } else {
      startPlayback(currentFrameIndex);
    }
  }, [currentFrameIndex, isPlaying, startPlayback, stopAudioPlayback]);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => {
      const next = !prev;
      if (gainNodeRef.current) {
        gainNodeRef.current.gain.value = next ? 0 : 1;
      }
      return next;
    });
  }, []);

  const handleSeekFrame = useCallback(
    (targetFrame: number) => {
      const clamped = Math.max(0, Math.min(frames.length - 1, targetFrame));
      setCurrentFrameIndex(clamped);
      if (videoRef.current && hasUploadedVideo) {
        videoRef.current.currentTime = clamped / config.fps;
      }
      if (isPlaying) {
        startPlayback(clamped);
      }
    },
    [config.fps, frames.length, hasUploadedVideo, isPlaying, startPlayback]
  );

  // Render main stage canvas + capture a small snapshot for the timeline filmstrip & Cover icon
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || frames.length === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rawFrame = frames[currentFrameIndex] || frames[0];
    const playheadSec = currentFrameIndex / config.fps;
    const activeClip = splitClips.find(
      (c) => playheadSec >= c.startTime && playheadSec <= c.endTime
    );
    const effectiveFrame: AudioAnalysisFrame =
      activeClip && !activeClip.lipSyncEnabled
        ? { ...rawFrame, viseme: VisemeCode.DROP, isDropped: true, liftY: 0 }
        : rawFrame;

    renderStudioStage(
      ctx,
      canvas.width,
      canvas.height,
      effectiveFrame,
      config,
      videoRef.current,
      hasUploadedVideo,
      loadedSpriteImagesRef.current,
      characterOverlays,
      idleClockSec
    );

    if (!hasCapturedInitialThumbRef.current) {
      hasCapturedInitialThumbRef.current = true;
      try {
        const small = document.createElement('canvas');
        small.width = 96;
        small.height = 54;
        const sCtx = small.getContext('2d');
        if (sCtx) {
          sCtx.drawImage(canvas, 0, 0, 96, 54);
          setFilmstripThumbUrl(small.toDataURL('image/jpeg', 0.65));
        }
      } catch {
        // Ignore
      }
    }
  }, [
    currentFrameIndex,
    frames,
    config,
    hasUploadedVideo,
    loadedSpritesState,
    characterOverlays,
    splitClips,
    idleClockSec,
  ]);

  /**
   * UNIVERSAL CHARACTER UPLOAD (Supports ANY Image format OR Video format!)
   * - If user uploads an Image (PNG, JPG, WEBP, GIF, SVG, BMP, AVIF) -> sets as Custom Character!
   * - If user uploads a Video (MP4, WEBM, MOV, MKV, AVI) -> sets as Moving Video Character + Auto Mouth Tracking!
   */
  const handleUniversalCharacterUpload = useCallback(
    async (file: File) => {
      stopAudioPlayback();
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isVideo =
        file.type.startsWith('video/') ||
        ['mp4', 'webm', 'mov', 'mkv', 'avi', 'm4v', '3gp'].includes(ext);

      if (isVideo) {
        showNotice(`"${file.name}" ভিডিও ক্যারেক্টার লোড ও অটো মাউথ ট্র্যাকার প্রস্তুত হচ্ছে...`);
        const videoUrl = URL.createObjectURL(file);
        if (videoRef.current) {
          videoRef.current.src = videoUrl;
          videoRef.current.muted = true;
          videoRef.current.load();
          videoRef.current.onloadeddata = () => {
            if (videoRef.current) {
              captureMouthTrackingTemplate(videoRef.current, config);
            }
          };
        }
        setHasUploadedVideo(true);
        // Clear static image overlay so the video character itself is shown with tracked mouth
        setCustomSprites((prev) => ({ ...prev, customCharacter: undefined }));

        pushConfigUpdate((prev) => ({
          ...prev,
          characterPreset: 'mouth-only-overlay',
          stageDragMode: 'mouth-pin',
          mouthTracker: {
            ...prev.mouthTracker,
            enabled: true,
            showTrackBox: false,
          },
          layers: {
            ...prev.layers,
            characterLayer: true,
            mouthLayer: true,
          },
        }));

        // Also try to decode audio from the video if it has an audio track
        try {
          const ctx = getAudioContext();
          const arrayBuffer = await file.arrayBuffer();
          const decodedAudio = await ctx.decodeAudioData(arrayBuffer.slice(0));
          setMediaSourceTitle(file.name);
          setAudioBuffer(decodedAudio);
        } catch {
          // Video has no audio track -> keep current voice track so mouth still talks!
        }

        setCurrentFrameIndex(0);
        showNotice(
          `✓ ভিডিও ক্যারেক্টার "${file.name}" সেট হয়েছে! মুখে প্রথমবার ক্লিক করে মাউথ সেট করলেই তা অটোমেটিক ট্র্যাক করবে!`
        );
        return;
      }

      // Otherwise treat as Image / GIF / SVG / Universal Character Image
      const url = await fileToDataUrl(file).catch(() =>
        URL.createObjectURL(file)
      );
      const probeImg = new Image();
      probeImg.onload = () => {
        const sampledColor = sampleCharacterFaceColor(probeImg, 0, -35);
        setCustomSprites((prev) => ({ ...prev, customCharacter: url }));
        setFilmstripThumbUrl(url);
        pushConfigUpdate((prev) => ({
          ...prev,
          characterPreset: 'custom-character',
          stageDragMode: 'mouth-pin',
          layers: {
            ...prev.layers,
            characterLayer: true,
            mouthLayer: true,
          },
          mouthAnchor: {
            ...prev.mouthAnchor,
            offsetX: 0,
            offsetY: -35,
            skinMaskColor: sampledColor,
          },
        }));
        captureMouthTrackingTemplate(probeImg, config);
        showNotice(
          `✓ আপনার ক্যারেক্টার "${file.name}" বসানো হয়েছে! মুখে টাচ/ড্র্যাগ করে মাউথ চার্টটি সেট করুন।`
        );
      };
      probeImg.onerror = () => {
        // Fallback via FileReader DataURL if blob URL failed
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = reader.result as string;
          setCustomSprites((prev) => ({ ...prev, customCharacter: dataUrl }));
          setFilmstripThumbUrl(dataUrl);
          pushConfigUpdate((prev) => ({
            ...prev,
            characterPreset: 'custom-character',
            stageDragMode: 'mouth-pin',
          }));
          showNotice(`✓ ক্যারেক্টার "${file.name}" লোড হয়েছে!`);
        };
        reader.readAsDataURL(file);
      };
      probeImg.src = url;
    },
    [config, getAudioContext, pushConfigUpdate, showNotice, stopAudioPlayback]
  );

  const handleUploadCustomBackground = useCallback(
    (file: File) => {
      const url = URL.createObjectURL(file);
      setCustomSprites((prev) => ({ ...prev, customBackground: url }));
      pushConfigUpdate((prev) => ({
        ...prev,
        background: {
          ...prev.background,
          mode: 'custom-image',
        },
        layers: {
          ...prev.layers,
          backgroundLayer: true,
        },
      }));
      showNotice(`✓ কাস্টম ব্যাকগ্রাউন্ড "${file.name}" সেট হয়েছে!`);
    },
    [pushConfigUpdate, showNotice]
  );

  // Delete imported main character (Image or Video) and return to default preset
  const handleDeleteImportedMainCharacter = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute('src');
      videoRef.current.load();
    }
    setHasUploadedVideo(false);
    setFilmstripThumbUrl(null);
    setCustomSprites((prev) => {
      const next = { ...prev };
      delete next.customCharacter;
      return next;
    });
    delete loadedSpriteImagesRef.current.customCharacter;
    setConfig((prev) => ({
      ...prev,
      characterPreset:
        prev.characterPreset === 'custom-character' ||
        prev.characterPreset === 'mouth-only-overlay'
          ? 'arjun-2d'
          : prev.characterPreset,
      mouthTracker: {
        ...prev.mouthTracker,
        isInitialized: false,
      },
    }));
    showNotice('🗑️ ইমপোর্ট করা ক্যারেক্টার / ভিডিও ডিলিট করা হয়েছে');
  }, [showNotice]);

  // Delete imported custom background image
  const handleDeleteCustomBackgroundImage = useCallback(() => {
    setCustomSprites((prev) => {
      const next = { ...prev };
      delete next.customBackground;
      return next;
    });
    delete loadedSpriteImagesRef.current.customBackground;
    pushConfigUpdate((prev) => ({
      ...prev,
      background: {
        ...prev.background,
        mode: prev.background.mode === 'custom-image' ? 'gradient' : prev.background.mode,
      },
    }));
    showNotice('🗑️ ইমপোর্ট করা ব্যাকগ্রাউন্ড ছবি ডিলিট করা হয়েছে');
  }, [pushConfigUpdate, showNotice]);

  // Delete a single custom uploaded mouth viseme sprite
  const handleDeleteCustomMouthSprite = useCallback(
    (code: VisemeCode) => {
      setCustomSprites((prev) => {
        const next = { ...prev };
        delete next[code];
        return next;
      });
      delete loadedSpriteImagesRef.current[code];
      showNotice(`🗑️ "${code}" কাস্টম মাউথ ডিলিট করা হয়েছে`);
    },
    [showNotice]
  );

  // Delete all custom uploaded mouth sprites
  const handleDeleteAllCustomMouthSprites = useCallback(() => {
    setCustomSprites((prev) => {
      const next = { ...prev };
      for (const code of MOUTH_CHART_12_ORDER) {
        delete next[code];
      }
      return next;
    });
    for (const code of MOUTH_CHART_12_ORDER) {
      delete loadedSpriteImagesRef.current[code];
    }
    setZipEntries([]);
    showNotice('🗑️ ইমপোর্ট করা সব কাস্টম মাউথ স্প্রাইট ডিলিট করা হয়েছে');
  }, [showNotice]);

  const handleUpdateMouthAnchor = useCallback(
    (patch: Partial<MouthAnchorConfig>) => {
      pushConfigUpdate((prev) => ({
        ...prev,
        mouthAnchor: {
          ...prev.mouthAnchor,
          ...patch,
        },
      }));
    },
    [pushConfigUpdate]
  );

  const handleUpdatePerKeyLift = useCallback((viseme: VisemeCode, liftPx: number) => {
    setConfig((prev) => ({
      ...prev,
      perKeyLiftPx: {
        ...prev.perKeyLiftPx,
        [viseme]: Math.max(0, Math.min(60, liftPx)),
      },
    }));
  }, []);

  const handleResetPerKeyLift = useCallback(() => {
    setConfig((prev) => ({
      ...prev,
      perKeyLiftPx: { ...DEFAULT_PER_KEY_LIFT },
    }));
  }, []);

  const handleUpdateLipstickStyle = useCallback((patch: Partial<LipstickStyleConfig>) => {
    setConfig((prev) => ({
      ...prev,
      lipstickStyle: {
        ...prev.lipstickStyle,
        ...patch,
      },
    }));
  }, []);

  const handleUploadMediaFile = useCallback(
    async (file: File) => {
      stopAudioPlayback();
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'bmp', 'avif'].includes(ext)) {
        handleUniversalCharacterUpload(file);
        return;
      }

      showNotice(`"${file.name}" থেকে অডিও ও ভিডিও ট্র্যাক লোড হচ্ছে...`);

      try {
        const ctx = getAudioContext();
        const arrayBuffer = await file.arrayBuffer();

        const isVideo =
          file.type.startsWith('video/') ||
          /\.(mp4|webm|mov|mkv|avi|m4v|3gp)$/i.test(file.name);

        if (isVideo && videoRef.current) {
          const videoUrl = URL.createObjectURL(file);
          videoRef.current.src = videoUrl;
          videoRef.current.muted = true;
          videoRef.current.load();
          videoRef.current.onloadeddata = () => {
            if (videoRef.current) {
              captureMouthTrackingTemplate(videoRef.current, config);
            }
          };
          setHasUploadedVideo(true);
          // Switch to mouth overlay on the uploaded video if no custom image character is active
          if (!customSprites.customCharacter) {
            setConfig((prev) => ({
              ...prev,
              characterPreset: 'mouth-only-overlay',
              mouthTracker: {
                ...prev.mouthTracker,
                enabled: true,
                showTrackBox: false,
              },
            }));
          }
        } else {
          setHasUploadedVideo(false);
        }

        const decodedAudio = await ctx.decodeAudioData(arrayBuffer.slice(0));
        setMediaSourceTitle('Extracted audio1');
        setAudioBuffer(decodedAudio);
        setCurrentFrameIndex(0);
        showNotice(
          isVideo
            ? `✓ ভিডিও লোড হয়েছে! মুখে একবার ক্লিক করে মাউথ সেট করলেই অটো-ট্র্যাক শুরু হবে।`
            : `✓ অডিও এক্সট্র্যাক্ট ও মাউথ লিপ-সিঙ্ক সম্পন্ন!`
        );
      } catch {
        showNotice('অডিও ট্র্যাক পাওয়া যায়নি (ডিফল্ট ভয়েস ব্যবহৃত হচ্ছে)।');
      }
    },
    [
      config,
      customSprites.customCharacter,
      getAudioContext,
      handleUniversalCharacterUpload,
      showNotice,
      stopAudioPlayback,
    ]
  );

  const handleSelectStudioSoundPreset = useCallback(
    (presetId: StudioSoundPresetId, label: string) => {
      stopAudioPlayback();
      const ctx = getAudioContext();
      const buf = createStudioSoundPresetBuffer(ctx, presetId);
      setMediaSourceTitle(label);
      setAudioBuffer(buf);
      setCurrentFrameIndex(0);
      showNotice(`✓ "${label}" ভয়েস সেট হয়েছে!`);
    },
    [getAudioContext, showNotice, stopAudioPlayback]
  );

  const handleTriggerSoundFx = useCallback(
    (sfxId: StudioSoundFxId, label: string) => {
      stopAudioPlayback();
      const ctx = getAudioContext();
      const buf = createStudioSoundFxBuffer(ctx, sfxId);
      setMediaSourceTitle(`SFX · ${label}`);
      setAudioBuffer(buf);
      setCurrentFrameIndex(0);
      showNotice(`✓ "${label}" সেট হয়েছে!`);
    },
    [getAudioContext, showNotice, stopAudioPlayback]
  );

  const handleDownloadExtractedAudioWav = useCallback(() => {
    if (!audioBuffer) return;
    const wavBlob = audioBufferToWavBlob(audioBuffer);
    const url = URL.createObjectURL(wavBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `extracted_audio1.wav`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showNotice('✓ অডিও (.WAV) ডাউনলোড হয়েছে!');
  }, [audioBuffer, showNotice]);

  const handleUploadChartSheetToSlice = useCallback(
    async (file: File, cols = 4, rows = 3) => {
      showNotice(`মাউথ চার্ট শিট স্লাইস হচ্ছে...`);
      try {
        const slicedMap = await sliceMouthChartSheetImage(file, cols, rows, true);
        setCustomSprites((prev) => ({ ...prev, ...slicedMap }));
        showNotice(`✓ ১২টি মুখের এক্সপ্রেশন অটোমেটিক সেট হয়েছে!`);
      } catch {
        showNotice('মাউথ চার্ট ইমেজটি স্লাইস করা যায়নি।');
      }
    },
    [showNotice]
  );

  const handleUploadZipOrListing = useCallback(
    async (file: File) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (ext === 'zip') {
        try {
          const result = await parseUploadedZipFile(file);
          setZipEntries(result.entries);
          if (Object.keys(result.spriteMap).length > 0) {
            setCustomSprites((prev) => ({ ...prev, ...result.spriteMap }));
          }
          if (result.parsedConfigPartial) {
            setConfig((prev) => ({ ...prev, ...result.parsedConfigPartial }));
          }
          if (result.parsedCues && result.parsedCues.length > 0) {
            setCues(result.parsedCues);
            setFrames((prevFrames) =>
              applyCuesToFrames(prevFrames, result.parsedCues!, config)
            );
          }
          showNotice(`✓ ZIP থেকে ${result.entries.length}টি ফাইল লোড হয়েছে!`);
        } catch {
          showNotice('ZIP ফাইলটি পড়া যায়নি।');
        }
        return;
      }

      try {
        const text = await file.text();
        const { cues: parsedCues, configPartial } = parseListingText(text, config.fps);
        if (configPartial) setConfig((prev) => ({ ...prev, ...configPartial }));
        if (parsedCues.length > 0) {
          setCues(parsedCues);
          setFrames((prevFrames) => applyCuesToFrames(prevFrames, parsedCues, config));
          showNotice(`✓ লিস্টিং থেকে ${parsedCues.length}টি কিউ সিঙ্ক হয়েছে!`);
        }
      } catch {
        showNotice('লিস্টিং ফাইলটি পড়া যায়নি।');
      }
    },
    [config, showNotice]
  );

  const handleToggleMicRecording = useCallback(async () => {
    if (isRecordingMic && mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setIsRecordingMic(false);
      return;
    }

    try {
      stopAudioPlayback();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      micChunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) micChunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(micChunksRef.current, { type: 'audio/webm' });
        const arrayBuf = await blob.arrayBuffer();
        const ctx = getAudioContext();
        const decoded = await ctx.decodeAudioData(arrayBuf);
        setMediaSourceTitle('Extracted audio1 (Mic)');
        setAudioBuffer(decoded);
        setCurrentFrameIndex(0);
        showNotice('✓ ভয়েস রেকর্ড সম্পন্ন! এখন Play চাপুন।');
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsRecordingMic(true);
      showNotice('মাইক্রোফোনে কথা বলুন... শেষ হলে Stop চাপুন।');
    } catch {
      showNotice('মাইক্রোফোন পারমিশন পাওয়া যায়নি।');
    }
  }, [getAudioContext, isRecordingMic, showNotice, stopAudioPlayback]);

  const handleUpdateCue = useCallback(
    (cueId: string, patch: Partial<LipSyncCue>) => {
      const nextCues = cuesRef.current.map((c) =>
        c.id === cueId ? { ...c, ...patch } : c
      );
      cuesRef.current = nextCues;
      setCues(nextCues);
      setFrames((prevFrames) =>
        applyCuesToFrames(prevFrames, nextCues, configRef.current)
      );
    },
    []
  );

  const handleApplyImportedCues = useCallback(
    (importedCues: LipSyncCue[], configPartial?: Partial<EngineConfig> | null) => {
      if (configPartial) setConfig((prev) => ({ ...prev, ...configPartial }));
      setCues(importedCues);
      setFrames((prevFrames) => applyCuesToFrames(prevFrames, importedCues, config));
    },
    [config]
  );

  // BULLETPROOF UNIVERSAL .MP4 (H.264 + AAC) EXPORT FOR GALLERY & CAPCUT/EDITORS
  const exportCancelRef = useRef<boolean>(false);

  const handleStartVideoExport = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !audioBuffer || frames.length === 0) return;

    stopAudioPlayback();
    exportCancelRef.current = false;
    setExportModalOpen(true);
    setIsExportingVideo(true);
    setExportProgressPct(1);
    setExportedVideoUrl(null);

    const resSpec = EXPORT_RESOLUTIONS[config.exportResolution];

    // 1. Try Hardware/Software WebCodecs H.264 + AAC ISO .MP4 Muxer first (100% CapCut/KineMaster/Gallery compatible!)
    try {
      const mp4Result = await exportStandardMp4Video({
        width: resSpec.width,
        height: resSpec.height,
        fps: config.fps,
        totalFrames: frames.length,
        audioBuffer,
        isMuted,
        shouldCancel: () => exportCancelRef.current,
        onProgress: (pct) => setExportProgressPct(pct),
        renderFrameAt: async (frameIdx, exportCtx, w, h) => {
          const rawFrame = frames[frameIdx] || frames[0];
          const playheadSec = frameIdx / config.fps;
          if (videoRef.current && hasUploadedVideo) {
            videoRef.current.currentTime = playheadSec;
          }
          const activeClip = splitClips.find(
            (c) => playheadSec >= c.startTime && playheadSec <= c.endTime
          );
          const effectiveFrame: AudioAnalysisFrame =
            activeClip && !activeClip.lipSyncEnabled
              ? { ...rawFrame, viseme: VisemeCode.DROP, isDropped: true, liftY: 0 }
              : rawFrame;

          renderStudioStage(
            exportCtx,
            w,
            h,
            effectiveFrame,
            config,
            videoRef.current,
            hasUploadedVideo,
            loadedSpriteImagesRef.current,
            characterOverlays
          );
        },
      });

      if (mp4Result) {
        setIsExportingVideo(false);
        setExportProgressPct(100);
        setExportedVideoUrl(mp4Result.url);
        setExportedFilename(mp4Result.filename);

        try {
          const a = document.createElement('a');
          a.href = mp4Result.url;
          a.download = mp4Result.filename;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {
          // User can also click the Download MP4 button in modal
        }
        return;
      }
    } catch (err) {
      if ((err as Error)?.message === 'EXPORT_CANCELLED') {
        setIsExportingVideo(false);
        return;
      }
      // Fallback to native MediaRecorder if WebCodecs is unavailable
    }

    // 2. Fallback to MediaRecorder (prioritizing video/mp4 first)
    try {
      const ctx = getAudioContext();
      const dest = ctx.createMediaStreamDestination();
      const source = ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(dest);
      source.connect(ctx.destination);

      const canvasStream = canvas.captureStream(config.fps);
      const combinedStream = new MediaStream([
        ...canvasStream.getVideoTracks(),
        ...dest.stream.getAudioTracks(),
      ]);

      const { recorder, ext, mimeType } = createSafeMediaRecorder(combinedStream);
      activeRecorderRef.current = recorder;

      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          chunks.push(e.data);
        }
      };

      recorder.onstop = () => {
        setIsExportingVideo(false);
        setExportProgressPct(100);
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const fname = `toonsync-export-${Date.now()}.${ext}`;
        setExportedVideoUrl(url);
        setExportedFilename(fname);

        try {
          const a = document.createElement('a');
          a.href = url;
          a.download = fname;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        } catch {
          // User can tap the big Download button in the modal
        }
      };

      playbackStartTimeRef.current = ctx.currentTime;
      playbackStartOffsetRef.current = 0;
      activeSourceNodeRef.current = source;

      if (videoRef.current && hasUploadedVideo) {
        videoRef.current.currentTime = 0;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }

      recorder.start(200);
      source.start(0, 0);
      setIsPlaying(true);

      const canvasCtx = canvas.getContext('2d');

      const tick = () => {
        if (!audioCtxRef.current || !activeSourceNodeRef.current) {
          if (recorder.state === 'recording') recorder.stop();
          return;
        }
        const elapsed = audioCtxRef.current.currentTime - playbackStartTimeRef.current;
        const nextFrame = Math.floor(elapsed * config.fps);
        const pct = Math.min(99, Math.round((nextFrame / Math.max(1, frames.length)) * 100));
        setExportProgressPct(pct);

        if (nextFrame >= frames.length) {
          if (recorder.state === 'recording') {
            recorder.stop();
          }
          stopAudioPlayback();
          return;
        }

        const frameObj = frames[nextFrame] || frames[0];
        if (canvasCtx && frameObj) {
          renderStudioStage(
            canvasCtx,
            canvas.width,
            canvas.height,
            frameObj,
            config,
            videoRef.current,
            hasUploadedVideo,
            loadedSpriteImagesRef.current,
            characterOverlays
          );
        }

        setCurrentFrameIndex(nextFrame);
        rafIdRef.current = requestAnimationFrame(tick);
      };

      rafIdRef.current = requestAnimationFrame(tick);
    } catch {
      setIsExportingVideo(false);
      showNotice('ভিডিও এক্সপোর্ট শুরু করা যায়নি। আবার চেষ্টা করুন।');
    }
  }, [
    audioBuffer,
    characterOverlays,
    config,
    frames,
    getAudioContext,
    hasUploadedVideo,
    isMuted,
    showNotice,
    splitClips,
    stopAudioPlayback,
  ]);

  const handleCancelExport = useCallback(() => {
    exportCancelRef.current = true;
    if (activeRecorderRef.current && activeRecorderRef.current.state === 'recording') {
      try {
        activeRecorderRef.current.onstop = null;
        activeRecorderRef.current.stop();
      } catch {
        // Ignore
      }
    }
    stopAudioPlayback();
    setIsExportingVideo(false);
    setExportModalOpen(false);
  }, [stopAudioPlayback]);

  /**
   * Stage Pointer Handler:
   * When the user sets the mouth on the character/video for the first time,
   * it locks the anchor AND captures the optical tracking template so the mouth
   * automatically tracks the character across every frame!
   */
  const updateStageFromPointer = (
    e: React.MouseEvent<HTMLCanvasElement>,
    captureTemplateNow = false
  ) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const normX = (e.clientX - rect.left) / rect.width;
    const normY = (e.clientY - rect.top) / rect.height;
    const resSpec = EXPORT_RESOLUTIONS[config.exportResolution];

    if (config.stageDragMode === 'mouth-pin') {
      const stageX = normX * resSpec.width;
      const stageY = normY * resSpec.height;
      const charCenterX = config.characterTransform.x * resSpec.width;
      const charCenterY = config.characterTransform.y * resSpec.height;
      const scale = Math.max(0.25, config.characterTransform.scale);

      const offsetX = Math.max(-420, Math.min(420, Math.round((stageX - charCenterX) / scale)));
      const offsetY = Math.max(-420, Math.min(420, Math.round((stageY - charCenterY) / scale)));

      const customCharImg = loadedSpriteImagesRef.current.customCharacter;
      const nextSkinColor =
        customCharImg && customCharImg.complete
          ? sampleCharacterFaceColor(customCharImg, offsetX, offsetY)
          : config.mouthAnchor.skinMaskColor;

      const updatedConfig: EngineConfig = {
        ...config,
        mouthAnchor: {
          ...config.mouthAnchor,
          offsetX,
          offsetY,
          skinMaskColor: nextSkinColor,
        },
      };
      setConfig(updatedConfig);

      // Capture the visual tracking patch around the newly pinned mouth coordinate!
      if (captureTemplateNow) {
        const trackSource =
          hasUploadedVideo && videoRef.current
            ? videoRef.current
            : loadedSpriteImagesRef.current.customCharacter || null;
        captureMouthTrackingTemplate(trackSource, updatedConfig);
      }
    } else {
      const clampedX = Math.max(0.08, Math.min(0.92, normX));
      const clampedY = Math.max(0.15, Math.min(0.92, normY));
      setConfig((prev) => ({
        ...prev,
        characterTransform: {
          ...prev.characterTransform,
          x: Number(clampedX.toFixed(3)),
          y: Number(clampedY.toFixed(3)),
        },
      }));
    }
  };

  const totalFrames = Math.max(1, frames.length);
  const currentFrame = frames[currentFrameIndex] || frames[0];
  const currentVisemeMeta = currentFrame
    ? VISEME_LIBRARY[currentFrame.viseme]
    : VISEME_LIBRARY[VisemeCode.DROP];

  const activeResolutionSpec = EXPORT_RESOLUTIONS[config.exportResolution];
  const playheadPercent = (currentFrameIndex / Math.max(1, totalFrames - 1)) * 100;
  const totalDurationSec = Math.max(1, audioBuffer?.duration || 8);
  const timelinePxPerSec = Math.round(95 * timelineZoom);
  const scrollableTimelineWidthPx = Math.max(
    520,
    Math.round(totalDurationSec * timelinePxPerSec)
  );

  const formatCapCutTime = (secTotal: number) => {
    const mins = Math.floor(secTotal / 60);
    const secs = Math.floor(secTotal % 60);
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  const handleTimelineScrub = (e: React.MouseEvent<HTMLDivElement>) => {
    const targetEl = timelineTrackInnerRef.current || e.currentTarget;
    const rect = targetEl.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    handleSeekFrame(Math.floor(ratio * (totalFrames - 1)));
  };

  const secondMarkers = Array.from(
    { length: Math.ceil(totalDurationSec) + 1 },
    (_, i) => i
  );

  // If the user is on the Initial Home Dashboard screen, render MobileHomeDashboard
  if (activeScreen === 'home') {
    return (
      <>
        {statusBanner && (
          <div className="fixed top-4 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-[#1F2026] border border-[#00C8E0]/50 text-white text-xs font-semibold shadow-2xl flex items-center gap-2 z-50">
            <span>{statusBanner}</span>
            <button
              type="button"
              onClick={() => setStatusBanner(null)}
              className="text-zinc-400 hover:text-white cursor-pointer"
            >
              ✕
            </button>
          </div>
        )}
        <MobileHomeDashboard
          projects={localProjects}
          activeProjectId={activeProjectId}
          onCreateProject={handleCreateNewLocalProject}
          onOpenProject={handleOpenLocalProject}
          onDeleteProject={handleDeleteLocalProject}
          onDuplicateProject={handleDuplicateLocalProject}
          onResumeCurrentEditor={() => setActiveScreen('editor')}
          onImportProjectJson={async (imported) => {
            await handleCreateNewLocalProject(imported, false);
          }}
        />
      </>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#0D0D0F] text-white select-none overflow-hidden font-sans">
      {/* Hidden Video Element */}
      <video ref={videoRef} playsInline crossOrigin="anonymous" className="hidden" />

      {/* =====================================================================
          1. EXACT CAPCUT TOP HEADER BAR: [ Home / Projects ] [ Save ] [ + Character ] ......... [ AI UHD ▾ ] [ Export ]
         ===================================================================== */}
      <header className="h-14 px-4 bg-[#0D0D0F] flex items-center justify-between shrink-0 z-30">
        <div className="flex items-center gap-2.5 sm:gap-3">
          <button
            type="button"
            onClick={async () => {
              stopAudioPlayback();
              setActiveBottomTab(null);
              await handleSaveCurrentProjectLocally(true);
              setActiveScreen('home');
            }}
            title="হোম ড্যাশবোর্ড ও সেভ করা প্রজেক্ট লিস্টে ফিরে যান"
            className="px-2.5 py-1.5 rounded-lg bg-[#1A1C23] hover:bg-[#242731] border border-zinc-700/90 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5 text-[#00E1FA]" />
            <span>Projects (হোম)</span>
          </button>

          <button
            type="button"
            onClick={() => handleSaveCurrentProjectLocally(false)}
            title="ফোনের লোকাল স্টোরেজে প্রজেক্ট সেভ করুন"
            className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-xs font-bold text-emerald-300 flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save Local</span>
          </button>

          <span className="hidden md:inline text-xs font-bold text-zinc-300 max-w-[170px] truncate border-l border-zinc-800 pl-2.5">
            {activeProjectName}
          </span>

          <button
            type="button"
            onClick={() => {
              setSettingsSection('auto-listing');
              setSettingsOpen(true);
            }}
            title="মাউথ চার্ট অটো-লিস্টিং ও কোড খুঁজুন"
            className="text-zinc-200 hover:text-white transition-colors cursor-pointer"
          >
            <Search className="w-5 h-5 stroke-[2]" />
          </button>

          {/* Direct Native Label Button to Upload ANY Character Format (Image, GIF, SVG, or Video) */}
          <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1F2026] hover:bg-[#2A2C34] border border-zinc-700 text-xs font-semibold text-[#00E1FA] cursor-pointer">
            <UserPlus className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">+ ক্যারেক্টার আপলোড</span>
            <input
              type="file"
              accept="image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.mp4,.webm,.mov,.mkv"
              onClick={(e) => {
                e.currentTarget.value = '';
              }}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleUniversalCharacterUpload(f);
              }}
              className="hidden"
            />
          </label>
        </div>

        {/* Right: [ AI UHD ▾ ] Dropdown Pill + Cyan [ Export ] Button */}
        <div className="relative flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => setShowResDropdown((v) => !v)}
            className="px-3.5 py-1.5 rounded-lg bg-[#222328] hover:bg-[#2C2D33] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <span>
              {config.exportResolution === 'youtube-1080p'
                ? 'AI UHD'
                : EXPORT_RESOLUTIONS[config.exportResolution].aspectLabel}
            </span>
            <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
          </button>

          {showResDropdown && (
            <div className="absolute right-24 top-11 w-48 rounded-xl bg-[#1F2026] border border-zinc-700 shadow-2xl py-1.5 z-50 text-xs">
              {Object.values(EXPORT_RESOLUTIONS).map((res) => (
                <button
                  key={res.id}
                  type="button"
                  onClick={() => {
                    setConfig((prev) => ({ ...prev, exportResolution: res.id }));
                    setShowResDropdown(false);
                  }}
                  className={`w-full px-3.5 py-2 text-left flex items-center justify-between hover:bg-zinc-800 cursor-pointer ${
                    config.exportResolution === res.id
                      ? 'text-[#00D2E6] font-bold'
                      : 'text-zinc-200'
                  }`}
                >
                  <span>{res.label}</span>
                  <span className="font-mono text-[10px] text-zinc-400">
                    {res.aspectLabel}
                  </span>
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            onClick={handleStartVideoExport}
            disabled={isExportingVideo}
            className="px-4 py-1.5 rounded-lg bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 font-bold text-xs tracking-wide shadow-sm transition-colors cursor-pointer"
          >
            {isExportingVideo ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </header>

      {/* Subtle Toast Banner */}
      {statusBanner && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 px-4 py-1.5 rounded-full bg-[#1F2026] border border-zinc-700 text-white text-xs font-medium shadow-xl flex items-center gap-2 z-40">
          <span>{statusBanner}</span>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-zinc-400 hover:text-white cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* =====================================================================
          2. CENTRAL STAGE DISPLAY AREA & FULL-SCREEN EXPANDABLE CANVAS
             (Expands to fit entire display in Full-Screen mode while keeping Back/Navigation buttons active!)
         ===================================================================== */}
      <div
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault();
          const f = e.dataTransfer.files?.[0];
          if (!f) return;
          const ext = f.name.split('.').pop()?.toLowerCase() || '';
          if (['zip', 'json', 'tsv', 'csv', 'dat'].includes(ext)) {
            handleUploadZipOrListing(f);
          } else {
            handleUniversalCharacterUpload(f);
          }
        }}
        className={
          isFullscreenPreview
            ? 'fixed inset-0 z-50 bg-[#0D0D0F] flex flex-col justify-between select-none'
            : 'flex-1 min-h-0 flex items-center justify-center px-4 py-1 bg-[#0D0D0F]'
        }
      >
        {/* ACTIVE FULL-SCREEN TOP NAVIGATION BAR (Back Button, Layer Selector, Export & Exit Fullscreen) */}
        {isFullscreenPreview && (
          <div className="h-14 px-4 bg-[#121318]/95 border-b border-zinc-800 flex items-center justify-between gap-3 shrink-0 z-30">
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() => setIsFullscreenPreview(false)}
                className="px-3 py-1.5 rounded-xl bg-[#1F2026] hover:bg-zinc-800 border border-zinc-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
              >
                <ArrowLeft className="w-4 h-4 text-[#00C8E0]" />
                <span>Back to Editor (পিছনে ফিরুন)</span>
              </button>

              <span className="hidden sm:inline text-xs text-zinc-400 font-mono tabular-nums">
                {formatCapCutTime(currentFrameIndex / config.fps)} /{' '}
                {formatCapCutTime(totalDurationSec)}
              </span>
            </div>

            {/* Active Layer Direct Selector Pills inside Full-Screen */}
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  { id: 'mouth', label: '👄 Mouth Layer' },
                  { id: 'lip-segment', label: '🫦 Lip Segment' },
                  { id: 'character', label: '🧍 Character Layer' },
                  { id: 'background', label: '🖼️ Background Layer' },
                  { id: 'none', label: '✓ Clean View' },
                ] as const
              ).map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => setSelectedCanvasLayer(l.id)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer whitespace-nowrap transition-colors ${
                    selectedCanvasLayer === l.id
                      ? 'bg-[#00C8E0] text-zinc-950'
                      : 'bg-[#1C1D22] text-zinc-300 hover:text-white border border-zinc-800'
                  }`}
                >
                  {l.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleStartVideoExport}
                disabled={isExportingVideo}
                className="px-3.5 py-1.5 rounded-lg bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 font-bold text-xs cursor-pointer"
              >
                {isExportingVideo ? 'Exporting...' : 'Export'}
              </button>
              <button
                type="button"
                onClick={() => setIsFullscreenPreview(false)}
                title="Exit Fullscreen"
                className="p-2 rounded-lg bg-[#1F2026] hover:bg-zinc-800 text-zinc-200 hover:text-white border border-zinc-700 cursor-pointer"
              >
                <Minimize2 className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* MAIN STAGE PREVIEW CANVAS CONTAINER */}
        <div
          className={`relative ${
            isFullscreenPreview
              ? 'flex-1 w-full h-full flex items-center justify-center p-2 sm:p-4 overflow-hidden'
              : 'h-full w-full max-w-[330px] sm:max-w-[390px] bg-[#D8D8D8] flex flex-col items-center justify-center overflow-hidden shadow-2xl transition-all'
          }`}
        >
          <div
            className={`relative flex items-center justify-center overflow-hidden ${
              isFullscreenPreview
                ? 'w-full h-full max-w-6xl bg-[#14151A] rounded-xl shadow-2xl border border-zinc-800'
                : 'w-full h-full'
            }`}
          >
            <canvas
              ref={canvasRef}
              width={activeResolutionSpec.width}
              height={activeResolutionSpec.height}
              className="w-full h-full object-contain bg-[#C9C4BE]"
            />

            {/* INTERACTIVE ON-SCREEN LAYER TRANSFORM CONTROLLER (Clean & Clutter-Free!) */}
            <InteractiveStageOverlay
              config={config}
              isPlaying={isPlaying}
              selectedLayer={selectedCanvasLayer}
              selectedOverlayId={selectedOverlayId}
              characterOverlays={characterOverlays}
              activeViseme={currentFrame?.viseme || VisemeCode.DROP}
              onSelectLayer={(layer, ovId) => {
                setSelectedCanvasLayer(layer);
                if (ovId !== undefined) setSelectedOverlayId(ovId);
              }}
              onUpdateConfig={pushConfigUpdate}
              onUpdateMouthAnchor={handleUpdateMouthAnchor}
              onUpdatePerKeyLift={handleUpdatePerKeyLift}
              onUploadMainCharacter={handleUniversalCharacterUpload}
              onAddOverlayCharacter={handleAddCharacterOverlay}
              onUpdateOverlay={handleUpdateCharacterOverlay}
              onDeleteOverlay={handleDeleteCharacterOverlay}
              hasImportedMainCharacter={Boolean(
                customSprites.customCharacter || hasUploadedVideo
              )}
              onDeleteMainCharacter={handleDeleteImportedMainCharacter}
              onCaptureTrackerTemplate={() => {
                const trackSource =
                  hasUploadedVideo && videoRef.current
                    ? videoRef.current
                    : loadedSpriteImagesRef.current.customCharacter || null;
                captureMouthTrackingTemplate(trackSource, config);
              }}
            />
          </div>
        </div>

        {/* ACTIVE FULL-SCREEN BOTTOM PLAYBACK & TIMELINE SCRUB BAR */}
        {isFullscreenPreview && (
          <div className="h-16 px-5 bg-[#121318]/95 border-t border-zinc-800 flex items-center gap-4 shrink-0 z-30">
            <button
              type="button"
              onClick={handleTogglePlay}
              className="w-10 h-10 rounded-full bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 flex items-center justify-center cursor-pointer shrink-0 shadow-md"
            >
              {isPlaying ? (
                <Pause className="w-5 h-5 stroke-[2.2]" />
              ) : (
                <Play className="w-5 h-5 stroke-[2.2] ml-0.5" />
              )}
            </button>

            <button
              type="button"
              onClick={handleToggleMute}
              className="p-2 rounded-lg bg-[#1F2026] hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer shrink-0"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-rose-400" />
              ) : (
                <Volume2 className="w-4 h-4" />
              )}
            </button>

            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs font-mono tabular-nums text-zinc-200 w-12">
                {formatCapCutTime(currentFrameIndex / config.fps)}
              </span>
              <input
                type="range"
                min={0}
                max={Math.max(1, totalFrames - 1)}
                value={currentFrameIndex}
                onChange={(e) => handleSeekFrame(Number(e.target.value))}
                className="flex-1 accent-[#00C8E0] cursor-pointer"
              />
              <span className="text-xs font-mono tabular-nums text-zinc-400 w-12 text-right">
                {formatCapCutTime(totalDurationSec)}
              </span>
            </div>

            <button
              type="button"
              onClick={() => setIsFullscreenPreview(false)}
              className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-semibold cursor-pointer shrink-0"
            >
              Exit Fullscreen
            </button>
          </div>
        )}
      </div>

      {/* =====================================================================
          3. CAPCUT TRANSPORT CONTROL ROW: [ ⛶ ] .......... [ ▷ ] ...... [TRACK ON] [ ↶ ] [ ↷ ]
         ===================================================================== */}
      <div className="h-11 px-5 bg-[#0D0D0F] flex items-center justify-between shrink-0">
        <button
          type="button"
          onClick={() => setIsFullscreenPreview((v) => !v)}
          title="বড় ডিসপ্লে ভিউ"
          className="text-zinc-300 hover:text-white transition-colors cursor-pointer"
        >
          {isFullscreenPreview ? (
            <Minimize2 className="w-5 h-5 stroke-[1.8]" />
          ) : (
            <Maximize2 className="w-5 h-5 stroke-[1.8]" />
          )}
        </button>

        <button
          type="button"
          onClick={handleTogglePlay}
          title={isPlaying ? 'Pause' : 'Play'}
          className="p-2 text-zinc-100 hover:text-[#00C8E0] transition-transform active:scale-90 cursor-pointer"
        >
          {isPlaying ? (
            <Pause className="w-6 h-6 stroke-[2]" />
          ) : (
            <Play className="w-6 h-6 stroke-[2] ml-0.5" />
          )}
        </button>

        {/* Right: Undo [↶] + Redo [↷] (Tracking controls relocated to Bottom Section) */}
        <div className="flex items-center gap-3.5">
          <button
            type="button"
            onClick={handleUndo}
            disabled={configHistory.length === 0}
            title="Undo"
            className={`transition-colors cursor-pointer ${
              configHistory.length > 0
                ? 'text-zinc-300 hover:text-white'
                : 'text-zinc-600'
            }`}
          >
            <Undo2 className="w-5 h-5 stroke-[1.8]" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (!audioBuffer) return;
              const result = analyzeAudioBuffer(audioBuffer, config);
              setFrames(result.frames);
              setCues(result.cues);
              showNotice('✓ অটো মাউথ লিপ-সিঙ্ক ও ট্র্যাকার রিফ্রেশ হয়েছে');
            }}
            title="Redo / Re-Sync Audio"
            className="text-zinc-300 hover:text-white transition-colors cursor-pointer"
          >
            <Redo2 className="w-5 h-5 stroke-[1.8]" />
          </button>
        </div>
      </div>

      {/* =====================================================================
          4. TIMECODE, QUICK SPLIT/MUTE & CAPCUT TIMELINE ZOOM BAR
         ===================================================================== */}
      <div className="h-8 px-3 bg-[#111216] border-t border-zinc-800/90 flex items-center justify-between gap-2 text-[11px] font-mono shrink-0">
        {/* Left: Timecode + Split (/) + Mute */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 tabular-nums">
            <span className="text-[#00E1FA] font-bold">
              {formatCapCutTime(currentFrameIndex / config.fps)}
            </span>
            <span className="text-zinc-600">/</span>
            <span className="text-zinc-400">
              {formatCapCutTime(totalDurationSec)}
            </span>
          </div>

          <button
            type="button"
            onClick={handleSplitClipAtPlayhead}
            title="Split Clip at Playhead (/)"
            className="px-2 py-0.5 rounded bg-[#1C1D23] hover:bg-[#00C8E0] hover:text-zinc-950 border border-[#00C8E0]/50 text-[#00E1FA] text-[10px] font-sans font-bold flex items-center gap-1 cursor-pointer transition-colors"
          >
            <Scissors className="w-3 h-3" />
            <span>Split (/)</span>
          </button>

          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute Audio' : 'Mute Audio'}
            className={`px-2 py-0.5 rounded border text-[10px] font-sans font-semibold flex items-center gap-1 cursor-pointer ${
              isMuted
                ? 'bg-rose-950/40 border-rose-500/50 text-rose-300'
                : 'bg-[#1C1D23] border-zinc-800 text-zinc-300 hover:text-white'
            }`}
          >
            {isMuted ? (
              <VolumeX className="w-3 h-3 text-rose-400" />
            ) : (
              <Volume2 className="w-3 h-3 text-[#00C8E0]" />
            )}
            <span>{isMuted ? 'Muted' : 'Audio'}</span>
          </button>
        </div>

        {/* Right: CapCut Horizontal Timeline Zoom Controls */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() =>
              setTimelineZoom((z) => Number(Math.max(1, z - 0.5).toFixed(1)))
            }
            title="Zoom Out Timeline"
            className="p-1 rounded bg-[#1C1D23] hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <input
            type="range"
            min={1}
            max={5.5}
            step={0.25}
            value={timelineZoom}
            onChange={(e) => setTimelineZoom(Number(e.target.value))}
            title="Timeline Horizontal Zoom"
            className="w-20 sm:w-28 accent-[#00C8E0] cursor-pointer"
          />
          <button
            type="button"
            onClick={() =>
              setTimelineZoom((z) => Number(Math.min(5.5, z + 0.5).toFixed(1)))
            }
            title="Zoom In Timeline"
            className="p-1 rounded bg-[#1C1D23] hover:bg-zinc-800 text-zinc-300 hover:text-white cursor-pointer"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <span className="text-[10px] text-zinc-400 tabular-nums w-8 text-right">
            {timelineZoom.toFixed(1)}x
          </span>
        </div>
      </div>

      {/* =====================================================================
          5. CAPCUT-STYLE HORIZONTALLY SCROLLABLE MULTI-LAYER TIMELINE
             (Independent Layers: Lip/Mouth · Character · Audio · Lifting · Background)
         ===================================================================== */}
      <div
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            const delta = e.deltaY < 0 ? 0.35 : -0.35;
            setTimelineZoom((z) =>
              Number(Math.max(1, Math.min(5.5, z + delta)).toFixed(2))
            );
          }
        }}
        className="relative h-52 bg-[#0D0D0F] border-t border-zinc-800/80 flex items-stretch overflow-hidden shrink-0"
      >
        {/* LEFT PINNED INDEPENDENT LAYER HEADERS COLUMN */}
        <div className="w-36 sm:w-44 bg-[#121318] border-r border-zinc-800/90 flex flex-col justify-between py-1.5 px-2 shrink-0 z-20 text-[10px]">
          <div className="h-5 flex items-center justify-between px-1 text-zinc-400 font-semibold border-b border-zinc-800/70">
            <span>LAYERS (লেয়ার)</span>
            <span className="font-mono text-[9px] text-[#00C8E0]">
              {currentVisemeMeta.shortCode}
            </span>
          </div>

          {/* Header 1: Independent Lip Segment / Mouth Layer */}
          <div
            onClick={() => setSelectedCanvasLayer('mouth')}
            className={`h-8 px-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
              selectedCanvasLayer === 'mouth' ||
              selectedCanvasLayer === 'lip-segment'
                ? 'bg-[#00C8E0]/20 border-[#00C8E0] text-white'
                : 'bg-[#191B22] border-zinc-800/90 text-zinc-300 hover:text-white'
            }`}
          >
            <span className="font-bold truncate">👄 Lip / Mouth</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfig((prev) => ({
                    ...prev,
                    layers: {
                      ...prev.layers,
                      mouthLayer: !prev.layers.mouthLayer,
                    },
                  }));
                }}
                title="Show/Hide Mouth Layer"
                className="p-0.5 rounded hover:bg-zinc-700 text-[#00C8E0] cursor-pointer"
              >
                {config.layers.mouthLayer ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3 text-zinc-500" />
                )}
              </button>
            </div>
          </div>

          {/* Header 2: Independent Character / Video Layer */}
          <div
            onClick={() => setSelectedCanvasLayer('character')}
            className={`h-10 px-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
              selectedCanvasLayer === 'character'
                ? 'bg-white/15 border-white text-white'
                : 'bg-[#191B22] border-zinc-800/90 text-zinc-300 hover:text-white'
            }`}
          >
            <span className="font-bold truncate">🧍 Character</span>
            <div className="flex items-center gap-1 shrink-0">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setConfig((prev) => ({
                    ...prev,
                    layers: {
                      ...prev.layers,
                      characterLayer: !prev.layers.characterLayer,
                    },
                  }));
                }}
                title="Show/Hide Character Layer"
                className="p-0.5 rounded hover:bg-zinc-700 text-zinc-200 cursor-pointer"
              >
                {config.layers.characterLayer ? (
                  <Eye className="w-3 h-3" />
                ) : (
                  <EyeOff className="w-3 h-3 text-zinc-500" />
                )}
              </button>
              {(customSprites.customCharacter || hasUploadedVideo) && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteImportedMainCharacter();
                  }}
                  title="Delete Imported Character/Video"
                  className="p-0.5 rounded bg-rose-600/90 hover:bg-rose-500 text-white cursor-pointer"
                >
                  <Trash2 className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          {/* Header 3: Independent Audio Waveform Layer */}
          <div
            onClick={() =>
              setActiveBottomTab((prev) => (prev === 'audio' ? null : 'audio'))
            }
            className={`h-8 px-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
              activeBottomTab === 'audio'
                ? 'bg-emerald-500/20 border-emerald-400 text-emerald-200'
                : 'bg-[#191B22] border-zinc-800/90 text-zinc-300 hover:text-white'
            }`}
          >
            <span className="font-bold truncate">🎵 Audio Track</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleToggleMute();
              }}
              className="p-0.5 rounded hover:bg-zinc-700 text-cyan-300 cursor-pointer"
            >
              {isMuted ? (
                <VolumeX className="w-3 h-3 text-rose-400" />
              ) : (
                <Volume2 className="w-3 h-3" />
              )}
            </button>
          </div>

          {/* Header 4: Independent Lifting Layer */}
          <div
            onClick={() => {
              if (!config.layers.liftingLayer || config.maxLiftPx === 0) {
                setConfig((prev) => ({
                  ...prev,
                  maxLiftPx: prev.maxLiftPx > 0 ? prev.maxLiftPx : 18,
                  layers: {
                    ...prev.layers,
                    liftingLayer: true,
                  },
                }));
              }
              setActiveBottomTab((prev) =>
                prev === 'lifting' ? null : 'lifting'
              );
            }}
            className={`h-7 px-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
              config.layers.liftingLayer && config.maxLiftPx > 0
                ? 'bg-purple-600/25 border-purple-400 text-purple-200'
                : 'bg-[#191B22] border-zinc-800/90 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="font-bold truncate">⬆ Lifting</span>
            <span className="font-mono text-[9px] text-purple-300">
              {config.layers.liftingLayer && config.maxLiftPx > 0
                ? `+${config.maxLiftPx}px`
                : 'OFF'}
            </span>
          </div>

          {/* Header 5: Procedural Animation Layer (Hair, Leaves & Speech Head Tilt) */}
          <div
            onClick={() =>
              setActiveBottomTab((prev) =>
                prev === 'procedural' ? null : 'procedural'
              )
            }
            className={`h-7 px-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
              activeBottomTab === 'procedural' ||
              (config.proceduralAnimation?.enabled !== false &&
                config.layers.proceduralLayer !== false)
                ? 'bg-teal-500/20 border-teal-400 text-teal-200'
                : 'bg-[#191B22] border-zinc-800/90 text-zinc-400 hover:text-white'
            }`}
          >
            <span className="font-bold truncate">🍃 Hair & Leaves</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                const isOn =
                  config.proceduralAnimation?.enabled !== false &&
                  config.layers.proceduralLayer !== false;
                handleUpdateProceduralAnimation({ enabled: !isOn });
              }}
              title="Toggle Procedural Hair, Leaves & Head Tilt"
              className="font-mono text-[9px] text-teal-300 hover:text-white cursor-pointer"
            >
              {config.proceduralAnimation?.enabled !== false &&
              config.layers.proceduralLayer !== false
                ? 'ON'
                : 'OFF'}
            </button>
          </div>

          {/* Header 6: Independent Background Layer */}
          <div
            onClick={() => setSelectedCanvasLayer('background')}
            className={`h-7 px-2 rounded-lg border flex items-center justify-between cursor-pointer transition-colors ${
              selectedCanvasLayer === 'background'
                ? 'bg-indigo-500/25 border-indigo-400 text-indigo-200'
                : 'bg-[#191B22] border-zinc-800/90 text-zinc-300 hover:text-white'
            }`}
          >
            <span className="font-bold truncate">🖼️ Background</span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setConfig((prev) => ({
                  ...prev,
                  layers: {
                    ...prev.layers,
                    backgroundLayer: !prev.layers.backgroundLayer,
                  },
                }));
              }}
              title="Show/Hide Background Layer"
              className="p-0.5 rounded hover:bg-zinc-700 text-indigo-300 cursor-pointer"
            >
              {config.layers.backgroundLayer ? (
                <Eye className="w-3 h-3" />
              ) : (
                <EyeOff className="w-3 h-3 text-zinc-500" />
              )}
            </button>
          </div>
        </div>

        {/* RIGHT HORIZONTALLY SCROLLABLE MULTI-LAYER TRACK CANVAS */}
        <div
          ref={timelineScrollRef}
          className="flex-1 overflow-x-auto overflow-y-hidden relative select-none"
        >
          <div
            ref={timelineTrackInnerRef}
            style={{ width: `${scrollableTimelineWidthPx}px`, minWidth: '100%' }}
            onMouseDown={(e) => {
              setIsScrubbingTimeline(true);
              handleTimelineScrub(e);
            }}
            onMouseMove={(e) => {
              if (isScrubbingTimeline) handleTimelineScrub(e);
            }}
            onMouseUp={() => setIsScrubbingTimeline(false)}
            onMouseLeave={() => setIsScrubbingTimeline(false)}
            className="relative h-full py-1.5 px-2 flex flex-col justify-between cursor-ew-resize"
          >
            {/* VERTICAL WHITE PLAYHEAD LINE + CAPCUT HANDLE */}
            <div
              style={{ left: `${playheadPercent}%` }}
              className="absolute top-0 bottom-0 w-[2px] bg-white z-30 pointer-events-none shadow-[0_0_8px_rgba(255,255,255,0.9)]"
            >
              <div className="w-3 h-3 -ml-[5px] rounded-b-sm bg-white border border-zinc-900" />
            </div>

            {/* 0. SCROLLABLE TIMECODE RULER ROW */}
            <div className="relative h-5 border-b border-zinc-800/80 flex items-center text-[10px] font-mono text-zinc-500">
              {secondMarkers.map((sec) => {
                const leftPct = Math.min(100, (sec / totalDurationSec) * 100);
                return (
                  <div
                    key={sec}
                    style={{ left: `${leftPct}%` }}
                    className="absolute top-0 bottom-0 flex items-center pointer-events-none"
                  >
                    <div className="h-2 w-[1px] bg-zinc-700 mr-1" />
                    <span className="tabular-nums">{formatCapCutTime(sec)}</span>
                  </div>
                );
              })}
            </div>

            {/* TRACK 1: INDEPENDENT LIP SEGMENT / MOUTH LAYER TRACK (Synced with Audio Visemes!) */}
            <div
              onClick={() => setSelectedCanvasLayer('mouth')}
              className={`relative h-8 rounded-lg bg-[#142229] border flex items-center overflow-hidden transition-colors ${
                selectedCanvasLayer === 'mouth' ||
                selectedCanvasLayer === 'lip-segment'
                  ? 'border-[#00E1FA] ring-1 ring-[#00E1FA]/50'
                  : 'border-[#00C8E0]/35 hover:border-[#00C8E0]/70'
              }`}
            >
              {cues.map((cue) => {
                const leftPct = (cue.startTime / totalDurationSec) * 100;
                const widthPct = Math.max(
                  0.8,
                  ((cue.endTime - cue.startTime) / totalDurationSec) * 100
                );
                const meta = VISEME_LIBRARY[cue.viseme];
                const isDropped = cue.isDropped || cue.viseme === VisemeCode.DROP;
                return (
                  <div
                    key={cue.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCanvasLayer('mouth');
                      handleSeekFrame(cue.startFrame);
                    }}
                    style={{
                      left: `${leftPct}%`,
                      width: `${widthPct}%`,
                      backgroundColor: isDropped
                        ? 'rgba(39, 39, 42, 0.35)'
                        : `${meta.color}33`,
                      borderColor: isDropped
                        ? 'rgba(82, 82, 91, 0.3)'
                        : meta.color,
                    }}
                    title={`Mouth Cue: ${meta.shortCode} (${cue.startTime.toFixed(2)}s - ${cue.endTime.toFixed(2)}s)`}
                    className="absolute top-0.5 bottom-0.5 rounded border-l-2 px-1 flex items-center overflow-hidden cursor-pointer hover:brightness-125"
                  >
                    {!isDropped && widthPct > 2.2 && (
                      <span className="font-mono text-[9px] font-bold text-white truncate drop-shadow">
                        {meta.shortCode}
                      </span>
                    )}
                  </div>
                );
              })}
              <span className="relative z-10 ml-2 text-[9px] font-semibold text-[#00E1FA]/90 pointer-events-none drop-shadow">
                👄 Lip-Sync Mouth Layer ({cues.filter((c) => !c.isDropped).length} active cues · Scale {Math.round(config.mouthAnchor.scale * 100)}%)
              </span>
            </div>

            {/* TRACK 2: INDEPENDENT CHARACTER / VIDEO CLIPS LAYER TRACK */}
            <div
              onClick={() => setSelectedCanvasLayer('character')}
              className={`relative h-10 rounded-lg bg-[#23242A] border flex items-center overflow-hidden transition-colors ${
                selectedCanvasLayer === 'character'
                  ? 'border-white ring-1 ring-white/50'
                  : 'border-zinc-700/80'
              }`}
            >
              <div className="flex items-stretch w-full h-full">
                {splitClips.map((clip, idx) => {
                  const widthPct = Math.max(
                    6,
                    ((clip.endTime - clip.startTime) / totalDurationSec) * 100
                  );
                  const isSelected = selectedSplitClipId === clip.id;

                  return (
                    <div
                      key={clip.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedSplitClipId(clip.id);
                        setSelectedCanvasLayer('character');
                      }}
                      style={{ width: `${widthPct}%` }}
                      className={`relative h-full flex items-center overflow-hidden cursor-pointer transition-all ${
                        isSelected
                          ? 'ring-1 ring-inset ring-[#00E1FA] bg-[#2E313B]'
                          : 'bg-[#252730] opacity-90 hover:opacity-100'
                      }`}
                    >
                      {(customSprites.customCharacter || filmstripThumbUrl) && (
                        <img
                          src={customSprites.customCharacter || filmstripThumbUrl!}
                          alt=""
                          className="absolute inset-0 w-full h-full object-cover opacity-45 pointer-events-none"
                        />
                      )}

                      {idx > 0 && (
                        <div
                          title="Split Cut Point (/)"
                          className="absolute left-0 top-0 bottom-0 w-2.5 bg-black/85 border-x border-[#00E1FA] flex items-center justify-center z-20 text-[8px] font-bold text-[#00E1FA]"
                        >
                          /
                        </div>
                      )}

                      <div className="relative z-10 px-2 flex items-center justify-between w-full gap-1 text-[10px]">
                        <span className="font-mono font-bold text-white drop-shadow truncate">
                          🧍 {clip.label} ({clip.startTime.toFixed(1)}s-{clip.endTime.toFixed(1)}s)
                        </span>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleToggleSplitClipLipSync(clip.id);
                            }}
                            title="এই অংশে Lip-Sync অন/অফ করুন"
                            className={`px-1.5 py-0.5 rounded text-[8px] font-bold cursor-pointer ${
                              clip.lipSyncEnabled
                                ? 'bg-[#00C8E0] text-zinc-950'
                                : 'bg-zinc-800 text-zinc-400'
                            }`}
                          >
                            {clip.lipSyncEnabled ? '👄 ON' : 'DROP'}
                          </button>

                          {splitClips.length > 1 && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDeleteSplitClip(clip.id);
                              }}
                              title="এই স্প্লিট অংশটি ডিলিট করুন"
                              className="p-0.5 rounded bg-rose-600/80 hover:bg-rose-500 text-white cursor-pointer"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <label
                onClick={(e) => e.stopPropagation()}
                title="নতুন ক্যারেক্টার বা ভিডিও যোগ করুন"
                className="sticky right-1.5 ml-auto w-7 h-7 rounded-md bg-white hover:bg-zinc-100 text-zinc-950 shadow flex items-center justify-center z-20 cursor-pointer shrink-0 mr-1"
              >
                <Plus className="w-4 h-4 stroke-[2.2]" />
                <input
                  type="file"
                  accept="image/*,video/*,audio/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,.mov,.mkv,.zip"
                  onClick={(e) => {
                    e.currentTarget.value = '';
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) handleUploadMediaFile(f);
                  }}
                  className="hidden"
                />
              </label>
            </div>

            {/* TRACK 3: INDEPENDENT AUDIO WAVEFORM LAYER TRACK */}
            <div className="relative h-8 rounded-lg bg-[#102A30] border border-[#00C8E0]/35 px-1.5 flex items-center justify-between gap-[1px] overflow-hidden">
              <span className="absolute left-2 z-10 text-[10px] font-semibold text-white drop-shadow pointer-events-none">
                🎵 {mediaSourceTitle}
              </span>

              {frames.map((fr) => {
                const hPct = fr.isDropped
                  ? 10
                  : Math.max(22, Math.min(96, ((fr.db + 60) / 60) * 100));
                return (
                  <div
                    key={fr.frame}
                    style={{ height: `${hPct}%` }}
                    className={`flex-1 rounded-full ${
                      fr.isDropped
                        ? 'bg-[#00C8E0]/20'
                        : fr.frame <= currentFrameIndex
                        ? 'bg-[#00E1FA]'
                        : 'bg-[#00B4CC]'
                    }`}
                  />
                );
              })}

              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  handleSelectStudioSoundPreset('bangla-dialogue', 'Extracted audio1');
                  showNotice('🗑️ ইমপোর্ট করা অডিও ডিলিট করে ডিফল্ট ভয়েস রিসেট করা হয়েছে');
                }}
                title="ইমপোর্ট করা অডিও ডিলিট / রিসেট করুন"
                className="sticky right-1 ml-auto px-1.5 py-0.5 rounded bg-rose-600/85 hover:bg-rose-500 text-white text-[8px] font-bold flex items-center gap-0.5 z-20 cursor-pointer shrink-0"
              >
                <Trash2 className="w-2.5 h-2.5" />
                <span>রিসেট</span>
              </button>
            </div>

            {/* TRACK 4: INDEPENDENT CUSTOMIZABLE LIFTING LAYER TRACK */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                if (!config.layers.liftingLayer || config.maxLiftPx === 0) {
                  setConfig((prev) => ({
                    ...prev,
                    maxLiftPx: prev.maxLiftPx > 0 ? prev.maxLiftPx : 18,
                    layers: {
                      ...prev.layers,
                      liftingLayer: true,
                    },
                  }));
                  showNotice('✓ লিফটিং লেয়ার ক্রিয়েট হয়েছে! এখন নিজের মতো কাস্টমাইজ করুন।');
                }
                setActiveBottomTab('lifting');
              }}
              className={`relative h-7 rounded-lg px-1.5 flex items-center justify-between gap-[1px] overflow-hidden cursor-pointer transition-colors ${
                config.layers.liftingLayer && config.maxLiftPx > 0
                  ? 'bg-[#261436] border border-purple-400/50 hover:bg-[#2F1942]'
                  : 'bg-[#1A1B20] hover:bg-[#23252E] border border-dashed border-purple-500/40'
              }`}
            >
              {config.layers.liftingLayer && config.maxLiftPx > 0 ? (
                <>
                  <span className="absolute left-2 z-10 text-[9px] font-bold text-purple-200 drop-shadow pointer-events-none flex items-center gap-1">
                    <ArrowUpFromLine className="w-2.5 h-2.5 text-purple-300" />
                    <span>Lifting Layer · +{config.maxLiftPx}px</span>
                  </span>

                  {frames.map((fr) => {
                    const keyVal = config.perKeyLiftPx?.[fr.viseme] ?? 0;
                    const liftRatio = fr.isDropped
                      ? 0.08
                      : Math.max(
                          0.16,
                          Math.min(0.95, (keyVal / 35) * (config.maxLiftPx / 28))
                        );
                    return (
                      <div
                        key={fr.frame}
                        style={{ height: `${Math.round(liftRatio * 100)}%` }}
                        className={`flex-1 rounded-full ${
                          fr.isDropped
                            ? 'bg-purple-500/15'
                            : fr.frame <= currentFrameIndex
                            ? 'bg-purple-400'
                            : 'bg-purple-500/60'
                        }`}
                      />
                    );
                  })}
                </>
              ) : (
                <span className="text-[10px] text-purple-300 font-semibold pl-1">
                  + লিফটিং লেয়ার ক্রিয়েট করুন (Create Customizable Lifting Layer)
                </span>
              )}
            </div>

            {/* TRACK 4B: PROCEDURAL ANIMATION LAYER TRACK (Hair, Leaves & Speech Head Tilt) */}
            <div
              onClick={() => setActiveBottomTab('procedural')}
              className={`relative h-7 rounded-lg px-2 flex items-center justify-between overflow-hidden cursor-pointer transition-colors ${
                config.proceduralAnimation?.enabled !== false &&
                config.layers.proceduralLayer !== false
                  ? 'bg-[#0F292A] border border-teal-400/50 hover:bg-[#133536]'
                  : 'bg-[#181920] hover:bg-[#20222B] border border-dashed border-teal-500/35'
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] text-teal-200 z-10">
                <Wind className="w-3 h-3 text-teal-300 shrink-0" />
                <span className="font-semibold truncate">
                  🍃 Procedural Motion · Hair Flow (
                  {config.proceduralAnimation?.hairMovementIntensity ?? 65}%) ·
                  Leaves ({config.proceduralAnimation?.leavesCount ?? 12}) ·
                  Speech Head Tilt (
                  {config.proceduralAnimation?.headTiltWithSpeech !== false
                    ? `${config.proceduralAnimation?.headTiltIntensity ?? 68}%`
                    : 'OFF'}
                  )
                </span>
              </div>
              <span className="px-1.5 py-0.5 rounded bg-teal-500/20 text-[9px] text-teal-200 font-bold z-10">
                Customize Physics
              </span>
            </div>

            {/* TRACK 5: INDEPENDENT BACKGROUND LAYER TRACK */}
            <div
              onClick={() => setSelectedCanvasLayer('background')}
              className={`relative h-7 rounded-lg px-2 flex items-center justify-between overflow-hidden cursor-pointer transition-colors ${
                selectedCanvasLayer === 'background'
                  ? 'bg-indigo-950/60 border border-indigo-400 ring-1 ring-indigo-400/40'
                  : 'bg-[#181920] hover:bg-[#20222B] border border-zinc-800'
              }`}
            >
              <div className="flex items-center gap-2 text-[10px] text-zinc-200">
                <span
                  style={{
                    backgroundColor:
                      config.background.mode === 'green-screen'
                        ? '#00FF00'
                        : config.background.color1,
                  }}
                  className="w-3 h-3 rounded-sm border border-white/40 shrink-0"
                />
                <span className="font-semibold truncate">
                  🖼️ Background Layer ·{' '}
                  {customSprites.customBackground
                    ? 'Custom Image'
                    : config.background.mode.toUpperCase()}{' '}
                  (Pos {config.background.offsetX || 0},{' '}
                  {config.background.offsetY || 0} · Scale{' '}
                  {Math.round((config.background.scale || 1) * 100)}%)
                </span>
              </div>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setActiveBottomTab('background');
                }}
                className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-[9px] text-indigo-300 font-semibold cursor-pointer"
              >
                Edit BG
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* =====================================================================
          6. SLIDE-UP DRAWER FOR THE 6 BOTTOM TABS:
             Character · Mouth Track · Audio · Background · Layers · Captions
         ===================================================================== */}
      {activeBottomTab && (
        <div className="bg-[#16171C] border-t border-zinc-800 px-4 py-3 max-h-64 overflow-y-auto shrink-0 z-30">
          <div className="max-w-3xl mx-auto space-y-3">
            <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
              <span className="text-xs font-bold text-[#00C8E0]">
                {activeBottomTab === 'character' &&
                  'Character Upload — যেকোনো ফরম্যাটে নিজের ক্যারেক্টার (ছবি, GIF, SVG বা ভিডিও) আপলোড করুন'}
                {activeBottomTab === 'mouth-track' &&
                  'Mouth & Auto-Track — ১২টি কথা বলার মুখ এবং নড়াচড়া করা ক্যারেক্টারের মুখে অটো-ট্র্যাকিং'}
                {activeBottomTab === 'audio' &&
                  'Audio & Record — ভিডিও থেকে অডিও এক্সট্র্যাক্ট, মাইক্রোফোন ভয়েস রেকর্ড ও ডাউনলোড'}
                {activeBottomTab === 'lifting' &&
                  'Lifting Layer — নতুন লিফটিং লেয়ার ক্রিয়েট করুন এবং কথার সাথে বাউন্স/লিফটিং নিজের মতো কাস্টমাইজ করুন'}
                {activeBottomTab === 'procedural' &&
                  'Procedural Motion & Physics — কথার সাথে মাথার হালকা টিল্ট এবং চুল ও গাছের পাতার নিরবচ্ছিন্ন সাইন-ওয়েভ অ্যানিমেশন'}
                {activeBottomTab === 'background' &&
                  'Background — ব্যাকগ্রাউন্ড কালার, গ্রিন স্ক্রিন, কাস্টম ছবি ও ক্যারেক্টার ব্যাকগ্রাউন্ড রিমুভ'}
                {activeBottomTab === 'layers' &&
                  'Layers — মাউথ লেয়ার, ক্যারেক্টার লেয়ার ও ব্যাকগ্রাউন্ড লেয়ার নিয়ন্ত্রণ'}
                {activeBottomTab === 'captions' &&
                  'Auto-Listing & Code — ফ্রেম অনুযায়ী মাউথ কিউ পরিবর্তন ও ZIP এক্সপোর্ট'}
              </span>
              <button
                type="button"
                onClick={() => setActiveBottomTab(null)}
                className="text-zinc-400 hover:text-white text-xs font-bold cursor-pointer"
              >
                ✕ বন্ধ করুন
              </button>
            </div>

            {/* TAB 1: CHARACTER (Upload ANY format Image or Video Character!) */}
            {activeBottomTab === 'character' && (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2.5">
                  <label className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 font-bold cursor-pointer shadow-md">
                    <Upload className="w-4 h-4" />
                    <span>+ নিজের ক্যারেক্টার আপলোড করুন (ছবি / GIF / ভিডিও — সব ফরম্যাট)</span>
                    <input
                      type="file"
                      accept="image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif,.mp4,.webm,.mov,.mkv"
                      onClick={(e) => {
                        e.currentTarget.value = '';
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUniversalCharacterUpload(f);
                      }}
                      className="hidden"
                    />
                  </label>

                  {(
                    [
                      ...(customSprites.customCharacter
                        ? [{ id: 'custom-character', label: 'নিজের ছবি ক্যারেক্টার' }]
                        : []),
                      { id: 'mouth-only-overlay', label: 'শুধু মুখ (ভিডিও ক্যারেক্টারের ওপর)' },
                      { id: 'arjun-2d', label: 'অর্জুন' },
                      { id: 'mina-toon', label: 'মিনা' },
                      { id: 'robobot-rig', label: 'রোবো' },
                    ] as Array<{ id: EngineConfig['characterPreset']; label: string }>
                  ).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({ ...prev, characterPreset: ch.id }))
                      }
                      className={`px-3 py-2 rounded-xl font-semibold cursor-pointer ${
                        config.characterPreset === ch.id
                          ? 'bg-white text-zinc-950'
                          : 'bg-[#1F2026] text-zinc-300 border border-zinc-800'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}

                  {(customSprites.customCharacter || hasUploadedVideo) && (
                    <button
                      type="button"
                      onClick={handleDeleteImportedMainCharacter}
                      className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>ইমপোর্ট করা ক্যারেক্টার / ভিডিও ডিলিট করুন</span>
                    </button>
                  )}
                </div>

                {/* Imported Overlays List & Delete Manager */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-zinc-200 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-400" />
                      <span>ইমপোর্ট করা ওভারলে এলিমেন্ট ({characterOverlays.length})</span>
                    </span>
                    <div className="flex items-center gap-1.5">
                      {characterOverlays.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCharacterOverlays([]);
                            setSelectedOverlayId(null);
                            setSelectedCanvasLayer('character');
                            showNotice('🗑️ সব ইমপোর্ট করা ওভারলে ডিলিট করা হয়েছে');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                          <span>সব ওভারলে ডিলিট</span>
                        </button>
                      )}
                      <label className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-zinc-950 text-[11px] font-bold cursor-pointer">
                        + নতুন ওভারলে যোগ করুন
                        <input
                          type="file"
                          accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg"
                          onClick={(e) => {
                            e.currentTarget.value = '';
                          }}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) handleAddCharacterOverlay(f);
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  {characterOverlays.length > 0 && (
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {characterOverlays.map((ov) => (
                        <div
                          key={ov.id}
                          onClick={() => {
                            setSelectedCanvasLayer('overlay');
                            setSelectedOverlayId(ov.id);
                          }}
                          className={`px-2.5 py-1.5 rounded-lg border flex items-center gap-2 cursor-pointer ${
                            selectedCanvasLayer === 'overlay' && selectedOverlayId === ov.id
                              ? 'bg-amber-500/20 border-amber-400 text-white'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-200'
                          }`}
                        >
                          <img
                            src={ov.imageUrl}
                            alt={ov.name}
                            className="w-6 h-6 rounded object-cover"
                          />
                          <span className="max-w-[90px] truncate font-medium">{ov.name}</span>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleDeleteCharacterOverlay(ov.id);
                            }}
                            title="এই ওভারলে ডিলিট করুন"
                            className="px-2 py-0.5 rounded bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3 h-3" />
                            <span>ডিলিট</span>
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 flex items-center justify-between gap-3">
                    <span className="text-zinc-300">ডিসপ্লে টাচ মোড:</span>
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          stageDragMode:
                            prev.stageDragMode === 'mouth-pin'
                              ? 'character-move'
                              : 'mouth-pin',
                        }))
                      }
                      className="px-3 py-1 rounded-lg bg-[#00C8E0] text-zinc-950 font-bold cursor-pointer"
                    >
                      {config.stageDragMode === 'mouth-pin'
                        ? '🎯 মুখে মাউথ সেট ও ট্র্যাক মোড'
                        : '✋ ক্যারেক্টার সরানোর মোড'}
                    </button>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 flex items-center gap-3">
                    <span className="text-zinc-300 shrink-0">ক্যারেক্টার সাইজ:</span>
                    <input
                      type="range"
                      min={0.35}
                      max={2.2}
                      step={0.05}
                      value={config.characterTransform.scale}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          characterTransform: {
                            ...prev.characterTransform,
                            scale: Number(e.target.value),
                          },
                        }))
                      }
                      className="flex-1 accent-[#00C8E0] cursor-pointer"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* TAB 2: MOUTH BOARD, INDEPENDENT LIP SEGMENTS & AUTO MOTION TRACKING */}
            {activeBottomTab === 'mouth-track' && (
              <div className="space-y-3 text-xs">
                {/* Independent Mouth Tracking & Lip Segment Repositioning Panel (Relocated to Bottom Section!) */}
                <div className="p-3 rounded-xl bg-[#1F2026] border border-[#00C8E0]/40 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Crosshair className="w-4 h-4 text-[#00C8E0]" />
                      <div>
                        <div className="font-bold text-white">
                          Independent Mouth Tracking & Lip Segments (আলাদা পজিশন ও ট্র্যাকার)
                        </div>
                        <div className="text-[11px] text-zinc-400">
                          মাউথ ট্র্যাকিং পয়েন্ট এবং লিপ সেগমেন্ট (Lip Segments) ক্যারেক্টারের যেকোনো জায়গায় আলাদাভাবে সেট ও মুভ করুন
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setSelectedCanvasLayer('mouth')}
                        className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer ${
                          selectedCanvasLayer === 'mouth'
                            ? 'bg-[#00C8E0] text-zinc-950'
                            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        👄 Move Mouth ({config.mouthAnchor.offsetX}, {config.mouthAnchor.offsetY})
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedCanvasLayer('lip-segment')}
                        className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer ${
                          selectedCanvasLayer === 'lip-segment'
                            ? 'bg-pink-500 text-white'
                            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        🫦 Move Lip Segment ({config.mouthAnchor.lipSegmentOffsetX || 0},{' '}
                        {config.mouthAnchor.lipSegmentOffsetY || 0})
                      </button>

                      <button
                        type="button"
                        onClick={() => setSelectedCanvasLayer('tracker')}
                        className={`px-2.5 py-1.5 rounded-lg font-bold cursor-pointer ${
                          selectedCanvasLayer === 'tracker'
                            ? 'bg-emerald-500 text-zinc-950'
                            : 'bg-zinc-800 text-zinc-200 hover:bg-zinc-700'
                        }`}
                      >
                        🎯 Move Track Sensor ({config.mouthTracker.trackAnchorX ?? 0},{' '}
                        {config.mouthTracker.trackAnchorY ?? 0})
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          const trackSource =
                            hasUploadedVideo && videoRef.current
                              ? videoRef.current
                              : loadedSpriteImagesRef.current.customCharacter || null;
                          captureMouthTrackingTemplate(trackSource, config);
                          setConfig((prev) => ({
                            ...prev,
                            mouthTracker: {
                              ...prev.mouthTracker,
                              enabled: true,
                              showTrackBox: false,
                            },
                          }));
                          showNotice(
                            '✓ মাউথ ট্র্যাকার পয়েন্ট লক করা হয়েছে! ক্যারেক্টার নড়লে লিপ সেগমেন্ট স্বয়ংক্রিয়ভাবে ফলো করবে।'
                          );
                        }}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-zinc-950 font-bold cursor-pointer"
                      >
                        🔒 Lock Track Point
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            mouthTracker: {
                              ...prev.mouthTracker,
                              enabled: !prev.mouthTracker.enabled,
                            },
                          }))
                        }
                        className={`px-2.5 py-1.5 rounded-lg font-bold border cursor-pointer ${
                          config.mouthTracker.enabled
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                        }`}
                      >
                        {config.mouthTracker.enabled ? 'Auto-Track: ON' : 'Auto-Track: OFF'}
                      </button>
                    </div>
                  </div>

                  {/* Independent Sliders for Lip Segment Offset vs Tracker Sensor Offset */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1 border-t border-zinc-800/80">
                    <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-[#00C8E0]">
                          👄 Mouth & Lip Segment Position (যেকোনো জায়গায়)
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdateMouthAnchor({
                              offsetX: 0,
                              offsetY: 0,
                              lipSegmentOffsetX: 0,
                              lipSegmentOffsetY: 0,
                              rotationDeg: 0,
                            })
                          }
                          className="text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                        >
                          রিসেট
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 w-10">X পজিশন:</span>
                        <input
                          type="range"
                          min={-600}
                          max={600}
                          value={config.mouthAnchor.offsetX}
                          onChange={(e) =>
                            handleUpdateMouthAnchor({ offsetX: Number(e.target.value) })
                          }
                          className="flex-1 accent-[#00C8E0] cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-400 w-10">Y পজিশন:</span>
                        <input
                          type="range"
                          min={-600}
                          max={600}
                          value={config.mouthAnchor.offsetY}
                          onChange={(e) =>
                            handleUpdateMouthAnchor({ offsetY: Number(e.target.value) })
                          }
                          className="flex-1 accent-[#00C8E0] cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-pink-300 w-10">Lip X:</span>
                        <input
                          type="range"
                          min={-400}
                          max={400}
                          value={config.mouthAnchor.lipSegmentOffsetX || 0}
                          onChange={(e) =>
                            handleUpdateMouthAnchor({
                              lipSegmentOffsetX: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-pink-500 cursor-pointer"
                        />
                        <span className="text-[10px] text-pink-300 w-10">Lip Y:</span>
                        <input
                          type="range"
                          min={-400}
                          max={400}
                          value={config.mouthAnchor.lipSegmentOffsetY || 0}
                          onChange={(e) =>
                            handleUpdateMouthAnchor({
                              lipSegmentOffsetY: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-pink-500 cursor-pointer"
                        />
                      </div>
                    </div>

                    <div className="p-2 rounded-lg bg-zinc-900/80 border border-zinc-800 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px]">
                        <span className="font-bold text-emerald-400">
                          🎯 Independent Mouth Tracker Sensor
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              mouthTracker: {
                                ...prev.mouthTracker,
                                trackAnchorX: 0,
                                trackAnchorY: 0,
                              },
                            }))
                          }
                          className="text-[10px] text-zinc-400 hover:text-white cursor-pointer"
                        >
                          রিসেট
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 w-12">Track X:</span>
                        <input
                          type="range"
                          min={-600}
                          max={600}
                          value={config.mouthTracker.trackAnchorX ?? config.mouthAnchor.offsetX}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              mouthTracker: {
                                ...prev.mouthTracker,
                                trackAnchorX: Number(e.target.value),
                              },
                            }))
                          }
                          className="flex-1 accent-emerald-400 cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-400 w-12">Track Y:</span>
                        <input
                          type="range"
                          min={-600}
                          max={600}
                          value={config.mouthTracker.trackAnchorY ?? config.mouthAnchor.offsetY}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              mouthTracker: {
                                ...prev.mouthTracker,
                                trackAnchorY: Number(e.target.value),
                              },
                            }))
                          }
                          className="flex-1 accent-emerald-400 cursor-pointer"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-zinc-400 w-12">মুখ রোটেট:</span>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          value={config.mouthAnchor.rotationDeg}
                          onChange={(e) =>
                            handleUpdateMouthAnchor({
                              rotationDeg: Number(e.target.value),
                            })
                          }
                          className="flex-1 accent-[#00C8E0] cursor-pointer"
                        />
                        <span className="text-[10px] text-zinc-400 w-12">লিফটিং:</span>
                        <input
                          type="range"
                          min={0}
                          max={45}
                          value={config.maxLiftPx}
                          onChange={(e) =>
                            setConfig((prev) => ({
                              ...prev,
                              maxLiftPx: Number(e.target.value),
                            }))
                          }
                          className="flex-1 accent-[#00C8E0] cursor-pointer"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Mouth Size, Chart Style & Sheet Slicer */}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    {(
                      [
                        { id: 'studio-12', label: '12-Chart' },
                        { id: 'cartoon-34', label: '3/4 Side' },
                        { id: 'manga-bw', label: 'Manga B&W' },
                      ] as const
                    ).map((st) => (
                      <button
                        key={st.id}
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({ ...prev, mouthChartStyle: st.id }))
                        }
                        className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                          config.mouthChartStyle === st.id
                            ? 'bg-[#00C8E0] text-zinc-950'
                            : 'bg-[#1F2026] text-zinc-300'
                        }`}
                      >
                        {st.label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">মুখের সাইজ:</span>
                    <input
                      type="range"
                      min={0.35}
                      max={2.4}
                      step={0.05}
                      value={config.mouthAnchor.scale}
                      onChange={(e) =>
                        handleUpdateMouthAnchor({ scale: Number(e.target.value) })
                      }
                      className="w-24 accent-[#00C8E0] cursor-pointer"
                    />
                  </div>

                  <label className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-[#1F2026] hover:bg-zinc-800 text-[#00C8E0] border border-zinc-700 cursor-pointer">
                    <Scissors className="w-3.5 h-3.5" />
                    <span>মাউথ শিট স্লাইস</span>
                    <input
                      type="file"
                      accept="image/*"
                      onClick={(e) => {
                        e.currentTarget.value = '';
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadChartSheetToSlice(f, 4, 3);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* 12 Phoneme Mouths Grid with individual & bulk Delete options */}
                {MOUTH_CHART_12_ORDER.some((c) => Boolean(customSprites[c])) && (
                  <div className="flex items-center justify-between p-2 rounded-xl bg-rose-950/30 border border-rose-500/40">
                    <span className="text-[11px] text-rose-200 font-semibold">
                      ইমপোর্ট করা কাস্টম মাউথ স্প্রাইট অ্যাক্টিভ আছে
                    </span>
                    <button
                      type="button"
                      onClick={handleDeleteAllCustomMouthSprites}
                      className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>সব কাস্টম মাউথ ডিলিট</span>
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {MOUTH_CHART_12_ORDER.map((code) => {
                    const meta = VISEME_LIBRARY[code];
                    const isActive = currentFrame?.viseme === code;
                    const hasCustomMouth = Boolean(customSprites[code]);
                    return (
                      <div
                        key={code}
                        className={`relative p-2 rounded-xl border flex flex-col items-center gap-1 ${
                          isActive
                            ? 'bg-[#00C8E0]/20 border-[#00C8E0]'
                            : hasCustomMouth
                            ? 'bg-emerald-950/25 border-emerald-500/50'
                            : 'bg-[#1F2026] border-zinc-800'
                        }`}
                      >
                        {hasCustomMouth && (
                          <button
                            type="button"
                            onClick={() => handleDeleteCustomMouthSprite(code)}
                            title={`${meta.shortCode} ইমপোর্ট করা মুখ ডিলিট করুন`}
                            className="absolute top-1 right-1 p-1 rounded-full bg-rose-600 hover:bg-rose-500 text-white shadow cursor-pointer z-10"
                          >
                            <Trash2 className="w-2.5 h-2.5" />
                          </button>
                        )}
                        <MouthKeyThumb
                          viseme={code}
                          config={config}
                          loadedSprites={loadedSpritesState}
                          customUrl={customSprites[code]}
                        />
                        <div className="flex items-center justify-between w-full px-0.5">
                          <span className="font-mono text-[10px] font-bold text-white">
                            {meta.shortCode}
                          </span>
                          <label className="px-1.5 py-0.5 rounded bg-zinc-800 hover:bg-[#00C8E0] hover:text-zinc-950 text-[9px] font-semibold text-zinc-300 cursor-pointer">
                            <span>মুখ দিন</span>
                            <input
                              type="file"
                              accept="image/*"
                              onClick={(e) => {
                                e.currentTarget.value = '';
                              }}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) {
                                  setCustomSprites((prev) => ({
                                    ...prev,
                                    [code]: URL.createObjectURL(f),
                                  }));
                                }
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB 3: AUDIO & RECORD */}
            {activeBottomTab === 'audio' && (
              <div className="flex flex-wrap items-center gap-2.5 text-xs">
                <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00C8E0] text-zinc-950 font-bold cursor-pointer">
                  <Upload className="w-4 h-4" />
                  <span>ভিডিও / অডিও আপলোড (Extract Audio)</span>
                  <input
                    type="file"
                    accept="video/*,audio/*,.mp4,.webm,.mov,.mp3,.wav,.m4a,.ogg"
                    onClick={(e) => {
                      e.currentTarget.value = '';
                    }}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleUploadMediaFile(f);
                    }}
                    className="hidden"
                  />
                </label>

                <button
                  type="button"
                  onClick={handleToggleMicRecording}
                  className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl font-bold cursor-pointer ${
                    isRecordingMic
                      ? 'bg-rose-600 text-white animate-pulse'
                      : 'bg-[#1F2026] text-white border border-zinc-700'
                  }`}
                >
                  {isRecordingMic ? (
                    <>
                      <Square className="w-4 h-4" />
                      <span>Stop Record</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-rose-400" />
                      <span>মাইক্রোফোনে ভয়েস রেকর্ড</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleSelectStudioSoundPreset('bangla-dialogue', 'Extracted audio1')
                  }
                  className="px-3 py-2 rounded-xl bg-[#1F2026] hover:bg-zinc-800 text-zinc-200 border border-zinc-800 cursor-pointer"
                >
                  ♪ ডায়ালগ ভয়েস
                </button>

                <button
                  type="button"
                  onClick={() =>
                    handleTriggerSoundFx('happy-laugh', 'Cartoon Laugh')
                  }
                  className="px-3 py-2 rounded-xl bg-[#1F2026] hover:bg-zinc-800 text-zinc-200 border border-zinc-800 cursor-pointer"
                >
                  😄 হাসির সাউন্ড
                </button>

                <button
                  type="button"
                  onClick={handleDownloadExtractedAudioWav}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1F2026] hover:bg-zinc-800 text-[#00C8E0] border border-zinc-800 cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>অডিও ডাউনলোড (.WAV)</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleSelectStudioSoundPreset('bangla-dialogue', 'Extracted audio1');
                    showNotice('🗑️ ইমপোর্ট করা অডিও ডিলিট করে ডিফল্ট ভয়েস রিসেট করা হয়েছে');
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ইমপোর্ট অডিও ডিলিট / রিসেট</span>
                </button>
              </div>
            )}

            {/* TAB 3B: CUSTOMIZABLE LIFTING LAYER SECTION ("লিফটিং এর একটা লেয়ার ক্রিয়েট হবে কাস্টমাইজ করা যাবে এমন") */}
            {activeBottomTab === 'lifting' && (
              <div className="space-y-3 text-xs">
                {/* Top Bar: Create / Enable / Delete Lifting Layer */}
                <div className="p-3 rounded-xl bg-[#1F2026] border border-purple-500/40 flex flex-wrap items-center justify-between gap-2.5">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/20 text-purple-300 border border-purple-500/40">
                      <ArrowUpFromLine className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-bold text-white">
                        {config.layers.liftingLayer && config.maxLiftPx > 0
                          ? `✓ লিফটিং লেয়ার অ্যাক্টিভ (+${config.maxLiftPx}px)`
                          : 'লিফটিং লেয়ার (Customizable Lifting Layer)'}
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        অডিও ও কথার সাথে মুখ বা ক্যারেক্টার কতটুকু ওঠানামা (Lift / Bounce) করবে তা এই লেয়ারে কাস্টমাইজ করুন
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {!config.layers.liftingLayer || config.maxLiftPx === 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setConfig((prev) => ({
                            ...prev,
                            maxLiftPx: 18,
                            layers: {
                              ...prev.layers,
                              liftingLayer: true,
                            },
                          }));
                          showNotice('✓ নতুন লিফটিং লেয়ার ক্রিয়েট করা হয়েছে!');
                        }}
                        className="px-3.5 py-2 rounded-xl bg-purple-500 hover:bg-purple-400 text-zinc-950 font-bold flex items-center gap-1.5 cursor-pointer shadow-md"
                      >
                        <Plus className="w-4 h-4" />
                        <span>+ লিফটিং লেয়ার ক্রিয়েট করুন</span>
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              layers: {
                                ...prev.layers,
                                liftingLayer: !prev.layers.liftingLayer,
                              },
                            }))
                          }
                          className={`px-3 py-1.5 rounded-xl font-bold border cursor-pointer ${
                            config.layers.liftingLayer
                              ? 'bg-purple-500/20 border-purple-400 text-purple-200'
                              : 'bg-zinc-900 border-zinc-700 text-zinc-400'
                          }`}
                        >
                          {config.layers.liftingLayer ? 'Layer: ON' : 'Layer: OFF'}
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setConfig((prev) => ({
                              ...prev,
                              maxLiftPx: 0,
                              squashIntensity: 0,
                              layers: {
                                ...prev.layers,
                                liftingLayer: false,
                              },
                            }));
                            showNotice('🗑️ লিফটিং লেয়ার ডিলিট করা হয়েছে');
                          }}
                          className="px-3 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>লেয়ার ডিলিট</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Customize Lifting Target Mode + 1-Click Presets */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                    <div className="text-[11px] font-bold text-purple-300">
                      ১. কী লিফট করবে কাস্টমাইজ করুন (Lifting Target):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: 'mouth-only', label: '👄 শুধু মুখ ও ঠোঁট (ক্যারেক্টার স্থির)' },
                          { id: 'character-and-mouth', label: '🧍+👄 মুখ ও ক্যারেক্টার উভয়ই' },
                          { id: 'character-only', label: '🧍 শুধু ক্যারেক্টার বডি' },
                        ] as const
                      ).map((t) => (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              liftingTarget: t.id,
                              maxLiftPx: prev.maxLiftPx > 0 ? prev.maxLiftPx : 18,
                              layers: { ...prev.layers, liftingLayer: true },
                            }))
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            (config.liftingTarget || 'character-and-mouth') === t.id
                              ? 'bg-purple-500 text-zinc-950 font-bold'
                              : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:text-white'
                          }`}
                        >
                          {t.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                    <div className="text-[11px] font-bold text-purple-300">
                      ২. রেডিমেড লিফটিং প্রিসেট (Quick Presets):
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { label: 'স্থির (0px)', lift: 0, squash: 0, on: false },
                        { label: 'হালকা কথা (12px)', lift: 12, squash: 0.04, on: true },
                        { label: 'কার্টুন বাউন্স (22px)', lift: 22, squash: 0.1, on: true },
                        { label: 'হাই এনার্জি (35px)', lift: 35, squash: 0.16, on: true },
                      ].map((pr) => (
                        <button
                          key={pr.label}
                          type="button"
                          onClick={() =>
                            setConfig((prev) => ({
                              ...prev,
                              maxLiftPx: pr.lift,
                              squashIntensity: pr.squash,
                              layers: {
                                ...prev.layers,
                                liftingLayer: pr.on,
                              },
                            }))
                          }
                          className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold cursor-pointer ${
                            config.maxLiftPx === pr.lift &&
                            Boolean(config.layers.liftingLayer) === pr.on
                              ? 'bg-[#00C8E0] text-zinc-950 font-bold'
                              : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:text-white'
                          }`}
                        >
                          {pr.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Master Lifting Power, Squash & Smoothness Sliders */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300 font-semibold">মাস্টার লিফটিং পাওয়ার:</span>
                      <span className="font-mono font-bold text-purple-300">
                        +{config.maxLiftPx}px
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={45}
                      step={1}
                      value={config.maxLiftPx}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        setConfig((prev) => ({
                          ...prev,
                          maxLiftPx: val,
                          layers: {
                            ...prev.layers,
                            liftingLayer: val > 0,
                          },
                        }));
                      }}
                      className="w-full accent-purple-400 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300 font-semibold">স্কোয়াশ ও স্ট্রেচ বাউন্স:</span>
                      <span className="font-mono font-bold text-purple-300">
                        {Math.round(config.squashIntensity * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={0.25}
                      step={0.01}
                      value={config.squashIntensity}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          squashIntensity: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-purple-400 cursor-pointer"
                    />
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-zinc-300 font-semibold">স্মুথনেস (Hold Frames):</span>
                      <span className="font-mono font-bold text-purple-300">
                        {config.holdSmoothingFrames}f
                      </span>
                    </div>
                    <input
                      type="range"
                      min={1}
                      max={6}
                      step={1}
                      value={config.holdSmoothingFrames}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          holdSmoothingFrames: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-purple-400 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 12-Mouth Per-Key Custom Lifting Sliders */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-zinc-200">
                      ৩. ১২টি মুখের আলাদা আলাদা লিফটিং কাস্টমাইজ (Per-Mouth Lifting px):
                    </span>
                    <button
                      type="button"
                      onClick={handleResetPerKeyLift}
                      className="px-2 py-0.5 rounded bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] cursor-pointer"
                    >
                      ডিফল্ট রিসেট
                    </button>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {MOUTH_CHART_12_ORDER.map((code) => {
                      const liftVal = config.perKeyLiftPx?.[code] ?? 0;
                      const isCurr = currentFrame?.viseme === code;
                      return (
                        <div
                          key={code}
                          className={`p-2 rounded-lg border flex flex-col gap-1 ${
                            isCurr
                              ? 'bg-purple-500/20 border-purple-400'
                              : 'bg-zinc-900/90 border-zinc-800'
                          }`}
                        >
                          <div className="flex items-center justify-between text-[10px]">
                            <span className="font-mono font-bold text-white">{code}</span>
                            <span className="font-mono text-purple-300">+{liftVal}px</span>
                          </div>
                          <input
                            type="range"
                            min={0}
                            max={45}
                            step={1}
                            value={liftVal}
                            onChange={(e) =>
                              handleUpdatePerKeyLift(code, Number(e.target.value))
                            }
                            className="w-full accent-purple-400 cursor-pointer"
                          />
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: BACKGROUND CHANGE & CHROMA CUTOUT ("ব্যাকগ্রাউন্ড চেঞ্জ করার অপশন থাকবে নিচে") */}
            {activeBottomTab === 'background' && (
              <div className="space-y-3 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  {/* Upload Custom Background Image */}
                  <label className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#00C8E0] text-zinc-950 font-bold cursor-pointer">
                    <ImageIcon className="w-4 h-4" />
                    <span>+ নিজের ব্যাকগ্রাউন্ড ছবি দিন</span>
                    <input
                      type="file"
                      accept="image/*"
                      onClick={(e) => {
                        e.currentTarget.value = '';
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handleUploadCustomBackground(f);
                      }}
                      className="hidden"
                    />
                  </label>

                  {customSprites.customBackground && (
                    <button
                      type="button"
                      onClick={handleDeleteCustomBackgroundImage}
                      className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold cursor-pointer"
                    >
                      <Trash2 className="w-4 h-4" />
                      <span>ব্যাকগ্রাউন্ড ছবি ডিলিট করুন</span>
                    </button>
                  )}

                  {/* Studio Background Presets */}
                  {STUDIO_BG_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          background: {
                            ...prev.background,
                            mode: preset.mode,
                            color1: preset.c1,
                            color2: preset.c2,
                          },
                        }))
                      }
                      className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1F2026] hover:bg-zinc-800 border border-zinc-700 text-zinc-200 cursor-pointer"
                    >
                      <span
                        style={{ backgroundColor: preset.c1 }}
                        className="w-3.5 h-3.5 rounded-full border border-white/40"
                      />
                      <span>{preset.label}</span>
                    </button>
                  ))}

                  {/* Custom Solid Color Picker */}
                  <label className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-[#1F2026] border border-zinc-700 cursor-pointer">
                    <span className="text-zinc-300">কালার:</span>
                    <input
                      type="color"
                      value={config.background.color1}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          background: {
                            ...prev.background,
                            mode: 'solid',
                            color1: e.target.value,
                          },
                        }))
                      }
                      className="w-6 h-5 rounded cursor-pointer"
                    />
                  </label>
                </div>

                {/* Remove Character Solid/White/Green Background (Chroma Cutout) */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 flex flex-wrap items-center justify-between gap-3">
                  <label className="flex items-center gap-2 font-semibold text-zinc-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={config.background.removeCharacterBg}
                      onChange={(e) =>
                        setConfig((prev) => ({
                          ...prev,
                          background: {
                            ...prev.background,
                            removeCharacterBg: e.target.checked,
                          },
                        }))
                      }
                      className="accent-[#00C8E0] w-4 h-4"
                    />
                    <span>
                      ক্যারেক্টারের নিজস্ব ব্যাকগ্রাউন্ড রিমুভ করুন (Chroma Key Cutout)
                    </span>
                  </label>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5">
                      <span className="text-zinc-400">রিমুভ কালার:</span>
                      <input
                        type="color"
                        value={config.background.chromaKeyColor}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            background: {
                              ...prev.background,
                              chromaKeyColor: e.target.value,
                            },
                          }))
                        }
                        className="w-6 h-5 rounded cursor-pointer"
                      />
                    </label>
                    <div className="flex items-center gap-1.5">
                      <span className="text-zinc-400">পাওয়ার:</span>
                      <input
                        type="range"
                        min={10}
                        max={110}
                        value={config.background.chromaTolerance}
                        onChange={(e) =>
                          setConfig((prev) => ({
                            ...prev,
                            background: {
                              ...prev.background,
                              chromaTolerance: Number(e.target.value),
                            },
                          }))
                        }
                        className="w-24 accent-[#00C8E0] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 5: LAYERS ("আর এখানে লেয়ার অপশন থাকবে") */}
            {activeBottomTab === 'layers' && (
              <div className="space-y-2 text-xs">
                {/* Layer 1: Talking Mouth & Auto-Track Layer */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            mouthLayer: !prev.layers.mouthLayer,
                          },
                        }))
                      }
                      className="p-1.5 rounded bg-zinc-800 text-[#00C8E0] cursor-pointer"
                    >
                      {config.layers.mouthLayer ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>
                    <div>
                      <div className="font-bold text-white">
                        Layer 1 · Talking Mouth Chart (কথা বলার মুখ)
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        অটো-ট্র্যাক ও ১২টি ফোনিম মাউথ চার্ট লেয়ার
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={config.mouthAnchor.skinMaskEnabled}
                        onChange={(e) =>
                          handleUpdateMouthAnchor({
                            skinMaskEnabled: e.target.checked,
                          })
                        }
                        className="accent-[#00C8E0]"
                      />
                      <span className="text-zinc-300">আগের মুখ ঢাকুন (Skin Mask)</span>
                    </label>
                    <input
                      type="color"
                      value={config.mouthAnchor.skinMaskColor}
                      onChange={(e) =>
                        handleUpdateMouthAnchor({ skinMaskColor: e.target.value })
                      }
                      className="w-6 h-5 rounded cursor-pointer"
                    />
                  </div>
                </div>

                {/* Layer 2: Character / Video Layer */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            characterLayer: !prev.layers.characterLayer,
                          },
                        }))
                      }
                      className="p-1.5 rounded bg-zinc-800 text-[#00C8E0] cursor-pointer"
                    >
                      {config.layers.characterLayer ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>
                    <div>
                      <div className="font-bold text-white">
                        Layer 2 · Character / Video Layer (ক্যারেক্টার লেয়ার)
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        আপনার আপলোড করা ছবি বা ভিডিও ক্যারেক্টার লেয়ার
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <label className="px-3 py-1.5 rounded-lg bg-[#00C8E0] text-zinc-950 font-bold cursor-pointer">
                      <span>ক্যারেক্টার বদলান</span>
                      <input
                        type="file"
                        accept="image/*,video/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.mp4,.webm,.mov"
                        onClick={(e) => {
                          e.currentTarget.value = '';
                        }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) handleUniversalCharacterUpload(f);
                        }}
                        className="hidden"
                      />
                    </label>
                    {(customSprites.customCharacter || hasUploadedVideo) && (
                      <button
                        type="button"
                        onClick={handleDeleteImportedMainCharacter}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ডিলিট</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Layer 2B: Customizable Lifting Layer inside Layers Tab */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-purple-500/40 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          maxLiftPx:
                            !prev.layers.liftingLayer && prev.maxLiftPx === 0
                              ? 18
                              : prev.maxLiftPx,
                          layers: {
                            ...prev.layers,
                            liftingLayer: !prev.layers.liftingLayer,
                          },
                        }))
                      }
                      className="p-1.5 rounded bg-zinc-800 text-purple-400 cursor-pointer"
                    >
                      {config.layers.liftingLayer && config.maxLiftPx > 0 ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>
                    <div>
                      <div className="font-bold text-white">
                        Layer · Lifting Layer (কাস্টমাইজেবল লিফটিং লেয়ার)
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        {config.layers.liftingLayer && config.maxLiftPx > 0
                          ? `অ্যাক্টিভ: +${config.maxLiftPx}px লিফটিং (${
                              config.liftingTarget === 'mouth-only'
                                ? 'শুধু মুখ'
                                : config.liftingTarget === 'character-only'
                                ? 'শুধু ক্যারেক্টার'
                                : 'মুখ + ক্যারেক্টার'
                            })`
                          : 'লিফটিং লেয়ার বন্ধ আছে — চাইলে ক্রিয়েট ও কাস্টমাইজ করুন'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (!config.layers.liftingLayer || config.maxLiftPx === 0) {
                          setConfig((prev) => ({
                            ...prev,
                            maxLiftPx: 18,
                            layers: { ...prev.layers, liftingLayer: true },
                          }));
                        }
                        setActiveBottomTab('lifting');
                      }}
                      className="px-3 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-400 text-zinc-950 font-bold cursor-pointer"
                    >
                      {config.layers.liftingLayer && config.maxLiftPx > 0
                        ? 'লিফটিং কাস্টমাইজ →'
                        : '+ লিফটিং লেয়ার ক্রিয়েট'}
                    </button>
                    {config.layers.liftingLayer && config.maxLiftPx > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setConfig((prev) => ({
                            ...prev,
                            maxLiftPx: 0,
                            layers: { ...prev.layers, liftingLayer: false },
                          }))
                        }
                        className="px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ডিলিট</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Layer 3: Background Layer */}
                <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() =>
                        setConfig((prev) => ({
                          ...prev,
                          layers: {
                            ...prev.layers,
                            backgroundLayer: !prev.layers.backgroundLayer,
                          },
                        }))
                      }
                      className="p-1.5 rounded bg-zinc-800 text-[#00C8E0] cursor-pointer"
                    >
                      {config.layers.backgroundLayer ? (
                        <Eye className="w-4 h-4" />
                      ) : (
                        <EyeOff className="w-4 h-4 text-zinc-500" />
                      )}
                    </button>
                    <div>
                      <div className="font-bold text-white">
                        Layer 3 · Background Layer (ব্যাকগ্রাউন্ড লেয়ার)
                      </div>
                      <div className="text-[11px] text-zinc-400">
                        কালার, গ্রিন স্ক্রিন বা কাস্টম ব্যাকগ্রাউন্ড ছবি
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setActiveBottomTab('background')}
                      className="px-3 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
                    >
                      ব্যাকগ্রাউন্ড সেটিংস →
                    </button>
                    {customSprites.customBackground && (
                      <button
                        type="button"
                        onClick={handleDeleteCustomBackgroundImage}
                        className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>ডিলিট</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4B: PROCEDURAL ANIMATION (Hair, Leaves, and Speech Head Tilt Physics) */}
            {activeBottomTab === 'procedural' && (
              <div className="space-y-3 text-xs">
                {(() => {
                  const proc =
                    config.proceduralAnimation || DEFAULT_PROCEDURAL_ANIMATION;
                  const isProcActive =
                    proc.enabled && config.layers.proceduralLayer !== false;

                  return (
                    <>
                      {/* Master Enable Header & Quick Presets */}
                      <div className="p-3 rounded-xl bg-[#192326] border border-teal-500/40 flex flex-wrap items-center justify-between gap-2.5">
                        <div className="flex items-center gap-2.5">
                          <Wind className="w-4 h-4 text-teal-300 shrink-0" />
                          <div>
                            <div className="font-bold text-white">
                              Procedural Animation (Hair, Leaves & Head Tilt Physics)
                            </div>
                            <div className="text-[11px] text-zinc-300">
                              হালকা ফিজিক্স ও সাইন-ওয়েভ (Sine-Wave) লজিকের মাধ্যমে চুল, পাতা এবং কথার সাথে মাথার স্বাভাবিক নড়াচড়া
                            </div>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateProceduralAnimation({
                                enabled: !isProcActive,
                              })
                            }
                            className={`px-3 py-1.5 rounded-lg font-bold cursor-pointer ${
                              isProcActive
                                ? 'bg-teal-400 text-zinc-950'
                                : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
                            }`}
                          >
                            {isProcActive
                              ? '✓ Procedural Motion: ON'
                              : 'Procedural Motion: OFF'}
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              handleUpdateProceduralAnimation({
                                ...DEFAULT_PROCEDURAL_ANIMATION,
                                enabled: true,
                              });
                              showNotice(
                                '🍃 প্রসিডিউরাল অ্যানিমেশন ডিফল্ট ফিজিক্সে রিসেট করা হয়েছে!'
                              );
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold cursor-pointer"
                          >
                            ↺ Reset
                          </button>
                        </div>
                      </div>

                      {/* 1. Trigger Mode Selector + Quick Presets */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-1.5">
                          <div className="font-bold text-teal-300 text-[11px]">
                            ⚡ Trigger Source (ট্রিগার মোড)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {(
                              [
                                {
                                  id: 'audio-idle-hybrid',
                                  label: '🎵 Audio + Idle Hybrid',
                                },
                                {
                                  id: 'audio-frequency',
                                  label: '🗣️ Speech Frequency Only',
                                },
                                {
                                  id: 'idle-sine',
                                  label: '🌊 Idle Sine-Wave Only',
                                },
                              ] as const
                            ).map((tm) => (
                              <button
                                key={tm.id}
                                type="button"
                                onClick={() =>
                                  handleUpdateProceduralAnimation({
                                    enabled: true,
                                    triggerMode: tm.id,
                                  })
                                }
                                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold cursor-pointer ${
                                  proc.triggerMode === tm.id
                                    ? 'bg-teal-400 text-zinc-950'
                                    : 'bg-zinc-900 text-zinc-300 border border-zinc-700 hover:text-white'
                                }`}
                              >
                                {tm.label}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-1.5">
                          <div className="font-bold text-teal-300 text-[11px]">
                            ✨ One-Tap Physics Presets (প্রিসেট)
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  triggerMode: 'audio-idle-hybrid',
                                  headTiltWithSpeech: true,
                                  headTiltIntensity: 68,
                                  hairMovementIntensity: 65,
                                  leavesFloatIntensity: 62,
                                  leavesCount: 12,
                                  waveSpeedHz: 1.3,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] font-semibold cursor-pointer"
                            >
                              🌿 Natural Breeze & Speech
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  triggerMode: 'audio-idle-hybrid',
                                  headTiltWithSpeech: true,
                                  headTiltIntensity: 80,
                                  hairMovementIntensity: 92,
                                  leavesFloatIntensity: 90,
                                  leavesCount: 22,
                                  waveSpeedHz: 2.0,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] font-semibold cursor-pointer"
                            >
                              💨 Windy Hair & Foliage
                            </button>

                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  triggerMode: 'audio-idle-hybrid',
                                  headTiltWithSpeech: true,
                                  headTiltIntensity: 85,
                                  hairMovementIntensity: 45,
                                  leavesFloatIntensity: 0,
                                  leavesCount: 0,
                                  waveSpeedHz: 1.15,
                                })
                              }
                              className="px-2.5 py-1 rounded-lg bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-200 text-[10px] font-semibold cursor-pointer"
                            >
                              🗣️ Speech Head & Hair Only
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* 2. Sliders for Head Speech Tilt, Hair Sine-Wave, and Leaves/Foliage Float */}
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                        {/* Head Position & Speech Tilt */}
                        <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-[11px]">
                              🗣️ Head Tilt with Speech
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                handleUpdateProceduralAnimation({
                                  headTiltWithSpeech: !proc.headTiltWithSpeech,
                                })
                              }
                              className={`px-2 py-0.5 rounded text-[9px] font-bold cursor-pointer ${
                                proc.headTiltWithSpeech
                                  ? 'bg-teal-400 text-zinc-950'
                                  : 'bg-zinc-800 text-zinc-400'
                              }`}
                            >
                              {proc.headTiltWithSpeech ? 'ON' : 'OFF'}
                            </button>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>মাথা টিল্ট ও নড (Intensity):</span>
                              <span className="font-mono text-teal-300">
                                {proc.headTiltIntensity}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={proc.headTiltIntensity}
                              onChange={(e) =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  headTiltIntensity: Number(e.target.value),
                                })
                              }
                              className="w-full accent-teal-400 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>Spring Physics Smoothness:</span>
                              <span className="font-mono text-teal-300">
                                {proc.physicsSpringDamping}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={25}
                              max={92}
                              value={proc.physicsSpringDamping}
                              onChange={(e) =>
                                handleUpdateProceduralAnimation({
                                  physicsSpringDamping: Number(e.target.value),
                                })
                              }
                              className="w-full accent-teal-400 cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Hair Sine-Wave Flow */}
                        <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-[11px]">
                              💇 Hair Sine-Wave Flow (চুলের ঢেউ)
                            </span>
                            <span className="font-mono text-[10px] text-teal-300">
                              {proc.hairMovementIntensity}%
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>Hair Wave Amplitude:</span>
                              <span className="font-mono text-zinc-300">
                                {proc.hairMovementIntensity}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={proc.hairMovementIntensity}
                              onChange={(e) =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  hairMovementIntensity: Number(e.target.value),
                                })
                              }
                              className="w-full accent-teal-400 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>Wave Frequency (গতি):</span>
                              <span className="font-mono text-teal-300">
                                {proc.waveSpeedHz.toFixed(1)} Hz
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0.3}
                              max={3.2}
                              step={0.1}
                              value={proc.waveSpeedHz}
                              onChange={(e) =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  waveSpeedHz: Number(e.target.value),
                                })
                              }
                              className="w-full accent-teal-400 cursor-pointer"
                            />
                          </div>
                        </div>

                        {/* Leaves & Foliage Smooth Float */}
                        <div className="p-2.5 rounded-xl bg-[#1F2026] border border-zinc-800 space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-white text-[11px]">
                              🍃 Leaves & Foliage Float (পাতা)
                            </span>
                            <span className="font-mono text-[10px] text-teal-300">
                              {proc.leavesCount} leaves
                            </span>
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>Foliage Breeze Sway:</span>
                              <span className="font-mono text-zinc-300">
                                {proc.leavesFloatIntensity}%
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={100}
                              value={proc.leavesFloatIntensity}
                              onChange={(e) =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  leavesFloatIntensity: Number(e.target.value),
                                })
                              }
                              className="w-full accent-teal-400 cursor-pointer"
                            />
                          </div>

                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] text-zinc-400">
                              <span>Floating Leaves Count:</span>
                              <span className="font-mono text-teal-300">
                                {proc.leavesCount}
                              </span>
                            </div>
                            <input
                              type="range"
                              min={0}
                              max={28}
                              step={1}
                              value={proc.leavesCount}
                              onChange={(e) =>
                                handleUpdateProceduralAnimation({
                                  enabled: true,
                                  leavesCount: Number(e.target.value),
                                })
                              }
                              className="w-full accent-teal-400 cursor-pointer"
                            />
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            {/* TAB 6: CAPTIONS / AUTO-LISTING & CODE */}
            {activeBottomTab === 'captions' && (
              <div className="space-y-2.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-zinc-300">
                    বর্তমান ফ্রেমে (`F{currentFrameIndex}`) মুখের শেপ পরিবর্তন করুন:
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSettingsSection('auto-listing');
                        setSettingsOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-lg bg-[#00C8E0] text-zinc-950 font-bold cursor-pointer"
                    >
                      পূর্ণ অটো-লিস্টিং ও কোড এডিটর →
                    </button>
                    <button
                      type="button"
                      onClick={() => exportStudioZipBundle(cues, config)}
                      className="px-3 py-1.5 rounded-lg bg-[#1F2026] border border-zinc-700 text-zinc-200 cursor-pointer"
                    >
                      ZIP ডাউনলোড
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  {MOUTH_CHART_12_ORDER.map((code) => (
                    <button
                      key={code}
                      type="button"
                      onClick={() => {
                        const activeCue = cues.find(
                          (c) =>
                            currentFrameIndex >= c.startFrame &&
                            currentFrameIndex <= c.endFrame
                        );
                        if (activeCue) {
                          handleUpdateCue(activeCue.id, {
                            viseme: code,
                            isDropped: false,
                            locked: true,
                          });
                        }
                      }}
                      className={`px-2.5 py-1 rounded font-mono text-[11px] font-bold cursor-pointer ${
                        currentFrame?.viseme === code
                          ? 'bg-[#00C8E0] text-zinc-950'
                          : 'bg-[#1F2026] text-zinc-300 hover:bg-zinc-800'
                      }`}
                    >
                      {VISEME_LIBRARY[code].shortCode}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================================
          6B. RELOCATED BOTTOM LAYER, MOUTH TRACKING & LIP SEGMENT CONTROL BAR
              (Clean preview screen; all tracking & layer selection controls live here!)
         ===================================================================== */}
      <div className="px-3 py-1.5 bg-[#111216] border-t border-zinc-800/80 flex flex-wrap items-center justify-between gap-2 shrink-0 z-30">
        {/* Direct Selectable & Movable Layer Pills */}
        <div className="flex items-center gap-1 overflow-x-auto">
          <span className="text-[10px] font-bold text-zinc-400 mr-1 shrink-0">
            Select & Move:
          </span>

          <button
            type="button"
            onClick={() => setSelectedCanvasLayer('mouth')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
              selectedCanvasLayer === 'mouth'
                ? 'bg-[#00C8E0] text-zinc-950'
                : 'bg-[#1C1D23] text-zinc-300 hover:text-white border border-zinc-800'
            }`}
          >
            <span>👄 Mouth</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCanvasLayer('lip-segment')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
              selectedCanvasLayer === 'lip-segment'
                ? 'bg-pink-500 text-white'
                : 'bg-[#1C1D23] text-zinc-300 hover:text-white border border-zinc-800'
            }`}
          >
            <span>🫦 Lip Segment</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCanvasLayer('tracker')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
              selectedCanvasLayer === 'tracker'
                ? 'bg-emerald-500 text-zinc-950'
                : 'bg-[#1C1D23] text-zinc-300 hover:text-white border border-zinc-800'
            }`}
          >
            <Crosshair className="w-3 h-3" />
            <span>Track Point</span>
          </button>

          <button
            type="button"
            onClick={() => setSelectedCanvasLayer('character')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
              selectedCanvasLayer === 'character'
                ? 'bg-white text-zinc-950'
                : 'bg-[#1C1D23] text-zinc-300 hover:text-white border border-zinc-800'
            }`}
          >
            <span>🧍 Character</span>
          </button>

          {characterOverlays.map((ov, idx) => (
            <button
              key={ov.id}
              type="button"
              onClick={() => {
                setSelectedCanvasLayer('overlay');
                setSelectedOverlayId(ov.id);
              }}
              className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
                selectedCanvasLayer === 'overlay' && selectedOverlayId === ov.id
                  ? 'bg-amber-400 text-zinc-950'
                  : 'bg-[#1C1D23] text-amber-300 hover:text-white border border-zinc-800'
              }`}
            >
              <span>✨ Overlay {idx + 1}</span>
            </button>
          ))}

          <button
            type="button"
            onClick={() => setSelectedCanvasLayer('background')}
            className={`px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0 transition-colors ${
              selectedCanvasLayer === 'background'
                ? 'bg-indigo-500 text-white'
                : 'bg-[#1C1D23] text-zinc-300 hover:text-white border border-zinc-800'
            }`}
          >
            <span>🖼️ BG Move</span>
          </button>

          {selectedCanvasLayer !== 'none' && (
            <button
              type="button"
              onClick={() => setSelectedCanvasLayer('none')}
              title="প্রিভিউ স্ক্রিনের বক্স লুকান"
              className="px-2 py-1 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold cursor-pointer shrink-0"
            >
              ✓ Done
            </button>
          )}
        </div>

        {/* Relocated Bottom Tracking Controls & Quick Scale/Rotate for Selected Layer */}
        <div className="flex items-center gap-2 ml-auto">
          <button
            type="button"
            onClick={() => {
              const trackSource =
                hasUploadedVideo && videoRef.current
                  ? videoRef.current
                  : loadedSpriteImagesRef.current.customCharacter || null;
              captureMouthTrackingTemplate(trackSource, config);
              setConfig((prev) => ({
                ...prev,
                mouthTracker: {
                  ...prev.mouthTracker,
                  enabled: true,
                  showTrackBox: false,
                },
              }));
              showNotice('✓ ট্র্যাক পয়েন্ট লক হয়েছে!');
            }}
            title="বর্তমান ট্র্যাকিং পয়েন্ট লক করুন"
            className="px-2 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1 cursor-pointer shrink-0"
          >
            <Crosshair className="w-3 h-3" />
            <span>Lock Track</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setConfig((prev) => ({
                ...prev,
                mouthTracker: {
                  ...prev.mouthTracker,
                  enabled: !prev.mouthTracker.enabled,
                  showTrackBox: false,
                },
              }))
            }
            className={`px-2 py-1 rounded-lg border text-[10px] font-mono font-bold cursor-pointer shrink-0 ${
              config.mouthTracker.enabled
                ? 'border-[#00C8E0] text-[#00C8E0] bg-[#00C8E0]/10'
                : 'border-zinc-700 text-zinc-400'
            }`}
          >
            {config.mouthTracker.enabled ? 'TRACK: ON' : 'TRACK: OFF'}
          </button>
        </div>
      </div>

      {/* =====================================================================
          7. CAPCUT 6-ICON BOTTOM NAVIGATION DOCK:
             Character · Mouth Track · Audio · Background · Layers · Captions
         ===================================================================== */}
      <footer className="h-16 px-2 bg-[#141519] border-t border-zinc-800/90 flex items-center justify-around shrink-0 z-30">
        {/* 1. Character Upload (যেকোনো ফরম্যাটে ক্যারেক্টার) */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) =>
              prev === 'character' ? null : 'character'
            )
          }
          className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'character'
              ? 'text-[#00C8E0]'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <UserPlus className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Character</span>
        </button>

        {/* 2. Mouth & Auto-Track (মাউথ ও অটো-ট্র্যাক) */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) =>
              prev === 'mouth-track' ? null : 'mouth-track'
            )
          }
          className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'mouth-track'
              ? 'text-[#00C8E0]'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <Crosshair className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Mouth Track</span>
        </button>

        {/* 3. Audio & Record */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) => (prev === 'audio' ? null : 'audio'))
          }
          className={`flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'audio'
              ? 'text-[#00C8E0]'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <Music className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Audio</span>
        </button>

        {/* 4. Customizable Lifting Layer (লিফটিং লেয়ার সেকশন) */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) =>
              prev === 'lifting' ? null : 'lifting'
            )
          }
          className={`flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'lifting'
              ? 'text-purple-400'
              : config.layers.liftingLayer && config.maxLiftPx > 0
              ? 'text-purple-300 hover:text-white'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <ArrowUpFromLine className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Lifting</span>
        </button>

        {/* 4B. Procedural Motion (Hair, Leaves & Head Tilt Physics) */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) =>
              prev === 'procedural' ? null : 'procedural'
            )
          }
          className={`flex flex-col items-center justify-center gap-1 px-2 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'procedural'
              ? 'text-teal-400'
              : config.proceduralAnimation?.enabled !== false &&
                config.layers.proceduralLayer !== false
              ? 'text-teal-300 hover:text-white'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <Wind className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Motion</span>
        </button>

        {/* 5. Background Change (ব্যাকগ্রাউন্ড চেঞ্জ) */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) =>
              prev === 'background' ? null : 'background'
            )
          }
          className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'background'
              ? 'text-[#00C8E0]'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <Palette className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Background</span>
        </button>

        {/* 5. Layers (লেয়ার অপশন) */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) => (prev === 'layers' ? null : 'layers'))
          }
          className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'layers'
              ? 'text-[#00C8E0]'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <Layers className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Layers</span>
        </button>

        {/* 6. Captions / Listing */}
        <button
          type="button"
          onClick={() =>
            setActiveBottomTab((prev) =>
              prev === 'captions' ? null : 'captions'
            )
          }
          className={`flex flex-col items-center justify-center gap-1 px-2.5 py-1 rounded-lg cursor-pointer ${
            activeBottomTab === 'captions'
              ? 'text-[#00C8E0]'
              : 'text-zinc-300 hover:text-white'
          }`}
        >
          <Subtitles className="w-5 h-5 stroke-[1.8]" />
          <span className="text-[11px] font-medium">Captions</span>
        </button>
      </footer>

      {/* =====================================================================
          8. CAPCUT EXPORT & DIRECT DOWNLOAD MODAL
         ===================================================================== */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#181920] border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-md p-6 text-center space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-white">
                {isExportingVideo
                  ? 'Exporting Video...'
                  : 'Ready to Save / Download!'}
              </h3>
              <button
                type="button"
                onClick={handleCancelExport}
                className="text-zinc-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isExportingVideo ? (
              <div className="space-y-4 py-4">
                <Loader2 className="w-10 h-10 text-[#00C8E0] animate-spin mx-auto" />
                <div className="text-2xl font-mono font-bold text-white">
                  {exportProgressPct}%
                </div>
                <div className="w-full h-2.5 rounded-full bg-zinc-800 overflow-hidden">
                  <div
                    style={{ width: `${exportProgressPct}%` }}
                    className="h-full bg-[#00C8E0] transition-all duration-150"
                  />
                </div>
                <p className="text-xs text-zinc-400">
                  অটো-ট্র্যাক মাউথ এবং ক্যারেক্টার ভিডিও রেন্ডার হচ্ছে...
                </p>
              </div>
            ) : (
              exportedVideoUrl && (
                <div className="space-y-4">
                  <div className="flex items-center justify-center gap-2 text-[#00E1FA] text-xs font-semibold">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>এক্সপোর্ট সম্পন্ন! নিচে ট্যাপ করে সরাসরি ডাউনলোড করুন:</span>
                  </div>

                  <video
                    src={exportedVideoUrl}
                    controls
                    playsInline
                    className="w-full rounded-xl border border-zinc-700 bg-black max-h-48 object-contain"
                  />

                  <a
                    href={exportedVideoUrl}
                    download={exportedFilename}
                    className="w-full py-3 px-4 rounded-xl bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 font-bold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>
                      Save / Download Video (
                      {exportedFilename.split('.').pop()?.toUpperCase()})
                    </span>
                  </a>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {/* INTERNAL MOUTH CHART & CODE LISTING MODAL */}
      <SettingsLogicModal
        isOpen={settingsOpen}
        initialSection={settingsSection}
        config={config}
        cues={cues}
        zipEntries={zipEntries}
        customSprites={customSprites}
        loadedSprites={loadedSpritesState}
        activeViseme={currentFrame?.viseme || VisemeCode.DROP}
        onClose={() => setSettingsOpen(false)}
        onUpdateConfig={(patch) => setConfig((prev) => ({ ...prev, ...patch }))}
        onUpdateMouthAnchor={handleUpdateMouthAnchor}
        onUpdatePerKeyLift={handleUpdatePerKeyLift}
        onResetPerKeyLift={handleResetPerKeyLift}
        onUpdateLipstickStyle={handleUpdateLipstickStyle}
        onApplyImportedCues={handleApplyImportedCues}
        onUpdateSingleCue={handleUpdateCue}
        onSeekFrame={handleSeekFrame}
        onAssignSprite={(target, blobUrl) =>
          setCustomSprites((prev) => ({ ...prev, [target]: blobUrl }))
        }
        onUploadZipOrListingFile={handleUploadZipOrListing}
        onUploadChartSheetToSlice={handleUploadChartSheetToSlice}
        onExportZipPackage={() => exportStudioZipBundle(cues, config)}
      />
    </div>
  );
}
