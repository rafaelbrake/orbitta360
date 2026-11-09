import { notFound, redirect } from "next/navigation";
import { loadConfig, loadSegmentLeaders } from "@/lib/data";
import { homeFor, requireProfile } from "@/lib/session";

/** Acesso à consolidação de um segmento: o líder dele ou a Diretoria Corporativa. Os outros voltam para a própria área. */
export async function requireSegmentAccess(segmentId: string) {
  const { supabase, profile } = await requireProfile();
  const [config, leaders] = await Promise.all([loadConfig(supabase), loadSegmentLeaders(supabase)]);
  const segment = config.segments.find((s) => s.id === segmentId);
  if (!segment) notFound();
  const isAdmin = profile.role === "admin";
  const isLeader = (leaders.get(segmentId) ?? []).includes(profile.id);
  if (!isAdmin && !isLeader) redirect(homeFor(profile.role));
  return { supabase, profile, config, segment, isAdmin, isLeader };
}
