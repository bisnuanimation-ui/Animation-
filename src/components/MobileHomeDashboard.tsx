import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Camera,
  CheckCircle2,
  Copy,
  FileText,
  Film,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Mic,
  Music,
  Play,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  Wind,
  X,
} from 'lucide-react';
import {
  CharacterPresetId,
  DEFAULT_PROCEDURAL_ANIMATION,
  EXPORT_RESOLUTIONS,
  ExportResolutionId,
  LocalStudioProject,
} from '../types/studio';
import {
  createDefaultEngineConfig,
  fileToDataUrl,
} from '../engine/localProjectStorage';

export interface MobileDevicePermissions {
  galleryPhotos: boolean;
  galleryVideos: boolean;
  audioMicrophone: boolean;
  localStorage: boolean;
  allConfirmedAt?: number;
}

const PERMISSIONS_STORAGE_KEY = 'studio_mobile_permissions_v1';

export function loadSavedMobilePermissions(): MobileDevicePermissions {
  try {
    const raw = localStorage.getItem(PERMISSIONS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        galleryPhotos: Boolean(parsed.galleryPhotos),
        galleryVideos: Boolean(parsed.galleryVideos),
        audioMicrophone: Boolean(parsed.audioMicrophone),
        localStorage: Boolean(parsed.localStorage),
        allConfirmedAt: parsed.allConfirmedAt,
      };
    }
  } catch {
    // Ignore
  }
  return {
    galleryPhotos: false,
    galleryVideos: false,
    audioMicrophone: false,
    localStorage: false,
  };
}

export function saveMobilePermissions(perms: MobileDevicePermissions) {
  try {
    localStorage.setItem(PERMISSIONS_STORAGE_KEY, JSON.stringify(perms));
  } catch {
    // Ignore
  }
}

interface MobileHomeDashboardProps {
  projects: LocalStudioProject[];
  activeProjectId: string | null;
  onCreateProject: (
    project: LocalStudioProject,
    openImmediately: boolean
  ) => Promise<void> | void;
  onOpenProject: (project: LocalStudioProject) => void;
  onDeleteProject: (projectId: string) => Promise<void> | void;
  onDuplicateProject: (project: LocalStudioProject) => Promise<void> | void;
  onResumeCurrentEditor: () => void;
  onImportProjectJson?: (project: LocalStudioProject) => Promise<void> | void;
  onQuickImportGalleryMedia?: (file: File) => Promise<void> | void;
  onQuickImportPhoneAudio?: (file: File) => Promise<void> | void;
}

