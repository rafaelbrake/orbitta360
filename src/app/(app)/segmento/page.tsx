import Link from "next/link";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { PageHeader } from "@/components/ui";
import { loadConfig, loadSegmentLeaders } from "@/lib/data";
import { requireProfile } from "@/lib/session";

/** Segmentos que o usuário consolida: os que lidera (ou todos, para a Diretoria Corporativa). */
export default async function SegmentosPage() {
  const { supabase, profile } = await requireProfile();
  const [config, leaders] = await Promise.all([loadConfig(supabase), loadSegmentLeaders(supabase)]);
  const mine = config.activeSegments.filter((s) => profile.role === "admin" || (leaders.get(s.id) ?? []).includes(profile.id));
  if (mine.length === 1 && profile.role !== "admin") redirect(`/segmento/${mine[0].id}`);
  return (
    <div>
      <PageHeader title="Consolidação por segmento" subtitle="Prioridades, estratégia e book de cada segmento" />
      {mine.length === 0 ? (
        <div className="card"><EmptyState icon="target" title="Você não lidera nenhum segmento">A Diretoria Corporativa atribui os líderes em Segmentos.</EmptyState></div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {mine.map((s) => (
            <Link key={s.id} href={`/segmento/${s.id}`} className="card flex items-center gap-3 !p-4 transition-shadow hover:shadow-(--shadow-2)">
              <span className="grid size-10 place-items-center rounded-full bg-(--brand-100) text-(--brand-800)"><Icon name="target" size={20} /></span>
              <div className="min-w-0 flex-1"><div className="font-semibold text-(--forest)">{s.name}</div><div className="text-xs text-(--ink-3)">{s.leader ? `Líder: ${s.leader}` : "Sem líder atribuído"}</div></div>
              <Icon name="arrow_forward" size={18} className="text-(--ink-3)" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
