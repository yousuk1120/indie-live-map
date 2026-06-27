"use client";

// 현재 수집된 공연 풀에 등장하는 아티스트 키 집합 (클라이언트).
//
//  - events 컬렉션은 공개 읽기(rules: read=true)라 클라이언트에서 직접 조회 가능.
//  - 세션당 1회만 로드해 모듈에 캐시 (관심 추가 시 "풀에 있는 아티스트인지" 판별용).
//  - 판별 실패(로딩 전/오류)는 "없음"으로 간주 → 추가 요청을 보내는 안전한 방향.

import { useEffect, useState } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase/firestore";
import { normalizeEvent } from "@/lib/events";
import { eventArtists, normalizeArtistKey } from "@/lib/artist-prefs";

let cache: Set<string> | null = null;
let inflight: Promise<Set<string>> | null = null;

async function loadKeys(): Promise<Set<string>> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    const snapshot = await getDocs(collection(db, "events"));
    const keys = new Set<string>();
    snapshot.forEach((docSnap) => {
      const event = normalizeEvent(docSnap.id, docSnap.data() as Record<string, unknown>);
      for (const artist of eventArtists(event)) {
        const key = normalizeArtistKey(artist);
        if (key) keys.add(key);
      }
    });
    cache = keys;
    return keys;
  })();
  return inflight;
}

export function useKnownArtistKeys(): { keys: Set<string>; ready: boolean } {
  const [keys, setKeys] = useState<Set<string>>(cache ?? new Set());
  const [ready, setReady] = useState<boolean>(cache !== null);

  useEffect(() => {
    let active = true;
    loadKeys()
      .then((loaded) => {
        if (!active) return;
        setKeys(loaded);
        setReady(true);
      })
      .catch((error) => {
        console.warn("공연 아티스트 목록 로딩 실패 (추가 요청으로 폴백):", error);
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);

  return { keys, ready };
}
