"use client";

// 아티스트 추가 요청 — 사용자가 인스타 링크/아이디로 "이 아티스트를 추적해달라"고 요청.
//
//  - 스크래핑을 일으키지 않습니다(Apify 비용 0). 요청 문서만 artist_requests에 저장.
//  - 어드민이 검토 후 source_accounts에 등록하면 cron이 해당 계정 공연을 자동 수집합니다.
//  - 익명 인증(ticketbook의 ensureCloudAuth)으로 uid를 확보해 본인 요청으로 기록합니다.

import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/firestore";
import { ensureCloudAuth } from "@/lib/ticketbook";

// 인스타 경로 중 사용자 핸들이 아닌 예약어 (게시물/릴스 등)
const RESERVED_SEGMENTS = new Set([
  "p", "reel", "reels", "tv", "explore", "s", "accounts", "direct",
]);

// 인스타 링크 또는 @아이디에서 사용자 핸들을 추출합니다. 추출 불가(게시물 링크 등)면 빈 문자열.
export function parseInstagramHandle(input: string): string {
  let s = (input || "").trim().replace(/^@/, "");
  if (!s) return "";

  const urlMatch = s.match(/instagram\.com\/(.+)/i);
  if (urlMatch) s = urlMatch[1];

  s = s.split(/[?#]/)[0];
  const segments = s.split("/").filter(Boolean);
  if (segments.length === 0) return "";

  let handle = segments[0];
  // stories/<user>/... 형태는 두 번째 세그먼트가 핸들
  if (handle.toLowerCase() === "stories" && segments[1]) {
    handle = segments[1];
  } else if (RESERVED_SEGMENTS.has(handle.toLowerCase())) {
    return "";
  }

  return handle.toLowerCase().replace(/[^a-z0-9._]/g, "");
}

function waitForUid(timeoutMs = 4000): Promise<string | null> {
  if (auth.currentUser?.uid) return Promise.resolve(auth.currentUser.uid);
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (auth.currentUser?.uid) {
        clearInterval(timer);
        resolve(auth.currentUser.uid);
      } else if (Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve(null);
      }
    }, 150);
  });
}

export async function submitArtistRequest(params: {
  instagramUrl: string;
  artistName?: string;
}): Promise<{ ok: boolean; message: string }> {
  const instagramUrl = params.instagramUrl.trim();
  const artistName = (params.artistName || "").trim();

  if (!instagramUrl && !artistName) {
    return { ok: false, message: "인스타그램 링크(또는 아이디)나 아티스트 이름을 입력해주세요." };
  }

  try {
    ensureCloudAuth();
    const uid = await waitForUid();
    if (!uid) {
      return { ok: false, message: "인증 준비 중이에요. 잠시 후 다시 시도해주세요." };
    }

    await addDoc(collection(db, "artist_requests"), {
      instagramUrl: instagramUrl.slice(0, 500),
      accountName: parseInstagramHandle(instagramUrl).slice(0, 100),
      artistName: artistName.slice(0, 100),
      status: "pending",
      uid,
      createdAt: serverTimestamp(),
    });

    return {
      ok: true,
      message: "요청을 보냈어요! 관리자 확인 후 추가되면, 관심 등록 시 새 공연 알림을 받을 수 있어요.",
    };
  } catch (error) {
    console.error("아티스트 추가 요청 실패:", error);
    return { ok: false, message: "요청 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
}
