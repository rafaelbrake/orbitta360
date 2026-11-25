"use client";

import { useEffect, useState } from "react";
import { saveAiTexts } from "@/app/actions/segment";
import { Icon } from "@/components/Icon";

interface Texts { thesis: string; message: string }

/**
 * Fechamento do segmento: os textos da apresentação (rascunho da IA, que o segmento ajusta) e o download do PPT.
 * São campos próprios: o que foi escrito à mão na tela do segmento aparece só para consulta e nunca é alterado aqui.
 * O rascunho da IA é gravado quando o líder clica em Salvar ou em Baixar.
 */
export function SegmentThesisPanel({ segmentId, initial, manual, canGenerate, focoCount }: {
  segmentId: string; initial: Texts; manual: Texts; canGenerate: boolean; focoCount: number;
}) {
  const [saved, setSaved] = useState(initial);
  const [v, setV] = useState(initial);
  const [points, setPoints] = useState<string[]>([]);
  const [busy, setBusy] = useState<"gerar" | "salvar" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(false);
  const dirty = v.thesis !== saved.thesis || v.message !== saved.message;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  async function generate() {
    if ((v.thesis.trim() || v.message.trim()) && !window.confirm("Gerar de novo substitui o texto que está nestes dois campos. O que o segmento escreveu à mão não muda. Continuar?")) return;
    setBusy("gerar");
    setError(null);
    try {
      const res = await fetch("/api/thesis", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ segmentId }) });
      const data = (await res.json().catch(() => null)) as { ok: boolean; error?: string; thesis?: string; message?: string; points?: string[] } | null;
      if (!data?.ok) throw new Error(data?.error ?? "Não foi possível gerar a tese agora. Tente de novo.");
      setV({ thesis: data.thesis ?? "", message: data.message ?? "" });
      setPoints(data.points ?? []);
      setDraft(true);
    } catch (e) {
      setError(e instanceof TypeError ? "Sem conexão. Tente de novo." : (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function save(): Promise<boolean> {
    setBusy("salvar");
    setError(null);
    const values = v;
    try {
      const r = await saveAiTexts(segmentId, values);
      if (!r.ok) setError(r.error ?? "Não foi possível salvar.");
      else { setSaved(values); setDraft(false); }
      return r.ok;
    } catch {
      setError("Não foi possível salvar. Atualize a página e tente de novo; copie o texto antes.");
      return false;
    } finally {
      setBusy(null);
    }
  }

  const url = `/segmento/${segmentId}/rodadas/pptx`;
  /** O PPT sai do que está salvo: se houver texto novo na tela, salva antes de baixar. */
  async function download(e: React.MouseEvent) {
    if (busy) return e.preventDefault();
    if (!dirty) return;
    e.preventDefault();
    if (!(await save())) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = "";
    a.click();
  }

  const field = (key: keyof Texts, label: string, placeholder: string) => (
    <div>
      <label className="label" htmlFor={`tese-${key}`}>{label}</label>
      <textarea id={`tese-${key}`} rows={8} maxLength={4000} className="input" placeholder={placeholder} value={v[key]} readOnly={busy === "salvar"} disabled={busy === "gerar"}
        onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))} />
    </div>
  );

  return (
    <section className="card mt-8 !p-5" aria-label="Tese e apresentação do segmento">
      <h2 className="mb-1">Tese e apresentação do segmento</h2>
      <p className="mb-4 text-sm text-(--ink-3)">Depois das rodadas: gere o texto com a IA, ajuste e baixe o PPT. O que foi escrito à mão na tela do segmento continua guardado, sem alteração.</p>

      {canGenerate && (
        <div className="mb-4 flex flex-wrap items-center gap-3">
          <button type="button" className="btn" onClick={() => void generate()} disabled={busy !== null || focoCount === 0}>
            <Icon name="edit" size={18} />{busy === "gerar" ? "Escrevendo… (até 2 minutos)" : "Gerar tese com IA"}
          </button>
          <span className="text-sm text-(--ink-3)">{focoCount === 0 ? "Escolha as ofertas em Foco nas rodadas primeiro." : "Usa as ofertas em Foco, os pitches, o plano de ação e as visões das regiões já salvos."}</span>
        </div>
      )}

      {error && <p role="alert" className="mb-3 rounded-xl bg-(--danger-100) p-3 text-sm text-(--danger)">{error}</p>}
      {draft && <p role="status" className="mb-3 rounded-xl bg-(--accent-100) p-3 text-sm text-(--accent-800)">Rascunho da IA, ainda não salvo. Revise, ajuste e clique em Salvar.</p>}

      <div className="grid gap-4 md:grid-cols-2">
        {field("thesis", "Tese para o PPT: onde vamos focar e por quê", "Gere com a IA e ajuste aqui.")}
        {field("message", "Mensagem aos vendedores para o PPT", "Gere com a IA e ajuste aqui.")}
      </div>

      {(manual.thesis.trim() || manual.message.trim()) && (
        <details className="mt-3 rounded-xl border border-(--line) p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-(--forest)">Ver o que o segmento escreveu à mão (não vai para o PPT)</summary>
          <div className="mt-2 grid gap-4 md:grid-cols-2">
            <div><div className="eyebrow mb-1">Tese</div><p className="whitespace-pre-wrap">{manual.thesis.trim() || "Não escrita."}</p></div>
            <div><div className="eyebrow mb-1">Mensagem aos vendedores</div><p className="whitespace-pre-wrap">{manual.message.trim() || "Não escrita."}</p></div>
          </div>
        </details>
      )}

      {points.length > 0 && (
        <div className="mt-4 rounded-xl border border-(--line) bg-(--brand-50) p-3">
          <div className="eyebrow mb-1">Pontos para o grupo discutir (só aparecem aqui, não vão para o PPT)</div>
          <ul className="list-disc space-y-1 pl-5 text-sm">{points.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy !== null || !dirty}><Icon name="task_alt" size={18} />{busy === "salvar" ? "Salvando…" : "Salvar texto"}</button>
        {dirty && <button type="button" className="btn btn-ghost" onClick={() => { setV(saved); setDraft(false); setError(null); }} disabled={busy !== null}>Voltar ao texto salvo</button>}
        {/* link comum, sem Link: é um download, não uma navegação */}
        <a href={url} className="btn" download onClick={(e) => void download(e)} aria-disabled={busy !== null}><Icon name="download" size={18} />Baixar apresentação (PPT)</a>
        <span className="text-sm text-(--ink-3)" role="status">{dirty ? "Ao baixar, o texto da tela é salvo antes." : saved.thesis.trim() || saved.message.trim() ? "O PPT sai com estes textos." : "Sem texto aqui, o PPT sai sem o slide de tese."}</span>
      </div>
    </section>
  );
}
