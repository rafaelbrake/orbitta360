import Link from "next/link";
import { CopyButton } from "@/components/CopyButton";
import { Flash } from "@/components/Flash";
import { EmptyState } from "@/components/EmptyState";
import { SegmentedBar } from "@/components/SegmentedBar";
import { StatTile } from "@/components/StatTile";
import { PageHeader, ProgressBar, StatusBadge } from "@/components/ui";
import { daysUntil, fmtDate, fmtDateTime, loadConfig, progressOf, statusOf, STATUS_LABEL, waveStatuses } from "@/lib/data";
import { waveScope } from "@/lib/waves";
import { isViewFilled } from "@/lib/regional";
import { SegmentOverviewTable } from "@/components/SegmentOverviewTable";
import { loadSegmentOverview } from "@/lib/segment-overview";
import { Icon } from "@/components/Icon";
import { WaveCards } from "@/components/WaveCards";
import { requireProfile } from "@/lib/session";
import { reopenBu, reopenMmt } from "@/app/actions/admin";
import { fetchAll } from "@/lib/consolidated";
import { isScorable } from "@/lib/offers";
import { isMmtComplete, mmtStatusOf } from "@/lib/mmt";
import type { EvaluationScored, MmtRecord, MmtSubmission, Offer, Profile, Submission } from "@/lib/types";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { ConfirmSubmit } from "@/components/ConfirmSubmit";

