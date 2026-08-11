// 포스터 이미지에서 공연 날짜·장소를 직접 읽어옵니다 (서버 전용).
//
// 한국 공연/페스티벌 포스터는 날짜·장소가 캡션 텍스트가 아니라 "이미지 안"에만 있는 경우가
// 많습니다. 캡션만으로 날짜를 못 뽑거나, 프리퀄/사전공연이 본 행사의 날짜를 잘못 빌려온
// 것으로 의심될 때, 포스터 이미지를 실제로 확인해 날짜를 검증/보강합니다.
//
// gpt-4o-mini는 멀티모달이므로 별도 모델/비용 등급 변경 없이 이미지 입력을 받습니다.
// 이 함수는 "보강용"이라 실패 시 항상 빈 값을 반환합니다(호출부는 폴백 가능해야 함).

import type OpenAI from "openai";
import { normalizeDateString } from "./event-merge";

export type PosterSchedule = { date: string; endDate: string; venue: string };

const EMPTY: PosterSchedule = { date: "", endDate: "", venue: "" };

// 이미지 URL을 내려받아 base64 data URL로 변환. OpenAI 서버는 인스타 CDN/비공개 Blob을
// 직접 못 받으므로 우리 서버가 받아서 인라인으로 넘깁니다.
async function fetchAsDataUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        Accept: "image/avif,image/webp,image/apng,image/*,*/*;q=0.8",
      },
    });
    if (!res.ok) return "";
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return "";
    const contentType = res.headers.get("content-type") || "image/jpeg";
    return `data:${contentType};base64,${buf.toString("base64")}`;
  } catch {
    return "";
  }
}

// 포스터 이미지에서 "그 공연 자체"의 날짜/장소만 추출합니다.
// hintTitle을 주면 어떤 공연을 봐야 하는지 힌트로 씁니다.
export async function extractScheduleFromPoster(
  openai: OpenAI,
  imageUrl: string,
  hintTitle?: string
): Promise<PosterSchedule> {
  if (!imageUrl) return EMPTY;
  const dataUrl = await fetchAsDataUrl(imageUrl);
  if (!dataUrl) return EMPTY;

  try {
    const res = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text:
                `이 공연 포스터 이미지를 보고 "이 포스터가 홍보하는 그 공연 자체"의 날짜와 장소만 추출하세요.` +
                (hintTitle ? ` (참고 제목: ${hintTitle})` : "") +
                `\n규칙:` +
                `\n- 현재 기준 연도는 2026년. 포스터에 연도가 없으면 2026으로 간주.` +
                `\n- 포스터에 실제로 보이는 그 공연의 날짜/장소만. 다른 행사(본 페스티벌 등)의 날짜는 넣지 마세요.` +
                `\n- 여러 날이면 endDate에 종료일, 하루면 endDate는 "".` +
                `\n- 확실하지 않으면 해당 필드는 "" 로 두세요(추측 금지).` +
                `\n반드시 이 JSON 형태로만: {"date":"YYYY-MM-DD 또는 \\"\\"","endDate":"YYYY-MM-DD 또는 \\"\\"","venue":"장소 또는 \\"\\""}`,
            },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
    });

    const raw = JSON.parse(res.choices[0].message.content || "{}") as Record<string, unknown>;
    return {
      date: normalizeDateString(typeof raw.date === "string" ? raw.date : ""),
      endDate: normalizeDateString(typeof raw.endDate === "string" ? raw.endDate : ""),
      venue: typeof raw.venue === "string" ? raw.venue.trim() : "",
    };
  } catch (error) {
    console.warn("[poster-vision] 이미지 날짜 추출 실패 (무시):", error);
    return EMPTY;
  }
}
