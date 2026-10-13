import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_Devanagari } from "next/font/google";
import "./globals.css";
import { I18nProvider } from "@/lib/i18n/provider";
import { AppInfoProvider } from "@/lib/app-info";
import { ServiceWorkerRegistration } from "@/components/ServiceWorkerRegistration";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const notoDevanagari = Noto_Sans_Devanagari({
  subsets: ["devanagari"],
  variable: "--font-noto-devanagari",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DawaiSaathi — दवाई साथी",
  description:
    "Snap your meds once; spoken dosing, interaction checks, generic savings, and reminder calls for any phone.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/logo.png", apple: "/logo.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Elder accessibility: never lock zoom (02-DESIGN §9).
  // "cover" makes env(safe-area-inset-*) report real notch/home-indicator
  // insets; the header and tab bar already pad themselves with them.
  viewportFit: "cover",
  themeColor: "#0f766e",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The font variables must live on <html>: Tailwind declares --font-sans on
    // :root, and a var() there cannot see variables scoped to <body> — the
    // whole stack would resolve as invalid and fall back to a serif font.
    <html suppressHydrationWarning className={`${inter.variable} ${notoDevanagari.variable}`}>
      <body className="antialiased">
        <I18nProvider>
          <AppInfoProvider>
            {children}
            <ServiceWorkerRegistration />
          </AppInfoProvider>
        </I18nProvider>
      </body>
    </html>
  );
}
