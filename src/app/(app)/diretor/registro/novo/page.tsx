import { redirect } from "next/navigation";
import { createMmtRecord } from "@/app/actions/mmt";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { BackLink, FormFooter, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { MMT_LABEL, MMT_SPEC, MMT_TYPES } from "@/lib/mmt";
import { allowedSegments } from "@/lib/mmt-data";
import { requireProfile } from "@/lib/session";

const TYPE_ICON = { manter: "task_alt", mudar: "tune", treinar: "target" } as const;

export default async function NewMmtRecordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile("diretor");
  const [config, editable] = await Promise.all([loadConfig(supabase), supabase.rpc("mmt_editable", { p_author: profile.id })]);
  if (editable.data !== true) redirect("/diretor");
  const segments = (await allowedSegments(supabase, profile, config)).filter((s) => s.active);

  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/diretor">Meus registros</BackLink>
      <PageHeader title="Novo registro" subtitle="Escolha o tipo, o segmento e a BU. Em seguida você preenche os detalhes; o rascunho é salvo automaticamente." />

      <form action={createMmtRecord}>
        <fieldset className="card !p-5">
          <legend className="sr-only">Tipo de registro</legend>
          <h2 className="mb-4">Tipo</h2>
          <div className="grid gap-3 sm:grid-cols-3">
            {MMT_TYPES.map((t, i) => (
              <label key={t} className="flex cursor-pointer flex-col gap-1.5 rounded-xl border-2 border-(--line-strong) bg-white p-4 transition-colors hover:border-(--calm) has-[:checked]:border-(--brand) has-[:checked]:bg-(--brand-50)">
                <input type="radio" name="type" value={t} defaultChecked={i === 0} required className="sr-only" />
                <span className="flex items-center gap-2 font-semibold text-(--forest)"><Icon name={TYPE_ICON[t]} size={20} className="text-(--brand)" />{MMT_LABEL[t]}</span>
                <span className="text-xs text-(--ink-2)">{MMT_SPEC[t].intro}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <section className="card mt-4 !p-5">
          <h2 className="mb-4">Onde se aplica</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="label" htmlFor="n-seg">Segmento *</label>
              <select id="n-seg" name="segment_id" className="input" required>
                {segments.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="n-bu">BU *</label>
              <select id="n-bu" name="bu_id" className="input" required>
                {config.bus.filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.code} — {b.name}</option>)}
              </select>
            </div>
          </div>
          <p className="mt-3 text-xs text-(--ink-3)">A oferta (opcional), a prioridade e os demais campos você define na próxima tela.</p>
        </section>

        <FormFooter cancelHref="/diretor">
          <SubmitButton pendingLabel="Criando…">Continuar<Icon name="arrow_forward" size={18} /></SubmitButton>
        </FormFooter>
      </form>
    </div>
  );
}
