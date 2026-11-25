"use client";

import { useEffect, useState } from "react";
import { saveStrategy } from "@/app/actions/segment";
import { Icon } from "@/components/Icon";

interface Texts { thesis: string; message: string }

/**
 * Fechamento do segmento: a tese (escrita pelo líder ou a partir de um rascunho da IA) e o download da apresentação.
 * Aqui nada salva sozinho: o rascunho da IA só vai para o sistema quando o líder clica em Salvar.
 */
export function SegmentThesisPanel({ segmentId, initial, readOnly, canGenerate, focoCount }: {
  segmentId: string; initial: Texts; readOnly: boolean; canGenerate: boolean; focoCount: number;
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

  async function save() {
    setBusy("salvar");
    setError(null);
    const values = v;
    try {
      const r = await saveStrategy(segmentId, values);
      if (!r.ok) setError(r.error ?? "Não foi possível salvar.");
      else { setSaved(values); setDraft(false); }
    } catch {
      setError("Não foi possível salvar. Atualize a página e tente de novo; copie o texto antes.");
    } finally {
      setBusy(null);
    }
  }

  const field = (key: keyof Texts, label: string, placeholder: string) => (
    <div>
      <label className="label" htmlFor={`tese-${key}`}>{label}</label>
      <textarea id={`tese-${key}`} rows={8} maxLength={4000} className="input" placeholder={placeholder} value={v[key]} readOnly={readOnly} disabled={busy === "gerar"}
        onChange={(e) => setV((p) => ({ ...p, [key]: e.target.value }))} />
    </div>
  );

  return (
    <section className="card mt-8 !p-5" aria-label="Tese e apresentação do segmento">
      <h2 className="mb-1">Tese e apresentação do segmento</h2>
      <p className="mb-4 text-sm text-(--ink-3)">Depois das rodadas: feche a tese, salve e baixe o PPT para apresentar. São os mesmos textos de Tese e Mensagem aos vendedores da tela do segmento.</p>

      {readOnly && <p className="mb-3 rounded-xl bg-(--accent-100) p-3 text-sm text-(--accent-800)">Versão final travada: para mudar a tese, a Diretoria Corporativa precisa reabrir. O PPT pode ser baixado normalmente.</p>}

      {!readOnly && canGenerate && (
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
        {field("thesis", "Tese: onde vamos focar e por quê", "Em 3 a 5 linhas: o que o segmento vai priorizar em 2027 e o que ficou de fora.")}
        {field("message", "Mensagem aos vendedores", "O que o vendedor precisa entender e fazer.")}
      </div>

      {points.length > 0 && (
        <div className="mt-4 rounded-xl border border-(--line) bg-(--brand-50) p-3">
          <div className="eyebrow mb-1">Pontos para o grupo discutir (só aparecem aqui, não vão para o PPT)</div>
          <ul className="list-disc space-y-1 pl-5 text-sm">{points.map((p) => <li key={p}>{p}</li>)}</ul>
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {!readOnly && <button type="button" className="btn btn-primary" onClick={() => void save()} disabled={busy !== null || !dirty}><Icon name="task_alt" size={18} />{busy === "salvar" ? "Salvando…" : "Salvar tese"}</button>}
        {!readOnly && dirty && <button type="button" className="btn btn-ghost" onClick={() => { setV(saved); setDraft(false); setError(null); }} disabled={busy !== null}>Voltar ao texto salvo</button>}
        {/* link comum, sem Link: é um download, não uma navegação */}
        <a href={`/segmento/${segmentId}/rodadas/pptx`} className="btn" download><Icon name="download" size={18} />Baixar apresentação (PPT)</a>
        <span className="text-sm text-(--ink-3)" role="status">{dirty ? "Há texto não salvo: o PPT usa o que está salvo." : "O PPT sai com o que está salvo agora."}</span>
      </div>
    </section>
  );
}
