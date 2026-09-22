import { AuthCard } from "@/components/AuthCard";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in with Microsoft 365. Every generation, edit, and release is logged to your employee account."
    >
      <AuthCard mode="sign-in" />
    </AuthShell>
  );
}
