import { Suspense } from "react";
import { HomePlaceholder, HomeView } from "@/components/home/home-view";
import { fetchHome } from "@/lib/api/home";

export const dynamic = "force-dynamic";

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
