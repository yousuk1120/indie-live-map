"use client";

// 티켓북 로컬 스토어 — 로그인 없이 기기(localStorage)에 저장되는 유저 개인 데이터.
//
//  - saved:   다가오는 공연 북마크 (공연 정보 스냅샷째 저장 → 원본이 수정/삭제돼도 유지)
//  - records: 지난 공연 관람 기록 (북마크했던 공연이 종료되면 자동 전환, 별점/한줄평/셋리스트 메모)
//
// useSyncExternalStore 기반의 모듈 레벨 스토어라 모든 화면에서 상태가 즉시 동기화됩니다.

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { normalizeDate, type EventItem } from "@/lib/events";

export type SavedEvent = EventItem & { savedAt: string };

export type TicketRecord = EventItem & {
  savedAt: string;
  watchedDate: string; // 관람일 (공연 날짜)
  rating?: number; // 1~5
  review?: string; // 한줄평
  setlist?: string; // 셋리스트 메모 (줄 단위)
};

type TicketbookState = {
  saved: SavedEvent[];
  records: TicketRecord[];
};

const STORAGE_KEY = "indieLive.ticketbook.v1";
const LEGACY_KEY = "indieLiveSaved"; // 구버전: 공연 ID 배열만 저장

const EMPTY_STATE: TicketbookState = { saved: [], records: [] };

let state: TicketbookState = EMPTY_STATE;
let loaded = false;
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (error) {
    console.error("티켓북 저장 실패:", error);
  }
}

// 종료된 공연을 saved → records로 자동 이동
function archivePast(input: TicketbookState): TicketbookState {
  const stillUpcoming: SavedEvent[] = [];
  const newRecords: TicketRecord[] = [...input.records];

  for (const item of input.saved) {
    if (isPast(item)) {
      if (!newRecords.some((r) => r.id === item.id)) {
        newRecords.push({ ...item, watchedDate: normalizeDate(item.date) });
      }
    } else {
      stillUpcoming.push(item);
    }
  }

  newRecords.sort((a, b) => (a.watchedDate > b.watchedDate ? -1 : 1));
  return { saved: stillUpcoming, records: newRecords };
}

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as TicketbookState;
      state = archivePast({
        saved: Array.isArray(parsed.saved) ? parsed.saved : [],
        records: Array.isArray(parsed.records) ? parsed.records : [],
      });
      persist();
    }

    // 구버전(ID 배열) 데이터는 이벤트 목록이 로드된 화면에서 syncLegacyIds로 복원
    const legacyRaw = localStorage.getItem(LEGACY_KEY);
    if (legacyRaw) {
      const ids = JSON.parse(legacyRaw);
      if (Array.isArray(ids)) legacyIds = ids.filter((id) => typeof id === "string");
    }
  } catch (error) {
    console.error("티켓북 로딩 실패:", error);
  }

  emit();
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
  } else {
    const snapshot: SavedEvent = { ...event, savedAt: new Date().toISOString() };
    setState(archivePast({ ...state, saved: [...state.saved, snapshot] }));
  }
}

export function removeSaved(id: string) {
  load();
  setState({ ...state, saved: state.saved.filter((s) => s.id !== id) });
}

export function removeRecord(id: string) {
  load();
  setState({ ...state, records: state.records.filter((r) => r.id !== id) });
}

export function updateRecord(id: string, patch: Partial<Pick<TicketRecord, "rating" | "review" | "setlist">>) {
  load();
  setState({
    ...state,
    records: state.records.map((r) => (r.id === id ? { ...r, ...patch } : r)),
  });
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
    if (event) restored.push({ ...event, savedAt: new Date().toISOString() });
  }

  legacyIds = [];
  try {
    localStorage.removeItem(LEGACY_KEY);
  } catch {
    // ignore
  }

  if (restored.length > 0) {
    setState(archivePast({ ...state, saved: [...state.saved, ...restored] }));
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
    isSaved,
    toggleSave,
    removeSaved,
    removeRecord,
    updateRecord,
    syncLegacyIds,
  };
}
