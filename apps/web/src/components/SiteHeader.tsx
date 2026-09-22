"use client";

import Link from "next/link";

import { BrandLogo } from "@/components/BrandLogo";
import { SignOutButton } from "@/components/SignOutButton";
import { useAuth } from "@/components/AuthProvider";

interface SiteHeaderProps {
  signedInEmail?: string | null;
  opportunityId?: string | null;
  onNewPresentation?: () => void;
}

export function SiteHeader({ signedInEmail, onNewPresentation }: SiteHeaderProps) {
  const { session, employee } = useAuth();
  const email = signedInEmail ?? session?.user.email ?? employee?.email ?? null;
  const ssoOnly = process.env.NEXT_PUBLIC_EMPLOYEE_SSO_ONLY === "true";

  return (
    <header className="site-header">
      <div className="site-header-inner">
        <BrandLogo showProductName href="/" />
        <nav className="site-nav" aria-label="Main navigation">
          {email ? (
            <>
              <Link href="/" className="site-nav-recent">Recent</Link>
              <Link href="/archive" className="site-nav-archive">Archive</Link>
              <Link href="/activity" className="site-nav-activity">Activity</Link>
              <Link
                href="/?new=1"
                className="site-nav-new"
                onClick={
                  onNewPresentation
                    ? (event) => {
                        event.preventDefault();
                        onNewPresentation();
                      }
                    : undefined
                }
              >
                <span className="site-nav-new-full">New presentation</span>
                <span className="site-nav-new-short">New</span>
              </Link>
              <span className="site-user" title={email}>
                {email}
                {employee?.role ? <span className="site-user-role">{employee.role}</span> : null}
              </span>
              <SignOutButton />
            </>
          ) : (
            <>
              <Link href="/login">Sign in</Link>
              {ssoOnly ? null : (
                <Link href="/register" className="site-nav-cta">
                  Register
                </Link>
              )}
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
