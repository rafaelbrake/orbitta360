import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

export const root = path.resolve(import.meta.dirname, "..");

export function readJson<T = unknown>(name: string): T {
  return JSON.parse(readFileSync(path.join(root, "seed", name), "utf8")) as T;
}

export function adminClient() {
  const envFile = path.join(root, ".env.local");
  if (existsSync(envFile)) process.loadEnvFile(envFile);
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Defina NEXT_PUBLIC_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env.local");
    process.exit(1);
  }
  return { url, supabase: createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) };
}

export function must<T>(r: { data: T | null; error: { message: string } | null }, what: string): T {
  if (r.error) {
    console.error(`Erro em ${what}: ${r.error.message}`);
    process.exit(1);
  }
  return r.data as T;
}
