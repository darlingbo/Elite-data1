import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = "https://www.elitedata1.com";
  const now = new Date();

  return [
    { url: base, lastModified: now, changeFrequency: "daily", priority: 1 },
    { url: `${base}/buy`, lastModified: now, changeFrequency: "daily", priority: 0.9 },
    { url: `${base}/prices`, lastModified: now, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/track`, lastModified: now, changeFrequency: "monthly", priority: 0.6 },
    { url: `${base}/leaderboard`, lastModified: now, changeFrequency: "daily", priority: 0.5 },
    { url: `${base}/business`, lastModified: now, changeFrequency: "monthly", priority: 0.7 },
  ];
}
