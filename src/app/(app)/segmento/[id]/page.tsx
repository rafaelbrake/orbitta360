import Link from "next/link";
import { applySuggestion, finalizeSegment, reopenSegment } from "@/app/actions/segment";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EmptyState } from "@/components/EmptyState";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { PriorityTable, type PriorityRow } from "@/components/PriorityTable";
import { SegmentStrategyForm } from "@/components/SegmentStrategyForm";
import { SubmitButton } from "@/components/SubmitButton";
import { StatTile } from "@/components/StatTile";
import { Notice, PageHeader, Tabs } from "@/components/ui";
import { fmtDate, fmtDateTime } from "@/lib/data";
import { loadRanking } from "@/lib/consolidated";
import { isViewFilled } from "@/lib/regional";
import { DEFAULT_FOCO_LIMIT, levelCounts, strategyChecklist, type Level } from "@/lib/segment";
import { requireSegmentAccess } from "@/lib/segment-data";
import { MMT_LABEL } from "@/lib/mmt";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Consolidação do segmento: o líder vê ao vivo o que os heads classificaram e o que as regionais disseram, e fecha as prioridades. */
export default async function SegmentoPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: SP }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase, config, segment, isAdmin, isLeader } = await requireSegmentAccess(id);
  const tab = sp.tab === "regional" ? "regional" : "prioridades";

  const [rows, prR, stR, viewsR, mmtR, subR, lpR] = await Promise.all([
    loadRanking(supabase, config, { segmentId: id }),
    supabase.from("segment_priorities").select("offer_id,level,note").eq("segment_id", id),
    supabase.from("segment_strategies").select("*").eq("segment_id", id).maybeSingle(),
    supabase.from("regional_views").select("regional,works,not_works,updated_at").eq("segment_id", id),
    supabase.from("mmt_records").select("type,bu_id,offer_id,regional,headline,evidence,action").eq("segment_id", id),
    supabase.from("bu_submissions").select("bu_id,status"),
    supabase.from("segment_pitches").select("offer_id").eq("segment_id", id),
  ]);
  const leaderPitchOffers = new Set((lpR.data ?? []).map((r) => r.offer_id as string));
  const strategy = stR.data as { thesis: string | null; message: string | null; foco_limit: number; status: string; finalized_at: string | null } | null;
  const final = strategy?.status === "final";
  const focoLimit = strategy?.foco_limit ?? DEFAULT_FOCO_LIMIT;
  const canEdit = (isAdmin || isLeader) && !final;

  const levels: Record<string, Level> = {};
  const notes: Record<string, string> = {};
  for (const r of prR.data ?? []) { levels[r.offer_id as string] = r.level as Level; if (r.note) notes[r.offer_id as string] = r.note as string; }
  const counts = levelCounts(new Map(Object.entries(levels)));

  const mmt = (mmtR.data ?? []) as { type: string; bu_id: string; offer_id: string | null; regional: string | null; headline: string | null; evidence: string | null; action: string | null }[];
  const signalsByOffer = new Map<string, { regional: string; type: string }[]>();
  for (const m of mmt) if (m.offer_id) signalsByOffer.set(m.offer_id, [...(signalsByOffer.get(m.offer_id) ?? []), { regional: m.regional || "—", type: m.type }]);
  const bandLabel = Object.fromEntries(config.bands.map((b) => [b.code, b.label]));
  const tableRows: PriorityRow[] = rows.map((r) => ({
    offerId: r.offerId, code: r.offerCode, name: r.offerName, buCode: r.bu.code, score: r.score, classCode: r.classCode, classLabel: bandLabel[r.classCode] ?? r.classCode,
    hasPitch: r.hasPitch, leaderPitch: leaderPitchOffers.has(r.offerId), signals: signalsByOffer.get(r.offerId) ?? [],
  }));

  const views = ((viewsR.data ?? []) as { regional: string | null; works: string | null; not_works: string | null }[]).filter((v) => isViewFilled(v));
  const activeBus = config.bus.filter((b) => b.active);
  const buWithNotes = new Set(rows.map((r) => r.bu.id)).size;
  const submitted = (subR.data ?? []).filter((s) => s.status === "submitted").length;
  const wave = config.waves.find((w) => w.segments.some((s) => s.id === id));
  const checklist = strategyChecklist({ thesis: strategy?.thesis ?? null, message: strategy?.message ?? null }, counts, focoLimit);

  // Nomes das ofertas citadas nos destaques regionais
  const offerIds = [...new Set(mmt.map((m) => m.offer_id).filter((x): x is string => !!x))];
  const { data: offerRows } = offerIds.length ? await supabase.from("offers").select("id,name").in("id", offerIds) : { data: [] };
  const offerName = new Map((offerRows ?? []).map((o) => [o.id as string, o.name as string]));
  const buCode = new Map(config.bus.map((b) => [b.id, b.code]));

  const regionals = [...new Set([...views.map((v) => v.regional || "—"), ...mmt.map((m) => m.regional || "—")])].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const base = `/segmento/${id}`;

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader
        title={`Segmento ${segment.name}`}
        subtitle={`${segment.leader ? `Líder: ${segment.leader}` : "Sem líder atribuído"}${wave ? ` · ${wave.name}${wave.deadline ? `, heads entregam até ${fmtDate(wave.deadline)}` : ""}` : ""}`}
      >
        <span className={`badge ${final ? "bg-(--brand) text-white" : "bg-amber-100 text-amber-900"}`}><Icon name={final ? "lock_open" : "edit"} size={14} />{final ? "Versão final" : "Rascunho"}</span>
      </PageHeader>

      <section aria-label="Andamento" className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon="inventory_2" label="BUs com avaliações" value={<>{buWithNotes}<span className="text-lg text-(--ink-3)"> / {activeBus.length}</span></>} hint={`${submitted} já enviaram · ao vivo`} />
        <StatTile icon="bar_chart" label="Ofertas pontuadas" value={rows.length} hint="notas completas dos heads neste segmento" />
        <StatTile icon="target" tone="accent" label="Em Foco" value={<>{counts.foco}<span className="text-lg text-(--ink-3)"> / {focoLimit}</span></>} hint={`${counts.apoio} em Apoio · ${counts.fora} fora do radar`} />
        <StatTile icon="group" tone="forest" label="Visões regionais" value={views.length} hint={`${new Set(views.map((v) => v.regional)).size} região(ões) · ${mmt.length} destaques`} />
      </section>

      {final && (
        <Notice tone="success" className="mb-4">
          Versão final travada em {fmtDateTime(strategy?.finalized_at)}.{" "}
          {isAdmin ? (
            <form action={reopenSegment} className="ml-2 inline"><input type="hidden" name="segment_id" value={id} />
              <ConfirmSubmit className="btn btn-sm" title="Reabrir a versão final?" message="O líder volta a poder editar prioridades e estratégia, e a versão precisará ser travada de novo." confirmLabel="Reabrir">Reabrir</ConfirmSubmit>
            </form>
          ) : "Para mexer de novo, a Diretoria Corporativa precisa reabrir."}
        </Notice>
      )}

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link href={`/reuniao/${id}`} className="btn"><Icon name="monitoring" size={18} />Modo reunião (projetar)</Link>
        <span className="text-sm text-(--ink-3)">Tela cheia para a reunião: estratégia, ofertas em Foco e fechamento.</span>
      </div>

      {counts.foco + counts.apoio > 0 && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <Link href={`/book/${id}`} target="_blank" className="btn btn-primary"><Icon name="download" size={18} />Abrir o book para imprimir (PDF)</Link>
          <span className="text-sm text-(--ink-3)">Monta o book com a estratégia, as ofertas em Foco e em Apoio e os pitches. Abre em outra aba.</span>
        </div>
      )}

      <Tabs current={tab} items={[{ key: "prioridades", label: "Prioridades e estratégia", href: base }, { key: "regional", label: `Visão regional (${regionals.length})`, href: `${base}?tab=regional` }]} />

      {tab === "prioridades" ? (
        <div className="space-y-5">
          <SegmentStrategyForm segmentId={id} initial={{ thesis: strategy?.thesis ?? "", message: strategy?.message ?? "" }} readOnly={!canEdit} />

          <section>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2>Prioridades por oferta</h2>
              <span className="text-sm text-(--ink-3)">Ranking de todas as BUs, pela nota dos heads. O nível é decisão sua.</span>
              {canEdit && rows.length > 0 && (
                <form action={applySuggestion} className="ml-auto"><input type="hidden" name="segment_id" value={id} />
                  <SubmitButton className="btn" pendingLabel="Aplicando…"><Icon name="refresh" size={16} />Aplicar sugestão às ofertas sem nível</SubmitButton>
                </form>
              )}
            </div>
            {rows.length === 0 ? (
              <div className="card"><EmptyState icon="bar_chart" title="Ainda não há ofertas pontuadas neste segmento">As notas aparecem aqui ao vivo, conforme os heads concluem cada avaliação.</EmptyState></div>
            ) : (
              <PriorityTable segmentId={id} rows={tableRows} initialLevels={levels} initialNotes={notes} focoLimit={focoLimit} readOnly={!canEdit} />
            )}
          </section>

          {canEdit && (
            <section className="card !p-5">
              <h2 className="mb-2">Antes de travar a versão final</h2>
              <ul className="mb-3 space-y-1 text-sm">
                {checklist.map((c) => (
                  <li key={c.label} className="flex items-center gap-2"><Icon name={c.ok ? "task_alt" : "warning"} size={16} className={c.ok ? "text-(--brand)" : "text-amber-700"} /><span className={c.ok ? "" : "text-(--ink-2)"}>{c.label}</span></li>
                ))}
              </ul>
              <form action={finalizeSegment}><input type="hidden" name="segment_id" value={id} />
                <ConfirmSubmit className="btn btn-primary" title="Travar a versão final?" message="Depois de travar, ninguém edita prioridades e estratégia deste segmento. Só a Diretoria Corporativa pode reabrir." confirmLabel="Travar versão final">Travar versão final</ConfirmSubmit>
              </form>
            </section>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {regionals.length === 0 ? (
            <div className="card"><EmptyState icon="group" title="Nenhuma visão regional ainda">Os diretores registram em “Minha região”. O que chegar aparece aqui.</EmptyState></div>
          ) : regionals.map((reg) => {
            const v = views.find((x) => (x.regional || "—") === reg);
            const marks = mmt.filter((m) => (m.regional || "—") === reg);
            return (
              <section key={reg} className="card !p-5">
                <h2 className="mb-3">{reg}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><div className="eyebrow mb-1">O que funciona</div><p className="whitespace-pre-wrap text-sm">{v?.works || <span className="text-(--ink-3)">—</span>}</p></div>
                  <div><div className="eyebrow mb-1">O que não funciona ou precisa mudar</div><p className="whitespace-pre-wrap text-sm">{v?.not_works || <span className="text-(--ink-3)">—</span>}</p></div>
                </div>
                {marks.length > 0 && (
                  <div className="mt-4 border-t border-(--line) pt-3">
                    <div className="eyebrow mb-2">Destaques por oferta</div>
                    <ul className="space-y-1.5 text-sm">
                      {marks.map((m, i) => (
                        <li key={i} className="flex flex-wrap items-baseline gap-2">
                          <span className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">{MMT_LABEL[m.type as keyof typeof MMT_LABEL] ?? m.type}</span>
                          <span className="font-medium">{m.headline || "Sem título"}</span>
                          <span className="text-(--ink-3)">{buCode.get(m.bu_id)}{m.offer_id ? ` · ${offerName.get(m.offer_id) ?? ""}` : ""}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </section>
            );
          })}
          <p className="text-sm text-(--ink-3)"><Link href={base} className="underline">Voltar às prioridades</Link></p>
        </div>
      )}
    </div>
  );
}
