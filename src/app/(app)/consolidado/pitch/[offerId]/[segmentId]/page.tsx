import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPitchRows, requireConsolidated } from "@/lib/consolidated";
import { loadConfig } from "@/lib/data";
import { fmtTicket, ticketLabel } from "@/lib/offers";
import { employeesLabel } from "@/lib/pitch";

function Block({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-(--ink-3)">{label}</dt>
      <dd className="whitespace-pre-wrap text-sm">{value?.trim() || <span className="text-(--ink-3)">—</span>}</dd>
    </div>
  );
}

/** Pitch de uma oferta em um segmento, em modo leitura (ranking consolidado). Edição continua só na tela da BU. */
export default async function PitchReadOnly({ params }: { params: Promise<{ offerId: string; segmentId: string }> }) {
  const { offerId, segmentId } = await params;
  const { supabase } = await requireConsolidated();
  const config = await loadConfig(supabase);
  if (!/^[0-9a-f-]{36}$/i.test(offerId) || !/^[0-9a-f-]{36}$/i.test(segmentId)) notFound();
  const [p] = await loadPitchRows(supabase, config, { segmentId, offerId });
  if (!p) notFound(); // sem pitch ou sem permissão de leitura (RLS)

  return (
    <div className="space-y-4">
      <Link href={`/consolidado/ranking?segment=${segmentId}`} className="btn">← Ranking</Link>
      <div>
        <div className="eyebrow">Pitch · {p.buCode} · {p.segmentName}</div>
        <h1>{p.offerName}</h1>
      </div>
      <section className="card"><dl className="space-y-3">
        <Block label="Descrição da oferta" value={p.descricao} />
        <Block label="Principais dores do segmento" value={p.dores} />
        <Block label="Proposta de valor" value={p.proposta_valor} />
        <Block label="Pitch de abertura para o AM" value={p.pitch_abertura} />
      </dl></section>
      <section className="card"><h2 className="mb-2">Perguntas de descoberta</h2><dl className="space-y-3">
        <Block label="1" value={p.pergunta_1} /><Block label="2" value={p.pergunta_2} /><Block label="3" value={p.pergunta_3} />
      </dl></section>
      <section className="card">
        <h2 className="mb-2">Cases de sucesso <span className="text-base font-normal text-(--ink-3)">· {p.cases.length}</span></h2>
        {p.cases.length === 0 ? <p className="text-sm text-(--ink-3)">Nenhum case informado.</p> : (
          <ol className="space-y-3">
            {p.cases.map((c, i) => (
              <li key={i} className="rounded-xl border border-(--line) bg-(--brand-50) p-4">
                <dl className="grid gap-3 md:grid-cols-2">
                  <div className="md:col-span-2"><Block label={`Case ${i + 1} · Cliente`} value={c.cliente} /></div>
                  <Block label="Desafio" value={c.desafio} /><Block label="Solução" value={c.solucao} />
                  <div className="md:col-span-2"><Block label="Resultado" value={c.resultado} /></div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
      <section className="card"><h2 className="mb-2">Perfil ideal de cliente</h2><dl className="grid gap-3 md:grid-cols-2">
        <Block label="Perfil de cliente / sub-segmento" value={p.perfil_cliente} />
        <Block label="Persona decisora" value={p.persona_decisora} />
        <Block label="Persona influenciadora" value={p.persona_influenciadora} />
        <Block label="Quantidade de funcionários" value={employeesLabel(p.funcionarios_min, p.funcionarios_max)} />
        <Block label="Modelo de receita" value={p.modelo_receita} />
        <Block label={ticketLabel(p.modelo_receita)} value={p.ticket_medio == null ? null : fmtTicket(p.ticket_medio, p.modelo_receita)} />
      </dl></section>
    </div>
  );
}
