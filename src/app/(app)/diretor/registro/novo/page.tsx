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
  const { supabase, profile } = await requireProfile("diretor", "admin");
  // A Diretoria cria em nome de um diretor: o endereço traz ?para=<id do diretor>
  const para = typeof sp.para === "string" && /^[0-9a-f-]{36}$/i.test(sp.para) ? sp.para : null;
  if (profile.role === "admin" && !para) redirect("/admin/diretores");
  const { data: target } = profile.role === "admin" && para
    ? await supabase.from("profiles").select("id,full_name,email,regional,role,active").eq("id", para).maybeSingle()
    : { data: null };
  if (profile.role === "admin" && (!target || target.role !== "diretor")) redirect("/admin/diretores");
  const authorId = profile.role === "admin" ? para! : profile.id;
  const backHref = profile.role === "admin" ? `/admin/diretores/${authorId}` : "/diretor";
  const [config, editable] = await Promise.all([loadConfig(supabase), supabase.rpc("mmt_editable", { p_author: authorId })]);
  if (editable.data !== true) redirect(backHref);
  const segments = (await allowedSegments(supabase, profile, config)).filter((s) => s.active);
  const targetName = target ? target.full_name || target.email : null;

  return (
    <div className="max-w-3xl">
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href={backHref}>{targetName ? `Voltar a ${targetName}` : "Meus registros"}</BackLink>
      <PageHeader title="Novo registro" subtitle={targetName ? `Em nome de ${targetName}${target?.regional ? ` (${target.regional})` : ""}. Escolha o tipo, o segmento e a BU; em seguida preencha os detalhes. O rascunho é salvo automaticamente.` : "Escolha o tipo, o segmento e a BU. Em seguida você preenche os detalhes; o rascunho é salvo automaticamente."} />

      <form action={createMmtRecord}>
        {targetName && <input type="hidden" name="author_id" value={authorId} />}
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

        <FormFooter cancelHref={backHref}>
          <SubmitButton pendingLabel="Criando…">Continuar<Icon name="arrow_forward" size={18} /></SubmitButton>
        </FormFooter>
      </form>
    </div>
  );
}
