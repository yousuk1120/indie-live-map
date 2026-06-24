"use client";

// 웹 푸시(FCM) 클라이언트 — 관심 아티스트 새 공연 알림 구독.
//
//  - 구독 정보는 top-level `pushSubscriptions/{token}` 문서에 저장됩니다.
//      { token, uid, favoriteKeys: string[], updatedAt, platform }
//  - 서버(/api/notify-new-event)는 favoriteKeys로 대상 토큰을 찾아 발송합니다.
//  - 익명 인증은 ticketbook이 부트스트랩(ensureCloudAuth)하므로 uid를 공유합니다.

import { getApp } from "firebase/app";
import { deleteDoc, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth } from "@/lib/firebase/auth";
import { db } from "@/lib/firebase/firestore";
import { ensureCloudAuth } from "@/lib/ticketbook";

const TOKEN_STORAGE_KEY = "lcm:fcm-token";
const VAPID_KEY = process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY;

const PUBLIC_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export type PushPermission = "default" | "granted" | "denied" | "unsupported";

// 브라우저가 웹 푸시를 지원하는가 (iOS는 16.4+ 홈 화면 추가 시에만 지원)
export function isPushSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "Notification" in window &&
    "PushManager" in window
  );
}

export function getPermission(): PushPermission {
  if (!isPushSupported()) return "unsupported";
  return Notification.permission as PushPermission;
}

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setStoredToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore
  }
}

// FCM 메시징 인스턴스 (지원 환경에서만). 동적 import로 SSR 안전.
async function getMessagingSafe() {
  if (!isPushSupported()) return null;
  const { getMessaging, isSupported } = await import("firebase/messaging");
  if (!(await isSupported())) return null;
  return getMessaging(getApp());
}

// FCM 백그라운드 SW 등록 — 공개 설정값을 쿼리로 주입 (정적 파일 하드코딩 방지)
async function registerMessagingSw(): Promise<ServiceWorkerRegistration | undefined> {
  if (!("serviceWorker" in navigator)) return undefined;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(PUBLIC_CONFIG)) {
    if (value) qs.set(key, value);
  }
  return navigator.serviceWorker.register(`/firebase-messaging-sw.js?${qs.toString()}`);
}

async function writeSubscription(token: string, favoriteKeys: string[]) {
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  await setDoc(doc(db, "pushSubscriptions", token), {
    token,
    uid,
    favoriteKeys,
    platform: navigator.userAgent.slice(0, 200),
    updatedAt: serverTimestamp(),
  });
}

// 푸시 활성화: 권한 요청 → 토큰 발급 → 구독 문서 저장. 발급된 토큰 반환(실패 시 null).
export async function enablePush(favoriteKeys: string[]): Promise<{ ok: boolean; message: string }> {
  if (!isPushSupported()) {
    return { ok: false, message: "이 브라우저는 웹 푸시를 지원하지 않습니다. (iOS는 홈 화면에 앱을 추가한 뒤 사용 가능)" };
  }
  if (!VAPID_KEY) {
    return { ok: false, message: "푸시 설정(VAPID 키)이 누락되었습니다. 관리자에게 문의해주세요." };
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      return { ok: false, message: "알림 권한이 거부되었습니다. 브라우저 설정에서 알림을 허용해주세요." };
    }

    ensureCloudAuth();

    const messaging = await getMessagingSafe();
    if (!messaging) {
      return { ok: false, message: "이 환경에서는 푸시를 사용할 수 없습니다." };
    }

    const swRegistration = await registerMessagingSw();
    const { getToken } = await import("firebase/messaging");
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
      serviceWorkerRegistration: swRegistration,
    });

    if (!token) {
      return { ok: false, message: "푸시 토큰 발급에 실패했습니다. 잠시 후 다시 시도해주세요." };
    }

    // uid가 준비될 때까지 살짝 대기 후 구독 문서 저장 (익명 인증 완료 보장)
    await waitForUid();
    await writeSubscription(token, favoriteKeys);
    setStoredToken(token);
    listenForeground(messaging);

    return { ok: true, message: "알림이 켜졌어요! 관심 아티스트의 새 공연이 등록되면 알려드릴게요." };
  } catch (error) {
    console.error("푸시 활성화 실패:", error);
    return { ok: false, message: "알림 설정 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." };
  }
}

// 푸시 비활성화: 토큰 폐기 + 구독 문서 삭제
export async function disablePush(): Promise<void> {
  const token = getStoredToken();
  try {
    const messaging = await getMessagingSafe();
    if (messaging) {
      const { deleteToken } = await import("firebase/messaging");
      await deleteToken(messaging).catch(() => {});
    }
    if (token) await deleteDoc(doc(db, "pushSubscriptions", token)).catch(() => {});
  } catch (error) {
    console.warn("푸시 비활성화 중 오류:", error);
  } finally {
    setStoredToken(null);
  }
}

// 관심 아티스트 변경 시 구독 문서의 favoriteKeys 갱신 (푸시가 켜져 있을 때만)
export async function refreshSubscriptionFavorites(favoriteKeys: string[]): Promise<void> {
  const token = getStoredToken();
  if (!token) return;
  try {
    await writeSubscription(token, favoriteKeys);
  } catch (error) {
    console.warn("구독 관심 목록 갱신 실패:", error);
  }
}

function waitForUid(timeoutMs = 4000): Promise<void> {
  if (auth.currentUser?.uid) return Promise.resolve();
  return new Promise((resolve) => {
    const start = Date.now();
    const timer = setInterval(() => {
      if (auth.currentUser?.uid || Date.now() - start > timeoutMs) {
        clearInterval(timer);
        resolve();
      }
    }, 150);
  });
}

let foregroundBound = false;
// 포그라운드(탭 활성)에서 메시지 수신 시 브라우저 알림 표시
async function listenForeground(messaging: Awaited<ReturnType<typeof getMessagingSafe>>) {
  if (foregroundBound || !messaging) return;
  foregroundBound = true;
  const { onMessage } = await import("firebase/messaging");
  onMessage(messaging, (payload) => {
    const n = payload.notification;
    if (!n || Notification.permission !== "granted") return;
    const notification = new Notification(n.title || "라이브클럽맵", {
      body: n.body,
      icon: "/icons/icon-192.png",
    });
    notification.onclick = () => {
      const url = payload.data?.url || "/";
      window.open(url, "_blank");
    };
  });
}
