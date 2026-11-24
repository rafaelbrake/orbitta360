"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { copyLeaderDraft, saveActionItem, saveRoundNotes, setPitchValidated, setRoundPriority, setRoundPriorityNote } from "@/app/actions/rounds";
import { saveLeaderPitch } from "@/app/actions/segment";
import { Icon } from "@/components/Icon";
import { PitchForm, type PitchValues } from "@/components/PitchForm";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";
import { ClassBadge } from "@/components/ui";
import { clip, hasPitchContent, type PitchData } from "@/lib/book";
import { clampIndex, indexOfKey, keyToMove, slideCounter } from "@/lib/meeting";
import { sanitizePitch } from "@/lib/pitch";
import { DECISIONS, DECISION_LABEL, DECISION_STYLE, TYPE_LABEL, buildRoundSlides, isDecision, roundStats, type ActionItem, type Decision, type RoundRow } from "@/lib/rounds";
import { LEVELS, LEVEL_LABEL, LEVEL_STYLE, type Level } from "@/lib/segment";

export interface RoundDeckProps {
  segmentId: string; segmentName: string; leader: string | null; final: boolean; canEdit: boolean;
  round: { id: string; position: number; name: string; context: string | null; focoLimit: number; buCodes: string[] };
  roundCount: number; prevRoundId: string | null; nextRoundId: string | null;
  rows: RoundRow[]; items: ActionItem[]; regional: { regional: string; works: string | null; not_works: string | null }[];
  notes: string; hasDraft: boolean;
  /** tela em que a apresentação abre (vem do endereço, para atualizar a página sem perder o lugar) */
  initialKey?: string;
}

const SIGNAL_STYLE: Record<string, string> = { manter: "bg-(--brand-100) text-(--brand-800)", mudar: "bg-(--accent-100) text-(--accent-800)", treinar: "bg-slate-200 text-slate-700" };
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-(--brand-800)">{title}</h3><div className="text-[19px] leading-snug">{children}</div></section>;
}

/** Pitch (do líder ou do head) → valores do formulário. Sem pitch, parte da descrição e do modelo da oferta. */
function toValues(p: PitchData | null, r: Pick<RoundRow, "description" | "revenueModel" | "ticket">): PitchValues {
  return {
    descricao: p ? (p.descricao ?? "") : (r.description ?? ""),
    dores: p?.dores ?? "", proposta_valor: p?.proposta_valor ?? "", pitch_abertura: p?.pitch_abertura ?? "",
    pergunta_1: p?.pergunta_1 ?? "", pergunta_2: p?.pergunta_2 ?? "", pergunta_3: p?.pergunta_3 ?? "",
    cases: p?.cases ?? [],
    perfil_cliente: p?.perfil_cliente ?? "", persona_decisora: p?.persona_decisora ?? "", persona_influenciadora: p?.persona_influenciadora ?? "",
    funcionarios_min: p?.funcionarios_min != null ? String(p.funcionarios_min) : "", funcionarios_max: p?.funcionarios_max != null ? String(p.funcionarios_max) : "",
    modelo_receita: p ? (p.modelo_receita ?? "") : (r.revenueModel ?? ""),
    ticket_medio: p ? (p.ticket_medio != null ? String(Number(p.ticket_medio)) : "") : (r.ticket != null ? String(r.ticket) : ""),
  };
}

