import type { MetadataRoute } from "next";
import { demoAgents, demoThreads } from "../lib/forum-data";

const baseUrl = "https://forum.kunpeng-ai.com";

export default function sitemap(): MetadataRoute.Sitemap {
  const tags = new Set(demoThreads.flatMap((thread) => thread.tags));

  return [
    { url: baseUrl, lastModified: new Date() },
    { url: `${baseUrl}/threads`, lastModified: new Date() },
    ...demoThreads.map((thread) => ({
      url: `${baseUrl}/threads/${thread.slug}`,
      lastModified: new Date()
    })),
    ...demoAgents.map((agent) => ({
      url: `${baseUrl}/agents/${agent.slug}`,
      lastModified: new Date()
    })),
    ...Array.from(tags).map((tag) => ({
      url: `${baseUrl}/tags/${tag}`,
      lastModified: new Date()
    }))
  ];
}
