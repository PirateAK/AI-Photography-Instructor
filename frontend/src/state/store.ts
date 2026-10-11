// Global app state (zustand). Session image lives in memory only;
// camera choice, per-camera settings and preferences persist in localStorage.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { analyzePhoto, fetchExif, sendChat as apiSendChat, type ChallengeContext } from "../lib/api";
import { defaultSettings, getCamera, getCameras, baselineFromExif, snapToCamera } from "../lib/camera";
import {
  clampApertureToLens,
  defaultLensForCamera,
  focalZoomRatio,
  getLensById,
  lensApertureDef,
  lensesForCamera,
  shakeThresholdSec,
} from "../lib/lenses";
import { saveHistorySession } from "../lib/history";
import type { HistData } from "../lib/histogram";
import {
  addToGallery as idbAddToGallery,
  getGalleryBlob,
  listGallery,
  removeGallery,
  restoreGalleryEntry,
  type GalleryEntry,
  type GalleryMeta,
  type GallerySkip,
} from "../lib/gallery";
import { styleCatalog, type ShootingStyle } from "../lib/styles";
import { fetchStyles, generateStyleDraft, removeStyle, upsertStyle } from "../lib/styleAdmin";
import { generateStyleLessons as apiGenerateStyleLessons } from "../lib/styleAdmin";
import type { StyleLesson } from "../lib/styles";
import { courses as bundledCourses, unlockAllPaid, isValidCode, isInstructorCode } from "../lib/training";
import type { TrainingCourse } from "../lib/training";
import { FALLBACK_TIPS, tipFor } from "../lib/tips";
import { activeHoliday, challengeAfterShot, holidayById } from "../lib/holidays";
import type {
  AnalysisResult,
  CameraModel,
  ChatMessage,
  CoachResponse,
  ExifInfo,
  LogEntry,
  RecommendedSettings,
  Settings,
} from "../lib/types";

/** As-shot settings snapped onto a camera's supported stops (null if no EXIF). */
function exifSettings(cam: CameraModel, exif: ExifInfo | null): Settings | null {
  if (!exif || (!exif.iso && !exif.shutter_speed && !exif.aperture)) return null;
  const wanted: Settings = {};
  if (exif.iso) wanted.iso = String(exif.iso);
  if (exif.shutter_speed) wanted.shutter_speed = exif.shutter_speed;
  if (exif.aperture) wanted.aperture = exif.aperture;
  return snapToCamera(cam, wanted);
}

interface PhotoState {
  screen: "upload" | "workspace" | "settings" | "classes" | "stylemanager" | "coursemanager" | "progress" | "instructor";
  file: File | null;
  dataUrl: string;
  exif: ExifInfo | null;

  cameraId: string;
  settingsByCamera: Record<string, Settings>;

  analysis: AnalysisResult | null;
  coachMeta: { provider: string; cached: boolean; notice?: string | null } | null;
  chat: string | null;
  analyzing: boolean;
  analyzeError: string | null;

  log: LogEntry[];
  beginner: boolean;
  intent: string;
  styleId: string;
  undoSnapshot: Settings | null;

  highlightSetting: string | null;
  lastChangedSetting: { id: string; ts: number } | null;
  focusPoint: { x: number; y: number };
  histData: HistData | null;

  chatMessages: ChatMessage[];
  chatSending: boolean;
  chatNotice: string | null;

  unlockedCourses: string[];
  instructorUnlocked: boolean;
  galleryItems: GalleryMeta[];
  lastRemovedGallery: GalleryEntry | null;
  photoLoading: boolean;
  courseToOpen: string | null;

  styles: ShootingStyle[];
  deviceId: string;
  lensByCamera: Record<string, string>;
  courses: TrainingCourse[];
  completedLessons: string[]; // cameraId -> lensId

  // 🎄 holiday challenges (activeChallengeId survives its banner window until dismissed)
  activeChallengeId: string | null;
  challengeShots: Record<string, number>;
  completedChallenges: string[];