export default async function AdminHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  const config = await loadConfig(supabase);
  const segOverview = DIRECTORS_ENABLED ? await loadSegmentOverview(supabase, config) : [];
  const [offers, evals, sb, ub, pr, mmt, mmtSb, rv] = await Promise.all([
    fetchAll<Offer>((a, b) => supabase.from("offers").select("*").order("id").range(a, b)),
    fetchAll<EvaluationScored>((a, b) => supabase.from("evaluations_scored").select("*").order("id").range(a, b)),
    supabase.from("bu_submissions").select("*"),
    supabase.from("user_bus").select("user_id,bu_id"),
    supabase.from("profiles").select("id,full_name,email,role,active,regional"),
    DIRECTORS_ENABLED ? fetchAll<MmtRecord>((a, b) => supabase.from("mmt_records").select("*").order("id").range(a, b)) : Promise.resolve([] as MmtRecord[]),
    DIRECTORS_ENABLED ? supabase.from("mmt_submissions").select("*") : Promise.resolve({ data: [] as MmtSubmission[] }),
    DIRECTORS_ENABLED ? supabase.from("regional_views").select("author_id,works,not_works") : Promise.resolve({ data: [] as { author_id: string; works: string | null; not_works: string | null }[] }),
  ]);
  const subs = (sb.data ?? []) as Submission[];
  const mmtSubs = (mmtSb.data ?? []) as MmtSubmission[];
  const profiles = (pr.data ?? []) as Pick<Profile, "id" | "full_name" | "email" | "role" | "active" | "regional">[];
  const links = (ub.data ?? []) as { user_id: string; bu_id: string }[];

  const rows = config.bus.filter((b) => b.active).map((b) => {
    const bo = offers.filter((x) => x.bu_id === b.id);
    const be = evals.filter((x) => x.bu_id === b.id);
    const p = progressOf(bo, config.activeSegments, be);
    const sub = subs.find((x) => x.bu_id === b.id) ?? null;
    const heads = links.filter((l) => l.bu_id === b.id).map((l) => profiles.find((u) => u.id === l.user_id)).filter(Boolean);
    const last = be.map((x) => x.updated_at).sort().at(-1) ?? null;
    const wp = waveStatuses(config.waves, bo, be);
    return { b, p, sub, st: statusOf(sub, p.done), heads, last, offerCount: bo.filter(isScorable).length, wp };
  });

  const headNames = (r: (typeof rows)[number]) => r.heads.map((h) => h!.full_name || h!.email).join(", ") || "sem head atribuído";
  // Pendentes por onda: BU que ainda não enviou e não completou as notas daquela onda
  const pendingByWave = config.waves.map((w, i) => ({ w, list: rows.filter((r) => r.st !== "submitted" && (r.wp[i].total === 0 || r.wp[i].done < r.wp[i].total)) }));
  const pendingText = pendingByWave
    .map(({ w, list }, i) => `Pendentes — ${w.name} (${waveScope(w)}), entrega até ${fmtDate(w.deadline)}:\n` + (list.length ? list.map((r) => `• ${r.b.code} ${r.b.name} — ${headNames(r)} — ${r.wp[i].pct}% das avaliações`).join("\n") : "• nenhuma BU pendente"))
    .join("\n\n");
  const pendingCount = new Set(pendingByWave.flatMap(({ list }) => list.map((r) => r.b.id))).size;

  const directors = profiles.filter((u) => u.role === "diretor" && u.active).map((u) => {
    const mine = mmt.filter((r) => r.author_id === u.id);
    const sub = mmtSubs.find((x) => x.user_id === u.id) ?? null;
    const complete = mine.filter((r) => isMmtComplete(r)).length;
    const last = mine.map((r) => r.updated_at).sort().at(-1) ?? null;
    const views = ((rv.data ?? []) as { author_id: string; works: string | null; not_works: string | null }[]).filter((v) => v.author_id === u.id && isViewFilled(v)).length;
    return { u, total: mine.length, complete, views, sub, st: mmtStatusOf(sub, mine.length + views), last };
  }).sort((a, b) => (a.u.full_name || a.u.email).localeCompare(b.u.full_name || b.u.email, "pt-BR"));
  const pendingDirectors = directors.filter((d) => d.st !== "submitted");
  const pendingDirectorsText =
    `Pendentes — visão regional e destaques 2027 (prazo: ${fmtDate(config.settings.deadline_directors)}):\n` +
    pendingDirectors.map((d) => `• ${d.u.full_name || d.u.email}${d.u.regional ? ` (${d.u.regional})` : ""} — ${STATUS_LABEL[d.st]} (${d.total} registros, ${d.complete} completos)`).join("\n");

  // Indicadores do topo
  const count = (st: string) => rows.filter((r) => r.st === st).length;
  const sent = count("submitted");
  const totalDone = rows.reduce((n, r) => n + r.p.done, 0);
  const totalCells = rows.reduce((n, r) => n + r.p.total, 0);
  const avgPct = totalCells ? Math.round((totalDone / totalCells) * 100) : 0;
  const dirSent = directors.filter((d) => d.st === "submitted").length;
  // Andamento de todas as BUs, por onda
  const waveTotals = config.waves.map((w, i) => {
    const done = rows.reduce((n, r) => n + r.wp[i].done, 0);
    const total = rows.reduce((n, r) => n + r.wp[i].total, 0);
    return { name: w.name, scope: waveScope(w), deadline: w.deadline, left: daysUntil(w.deadline), done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  });

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader
        title="Progresso do preenchimento"
        subtitle={DIRECTORS_ENABLED ? "Heads de BU e Diretores Comerciais · entregas por onda" : "Heads de BU · entregas por onda"}
        actions={<CopyButton text={pendingText} label={`Copiar pendentes (${pendingCount})`} />}
      >
        <span className={`badge ${config.settings.period_open ? "bg-(--brand-100) text-(--brand-800)" : "bg-red-100 text-red-800"}`}>
          Período {config.settings.period_open ? "aberto" : "fechado"}
        </span>
      </PageHeader>

      <section aria-label="Indicadores" className={`mb-4 grid gap-3 sm:grid-cols-2 ${DIRECTORS_ENABLED ? "xl:grid-cols-3" : ""}`}>
        <StatTile icon="task_alt" label="BUs enviadas" value={<>{sent}<span className="text-lg text-(--ink-3)"> / {rows.length}</span></>} hint={`${count("progress")} em andamento · ${count("none")} não iniciadas`} />
        <StatTile icon="monitoring" label="Preenchimento das BUs" value={`${avgPct}%`} hint={`${totalDone} de ${totalCells} células pontuadas`} />
        {DIRECTORS_ENABLED && <StatTile icon="assignment" label="Diretores enviados" value={<>{dirSent}<span className="text-lg text-(--ink-3)"> / {directors.length}</span></>} hint={`Prazo ${fmtDate(config.settings.deadline_directors)}`} />}
      </section>

      <WaveCards waves={waveTotals} unit="avaliações das BUs" />

      <div className="card mb-6 mt-6">
        <div className="eyebrow mb-3">Situação das BUs</div>
        <SegmentedBar
          parts={[
            { label: "Enviado", value: sent, color: "var(--brand)" },
            { label: "Reaberto", value: count("reopened"), color: "var(--forest)" },
            { label: "Em andamento", value: count("progress"), color: "var(--accent)" },
            { label: "Não iniciado", value: count("none"), color: "var(--line-strong)" },
          ]}
        />
      </div>

      <h2 className="mb-3">Heads de BU</h2>
      <div className="table-wrap">
        <table className="min-w-[52rem]">
          <thead><tr>
            <th className="th">BU</th><th className="th">Head</th><th className="th">Ofertas</th>{config.waves.map((w) => <th key={w.name} className="th w-44">{w.name}{w.deadline ? ` · ${fmtDate(w.deadline).slice(0, 5)}` : ""}</th>)}<th className="th">Status</th><th className="th">Última atualização</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.b.id}>
                <td className="td font-semibold">{r.b.code}<div className="text-xs font-normal text-(--ink-3)">{r.b.name}</div></td>
                <td className="td whitespace-nowrap text-sm">{r.heads.length ? r.heads.map((h) => <div key={h!.id}>{h!.full_name || h!.email}</div>) : <span className="font-medium text-(--danger)">sem head atribuído</span>}</td>
                <td className="td tabular-nums">{r.offerCount}</td>
                {r.wp.map((w) => <td key={w.name} className="td"><ProgressBar done={w.done} total={w.total} unit="" /></td>)}
                <td className="td"><StatusBadge status={r.st} label={STATUS_LABEL[r.st]} /></td>
                <td className="td text-sm text-(--ink-2)">{fmtDateTime(r.last)}</td>
                <td className="td whitespace-nowrap">
                  <div className="flex items-center justify-end gap-2">
                    <Link href={`/bu/${r.b.code}`} className="btn btn-sm">Abrir</Link>
                    {r.st === "submitted" && (
                      <form action={reopenBu}>
                        <input type="hidden" name="bu_id" value={r.b.id} />
                        <ConfirmSubmit className="btn btn-sm" title="Reabrir o envio desta BU?" message="O head volta a poder editar notas, pitches e ofertas. O envio precisará ser feito de novo." confirmLabel="Reabrir">Reabrir</ConfirmSubmit>
                      </form>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {DIRECTORS_ENABLED && (
        <>
      <div className="mb-3 mt-10 flex flex-wrap items-center gap-3">
        <h2>Diretores Comerciais — visão regional e destaques</h2>
        <span className="text-sm text-(--ink-3)">Prazo: {fmtDate(config.settings.deadline_directors)}</span>
        <div className="ml-auto"><CopyButton text={pendingDirectorsText} label={`Copiar pendentes (${pendingDirectors.length})`} /></div>
      </div>
      <div className="table-wrap">
        <table className="min-w-[40rem]">
          <thead><tr>
            <th className="th">Diretor</th><th className="th">Regional</th><th className="th">Visão regional</th><th className="th">Destaques</th><th className="th w-56">Preenchimento</th><th className="th">Status</th><th className="th">Última atualização</th><th className="th"></th>
          </tr></thead>
          <tbody>
            {directors.map((d) => (
              <tr key={d.u.id}>
                <td className="td font-semibold">{d.u.full_name || d.u.email}</td>
                <td className="td text-sm">{d.u.regional || "—"}</td>
                <td className="td tabular-nums text-sm">{d.views} de {config.activeSegments.length} segmentos</td>
                <td className="td tabular-nums">{d.total}</td>
                <td className="td"><ProgressBar done={d.complete} total={d.total} unit="completos" /></td>
                <td className="td"><StatusBadge status={d.st} label={STATUS_LABEL[d.st]} /></td>
                <td className="td text-sm text-(--ink-2)">{fmtDateTime(d.last)}</td>
                <td className="td whitespace-nowrap text-right">
                  <Link href={`/admin/diretores/${d.u.id}`} className="btn btn-sm mr-1.5"><Icon name="visibility" size={16} />Abrir</Link>
                  {d.st === "submitted" && (
                    <form action={reopenMmt} className="inline">
                      <input type="hidden" name="user_id" value={d.u.id} />
                      <ConfirmSubmit className="btn btn-sm" title="Reabrir o envio deste diretor?" message="O diretor volta a poder editar os registros e precisará enviar de novo." confirmLabel="Reabrir">Reabrir</ConfirmSubmit>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {directors.length === 0 && (
          <EmptyState icon="group" title="Nenhum Diretor Comercial cadastrado" compact>
            Convide em <Link className="font-semibold text-(--brand) underline" href="/admin/usuarios">Usuários</Link> para acompanhar o Manter / Mudar / Treinar aqui.
          </EmptyState>
        )}
      </div>

      <div className="mb-3 mt-10 flex flex-wrap items-center gap-3">
        <h2>Líderes de segmento — consolidação</h2>
        <span className="text-sm text-(--ink-3)">Reunião de consolidação em 25 e 26/11</span>
      </div>
      <SegmentOverviewTable rows={segOverview} />
        </>
      )}
    </div>
  );
}
