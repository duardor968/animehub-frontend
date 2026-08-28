import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  agentRules: false,
  allowedDevOrigins: ["127.0.0.1"],
  images: {
    unoptimized: true,
    remotePatterns: [
      {
        protocol: "https",
        hostname: "cdn.animeav1.com",
        pathname: "/covers/**",
      },
      {
        protocol: "https",
        hostname: "cdn.animeav1.com",
        pathname: "/backdrops/**",
      },
      {
        protocol: "https",
        hostname: "cdn.animeav1.com",
        pathname: "/screenshots/**",
      },
    ],
  },
  async headers() {
    const api =
      process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000/api/v1";
    const apiOrigin = new URL(api).origin;
    const developmentScripts =
      process.env.NODE_ENV === "production" ? "" : " 'unsafe-eval'";
    return [
      {
        source: "/(.*)",
        headers: [
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              "img-src 'self' data: https://cdn.animeav1.com",
              "style-src 'self' 'unsafe-inline'",
              `script-src 'self' 'unsafe-inline' https://static.cloudflareinsights.com${developmentScripts}`,
              `connect-src 'self' ${apiOrigin} https://api.jdownloader.org http://127.0.0.1:9666`,
              "form-action 'self' http://127.0.0.1:9666",
              "frame-src 'self' http://127.0.0.1:9666",
              "object-src 'none'",
              "base-uri 'self'",
              "frame-ancestors 'none'",
            ].join("; "),
          },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
