import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { preconnect } from "react-dom";
import { AppHeader, SkipLink } from "@/components/app-header";
import { MobileNav } from "@/components/mobile-nav";
import { Providers } from "@/components/providers";
import { SiteFooter } from "@/components/site-footer";
import { siteDescription, siteName, siteOpenGraph, siteUrl } from "@/lib/site";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

// Only site-wide defaults live here. Canonical URLs and og:url are per page:
// a root canonical would make every page that forgets to set one (404,
// search…) declare itself a duplicate of the home page.
export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: siteName, template: `%s · ${siteName}` },
  description: siteDescription,
  applicationName: siteName,
  verification: {
    google: "U9F_PrksjHryRoa2g3LzrUKi_-uogOfpzb3uKUdd-po",
  },
  openGraph: siteOpenGraph,
};

export const viewport: Viewport = {
  colorScheme: "dark",
  // Matches --background so the mobile browser chrome blends with the header.
  themeColor: "#030711",
  // Lets env(safe-area-inset-*) report real insets (notch, home indicator).
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  // Artwork comes from the source CDN; open the connection while the HTML
  // streams so the hero image doesn't pay DNS + TLS on the critical path.
  preconnect("https://cdn.animeav1.com");
  return (
    <html
      lang="es"
      className={`dark ${display.variable} ${body.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <Providers>
          <div className="flex min-h-dvh flex-col">
            <SkipLink />
            <AppHeader />
            <div className="flex-1">{children}</div>
            <SiteFooter />
          </div>
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
