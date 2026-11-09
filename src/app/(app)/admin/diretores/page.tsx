import Link from "next/link";
import { reopenMmt } from "@/app/actions/admin";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";
import { EmptyState } from "@/components/EmptyState";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { fmtDate, fmtDateTime, loadConfig, STATUS_LABEL } from "@/lib/data";
import { redirect } from "next/navigation";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { isMmtComplete, mmtStatusOf } from "@/lib/mmt";
import { isViewFilled } from "@/lib/regional";
import { requireProfile } from "@/lib/session";
import type { MmtRecord, MmtSubmission } from "@/lib/types";

/** Diretores regionais: o que cada um já registrou. A Diretoria abre qualquer um para acompanhar e ajudar. */
export default async function DiretoresPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  if (!DIRECTORS_ENABLED) redirect("/admin");
  const config = await loadConfig(supabase);
  const [pr, rec, sub, views] = await Promise.all([
    supabase.from("profiles").select("id,full_name,email,regional,active").eq("role", "diretor").eq("active", true),
    supabase.from("mmt_records").select("*"),
    supabase.from("mmt_submissions").select("*"),
    supabase.from("regional_views").select("author_id,works,not_works"),
  ]);
  const records = (rec.data ?? []) as MmtRecord[];
  const subs = (sub.data ?? []) as MmtSubmission[];
  const viewRows = (views.data ?? []) as { author_id: string; works: string | null; not_works: string | null }[];
  const people = (pr.data ?? []) as { id: string; full_name: string | null; email: string; regional: string | null }[];
  const rows = people.map((u) => {
    const mine = records.filter((r) => r.author_id === u.id);
    const filled = viewRows.filter((v) => v.author_id === u.id && isViewFilled(v)).length;
    const s = subs.find((x) => x.user_id === u.id) ?? null;
    return { u, filled, total: mine.length, complete: mine.filter((r) => isMmtComplete(r)).length, sub: s, st: mmtStatusOf(s, mine.length + filled), last: [...mine.map((r) => r.updated_at), s?.updated_at].filter(Boolean).sort().at(-1) ?? null };
  }).sort((a, b) => (a.u.full_name || a.u.email).localeCompare(b.u.full_name || b.u.email, "pt-BR"));

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader title="Diretores regionais" subtitle={`Visão regional e destaques por oferta · prazo ${fmtDate(config.settings.deadline_directors)}`} />
      {rows.length === 0 ? (
        <div className="card"><EmptyState icon="group" title="Nenhum Diretor Comercial cadastrado">Convide em <Link className="font-semibold text-(--brand) underline" href="/admin/usuarios">Usuários</Link>.</EmptyState></div>
      ) : (
        <div className="table-wrap">
          <table className="min-w-[56rem]">
            <thead><tr><th className="th">Diretor</th><th className="th">Regional</th><th className="th">Visão regional</th><th className="th">Destaques</th><th className="th w-52">Preenchimento</th><th className="th">Status</th><th className="th">Última atualização</th><th className="th col-actions w-44"></th></tr></thead>
            <tbody>
              {rows.map((d) => (
                <tr key={d.u.id}>
                  <td className="td font-semibold"><Link href={`/admin/diretores/${d.u.id}`} className="text-(--forest) hover:underline">{d.u.full_name || d.u.email}</Link></td>
                  <td className="td text-sm">{d.u.regional || "—"}</td>
                  <td className="td tabular-nums text-sm">{d.filled} de {config.activeSegments.length} segmentos</td>
                  <td className="td tabular-nums">{d.total}</td>
                  <td className="td"><ProgressBar done={d.complete} total={d.total} unit="completos" /></td>
                  <td className="td"><StatusBadge status={d.st} label={STATUS_LABEL[d.st]} /></td>
                  <td className="td text-sm text-(--ink-2)">{fmtDateTime(d.last)}</td>
                  <td className="td col-actions whitespace-nowrap text-right">
                    <Link href={`/admin/diretores/${d.u.id}`} className="btn btn-sm mr-1.5"><Icon name="visibility" size={16} />Abrir</Link>
                    {d.st === "submitted" && (
                      <form action={reopenMmt} className="inline"><input type="hidden" name="user_id" value={d.u.id} /><input type="hidden" name="back" value="/admin/diretores" />
                        <ConfirmSubmit className="btn btn-sm" title="Reabrir o envio deste diretor?" message="O diretor volta a poder editar a visão e os registros e precisará enviar de novo." confirmLabel="Reabrir">Reabrir</ConfirmSubmit>
                      </form>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
