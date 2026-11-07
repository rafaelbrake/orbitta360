import { DIRECTORS_ENABLED } from "@/lib/features";
import { waveDeadlineKey, waveScope } from "@/lib/waves";
import { Flash } from "@/components/Flash";
import { loadConfig } from "@/lib/data";
import { requireProfile } from "@/lib/session";
import { saveBands, saveCriteria, saveSettings } from "@/app/actions/admin";
import { SubmitButton } from "@/components/SubmitButton";
import Link from "next/link";
import { Notice, PageHeader } from "@/components/ui";

export default async function ConfigPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const st = config.settings;

  return (
    <div className="space-y-8">
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader title="Configuração" subtitle="Parâmetros, critérios e faixas. Alterar pesos ou faixas recalcula todos os scores." />

      <section>
        <h2 className="mb-2">Parâmetros e prazos</h2>
        <form action={saveSettings} className="card grid gap-3 md:grid-cols-4">
          <label className="flex items-center gap-2 text-sm md:col-span-4"><input type="checkbox" name="period_open" defaultChecked={st.period_open} /> Período de preenchimento aberto (desmarcar bloqueia a edição dos heads)</label>
          <div><label className="label">Passo do ticket (%)</label><input name="ticket_step" defaultValue={Math.round(st.ticket_step * 100)} className="input" /></div>
          {DIRECTORS_ENABLED
            ? <div><label className="label">Prazo dos diretores</label><input type="date" name="deadline_directors" defaultValue={st.deadline_directors ?? ""} className="input" /></div>
            : <input type="hidden" name="deadline_directors" defaultValue={st.deadline_directors ?? ""} /> /* campo oculto: salvar não apaga o prazo */}
          <div className="md:col-span-4">
            <span className="label">Prazos de entrega dos heads, por onda</span>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {config.waves.map((w) => (
                <div key={w.name} className="rounded-lg border border-(--line) bg-(--brand-50) p-3">
                  <label className="label" htmlFor={`w-${w.name}`}>{w.name}</label>
                  <input id={`w-${w.name}`} type="date" name={waveDeadlineKey(w.name)} defaultValue={w.deadline ?? ""} className="input bg-white" />
                  <p className="mt-1 text-xs text-(--ink-3)">{waveScope(w)}</p>
                </div>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-(--ink-3)">As ondas são as dos segmentos ativos (campo “Onda” em Segmentos). O prazo geral dos heads é o da última onda.</p>
          </div>
          <div className="flex items-end"><SubmitButton>Salvar</SubmitButton></div>
        </form>
      </section>

      <section>
        <h2 className="mb-2">Critérios, pesos e rubricas</h2>
        <form action={saveCriteria} className="space-y-3">
          {config.criteria.map((c) => (
            <div key={c.id} className="card grid gap-3 md:grid-cols-6">
              <div className="md:col-span-4"><label className="label">Critério {c.id}</label><input name={`name_${c.id}`} defaultValue={c.name} className="input" /></div>
              <div><label className="label">Peso (pontos)</label><input name={`weight_${c.id}`} defaultValue={c.weight} inputMode="decimal" className="input" /></div>
              <div className="md:col-span-6"><label className="label">Pergunta</label><input name={`question_${c.id}`} defaultValue={c.question} className="input" /></div>
              {[1, 2, 3, 4, 5].map((n) => (
                <div key={n} className="md:col-span-6"><label className="label">Rubrica da nota {n}</label>
                  <textarea name={`rubric_${c.id}_${n}`} rows={2} defaultValue={c.rubric[String(n)]} className="input" /></div>
              ))}
            </div>
          ))}
          <p className="text-sm text-(--ink-3)">Os pesos precisam somar 100. Ao salvar, todos os scores e classificações são recalculados.</p>
          <SubmitButton>Salvar critérios</SubmitButton>
        </form>
      </section>

      <section>
        <h2 className="mb-2">Faixas de classificação</h2>
        <form action={saveBands} className="card space-y-3">
          {config.bands.map((b) => (
            <div key={b.id} className="grid gap-3 md:grid-cols-6">
              <div className="md:col-span-2"><label className="label">Classificação</label><input name={`label_${b.id}`} defaultValue={b.label} className="input" /></div>
              <div><label className="label">De</label><input name={`min_${b.id}`} defaultValue={b.min_score} className="input" /></div>
              <div><label className="label">Até</label><input name={`max_${b.id}`} defaultValue={b.max_score} className="input" /></div>
              <div className="md:col-span-2"><label className="label">Direcionamento</label><input name={`direction_${b.id}`} defaultValue={b.direction} className="input" /></div>
            </div>
          ))}
          <SubmitButton>Salvar faixas</SubmitButton>
        </form>
      </section>

      <Notice tone="info" icon="tune">
        Segmentos, ondas e BUs agora têm cadastro próprio, com lista, filtros e tela de edição:{" "}
        <Link href="/admin/segmentos" className="font-semibold underline">Segmentos</Link> ·{" "}
        <Link href="/admin/bus" className="font-semibold underline">Unidades de Negócio</Link>.
      </Notice>
    </div>
  );
}
