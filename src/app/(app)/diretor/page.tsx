import Link from "next/link";
import { submitMmt } from "@/app/actions/mmt";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { DiretorTabs } from "@/components/DiretorTabs";
import { EmptyState } from "@/components/EmptyState";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { ListFilters, type FilterField } from "@/components/ListFilters";
import { Pagination } from "@/components/Pagination";
import { Notice, PageHeader, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, loadConfig, STATUS_LABEL } from "@/lib/data";
import { matchesQuery, pageParam, paginate, param } from "@/lib/list";
import { MMT_LABEL, MMT_STEPS, MMT_TYPES, PRIORITIES, PRIORITY_LABEL, isMmtComplete, mmtStatusOf, sortMmt } from "@/lib/mmt";
import { requireProfile } from "@/lib/session";
import type { MmtRecord, MmtSubmission } from "@/lib/types";

const PRIORITY_STYLE = { alta: "bg-red-100 text-red-800", media: "bg-amber-100 text-amber-900", baixa: "bg-slate-200 text-slate-700" } as const;
const TYPE_STYLE = { manter: "bg-(--brand) text-white", mudar: "bg-(--accent-100) text-(--accent-800)", treinar: "bg-(--brand-100) text-(--brand-800)" } as const;

export default async function DiretorHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase, profile } = await requireProfile("diretor");
  const config = await loadConfig(supabase);

  const [rec, sub, gapsRes, editableRes] = await Promise.all([
    supabase.from("mmt_records").select("*"),
    supabase.from("mmt_submissions").select("*").eq("user_id", profile.id).maybeSingle<MmtSubmission>(),
    supabase.rpc("mmt_gaps", { p_user: profile.id }),
    supabase.rpc("mmt_editable", { p_author: profile.id }),
  ]);
  const records = (rec.data ?? []) as MmtRecord[];
  const submission = sub.data ?? null;
  const gaps = (gapsRes.data ?? []) as { record_id: string; detail: string }[];
  const canEdit = editableRes.data === true;
  const status = mmtStatusOf(submission, records.length);
  const segName = new Map(config.segments.map((s) => [s.id, s.name]));
  const buCode = new Map(config.bus.map((b) => [b.id, b.code]));

  // Nome das ofertas citadas (a função devolve só nome e código, nunca scores)
  const buIds = [...new Set(records.filter((r) => r.offer_id).map((r) => r.bu_id))];
  const offerLists = await Promise.all(buIds.map((id) => supabase.rpc("list_offers", { p_bu: id })));
  const offerName = new Map(offerLists.flatMap((l) => ((l.data ?? []) as { id: string; name: string }[]).map((o) => [o.id, o.name] as const)));

  const f = { q: param(sp.q), type: param(sp.type), segment: param(sp.segment), bu: param(sp.bu), priority: param(sp.priority), state: param(sp.state) };
  const filtered = sortMmt(records)
    .filter((r) => matchesQuery(f.q, r.headline, r.evidence, r.action, r.indicator, segName.get(r.segment_id), buCode.get(r.bu_id), r.offer_id ? offerName.get(r.offer_id) : ""))
    .filter((r) => !f.type || r.type === f.type)
    .filter((r) => !f.segment || r.segment_id === f.segment)
    .filter((r) => !f.bu || r.bu_id === f.bu)
    .filter((r) => !f.priority || r.priority === f.priority)
    .filter((r) => !f.state || (f.state === "completo" ? isMmtComplete(r) : !isMmtComplete(r)));
  const pg = paginate(filtered, pageParam(sp.page));
  const complete = records.filter((r) => isMmtComplete(r)).length;

  const usedSegments = config.segments.filter((s) => records.some((r) => r.segment_id === s.id));
  const usedBus = config.bus.filter((b) => records.some((r) => r.bu_id === b.id));
  const fields: FilterField[] = [
    { type: "search", name: "q", placeholder: "Título, evidência, ação ou oferta" },
    { type: "select", name: "type", label: "Tipo", options: MMT_TYPES.map((t) => ({ value: t, label: MMT_LABEL[t] })) },
    { type: "select", name: "segment", label: "Segmento", options: usedSegments.map((s) => ({ value: s.id, label: s.name })) },
    { type: "select", name: "bu", label: "BU", options: usedBus.map((b) => ({ value: b.id, label: b.code })) },
    { type: "select", name: "priority", label: "Prioridade", options: PRIORITIES.map((p) => ({ value: p, label: PRIORITY_LABEL[p] })) },
    { type: "select", name: "state", label: "Situação", allLabel: "Todas", options: [{ value: "completo", label: "Completos" }, { value: "incompleto", label: "Incompletos" }] },
  ];

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader
        title="Manter / Mudar / Treinar"
        subtitle={`Regional: ${profile.regional || "não informada"} · Prazo de envio: ${fmtDate(config.settings.deadline_directors)}`}
        actions={canEdit && <Link href="/diretor/registro/novo" className="btn btn-primary"><Icon name="add" size={18} />Novo registro</Link>}
      >
        <StatusBadge status={status} label={STATUS_LABEL[status]} />
        {!config.settings.period_open && <span className="badge bg-red-100 text-red-800">Período fechado</span>}
      </PageHeader>

      <DiretorTabs current="registros" />

      <div className="mb-4 space-y-3">
        {status === "submitted" && <Notice tone="success">Enviado em {fmtDateTime(submission?.submitted_at)}. Os registros estão em modo somente leitura; fale com a Diretoria Corporativa para reabrir.</Notice>}
        {status === "reopened" && <Notice tone="accent">Envio reaberto: ajuste o que for preciso e envie novamente.</Notice>}
      </div>

      <details className="card mb-4 !p-3 [&_summary]:cursor-pointer" open={records.length === 0}>
        <summary className="flex items-center gap-2 text-sm font-semibold text-(--forest)"><Icon name="info" size={18} className="text-(--brand)" />Como funciona a atividade (4 etapas)</summary>
        <ol className="mt-3 grid gap-3 md:grid-cols-4">
          {MMT_STEPS.map((s, i) => (
            <li key={s.title} className="flex gap-3">
              <span className="grid size-7 shrink-0 place-items-center rounded-full bg-(--brand) font-[family-name:var(--font-oswald)] text-sm text-white">{i + 1}</span>
              <div><div className="text-sm font-semibold text-(--forest)">{s.title}</div><p className="mt-0.5 text-xs text-(--ink-3)">{s.text}</p></div>
            </li>
          ))}
        </ol>
      </details>

      <ListFilters fields={fields} total={filtered.length} noun={["registro", "registros"]} />

      {pg.total === 0 ? (
        <div className="card">
          <EmptyState icon="assignment" title={records.length === 0 ? "Você ainda não tem registros" : "Nenhum registro encontrado"}>
            {records.length === 0 ? (canEdit ? "Comece com “Novo registro”: um por prática a manter, problema a mudar ou competência a treinar." : "Não há registros.") : "Ajuste os filtros para ver outros registros."}
          </EmptyState>
        </div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[56rem]">
            <thead><tr>
              <th className="th">Tipo</th><th className="th">Título</th><th className="th">Segmento</th><th className="th">BU</th><th className="th">Oferta</th>
              <th className="th">Prioridade</th><th className="th">Situação</th><th className="th">Atualizado</th><th className="th col-actions w-32"></th>
            </tr></thead>
            <tbody>
              {pg.items.map((r) => (
                <tr key={r.id}>
                  <td className="td"><span className={`badge ${TYPE_STYLE[r.type]}`}>{MMT_LABEL[r.type]}</span></td>
                  <td className="td max-w-xs"><Link href={`/diretor/registro/${r.id}`} className="line-clamp-2 font-semibold text-(--forest) hover:underline">{r.headline || <span className="font-normal text-(--ink-3)">Sem título ainda</span>}</Link></td>
                  <td className="td text-sm">{segName.get(r.segment_id)}</td>
                  <td className="td text-sm font-medium">{buCode.get(r.bu_id)}</td>
                  <td className="td text-sm text-(--ink-2)">{r.offer_id ? offerName.get(r.offer_id) ?? "—" : "—"}</td>
                  <td className="td">{r.priority ? <span className={`badge ${PRIORITY_STYLE[r.priority]}`}>{PRIORITY_LABEL[r.priority]}</span> : <span className="text-(--ink-3)">—</span>}</td>
                  <td className="td">{isMmtComplete(r)
                    ? <span className="badge bg-(--brand-100) text-(--brand-800)"><Icon name="task_alt" size={14} />Completo</span>
                    : <span className="badge bg-amber-100 text-amber-900"><Icon name="edit" size={14} />Incompleto</span>}</td>
                  <td className="td whitespace-nowrap text-sm text-(--ink-3)">{fmtDateTime(r.updated_at)}</td>
                  <td className="td col-actions text-right"><Link href={`/diretor/registro/${r.id}`} className="btn btn-sm"><Icon name={canEdit ? "edit" : "visibility"} size={16} />{canEdit ? "Ver / editar" : "Ver"}</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination {...pg} basePath="/diretor" params={f} />

      {canEdit && records.length > 0 && (
        <section className="card mt-6">
          <h2 className="mb-1">Enviar</h2>
          <p className="text-sm text-(--ink-2)">{complete} de {records.length} registros completos.</p>
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
          ) : (
            <form action={submitMmt} className="mt-3">
              <ConfirmSubmit className="btn btn-primary" title="Enviar Manter / Mudar / Treinar?" message="Depois do envio os registros ficam somente leitura. Só a Diretoria Corporativa pode reabrir." confirmLabel="Enviar">Enviar Manter / Mudar / Treinar</ConfirmSubmit>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
