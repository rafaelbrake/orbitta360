import Link from "next/link";
import { redirect } from "next/navigation";
import { deleteContextBlock, saveContextBlock } from "@/app/actions/rounds";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink, Notice, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { DIRECTORS_ENABLED, ROUND_CONTEXT_ENABLED } from "@/lib/features";
import { BLOCK_KINDS, KIND_LABEL } from "@/lib/round-context";
import { loadRounds } from "@/lib/rounds-data";
import { requireProfile } from "@/lib/session";

type SP = Promise<Record<string, string | string[] | undefined>>;
interface Row { id: string; round_id: string; segment_id: string | null; position: number; kind: string; title: string; subtitle: string | null; body: unknown; source: string | null; note: string | null }

const EXAMPLE: Record<string, string> = {
  cards: '{\n  "cards": [\n    { "label": "O que o número mede", "value": "US$ 6,2 tri", "caption": "detalhe opcional", "tone": "ok" }\n  ]\n}',
  table: '{\n  "columns": ["BU", "Conversão"],\n  "align": ["l", "r"],\n  "rows": [\n    ["Print Solutions", { "v": "28%", "t": "ok" }]\n  ]\n}',
  list: '{\n  "items": [\n    { "title": "Título opcional", "text": "Texto do item" },\n    "Ou só o texto"\n  ]\n}',
  text: '{\n  "paragraphs": ["Primeiro parágrafo.", "Segundo parágrafo."]\n}',
};

/** Telas de contexto das rodadas: a Diretoria revê e ajusta o texto, a fonte e os números de cada tela. */
export default async function ContextoPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  if (!DIRECTORS_ENABLED) redirect("/admin");
  if (!ROUND_CONTEXT_ENABLED) redirect("/admin/rodadas");
  const [config, rounds, r] = await Promise.all([
    loadConfig(supabase), loadRounds(supabase),
    supabase.from("round_context_blocks").select("id,round_id,segment_id,position,kind,title,subtitle,body,source,note").order("position"),
  ]);
  const blocks = (r.data ?? []) as Row[];
  const segments = config.segments.filter((s) => s.active);
  const segName = new Map(config.segments.map((s) => [s.id, s.name]));

  const fields = (b: Row | null, roundId: string) => (
    <div className="grid gap-3">
      <input type="hidden" name="id" value={b?.id ?? ""} /><input type="hidden" name="round_id" value={roundId} />
      <div className="grid gap-3 md:grid-cols-[1fr_9rem_9rem_7rem]">
        <div><label className="label">Título</label><input name="title" className="input" maxLength={160} required defaultValue={b?.title ?? ""} /></div>
        <div><label className="label">Tipo</label>
          <select name="kind" className="input" defaultValue={b?.kind ?? "table"}>{BLOCK_KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}</select></div>
        <div><label className="label">Segmento</label>
          <select name="segment_id" className="input" defaultValue={b?.segment_id ?? ""}><option value="">Todos</option>{segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div><label className="label">Posição</label><input name="position" type="number" className="input" defaultValue={b?.position ?? 50} /></div>
      </div>
      <div><label className="label">Subtítulo</label><input name="subtitle" className="input" maxLength={300} defaultValue={b?.subtitle ?? ""} /></div>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label">Fonte</label><textarea name="source" rows={2} className="input" maxLength={800} defaultValue={b?.source ?? ""} /></div>
        <div><label className="label">Ressalva</label><textarea name="note" rows={2} className="input" maxLength={1200} defaultValue={b?.note ?? ""} /></div>
      </div>
      <div><label className="label">Conteúdo (JSON)</label>
        <textarea name="body" rows={b ? 12 : 8} className="input font-mono !text-xs" spellCheck={false} required defaultValue={b ? JSON.stringify(b.body, null, 2) : EXAMPLE.table} /></div>
    </div>
  );

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/rodadas">Voltar às rodadas</BackLink>
      <PageHeader title="Telas de contexto" subtitle="O que aparece antes da mesa de decisão de cada rodada: mercado, funil, faturamento e perguntas. Cada tela vale para todos os segmentos ou para um só." />
      <Notice tone="info" icon="edit" className="mb-5">
        O conteúdo é um JSON conferido ao salvar: erros aparecem na hora e nada é gravado. Exemplos: <b>Cartões</b> (<code>cards</code>), <b>Tabela</b> (<code>columns</code> e <code>rows</code>; célula com <code>{`{"v":"28%","t":"ok"}`}</code> ganha destaque; <code>t</code> pode ser ok, bad ou hi), <b>Lista</b> (<code>items</code>) e <b>Texto</b> (<code>paragraphs</code>). As telas só aparecem para a Diretoria e para o líder do segmento.
      </Notice>

      {rounds.map((rd) => {
        const mine = blocks.filter((b) => b.round_id === rd.id);
        return (
          <section key={rd.id} className="mb-8">
            <h2 className="mb-2">Rodada {rd.position}: {rd.name} <span className="text-sm font-normal text-(--ink-3)">· {mine.length} {mine.length === 1 ? "tela" : "telas"}</span></h2>
            <div className="space-y-2">
              {mine.map((b) => (
                <details key={b.id} className="card !p-0">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 px-4 py-3">
                    <span className="tabular-nums text-xs text-(--ink-3)">{b.position}</span>
                    <b className="text-(--forest)">{b.title}</b>
                    <span className="badge bg-(--brand-50) text-(--ink-2) ring-1 ring-(--line)">{KIND_LABEL[b.kind as keyof typeof KIND_LABEL] ?? b.kind}</span>
                    <span className={`badge ${b.segment_id ? "bg-(--accent-100) text-(--accent-800)" : "bg-slate-200 text-slate-700"}`}>{b.segment_id ? segName.get(b.segment_id) ?? "Segmento" : "Todos os segmentos"}</span>
                  </summary>
                  <div className="border-t border-(--line) p-4">
                    <form action={saveContextBlock} className="space-y-3">
                      {fields(b, rd.id)}
                      <SubmitButton className="btn btn-primary">Salvar</SubmitButton>
                    </form>
                    <form action={deleteContextBlock} className="mt-2">
                      <input type="hidden" name="id" value={b.id} />
                      <ConfirmSubmit className="btn btn-sm" title="Remover esta tela?" message="A tela deixa de aparecer na rodada. Dá para recriá-la depois." confirmLabel="Remover"><Icon name="delete" size={16} />Remover tela</ConfirmSubmit>
                    </form>
                  </div>
                </details>
              ))}
              <details className="card !p-0">
                <summary className="flex cursor-pointer items-center gap-2 px-4 py-3 font-semibold text-(--brand)"><Icon name="add" size={18} />Nova tela nesta rodada</summary>
                <form action={saveContextBlock} className="space-y-3 border-t border-(--line) p-4">
                  {fields(null, rd.id)}
                  <SubmitButton className="btn btn-primary">Criar tela</SubmitButton>
                </form>
              </details>
            </div>
          </section>
        );
      })}
      <Link href="/admin/rodadas" className="btn"><Icon name="arrow_back" size={16} />Voltar às rodadas</Link>
    </div>
  );
}
