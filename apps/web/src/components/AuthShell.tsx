"use client";

import Image from "next/image";

import { BrandLogo } from "@/components/BrandLogo";
import { useLanguage } from "@/components/LanguageProvider";
import authArtwork from "../../../../static images/borek bg image.png";

interface AuthShellProps {
  children: React.ReactNode;
}

export function AuthShell({ children }: AuthShellProps) {
  const { language, copy } = useLanguage();
  const authCopy = copy.auth;

  return (
    <div className="auth-page" lang={language}>
      <div className="auth-layout">
        <aside className="auth-brand">
          <div className="auth-brand-visual">
            <Image
              src={authArtwork}
              alt=""
              className="auth-artwork"
              priority
              sizes="(max-width: 960px) 100vw, 52vw"
            />
            <div className="auth-brand-identity">
              <BrandLogo href="/login" />
              <p className="auth-product-name">AI Pitch</p>
            </div>
          </div>
          <div className="auth-brand-message">
            <h2 className="auth-brand-headline">{authCopy.headline}</h2>
            <p className="auth-tagline">{authCopy.tagline}</p>
            <p className="auth-footer-brand">{authCopy.internal}</p>
          </div>
        </aside>

        <main className="auth-main">
          <div className="auth-main-inner">
            <div className="auth-main-header">
              <h1>{authCopy.welcome}</h1>
              <p>{authCopy.welcomeSubtitle}</p>
            </div>
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
