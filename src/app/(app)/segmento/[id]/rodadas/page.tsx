import Link from "next/link";
import { EmptyState } from "@/components/EmptyState";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { SegmentThesisPanel } from "@/components/SegmentThesisPanel";
import { StatTile } from "@/components/StatTile";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { loadRanking } from "@/lib/consolidated";
import { fmtDate } from "@/lib/data";
import { DIRECTORS_ENABLED, THESIS_ENABLED } from "@/lib/features";
import { DECISION_LABEL, TYPE_LABEL, buildActionItems, customToItem, focoTotals, isDecision, roundDone, roundStats, type ActionPlanLite, type MmtRecordLite, type RoundActionItemRow } from "@/lib/rounds";
import { loadRounds } from "@/lib/rounds-data";
import type { Level } from "@/lib/segment";
import { requireSegmentAccess } from "@/lib/segment-data";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Visão geral das rodadas de um segmento: andamento de cada grupo de BUs, as ofertas em Foco e o plano de ação. */
export default async function RodadasDoSegmentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, config, segment } = await requireSegmentAccess(id);
  const rounds = await loadRounds(supabase);

  const [ranking, prR, mmtR, planR, newR, stR, aiR] = await Promise.all([
    loadRanking(supabase, config, { segmentId: id }),
    supabase.from("round_priorities").select("offer_id,round_id,level,pitch_validated").eq("segment_id", id),
    supabase.from("mmt_records").select("id,type,bu_id,offer_id,regional,priority,headline,evidence,action,indicator,audience").eq("segment_id", id),
    supabase.from("mmt_action_plan").select("record_id,decision,owner,due_date,note").eq("segment_id", id),
    supabase.from("round_action_items").select("id,round_id,type,bu_id,headline,action,owner,due_date,note").eq("segment_id", id).order("created_at"),
    supabase.from("segment_strategies").select("thesis,message").eq("segment_id", id).maybeSingle(),
    supabase.from("segment_ai_texts").select("thesis,message").eq("segment_id", id).maybeSingle(),
  ]);
  const manual = stR.data as { thesis: string | null; message: string | null } | null;
  const aiTexts = aiR.data as { thesis: string | null; message: string | null } | null;
  const newItems = (newR.data ?? []) as (RoundActionItemRow & { round_id: string })[];
  const prio = new Map((prR.data ?? []).map((r) => [r.offer_id as string, { level: r.level as Level, pitchValidated: r.pitch_validated === true }]));
  const buCode = new Map(config.bus.map((b) => [b.id, b.code]));
  const mmt = (mmtR.data ?? []) as MmtRecordLite[];
  const offerIds = [...new Set(mmt.map((m) => m.offer_id).filter((x): x is string => !!x))];
  const { data: offerRows } = offerIds.length ? await supabase.from("offers").select("id,name").in("id", offerIds) : { data: [] };
  const plans = new Map(((planR.data ?? []) as ActionPlanLite[]).map((p) => [p.record_id, p]));

  const perRound = rounds.map((r) => {
    const buIds = new Set(r.buIds);
    const rows = ranking.filter((x) => buIds.has(x.bu.id)).map((x) => ({ ...x, level: prio.get(x.offerId)?.level ?? null, pitchValidated: prio.get(x.offerId)?.pitchValidated ?? false }));
    const items = [
      ...buildActionItems(mmt, plans, buIds, buCode, new Map((offerRows ?? []).map((o) => [o.id as string, o.name as string]))),
      ...newItems.filter((n) => n.round_id === r.id).map((n) => customToItem(n, buCode)),
    ];
    return { round: r, rows, items, stats: roundStats(rows, items) };
  });
  const totals = focoTotals(rounds, new Map(perRound.map((p) => [p.round.id, p.stats])));
  const decided = perRound.flatMap((p) => p.items.map((i) => ({ ...i, round: p.round.name }))).filter((i) => i.decision);
  const concluded = perRound.filter((p) => roundDone(p.stats)).length;

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href={`/segmento/${id}`}>Voltar ao segmento</BackLink>
      <PageHeader title={`Rodadas · ${segment.name}`} subtitle={`${segment.leader ? `Líder: ${segment.leader} · ` : ""}Cada rodada é um grupo de BUs: decidir o Foco, lapidar o pitch e validar os pontos dos regionais.`} />

      <section aria-label="Andamento" className="mb-5 grid gap-3 sm:grid-cols-3">
        <StatTile icon="target" tone="accent" label="Ofertas em Foco" value={<>{totals.foco}<span className="text-lg text-(--ink-3)"> / {totals.cap}</span></>} hint="soma das rodadas, até o limite de cada uma" />
        <StatTile icon="task_alt" label="Rodadas concluídas" value={<>{concluded}<span className="text-lg text-(--ink-3)"> / {rounds.length}</span></>} hint="Foco decidido, pitches validados e pontos com decisão" />
        <StatTile icon="list_alt" tone="forest" label="Pontos com decisão" value={<>{decided.length}<span className="text-lg text-(--ink-3)"> / {perRound.reduce((n, p) => n + p.items.length, 0)}</span></>} hint="plano de ação dos regionais" />
      </section>

      {rounds.length === 0 ? (
        <div className="card"><EmptyState icon="target" title="Nenhuma rodada configurada">A Diretoria define os grupos de BUs em Rodadas da reunião.</EmptyState></div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {perRound.map(({ round, rows, stats }) => {
            const state = roundDone(stats) ? "Concluída" : stats.foco + stats.apoio + stats.fora + stats.acoesDecididas > 0 ? "Em andamento" : "Não iniciada";
            return (
              <section key={round.id} className="card !p-5">
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="eyebrow">Rodada {round.position}</span>
                  <span className={`badge ml-auto ${state === "Concluída" ? "bg-(--brand) text-white" : state === "Em andamento" ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-700"}`}>{state}</span>
                </div>
                <h2 className="!text-xl">{round.name}</h2>
                <p className="mb-3 text-sm text-(--ink-3)">{round.buIds.map((b) => buCode.get(b) ?? "—").sort().join(" · ") || "Nenhuma BU"} · {rows.length} {rows.length === 1 ? "oferta pontuada" : "ofertas pontuadas"}</p>
                <dl className="mb-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-(--brand-50) p-2"><dd className="text-2xl font-semibold text-(--forest)">{stats.foco}<span className="text-sm text-(--ink-3)"> / {round.focoLimit}</span></dd><dt className="text-xs text-(--ink-3)">em Foco</dt></div>
                  <div className="rounded-xl bg-(--brand-50) p-2"><dd className="text-2xl font-semibold text-(--forest)">{stats.pitchesValidados}<span className="text-sm text-(--ink-3)"> / {stats.foco}</span></dd><dt className="text-xs text-(--ink-3)">pitches validados</dt></div>
                  <div className="rounded-xl bg-(--brand-50) p-2"><dd className="text-2xl font-semibold text-(--forest)">{stats.acoesDecididas}<span className="text-sm text-(--ink-3)"> / {stats.acoesTotal}</span></dd><dt className="text-xs text-(--ink-3)">pontos decididos</dt></div>
                </dl>
                <Link href={`/reuniao/${id}/rodada/${round.id}`} className="btn btn-primary"><Icon name="monitoring" size={18} />Abrir a rodada (projetar)</Link>
              </section>
            );
          })}
        </div>
      )}

      {DIRECTORS_ENABLED && rounds.length > 0 && (
        <SegmentThesisPanel segmentId={id} initial={{ thesis: aiTexts?.thesis ?? "", message: aiTexts?.message ?? "" }} manual={{ thesis: manual?.thesis ?? "", message: manual?.message ?? "" }} canGenerate={THESIS_ENABLED} focoCount={totals.foco} />
      )}

      <section className="mt-8">
        <h2 className="mb-2">Ofertas em Foco</h2>
        {totals.foco === 0 ? <Notice tone="info">Nenhuma oferta em Foco ainda. Elas aparecem aqui conforme as rodadas avançam.</Notice> : (
          <div className="table-wrap">
            <table className="min-w-[40rem]">
              <thead><tr><th className="th">Rodada</th><th className="th">Oferta</th><th className="th">BU</th><th className="th">Nota</th><th className="th">Pitch</th></tr></thead>
              <tbody>
                {perRound.flatMap((p) => p.rows.filter((r) => r.level === "foco").map((r) => (
                  <tr key={r.offerId}>
                    <td className="td text-sm">{p.round.position}. {p.round.name}</td>
                    <td className="td font-semibold text-(--forest)">{r.offerName}</td>
                    <td className="td">{r.bu.code}</td>
                    <td className="td tabular-nums">{r.score}</td>
                    <td className="td"><span className={`badge ${r.pitchValidated ? "bg-(--brand-100) text-(--brand-800)" : "bg-amber-100 text-amber-900"}`}>{r.pitchValidated ? "Validado" : "A validar"}</span></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="mt-8">
        <h2 className="mb-2">Plano de ação</h2>
        {decided.length === 0 ? <Notice tone="info">Os pontos Manter / Mudar / Treinar dos regionais que forem validados nas rodadas aparecem aqui, com responsável e prazo.</Notice> : (
          <div className="table-wrap">
            <table className="min-w-[56rem]">
              <thead><tr><th className="th">Rodada</th><th className="th">BU</th><th className="th">Tipo</th><th className="th">Ponto</th><th className="th">Decisão</th><th className="th">Responsável</th><th className="th">Prazo</th></tr></thead>
              <tbody>
                {decided.map((i) => (
                  <tr key={i.recordId} className={i.decision === "descartado" ? "opacity-60" : ""}>
                    <td className="td text-sm">{i.round}</td><td className="td">{i.buCode || "—"}</td><td className="td">{TYPE_LABEL[i.type] ?? (i.custom ? "Ação" : i.type)}</td>
                    <td className="td"><div className="font-semibold">{i.headline || "—"}</div>{i.offerName && <div className="text-xs text-(--ink-3)">{i.offerName}</div>}{i.note && <div className="text-xs text-(--ink-2)">{i.note}</div>}</td>
                    <td className="td">{i.custom ? "Item novo" : i.decision && isDecision(i.decision) ? DECISION_LABEL[i.decision] : "—"}</td>
                    <td className="td text-sm">{i.owner || "—"}</td><td className="td whitespace-nowrap text-sm">{i.due ? fmtDate(i.due) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
