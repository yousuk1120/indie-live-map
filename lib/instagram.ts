import { unstable_cache } from "next/cache";

export type InstagramPost = {
  id: string;
  imageUrl: string;
  caption: string;
  permalink: string;
};

// 인스타그램 스크래핑 함수 (RapidAPI 연동을 가정)
// 유저의 간섭 없이 안정적으로 동작하도록 Next.js 캐싱을 활용 (revalidate: 86400 -> 24시간)
export const getInstagramPosts = unstable_cache(
  async (username: string): Promise<InstagramPost[]> => {
    try {
      const apiKey = process.env.RAPIDAPI_KEY;
      if (!apiKey) {
        // API 키가 없을 때의 안전한 폴백 (에러 방지)
        return [
          {
            id: "fallback-1",
            imageUrl: "https://images.unsplash.com/photo-1493225457124-a1a2a5f5c9ea?w=500&q=80",
            caption: "인스타그램 연동을 대기 중입니다. (.env에 RAPIDAPI_KEY 설정 필요)",
            permalink: "#",
          },
        ];
      }

      // RapidAPI Instagram Scraper 호출 예시 (instagram-scraper-api2 등)
      const res = await fetch(`https://instagram-scraper-api2.p.rapidapi.com/v1/info?username_or_id_or_url=${username}`, {
        headers: {
          "X-RapidAPI-Key": apiKey,
          "X-RapidAPI-Host": "instagram-scraper-api2.p.rapidapi.com",
        },
      });

      if (!res.ok) throw new Error("Instagram fetch failed");

      const data = await res.json();
      
      // 실제 API의 응답 구조에 맞게 파싱
      // (여기서는 일반적인 Graph API 유사 구조를 가정)
      const posts: InstagramPost[] = (data?.data?.items || []).slice(0, 12).map((item: any) => ({
        id: item.id,
        imageUrl: item.image_versions2?.candidates?.[0]?.url || item.thumbnail_url || "",
        caption: item.caption?.text || "",
        permalink: `https://instagram.com/p/${item.code}/`,
      }));

      return posts;
    } catch (error) {
      console.error("Instagram fetch error:", error);
      return [];
    }
  },
  ["instagram-posts"],
  { revalidate: 86400 } // 24시간 캐싱 (무료 제한 방어)
);
