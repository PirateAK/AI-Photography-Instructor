// Global app state (zustand). Session image lives in memory only;
// camera choice, per-camera settings and preferences persist in localStorage.
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

import { analyzePhoto, fetchExif, sendChat as apiSendChat } from "../lib/api";
import { defaultSettings, getCamera, getCameras, baselineFromExif, snapToCamera } from "../lib/camera";
import { getStyle } from "../lib/styles";
import { courses, unlockAllPaid, isValidCode } from "../lib/training";
import { FALLBACK_TIPS, tipFor } from "../lib/tips";
import type {
  AnalysisResult,
  ChatMessage,
  CoachResponse,
  ExifInfo,
  LogEntry,
  RecommendedSettings,
  Settings,
} from "../lib/types";

interface PhotoState {
  screen: "upload" | "workspace" | "settings" | "classes";
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

  chatMessages: ChatMessage[];
  chatSending: boolean;
  chatNotice: string | null;

  unlockedCourses: string[];

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
  beginUndoable: () => void;
  askCoach: (message: string) => Promise<void>;
  openWorkspace: () => void;
  goClasses: () => void;
  loadDemoPhoto: () => Promise<boolean>;
  unlockWithCode: (code: string) => boolean;
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

      chatMessages: [],
      chatSending: false,
      chatNotice: null,

      unlockedCourses: [],

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
        });
      },

      setCamera: (id) => {
        const { settingsByCamera, cameraId } = get();
        if (id === cameraId) return;
        const cam = getCamera(id);
        if (!cam) return;
        set({
          cameraId: id,
          settingsByCamera: {
            ...settingsByCamera,
            [id]: settingsByCamera[id] ?? defaultSettings(cam),
          },
          undoSnapshot: null,
          log: pushLog(get().log, {
            kind: "system",
            text: `Switched camera to ${cam.brand} ${cam.model} — toolbar rebuilt from camera_models.json.`,
          }),
        });
      },

      setStyle: (id) => {
        const state = get();
        if (id === state.styleId) return;
        const style = getStyle(id);
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
        set({
          settingsByCamera: {
            ...state.settingsByCamera,
            [state.cameraId]: defaultSettings(cam),
          },
          undoSnapshot: null,
          log: pushLog(state.log, { kind: "system", text: "Settings reset to this camera's defaults." }),
        });
      },

      setBeginner: (b) => set({ beginner: b }),
      setIntent: (s) => set({ intent: s }),
      goUpload: () => set({ screen: "upload" }),
      goSettings: () => set({ screen: "settings" }),
      openWorkspace: () => {
        if (get().dataUrl) set({ screen: "workspace" });
      },

      setHighlight: (id) => set({ highlightSetting: id }),
      setFocusPoint: (p) => set({ focusPoint: p }),

      goClasses: () => set({ screen: "classes" }),

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
        const style = getStyle(state.styleId);
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
      }),
    },
  ),
);
