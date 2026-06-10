"use client";

// 티켓북 스토어 — "로컬 우선 + 클라우드 미러" 구조.
//
//  - 모든 읽기/쓰기는 localStorage에 즉시 반영 (오프라인/비로그인에서도 완전 동작)
//  - 백그라운드에서 Firebase 익명 인증으로 users/{uid}에 자동 백업
//  - "Google 계정 연결" 시 같은 uid가 승격되어 폰-PC 간 동기화 완성
//
// 익명 인증이 Firebase 콘솔에서 비활성화돼 있으면 조용히 로컬 전용으로 동작합니다.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import {
  signInAnonymously,
  onAuthStateChanged,
  GoogleAuthProvider,
  linkWithPopup,
  signInWithCredential,
  type User,
} from "firebase/auth";
import { collection, deleteDoc, doc, getDocs, setDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/firestore";
import { normalizeDate, type EventItem } from "@/lib/events";

export type SavedEvent = EventItem & { savedAt: string; updatedAt?: string };

export type TicketRecord = EventItem & {
  savedAt: string;
  watchedDate: string; // 관람일 (공연 날짜)
  rating?: number; // 1~5
  review?: string; // 한줄평
  setlist?: string; // 셋리스트 메모 (줄 단위)
  updatedAt?: string;
};

export type SyncState = "local" | "anon" | "linked";

type TicketbookState = {
  saved: SavedEvent[];
  records: TicketRecord[];
  syncState: SyncState;
  userEmail: string;
};

const STORAGE_KEY = "indieLive.ticketbook.v1";
const LEGACY_KEY = "indieLiveSaved"; // 구버전: 공연 ID 배열만 저장

const EMPTY_STATE: TicketbookState = { saved: [], records: [], syncState: "local", userEmail: "" };

let state: TicketbookState = EMPTY_STATE;
let loaded = false;
let authStarted = false;
let cloudUser: User | null = null;
let legacyIds: string[] = [];
const listeners = new Set<() => void>();

function todayKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

function isPast(event: EventItem): boolean {
  const start = normalizeDate(event.date);
  if (!start) return false;
  const end = normalizeDate(event.endDate) || start;
  return end < todayKey();
}

function emit() {
  listeners.forEach((listener) => listener());
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ saved: state.saved, records: state.records }));
  } catch (error) {
    console.error("티켓북 저장 실패:", error);
  }
}

// Firestore에 들어갈 수 없는 undefined 필드 제거
function compact<T extends Record<string, unknown>>(item: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(item).filter(([, v]) => v !== undefined));
}

// ─── 클라우드 미러 (fire-and-forget — 실패해도 로컬 동작에 영향 없음) ───

function cloudWrite(kind: "bookmarks" | "records", item: SavedEvent | TicketRecord) {
  if (!cloudUser) return;
  setDoc(doc(db, "users", cloudUser.uid, kind, item.id), compact(item)).catch((error) =>
    console.warn("클라우드 백업 실패:", error)
  );
}

function cloudDelete(kind: "bookmarks" | "records", id: string) {
  if (!cloudUser) return;
  deleteDoc(doc(db, "users", cloudUser.uid, kind, id)).catch((error) =>
    console.warn("클라우드 삭제 실패:", error)
  );
}

// 같은 id는 updatedAt(없으면 savedAt)이 최신인 쪽을 채택해 합집합
function mergeById<T extends { id: string; savedAt: string; updatedAt?: string }>(
  local: T[],
  cloud: T[]
): T[] {
  const stamp = (item: T) => item.updatedAt || item.savedAt || "";
  const merged = new Map<string, T>();
  for (const item of [...cloud, ...local]) {
    const existing = merged.get(item.id);
    if (!existing || stamp(item) >= stamp(existing)) merged.set(item.id, item);
  }
  return Array.from(merged.values());
}

