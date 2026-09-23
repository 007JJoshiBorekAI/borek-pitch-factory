import { AuthCard } from "@/components/AuthCard";
import { AuthShell } from "@/components/AuthShell";

export default function LoginPage() {
  return (
    <AuthShell
      title="Welcome"
      subtitle="Sign in with your Borek account to continue."
    >
      <AuthCard mode="sign-in" />
    </AuthShell>
  );
}
