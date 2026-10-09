import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    // Internal search results are auto-generated and unbounded: keep crawlers
    // out of them (Google's guidance) and let them reach titles through the
    // sitemap and the catalog instead.
    rules: [{ userAgent: "*", allow: "/", disallow: ["/buscar"] }],
    sitemap: `${siteUrl}/sitemap.xml`,
  };
}