// 첫 인증 시: 클라우드 데이터를 내려받아 로컬과 병합 → 양쪽 모두 최신화
async function syncWithCloud(user: User) {
  try {
    const [bookmarksSnap, recordsSnap] = await Promise.all([
      getDocs(collection(db, "users", user.uid, "bookmarks")),
      getDocs(collection(db, "users", user.uid, "records")),
    ]);

    const cloudSaved = bookmarksSnap.docs.map((d) => d.data() as SavedEvent);
    const cloudRecords = recordsSnap.docs.map((d) => d.data() as TicketRecord);

    const mergedState = archivePast({
      ...state,
      saved: mergeById(state.saved, cloudSaved),
      records: mergeById(state.records, cloudRecords),
    });

    state = mergedState;
    persist();
    emit();

    // 병합 결과를 클라우드에 다시 반영 (로컬에만 있던 항목 업로드)
    for (const item of state.saved) cloudWrite("bookmarks", item);
    for (const item of state.records) cloudWrite("records", item);
    // 북마크에서 기록으로 이동된 항목은 bookmarks에서 제거
    for (const cloudItem of cloudSaved) {
      if (!state.saved.some((s) => s.id === cloudItem.id)) cloudDelete("bookmarks", cloudItem.id);
    }
  } catch (error) {
    console.warn("클라우드 동기화 실패 (로컬 전용으로 계속):", error);
  }
}

// 백그라운드 인증: 기존 세션 복원 → 없으면 익명 로그인
function startAuth() {
  if (authStarted || typeof window === "undefined") return;
  authStarted = true;

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      cloudUser = user;
      state = {
        ...state,
        syncState: user.isAnonymous ? "anon" : "linked",
        userEmail: user.email || "",
      };
      emit();
      await syncWithCloud(user);
    } else {
      cloudUser = null;
      state = { ...state, syncState: "local", userEmail: "" };
      emit();
      try {
        await signInAnonymously(auth);
      } catch {
        // 익명 인증이 콘솔에서 꺼져 있으면 로컬 전용으로 동작
      }
    }
  });
}

// ─── 로컬 스토어 ───

function archivePast(input: TicketbookState): TicketbookState {
  const stillUpcoming: SavedEvent[] = [];
  const newRecords: TicketRecord[] = [...input.records];
  const moved: TicketRecord[] = [];

  for (const item of input.saved) {
    if (isPast(item)) {
      if (!newRecords.some((r) => r.id === item.id)) {
        const record: TicketRecord = { ...item, watchedDate: normalizeDate(item.date) };
        newRecords.push(record);
        moved.push(record);
      }
    } else {
      stillUpcoming.push(item);
    }
  }

  // 기록으로 이동된 항목을 클라우드에도 반영
  for (const record of moved) {
    cloudWrite("records", record);
    cloudDelete("bookmarks", record.id);
  }

  newRecords.sort((a, b) => (a.watchedDate > b.watchedDate ? -1 : 1));
  return { ...input, saved: stillUpcoming, records: newRecords };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { saved?: SavedEvent[]; records?: TicketRecord[] };
      state = archivePast({
        ...state,
        saved: Array.isArray(parsed.saved) ? parsed.saved : [],
        records: Array.isArray(parsed.records) ? parsed.records : [],
      });
      persist();
    }

    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const ids = JSON.parse(legacyRaw);
      if (Array.isArray(ids)) legacyIds = ids.filter((id) => typeof id === "string");
    }
  } catch (error) {
    console.error("티켓북 로딩 실패:", error);
  }

  emit();
  startAuth();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): TicketbookState {
  return state;
}

function getServerSnapshot(): TicketbookState {
  return EMPTY_STATE;
}

function setState(next: TicketbookState) {
  state = next;
  persist();
  emit();
}

export function toggleSave(event: EventItem) {
  load();
  if (state.saved.some((s) => s.id === event.id)) {
    setState({ ...state, saved: state.saved.filter((s) => s.id !== event.id) });
    cloudDelete("bookmarks", event.id);
  } else {
    const now = new Date().toISOString();
    const snapshot: SavedEvent = { ...event, savedAt: now, updatedAt: now };
    setState(archivePast({ ...state, saved: [...state.saved, snapshot] }));
    if (state.saved.some((s) => s.id === event.id)) cloudWrite("bookmarks", snapshot);
  }
}

