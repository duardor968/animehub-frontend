// Lightweight liveness endpoint for the container healthcheck. It must not depend
// on the API or the database, so Coolify can track the web server on its own.
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", {
    status: 200,
    headers: { "content-type": "text/plain", "cache-control": "no-store" },
  });
}
