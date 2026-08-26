import { NextResponse } from "next/server";
import { apiFetch, type CatalogResponse } from "@/lib/api/client";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  params.set("page", "1");
  const response = await apiFetch<CatalogResponse>(`/catalog?${params}`);

  return NextResponse.json(
    { totalRecords: response.meta.totalRecords },
    { headers: { "cache-control": "private, no-store" } },
  );
}