export function removeSaved(id: string) {
  load();
  setState({ ...state, saved: state.saved.filter((s) => s.id !== id) });
  cloudDelete("bookmarks", id);
}

export function removeRecord(id: string) {
  load();
  setState({ ...state, records: state.records.filter((r) => r.id !== id) });
  cloudDelete("records", id);
}

export function updateRecord(
  id: string,
  patch: Partial<Pick<TicketRecord, "rating" | "review" | "setlist">>
) {
  load();
  const now = new Date().toISOString();
  let updated: TicketRecord | undefined;
  setState({
    ...state,
    records: state.records.map((r) => {
      if (r.id !== id) return r;
      updated = { ...r, ...patch, updatedAt: now };
      return updated;
    }),
  });
  if (updated) cloudWrite("records", updated);
}

// 구버전 ID 목록을 현재 이벤트 데이터와 매칭해 스냅샷으로 복원
export function syncLegacyIds(events: EventItem[]) {
  load();
  if (legacyIds.length === 0 || events.length === 0) return;

  const known = new Set([...state.saved.map((s) => s.id), ...state.records.map((r) => r.id)]);
  const restored: SavedEvent[] = [];

  for (const id of legacyIds) {
    if (known.has(id)) continue;
    const event = events.find((e) => e.id === id);
    if (event) {
      const now = new Date().toISOString();
      restored.push({ ...event, savedAt: now, updatedAt: now });
    }
  }

  legacyIds = [];
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }

  if (restored.length > 0) {
    setState(archivePast({ ...state, saved: [...state.saved, ...restored] }));
    for (const item of restored) cloudWrite("bookmarks", item);
  }
}

// Google 계정 연결 — 익명 계정을 그대로 승격하므로 데이터 이전이 필요 없습니다.
// 이미 다른 기기에서 쓰던 Google 계정이면 그 계정으로 전환 후 현재 기기 데이터를 병합합니다.
export async function linkWithGoogle(): Promise<{ ok: boolean; message: string }> {
  load();
  const provider = new GoogleAuthProvider();
  const current = auth.currentUser;

  try {
    if (current && current.isAnonymous) {
      await linkWithPopup(current, provider);
      return { ok: true, message: "Google 계정 연결 완료! 이제 다른 기기에서도 티켓북이 동기화됩니다." };
    }
    if (current && !current.isAnonymous) {
      return { ok: true, message: "이미 Google 계정으로 동기화 중입니다." };
    }
    return { ok: false, message: "인증 초기화 중입니다. 잠시 후 다시 시도해주세요." };
  } catch (error: unknown) {
    const code = (error as { code?: string })?.code || "";
    // 이미 다른 기기에서 사용 중인 Google 계정 → 그 계정으로 로그인 후 현재 데이터 병합
    if (code === "auth/credential-already-in-use") {
      try {
        const credential = GoogleAuthProvider.credentialFromError(error as Parameters<typeof GoogleAuthProvider.credentialFromError>[0]);
        if (credential) {
          await signInWithCredential(auth, credential);
          // onAuthStateChanged → syncWithCloud가 현재 로컬 데이터를 그 계정에 병합합니다.
          return { ok: true, message: "기존 Google 계정으로 전환했습니다. 이 기기의 기록도 함께 병합돼요." };
        }
      } catch (switchError) {
        console.error("계정 전환 실패:", switchError);
      }
    }
    if (code === "auth/popup-closed-by-user") {
      return { ok: false, message: "로그인 창이 닫혔습니다." };
    }
    console.error("Google 연결 실패:", error);
    return { ok: false, message: "Google 연결에 실패했습니다. 잠시 후 다시 시도해주세요." };
  }
}

export function useTicketbook() {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  useEffect(() => {
    load();
  }, []);

  const isSaved = useCallback(
    (id: string) => snapshot.saved.some((s) => s.id === id),
    [snapshot.saved]
  );

  return {
    saved: snapshot.saved,
    records: snapshot.records,
    syncState: snapshot.syncState,
    userEmail: snapshot.userEmail,
    isSaved,
    toggleSave,
    removeSaved,
    removeRecord,
    updateRecord,
    syncLegacyIds,
    linkWithGoogle,
  };
}
