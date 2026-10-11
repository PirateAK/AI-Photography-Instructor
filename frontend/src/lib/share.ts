/* Sharing a best-score moment: builds the message, attaches the photo when the
 * platform supports it (Web Share API with files — iOS/Android), and falls back
 * to copying the text on desktop. The link points friends at the app.
 */
import type { HistorySession } from "./history";
import { appConfig } from "./training";

const APP_LINK = appConfig.app_share_url || "https://muskegman.com";
const STORE_LINK = appConfig.store_url || "https://muskegman.com";

export function buildShareMessage(session: {
  score: number;
  style_id: string;
  styleLabel?: string;
}): string {
  const lens = session.styleLabel ? ` with the ${session.styleLabel} lens` : "";
  return (
    `🏆 I scored ${session.score}/100 on my photo${lens} with the AI Photography Instructor! ` +
    `It coaches your camera settings live — think you can beat my score?\n${APP_LINK}`
  );
}

export function buildAppShareMessage(): string {
  return (
    "📷 Found a great learning tool for photographers: the AI Photography Instructor. " +
    "A Photo Coach evaluates your photos, a live simulator lets you practice settings, and there's a full " +
    "class curriculum from your first shot to going pro.\n" +
    `${APP_LINK}`
  );
}

/** Clipboard with a legacy fallback — the Web Share API is phone-first, so
 * desktop browsers land here. execCommand covers older/iframe contexts where
 * the async Clipboard API is blocked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    /* fall through to the legacy path */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** Share the app itself (no photo) — same fallback ladder as score sharing. */
export async function shareApp(): Promise<ShareResult> {
  const message = buildAppShareMessage();
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ text: message, title: "AI Photography Instructor" });
      return "shared";
    }
  } catch {
    /* fall through to clipboard */
  }
  return (await copyText(message)) ? "copied" : "unavailable";
}

async function thumbToFile(dataUrl: string): Promise<File | null> {
  try {
    const blob = await (await fetch(dataUrl)).blob();
    return new File([blob], "my-score.jpg", { type: blob.type || "image/jpeg" });
  } catch {
    return null;
  }
}

export type ShareResult = "shared" | "copied" | "unavailable";

/** Share the score (and photo when possible). Returns how it went. */
export async function shareSession(
  session: HistorySession & { styleLabel?: string },
): Promise<ShareResult> {  const message = buildShareMessage({ ...session });

  // 1. native share sheet with the photo attached (phones)
  try {
    if (session.thumbnail && typeof navigator.canShare === "function") {
      const file = await thumbToFile(session.thumbnail);
      if (file && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], text: message, title: "My AI Photo Coach score" });
        return "shared";
      }
    }
  } catch {
    /* user cancelled or share failed — fall through to the clipboard */
  }

  // 2. plain text share sheet (desktop browsers with the API)
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ text: message, title: "My AI Photo Coach score" });
      return "shared";
    }
  } catch {
    /* fall through */
  }

  // 3. clipboard fallback (legacy-aware)
  return (await copyText(message)) ? "copied" : "unavailable";
}

export function buildContestShareMessage(place: number, holidayName: string, score: number): string {
  const medal = place === 1 ? "🥇 1st" : place === 2 ? "🥈 2nd" : "🥉 3rd";
  return (
    `${medal} place in the ${holidayName} Photo Challenge — the Coach rated it ${score}/100! ` +
    `Want your shots coached too?\n${APP_LINK}\nPrints & photo software: ${STORE_LINK}`
  );
}

export function buildGalleryShareMessage(): string {
  return (
    `📷 Shot & coached with the AI Photography Instructor — a Photo Coach rates your photos and a live ` +
    `simulator teaches the settings.\n${APP_LINK}\nPrints & photo software: ${STORE_LINK}`
  );
}

/** Share a photo blob with a message (files → text share → clipboard). */
export async function sharePhotoBlob(
  blob: Blob,
  message: string,
  filename = "photo.jpg",
): Promise<ShareResult> {
  const file = new File([blob], filename, { type: blob.type || "image/jpeg" });
  try {
    if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], text: message, title: "AI Photography Instructor" });
      return "shared";
    }
  } catch {
    /* fall through */
  }
  try {
    if (typeof navigator.share === "function") {
      await navigator.share({ text: message, title: "AI Photography Instructor" });
      return "shared";
    }
  } catch {
    /* fall through */
  }
  return (await copyText(message)) ? "copied" : "unavailable";
}
