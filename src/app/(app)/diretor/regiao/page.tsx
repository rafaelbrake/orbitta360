import Link from "next/link";
import { submitMmt } from "@/app/actions/mmt";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { DiretorTabs } from "@/components/DiretorTabs";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { RegionalViewForm } from "@/components/RegionalViewForm";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, loadConfig, STATUS_LABEL } from "@/lib/data";
import { mmtStatusOf } from "@/lib/mmt";
import { isViewFilled } from "@/lib/regional";
import { requireProfile } from "@/lib/session";
import type { MmtSubmission, RegionalView } from "@/lib/types";

/** Visão da região: um recado por segmento sobre o que funciona e o que não funciona, para a consolidação. */
export default async function MinhaRegiao({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile("diretor");
  const config = await loadConfig(supabase);

  const [viewsR, subR, editR, gapsR, recR] = await Promise.all([
    supabase.from("regional_views").select("segment_id,regional,works,not_works").eq("author_id", profile.id),
    supabase.from("mmt_submissions").select("*").eq("user_id", profile.id).maybeSingle<MmtSubmission>(),
    supabase.rpc("mmt_editable", { p_author: profile.id }),
    supabase.rpc("mmt_gaps", { p_user: profile.id }),
    supabase.from("mmt_records").select("id", { count: "exact", head: true }).eq("author_id", profile.id),
  ]);
  const views = new Map(((viewsR.data ?? []) as RegionalView[]).map((v) => [v.segment_id, v]));
  const submission = subR.data ?? null;
  const canEdit = editR.data === true;
  const gaps = (gapsR.data ?? []) as { record_id: string; detail: string }[];
  const recordCount = recR.count ?? 0;
  const segments = config.activeSegments;
  const filled = segments.filter((s) => isViewFilled(views.get(s.id))).length;
  const status = mmtStatusOf(submission, recordCount + filled);

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader
        title="Minha região"
        subtitle={`Regional: ${profile.regional || "não informada"} · Prazo de envio: ${fmtDate(config.settings.deadline_directors)}`}
      >
        <StatusBadge status={status} label={STATUS_LABEL[status]} />
        {!config.settings.period_open && <span className="badge bg-red-100 text-red-800">Período fechado</span>}
      </PageHeader>

      <DiretorTabs current="regiao" />

      <div className="mb-4 space-y-3">
        {status === "submitted" && <Notice tone="success">Enviado em {fmtDateTime(submission?.submitted_at)}. Sua visão está em modo somente leitura; fale com a Diretoria Corporativa para reabrir.</Notice>}
        {status === "reopened" && <Notice tone="accent">Envio reaberto: ajuste o que for preciso e envie novamente.</Notice>}
        <p className="max-w-3xl text-sm text-(--ink-2)">
          Conte, segmento por segmento, o que a sua região vive na ponta: o que funciona e o que não funciona. Os líderes de cada segmento usam esse material, junto com o dos outros diretores e com a classificação dos Heads, para fechar a estratégia. Não precisa preencher todos: escreva só onde você tem o que dizer.
        </p>
      </div>

      <div className="space-y-4">
        {segments.map((s) => (
          <RegionalViewForm
            key={s.id} segmentId={s.id} segmentName={s.name}
            initial={{ works: views.get(s.id)?.works ?? "", not_works: views.get(s.id)?.not_works ?? "" }}
            readOnly={!canEdit}
          />
        ))}
      </div>

      <p className="mt-4 text-sm text-(--ink-2)">
        Tem um exemplo concreto de uma oferta específica? Registre também em <Link href="/diretor" className="font-semibold text-(--brand) underline">Destaques por oferta</Link> (Manter / Mudar / Treinar).
      </p>

      {canEdit && (
        <section className="card mt-6">
          <h2 className="mb-1">Enviar</h2>
          <p className="text-sm text-(--ink-2)">{filled} de {segments.length} segmentos com visão{recordCount > 0 ? ` · ${recordCount} ${recordCount === 1 ? "destaque" : "destaques"} por oferta` : ""}.</p>
          {gaps.length > 0 ? (
            <ul className="mt-3 max-h-48 space-y-1 overflow-auto rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
              {gaps.map((g) => (
                <li key={g.record_id}>
                  <Link href={`/diretor/registro/${g.record_id}`} className="group flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white">
                    <Icon name="warning" size={16} /><span className="flex-1">{g.detail}</span><Icon name="arrow_forward" size={16} className="opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          ) : filled === 0 && recordCount === 0 ? (
            <p className="mt-3 text-sm text-(--ink-3)">Escreva a visão de ao menos um segmento para poder enviar.</p>
          ) : (
            <form action={submitMmt} className="mt-3">
              <input type="hidden" name="back" value="/diretor/regiao" />
              <ConfirmSubmit className="btn btn-primary" title="Enviar a visão da sua região?" message="Depois do envio a visão e os destaques ficam somente leitura. Só a Diretoria Corporativa pode reabrir." confirmLabel="Enviar">Enviar a visão da minha região</ConfirmSubmit>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
