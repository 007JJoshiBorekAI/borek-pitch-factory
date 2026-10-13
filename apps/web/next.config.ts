import path from "node:path";
import { loadEnvConfig } from "@next/env";
import type { NextConfig } from "next";

const repoRoot = path.resolve(__dirname, "../..");
loadEnvConfig(repoRoot);

function mirrorEnv(source: string, target: string): void {
  if (!process.env[target]?.trim() && process.env[source]?.trim()) {
    process.env[target] = process.env[source];
  }
}

mirrorEnv("SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_URL");
mirrorEnv("SUPABASE_ANON_KEY", "NEXT_PUBLIC_SUPABASE_ANON_KEY");
// The web applies the same production guard to development sign-in as the API does.
mirrorEnv("RUNTIME_PROFILE", "NEXT_PUBLIC_RUNTIME_PROFILE");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    NEXT_PUBLIC_DEV_ACCESS_TOKEN: process.env.NEXT_PUBLIC_DEV_ACCESS_TOKEN,
    NEXT_PUBLIC_BYPASS_LOGIN: process.env.NEXT_PUBLIC_BYPASS_LOGIN,
    NEXT_PUBLIC_RUNTIME_PROFILE: process.env.NEXT_PUBLIC_RUNTIME_PROFILE,
    NEXT_PUBLIC_DEPLOYED_DEV_BYPASS: process.env.NEXT_PUBLIC_DEPLOYED_DEV_BYPASS,
    NEXT_PUBLIC_DEPLOYED_DEV_HOST: process.env.NEXT_PUBLIC_DEPLOYED_DEV_HOST,
  },
};

export default nextConfig;
