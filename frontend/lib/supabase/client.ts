import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://NOT-CONFIGURED.invalid";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "NOT-CONFIGURED";
  return createBrowserClient(url, anonKey);
}