  // actions
  loadFile: (file: File) => Promise<void>;
  setCamera: (id: string) => void;
  setStyle: (id: string) => void;
  updateSetting: (id: string, value: string | number) => void;
  resetSettings: () => void;
  setBeginner: (b: boolean) => void;
  setIntent: (s: string) => void;
  goUpload: () => void;
  goSettings: () => void;
  startAnalysis: () => void;
  applyRecommended: (recs: RecommendedSettings) => void;
  applyRecipe: () => void;
  undoApply: () => void;
  clearError: () => void;
  setHighlight: (id: string | null) => void;
  setFocusPoint: (p: { x: number; y: number }) => void;
  setHistData: (h: HistData | null) => void;
  setLens: (id: string) => void;
  beginUndoable: () => void;
  askCoach: (message: string) => Promise<void>;
  openWorkspace: () => void;
  goClasses: () => void;
  goStyleManager: () => void;
  goCourseManager: () => void;
  goProgress: () => void;
  goInstructor: () => void;
  goCourse: (courseId: string) => void;
  unlockInstructor: (code: string) => boolean;
  lockInstructor: () => void;
  loadGallery: () => Promise<void>;
  addToGallery: (
    files: File[],
  ) => Promise<{ added: number; evicted: number; skipped: number; failures: GallerySkip[] }>;
  removeFromGallery: (id: number) => Promise<void>;
  undoGalleryRemove: () => Promise<void>;
  loadFromGallery: (id: number) => Promise<void>;
  loadDemoPhoto: () => Promise<boolean>;
  reloadStyles: () => Promise<void>;
  saveStyle: (style: ShootingStyle) => Promise<void>;
  deleteStyle: (id: string) => Promise<void>;
  draftStyleWithAI: (name: string) => Promise<ShootingStyle>;
  generateStyleLessons: (
    styleId: string,
  ) => Promise<{ draft_lessons: StyleLesson[]; validation_errors: string[] }>;
  reloadCourses: () => Promise<void>;
  saveCourse: (course: TrainingCourse) => Promise<void>;
  deleteCourse: (id: string) => Promise<void>;
  draftCourseWithAI: (topic: string) => Promise<TrainingCourse>;
  toggleLessonComplete: (lessonId: string) => void;
  unlockWithCode: (code: string) => boolean;
  acceptChallenge: (id: string) => void;
  dismissChallenge: () => void;
  noteChallengeShot: () => boolean;
  challengeContext: () => ChallengeContext | null;
  practicePreset: (preset: Record<string, string | number>, brief: string) => Promise<void>;
}

let logId = 1;
const pushLog = (log: LogEntry[], entry: Omit<LogEntry, "id">): LogEntry[] =>
  [{ ...entry, id: logId++ }, ...log].slice(0, 80);

function readFile(dataUrl: string): Promise<File> {
  return fetch(dataUrl)
    .then((r) => r.blob())
    .then((blob) => new File([blob], "photo.jpg", { type: blob.type || "image/jpeg" }));
}

