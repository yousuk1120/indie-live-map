import { getInstagramPosts } from "@/lib/instagram";

export default async function InstagramGallery({ username }: { username: string }) {
  const posts = await getInstagramPosts(username);

  if (!posts || posts.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-14 text-center text-sm text-[var(--muted)]">
        인스타그램 연동 데이터를 불러오지 못했습니다.
      </div>
    );
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-[var(--text)]">
          <span className="text-[var(--accent)]">@</span>{username} 갤러리
        </h2>
        <a 
          href={`https://instagram.com/${username}`} 
          target="_blank" 
          rel="noopener noreferrer"
          className="text-sm font-bold text-[var(--accent)] hover:underline"
        >
          Instagram 가기 →
        </a>
      </div>
      
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
        {posts.map((post) => (
          <a
            key={post.id}
            href={post.permalink}
            target="_blank"
            rel="noopener noreferrer"
            className="group relative aspect-square overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--panel-2)]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img 
              src={post.imageUrl} 
              alt={post.caption || "Instagram Post"} 
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            />
            {/* Hover Overlay */}
            <div className="absolute inset-0 bg-black/60 opacity-0 transition-opacity duration-300 group-hover:opacity-100 flex items-center justify-center p-4">
              <p className="text-white text-xs line-clamp-3 text-center font-medium">
                {post.caption || "View on Instagram"}
              </p>
            </div>
          </a>
        ))}
      </div>
    </section>
  );
}
