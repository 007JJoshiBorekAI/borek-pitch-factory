import { ProfilePanel } from "@/components/ProfilePanel";
import { RequireAuth } from "@/components/RequireAuth";

export default function ProfilePage() {
  return (
    <RequireAuth>
      <ProfilePanel />
    </RequireAuth>
  );
}
