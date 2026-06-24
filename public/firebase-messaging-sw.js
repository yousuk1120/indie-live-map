/* Firebase Cloud Messaging 백그라운드 서비스 워커.
 *
 * 이 SW는 푸시 수신 전용입니다 (페이지 캐싱은 /sw.js가 담당).
 * Firebase 공개 설정값은 정적 파일에 하드코딩하지 않고,
 * 클라이언트가 등록할 때 쿼리 파라미터로 주입합니다.
 *   navigator.serviceWorker.register('/firebase-messaging-sw.js?apiKey=...&projectId=...')
 */

importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/12.11.0/firebase-messaging-compat.js");

const params = new URL(self.location).searchParams;
const firebaseConfig = {
  apiKey: params.get("apiKey") || undefined,
  authDomain: params.get("authDomain") || undefined,
  projectId: params.get("projectId") || undefined,
  messagingSenderId: params.get("messagingSenderId") || undefined,
  appId: params.get("appId") || undefined,
};

if (firebaseConfig.projectId && firebaseConfig.messagingSenderId) {
  firebase.initializeApp(firebaseConfig);
  const messaging = firebase.messaging();

  // 백그라운드(탭이 닫혔거나 비활성)에서 메시지 수신 → 알림 표시
  messaging.onBackgroundMessage((payload) => {
    const notification = payload.notification || {};
    const data = payload.data || {};
    const title = notification.title || data.title || "라이브클럽맵";
    const options = {
      body: notification.body || data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: data.tag || "lcm-event",
      data: { url: data.url || "/" },
    };
    self.registration.showNotification(title, options);
  });
}

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
