# 라이브클럽맵 (Live Club Map) — 작업 인수인계 문서

> 최종 업데이트: 2026-06-11 · 최종 커밋: `799456f`
> 다음 세션에서 이 문서를 기준으로 이어서 진행하면 됩니다.

---

## 1. 지금 바로 할 일 (사용자 액션)

### ① 로컬에서 옛 화면이 보이는 문제 (1회만)
코드는 전부 적용돼 있음. 브라우저에 남은 **옛 서비스 워커(PWA 캐시)** 가 원인.
- localhost:3000에서 **`Ctrl + Shift + R`** (강력 새로고침)
- 그래도 안 되면: F12 → Application → Service Workers → **Unregister** → Storage → **Clear site data** → 새로고침
- 이후로는 자동 갱신됨 (SW 자동 새로고침 로직 추가했음, 커밋 `799456f`)

### ② 프로덕션 배포 (중요!)
**Vercel 프로덕션은 아직 6일 전 버전.** GitHub 푸시 → 자동 배포 연동이 끊겨 있음.
```bash
npx vercel --prod        # 즉시 배포 (한 줄)
```
근본 해결: Vercel 대시보드 → indie-live-map → Settings → **Git** → GitHub 저장소 재연결
(연결되면 앞으로 git push만 해도 자동 배포)

### ③ 어드민 접근 방식 결정 (선택)
- 현재: 프로덕션에서 `/admin` 은 404 (보안 격리, proxy.ts)
- **로컬 전용 사용(권장)**: `npm run dev` → `localhost:3000/admin`
- 배포에서도 쓰려면: Vercel 환경변수 `ADMIN_ENABLED=true` 추가 후 재배포
  (페이지는 노출되지만 데이터는 Google 로그인 + 이메일 화이트리스트로 보호됨)

### ④ 검색 등록 (성장, 각 10분)
- Google Search Console 등록 → sitemap.xml 제출
- 네이버 서치어드바이저 등록
- 커스텀 도메인 연결 시: Vercel 도메인 추가 + 환경변수 `NEXT_PUBLIC_SITE_URL` + 카카오 디벨로퍼스에 도메인 등록

### ⑤ (선택) Vercel Blob 생성
Vercel 대시보드 → Storage → Blob 스토어 생성 → 포스터 이미지 영구화 자동 활성화
(인스타 이미지 URL은 며칠 뒤 만료됨 — 미설정 시 원본 URL 유지로 동작은 함)

---

## 2. 완료된 것 (이번 세션까지)

### 아키텍처 / 보안
- [x] 홈·달력·지도 Server Component + ISR(5분), 상세 페이지 SSR + JSON-LD(MusicEvent) + sitemap/robots
- [x] Firestore Rules: 관리자 이메일 화이트리스트(`yousuk1120@gmail.com`) + 스키마 검증 + users/{uid} 본인 전용 (배포됨)
- [x] `/api/parse-event`, `/api/fetch-insta`, `/api/analyze-lineup` — Firebase ID 토큰 인증 필수 (비용 구멍 차단)
- [x] 어드민 격리: `proxy.ts` (프로덕션 404, `ADMIN_ENABLED=true`로만 활성화)
- [x] PWA: manifest + 서비스 워커(자동 갱신) + LP판 앱 아이콘
- [x] Firebase **익명 인증 활성화 완료** (`scripts/enable-anonymous-auth.js` 실행함)

### 기능
- [x] 하단 탭: 홈 / 달력 / 지도 / 티켓북
- [x] 티켓북: 북마크 → 종료 시 관람기록 자동 전환, 별점/한줄평/셋리스트, 통계
- [x] 티켓북 클라우드 동기화: 익명 자동 백업 → "Google로 연결" 시 기기 간 동기화
- [x] 캘린더 추가(.ics): 티켓북 + 상세 페이지
- [x] 공유 카드 이미지: 상세 페이지 "이미지 공유" → LP 테마 1080x1350 PNG
- [x] 티켓 오픈 예정 섹션: `ticketOpenAt` 필드 (AI 추출 → 데이터 쌓이면 홈에 자동 표시)
- [x] 페스티벌: 멀티데이 기간 표시, 달력 기간 전체 표기 + 그날 라인업, 나만의 라인업 빌더, 타임테이블/포스터 뷰어
- [x] 지도: PC 드래그 수정, LP 커스텀 마커(페스티벌=오렌지/일반=화이트), 마커 클릭 팝업, 좌표 캐싱
- [x] 공연장 프로필 페이지 `/venues/[slug]`
- [x] 가격 표기 통일: "1만원"·"10,000 KRW"·"₩10000" → 전부 "10,000원"