/** Apresentação de uma rodada (grupo de BUs) de um segmento: decisão de Foco, pitch, pontos dos regionais e fechamento. */
export function RoundDeck(p: RoundDeckProps) {
  const [rows, setRows] = useState<RoundRow[]>(p.rows);
  const [items, setItems] = useState<ActionItem[]>(p.items);
  const [notes, setNotes] = useState(p.notes);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState(p.initialKey || "abertura");
  const [full, setFull] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [levelFilter, setLevelFilter] = useState("");
  const [onlyPending, setOnlyPending] = useState(false);
  const [typeFilter, setTypeFilter] = useState("");

  const slides = useMemo(() => buildRoundSlides(rows, { hasContext: !!(p.round.context ?? "").trim(), hasRegional: p.regional.length > 0, hasActions: items.length > 0 }), [rows, items.length, p.round.context, p.regional.length]);
  const index = clampIndex(indexOfKey(slides, key), slides.length);
  const slide = slides[index];
  const stats = roundStats(rows, items);
  const limit = p.round.focoLimit;

  const go = useCallback((i: number) => { setEditing(null); setKey(slides[clampIndex(i, slides.length)].key); }, [slides]);
  useEffect(() => {
    const u = new URL(window.location.href); u.searchParams.set("s", slide.key); window.history.replaceState(null, "", u);
  }, [slide.key]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key.toLowerCase() === "f") { void toggleFull(); return; }
      const m = keyToMove(e.key, e.shiftKey);
      if (!m) return;
      e.preventDefault();
      go(m.to === "start" ? 0 : m.to === "end" ? slides.length - 1 : index + (m.by ?? 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, slides.length]);
  useEffect(() => {
    const on = () => setFull(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  async function toggleFull() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch { /* o navegador pode negar */ }
  }

  const patch = (offerId: string, change: Partial<RoundRow>) => setRows((rs) => rs.map((r) => (r.offerId === offerId ? { ...r, ...change } : r)));
  const setErr = (id: string, msg: string | null) => setErrors((e) => { const n = { ...e }; if (msg) n[id] = msg; else delete n[id]; return n; });

  async function changeLevel(r: RoundRow, next: string) {
    const level = (next || null) as Level | null;
    const prev = { level: r.level, pitchValidated: r.pitchValidated };
    setErr(r.offerId, null);
    patch(r.offerId, { level, ...(level === null ? { note: null, pitchValidated: false } : {}) });
    const res = await setRoundPriority(p.segmentId, r.offerId, level);
    if (!res.ok) { patch(r.offerId, prev); setErr(r.offerId, res.error); }
  }
  async function saveNote(r: RoundRow) {
    if (!r.level) return;
    const res = await setRoundPriorityNote(p.segmentId, r.offerId, r.note ?? "");
    if (!res.ok) setErr(r.offerId, res.error);
  }
  async function toggleValidated(r: RoundRow, v: boolean) {
    patch(r.offerId, { pitchValidated: v });
    const res = await setPitchValidated(p.segmentId, r.offerId, v);
    if (!res.ok) { patch(r.offerId, { pitchValidated: !v }); setErr(r.offerId, res.error); }
  }
  async function commit(item: ActionItem, change: Partial<ActionItem>) {
    const next = { ...item, ...change };
    setItems((l) => l.map((i) => (i.recordId === item.recordId ? next : i)));
    setErr(item.recordId, null);
    const res = await saveActionItem(item.recordId, { decision: next.decision, owner: next.owner, due: next.due, note: next.note });
    if (!res.ok) { setItems((l) => l.map((i) => (i.recordId === item.recordId ? item : i))); setErr(item.recordId, res.error); }
  }
  const editItem = (item: ActionItem, change: Partial<ActionItem>) => setItems((l) => l.map((i) => (i.recordId === item.recordId ? { ...i, ...change } : i)));

  const { status: notesStatus, saveNow: saveNotesNow } = useAutosave(notes, (v) => saveRoundNotes(p.segmentId, p.round.id, v), { disabled: !p.canEdit });

  const levelSelect = (r: RoundRow, big = false) => (
    <select aria-label={`Nível de ${r.name}`} disabled={!p.canEdit} value={r.level ?? ""} onChange={(e) => void changeLevel(r, e.target.value)}
      className={`input ${big ? "!min-h-12 !w-52 !text-lg" : "!min-h-9 !w-36"} ${r.level ? `!border-transparent font-semibold ${LEVEL_STYLE[r.level]}` : ""}`}>
      <option value="">Sem nível</option>
      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
    </select>
  );
  const err = (id: string) => errors[id] && <div className="text-sm text-(--danger)" role="alert">{errors[id]}</div>;
  const chips = (s: { regional: string; type: string }[]) => s.length === 0
    ? <span className="text-sm text-(--ink-3)">Nenhum destaque.</span>
    : s.map((x, k) => <span key={k} className={`badge ${SIGNAL_STYLE[x.type] ?? ""}`}>{x.regional} · {TYPE_LABEL[x.type] ?? x.type}</span>);
  const countBadges = (
    <>
      <span className="badge !text-base bg-(--brand) text-white">Foco {stats.foco} de {limit}</span>
      <span className="badge !text-base bg-(--accent-100) text-(--accent-800)">Apoio {stats.apoio}</span>
      <span className="badge !text-base bg-slate-200 text-slate-700">Fora do radar {stats.fora}</span>
    </>
  );

  const body = () => {
    switch (slide.kind) {
      case "abertura":
        return (
          <div className="flex h-full flex-col justify-center">
            <div className="text-lg uppercase tracking-[0.2em] text-(--brand-800)">Rodada {p.round.position} de {p.roundCount} · {p.segmentName}</div>
            <h1 className="mt-3 text-7xl font-medium text-(--forest)">{p.round.name}</h1>
            <div className="mt-5 h-1.5 w-24 rounded bg-(--accent)" />
            <p className="mt-6 text-2xl text-(--ink-2)">BUs desta rodada: <b className="text-(--forest)">{p.round.buCodes.join(" · ") || "nenhuma"}</b></p>
            {p.leader && <p className="mt-1 text-xl text-(--ink-3)">Líder do segmento: {p.leader}</p>}
            <div className="mt-10 grid max-w-4xl gap-4 sm:grid-cols-4">
              {[["Ofertas pontuadas", String(rows.length)], ["Em Foco", `${stats.foco} de ${limit}`], ["Pontos dos regionais", String(items.length)], ["Pontos validados", `${stats.acoesDecididas} de ${items.length}`]].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-(--line) bg-(--brand-50) p-4"><div className="text-sm text-(--ink-3)">{k}</div><div className="mt-1 text-4xl font-semibold text-(--forest)">{v}</div></div>
              ))}
            </div>
            <p className="mt-8 text-lg text-(--ink-3)">Use as setas ← → para navegar · F para tela cheia · {p.final ? "Versão final travada" : "Rascunho em edição"}</p>
          </div>
        );
      case "contexto":
        return (
          <div className="mx-auto max-w-5xl">
            <h2 className="mb-6 text-5xl text-(--forest)">Contexto da rodada</h2>
            <p className="whitespace-pre-wrap text-[26px] leading-snug">{p.round.context}</p>
          </div>
        );
      case "mesa": {
        const term = q.trim().toLowerCase();
        const shown = rows.filter((r) => (!term || `${r.name} ${r.buCode} ${r.code ?? ""}`.toLowerCase().includes(term)) && (!levelFilter || (levelFilter === "sem" ? !r.level : r.level === levelFilter)));
        return (
          <div className="mx-auto max-w-7xl">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-5xl text-(--forest)">Mesa de decisão</h2>{countBadges}
            </div>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <input type="search" aria-label="Buscar oferta" placeholder="Buscar oferta ou BU" className="input !w-64" value={q} onChange={(e) => setQ(e.target.value)} />
              <select aria-label="Filtrar por nível" className="input !w-48" value={levelFilter} onChange={(e) => setLevelFilter(e.target.value)}>
                <option value="">Todos os níveis</option><option value="sem">Sem nível ({stats.semNivel})</option>
                {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
              </select>
              <span className="text-sm text-(--ink-3)">{shown.length} de {rows.length} ofertas</span>
              {p.canEdit && p.hasDraft && (
                <form action={copyLeaderDraft} className="ml-auto">
                  <input type="hidden" name="segment_id" value={p.segmentId} /><input type="hidden" name="round_id" value={p.round.id} />
                  <button className="btn btn-sm" title="Copia o nível que o líder já tinha definido, só para as ofertas desta rodada que ainda não têm decisão"><Icon name="content_copy" size={16} />Partir do rascunho do líder</button>
                </form>
              )}
            </div>
            <div className="table-wrap !max-h-[62vh]">
              <table className="min-w-[56rem] text-lg">
                <thead><tr><th className="th">#</th><th className="th">Oferta</th><th className="th">BU</th><th className="th">Nota</th><th className="th">Regionais</th><th className="th">Nível</th></tr></thead>
                <tbody>
                  {shown.map((r) => (
                    <tr key={r.offerId}>
                      <td className="td tabular-nums text-(--ink-3)">{rows.indexOf(r) + 1}</td>
                      <td className="td font-semibold text-(--forest)">{r.name}</td>
                      <td className="td">{r.buCode}</td>
                      <td className="td whitespace-nowrap"><b className="mr-2 tabular-nums">{r.score}</b><ClassBadge code={r.classCode} label={r.classLabel} /></td>
                      <td className="td"><div className="flex flex-wrap gap-1">{chips(r.signals)}</div></td>
                      <td className="td">{levelSelect(r)}{err(r.offerId)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      }
      case "oferta": {
        const r = rows.find((x) => x.offerId === slide.offerId);
        if (!r) return null;
        if (editing === r.offerId) {
          const initial = toValues(r.pitch, r);
          return (
            <div className="mx-auto max-w-5xl">
              <button type="button" className="btn mb-3" onClick={() => setEditing(null)}><Icon name="arrow_back" size={16} />Voltar à apresentação</button>
              <PitchForm
                key={r.offerId} mode="lider" offerId={r.offerId} segmentId={p.segmentId} offerName={r.name} segmentName={p.segmentName} classLabel={r.classLabel}
                initial={initial} prefilled={false} readOnly={!p.canEdit} backHref={`/segmento/${p.segmentId}`} backLabel="Voltar ao segmento"
                save={async (values) => {
                  const res = await saveLeaderPitch({ segmentId: p.segmentId, offerId: r.offerId, values });
                  if (res.ok) patch(r.offerId, { pitch: sanitizePitch(values) as unknown as PitchData, pitchSource: "lider" });
                  return res;
                }}
              />
            </div>
          );
        }
        const pt = r.pitch;
        const qs = [pt?.pergunta_1, pt?.pergunta_2, pt?.pergunta_3].filter((x) => (x ?? "").trim());
        const cases = pt?.cases ?? [];
        return (
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-base"><span className="badge !text-base bg-(--brand) text-white">Foco</span><span className="badge !text-base bg-(--brand-50) ring-1 ring-(--line)">{r.buCode}{r.code ? ` · ${r.code}` : ""}</span><span className="font-semibold tabular-nums">Nota {r.score}</span><ClassBadge code={r.classCode} label={r.classLabel} /></div>
              <h2 className="text-5xl leading-tight text-(--forest)">{r.name}</h2>
              {(pt?.descricao ?? r.description ?? "").trim() && <p className="text-[21px] text-(--ink-2)">{pt?.descricao ?? r.description}</p>}
              {hasPitchContent(pt) ? (
                <div className="grid gap-5">
                  {pt?.dores && <Block title="Dores do cliente"><p className="whitespace-pre-wrap">{pt.dores}</p></Block>}
                  {pt?.proposta_valor && <Block title="Proposta de valor"><p className="whitespace-pre-wrap">{pt.proposta_valor}</p></Block>}
                  {pt?.pitch_abertura && <Block title="Como abrir a conversa"><p className="whitespace-pre-wrap">{pt.pitch_abertura}</p></Block>}
                  {qs.length > 0 && <Block title="Perguntas de descoberta"><ol className="ml-5 list-decimal space-y-1">{qs.map((x, i) => <li key={i}>{x}</li>)}</ol></Block>}
                  {cases.length > 0 && <Block title="Cases de sucesso"><ul className="space-y-1">{cases.map((c, i) => <li key={i}><b>{c.cliente}</b>{c.resultado ? ` — ${clip(c.resultado, 160)}` : ""}</li>)}</ul></Block>}
                </div>
              ) : <p className="rounded-xl border border-dashed border-(--line-strong) p-6 text-xl text-(--ink-3)">O pitch desta oferta ainda não foi escrito.</p>}
              <button type="button" className="btn" onClick={() => setEditing(r.offerId)}><Icon name="edit" size={16} />{p.canEdit ? "Lapidar o pitch aqui" : "Ver o pitch completo"}</button>
            </div>
            <aside className="space-y-5 rounded-2xl border border-(--line) bg-(--brand-50) p-5">
              <div><div className="mb-1 text-sm font-semibold text-(--forest)">Nível</div>{levelSelect(r, true)}{err(r.offerId)}</div>
              <div>
                <label className="mb-1 block text-sm font-semibold text-(--forest)" htmlFor={`nt-${r.offerId}`}>Por que é Foco</label>
                <textarea id={`nt-${r.offerId}`} rows={3} maxLength={300} disabled={!p.canEdit} className="input !text-lg" placeholder="Em uma frase"
                  value={r.note ?? ""} onChange={(e) => patch(r.offerId, { note: e.target.value })} onBlur={() => void saveNote(r)} />
              </div>
              <label className="flex items-start gap-3 rounded-xl bg-white p-3 text-base font-medium">
                <input type="checkbox" className="mt-0.5 size-6" disabled={!p.canEdit} checked={r.pitchValidated} onChange={(e) => void toggleValidated(r, e.target.checked)} />
                <span>Pitch validado com os números de mercado<span className="block text-sm font-normal text-(--ink-3)">Dores, proposta e cases conferidos na sala.</span></span>
              </label>
              <div><div className="mb-1 text-sm font-semibold text-(--forest)">O que disseram as regionais</div><div className="flex flex-wrap gap-1.5">{chips(r.signals)}</div></div>
              <p className="text-xs text-(--ink-3)">Pitch: {r.pitchSource === "lider" ? "versão do segmento" : r.pitchSource === "head" ? "texto do head" : "não escrito"}</p>
            </aside>
          </div>
        );
      }
      case "regioes":
        return (
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-5 text-5xl text-(--forest)">O que dizem as regiões</h2>
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {p.regional.map((v) => (
                <section key={v.regional} className="rounded-2xl border border-(--line) p-5">
                  <h3 className="mb-3 text-3xl text-(--forest)">{v.regional}</h3>
                  <div className="eyebrow mb-1">O que funciona</div><p className="mb-4 whitespace-pre-wrap text-xl">{v.works || "—"}</p>
                  <div className="eyebrow mb-1">O que não funciona</div><p className="whitespace-pre-wrap text-xl">{v.not_works || "—"}</p>
                </section>
              ))}
            </div>
          </div>
        );
      case "plano": {
        const shown = items.filter((i) => (!typeFilter || i.type === typeFilter) && (!onlyPending || !i.decision));
        return (
          <div className="mx-auto max-w-7xl">
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <h2 className="text-5xl text-(--forest)">Plano de ação</h2>
              <span className="badge !text-base bg-(--brand-50) text-(--ink-2)">{stats.acoesDecididas} de {stats.acoesTotal} com decisão</span>
            </div>
            <p className="mb-3 text-xl text-(--ink-2)">O que os diretores regionais pediram sobre as BUs desta rodada. Valide, ajuste ou descarte, e diga quem faz e até quando.</p>
            <div className="mb-3 flex flex-wrap items-center gap-3">
              <select aria-label="Filtrar por tipo" className="input !w-44" value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="">Todos os tipos</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
              <label className="flex items-center gap-2 text-base font-medium"><input type="checkbox" className="size-5" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} />Só os pendentes</label>
              <span className="text-sm text-(--ink-3)">{shown.length} {shown.length === 1 ? "ponto" : "pontos"}</span>
            </div>
            <div className="max-h-[62vh] space-y-3 overflow-auto pr-1">
              {shown.length === 0 && <p className="rounded-xl border border-dashed border-(--line-strong) p-6 text-xl text-(--ink-3)">Nenhum ponto nesse filtro.</p>}
              {shown.map((i) => (
                <div key={i.recordId} className="grid gap-4 rounded-xl border border-(--line) p-4 xl:grid-cols-[1fr_26rem]">
                  <div>
                    <div className="mb-1 flex flex-wrap items-center gap-2">
                      <span className={`badge !text-base ${SIGNAL_STYLE[i.type] ?? ""}`}>{TYPE_LABEL[i.type] ?? i.type}</span>
                      <span className="badge bg-(--brand-50) ring-1 ring-(--line)">{i.regional}</span><span className="badge bg-(--brand-50) ring-1 ring-(--line)">{i.buCode}</span>
                      {i.offerName && <span className="text-base font-semibold text-(--forest)">{i.offerName}</span>}
                      {i.priority && <span className="text-sm text-(--ink-3)">prioridade {i.priority}</span>}
                    </div>
                    <p className="text-xl font-semibold">{i.headline || "—"}</p>
                    {i.action && <p className="mt-1 text-lg text-(--ink-2)"><b>Ação:</b> {clip(i.action, 280)}</p>}
                    {i.indicator && <p className="text-base text-(--ink-3)"><b>Indicador:</b> {clip(i.indicator, 160)}</p>}
                    {i.audience && <p className="text-base text-(--ink-3)"><b>Público:</b> {i.audience}</p>}
                  </div>
                  <div className="space-y-2">
                    <select aria-label="Decisão sobre o ponto" disabled={!p.canEdit} value={i.decision ?? ""}
                      onChange={(e) => void commit(i, { decision: isDecision(e.target.value) ? (e.target.value as Decision) : null, ...(e.target.value ? {} : { owner: "", due: "", note: "" }) })}
                      className={`input !min-h-11 !text-lg ${i.decision ? `!border-transparent font-semibold ${DECISION_STYLE[i.decision]}` : ""}`}>
                      <option value="">Pendente</option>{DECISIONS.map((d) => <option key={d} value={d}>{DECISION_LABEL[d]}</option>)}
                    </select>
                    <div className="grid grid-cols-[1fr_9.5rem] gap-2">
                      <input aria-label="Responsável" className="input" maxLength={120} placeholder="Responsável" disabled={!p.canEdit || !i.decision} value={i.owner}
                        onChange={(e) => editItem(i, { owner: e.target.value })} onBlur={() => { if (i.decision) void commit(i, {}); }} />
                      <input aria-label="Prazo" type="date" className="input" disabled={!p.canEdit || !i.decision} value={i.due}
                        onChange={(e) => void commit(i, { due: e.target.value })} />
                    </div>
                    <input aria-label="Observação" className="input" maxLength={500} placeholder="Observação" disabled={!p.canEdit || !i.decision} value={i.note}
                      onChange={(e) => editItem(i, { note: e.target.value })} onBlur={() => { if (i.decision) void commit(i, {}); }} />
                    {err(i.recordId)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case "resumo": {
        const focos = rows.filter((r) => r.level === "foco");
        return (
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
            <div>
              <h2 className="mb-4 text-5xl text-(--forest)">Fechamento da rodada</h2>
              <div className="mb-5 flex flex-wrap gap-2">{countBadges}</div>
              <h3 className="mb-2 text-2xl">Ofertas em Foco ({focos.length})</h3>
              {focos.length === 0 ? <p className="mb-4 text-lg text-(--ink-3)">Nenhuma oferta em Foco ainda.</p> : (
                <ul className="mb-5 space-y-1.5">
                  {focos.map((r) => (
                    <li key={r.offerId} className="flex items-center gap-2 text-lg">
                      <Icon name={r.pitchValidated ? "task_alt" : "schedule"} size={20} />
                      <button type="button" className="text-left font-semibold text-(--forest) hover:underline" onClick={() => setKey(`oferta:${r.offerId}`)}>{r.name}</button>
                      <span className="text-sm text-(--ink-3)">{r.buCode}{r.pitchValidated ? " · pitch validado" : " · pitch a validar"}</span>
                    </li>
                  ))}
                </ul>
              )}
              <h3 className="mb-2 text-2xl">O que falta</h3>
              <ul className="space-y-1 text-lg">
                <li>{stats.semNivel === 0 ? "Todas as ofertas têm nível." : `${stats.semNivel} ${stats.semNivel === 1 ? "oferta sem nível" : "ofertas sem nível"}.`}</li>
                <li>{stats.pitchesPendentes === 0 ? "Pitches das ofertas em Foco validados." : `${stats.pitchesPendentes} ${stats.pitchesPendentes === 1 ? "pitch" : "pitches"} em Foco a validar.`}</li>
                <li>{stats.acoesPendentes === 0 ? "Todos os pontos dos regionais têm decisão." : `${stats.acoesPendentes} ${stats.acoesPendentes === 1 ? "ponto dos regionais" : "pontos dos regionais"} sem decisão.`}</li>
              </ul>
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-2xl" htmlFor="notas-rodada">Anotações da rodada</label>
                <textarea id="notas-rodada" rows={8} maxLength={4000} disabled={!p.canEdit} className="input !text-lg" placeholder="Decisões, combinados e quem faz o quê."
                  value={notes} onChange={(e) => setNotes(e.target.value)} />
                {p.canEdit && <div className="mt-1 text-right"><SaveIndicator status={notesStatus} onRetry={() => void saveNotesNow()} /></div>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/segmento/${p.segmentId}/rodadas`} className="btn"><Icon name="list_alt" size={18} />Visão geral das rodadas</Link>
                {p.nextRoundId && <Link href={`/reuniao/${p.segmentId}/rodada/${p.nextRoundId}`} className="btn btn-primary">Próxima rodada<Icon name="arrow_forward" size={18} /></Link>}
              </div>
            </div>
          </div>
        );
      }
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white text-(--ink)">
      <header className="flex items-center gap-3 border-b border-(--line) px-6 py-3">
        <Link href={`/segmento/${p.segmentId}/rodadas`} className="btn btn-sm"><Icon name="arrow_back" size={16} />Sair da rodada</Link>
        <div className="min-w-0 flex-1 truncate font-semibold text-(--forest)">{p.segmentName} · Rodada {p.round.position}: {p.round.name} · {slide.title}</div>
        {p.final && <span className="badge bg-(--brand) text-white">Versão final</span>}
        <span className="tabular-nums text-sm text-(--ink-3)" aria-live="polite">{slideCounter(index, slides.length)}</span>
        <button type="button" className="btn btn-sm" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Tela anterior"><Icon name="chevron_left" size={18} /></button>
        <button type="button" className="btn btn-sm" onClick={() => go(index + 1)} disabled={index === slides.length - 1} aria-label="Próxima tela"><Icon name="chevron_right" size={18} /></button>
        <button type="button" className="btn btn-sm" onClick={() => void toggleFull()}>{full ? "Sair da tela cheia" : "Tela cheia (F)"}</button>
      </header>
      <main className="flex-1 overflow-auto px-10 py-8" id="slide">{body()}</main>
      <footer className="flex gap-1 border-t border-(--line) px-6 py-2" aria-label="Telas">
        {slides.map((s, i) => (
          <button key={s.key} type="button" onClick={() => go(i)} title={s.title} aria-label={s.title} aria-current={i === index ? "step" : undefined}
            className={`h-2 flex-1 rounded-full ${i === index ? "bg-(--accent)" : i < index ? "bg-(--brand)" : "bg-(--line)"}`} />
        ))}
      </footer>
    </div>
  );
}
