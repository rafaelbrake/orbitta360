import Link from "next/link";
import { redirect } from "next/navigation";
import { saveRounds } from "@/app/actions/rounds";
import { Flash } from "@/components/Flash";
import { Icon } from "@/components/Icon";
import { SubmitButton } from "@/components/SubmitButton";
import { Notice, PageHeader } from "@/components/ui";
import { loadConfig } from "@/lib/data";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { roundDone, roundStats } from "@/lib/rounds";
import { loadRounds } from "@/lib/rounds-data";
import { requireProfile } from "@/lib/session";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Rodadas da reunião: a Diretoria define os grupos de BUs, o limite de Foco e o contexto, e acompanha cada segmento. */
export default async function RodadasAdminPage({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { supabase } = await requireProfile("admin");
  if (!DIRECTORS_ENABLED) redirect("/admin");
  const [config, rounds, prR] = await Promise.all([
    loadConfig(supabase),
    loadRounds(supabase),
    supabase.from("round_priorities").select("segment_id,round_id,level,pitch_validated"),
  ]);
  const segments = config.segments.filter((s) => s.active);
  const bus = config.bus.filter((b) => b.active);
  const roundOfBu = new Map(rounds.flatMap((r) => r.buIds.map((b) => [b, r.id] as const)));
  const prios = (prR.data ?? []) as { segment_id: string; round_id: string; level: string; pitch_validated: boolean }[];
  const cell = (segmentId: string, roundId: string) => {
    const mine = prios.filter((p) => p.segment_id === segmentId && p.round_id === roundId);
    return roundStats(mine.map((p) => ({ level: p.level as "foco" | "apoio" | "fora", pitchValidated: p.pitch_validated })), []);
  };
  const noRound = bus.filter((b) => !roundOfBu.has(b.id));

  return (
    <div>
      <Flash ok={sp.ok} erro={sp.erro} />
      <PageHeader title="Rodadas da reunião" subtitle="A dinâmica de consolidação roda em grupos de BUs: em cada rodada o líder de cada segmento decide o Foco, lapida o pitch e valida os pontos dos regionais." actions={<Link href="/admin/rodadas/contexto" className="btn"><Icon name="edit" size={18} />Telas de contexto</Link>} />

      <section className="mb-8">
        <h2 className="mb-2">Andamento por segmento</h2>
        <div className="table-wrap">
          <table className="min-w-[40rem]">
            <thead><tr><th className="th">Segmento</th>{rounds.map((r) => <th key={r.id} className="th">{r.position}. {r.name}<div className="text-xs font-normal text-(--ink-3)">Foco até {r.focoLimit}</div></th>)}<th className="th">Total em Foco</th><th className="th col-actions"></th></tr></thead>
            <tbody>
              {segments.map((s) => {
                const cells = rounds.map((r) => cell(s.id, r.id));
                const total = cells.reduce((n, c) => n + c.foco, 0);
                return (
                  <tr key={s.id}>
                    <td className="td font-semibold text-(--forest)">{s.name}<div className="text-xs font-normal text-(--ink-3)">{s.leader || "Sem líder"}</div></td>
                    {cells.map((c, i) => (
                      <td key={rounds[i].id} className="td text-sm">
                        <b className="tabular-nums">{c.foco}</b> em Foco
                        <div className="text-xs text-(--ink-3)">{c.pitchesValidados}/{c.foco} pitches validados</div>
                        {roundDone(c) && <span className="badge bg-(--brand) text-white">Concluída</span>}
                      </td>
                    ))}
                    <td className="td tabular-nums"><b>{total}</b> / {rounds.reduce((n, r) => n + r.focoLimit, 0)}</td>
                    <td className="td col-actions text-right"><Link href={`/segmento/${s.id}/rodadas`} className="btn btn-sm"><Icon name="visibility" size={16} />Abrir</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <form action={saveRounds} className="space-y-5">
        <h2>Grupos e regras</h2>
        {noRound.length > 0 && <Notice tone="warn">Sem rodada: {noRound.map((b) => b.code).join(", ")}. As ofertas dessas BUs não aparecem em nenhuma rodada.</Notice>}
        <div className="grid gap-4 lg:grid-cols-2">
          {rounds.map((r) => (
            <section key={r.id} className="card space-y-3 !p-5">
              <div className="eyebrow">Rodada {r.position}</div>
              <div className="grid gap-3 sm:grid-cols-[1fr_8rem]">
                <div><label className="label" htmlFor={`name_${r.id}`}>Nome</label><input id={`name_${r.id}`} name={`name_${r.id}`} className="input" maxLength={80} required defaultValue={r.name} /></div>
                <div><label className="label" htmlFor={`limit_${r.id}`}>Limite de Foco</label><input id={`limit_${r.id}`} name={`limit_${r.id}`} type="number" min={1} max={50} className="input" required defaultValue={r.focoLimit} /></div>
              </div>
              <div>
                <label className="label" htmlFor={`context_${r.id}`}>Contexto da rodada</label>
                <textarea id={`context_${r.id}`} name={`context_${r.id}`} rows={4} maxLength={8000} className="input" defaultValue={r.context ?? ""} placeholder="Números de mercado, visão da empresa, o que discutir. Aparece como uma tela no início da rodada." />
              </div>
            </section>
          ))}
        </div>
        <section className="card !p-5">
          <h3 className="mb-3">Em qual rodada cada BU entra</h3>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {bus.map((b) => (
              <div key={b.id}>
                <label className="label" htmlFor={`bu_${b.id}`}>{b.code} · {b.name}</label>
                <select id={`bu_${b.id}`} name={`bu_${b.id}`} className="input" defaultValue={roundOfBu.get(b.id) ?? ""}>
                  <option value="">Fora das rodadas</option>
                  {rounds.map((r) => <option key={r.id} value={r.id}>{r.position}. {r.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </section>
        <SubmitButton className="btn btn-primary">Salvar rodadas</SubmitButton>
      </form>
    </div>
  );
}
