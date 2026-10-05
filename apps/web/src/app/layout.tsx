import type { Metadata } from "next";

import { AuthProvider } from "@/components/AuthProvider";
import { LanguageProvider } from "@/components/LanguageProvider";
import { PreviewJourneyProvider } from "@/components/PreviewJourneyProvider";

import "@fontsource/inter/300.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";

import "./globals.css";
import "./pitch-shell.css";

export const metadata: Metadata = {
  title: "Borek Pitch Factory",
  description: "Framework and presentation generation for sales engineering",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <LanguageProvider>
          <AuthProvider>
            <PreviewJourneyProvider>{children}</PreviewJourneyProvider>
          </AuthProvider>
        </LanguageProvider>
      </body>
    </html>
  );
}
