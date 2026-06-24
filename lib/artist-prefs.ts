"use client";

// 관심/숨김 아티스트 스토어 — 티켓북과 동일한 "로컬 우선 + 클라우드 미러" 구조.
//
//  - 모든 읽기/쓰기는 localStorage에 즉시 반영 (비로그인/오프라인에서도 완전 동작)
//  - Firebase 인증(익명/Google)이 붙으면 users/{uid}/prefs/artists 문서로 동기화
//  - 익명 인증 부트스트랩은 ticketbook이 단독 소유 → 여기서는 listen + sync만 수행
//
// 데이터 모델:
//  - favorites: 관심 아티스트 이름 목록 (표시용 원본 문자열)
//  - hidden:    숨김 아티스트 이름 목록
//  매칭은 normalizeArtistKey로 대소문자/공백/문장부호를 무시하고 비교합니다.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { onAuthStateChanged, type User } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/firestore";
import { ensureCloudAuth } from "@/lib/ticketbook";
import { refreshSubscriptionFavorites } from "@/lib/fcm";
import { splitArtists } from "@/lib/event-merge";
import type { EventItem } from "@/lib/events";

export type ArtistPrefsState = {
  favorites: string[];
  hidden: string[];
  updatedAt: string;
};

const STORAGE_KEY = "indieLive.artistPrefs.v1";
const EMPTY_STATE: ArtistPrefsState = { favorites: [], hidden: [], updatedAt: "" };

let state: ArtistPrefsState = EMPTY_STATE;
let loaded = false;
let authStarted = false;
let cloudUser: User | null = null;
const listeners = new Set<() => void>();

// ─── 아티스트 이름 정규화 (매칭 키) ───
export function normalizeArtistKey(name: string): string {
  return name.toLowerCase().replace(/[\s\-_.,!?'"()\[\]]/g, "");
}

// 이벤트의 전체 출연 아티스트 (artistNames + 날짜별 라인업) — 중복 제거된 표시용 목록
export function eventArtists(event: EventItem): string[] {
  const names = [
    ...splitArtists(event.artistNames),
    ...(event.dayLineups || []).flatMap((d) => splitArtists(d.artists)),
  ];
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ favorites: state.favorites, hidden: state.hidden, updatedAt: state.updatedAt })
    );
  } catch (error) {
    console.error("아티스트 설정 저장 실패:", error);
  }
}

function cloudWrite() {
  if (!cloudUser) return;
  setDoc(doc(db, "users", cloudUser.uid, "prefs", "artists"), {
    favorites: state.favorites,
    hidden: state.hidden,
    updatedAt: state.updatedAt,
  }).catch((error) => console.warn("아티스트 설정 클라우드 백업 실패:", error));
}

// 로컬/클라우드 두 목록을 합집합(이름 키 기준 중복 제거)으로 병합
function mergeNames(a: string[], b: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of [...a, ...b]) {
    const key = normalizeArtistKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}

// 첫 인증 시 클라우드 데이터를 내려받아 로컬과 병합 → 양쪽 최신화
async function syncWithCloud(user: User) {
  try {
    const snap = await getDoc(doc(db, "users", user.uid, "prefs", "artists"));
    const cloud = (snap.exists() ? snap.data() : {}) as Partial<ArtistPrefsState>;

    const cloudFav = Array.isArray(cloud.favorites) ? cloud.favorites : [];
    const cloudHidden = Array.isArray(cloud.hidden) ? cloud.hidden : [];

    const merged: ArtistPrefsState = {
      favorites: mergeNames(state.favorites, cloudFav),
      hidden: mergeNames(state.hidden, cloudHidden),
      updatedAt: new Date().toISOString(),
    };

    const changed =
      merged.favorites.length !== state.favorites.length ||
      merged.hidden.length !== state.hidden.length ||
      merged.favorites.length !== cloudFav.length ||
      merged.hidden.length !== cloudHidden.length;

    state = merged;
    persist();
    emit();
    if (changed) cloudWrite();
  } catch (error) {
    console.warn("아티스트 설정 동기화 실패 (로컬 전용으로 계속):", error);
  }
}

