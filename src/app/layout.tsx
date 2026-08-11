import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import type { ReactNode } from "react";
import { AppHeader } from "@/components/app-header";
import { MobileNav } from "@/components/mobile-nav";
import { Providers } from "@/components/providers";
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

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000",
  ),
  title: { default: "AnimeHub", template: "%s · AnimeHub" },
  description: "Catálogo de anime y envíos directos a JDownloader.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "AnimeHub",
    description: "Catálogo de anime y envíos directos a JDownloader.",
    siteName: "AnimeHub",
    locale: "es_ES",
    type: "website",
    url: "/",
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#0B0A09",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="es"
      className={`dark ${display.variable} ${body.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <Providers>
          <AppHeader />
          {children}
          <MobileNav />
        </Providers>
      </body>
    </html>
  );
}
