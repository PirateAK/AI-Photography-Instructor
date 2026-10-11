/* Sharing a best-score moment: builds the message, attaches the photo when the
 * platform supports it (Web Share API with files — iOS/Android), and falls back
 * to copying the text on desktop. The link points friends at the app.
 */
import type { HistorySession } from "./history";
import { appConfig } from "./training";

const APP_LINK = appConfig.app_share_url || "https://muskegman.com";

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
  try {
    await navigator.clipboard.writeText(message);
    return "copied";
  } catch {
    return "unavailable";
  }
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
): Promise<ShareResult> {
  const message = buildShareMessage({ ...session });

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

  // 3. clipboard fallback
  try {
    await navigator.clipboard.writeText(message);
    return "copied";
  } catch {
    return "unavailable";
  }
}