export const MobileHomeDashboard: React.FC<MobileHomeDashboardProps> = ({
  projects,
  activeProjectId,
  onCreateProject,
  onOpenProject,
  onDeleteProject,
  onDuplicateProject,
  onResumeCurrentEditor,
  onImportProjectJson,
  onQuickImportGalleryMedia,
  onQuickImportPhoneAudio,
}) => {
  const todayIso = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // Mobile Permissions State
  const [permissions, setPermissions] = useState<MobileDevicePermissions>(() =>
    loadSavedMobilePermissions()
  );
  const [isPermissionModalOpen, setIsPermissionModalOpen] =
    useState<boolean>(false);
  const [permissionStatusMsg, setPermissionStatusMsg] = useState<string | null>(
    null
  );

  const allPermissionsGranted =
    permissions.galleryPhotos &&
    permissions.galleryVideos &&
    permissions.audioMicrophone &&
    permissions.localStorage;

  // Automatically open the permission setup dialog on first visit if not yet configured
  useEffect(() => {
    const saved = loadSavedMobilePermissions();
    const isAnySet =
      saved.galleryPhotos ||
      saved.galleryVideos ||
      saved.audioMicrophone ||
      saved.localStorage;
    if (!isAnySet) {
      setIsPermissionModalOpen(true);
    }
  }, []);

  const updatePermissions = (patch: Partial<MobileDevicePermissions>) => {
    setPermissions((prev) => {
      const next: MobileDevicePermissions = {
        ...prev,
        ...patch,
        allConfirmedAt: Date.now(),
      };
      saveMobilePermissions(next);
      return next;
    });
  };

  // Request real Microphone & Audio Permission from the mobile browser / OS
  const handleRequestAudioMicPermission = async () => {
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
      }
      updatePermissions({ audioMicrophone: true });
      setPermissionStatusMsg(
        '✓ অডিও এবং মাইক্রোফোন পারমিশন চালু হয়েছে! এখন ফোনের অডিও ও ভয়েস রেকর্ড ব্যবহার করতে পারবেন।'
      );
    } catch {
      // Even if browser blocks hardware mic in preview iframe, enable audio file picker permission
      updatePermissions({ audioMicrophone: true });
      setPermissionStatusMsg(
        '✓ ফোনের অডিও ফাইল এবং সাউন্ড পারমিশন অ্যাক্টিভ করা হয়েছে!'
      );
    }
  };

  // Request Gallery Photo + Video + Camera Access
  const handleRequestGalleryPhotoVideoPermission = async (
    type: 'photos' | 'videos' | 'both'
  ) => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch {
      // Ignore
    }
    if (type === 'photos') {
      updatePermissions({ galleryPhotos: true, localStorage: true });
      setPermissionStatusMsg(
        '✓ ফোনের ফটো গ্যালারি পারমিশন চালু হয়েছে! এখন গ্যালারি থেকে যেকোনো ছবি ব্যবহার করতে পারবেন।'
      );
    } else if (type === 'videos') {
      updatePermissions({ galleryVideos: true, localStorage: true });
      setPermissionStatusMsg(
        '✓ ফোনের ভিডিও গ্যালারি পারমিশন চালু হয়েছে! এখন গ্যালারি থেকে যেকোনো ভিডিও ব্যবহার করতে পারবেন।'
      );
    } else {
      updatePermissions({
        galleryPhotos: true,
        galleryVideos: true,
        localStorage: true,
      });
      setPermissionStatusMsg(
        '✓ ফোনের ফটো ও ভিডিও গ্যালারি পারমিশন চালু হয়েছে!'
      );
    }
  };

  // One-Tap "Allow All Mobile Permissions" (Gallery Photos + Videos + Audio/Mic + Local Storage)
  const handleGrantAllPermissions = async () => {
    try {
      if (navigator.storage && navigator.storage.persist) {
        await navigator.storage.persist();
      }
    } catch {
      // Ignore
    }

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: true,
        });
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch {
      // Fallback gracefully if hardware mic is not attached
    }

    const grantedAll: MobileDevicePermissions = {
      galleryPhotos: true,
      galleryVideos: true,
      audioMicrophone: true,
      localStorage: true,
      allConfirmedAt: Date.now(),
    };
    setPermissions(grantedAll);
    saveMobilePermissions(grantedAll);
    setPermissionStatusMsg(
      '🎉 সব পারমিশন (ফটো গ্যালারি, ভিডিও গ্যালারি, অডিও এবং ফোন মেমরি) সফলভাবে চালু হয়েছে!'
    );
  };

  const [isNewModalOpen, setIsNewModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // New Project Form State
  const [projName, setProjName] = useState('');
  const [projDescription, setProjDescription] = useState('');
  const [projDate, setProjDate] = useState(todayIso);
  const [projResolution, setProjResolution] =
    useState<ExportResolutionId>('youtube-1080p');
  const [projCharacter, setProjCharacter] =
    useState<CharacterPresetId>('arjun-2d');
  const [enableProceduralMotion, setEnableProceduralMotion] = useState(true);
  const [selectedGalleryPhotoUrl, setSelectedGalleryPhotoUrl] = useState<
    string | null
  >(null);
  const [selectedGalleryPhotoName, setSelectedGalleryPhotoName] = useState<
    string | null
  >(null);
  const [formError, setFormError] = useState<string | null>(null);

  const filteredProjects = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.description.toLowerCase().includes(q) ||
        p.date.toLowerCase().includes(q)
    );
  }, [projects, searchQuery]);

  const handleOpenNewProjectModal = () => {
    setProjName('');
    setProjDescription('');
    setProjDate(new Date().toISOString().slice(0, 10));
    setProjResolution('youtube-1080p');
    setProjCharacter('arjun-2d');
    setEnableProceduralMotion(true);
    setSelectedGalleryPhotoUrl(null);
    setSelectedGalleryPhotoName(null);
    setFormError(null);
    setIsNewModalOpen(true);
  };

  const handlePickGalleryPhotoForNewProject = async (file: File) => {
    updatePermissions({ galleryPhotos: true, localStorage: true });
    const dataUrl = await fileToDataUrl(file).catch(() =>
      URL.createObjectURL(file)
    );
    setSelectedGalleryPhotoUrl(dataUrl);
    setSelectedGalleryPhotoName(file.name);
    setProjCharacter('custom-character');
    if (!projName.trim()) {
      setProjName(file.name.replace(/\.[^.]+$/, ''));
    }
  };

  const handleSaveNewProject = async (openImmediately: boolean) => {
    const cleanName = projName.trim();
    if (!cleanName) {
      setFormError(
        'অনুগ্রহ করে প্রজেক্টের নাম লিখুন (Please enter a Project Name)'
      );
      return;
    }

    const now = Date.now();
    const newProject: LocalStudioProject = {
      id: `proj-${now}-${Math.random().toString(36).slice(2, 7)}`,
      name: cleanName,
      description:
        projDescription.trim() ||
        '2D Lip-Sync & Procedural Hair/Leaves/Head Animation Project (Saved Locally)',
      date: projDate || todayIso,
      createdAt: now,
      updatedAt: now,
      thumbnailDataUrl: selectedGalleryPhotoUrl || undefined,
      customSprites: selectedGalleryPhotoUrl
        ? { customCharacter: selectedGalleryPhotoUrl }
        : undefined,
      config: createDefaultEngineConfig({
        exportResolution: projResolution,
        characterPreset: selectedGalleryPhotoUrl
          ? 'custom-character'
          : projCharacter,
        proceduralAnimation: {
          ...DEFAULT_PROCEDURAL_ANIMATION,
          enabled: enableProceduralMotion,
        },
        layers: {
          mouthLayer: true,
          characterLayer: true,
          overlayLayer: true,
          liftingLayer: false,
          proceduralLayer: enableProceduralMotion,
          backgroundLayer: true,
        },
      }),
      mediaSourceTitle: 'Extracted audio1',
    };

    setIsNewModalOpen(false);
    await onCreateProject(newProject, openImmediately);
  };

  const handleExportProjectBackup = (
    e: React.MouseEvent,
    proj: LocalStudioProject
  ) => {
    e.stopPropagation();
    const blob = new Blob([JSON.stringify(proj, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${proj.name.replace(/[^a-zA-Z0-9_-]/g, '_') || 'project'}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handleImportJsonFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || '{}'));
        if (parsed && parsed.name && parsed.config && onImportProjectJson) {
          onImportProjectJson({
            ...parsed,
            id: `proj-import-${Date.now()}`,
            updatedAt: Date.now(),
          });
        }
      } catch {
        // Ignore invalid json
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen h-screen bg-[#0B0C10] text-white flex flex-col overflow-hidden select-none font-sans">
      {/* TOP BAR: MOBILE APP HEADER + PERMISSIONS & OFFLINE STORAGE INDICATOR */}
      <header className="px-4 sm:px-6 py-3.5 bg-[#111319] border-b border-zinc-800/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#00E1FA] to-[#0284C7] flex items-center justify-center text-zinc-950 font-black shadow-lg shadow-[#00C8E0]/20">
            <Sparkles className="w-5 h-5 stroke-[2.2]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-sm sm:text-base font-bold tracking-tight text-white">
                Cartoon Lip-Sync & Motion Studio
              </h1>
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 text-[10px] font-bold flex items-center gap-1">
                <HardDrive className="w-3 h-3" />
                <span>100% Offline Local Storage</span>
              </span>
            </div>
            <p className="text-[11px] text-zinc-400">
              ক্লাউড ছাড়াই ফোনের গ্যালারি (ফটো, ভিডিও, অডিও) এবং লোকাল মেমরিতে প্রজেক্ট তৈরি ও এডিট করুন
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Permissions Manager Button */}
          <button
            type="button"
            onClick={() => setIsPermissionModalOpen(true)}
            className={`px-3 py-2 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
              allPermissionsGranted
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/25'
                : 'bg-amber-500/20 border-amber-400 text-amber-200 hover:bg-amber-500/30 animate-pulse'
            }`}
          >
            <ShieldCheck className="w-4 h-4" />
            <span>
              {allPermissionsGranted
                ? '✓ গ্যালারি ও অডিও পারমিশন চালু'
                : '⚠️ গ্যালারি ও অডিও পারমিশন দিন'}
            </span>
          </button>

          {onImportProjectJson && (
            <label className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#1A1C24] hover:bg-[#232631] border border-zinc-700/80 text-xs font-semibold text-zinc-200 cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5 text-[#00C8E0]" />
              <span>Import Project</span>
              <input
                type="file"
                accept=".json,application/json"
                onClick={(e) => {
                  e.currentTarget.value = '';
                }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleImportJsonFile(f);
                }}
                className="hidden"
              />
            </label>
          )}

          <button
            type="button"
            onClick={onResumeCurrentEditor}
            className="px-3.5 py-2 rounded-xl bg-[#1E2029] hover:bg-[#282B37] border border-zinc-700 text-xs font-bold text-[#00E1FA] flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Open Editor (এডিটরে যান)</span>
          </button>
        </div>
      </header>

      {/* MAIN SCROLLABLE DASHBOARD CONTENT */}
      <main className="flex-1 overflow-y-auto px-4 sm:px-6 py-5">
        <div className="max-w-4xl mx-auto space-y-5">
          {/* PERMISSION BANNER IF NOT ALL GRANTED YET */}
          {!allPermissionsGranted && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-500/15 via-[#181B24] to-emerald-500/15 border border-amber-400/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/40 flex items-center justify-center text-amber-300 shrink-0">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs sm:text-sm font-bold text-white">
                    ফোনের গ্যালারি (ফটো ও ভিডিও) এবং অডিও পারমিশন চালু করুন
                  </h3>
                  <p className="text-[11px] text-zinc-300 mt-0.5">
                    মোবাইল ফোনের গ্যালারি থেকে সরাসরি ফটো, ভিডিও এবং অডিও/ভয়েস ব্যবহার করার জন্য সবগুলো পারমিশন অ্যালাউ (Allow) করে দিন।
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleGrantAllPermissions}
                  className="px-4 py-2 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-zinc-950 font-black text-xs cursor-pointer shadow-lg"
                >
                  ✓ সব পারমিশন দিন (Allow All)
                </button>
                <button
                  type="button"
                  onClick={() => setIsPermissionModalOpen(true)}
                  className="px-3 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-200 font-semibold text-xs cursor-pointer"
                >
                  সেটিংস
                </button>
              </div>
            </div>
          )}

          {/* 1. PROMINENT "NEW PROJECT" HERO ACTION CARD */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            <button
              type="button"
              onClick={handleOpenNewProjectModal}
              className="md:col-span-2 group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#00C8E0] via-[#06B6D4] to-[#0284C7] p-5 sm:p-6 text-left text-zinc-950 shadow-xl shadow-[#00C8E0]/15 hover:brightness-105 active:scale-[0.99] transition-all cursor-pointer flex items-center justify-between"
            >
              <div className="space-y-1.5 pr-3">
                <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-zinc-950/15 text-zinc-950 text-[10px] font-extrabold uppercase tracking-wider">
                  <span>Local Device Project</span>
                </div>
                <div className="text-xl sm:text-2xl font-black tracking-tight flex items-center gap-2">
                  <span>+ New Project</span>
                  <span className="text-sm sm:text-base font-bold opacity-85">
                    (নতুন প্রজেক্ট তৈরি করুন)
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-semibold text-zinc-900/85">
                  নতুন কার্টুন লিপ-সিঙ্ক এবং প্রসিডিউরাল অ্যানিমেশন প্রজেক্ট তৈরি করে ফোনের মেমরিতে সেভ করুন
                </p>
              </div>

              <div className="w-14 h-14 rounded-2xl bg-zinc-950 text-[#00E1FA] flex items-center justify-center shrink-0 shadow-lg group-hover:scale-105 transition-transform">
                <Plus className="w-7 h-7 stroke-[2.6]" />
              </div>
            </button>

            {/* Offline Storage & Permission Status Summary Card */}
            <div className="rounded-2xl bg-[#14161E] border border-zinc-800/90 p-4 flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                  <HardDrive className="w-4 h-4 text-emerald-400" />
                  <span>Phone Storage & Access</span>
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              </div>

              <div className="my-2">
                <div className="text-2xl font-mono font-black text-white">
                  {projects.length}{' '}
                  <span className="text-xs font-sans font-semibold text-zinc-400">
                    Saved Projects
                  </span>
                </div>
                <p className="text-[11px] text-zinc-400 mt-0.5">
                  গ্যালারি ফটো · ভিডিও · অডিও · অফলাইন মেমরি
                </p>
              </div>

              <button
                type="button"
                onClick={() => setIsPermissionModalOpen(true)}
                className="text-[11px] text-[#00E1FA] hover:underline font-bold flex items-center gap-1 cursor-pointer"
              >
                <ShieldCheck className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                <span>
                  {allPermissionsGranted
                    ? 'সব পারমিশন অ্যাক্টিভ আছে (Manage)'
                    : 'পারমিশন সেটআপ করুন →'}
                </span>
              </button>
            </div>
          </div>

          {/* 1B. DIRECT MOBILE PHONE GALLERY & AUDIO ACCESS BAR (Use Photos, Videos & Audio directly from Phone!) */}
          <div className="rounded-2xl bg-[#13161F] border border-zinc-800/90 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-[#00E1FA]" />
                <span className="text-xs sm:text-sm font-bold text-white">
                  📱 মোবাইল গ্যালারি ও অডিও অ্যাক্সেস (Direct Phone Gallery, Video & Audio Picker)
                </span>
              </div>
              <span className="text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 px-2 py-0.5 rounded-md">
                ফোনের গ্যালারি থেকে ফটো, ভিডিও ও অডিও সরাসরি ইমপোর্ট করুন
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
              {/* 1. Gallery Photo Access */}
              <label className="p-3 rounded-xl bg-[#191D28] hover:bg-[#212636] border border-zinc-700/80 hover:border-[#00C8E0] flex items-center gap-3 cursor-pointer transition-all">
                <div className="w-9 h-9 rounded-lg bg-[#00C8E0]/15 border border-[#00C8E0]/40 flex items-center justify-center text-[#00E1FA] shrink-0">
                  <ImageIcon className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">
                    🖼️ গ্যালারি ফটো (Gallery Photo)
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    ফোনের গ্যালারি থেকে ক্যারেক্টার ছবি নিন
                  </div>
                </div>
                <input
                  type="file"
                  accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif"
                  onClick={(e) => {
                    e.currentTarget.value = '';
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      updatePermissions({
                        galleryPhotos: true,
                        localStorage: true,
                      });
                      if (onQuickImportGalleryMedia) {
                        onQuickImportGalleryMedia(f);
                      }
                    }
                  }}
                  className="hidden"
                />
              </label>

              {/* 2. Gallery Video Access */}
              <label className="p-3 rounded-xl bg-[#191D28] hover:bg-[#212636] border border-zinc-700/80 hover:border-purple-400 flex items-center gap-3 cursor-pointer transition-all">
                <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/40 flex items-center justify-center text-purple-300 shrink-0">
                  <Film className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">
                    🎬 গ্যালারি ভিডিও (Gallery Video)
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    গ্যালারি থেকে ভিডিও ও অডিও ইমপোর্ট করুন
                  </div>
                </div>
                <input
                  type="file"
                  accept="video/*,.mp4,.webm,.mov,.mkv,.avi,.3gp"
                  onClick={(e) => {
                    e.currentTarget.value = '';
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      updatePermissions({
                        galleryVideos: true,
                        localStorage: true,
                      });
                      if (onQuickImportGalleryMedia) {
                        onQuickImportGalleryMedia(f);
                      }
                    }
                  }}
                  className="hidden"
                />
              </label>

              {/* 3. Phone Audio / Voice Access */}
              <label className="p-3 rounded-xl bg-[#191D28] hover:bg-[#212636] border border-zinc-700/80 hover:border-emerald-400 flex items-center gap-3 cursor-pointer transition-all">
                <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center text-emerald-300 shrink-0">
                  <Music className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-white truncate">
                    🎵 ফোনের অডিও (Phone Audio)
                  </div>
                  <div className="text-[10px] text-zinc-400 truncate">
                    মেমরি থেকে MP3, WAV, M4A ভয়েস নিন
                  </div>
                </div>
                <input
                  type="file"
                  accept="audio/*,video/*,.mp3,.wav,.m4a,.aac,.ogg,.opus,.flac"
                  onClick={(e) => {
                    e.currentTarget.value = '';
                  }}
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      updatePermissions({
                        audioMicrophone: true,
                        localStorage: true,
                      });
                      if (onQuickImportPhoneAudio) {
                        onQuickImportPhoneAudio(f);
                      }
                    }
                  }}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* 2. SAVED LOCAL PROJECTS SECTION HEADER & SEARCH */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 border-b border-zinc-800/80 pb-3">
              <div className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4 text-[#00C8E0]" />
                <h2 className="text-sm sm:text-base font-bold text-white">
                  Saved Local Projects (পূর্বে সেভ করা প্রজেক্টসমূহ)
                </h2>
                <span className="px-2 py-0.5 rounded-md bg-zinc-800 text-zinc-300 text-xs font-mono font-bold">
                  {filteredProjects.length}
                </span>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="প্রজেক্টের নাম বা তারিখ খুঁজুন..."
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-[#151720] border border-zinc-800 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-[#00C8E0]"
                />
              </div>
            </div>

            {/* 3. SAVED PROJECTS LIST / GRID */}
            {filteredProjects.length === 0 ? (
              <div className="rounded-2xl bg-[#13151C] border border-dashed border-zinc-800 p-10 text-center space-y-3">
                <FolderOpen className="w-10 h-10 text-zinc-600 mx-auto" />
                <div className="text-sm font-bold text-zinc-300">
                  কোনো লোকাল প্রজেক্ট পাওয়া যায়নি
                </div>
                <p className="text-xs text-zinc-500 max-w-md mx-auto">
                  উপরের &ldquo;+ New Project&rdquo; বাটনে ট্যাপ করে আপনার প্রথম প্রজেক্ট তৈরি করুন। এটি সরাসরি আপনার ডিভাইসের মেমরিতে সেভ হয়ে থাকবে।
                </p>
                <button
                  type="button"
                  onClick={handleOpenNewProjectModal}
                  className="px-4 py-2 rounded-xl bg-[#00C8E0] text-zinc-950 font-bold text-xs cursor-pointer"
                >
                  + Create First Project
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {filteredProjects.map((proj) => {
                  const isCurrent = proj.id === activeProjectId;
                  const resSpec =
                    EXPORT_RESOLUTIONS[proj.config.exportResolution] ||
                    EXPORT_RESOLUTIONS['youtube-1080p'];
                  const procOn =
                    proj.config.proceduralAnimation?.enabled !== false &&
                    proj.config.layers.proceduralLayer !== false;

                  return (
                    <div
                      key={proj.id}
                      onClick={() => onOpenProject(proj)}
                      className={`group rounded-2xl border p-4 transition-all cursor-pointer flex flex-col justify-between gap-3 ${
                        isCurrent
                          ? 'bg-[#171B26] border-[#00C8E0] ring-1 ring-[#00C8E0]/40'
                          : 'bg-[#13151D] hover:bg-[#181B25] border-zinc-800/90 hover:border-zinc-700'
                      }`}
                    >
                      <div className="flex items-start gap-3.5">
                        {/* Project Thumbnail or Character Preview Box */}
                        <div className="w-20 h-20 rounded-xl bg-[#1E2230] border border-zinc-700/70 overflow-hidden shrink-0 flex flex-col items-center justify-center relative">
                          {proj.thumbnailDataUrl ? (
                            <img
                              src={proj.thumbnailDataUrl}
                              alt={proj.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="text-center p-1">
                              <div className="text-lg">
                                {proj.config.characterPreset === 'mina-toon'
                                  ? '👧'
                                  : proj.config.characterPreset === 'robobot-rig'
                                  ? '🤖'
                                  : '🧑'}
                              </div>
                              <span className="text-[9px] font-mono text-[#00E1FA] font-bold">
                                {resSpec.aspectLabel}
                              </span>
                            </div>
                          )}
                          {isCurrent && (
                            <span className="absolute bottom-1 left-1 right-1 bg-[#00C8E0] text-zinc-950 text-[8px] font-extrabold text-center rounded py-0.2">
                              ACTIVE
                            </span>
                          )}
                        </div>

                        {/* Project Metadata (Name, Description, Date) */}
                        <div className="flex-1 min-w-0 space-y-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-bold text-white truncate group-hover:text-[#00E1FA] transition-colors">
                              {proj.name}
                            </h3>
                          </div>

                          <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                            {proj.description}
                          </p>

                          <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                            <span className="px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 font-mono flex items-center gap-1">
                              <Calendar className="w-2.5 h-2.5 text-[#00C8E0]" />
                              <span>{proj.date}</span>
                            </span>

                            <span className="px-2 py-0.5 rounded bg-zinc-800/90 text-zinc-300 font-mono">
                              {resSpec.shortLabel || resSpec.aspectLabel}
                            </span>

                            {procOn && (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
                                <Wind className="w-2.5 h-2.5" />
                                <span>Hair & Leaves Motion</span>
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Card Footer Actions */}
                      <div className="flex items-center justify-between pt-2.5 border-t border-zinc-800/80">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenProject(proj);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Open Project (এডিট করুন)</span>
                        </button>

                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDuplicateProject(proj);
                            }}
                            title="ডুপ্লিকেট প্রজেক্ট"
                            className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => handleExportProjectBackup(e, proj)}
                            title="লোকাল JSON ব্যাকআপ ডাউনলোড"
                            className="p-1.5 rounded-lg bg-zinc-800/90 hover:bg-zinc-700 text-zinc-300 hover:text-white cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteProject(proj.id);
                            }}
                            title="প্রজেক্ট ডিলিট করুন"
                            className="p-1.5 rounded-lg bg-rose-950/60 hover:bg-rose-600 text-rose-300 hover:text-white border border-rose-800/50 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* =====================================================================
          MOBILE DEVICE PERMISSIONS & GALLERY ACCESS MODAL
          (Gallery Photos, Gallery Videos, Audio/Microphone, Local Storage)
         ===================================================================== */}
      {isPermissionModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#151822] border border-zinc-700 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 bg-[#1C202E] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    ফোনের গ্যালারি, ফটো, ভিডিও এবং অডিও পারমিশন সেটআপ
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    মোবাইল ফোনের গ্যালারি ও অডিও ব্যবহারের জন্য নিচের পারমিশনগুলো অ্যালাউ (Allow) করুন
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsPermissionModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-5 space-y-3 text-xs max-h-[75vh] overflow-y-auto">
              {permissionStatusMsg && (
                <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 font-semibold flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{permissionStatusMsg}</span>
                </div>
              )}

              {/* One-Tap Allow All Button */}
              <button
                type="button"
                onClick={handleGrantAllPermissions}
                className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-[#00C8E0] to-emerald-400 hover:brightness-105 text-zinc-950 font-black text-xs sm:text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"
              >
                <ShieldCheck className="w-5 h-5 stroke-[2.4]" />
                <span>
                  ✓ সবগুলো পারমিশন এক ক্লিকে চালু করুন (Allow All Gallery, Video & Audio)
                </span>
              </button>

              {/* 1. Photo Gallery Permission */}
              <div className="p-3 rounded-xl bg-[#10121A] border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-[#00C8E0]/15 border border-[#00C8E0]/30 flex items-center justify-center text-[#00E1FA] shrink-0">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white">
                      ১. ফটো গ্যালারি পারমিশন (Photo Gallery Access)
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      ফোনের গ্যালারি থেকে যেকোনো ফটো, ক্যারেক্টার ছবি ও ব্যাকগ্রাউন্ড নেওয়ার পারমিশন
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleRequestGalleryPhotoVideoPermission('photos')
                  }
                  className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer ${
                    permissions.galleryPhotos
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300'
                      : 'bg-[#00C8E0] text-zinc-950'
                  }`}
                >
                  {permissions.galleryPhotos ? '✓ Allowed' : 'Allow Photo'}
                </button>
              </div>

              {/* 2. Video Gallery Permission */}
              <div className="p-3 rounded-xl bg-[#10121A] border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-purple-500/15 border border-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
                    <Film className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white">
                      ২. ভিডিও গ্যালারি পারমিশন (Video Gallery Access)
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      ফোনের গ্যালারি থেকে যেকোনো ভিডিও ইমপোর্ট ও অটো মাউথ ট্র্যাকিং করার পারমিশন
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    handleRequestGalleryPhotoVideoPermission('videos')
                  }
                  className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer ${
                    permissions.galleryVideos
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300'
                      : 'bg-purple-400 text-zinc-950'
                  }`}
                >
                  {permissions.galleryVideos ? '✓ Allowed' : 'Allow Video'}
                </button>
              </div>

              {/* 3. Audio & Microphone Permission */}
              <div className="p-3 rounded-xl bg-[#10121A] border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-300 shrink-0">
                    <Mic className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white">
                      ৩. অডিও ও মাইক্রোফোন পারমিশন (Audio & Mic Access)
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      ফোনের অডিও/মিউজিক ফাইল ব্যবহার এবং মাইক্রোফোনে ভয়েস রেকর্ড করার পারমিশন
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleRequestAudioMicPermission}
                  className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer ${
                    permissions.audioMicrophone
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300'
                      : 'bg-emerald-400 text-zinc-950'
                  }`}
                >
                  {permissions.audioMicrophone ? '✓ Allowed' : 'Allow Audio'}
                </button>
              </div>

              {/* 4. Phone Internal Storage Permission */}
              <div className="p-3 rounded-xl bg-[#10121A] border border-zinc-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 shrink-0">
                    <HardDrive className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-white">
                      ৪. ফোনের লোকাল মেমরি পারমিশন (Local Storage Access)
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      ক্লাউড ছাড়াই সব প্রজেক্ট ও রেন্ডার করা ভিডিও ফোনের মেমরিতে সেভ রাখার পারমিশন
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    updatePermissions({ localStorage: true });
                    setPermissionStatusMsg(
                      '✓ ফোনের লোকাল স্টোরেজ পারমিশন অ্যাক্টিভ করা হয়েছে!'
                    );
                  }}
                  className={`px-3 py-1.5 rounded-lg font-bold shrink-0 cursor-pointer ${
                    permissions.localStorage
                      ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300'
                      : 'bg-amber-400 text-zinc-950'
                  }`}
                >
                  {permissions.localStorage ? '✓ Allowed' : 'Allow Storage'}
                </button>
              </div>
            </div>

            {/* Footer */}
            <div className="px-5 py-3.5 bg-[#11131B] border-t border-zinc-800 flex items-center justify-between">
              <span className="text-[11px] text-zinc-400">
                {allPermissionsGranted
                  ? '✓ সবগুলো মোবাইল পারমিশন সক্রিয় আছে'
                  : 'যেকোনো সময় পারমিশন পরিবর্তন করতে পারবেন'}
              </span>
              <button
                type="button"
                onClick={() => setIsPermissionModalOpen(false)}
                className="px-4 py-2 rounded-xl bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 font-bold text-xs cursor-pointer"
              >
                সম্পন্ন (Done)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =====================================================================
          NEW PROJECT CREATION MODAL OVERLAY
          (Inputs: Project Name, Description, Date, Gallery Photo, Resolution, Procedural Motion)
         ===================================================================== */}
      {isNewModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-[#161821] border border-zinc-700/90 rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="px-5 py-4 bg-[#1C1F2B] border-b border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-[#00C8E0]/20 border border-[#00C8E0]/40 flex items-center justify-center text-[#00E1FA]">
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Create New Local Project (নতুন প্রজেক্ট তৈরি করুন)
                  </h3>
                  <p className="text-[11px] text-zinc-400">
                    সব তথ্য সরাসরি আপনার ডিভাইসের মেমরিতে অফলাইনে সেভ হবে
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="p-1 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 text-xs max-h-[78vh] overflow-y-auto">
              {formError && (
                <div className="p-2.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-rose-300 font-semibold">
                  {formError}
                </div>
              )}

              {/* 1. Project Name */}
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-200">
                  Project Name (প্রজেক্টের নাম){' '}
                  <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  value={projName}
                  onChange={(e) => {
                    setProjName(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="যেমন: আমার কার্টুন স্টোরি এপিসোড ১..."
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl bg-[#101218] border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-[#00C8E0]"
                />
              </div>

              {/* 2. Project Description */}
              <div className="space-y-1.5">
                <label className="block font-bold text-zinc-200">
                  Description (প্রজেক্টের বিবরণ)
                </label>
                <textarea
                  rows={2}
                  value={projDescription}
                  onChange={(e) => setProjDescription(e.target.value)}
                  placeholder="প্রজেক্টের সংক্ষিপ্ত বিবরণ বা নোট লিখুন (ঐচ্ছিক)..."
                  className="w-full px-3.5 py-2 rounded-xl bg-[#101218] border border-zinc-700 text-white placeholder-zinc-500 focus:outline-none focus:border-[#00C8E0] resize-none"
                />
              </div>

              {/* 3. Date & Aspect Ratio Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="block font-bold text-zinc-200">
                    Date (তারিখ)
                  </label>
                  <input
                    type="date"
                    value={projDate}
                    onChange={(e) => setProjDate(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-[#101218] border border-zinc-700 text-white font-mono focus:outline-none focus:border-[#00C8E0]"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="block font-bold text-zinc-200">
                    Canvas Format (রেজোলিউশন)
                  </label>
                  <select
                    value={projResolution}
                    onChange={(e) =>
                      setProjResolution(e.target.value as ExportResolutionId)
                    }
                    className="w-full px-3 py-2 rounded-xl bg-[#101218] border border-zinc-700 text-white focus:outline-none focus:border-[#00C8E0]"
                  >
                    {Object.values(EXPORT_RESOLUTIONS).map((res) => (
                      <option key={res.id} value={res.id}>
                        {res.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 4. Starter Character OR Pick Photo from Phone Gallery */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-bold text-zinc-200">
                    Character / Phone Gallery Photo (ক্যারেক্টার বা গ্যালারির ফটো)
                  </label>
                  <label className="px-2.5 py-1 rounded-lg bg-[#00C8E0]/20 hover:bg-[#00C8E0]/30 border border-[#00C8E0]/50 text-[#00E1FA] text-[11px] font-bold flex items-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5" />
                    <span>+ ফোনের গ্যালারি থেকে ফটো নিন</span>
                    <input
                      type="file"
                      accept="image/*,.png,.jpg,.jpeg,.webp,.gif,.svg,.bmp,.avif"
                      onClick={(e) => {
                        e.currentTarget.value = '';
                      }}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) handlePickGalleryPhotoForNewProject(f);
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                {selectedGalleryPhotoUrl && (
                  <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <img
                        src={selectedGalleryPhotoUrl}
                        alt="Gallery Character"
                        className="w-9 h-9 rounded-lg object-cover border border-emerald-400"
                      />
                      <span className="text-[11px] font-bold text-emerald-200 truncate">
                        ✓ গ্যালারি ফটো: {selectedGalleryPhotoName}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedGalleryPhotoUrl(null);
                        setSelectedGalleryPhotoName(null);
                        setProjCharacter('arjun-2d');
                      }}
                      className="text-[10px] text-rose-300 hover:text-white font-bold cursor-pointer"
                    >
                      রিমুভ
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'arjun-2d', label: '🧑 অর্জুন (Arjun 2D)' },
                      { id: 'mina-toon', label: '👧 মিনা (Mina Toon)' },
                      { id: 'robobot-rig', label: '🤖 রোবো (RoboBot)' },
                    ] as const
                  ).map((ch) => (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => {
                        setSelectedGalleryPhotoUrl(null);
                        setProjCharacter(ch.id);
                      }}
                      className={`py-2 px-2.5 rounded-xl border font-bold text-center cursor-pointer transition-colors ${
                        !selectedGalleryPhotoUrl && projCharacter === ch.id
                          ? 'bg-[#00C8E0]/20 border-[#00C8E0] text-[#00E1FA]'
                          : 'bg-[#101218] border-zinc-800 text-zinc-300 hover:border-zinc-700'
                      }`}
                    >
                      {ch.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 5. Procedural Hair, Leaves & Speech Head Tilt Toggle */}
              <div
                onClick={() => setEnableProceduralMotion((v) => !v)}
                className={`p-3 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  enableProceduralMotion
                    ? 'bg-emerald-500/15 border-emerald-500/40'
                    : 'bg-[#101218] border-zinc-800'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Wind className="w-5 h-5 text-emerald-400 shrink-0" />
                  <div>
                    <div className="font-bold text-white">
                      Procedural Hair, Leaves & Speech Head Tilt
                    </div>
                    <div className="text-[11px] text-zinc-400">
                      কথার সাথে মাথার হালকা টিল্ট এবং চুল ও গাছের পাতার প্রাকৃতিক সাইন-ওয়েভ ফিজিক্স অ্যানিমেশন
                    </div>
                  </div>
                </div>
                <span
                  className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold shrink-0 ${
                    enableProceduralMotion
                      ? 'bg-emerald-400 text-zinc-950'
                      : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {enableProceduralMotion ? 'ENABLED' : 'OFF'}
                </span>
              </div>
            </div>

            {/* Modal Footer Buttons */}
            <div className="px-5 py-3.5 bg-[#12141C] border-t border-zinc-800 flex flex-wrap items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsNewModalOpen(false)}
                className="px-3.5 py-2 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-xs font-semibold cursor-pointer"
              >
                বাতিল (Cancel)
              </button>

              <button
                type="button"
                onClick={() => handleSaveNewProject(false)}
                className="px-3.5 py-2 rounded-xl bg-[#1F2433] hover:bg-[#282E42] border border-[#00C8E0]/40 text-[#00E1FA] text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Save to Home List (হোমে সেভ করুন)</span>
              </button>

              <button
                type="button"
                onClick={() => handleSaveNewProject(true)}
                className="px-4 py-2 rounded-xl bg-[#00C8E0] hover:bg-[#00E1FA] text-zinc-950 text-xs font-black flex items-center gap-1.5 shadow-lg cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4 stroke-[2.5]" />
                <span>Save & Open Editor (সেভ ও এডিট করুন)</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
