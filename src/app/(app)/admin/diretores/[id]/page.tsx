import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { reopenMmt } from "@/app/actions/admin";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { RegionalViewForm } from "@/components/RegionalViewForm";
import { BackLink, Notice, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, loadConfig, STATUS_LABEL } from "@/lib/data";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { MMT_LABEL, isMmtComplete, mmtStatusOf, sortMmt } from "@/lib/mmt";
import { isViewFilled } from "@/lib/regional";
import { requireProfile } from "@/lib/session";
import type { MmtRecord, MmtSubmission, RegionalView } from "@/lib/types";

/** Um diretor regional visto pela Diretoria: a visão por segmento e os destaques. A Diretoria pode editar em nome dele. */
export default async function DiretorDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  if (!DIRECTORS_ENABLED) redirect("/admin");
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: person } = await supabase.from("profiles").select("id,full_name,email,regional,role,active").eq("id", id).maybeSingle();
  if (!person || person.role !== "diretor") notFound();

  const [config, viewsR, recR, subR] = await Promise.all([
    loadConfig(supabase),
    supabase.from("regional_views").select("segment_id,regional,works,not_works").eq("author_id", id),
    supabase.from("mmt_records").select("*").eq("author_id", id),
    supabase.from("mmt_submissions").select("*").eq("user_id", id).maybeSingle<MmtSubmission>(),
  ]);
  const views = new Map(((viewsR.data ?? []) as RegionalView[]).map((v) => [v.segment_id, v]));
  const records = sortMmt((recR.data ?? []) as MmtRecord[]);
  const submission = subR.data ?? null;
  const filled = config.activeSegments.filter((s) => isViewFilled(views.get(s.id))).length;
  const status = mmtStatusOf(submission, records.length + filled);
  const segName = new Map(config.segments.map((s) => [s.id, s.name]));
  const buCode = new Map(config.bus.map((b) => [b.id, b.code]));
  const name = person.full_name || person.email;

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <BackLink href="/admin/diretores">Diretores regionais</BackLink>
      <PageHeader title={name} subtitle={`Regional: ${person.regional || "não informada"} · prazo ${fmtDate(config.settings.deadline_directors)}`}
        actions={status === "submitted" && (
          <form action={reopenMmt}><input type="hidden" name="user_id" value={id} /><input type="hidden" name="back" value={`/admin/diretores/${id}`} />
            <ConfirmSubmit className="btn" title="Reabrir o envio deste diretor?" message="O diretor volta a poder editar a visão e os registros e precisará enviar de novo." confirmLabel="Reabrir">Reabrir o envio</ConfirmSubmit>
          </form>
        )}>
        <StatusBadge status={status} label={STATUS_LABEL[status]} />
        {submission?.submitted_at && status === "submitted" && <span className="text-sm text-(--ink-3)">enviado em {fmtDateTime(submission.submitted_at)}</span>}
      </PageHeader>

      <Notice tone="info" icon="edit" className="mb-5">
        Você está vendo a visão de {name} como Diretoria Corporativa e <b>pode editar em nome dele(a)</b>, mesmo depois do envio, para ajudar no preenchimento. As alterações ficam registradas na auditoria.
      </Notice>

      <h2 className="mb-1">Visão da região, por segmento</h2>
      <p className="mb-3 text-sm text-(--ink-3)">{filled} de {config.activeSegments.length} segmentos com visão. O que for escrito aqui aparece para o líder de cada segmento.</p>
      <div className="space-y-4">
        {config.activeSegments.map((s) => (
          <RegionalViewForm key={s.id} segmentId={s.id} segmentName={s.name} authorId={id} readOnly={false}
            initial={{ works: views.get(s.id)?.works ?? "", not_works: views.get(s.id)?.not_works ?? "" }} />
        ))}
      </div>

      <div className="mb-2 mt-8 flex flex-wrap items-center gap-3">
        <h2>Destaques por oferta (Manter / Mudar / Treinar)</h2>
        <Link href={`/diretor/registro/novo?para=${id}`} className="btn btn-primary ml-auto"><Icon name="add" size={18} />Novo destaque em nome de {name}</Link>
      </div>
      {records.length === 0 ? <p className="card text-sm text-(--ink-3)">Nenhum destaque registrado.</p> : (
        <div className="table-wrap">
          <table className="min-w-[44rem]">
            <thead><tr><th className="th">Tipo</th><th className="th">Título</th><th className="th">Segmento</th><th className="th">BU</th><th className="th">Situação</th><th className="th">Atualizado</th><th className="th col-actions w-28"></th></tr></thead>
            <tbody>
              {records.map((r) => (
                <tr key={r.id}>
                  <td className="td"><span className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">{MMT_LABEL[r.type]}</span></td>
                  <td className="td max-w-xs"><Link href={`/diretor/registro/${r.id}`} className="line-clamp-2 font-semibold text-(--forest) hover:underline">{r.headline || "Sem título"}</Link></td>
                  <td className="td text-sm">{segName.get(r.segment_id)}</td>
                  <td className="td text-sm font-medium">{buCode.get(r.bu_id)}</td>
                  <td className="td">{isMmtComplete(r) ? <span className="badge bg-(--brand-100) text-(--brand-800)"><Icon name="task_alt" size={14} />Completo</span> : <span className="badge bg-amber-100 text-amber-900"><Icon name="edit" size={14} />Incompleto</span>}</td>
                  <td className="td whitespace-nowrap text-sm text-(--ink-3)">{fmtDateTime(r.updated_at)}</td>
                  <td className="td col-actions text-right"><Link href={`/diretor/registro/${r.id}`} className="btn btn-sm"><Icon name="edit" size={16} />Abrir</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
