import type { MetadataRoute } from "next";
import { fetchEvents } from "@/lib/fetch-events";
import { prepareUpcomingEvents } from "@/lib/events";
import { venueGroupKey } from "@/lib/venues";
import { SITE_URL } from "@/lib/site";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: SITE_URL, changeFrequency: "hourly", priority: 1 },
    { url: `${SITE_URL}/calendar`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/map`, changeFrequency: "daily", priority: 0.8 },
    { url: `${SITE_URL}/ticketbook`, changeFrequency: "monthly", priority: 0.3 },
  ];

  try {
    const { events } = await fetchEvents();
    const upcoming = prepareUpcomingEvents(events);

    const eventRoutes: MetadataRoute.Sitemap = upcoming.slice(0, 500).map((event) => ({
      url: `${SITE_URL}/events/${event.id}`,
      changeFrequency: "daily" as const,
      priority: 0.7,
    }));

    const venueSlugs = Array.from(
      new Set(upcoming.map((event) => venueGroupKey(event.venueName)).filter(Boolean))
    );
    const venueRoutes: MetadataRoute.Sitemap = venueSlugs.map((slug) => ({
      url: `${SITE_URL}/venues/${encodeURIComponent(slug)}`,
      changeFrequency: "daily" as const,
      priority: 0.6,
    }));

    return [...staticRoutes, ...eventRoutes, ...venueRoutes];
  } catch {
    return staticRoutes;
  }
}
