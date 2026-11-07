import type { SupabaseClient } from "@supabase/supabase-js";
import type { Config } from "@/lib/data";
import type { Profile, Segment } from "@/lib/types";

/**
 * Segmentos em que o diretor pode registrar: os atribuídos ao perfil (se houver) ou todos os ativos.
 * Mantém o segmento já gravado no registro para a tela nunca mostrar um valor "órfão".
 */
export async function allowedSegments(supabase: SupabaseClient, profile: Pick<Profile, "id" | "role">, config: Config, keepId?: string): Promise<Segment[]> {
  if (profile.role === "admin") return config.segments;
  const { data } = await supabase.from("user_segments").select("segment_id").eq("user_id", profile.id);
  const assigned = new Set((data ?? []).map((r) => r.segment_id as string));
  return config.segments.filter((s) => (assigned.size ? assigned.has(s.id) : s.active) || s.id === keepId);
}
