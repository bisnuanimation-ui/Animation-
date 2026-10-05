import {
  DEFAULT_PER_KEY_LIFT,
  DEFAULT_PROCEDURAL_ANIMATION,
  EngineConfig,
  LocalStudioProject,
} from '../types/studio';

const DB_NAME = 'studio_offline_projects_db_v1';
const STORE_NAME = 'projects';
const DB_VERSION = 1;
const FALLBACK_LS_KEY = 'studio_offline_projects_fallback_v1';

export function createDefaultEngineConfig(
  overrides?: Partial<EngineConfig>
): EngineConfig {
  return {
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
      enabled: true,
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
    ...overrides,
  };
}

function openOfflineProjectsDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function saveToFallbackLocalStorage(projects: LocalStudioProject[]) {
  try {
    // Store lightweight metadata & config in localStorage as instant mirror
    const compact = projects.map((p) => ({
      ...p,
      customSprites: p.customSprites,
    }));
    localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(compact));
  } catch {
    // If customSprites DataURLs exceed 5MB localStorage quota, store without heavy customSprites in fallback
    try {
      const lite = projects.map((p) => ({
        ...p,
        customSprites: undefined,
      }));
      localStorage.setItem(FALLBACK_LS_KEY, JSON.stringify(lite));
    } catch {
      // Ignore quota errors
    }
  }
}

function loadFromFallbackLocalStorage(): LocalStudioProject[] {
  try {
    const raw = localStorage.getItem(FALLBACK_LS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function loadAllLocalProjects(): Promise<LocalStudioProject[]> {
  try {
    const db = await openOfflineProjectsDb();
    const list = await new Promise<LocalStudioProject[]>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as LocalStudioProject[]) || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    if (sorted.length > 0) {
      saveToFallbackLocalStorage(sorted);
      return sorted;
    }
  } catch {
    // Fallback to localStorage if IndexedDB fails
  }
  const fallback = loadFromFallbackLocalStorage();
  return fallback.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function saveLocalProject(
  project: LocalStudioProject
): Promise<LocalStudioProject[]> {
  const updatedProject: LocalStudioProject = {
    ...project,
    updatedAt: Date.now(),
  };

  try {
    const db = await openOfflineProjectsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.put(updatedProject);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback to localStorage
    const existing = loadFromFallbackLocalStorage().filter(
      (p) => p.id !== updatedProject.id
    );
    saveToFallbackLocalStorage([updatedProject, ...existing]);
  }

  return loadAllLocalProjects();
}

export async function deleteLocalProject(
  projectId: string
): Promise<LocalStudioProject[]> {
  try {
    const db = await openOfflineProjectsDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      store.delete(projectId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }

  const remaining = loadFromFallbackLocalStorage().filter(
    (p) => p.id !== projectId
  );
  saveToFallbackLocalStorage(remaining);

  return loadAllLocalProjects();
}

export async function seedDefaultProjectsIfEmpty(): Promise<LocalStudioProject[]> {
  const existing = await loadAllLocalProjects();
  if (existing.length > 0) {
    return existing;
  }

  const todayStr = new Date().toISOString().slice(0, 10);
  const now = Date.now();

  const starterProjects: LocalStudioProject[] = [
    {
      id: 'proj-local-arjun-story',
      name: 'অর্জুনের কার্টুন ডায়ালগ (Episode 1)',
      description:
        '2D Lip-Sync অ্যানিমেশন + প্রসিডিউরাল চুল, পাতা ও কথার সাথে মাথার হালকা নড়াচড়া (Offline Local Project)',
      date: todayStr,
      createdAt: now - 3600_000,
      updatedAt: now - 120_000,
      config: createDefaultEngineConfig({
        characterPreset: 'arjun-2d',
        exportResolution: 'youtube-1080p',
        background: {
          mode: 'gradient',
          color1: '#1E293B',
          color2: '#0F172A',
          removeCharacterBg: false,
          chromaKeyColor: '#FFFFFF',
          chromaTolerance: 42,
        },
        proceduralAnimation: {
          ...DEFAULT_PROCEDURAL_ANIMATION,
          enabled: true,
          headTiltWithSpeech: true,
          headTiltIntensity: 70,
          hairMovementIntensity: 68,
          leavesFloatIntensity: 65,
          leavesCount: 12,
        },
      }),
      mediaSourceTitle: 'Bangla Story Voice 1',
    },
    {
      id: 'proj-local-mina-reels',
      name: 'মিনার শর্টস অ্যানিমেশন (Reels 9:16)',
      description:
        'মিনা ক্যারেক্টার, সাইড-সোয়ে প্রসিডিউরাল হেয়ার ফিজিক্স এবং ভাসমান পাতার ইফেক্ট সহ মোবাইল রিলস প্রজেক্ট।',
      date: todayStr,
      createdAt: now - 7200_000,
      updatedAt: now - 1800_000,
      config: createDefaultEngineConfig({
        characterPreset: 'mina-toon',
        exportResolution: 'reels-9-16',
        background: {
          mode: 'gradient',
          color1: '#31102F',
          color2: '#0F172A',
          removeCharacterBg: false,
          chromaKeyColor: '#FFFFFF',
          chromaTolerance: 42,
        },
        proceduralAnimation: {
          ...DEFAULT_PROCEDURAL_ANIMATION,
          enabled: true,
          headTiltWithSpeech: true,
          headTiltIntensity: 75,
          hairMovementIntensity: 78,
          leavesFloatIntensity: 70,
          leavesCount: 14,
        },
      }),
      mediaSourceTitle: 'Mina Dialogue Track',
    },
  ];

  for (const proj of starterProjects.reverse()) {
    await saveLocalProject(proj);
  }

  return loadAllLocalProjects();
}

/**
 * Helper to convert a File into a persistent Data URL so local projects
 * can store uploaded character images offline inside IndexedDB.
 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
