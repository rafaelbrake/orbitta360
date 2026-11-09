"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { finalizeSegment, saveMeetingNotes, saveReviewNote, setPriority, setReviewDone } from "@/app/actions/segment";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Icon } from "@/components/Icon";
import { SaveIndicator, useAutosave } from "@/components/useAutosave";
import { SegmentStrategyForm } from "@/components/SegmentStrategyForm";
import { ClassBadge } from "@/components/ui";
import { clip, type PitchData } from "@/lib/book";
import { buildSlides, clampIndex, indexOfKey, keyToMove, pendingAdjustments, slideCounter } from "@/lib/meeting";
import { LEVELS, LEVEL_LABEL, LEVEL_STYLE, levelCounts, type Level } from "@/lib/segment";

export interface DeckRow {
  offerId: string; code: string | null; name: string; buCode: string; score: number; classCode: string; classLabel: string;
  level: Level | null; note: string | null; reviewNote: string | null; reviewDone: boolean;
  pitch: PitchData | null; pitchSource: "lider" | "head" | null; description: string | null;
  signals: { regional: string; type: string }[];
}
export interface DeckProps {
  segmentId: string; segmentName: string; leader: string | null; final: boolean; canEdit: boolean; focoLimit: number;
  strategy: { thesis: string; message: string; notes: string };
  rows: DeckRow[]; regional: { regional: string; works: string | null; not_works: string | null }[];
  stats: { bus: number; busTotal: number; scored: number };
  /** tela em que a apresentação abre (vem do endereço, para atualizar a página sem perder o lugar) */
  initialKey?: string;
}

const TYPE_LABEL: Record<string, string> = { manter: "Manter", mudar: "Mudar", treinar: "Treinar" };
const SIGNAL_STYLE: Record<string, string> = { manter: "bg-(--brand-100) text-(--brand-800)", mudar: "bg-(--accent-100) text-(--accent-800)", treinar: "bg-slate-200 text-slate-700" };
const isTyping = (t: EventTarget | null) => t instanceof HTMLElement && ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName);

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h3 className="mb-1 text-sm font-bold uppercase tracking-wider text-(--brand-800)">{title}</h3><div className="text-[19px] leading-snug">{children}</div></section>;
}

