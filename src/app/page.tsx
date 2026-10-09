import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view";
import { fetchHome } from "@/lib/api/home";
import { siteDescription, siteName, siteOpenGraph } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    ...siteOpenGraph,
    title: siteName,
    description: siteDescription,
    url: "/",
  },
};

// The home content is part of the first HTML response (no Suspense fallback
// streamed ahead of it), so it shows without JavaScript and to link-preview
// bots. fetchHome has a 3 s budget; without data HomeView renders the
// skeleton and recovers on the client.
export default async function HomePage() {
  const home = await fetchHome().catch(() => null);
  return <HomeView initialHome={home} />;
}