// listen 전용: 인증 상태가 생기면 uid를 잡고 동기화. 익명 로그인은 ticketbook이 시작합니다.
function startAuth() {
  if (authStarted || typeof window === "undefined") return;
  authStarted = true;
  ensureCloudAuth();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      cloudUser = user;
      syncWithCloud(user);
    } else {
      cloudUser = null;
    }
  });
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ArtistPrefsState>;
      state = {
        favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
        updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
      };
    }
  } catch (error) {
    console.error("아티스트 설정 로딩 실패:", error);
  }
  emit();
  startAuth();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): ArtistPrefsState {
  return state;
}

function getServerSnapshot(): ArtistPrefsState {
  return EMPTY_STATE;
}

function setState(next: ArtistPrefsState) {
  state = next;
  persist();
  emit();
  cloudWrite();
}

// 관심 목록이 바뀌면 푸시 구독 문서의 favoriteKeys도 갱신 (푸시 미사용 시 no-op)
function syncFavoritesToPush() {
  refreshSubscriptionFavorites(state.favorites.map(normalizeArtistKey)).catch(() => {});
}

function hasName(list: string[], name: string): boolean {
  const key = normalizeArtistKey(name);
  return list.some((n) => normalizeArtistKey(n) === key);
}

function removeName(list: string[], name: string): string[] {
  const key = normalizeArtistKey(name);
  return list.filter((n) => normalizeArtistKey(n) !== key);
}

// ─── 공개 액션 ───

// 관심 등록/해제. 관심으로 등록하면 숨김에서는 자동 제거(상호 배타).
export function toggleFavorite(name: string) {
  load();
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  if (hasName(state.favorites, trimmed)) {
    setState({ ...state, favorites: removeName(state.favorites, trimmed), updatedAt: now });
  } else {
    setState({
      favorites: [...state.favorites, trimmed],
      hidden: removeName(state.hidden, trimmed),
      updatedAt: now,
    });
  }
  syncFavoritesToPush();
}

// 숨김 등록/해제. 숨기면 관심에서는 자동 제거(상호 배타).
export function toggleHidden(name: string) {
  load();
  const trimmed = name.trim();
  if (!trimmed) return;
  const now = new Date().toISOString();
  if (hasName(state.hidden, trimmed)) {
    setState({ ...state, hidden: removeName(state.hidden, trimmed), updatedAt: now });
  } else {
    setState({
      favorites: removeName(state.favorites, trimmed),
      hidden: [...state.hidden, trimmed],
      updatedAt: now,
    });
    syncFavoritesToPush();
  }
}

export function removeFavorite(name: string) {
  load();
  setState({ ...state, favorites: removeName(state.favorites, name), updatedAt: new Date().toISOString() });
  syncFavoritesToPush();
}

export function removeHidden(name: string) {
  load();
  setState({ ...state, hidden: removeName(state.hidden, name), updatedAt: new Date().toISOString() });
}

export function useArtistPrefs() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    load();
  }, []);

  const isFavorite = useCallback(
    (name: string) => hasName(snapshot.favorites, name),
    [snapshot.favorites]
  );
  const isHidden = useCallback(
    (name: string) => hasName(snapshot.hidden, name),
    [snapshot.hidden]
  );

  // 이벤트에 관심 아티스트가 한 명이라도 포함되는가
  const eventHasFavorite = useCallback(
    (event: EventItem) => {
      if (snapshot.favorites.length === 0) return false;
      const favKeys = new Set(snapshot.favorites.map(normalizeArtistKey));
      return eventArtists(event).some((a) => favKeys.has(normalizeArtistKey(a)));
    },
    [snapshot.favorites]
  );

  // 이벤트에 숨김 아티스트가 한 명이라도 포함되는가 (필터링용)
  const eventHasHidden = useCallback(
    (event: EventItem) => {
      if (snapshot.hidden.length === 0) return false;
      const hiddenKeys = new Set(snapshot.hidden.map(normalizeArtistKey));
      return eventArtists(event).some((a) => hiddenKeys.has(normalizeArtistKey(a)));
    },
    [snapshot.hidden]
  );

  return {
    favorites: snapshot.favorites,
    hidden: snapshot.hidden,
    isFavorite,
    isHidden,
    eventHasFavorite,
    eventHasHidden,
    toggleFavorite,
    toggleHidden,
    removeFavorite,
    removeHidden,
  };
}