export const useStore = create<PhotoState>()(
  persist(
    (set, get) => ({
      screen: "upload",
      file: null,
      dataUrl: "",
      exif: null,

      cameraId: getCameras()[0]?.id ?? "canon_eos_rebel_sl3",
      settingsByCamera: {},

      analysis: null,
      coachMeta: null,
      chat: null,
      analyzing: false,
      analyzeError: null,

      log: [],
      beginner: true,
      intent: "",
      styleId: "",
      undoSnapshot: null,

      highlightSetting: null,
      lastChangedSetting: null,
      focusPoint: { x: 0.5, y: 0.5 },
      histData: null,

      chatMessages: [],
      chatSending: false,
      chatNotice: null,

      unlockedCourses: [],
      instructorUnlocked: false,
      galleryItems: [],
      lastRemovedGallery: null,
      photoLoading: false,
      courseToOpen: null,

      styles: styleCatalog.styles,
      deviceId:
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `dev-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`) as string,
      lensByCamera: {},
      courses: bundledCourses,
      completedLessons: [],

      activeChallengeId: null,
      challengeShots: {},
      completedChallenges: [],

      loadFile: async (file) => {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(String(reader.result));
          reader.onerror = () => reject(new Error("Could not read file"));
          reader.readAsDataURL(file);
        });
        let exif: ExifInfo | null = null;
        try {
          exif = await fetchExif(file);
        } catch {
          exif = null; // non-fatal: EXIF is optional
        }
        const cam = getCamera(get().cameraId);
        const asShot = cam ? exifSettings(cam, exif) : null;
        set({
          file,
          dataUrl,
          exif,
          analysis: null,
          chat: null,
          coachMeta: null,
          analyzeError: null,
          undoSnapshot: null,
          log: [],
          // toolbar starts where reality started: as-shot settings from EXIF
          settingsByCamera: cam
            ? { ...get().settingsByCamera, [get().cameraId]: asShot ?? defaultSettings(cam) }
            : get().settingsByCamera,
        });
        // remind which lens is still mounted — its zoom/IS effects apply to the NEW photo
        const mountedLens = getLensById(get().lensByCamera[get().cameraId]);
        if (mountedLens && cam) {
          const zoom = focalZoomRatio(mountedLens, exif);
          const zoomNote =
            zoom > 1.01
              ? `framing is now ~${zoom.toFixed(1)}× tighter than this photo's ${exif?.focal_length ?? "unknown"} shot`
              : `framing matches this photo's focal length (${exif?.focal_length ?? "unknown"})`;
          set({
            log: pushLog(get().log, {
              kind: "tip",
              text: `🔍 Still mounted: ${mountedLens.model} — ${zoomNote}.`,
              why: "Lenses stay mounted between photos, like a real camera. Switch or remove it in the Lens group on the toolbar.",
            }),
          });
        }
      },

      setCamera: (id) => {
        const { settingsByCamera, cameraId, lensByCamera } = get();
        if (id === cameraId) return;
        const cam = getCamera(id);
        if (!cam) return;
        const asShot = exifSettings(cam, get().exif);
        // a persisted lens may not fit the new body (e.g. switching to a phone)
        const nextLens = { ...lensByCamera };
        let lensNote = "";
        if (nextLens[id] && !lensesForCamera(cam).some((l) => l.id === nextLens[id])) {
          delete nextLens[id];
          lensNote = " No lens carried over — this body has none.";
        }
        set({
          cameraId: id,
          lensByCamera: nextLens,
          settingsByCamera: {
            ...settingsByCamera,
            [id]: settingsByCamera[id] ?? asShot ?? defaultSettings(cam),
          },
          undoSnapshot: null,
          log: pushLog(get().log, {
            kind: "system",
            text: `Switched camera to ${cam.brand} ${cam.model} — toolbar rebuilt from camera_models.json.${lensNote}`,
          }),
        });
      },

      setStyle: (id) => {
        const state = get();
        if (id === state.styleId) return;
        const style = state.styles.find((s) => s.id === id);
        set({
          styleId: id,
          log: pushLog(state.log, {
            kind: "system",
            text: style
              ? `Style: ${style.emoji} ${style.label} — ${style.recipe.summary}`
              : "Style cleared — general guidance.",
            why: style?.recipe.why,
          }),
        });
      },

      updateSetting: (id, value) => {
        const state = get();
        const cam = getCamera(state.cameraId);
        if (!cam) return;
        const current = state.settingsByCamera[state.cameraId] ?? defaultSettings(cam);
        const oldValue = current[id];
        if (String(oldValue) === String(value)) return;

        const baseline = baselineFromExif(cam, state.exif);
        const tip = tipFor(cam, { ...current }, id, oldValue, value);
        set({
          settingsByCamera: {
            ...state.settingsByCamera,
            [state.cameraId]: { ...current, [id]: value },
          },
          lastChangedSetting: { id, ts: Date.now() },
          log: tip
            ? pushLog(state.log, { kind: "tip", text: tip.short, why: tip.why })
            : state.log,
        });
      },

      resetSettings: () => {
        const state = get();
        const cam = getCamera(state.cameraId);
        if (!cam) return;
        // Reset returns to the as-shot settings when EXIF is available —
        // that's the photo's "reality" — otherwise the camera's defaults.
        const restored = exifSettings(cam, state.exif) ?? defaultSettings(cam);
        set({
          settingsByCamera: {
            ...state.settingsByCamera,
            [state.cameraId]: restored,
          },
          undoSnapshot: null,
          log: pushLog(state.log, {
            kind: "system",
            text: "Settings reset — back to the as-shot values from the photo's EXIF.",
          }),
        });
      },

      setBeginner: (b) => set({ beginner: b }),
      setIntent: (s) => set({ intent: s }),
      goUpload: () => set({ screen: "upload" }),
      goSettings: () => set({ screen: "settings" }),
      openWorkspace: () => {
        if (get().dataUrl) {
          set({ screen: "workspace" });
          // entering the workspace should always start at the preview — the SPA
          // otherwise inherits the home screen's scroll position on phones
          window.scrollTo(0, 0);
        }
      },

      setHighlight: (id) => set({ highlightSetting: id }),
      setHistData: (h) => set({ histData: h }),
      setFocusPoint: (p) => set({ focusPoint: p }),

      setLens: (id) => {
        const state = get();
        const cam = getCamera(state.cameraId);
        if (!cam) return;
        const lens = getLensById(id);
        if (lens && !lensesForCamera(cam).some((l) => l.id === lens.id)) {
          set({
            log: pushLog(state.log, {
              kind: "system",
              text: `The ${lens.model} uses a different mount — it doesn't fit a ${cam.model}.`,
            }),
          });
          return;
        }
        const current = state.settingsByCamera[state.cameraId] ?? defaultSettings(cam);
        const next = { ...current };
        let extra = "";
        if (lens) {
          const clampedAperture = clampApertureToLens(String(current.aperture ?? ""), lens);
          if (clampedAperture !== String(current.aperture ?? "")) {
            next.aperture = clampedAperture;
            extra += ` Aperture clamped to ${clampedAperture} — this lens can't open that wide.`;
          }
          const zoom = focalZoomRatio(lens, state.exif);
          if (zoom > 1.01) {
            extra += ` Framing tightens ~${zoom}× versus the as-shot focal length.`;
          } else if (state.exif?.focal_length) {
            extra += " Wider than the shot — the preview can't reveal scene outside the frame, but shake tolerance improves.";
          }
          if (lens.image_stabilization) {
            extra += " Stabilization buys ~4 stops of handheld shake.";
          }
        }
        set({
          lensByCamera: { ...state.lensByCamera, [state.cameraId]: id },
          settingsByCamera: { ...state.settingsByCamera, [state.cameraId]: next },
          log: pushLog(state.log, {
            kind: "tip",
            text: lens ? `🔍 Lens mounted: ${lens.model}. ${lens.note}` : "Lens removed — body only.",
            why: extra || undefined,
          }),
        });
      },

      goClasses: () => set({ screen: "classes" }),
      goStyleManager: () => set({ screen: "stylemanager" }),
      goCourseManager: () => set({ screen: "coursemanager" }),
      goProgress: () => set({ screen: "progress" }),
      goInstructor: () => set({ screen: "instructor" }),
      goCourse: (courseId) => set({ screen: "classes", courseToOpen: courseId }),
      unlockInstructor: (code) => {
        if (!isInstructorCode(code)) return false;
        set({
          instructorUnlocked: true,
          intent: "",
          screen: "instructor",
          log: pushLog(get().log, {
            kind: "system",
            text: "🛠 Instructor Dashboard unlocked — shooting styles and training classes are yours to edit.",
          }),
        });
        return true;
      },
      lockInstructor: () => set({ instructorUnlocked: false, screen: "upload" }),

      loadGallery: async () => {
        try {
          set({ galleryItems: await listGallery() });
        } catch {
          /* gallery stays empty — IDB unavailable */
        }
      },

      addToGallery: async (files) => {
        const { added, evicted, skipped, failures } = await idbAddToGallery(files);
        await get().loadGallery();
        if (evicted > 0) {
          set({
            log: pushLog(get().log, {
              kind: "system",
              text: `Gallery is capped at 100 — trimmed the ${evicted} oldest photo${evicted === 1 ? "" : "s"}.`,
            }),
          });
        }
        return { added, evicted, skipped, failures };
      },

      removeFromGallery: async (id) => {
        const removed = await removeGallery(id);
        if (!removed) return;
        set({ lastRemovedGallery: removed, galleryItems: get().galleryItems.filter((g) => g.id !== id) });
      },

      undoGalleryRemove: async () => {
        const removed = get().lastRemovedGallery;
        if (!removed) return;
        await restoreGalleryEntry(removed);
        set({ lastRemovedGallery: null });
        await get().loadGallery();
      },

      loadFromGallery: async (id) => {
        const blob = await getGalleryBlob(id);
        if (!blob) return;
        const meta = get().galleryItems.find((g) => g.id === id);
        const file = new File([blob], meta?.name ?? "photo.jpg", { type: blob.type || "image/jpeg" });
        // visible feedback across the screen change: IDB read + decode takes a
        // beat on phones, and silence reads as "broken"
        set({ photoLoading: true });
        try {
          await get().loadFile(file);
          get().openWorkspace();
        } finally {
          set({ photoLoading: false });
        }
      },

      loadDemoPhoto: async () => {
        try {
          const res = await fetch("/demo/sample.jpg");
          if (!res.ok) return false;
          const blob = await res.blob();
          await get().loadFile(new File([blob], "demo-photo.jpg", { type: "image/jpeg" }));
          return true;
        } catch {
          return false;
        }
      },

      reloadStyles: async () => {
        try {
          const styles = await fetchStyles();
          set((state) => ({
            styles,
            // a persisted styleId may reference a retired style — reset cleanly
            styleId: styles.some((s) => s.id === state.styleId) ? state.styleId : "",
          }));
        } catch {
          /* keep bundled catalog */
        }
      },

      saveStyle: async (style) => {
        const styles = await upsertStyle(style);
        set({ styles });
      },

      deleteStyle: async (id) => {
        const styles = await removeStyle(id);
        set({ styles, styleId: get().styleId === id ? "" : get().styleId });
      },

      draftStyleWithAI: async (name) => {
        const { draft } = await generateStyleDraft(name);
        return draft;
      },

      generateStyleLessons: async (styleId) => {
        // returns drafts only — the Style Manager edit form owns merging + approval,
        // mirroring how draftStyleWithAI returns a draft without touching the catalog
        return apiGenerateStyleLessons(styleId);
      },

      reloadCourses: async () => {
        try {
          const res = await fetch("/api/courses");
          if (!res.ok) return;
          const data = await res.json();
          set({ courses: data.courses });
        } catch {
          /* keep bundled catalog */
        }
      },

      saveCourse: async (course) => {
        const res = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "upsert", course }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? "Could not save course");
        }
        const data = await res.json();
        set({ courses: data.courses });
      },

      deleteCourse: async (id) => {
        const res = await fetch("/api/courses", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", course_id: id }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.detail ?? "Could not delete course");
        }
        const data = await res.json();
        set({ courses: data.courses });
      },

      draftCourseWithAI: async (topic) => {
        const res = await fetch("/api/courses/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ topic }),
        });
        const body = await res.json().catch(() => null);
        if (!res.ok) throw new Error(body?.detail ?? "AI draft failed");
        return body.draft as TrainingCourse;
      },

      toggleLessonComplete: (lessonId) => {
        const state = get();
        const done = state.completedLessons.includes(lessonId);
        set({
          completedLessons: done
            ? state.completedLessons.filter((id) => id !== lessonId)
            : [...state.completedLessons, lessonId],
        });
      },

      unlockWithCode: (code) => {
        if (!isValidCode(code)) return false;
        const state = get();
        const unlocked = Array.from(new Set([...state.unlockedCourses, ...unlockAllPaid()]));
        set({
          unlockedCourses: unlocked,
          log: pushLog(state.log, {
            kind: "system",
            text: "🎟️ Redemption code accepted — all purchased classes are unlocked. Happy learning!",
          }),
        });
        return true;
      },

      // ---- holiday challenges ----
      challengeContext: () => {
        const id = get().activeChallengeId;
        const holiday = holidayById(id);
        if (!holiday) return null;
        return { id: holiday.id, title: holiday.challenge.title, goal: holiday.challenge.goal };
      },

      acceptChallenge: (id) => {
        const holiday = holidayById(id);
        if (!holiday) return;
        set({
          activeChallengeId: id,
          log: pushLog(get().log, {
            kind: "system",
            text: `🎯 Challenge accepted — ${holiday.emoji} "${holiday.challenge.title}". Bring back 3 shots for challenge review.`,
          }),
        });
      },

      dismissChallenge: () => set({ activeChallengeId: null }),

      noteChallengeShot: () => {
        const id = get().activeChallengeId;
        if (!id) return false;
        const r = challengeAfterShot(get().challengeShots, get().completedChallenges, id);
        set({ challengeShots: r.shots, completedChallenges: r.completed });
        return r.justCompleted;
      },

      practicePreset: async (preset, brief) => {
        const state = get();
        if (!state.dataUrl) {
          // No photo in this session — load the built-in demo photo first,
          // so "Load in simulator" always lands in a working simulator.
          const ok = await get().loadDemoPhoto();
          if (!ok) {
            set({
              log: pushLog(state.log, {
                kind: "system",
                text: "Couldn't load the demo photo — upload any image, then try the drill again.",
              }),
            });
            return;
          }
        }
        const state2 = get();
        const cam = getCamera(state2.cameraId);
        if (!cam) return;
        const current = state2.settingsByCamera[state2.cameraId] ?? defaultSettings(cam);
        const snapped = snapToCamera(cam, preset as Settings);
        set({
          settingsByCamera: { ...state2.settingsByCamera, [state2.cameraId]: { ...current, ...snapped } },
          undoSnapshot: current,
          highlightSetting: null,
          screen: "workspace",
          log: pushLog(state2.log, {
            kind: "system",
            text: `🎓 Class practice loaded — ${brief}`,
          }),
        });
      },

      beginUndoable: () => {
        const state = get();
        const cam = getCamera(state.cameraId);
        if (!cam) return;
        set({ undoSnapshot: state.settingsByCamera[state.cameraId] ?? defaultSettings(cam) });
      },

      askCoach: async (message) => {
        const state = get();
        if (!message.trim() || state.chatSending) return;
        const userMsg: ChatMessage = { role: "user", text: message.trim() };
        const history = [...state.chatMessages, userMsg];
        set({ chatMessages: history, chatSending: true, chatNotice: null });
        try {
          let file = state.file;
          if (!file && state.dataUrl) file = await readFile(state.dataUrl);
          const res = await apiSendChat(
            message.trim(),
            history,
            state.cameraId,
            state.settingsByCamera[state.cameraId] ?? {},
            state.styleId,
            file,
            state.challengeContext(),
          );
          set({
            chatMessages: [...history, { role: "assistant", text: res.reply }],
            chatSending: false,
            chatNotice: res.notice ?? null,
          });
        } catch (err) {
          set({
            chatSending: false,
            chatNotice: err instanceof Error ? err.message : "Chat failed",
          });
        }
      },

      startAnalysis: () => {
        const state = get();
        set({ screen: "workspace", analyzing: true, analyzeError: null });
        (async () => {
          try {
            let file = state.file;
            if (!file && state.dataUrl) file = await readFile(state.dataUrl);
            if (!file) throw new Error("No image loaded — go back and upload one.");
            const response: CoachResponse = await analyzePhoto(
              file,
              get().cameraId,
              get().settingsByCamera[get().cameraId] ?? {},
              get().intent,
              get().styleId,
              get().challengeContext(),
            );
            set({
              analysis: response.analysis,
              chat: response.chat_response,
              coachMeta: { provider: response.provider, cached: response.cached, notice: response.notice },
              analyzing: false,
              log: pushLog(get().log, {
                kind: "analysis",
                text: response.chat_response,
              }),
            });

            // challenge progress: every analyze while a challenge is active counts
            if (get().noteChallengeShot()) {
              const done = holidayById(get().activeChallengeId);
              set({
                log: pushLog(get().log, {
                  kind: "system",
                  text: `🎯 Challenge complete — "${done?.challenge.title}" — badge earned!`,
                }),
              });
            }

            // auto-save to per-device history (best-effort, never blocks the UI)
            const state2 = get();
            const cam2 = getCamera(state2.cameraId);
            if (file) {
              void saveHistorySession(
                state2.deviceId,
                {
                  camera_id: state2.cameraId,
                  camera_label: cam2 ? `${cam2.brand} ${cam2.model}` : "",
                  settings: JSON.stringify(state2.settingsByCamera[state2.cameraId] ?? {}),
                  exif: JSON.stringify(state2.exif ?? {}),
                  style_id: state2.styleId,
                  intent: state2.intent,
                  score: String(response.analysis.overall_score),
                  summary: response.chat_response,
                  issues: JSON.stringify(response.analysis.issues),
                  provider: response.provider,
                },
                file,
              ).catch(() => {
                /* history is a bonus — ignore failures */
              });
            }
          } catch (err) {
            set({
              analyzing: false,
              analyzeError: err instanceof Error ? err.message : "Analysis failed",
              log: pushLog(get().log, {
                kind: "system",
                text: "Analysis failed — showing general tips instead.",
              }),
            });
          }
        })();
      },

      applyRecommended: (recs) => {
        const state = get();
        const cam = getCamera(state.cameraId);
        if (!cam) return;
        const current = state.settingsByCamera[state.cameraId] ?? defaultSettings(cam);
        const wanted: Settings = {};
        if (recs.iso) wanted.iso = recs.iso;
        if (recs.shutter_speed) wanted.shutter_speed = recs.shutter_speed;
        if (recs.aperture) wanted.aperture = recs.aperture;
        if (recs.white_balance) wanted.white_balance = recs.white_balance;
        if (typeof recs.exposure_comp === "number") wanted.exposure_comp = recs.exposure_comp;
        const clamped = snapToCamera(cam, wanted);
        // no-op detection: recommendations already match (within this camera's stops)
        const changed = Object.entries(clamped).filter(([k, v]) => String(current[k]) !== String(v));
        if (changed.length === 0) {
          set({
            log: pushLog(state.log, {
              kind: "system",
              text: "The recommended settings already match your current setup — nothing to change. You nailed the shot.",
            }),
          });
          return;
        }
        set({
          settingsByCamera: { ...state.settingsByCamera, [state.cameraId]: { ...current, ...clamped } },
          undoSnapshot: current,
          log: pushLog(state.log, {
            kind: "system",
            text: `Applied coach recommendations${recs.reasoning ? ` — ${recs.reasoning}` : "."}`,
          }),
        });
      },

      applyRecipe: () => {
        const state = get();
        const cam = getCamera(state.cameraId);
        const style = state.styles.find((s) => s.id === state.styleId);
        if (!cam || !style?.recipe?.settings) return;
        const current = state.settingsByCamera[state.cameraId] ?? defaultSettings(cam);
        const snapped = snapToCamera(cam, style.recipe.settings);
        set({
          settingsByCamera: { ...state.settingsByCamera, [state.cameraId]: { ...current, ...snapped } },
          undoSnapshot: current,
          log: pushLog(state.log, {
            kind: "system",
            text: `${style.emoji} Loaded the ${style.label} starting recipe — ${style.recipe.summary}`,
            why: style.recipe.why,
          }),
        });
      },

      undoApply: () => {
        const state = get();
        if (!state.undoSnapshot) return;
        set({
          settingsByCamera: { ...state.settingsByCamera, [state.cameraId]: state.undoSnapshot },
          undoSnapshot: null,
          log: pushLog(state.log, { kind: "system", text: "Undid — restored your previous settings." }),
        });
      },

      clearError: () => set({ analyzeError: null }),
    }),
    {
      name: "photo-coach-session",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        cameraId: s.cameraId,
        settingsByCamera: s.settingsByCamera,
        beginner: s.beginner,
        intent: s.intent,
        styleId: s.styleId,
        unlockedCourses: s.unlockedCourses,
        instructorUnlocked: s.instructorUnlocked,
        deviceId: s.deviceId,
        lensByCamera: s.lensByCamera,
        completedLessons: s.completedLessons,
        activeChallengeId: s.activeChallengeId,
        challengeShots: s.challengeShots,
        completedChallenges: s.completedChallenges,
      }),
    },
  ),
);
