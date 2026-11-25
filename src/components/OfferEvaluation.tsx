"use client";

import { Icon } from "@/components/Icon";
import { ClassBadge } from "@/components/ui";
import { hasPitchContent } from "@/lib/book";
import type { RoundRow } from "@/lib/rounds";
import type { Criterion } from "@/lib/types";

export type EvaluationCriterion = Pick<Criterion, "id" | "name" | "question" | "weight" | "rubric">;

const brDate = (iso: string) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso));

function Text({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h4 className="mb-1 text-sm font-bold uppercase tracking-wider text-(--brand-800)">{title}</h4><div className="whitespace-pre-wrap text-lg leading-snug">{children}</div></section>;
}

/** A avaliação que o head fez desta oferta para o segmento: nota de cada critério, a justificativa e o pitch. Só leitura. */
export function OfferEvaluation({ row, segmentName, criteria, chips, level, onBack }: {
  row: RoundRow; segmentName: string; criteria: EvaluationCriterion[];
  /** destaques dos regionais sobre a oferta */
  chips: React.ReactNode;
  /** escolha de nível (Foco / Apoio / Fora), para decidir sem sair da tela */
  level: React.ReactNode;
  onBack: () => void;
}) {
  const ev = row.evaluation;
  const pt = row.pitch;
  const qs = [pt?.pergunta_1, pt?.pergunta_2, pt?.pergunta_3].filter((x) => (x ?? "").trim());
  const cases = pt?.cases ?? [];
  const description = (pt?.descricao ?? row.description ?? "").trim();
  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <button type="button" className="btn" onClick={onBack}><Icon name="arrow_back" size={16} />Voltar</button>
        <span className="text-sm text-(--ink-3)">Esc também volta</span>
        <div className="ml-auto flex items-center gap-2"><span className="text-sm font-semibold text-(--forest)">Nível</span>{level}</div>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-base">
        <span className="badge !text-base bg-(--brand-50) ring-1 ring-(--line)">{row.buCode}{row.code ? ` · ${row.code}` : ""}</span>
        <span className="font-semibold tabular-nums">Nota {row.score} de 100</span>
        <ClassBadge code={row.classCode} label={row.classLabel} />
        {ev?.specialistLed && <span className="badge bg-(--accent-100) text-(--accent-800)">Venda liderada pelo especialista</span>}
      </div>
      <h2 className="mt-2 !text-4xl !leading-tight text-(--forest)">{row.name}</h2>
      {description && <p className="mt-2 whitespace-pre-wrap text-lg text-(--ink-2)">{description}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5"><span className="mr-1 text-sm font-semibold text-(--forest)">Regionais:</span>{chips}</div>

      <h3 className="mt-6 mb-1 text-2xl">Avaliação para o segmento {segmentName}</h3>
      {ev?.updatedAt && <p className="mb-3 text-sm text-(--ink-3)">Preenchida pela BU {row.buCode} · atualizada em {brDate(ev.updatedAt)}</p>}
      {!ev ? <p className="rounded-xl border border-dashed border-(--line-strong) p-5 text-lg text-(--ink-3)">Os detalhes desta avaliação não foram encontrados.</p> : (
        <div className="space-y-3">
          {criteria.map((c, i) => {
            const note = ev.notes[i];
            const evidence = (ev.evidence[i] ?? "").trim();
            return (
              <section key={c.id} className="grid gap-4 rounded-xl border border-(--line) p-4 md:grid-cols-[6rem_1fr]">
                <div className="text-center md:border-r md:border-(--line) md:pr-3">
                  <div className="text-4xl font-semibold tabular-nums text-(--forest)">{note ?? "—"}<span className="text-lg text-(--ink-3)"> / 5</span></div>
                  <div className="text-xs text-(--ink-3)">peso {c.weight}</div>
                </div>
                <div>
                  <h4 className="text-xl font-semibold text-(--forest)">{c.name}</h4>
                  <p className="text-sm text-(--ink-3)">{c.question}</p>
                  {note != null && c.rubric[String(note)] && <p className="mt-2 text-lg"><b>Nota {note}:</b> {c.rubric[String(note)]}</p>}
                  {evidence && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-(--brand-50) px-3 py-2 text-lg"><b>Evidência:</b> {evidence}</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      <h3 className="mt-6 mb-3 text-2xl">Pitch para o segmento</h3>
      {pt && hasPitchContent(pt) ? (
        <div className="grid gap-4">
          {pt.dores && <Text title="Dores do cliente">{pt.dores}</Text>}
          {pt.proposta_valor && <Text title="Proposta de valor">{pt.proposta_valor}</Text>}
          {pt.pitch_abertura && <Text title="Como abrir a conversa">{pt.pitch_abertura}</Text>}
          {qs.length > 0 && <Text title="Perguntas de descoberta">{qs.map((x, i) => `${i + 1}. ${x}`).join("\n")}</Text>}
          {cases.length > 0 && <Text title="Cases de sucesso">{cases.map((c) => `${c.cliente}${c.resultado ? ` — ${c.resultado}` : ""}`).join("\n")}</Text>}
          {pt.perfil_cliente && <Text title="Perfil de cliente">{pt.perfil_cliente}</Text>}
          {pt.persona_decisora && <Text title="Quem decide">{pt.persona_decisora}</Text>}
          {pt.persona_influenciadora && <Text title="Quem influencia">{pt.persona_influenciadora}</Text>}
        </div>
      ) : <p className="rounded-xl border border-dashed border-(--line-strong) p-5 text-lg text-(--ink-3)">O pitch desta oferta ainda não foi escrito.</p>}
    </div>
  );
}
