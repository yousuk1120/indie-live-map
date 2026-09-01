// Seoul Indie Live 서비스 워커
// 페이지: 네트워크 우선(실패 시 캐시) / 정적 자원: 캐시 우선
//
// 업데이트 방식: 새 버전은 곧바로 적용하지 않고 "대기(waiting)" 상태로 둡니다.
// 앱은 (1) 사용 중이면 인앱 "업데이트" 배너(update-prompt)로 즉시 적용하게 하고,
// (2) 배너를 무시하고 백그라운드로 보내면 sw-register가 조용히 자동 적용합니다.
// 둘 다 SKIP_WAITING 메시지로 새 버전을 활성화 → 새로고침합니다.
//
// ⚠️ 릴리스마다 이 버전(v숫자)을 올리세요 — 값이 바뀌어야 브라우저가 새 SW로 인식합니다.
const CACHE_NAME = "live-club-map-v10";

self.addEventListener("install", () => {
  // 의도적으로 skipWaiting() 하지 않음 — 사용자 확인 후 적용.
  // (기존 활성 워커가 없으면 자동 활성화되므로 첫 설치엔 영향 없음)
});

// 앱에서 "업데이트" 버튼을 누르면 이 메시지가 와서 새 버전을 즉시 적용합니다.
self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

// ─── 웹 푸시 수신 ───
// /sw.js 와 firebase-messaging-sw.js 는 둘 다 스코프 "/" 라, 페이지 로드 시 나중에
// 등록되는 /sw.js 가 스코프 "/" 의 활성 워커가 됩니다. 그러면 FCM 푸시 구독이
// 이 워커로 배달되는데 push 핸들러가 없으면 알림이 표시되지 않습니다(=서버는 성공,
// 폰엔 안 뜸). 그래서 여기서 직접 push 를 받아 알림을 띄웁니다.
// (firebase-messaging-sw.js 는 이제 별도 스코프로 분리해 상호 간섭을 없앴습니다.)
self.addEventListener("push", (event) => {
  if (!event.data) return;
  let payload = {};
  try {
    payload = event.data.json();
  } catch (e) {
    payload = {};
  }
  const n = payload.notification || {};
  const d = payload.data || {};
  const title = n.title || d.title || "라이브클럽맵";
  const url = (payload.fcmOptions && payload.fcmOptions.link) || d.url || "/";
  const options = {
    body: n.body || d.body || "",
    icon: n.icon || "/icons/icon-192.png",
    badge: n.badge || "/icons/icon-192.png",
    tag: d.tag || "lcm-event",
    data: { url },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

// 알림 클릭 → 해당 공연 페이지로 이동(이미 열린 탭이 있으면 포커스)
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(targetUrl).catch(() => {});
          return client.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // 페이지 탐색: 네트워크 우선, 오프라인 시 캐시 폴백
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          return response;
        })
        .catch(() =>
          caches.match(request).then((cached) => cached || caches.match("/"))
        )
    );
    return;
  }

  // 빌드 정적 자원 + 아이콘 + 폰트: 캐시 우선
  if (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/fonts/")
  ) {
    event.respondWith(
      caches.match(request).then(
        (cached) =>
          cached ||
          fetch(request).then((response) => {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
            return response;
          })
      )
    );
  }
});
