import type { Metadata } from "next";
import { Suspense } from "react";
import { HomePlaceholder, HomeView } from "@/components/home/home-view";
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

async function HomeData() {
  const home = await fetchHome().catch(() => null);
  return <HomeView initialHome={home} />;
}

export default function HomePage() {
  return (
    <Suspense fallback={<HomePlaceholder />}>
      <HomeData />
    </Suspense>
  );
}
