import type { Metadata } from "next";
import { HomeView } from "@/components/home/home-view";
import { fetchHome } from "@/lib/api/home";
import { siteDescription, siteOpenGraph, siteTitle } from "@/lib/site";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: siteTitle },
  alternates: { canonical: "/" },
  openGraph: {
    ...siteOpenGraph,
    title: siteTitle,
    description: siteDescription,
    url: "/",
  },
};

// The home content is part of the first HTML response (no Suspense fallback
// streamed ahead of it), so it shows without JavaScript and to link-preview
// bots. fetchHome has a 3 s budget. Any failure (429 included) renders the
// skeleton, never an error page: the browser then tries once on its own.
export default async function HomePage() {
  const home = await fetchHome().catch(() => null);
  return <HomeView initialHome={home} />;
}