### 데이터 파이프라인
- [x] AI 프롬프트 공용화(`lib/ai-event-prompt.ts`): 제목 필수, 편성표/정기이벤트 제외, 멀티데이+날짜별 라인업+티켓오픈 추출
- [x] 같은 공연 자동 병합(`lib/event-merge.ts`): 한/영 중복 → 한국어 우선, 라인업 누적
- [x] 장소 정규화(`lib/venues.ts`): 별칭 통일 + "지하" 등 쓰레기 값 필터
- [x] 관리자 "라인업 분석" 버튼: 포스터 이미지 AI 비전 분석 → 날짜별 라인업/종료일 채움
- [x] **DB 백필 실행 완료**: 페스티벌 12개 기간 복원 (DMZ 6/12~14, JUMF 8/14~16, 펜타포트 7/31~8/2 등), 중복 정리 52→49개

### 디자인 ("The Record" LP 테마)
- [x] 포트폴리오(yousuk-portfolio) 디자인 시스템 이식: #111 비닐 블랙 + #D95A2B 번트 오렌지
- [x] 회전 LP 디스크(헤더/NOW PLAYING), 모노 라벨, LP판 앱 아이콘
- [x] 피드백 반영: 타이틀 축소(20/28px), Side A/B 문구 제거, 카드 메타 세로 통일,
      달력 공연 표시 강화, 페스티벌/일반 색 구분(오렌지/화이트, 지도-달력-카드 통일)

---

## 3. 남은 백로그 (다음 세션 후보)

| 우선순위 | 항목 | 비고 |
|---------|------|------|
| 중 | 카카오 로그인 | **카카오 개발자 콘솔에 앱 등록 + Firebase OIDC 설정 선행 필요** (코드만으론 불가) |
| 중 | 어드민 별도 Vercel 프로젝트 분리 | 현재는 proxy 차단으로 충분, 규모 커지면 |
| 중 | next/image 전환 + 이미지 최적화 | Blob 설정 후에 같이 |
| 하 | Sentry 에러 모니터링 | 계정/DSN 필요 |
| 하 | 방문 공연장 뱃지, 장르 태그 | 아이디어 단계 |

---

## 4. 운영 가이드

- **수집**: cron이 6시간마다 자동 (`vercel.json`). 수동은 어드민 → 수집 타겟 → "⚡ 수동 수집 실행"
- **페스티벌 라인업 갱신**: 어드민 → 공연 카드 → **"라인업 분석"** (포스터 AI 재분석)
- **중복 정리**: 어드민 → "🧹 중복 정리" (한국어 우선 병합)
- **공연장 별칭 추가**: `lib/venues.ts`의 `VENUE_ALIAS_GROUPS`에 한 줄 추가
- **관리자 추가**: `lib/admin-config.ts` + `firestore.rules` 양쪽 이메일 추가 후 `firebase deploy --only firestore:rules`
- **1회용 스크립트** (`scripts/`): `backfill-festivals.js`(페스티벌 재분석), `dedup-events.js`(DB 중복 병합, 사전에 `npx tsc lib/event-merge.ts lib/venues.ts --outDir .tmp-merge --module commonjs --target es2020 --skipLibCheck` 필요), `enable-anonymous-auth.js`(실행 완료), `generate-icons.js`(아이콘 재생성)

## 5. 주요 파일 지도

```
app/
  page.tsx, calendar/, map/, ticketbook/   ← 탭 화면 (서버 컴포넌트)
  components/                              ← 뷰/카드/탭바 등 클라이언트 컴포넌트
  events/[id]/                             ← 상세 (SSR + JSON-LD / 클라이언트 분리)
  venues/[slug]/                           ← 공연장 프로필
  admin/, login/                           ← 관리자 (proxy.ts로 격리)
  api/cron/fetch-sns/                      ← 6시간 자동 수집 파이프라인
  api/parse-event, fetch-insta, analyze-lineup  ← 관리자 인증 필수 API
lib/
  events.ts        ← 표시용 도메인 유틸 (가격 정규화 포함)
  event-merge.ts   ← 같은 공연 판정/병합 + 날짜범위 파서
  venues.ts        ← 공연장 별칭/쓰레기 필터
  ticketbook.ts    ← 로컬+클라우드 동기화 스토어
  ai-event-prompt.ts, api-auth.ts, admin-config.ts, ics.ts, share-image.ts
proxy.ts           ← 어드민 차단 (Next 16 미들웨어)
firestore.rules    ← 배포됨 (firebase deploy --only firestore:rules)
```