/** Apresentação do segmento para a reunião: telas navegáveis por teclado, com decisão e crítica ao vivo. */
export function MeetingDeck(p: DeckProps) {
  const [rows, setRows] = useState<DeckRow[]>(p.rows);
  const [strategy, setStrategy] = useState({ thesis: p.strategy.thesis, message: p.strategy.message });
  const [meetingNotes, setMeetingNotes] = useState(p.strategy.notes);
  const [editStrategy, setEditStrategy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [key, setKey] = useState(p.initialKey || "abertura");
  const [full, setFull] = useState(false);

  const slides = useMemo(() => buildSlides(rows, { hasRegional: p.regional.length > 0 }), [rows, p.regional.length]);
  const index = clampIndex(indexOfKey(slides, key), slides.length);
  const slide = slides[index];
  const counts = levelCounts(new Map(rows.filter((r) => r.level).map((r) => [r.offerId, r.level as Level])));

  const go = useCallback((i: number) => setKey(slides[clampIndex(i, slides.length)].key), [slides]);
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

  const patch = (offerId: string, change: Partial<DeckRow>) => setRows((rs) => rs.map((r) => (r.offerId === offerId ? { ...r, ...change } : r)));
  const setErr = (offerId: string, msg: string | null) => setErrors((e) => { const n = { ...e }; if (msg) n[offerId] = msg; else delete n[offerId]; return n; });

  async function changeLevel(r: DeckRow, next: string) {
    const level = (next || null) as Level | null;
    const prev = r.level;
    setErr(r.offerId, null);
    patch(r.offerId, { level });
    const res = await setPriority(p.segmentId, r.offerId, level);
    if (!res.ok) { patch(r.offerId, { level: prev }); setErr(r.offerId, res.error); }
  }
  async function saveNote(r: DeckRow) {
    if (!r.level) return;
    const res = await saveReviewNote(p.segmentId, r.offerId, r.reviewNote ?? "");
    if (!res.ok) setErr(r.offerId, res.error); else patch(r.offerId, { reviewDone: false });
  }
  async function toggleDone(r: DeckRow, done: boolean) {
    patch(r.offerId, { reviewDone: done });
    const res = await setReviewDone(p.segmentId, r.offerId, done);
    if (!res.ok) { patch(r.offerId, { reviewDone: !done }); setErr(r.offerId, res.error); }
  }

  const { status: notesStatus, saveNow: saveNotesNow } = useAutosave(meetingNotes, (v) => saveMeetingNotes(p.segmentId, v), { disabled: !p.canEdit });

  const levelSelect = (r: DeckRow, big = false) => (
    <select aria-label={`Nível de ${r.name}`} disabled={!p.canEdit} value={r.level ?? ""} onChange={(e) => void changeLevel(r, e.target.value)}
      className={`input ${big ? "!min-h-12 !w-52 !text-lg" : "!min-h-9 !w-36"} ${r.level ? `!border-transparent font-semibold ${LEVEL_STYLE[r.level]}` : ""}`}>
      <option value="">Sem nível</option>
      {LEVELS.map((l) => <option key={l} value={l}>{LEVEL_LABEL[l]}</option>)}
    </select>
  );
  const adjust = (r: DeckRow, big = false) => (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-(--forest)" htmlFor={`aj-${r.offerId}`}>Ajuste pedido na reunião</label>
      <textarea id={`aj-${r.offerId}`} rows={big ? 3 : 2} disabled={!p.canEdit || !r.level} maxLength={300} className={`input ${big ? "!text-lg" : ""}`}
        placeholder={r.level ? "O que precisa mudar neste item" : "Defina o nível primeiro"}
        value={r.reviewNote ?? ""} onChange={(e) => patch(r.offerId, { reviewNote: e.target.value })} onBlur={() => void saveNote(r)} />
      {(r.reviewNote ?? "").trim() && (
        <label className="flex items-center gap-2 text-sm font-medium">
          <input type="checkbox" className="size-5" disabled={!p.canEdit} checked={r.reviewDone} onChange={(e) => void toggleDone(r, e.target.checked)} />Ajuste feito
        </label>
      )}
    </div>
  );
  const err = (r: DeckRow) => errors[r.offerId] && <div className="text-sm text-(--danger)" role="alert">{errors[r.offerId]}</div>;

  const body = () => {
    switch (slide.kind) {
      case "abertura":
        return (
          <div className="flex h-full flex-col justify-center">
            <div className="text-lg uppercase tracking-[0.2em] text-(--brand-800)">Reunião de consolidação</div>
            <h1 className="mt-3 text-7xl font-medium text-(--forest)">{p.segmentName}</h1>
            <div className="mt-5 h-1.5 w-24 rounded bg-(--accent)" />
            {p.leader && <p className="mt-6 text-2xl text-(--ink-2)">Líder do segmento: <b className="text-(--forest)">{p.leader}</b></p>}
            <div className="mt-10 grid max-w-4xl gap-4 sm:grid-cols-4">
              {[["BUs avaliando", `${p.stats.bus} de ${p.stats.busTotal}`], ["Ofertas pontuadas", String(p.stats.scored)], ["Em Foco", `${counts.foco} de ${p.focoLimit}`], ["Regiões", String(p.regional.length)]].map(([k, v]) => (
                <div key={k} className="rounded-2xl border border-(--line) bg-(--brand-50) p-4"><div className="text-sm text-(--ink-3)">{k}</div><div className="mt-1 text-4xl font-semibold text-(--forest)">{v}</div></div>
              ))}
            </div>
            <p className="mt-8 text-lg text-(--ink-3)">Use as setas ← → para navegar · F para tela cheia · {p.final ? "Versão final travada" : "Rascunho em edição"}</p>
          </div>
        );
      case "estrategia":
        return (
          <div className="mx-auto max-w-6xl">
            <div className="mb-6 flex items-center gap-4"><h2 className="text-5xl text-(--forest)">Estratégia do segmento</h2>
              {p.canEdit && <button type="button" className="btn ml-auto" onClick={() => setEditStrategy((v) => !v)}><Icon name={editStrategy ? "task_alt" : "edit"} size={18} />{editStrategy ? "Concluir edição" : "Editar"}</button>}
            </div>
            {editStrategy ? (
              <SegmentStrategyForm segmentId={p.segmentId} initial={strategy} readOnly={!p.canEdit} onChange={setStrategy} />
            ) : (
              <div className="grid gap-10 md:grid-cols-2">
                <div><div className="eyebrow mb-2 !text-base">Onde vamos focar e por quê</div><p className="whitespace-pre-wrap text-[26px] leading-snug">{strategy.thesis.trim() || <span className="text-(--ink-3)">Ainda não escrita.</span>}</p></div>
                <div><div className="eyebrow mb-2 !text-base">Mensagem aos vendedores</div><p className="whitespace-pre-wrap text-[26px] leading-snug">{strategy.message.trim() || <span className="text-(--ink-3)">Ainda não escrita.</span>}</p></div>
              </div>
            )}
          </div>
        );
      case "mesa":
        return (
          <div className="mx-auto max-w-7xl">
            <div className="mb-4 flex flex-wrap items-center gap-4">
              <h2 className="text-5xl text-(--forest)">Mesa de decisão</h2>
              <span className="badge !text-base bg-(--brand-50) text-(--ink-2)">Foco {counts.foco} de {p.focoLimit}</span>
              <span className="badge !text-base bg-(--accent-100) text-(--accent-800)">Apoio {counts.apoio}</span>
              <span className="badge !text-base bg-slate-200 text-slate-700">Fora do radar {counts.fora}</span>
            </div>
            <div className="table-wrap !max-h-[68vh]">
              <table className="min-w-[56rem] text-lg">
                <thead><tr><th className="th">#</th><th className="th">Oferta</th><th className="th">BU</th><th className="th">Nota</th><th className="th">Regionais</th><th className="th">Nível</th></tr></thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.offerId}>
                      <td className="td tabular-nums text-(--ink-3)">{i + 1}</td>
                      <td className="td font-semibold text-(--forest)">{r.name}</td>
                      <td className="td">{r.buCode}</td>
                      <td className="td whitespace-nowrap"><b className="mr-2 tabular-nums">{r.score}</b><ClassBadge code={r.classCode} label={r.classLabel} /></td>
                      <td className="td"><div className="flex flex-wrap gap-1">{r.signals.map((s, k) => <span key={k} className={`badge ${SIGNAL_STYLE[s.type] ?? ""}`}>{s.regional} · {TYPE_LABEL[s.type] ?? s.type}</span>)}</div></td>
                      <td className="td">{levelSelect(r)}{err(r)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case "oferta": {
        const r = rows.find((x) => x.offerId === slide.offerId);
        if (!r) return null;
        const q = [r.pitch?.pergunta_1, r.pitch?.pergunta_2, r.pitch?.pergunta_3].filter((x) => (x ?? "").trim());
        const cases = r.pitch?.cases ?? [];
        return (
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-[1fr_22rem]">
            <div className="space-y-5">
              <div className="flex flex-wrap items-center gap-2 text-base"><span className="badge !text-base bg-(--brand) text-white">Foco</span><span className="badge !text-base bg-(--brand-50) ring-1 ring-(--line)">{r.buCode}{r.code ? ` · ${r.code}` : ""}</span><span className="font-semibold tabular-nums">Nota {r.score}</span><ClassBadge code={r.classCode} label={r.classLabel} /></div>
              <h2 className="text-5xl leading-tight text-(--forest)">{r.name}</h2>
              {(r.pitch?.descricao ?? r.description ?? "").trim() && <p className="text-[21px] text-(--ink-2)">{r.pitch?.descricao ?? r.description}</p>}
              {r.note && <p className="rounded-xl bg-(--accent-100) px-4 py-3 text-xl text-(--accent-800)"><b>Por que é Foco:</b> {r.note}</p>}
              {r.pitch ? (
                <div className="grid gap-5">
                  {r.pitch.dores && <Block title="Dores do cliente"><p className="whitespace-pre-wrap">{r.pitch.dores}</p></Block>}
                  {r.pitch.proposta_valor && <Block title="Proposta de valor"><p className="whitespace-pre-wrap">{r.pitch.proposta_valor}</p></Block>}
                  {r.pitch.pitch_abertura && <Block title="Como abrir a conversa"><p className="whitespace-pre-wrap">{r.pitch.pitch_abertura}</p></Block>}
                  {q.length > 0 && <Block title="Perguntas de descoberta"><ol className="ml-5 list-decimal space-y-1">{q.map((x, i) => <li key={i}>{x}</li>)}</ol></Block>}
                  {cases.length > 0 && <Block title="Cases de sucesso"><ul className="space-y-1">{cases.map((c, i) => <li key={i}><b>{c.cliente}</b>{c.resultado ? ` — ${clip(c.resultado, 160)}` : ""}</li>)}</ul></Block>}
                </div>
              ) : <p className="rounded-xl border border-dashed border-(--line-strong) p-6 text-xl text-(--ink-3)">O pitch desta oferta ainda não foi escrito.</p>}
              <Link href={`/segmento/${p.segmentId}/pitch/${r.offerId}`} target="_blank" className="btn"><Icon name="edit" size={16} />{p.canEdit ? "Editar o pitch (outra aba)" : "Ver o pitch (outra aba)"}</Link>
            </div>
            <aside className="space-y-5 rounded-2xl border border-(--line) bg-(--brand-50) p-5">
              <div><div className="mb-1 text-sm font-semibold text-(--forest)">Nível</div>{levelSelect(r, true)}{err(r)}</div>
              <div><div className="mb-1 text-sm font-semibold text-(--forest)">O que disseram as regionais</div>
                <div className="flex flex-wrap gap-1.5">{r.signals.length === 0 ? <span className="text-sm text-(--ink-3)">Nenhum destaque.</span> : r.signals.map((s, k) => <span key={k} className={`badge !text-sm ${SIGNAL_STYLE[s.type] ?? ""}`}>{s.regional} · {TYPE_LABEL[s.type] ?? s.type}</span>)}</div></div>
              {adjust(r, true)}
              <p className="text-xs text-(--ink-3)">Pitch: {r.pitchSource === "lider" ? "versão do segmento" : r.pitchSource === "head" ? "texto do head" : "não escrito"}</p>
            </aside>
          </div>
        );
      }
      case "apoio": {
        const apoio = rows.filter((r) => r.level === "apoio");
        return (
          <div className="mx-auto max-w-7xl">
            <h2 className="mb-1 text-5xl text-(--forest)">Ofertas de apoio</h2>
            <p className="mb-4 text-xl text-(--ink-2)">Entram na conversa quando o cliente demonstra a necessidade.</p>
            <div className="max-h-[66vh] space-y-3 overflow-auto pr-1">
              {apoio.map((r) => (
                <div key={r.offerId} className="grid gap-4 rounded-xl border border-(--line) p-4 md:grid-cols-[1fr_14rem_20rem]">
                  <div><div className="flex flex-wrap items-baseline gap-2"><b className="text-2xl">{r.name}</b><span className="text-(--ink-3)">{r.buCode} · nota {r.score}</span></div>
                    <p className="mt-1 text-lg text-(--ink-2)">{r.pitch?.proposta_valor ? clip(r.pitch.proposta_valor, 240) : r.pitch?.pitch_abertura ? clip(r.pitch.pitch_abertura, 240) : "Pitch ainda não escrito."}</p></div>
                  <div>{levelSelect(r)}{err(r)}</div>
                  <div>{adjust(r)}</div>
                </div>
              ))}
            </div>
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
      case "resumo": {
        const pend = pendingAdjustments(rows);
        return (
          <div className="mx-auto grid max-w-7xl gap-8 lg:grid-cols-2">
            <div>
              <h2 className="mb-4 text-5xl text-(--forest)">Fechamento</h2>
              <div className="mb-5 flex flex-wrap gap-2"><span className="badge !text-base bg-(--brand) text-white">Foco {counts.foco} de {p.focoLimit}</span><span className="badge !text-base bg-(--accent-100) text-(--accent-800)">Apoio {counts.apoio}</span><span className="badge !text-base bg-slate-200 text-slate-700">Fora do radar {counts.fora}</span></div>
              <h3 className="mb-2 text-2xl">Ajustes pendentes ({pend.length})</h3>
              {pend.length === 0 ? <p className="text-lg text-(--ink-3)">Nenhum ajuste pendente.</p> : (
                <ul className="space-y-2">
                  {pend.map((r) => (
                    <li key={r.offerId} className="rounded-xl border border-(--line) p-3">
                      <div className="flex items-start gap-3"><input type="checkbox" className="mt-1 size-5" disabled={!p.canEdit} checked={r.reviewDone} onChange={(e) => void toggleDone(r, e.target.checked)} aria-label={`Feito: ${r.name}`} />
                        <div><b className="text-lg">{r.name}</b> <span className="text-sm text-(--ink-3)">{r.level ? LEVEL_LABEL[r.level] : ""}</span><p className="text-lg text-(--ink-2)">{r.reviewNote}</p>{err(r)}</div></div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="space-y-5">
              <div>
                <label className="mb-1 block text-2xl" htmlFor="notas-reuniao">Anotações da reunião</label>
                <textarea id="notas-reuniao" rows={8} maxLength={4000} disabled={!p.canEdit} className="input !text-lg" placeholder="Decisões, combinados e quem faz o quê."
                  value={meetingNotes} onChange={(e) => setMeetingNotes(e.target.value)} />
                {p.canEdit && <div className="mt-1 text-right"><SaveIndicator status={notesStatus} onRetry={() => void saveNotesNow()} /></div>}
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Link href={`/book/${p.segmentId}`} target="_blank" className="btn"><Icon name="download" size={18} />Abrir o book (PDF)</Link>
                {p.final ? <span className="badge !text-base bg-(--brand) text-white"><Icon name="lock_open" size={16} />Versão final travada</span> : p.canEdit && (
                  <form action={finalizeSegment}><input type="hidden" name="segment_id" value={p.segmentId} />
                    <ConfirmSubmit className="btn btn-primary" title="Travar a versão final?" message="Depois de travar, ninguém edita prioridades, estratégia e pitches deste segmento. Só a Diretoria Corporativa pode reabrir." confirmLabel="Travar versão final">Travar versão final</ConfirmSubmit>
                  </form>
                )}
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
        <Link href={`/segmento/${p.segmentId}`} className="btn btn-sm"><Icon name="arrow_back" size={16} />Sair da reunião</Link>
        <div className="min-w-0 flex-1 truncate font-semibold text-(--forest)">{p.segmentName} · {slide.title}</div>
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
