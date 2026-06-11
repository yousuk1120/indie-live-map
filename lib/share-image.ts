"use client";

// 공연 공유 카드 이미지 생성 — LP 테마 캔버스 (1080x1350, 인스타 피드 4:5)
// Web Share API 지원 시 바로 공유, 아니면 PNG 다운로드.

import { formatSchedule, type EventItem } from "@/lib/events";

const W = 1080;
const H = 1350;

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length === maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines && words.join(" ") !== lines.join(" ")) {
    lines[maxLines - 1] = lines[maxLines - 1].slice(0, -1) + "…";
  }
  return lines;
}

function drawVinyl(ctx: CanvasRenderingContext2D, cx: number, cy: number, r: number) {
  // 디스크 본체
  ctx.fillStyle = "#0d0d0d";
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 그루브
  ctx.strokeStyle = "#262626";
  ctx.lineWidth = 2;
  for (let gr = r * 0.42; gr < r * 0.96; gr += 7) {
    ctx.beginPath();
    ctx.arc(cx, cy, gr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // 반사광
  const sheen = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  sheen.addColorStop(0, "rgba(255,255,255,0.10)");
  sheen.addColorStop(0.4, "rgba(255,255,255,0)");
  sheen.addColorStop(1, "rgba(255,255,255,0.05)");
  ctx.fillStyle = sheen;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  // 오렌지 라벨
  const label = ctx.createRadialGradient(cx - r * 0.1, cy - r * 0.1, 0, cx, cy, r * 0.3);
  label.addColorStop(0, "#e87c51");
  label.addColorStop(1, "#d95a2b");
  ctx.fillStyle = label;
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  // 스핀들 홀
  ctx.fillStyle = "#111";
  ctx.beginPath();
  ctx.arc(cx, cy, r * 0.05, 0, Math.PI * 2);
  ctx.fill();

  // 외곽 림
  ctx.strokeStyle = "#303030";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawTrackedText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, spacing: number) {
  let cursor = x;
  for (const ch of text) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

export async function shareEventImage(event: EventItem): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    alert("이미지 생성을 지원하지 않는 브라우저입니다.");
    return;
  }

  const font = '"Pretendard Variable", "Pretendard", -apple-system, sans-serif';

  // 배경
  ctx.fillStyle = "#111111";
  ctx.fillRect(0, 0, W, H);
  const glow = ctx.createRadialGradient(W * 0.15, 0, 0, W * 0.15, 0, W * 0.8);
  glow.addColorStop(0, "rgba(217,90,43,0.08)");
  glow.addColorStop(1, "rgba(217,90,43,0)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, W, H);

  // 워드마크
  ctx.fillStyle = "#d95a2b";
  ctx.font = `700 30px ${font}`;
  drawTrackedText(ctx, "LIVE CLUB MAP", 88, 130, 9);

  // LP 디스크 (우측 상단)
  drawVinyl(ctx, W - 230, 250, 150);

  // 제목
  ctx.fillStyle = "#ffffff";
  ctx.font = `800 76px ${font}`;
  const titleLines = wrapText(ctx, event.title || "공연", W - 420, 3);
  let y = 320;
  for (const line of titleLines) {
    ctx.fillText(line, 88, y);
    y += 96;
  }

  // 구분선
  y += 8;
  ctx.fillStyle = "#2a2a2a";
  ctx.fillRect(88, y, W - 176, 2);
  y += 76;

  // 일정
  ctx.fillStyle = "#e87c51";
  ctx.font = `700 26px ${font}`;
  drawTrackedText(ctx, "WHEN", 88, y, 7);
  ctx.fillStyle = "#e0e0e0";
  ctx.font = `600 42px ${font}`;
  ctx.fillText(`${formatSchedule(event)}${event.time ? ` · ${event.time}` : ""}`, 88, y + 60);
  y += 150;

  // 장소
  if (event.venueName) {
    ctx.fillStyle = "#e87c51";
    ctx.font = `700 26px ${font}`;
    drawTrackedText(ctx, "WHERE", 88, y, 7);
    ctx.fillStyle = "#e0e0e0";
    ctx.font = `600 42px ${font}`;
    ctx.fillText(event.venueName, 88, y + 60);
    y += 150;
  }

  // 라인업
  if (event.artistNames) {
    ctx.fillStyle = "#e87c51";
    ctx.font = `700 26px ${font}`;
    drawTrackedText(ctx, "LINE UP", 88, y, 7);
    ctx.fillStyle = "#a3a3a3";
    ctx.font = `500 34px ${font}`;
    const lineupLines = wrapText(ctx, event.artistNames, W - 176, 4);
    let ly = y + 56;
    for (const line of lineupLines) {
      ctx.fillText(line, 88, ly);
      ly += 48;
    }
  }

  // 하단 푸터
  ctx.fillStyle = "#d95a2b";
  ctx.fillRect(0, H - 110, W, 4);
  ctx.fillStyle = "#777777";
  ctx.font = `600 26px ${font}`;
  drawTrackedText(ctx, "라이브클럽맵 · LIVE CLUB MAP", 88, H - 48, 3);

  // 공유 또는 다운로드
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) {
    alert("이미지 생성에 실패했습니다.");
    return;
  }

  const fileName = `${(event.title || "공연").replace(/[\\/:*?"<>|]/g, "_").slice(0, 40)}.png`;
  const file = new File([blob], fileName, { type: "image/png" });

  if (typeof navigator.share === "function" && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: event.title || "공연" });
      return;
    } catch {
      // 공유 취소 시 다운로드로 폴백하지 않고 종료
      return;
    }
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}
