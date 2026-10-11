/* 🎖️ Stamp composer — bakes the Coach rating badge, app credit and (optionally)
 * a 1st/2nd/3rd place banner into a photo. Pure client-side canvas work: the
 * server never sees or stores the full-resolution image. */

export interface StampOptions {
  score: number;
  holidayName: string;
  place?: number; // 1..3 — adds the winner banner
  appName?: string;
}

const MAX_DIM = 2048;

async function loadBitmap(source: Blob | string): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof source !== "string") return createImageBitmap(source);
  // dataURL / URL path — Image decode fallback for older browsers
  const img = new Image();
  img.decoding = "async";
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Could not load image for stamping"));
    img.src = source;
  });
  return img;
}

function drawRosette(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number, score: number): void {
  const bumps = 14;
  // scalloped edge
  ctx.beginPath();
  for (let i = 0; i < bumps * 2; i++) {
    const angle = (i / (bumps * 2)) * Math.PI * 2;
    const rad = i % 2 === 0 ? r : r * 0.86;
    const x = cx + Math.cos(angle) * rad;
    const y = cy + Math.sin(angle) * rad;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  const gold = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
  gold.addColorStop(0, "#ffe27a");
  gold.addColorStop(0.55, "#f5c518");
  gold.addColorStop(1, "#b8860b");
  ctx.fillStyle = gold;
  ctx.shadowColor = "rgba(0,0,0,0.45)";
  ctx.shadowBlur = r * 0.25;
  ctx.shadowOffsetY = r * 0.08;
  ctx.fill();
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // inner disc
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.72, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(20, 22, 28, 0.92)";
  ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.05);
  ctx.strokeStyle = "rgba(255, 226, 122, 0.9)";
  ctx.stroke();

  // score in the middle
  ctx.fillStyle = "#ffd60a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = `700 ${Math.round(r * 0.72)}px -apple-system, "SF Pro Display", system-ui, sans-serif`;
  ctx.fillText(String(Math.max(0, Math.min(100, Math.round(score)))), cx, cy - r * 0.02);

  // "coach rated" microcopy inside the disc
  ctx.fillStyle = "rgba(255,255,255,0.85)";
  ctx.font = `600 ${Math.max(8, Math.round(r * 0.16))}px -apple-system, system-ui, sans-serif`;
  ctx.fillText("COACH RATED", cx, cy + r * 0.38);
}

function drawBanner(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  place: number,
  holidayName: string,
): void {
  const medal = place === 1 ? "🥇" : place === 2 ? "🥈" : "🥉";
  const label = `${medal} ${place === 1 ? "1st" : place === 2 ? "2nd" : "3rd"} Place — ${holidayName} Photo Challenge`;
  const fontSize = Math.max(14, Math.round(w * 0.035));
  ctx.font = `700 ${fontSize}px -apple-system, system-ui, sans-serif`;
  const metrics = ctx.measureText(label);
  const padX = fontSize * 0.9;
  const bannerH = fontSize * 1.9;
  const bannerW = metrics.width + padX * 2;
  const x = (w - bannerW) / 2;
  const y = h - bannerH - Math.round(h * 0.03);

  const accent = place === 1 ? "#ffd60a" : place === 2 ? "#c7ccd6" : "#e0a06a";
  const grad = ctx.createLinearGradient(x, y, x + bannerW, y + bannerH);
  grad.addColorStop(0, "rgba(12, 14, 18, 0.88)");
  grad.addColorStop(1, "rgba(12, 14, 18, 0.72)");
  ctx.beginPath();
  const r = bannerH / 2;
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + bannerW, y, x + bannerW, y + bannerH, r);
  ctx.arcTo(x + bannerW, y + bannerH, x, y + bannerH, r);
  ctx.arcTo(x, y + bannerH, x, y, r);
  ctx.arcTo(x, y, x + bannerW, y, r);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.lineWidth = Math.max(1.5, fontSize * 0.06);
  ctx.strokeStyle = accent;
  ctx.stroke();

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, w / 2, y + bannerH / 2 + fontSize * 0.05);
}

function drawAppCredit(ctx: CanvasRenderingContext2D, w: number, h: number, appName: string): void {
  const fontSize = Math.max(11, Math.round(w * 0.022));
  ctx.font = `600 ${fontSize}px -apple-system, system-ui, sans-serif`;
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  ctx.shadowColor = "rgba(0,0,0,0.6)";
  ctx.shadowBlur = fontSize * 0.6;
  ctx.fillStyle = "rgba(255,255,255,0.72)";
  ctx.fillText(appName, w - Math.round(w * 0.025), h - Math.round(h * 0.02));
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
}

export async function stampPhoto(source: Blob | string, opts: StampOptions): Promise<Blob> {
  const bmp = await loadBitmap(source);
  const iw = "width" in bmp ? bmp.width : 0;
  const ih = "height" in bmp ? bmp.height : 0;
  const scale = Math.min(1, MAX_DIM / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * scale));
  const h = Math.max(1, Math.round(ih * scale));

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported on this device");
  ctx.drawImage(bmp as CanvasImageSource, 0, 0, w, h);
  if ("close" in bmp && typeof bmp.close === "function") bmp.close();

  // rosette badge, top-right
  const r = Math.max(46, Math.min(150, Math.round(Math.min(w, h) * 0.11)));
  drawRosette(ctx, w - r - Math.round(w * 0.035), r + Math.round(w * 0.035), r, opts.score);

  if (opts.place && opts.place >= 1 && opts.place <= 3) {
    drawBanner(ctx, w, h, opts.place, opts.holidayName);
  }
  drawAppCredit(ctx, w, h, opts.appName ?? "AI Photography Instructor");

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not encode stamped photo"))),
      "image/jpeg",
      0.9,
    );
  });
}
