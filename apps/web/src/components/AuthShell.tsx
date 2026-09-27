import { BrandLogo } from "@/components/BrandLogo";

interface AuthShellProps {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}

export function AuthShell({ title, subtitle, children }: AuthShellProps) {
  return (
    <div className="auth-page">
      <div className="auth-layout">
        <aside className="auth-brand">
          <BrandLogo href="/login" />
          <p className="auth-product-name">Pitch Factory</p>
          <p className="auth-tagline">
            From client research to an approved follow-up, all in one focused workspace.
          </p>
          <div className="auth-splash" aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
          </div>
          <p className="auth-footer-brand">Internal · Borek Solutions</p>
        </aside>

        <main className="auth-main">
          <div className="auth-main-header">
            <h1>{title}</h1>
            <p>{subtitle}</p>
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
