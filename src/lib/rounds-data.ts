import type { SupabaseClient } from "@supabase/supabase-js";
import { DEFAULT_ROUND_LIMIT, type Round } from "@/lib/rounds";

/** Rodadas com as BUs de cada uma, na ordem da reunião. A leitura é da Diretoria e dos líderes de segmento (RLS). */
export async function loadRounds(supabase: SupabaseClient): Promise<Round[]> {
  const [r, rb] = await Promise.all([
    supabase.from("meeting_rounds").select("id,position,name,context,foco_limit").order("position"),
    supabase.from("meeting_round_bus").select("bu_id,round_id"),
  ]);
  const byRound = new Map<string, string[]>();
  for (const x of (rb.data ?? []) as { bu_id: string; round_id: string }[]) byRound.set(x.round_id, [...(byRound.get(x.round_id) ?? []), x.bu_id]);
  return ((r.data ?? []) as { id: string; position: number; name: string; context: string | null; foco_limit: number | null }[]).map((x) => ({
    id: x.id, position: x.position, name: x.name, context: x.context, focoLimit: x.foco_limit ?? DEFAULT_ROUND_LIMIT, buIds: byRound.get(x.id) ?? [],
  }));
}
