import Link from "next/link";
import { redirect } from "next/navigation";
import { currentStage, loadConfig, progressOf, statusOf, STATUS_LABEL } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import type { EvaluationScored, Offer, Submission } from "@/lib/types";
import { EmptyState } from "@/components/EmptyState";

export default async function BuList() {
  const { supabase, profile } = await requireProfile("admin", "head");
  const config = await loadConfig(supabase);
  let buIds: string[] | null = null;
  if (profile.role === "head") {
    const { data } = await supabase.from("user_bus").select("bu_id").eq("user_id", profile.id);
    buIds = (data ?? []).map((r) => r.bu_id);
  }
  const bus = config.bus.filter((b) => b.active && (!buIds || buIds.includes(b.id)));
  if (profile.role === "head" && bus.length === 1) redirect(`/bu/${bus[0].code}`);

  // O RLS já limita ao que o usuário pode ver.
  const [offersR, evalsR, subsR, progR] = await Promise.all([
    supabase.from("offers").select("*"),
    supabase.from("evaluations_scored").select("*"),
    supabase.from("bu_submissions").select("*"),
    supabase.from("bu_progress").select("bu_id,offers_confirmed_at,grouping_confirmed_at"),
  ]);
  const offers = (offersR.data ?? []) as Offer[];
  const evals = (evalsR.data ?? []) as EvaluationScored[];
  const subs = (subsR.data ?? []) as Submission[];
  const stageOf = (buId: string) => {
    const p = (progR.data ?? []).find((x) => x.bu_id === buId);
    return currentStage({ offersConfirmedAt: p?.offers_confirmed_at ?? null, groupingConfirmedAt: p?.grouping_confirmed_at ?? null });
  };
  const STAGE_LABEL = { ofertas: "Etapa 1 · Conferir as ofertas", agrupamento: "Etapa 2 · Agrupar", classificacao: "Etapa 3 · Classificar" } as const;

  return (
    <div>
      <PageHeader title={profile.role === "admin" ? "Todas as BUs" : "Minhas BUs"} subtitle="Abra uma BU para pontuar ofertas, preencher pitches e enviar." />
      {bus.length === 0 && <div className="card"><EmptyState icon="inventory_2" title="Nenhuma BU atribuída">Fale com a Diretoria Corporativa para receber acesso.</EmptyState></div>}
      <div className="grid gap-4 md:grid-cols-2">
        {bus.map((b) => {
          const pr = progressOf(offers.filter((o) => o.bu_id === b.id), config.activeSegments, evals.filter((e) => e.bu_id === b.id));
          const st = statusOf(subs.find((s) => s.bu_id === b.id) ?? null, pr.done);
          return (
            <Link key={b.id} href={`/bu/${b.code}`} className="card card-interactive block">
              <div className="mb-2 flex items-center gap-2">
                <span className="grid size-9 place-items-center rounded-lg bg-(--brand-100) font-[family-name:var(--font-oswald)] text-(--brand-800)">{b.code}</span>
                <span className="font-semibold text-(--forest)">{b.name}</span>
                <span className="ml-auto"><StatusBadge status={st} label={STATUS_LABEL[st]} /></span>
              </div>
              <p className="mb-2 text-xs font-medium text-(--ink-3)">{STAGE_LABEL[stageOf(b.id)]}</p>
              <ProgressBar done={pr.done} total={pr.total} />
            </Link>
          );
        })}
      </div>
    </div>
  );
}
