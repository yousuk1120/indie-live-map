// 어드민 라우트 레이아웃 — 어드민 전용 PWA(앱 아이콘)로 설치되도록
// 런타임에 manifest를 /admin.webmanifest로 교체합니다.
// 폰에서 /admin을 홈 화면에 추가하면 "관리자" 전용 앱으로 standalone 실행되며,
// 어드민도 같은 Firestore에 쓰기 때문에 폰에서 수정하면 본 앱에 즉시 반영됩니다.

import AdminManifest from "./admin-manifest";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminManifest />
      {children}
    </>
  );
}
