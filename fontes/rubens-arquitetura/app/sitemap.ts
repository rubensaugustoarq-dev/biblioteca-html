import type { MetadataRoute } from "next";
import { sobrados } from "./data/sobrados";

const base = "https://rubensaugustoarq-dev.github.io/biblioteca-html/projetos/rubens-arquitetura";

export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  return [
    { url: base, lastModified: now, changeFrequency: "monthly", priority: 1 },
    {
      url: `${base}/sobre`,
      lastModified: now,
      changeFrequency: "yearly",
      priority: 0.7,
    },
    {
      url: `${base}/sobrados`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.9,
    },
    ...sobrados.map((sobrado) => ({
      url: `${base}/sobrados/${sobrado.slug}`,
      lastModified: now,
      changeFrequency: "monthly" as const,
      priority: 0.8,
    })),
  ];
}
