import Link from "next/link";
import { BuHeader } from "@/components/BuHeader";
import { ClassBadge, classStyle, Notice } from "@/components/ui";
import { EmptyState } from "@/components/EmptyState";
import { Icon } from "@/components/Icon";
import { Flash } from "@/components/Flash";
import { buSummary, fmtDateTime, loadEvaluations, loadOffers, requireBuAccess, requireStageReady, waveStatuses } from "@/lib/data";
import { WaveCards } from "@/components/WaveCards";
import { fmtDate } from "@/lib/format";
import { fmtTicket, isScorable } from "@/lib/offers";
import { isEvaluationDone } from "@/lib/scoring";
import { setBuTicket, submitBu } from "@/app/actions/bu";
import { SubmitButton } from "@/components/SubmitButton";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

type SP = Promise<Record<string, string | string[] | undefined>>;

export default async function MatrixPage({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: SP }) {
  const { code } = await params;
  const sp = await searchParams;
  const ctx = await requireBuAccess(code);
  const { supabase, profile, bu, config, editable, submission, stage } = ctx;
  requireStageReady(ctx); // classificar só depois de conferir as ofertas e agrupar
  const segs = config.activeSegments;

  const [allOffers, evals, gapsR, tickR, pitchR] = await Promise.all([
    loadOffers(supabase, bu.id),
    loadEvaluations(supabase, bu.id),
    supabase.rpc("submission_gaps", { p_bu: bu.id }),
    supabase.from("bu_ticket").select("ticket_medio").eq("bu_id", bu.id).maybeSingle(),
    supabase.from("pitches").select("offer_id,segment_id").eq("bu_id", bu.id),
  ]);
  const gaps = (gapsR.data ?? []) as { kind: string; offer_id: string | null; segment_id: string | null; detail: string }[];
  const buTicket = tickR.data ? Number(tickR.data.ticket_medio) : null;
  const byKey = new Map(evals.map((e) => [`${e.offer_id}:${e.segment_id}`, e]));
  // Pitch é por oferta × segmento: `pitchRequired` = células Alta/Potencial ainda sem ficha completa.
  const pitchKeys = new Set((pitchR.data ?? []).map((p) => `${p.offer_id}:${p.segment_id}`));
  const pitchRequired = new Set(gaps.filter((g) => g.kind === "pitch").map((g) => `${g.offer_id}:${g.segment_id}`));
  const offers = allOffers.filter(isScorable); // agrupamentos e ofertas avulsas
  const summary = buSummary(allOffers, segs, evals);
  const memberCount = new Map<string, number>();
  for (const o of allOffers) if (o.group_id) memberCount.set(o.group_id, (memberCount.get(o.group_id) ?? 0) + 1);
  const status = submission?.status;
  const bandLabel = Object.fromEntries(config.bands.map((b) => [b.code, b.label]));
  const submitted = status === "submitted";

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <BuHeader bu={bu} current="matriz" summary={summary} stage={stage} lock={profile.role === "head"} submission={submission} waves={config.waves} />
      {profile.role === "admin" && !stage.groupingConfirmedAt && <Notice tone="info" className="mb-4">O head ainda não concluiu as etapas de conferência das ofertas e de agrupamento. Você pode classificar mesmo assim, como Diretoria Corporativa.</Notice>}

      <div className="mb-5 space-y-3">
        {!config.settings.period_open && !submitted && <Notice tone="warn">O período de preenchimento está fechado. Fale com a Diretoria Corporativa.</Notice>}
        {submitted && <Notice tone="success">Enviado em {fmtDateTime(submission?.submitted_at)}. A edição está bloqueada; a Diretoria Corporativa pode reabrir se necessário.</Notice>}
        {status === "reopened" && <Notice tone="accent">Envio reaberto pela Diretoria Corporativa. Ajuste o que for preciso e envie novamente.</Notice>}
      </div>

      <WaveCards waves={waveStatuses(config.waves, offers, evals)} />

      <div className="card mb-5 flex flex-wrap items-end gap-x-6 gap-y-3">
        <form action={setBuTicket} className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="code" value={bu.code} />
          <div>
            <label className="label" htmlFor="ticket">Ticket médio da BU (R$/ano)</label>
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-(--ink-3)">R$</span>
              <input id="ticket" name="ticket" inputMode="decimal" defaultValue={buTicket ?? ""} disabled={!editable} className="input w-52 !pl-10" placeholder="250000" />
            </div>
          </div>
          {editable && <SubmitButton className="btn">Salvar</SubmitButton>}
        </form>
        <p className="max-w-md pb-1 text-xs text-(--ink-3)">
          Base da sugestão de nota do critério “Receita e margem”: nota 3 = ticket médio anual da BU; cada nota acima ou abaixo = ±{Math.round(config.settings.ticket_step * 100)}%. Ofertas recorrentes entram pelo valor mensal × 12; as pontuais, pelo volume do deal.
        </p>
      </div>

      {offers.length === 0 ? (
        <div className="card">
          <EmptyState icon="inventory_2" title="Nenhuma oferta ativa">
            Cadastre ou importe as ofertas da BU para começar a pontuar.
            <div className="mt-4"><Link className="btn btn-primary" href={`/bu/${bu.code}/ofertas`}>Cadastrar ou importar ofertas</Link></div>
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[40rem]">
            <thead>
              {config.waves.length > 1 && (
                <tr>
                  <th className="th sticky left-0 z-[2] bg-(--brand-50) !h-8 !py-1.5" />
                  {config.waves.map((w) => (
                    <th key={w.name} colSpan={w.segments.length} className="th !h-8 !whitespace-normal border-l border-(--line-strong) !py-1.5 text-center text-(--brand-800)">
                      {w.name}{w.deadline ? ` · entrega ${fmtDate(w.deadline).slice(0, 5)}` : ""}
                    </th>
                  ))}
                </tr>
              )}
              <tr>
                <th className={`th sticky left-0 z-[2] bg-(--brand-50) ${config.waves.length > 1 ? "!top-8" : ""}`}>Oferta</th>
                {segs.map((s) => (
                  <th key={s.id} className={`th !whitespace-normal ${config.waves.length > 1 ? "!top-8" : ""}`}>{s.name}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {offers.map((o) => (
                <tr key={o.id}>
                  <td className="td sticky left-0 z-[1] min-w-44 bg-white"><div className="font-semibold">{o.name}</div><div className="text-xs text-(--ink-3)">{o.is_group ? <span className="inline-flex items-center gap-1 font-medium text-(--brand)"><Icon name="list_alt" size={12} />Agrupamento de {memberCount.get(o.id) ?? 0} ofertas</span> : fmtTicket(o.ticket_medio, o.revenue_model)}</div></td>
                  {segs.map((s) => {
                    const e = byKey.get(`${o.id}:${s.id}`);
                    const done = isEvaluationDone(e);
                    const href = `/bu/${bu.code}/avaliar/${o.id}/${s.id}`;
                    const scored = !e?.not_applicable && e?.score != null;
                    const key = `${o.id}:${s.id}`;
                    const needsPitch = scored && (e?.class_code === "alta" || e?.class_code === "potencial");
                    const pitchMissing = pitchRequired.has(key);
                    return (
                      <td key={s.id} className="!p-1.5">
                        <div className="flex flex-col gap-1">
                        <Link
                          href={href}
                          aria-label={`${o.name} em ${s.name}: ${e?.not_applicable ? "não se aplica" : scored ? `score ${e!.score}, ${bandLabel[e!.class_code ?? ""]}` : "avaliar"}`}
                          className={`flex min-h-14 min-w-24 flex-col items-center justify-center rounded-lg px-2 py-1.5 text-center leading-tight transition-all hover:-translate-y-px hover:shadow-(--shadow-2) ${
                            e?.not_applicable
                              ? "bg-(--brand-50) text-(--ink-3) ring-1 ring-(--line)"
                              : scored
                                ? `${classStyle(e?.class_code)} shadow-(--shadow-1)`
                                : "border border-dashed border-(--line-strong) text-(--ink-3) hover:border-(--brand) hover:bg-(--brand-50) hover:text-(--brand)"
                          }`}
                        >
                          {e?.not_applicable ? (
                            <span className="text-xs font-semibold">N/A</span>
                          ) : scored ? (
                            <>
                              <span className="text-lg font-bold tabular-nums">{e!.score}</span>
                              <span className="text-[11px] font-medium opacity-90">{bandLabel[e!.class_code ?? ""]}</span>
                            </>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold"><Icon name={e ? "edit" : "add"} size={16} />{e ? "Continuar" : "Avaliar"}</span>
                          )}
                          {e && !done && !e.not_applicable && <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-bold underline decoration-dotted"><Icon name="warning" size={11} />incompleta</span>}
                          {e?.specialist_led && <span className="mt-0.5 inline-flex items-center gap-0.5 text-[10px] font-semibold"><Icon name="star" size={11} />Especialista</span>}
                        </Link>
                        {needsPitch && (
                          <Link
                            href={`/bu/${bu.code}/pitch/${o.id}/${s.id}`}
                            className={`inline-flex items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-semibold underline-offset-2 hover:underline ${pitchMissing ? "bg-(--danger-100) text-(--danger)" : "text-(--brand)"}`}
                          >
                            <Icon name={pitchMissing ? "error" : "check_circle"} size={13} />
                            {pitchMissing ? (pitchKeys.has(key) ? "Completar pitch" : "Pitch obrigatório") : "Pitch preenchido"}
                          </Link>
                        )}
                        </div>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-(--ink-3)">
        <span className="eyebrow mr-1">Legenda</span>
        {config.bands.map((b) => <ClassBadge key={b.code} code={b.code} label={`${b.label} (${b.min_score}–${b.max_score})`} />)}
      </div>

      <section className="card mt-6">
        <h2 className="mb-2">Envio</h2>
        {submitted ? (
          <p className="flex items-center gap-2 text-sm text-(--brand-800)"><Icon name="task_alt" size={20} /> Envio concluído.</p>
        ) : gaps.length > 0 ? (
          <>
            <p className="mb-3 text-sm text-(--ink-2)">Faltam <strong>{gaps.length}</strong> {gaps.length === 1 ? "item" : "itens"} para poder enviar:</p>
            <ul className="mb-4 max-h-52 space-y-1 overflow-auto rounded-lg bg-(--brand-50) p-3 text-sm">
              {gaps.map((g, i) => (
                <li key={i}>
                  <Link
                    className="group flex items-center gap-2 rounded px-1 py-0.5 text-(--forest) hover:bg-white"
                    href={g.kind === "pitch" ? `/bu/${bu.code}/pitch/${g.offer_id}/${g.segment_id}` : `/bu/${bu.code}/avaliar/${g.offer_id}/${g.segment_id}`}
                  >
                    <Icon name={g.kind === "pitch" ? "edit" : "list_alt"} size={16} className="text-(--ink-3)" />
                    <span className="flex-1">{g.detail}</span>
                    <Icon name="arrow_forward" size={16} className="opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
            <button className="btn btn-primary" disabled>Enviar à Diretoria Corporativa</button>
          </>
        ) : (
          <form action={submitBu}>
            <input type="hidden" name="code" value={bu.code} />
            <p className="mb-3 text-sm text-(--ink-2)">Tudo preenchido. Depois de enviar, a edição fica bloqueada.</p>
            <ConfirmSubmit className="btn btn-primary" disabled={!editable || offers.length === 0} title="Enviar à Diretoria Corporativa?" message="Depois do envio a edição fica bloqueada. Só a Diretoria Corporativa pode reabrir." confirmLabel="Enviar">Enviar à Diretoria Corporativa</ConfirmSubmit>
          </form>
        )}
      </section>
    </div>
  );
}
