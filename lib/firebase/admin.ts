// 이 파일은 빌드 타임에 firebase-admin을 불러오지 않도록 
// 모든 import를 함수 내부로 숨겼습니다.

let adminDbInstance: any = null;

export async function getAdminDb() {
  if (adminDbInstance) return adminDbInstance;

  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  // 프로젝트 ID가 없으면 빌드 타임이거나 설정 누락으로 간주하고 중단합니다.
  if (!projectId || !clientEmail || !privateKey) {
    console.warn("Firebase Admin: Environment variables missing. Skipping init.");
    return {} as any;
  }

  try {
    // 런타임에 동적으로 패키지 로드
    const { initializeApp, getApps, cert } = await import("firebase-admin/app");
    const { getFirestore } = await import("firebase-admin/firestore");

    if (!getApps().length) {
      initializeApp({
        credential: cert({
          projectId,
          clientEmail,
          privateKey: privateKey.replace(/\\n/g, "\n"),
        }),
      });
    }

    adminDbInstance = getFirestore();
    return adminDbInstance;
  } catch (error) {
    console.error("Firebase Admin initialization failed:", error);
    return {} as any;
  }
}
