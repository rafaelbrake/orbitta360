import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/Icon";
import { Logo } from "@/components/Logo";
import { PrintButton } from "@/components/PrintButton";
import { buildBook, clip, type BookOffer, type OfferInfo, type PitchData } from "@/lib/book";
import { loadRanking } from "@/lib/consolidated";
import { fmtDate } from "@/lib/data";
import { DIRECTORS_ENABLED } from "@/lib/features";
import { fmtTicket } from "@/lib/offers";
import { employeesLabel } from "@/lib/pitch";
import { isViewFilled } from "@/lib/regional";
import { LEVEL_LABEL, type Level } from "@/lib/segment";
import { requireSegmentAccess } from "@/lib/segment-data";
import { homeFor, requireProfile } from "@/lib/session";

type Row = Record<string, unknown>;

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  if (!children) return null;
  return <section className="break-inside-avoid"><h3 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-(--brand-800)">{title}</h3><div className="text-[13px] leading-relaxed">{children}</div></section>;
}
const Text = ({ v }: { v: string | null | undefined }) => ((v ?? "").trim() ? <p className="whitespace-pre-wrap">{v}</p> : null);

function PitchBody({ o }: { o: BookOffer }) {
  const p = o.pitch;
  if (!p) return <p className="rounded-lg border border-dashed border-(--line-strong) p-4 text-sm text-(--ink-3)">O pitch desta oferta ainda não foi escrito.</p>;
  const questions = [p.pergunta_1, p.pergunta_2, p.pergunta_3].filter((q) => (q ?? "").trim());
  const people = [["Perfil de cliente", p.perfil_cliente], ["Decisor", p.persona_decisora], ["Influenciador", p.persona_influenciadora]].filter(([, v]) => (v ?? "").trim());
  const size = employeesLabel(p.funcionarios_min, p.funcionarios_max);
  const model = p.modelo_receita ?? o.info?.revenue_model ?? null;
  const ticket = p.ticket_medio ?? o.info?.ticket_medio ?? null;
  return (
    <div className="grid gap-4">
      <Block title="Dores do cliente"><Text v={p.dores} /></Block>
      <Block title="Proposta de valor"><Text v={p.proposta_valor} /></Block>
      <Block title="Como abrir a conversa"><Text v={p.pitch_abertura} /></Block>
      {questions.length > 0 && <Block title="Perguntas de descoberta"><ol className="ml-4 list-decimal space-y-1">{questions.map((q, i) => <li key={i}>{q}</li>)}</ol></Block>}
      {(p.cases ?? []).length > 0 && (
        <Block title="Cases de sucesso">
          <div className="space-y-2">
            {(p.cases ?? []).map((c, i) => (
              <div key={i} className="break-inside-avoid rounded-lg border border-(--line) bg-(--brand-50) p-3">
                {c.cliente && <div className="font-semibold">{c.cliente}</div>}
                {c.desafio && <p><b>Desafio:</b> {c.desafio}</p>}
                {c.solucao && <p><b>Solução:</b> {c.solucao}</p>}
                {c.resultado && <p><b>Resultado:</b> {c.resultado}</p>}
              </div>
            ))}
          </div>
        </Block>
      )}
      {(people.length > 0 || size !== "—") && (
        <Block title="Para quem vender">
          <ul className="space-y-0.5">
            {people.map(([k, v]) => <li key={k as string}><b>{k}:</b> {v}</li>)}
            {size !== "—" && <li><b>Porte (funcionários):</b> {size}</li>}
          </ul>
        </Block>
      )}
      {(model || ticket != null) && <Block title="Modelo e ticket"><p>{[model, ticket != null ? fmtTicket(Number(ticket), model) : null].filter(Boolean).join(" · ")}</p></Block>}
    </div>
  );
}

/** Book de vendas do segmento, em página de impressão (A4): "Imprimir / Salvar como PDF". */
export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  if (!DIRECTORS_ENABLED) {
    const { profile } = await requireProfile();
    redirect(homeFor(profile.role));
  }
  const { id } = await params;
  const { supabase, config, segment } = await requireSegmentAccess(id);

  const [rows, prR, stR, headR, leaderR, viewsR] = await Promise.all([
    loadRanking(supabase, config, { segmentId: id }),
    supabase.from("segment_priorities").select("offer_id,level,note").eq("segment_id", id),
    supabase.from("segment_strategies").select("thesis,message,status,finalized_at").eq("segment_id", id).maybeSingle(),
    supabase.from("pitches").select("*").eq("segment_id", id),
    supabase.from("segment_pitches").select("*").eq("segment_id", id),
    supabase.from("regional_views").select("regional,works,not_works").eq("segment_id", id),
  ]);
  const strategy = stR.data as { thesis: string | null; message: string | null; status: string; finalized_at: string | null } | null;
  const levels = new Map<string, Level>((prR.data ?? []).map((r) => [r.offer_id as string, r.level as Level]));
  const notes = new Map<string, string>((prR.data ?? []).filter((r) => r.note).map((r) => [r.offer_id as string, r.note as string]));
  const headPitches = new Map<string, PitchData>(((headR.data ?? []) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));
  const leaderPitches = new Map<string, PitchData>(((leaderR.data ?? []) as Row[]).map((r) => [r.offer_id as string, r as unknown as PitchData]));

  const wanted = [...new Set(rows.filter((r) => levels.has(r.offerId)).map((r) => r.offerId))];
  const { data: offerRows } = wanted.length ? await supabase.from("offers").select("id,description,offer_type,revenue_model,ticket_medio").in("id", wanted) : { data: [] };
  const info = new Map<string, OfferInfo>((offerRows ?? []).map((o) => [o.id as string, { description: o.description as string | null, offer_type: o.offer_type as string | null, revenue_model: o.revenue_model as string | null, ticket_medio: o.ticket_medio != null ? Number(o.ticket_medio) : null }]));

  const bandLabel = Object.fromEntries(config.bands.map((b) => [b.code, b.label]));
  const book = buildBook({
    rows: rows.map((r) => ({ offerId: r.offerId, code: r.offerCode, name: r.offerName, buCode: r.bu.code, score: r.score, classLabel: bandLabel[r.classCode] ?? r.classCode })),
    levels, notes, info, headPitches, leaderPitches,
  });
  const views = ((viewsR.data ?? []) as { regional: string | null; works: string | null; not_works: string | null }[]).filter((v) => isViewFilled(v));
  const final = strategy?.status === "final";
  const semPitch = [...book.foco, ...book.apoio].filter((o) => !o.pitch).length;
  const today = fmtDate(new Date().toISOString());

  return (
    <div className="mx-auto max-w-[210mm] bg-white px-6 py-6 text-(--ink) print:max-w-none print:p-0">
      {/* barra de ações: não sai na impressão */}
      <div className="mb-6 flex flex-wrap items-center gap-3 rounded-xl border border-(--line) bg-(--brand-50) p-3 print:hidden">
        <PrintButton />
        <Link href={`/segmento/${id}`} className="btn"><Icon name="arrow_back" size={18} />Voltar ao segmento</Link>
        <span className="text-sm text-(--ink-2)">No diálogo de impressão, escolha <b>Salvar como PDF</b>. Papel A4.</span>
        {!final && <span className="badge bg-amber-100 text-amber-900">Rascunho: a versão final ainda não foi travada</span>}
        {semPitch > 0 && <span className="badge bg-amber-100 text-amber-900">{semPitch} {semPitch === 1 ? "oferta" : "ofertas"} sem pitch</span>}
        {book.semNivel > 0 && <span className="badge bg-slate-200 text-slate-700">{book.semNivel} sem nível (fora do book)</span>}
      </div>

      {/* capa */}
      <header className="flex min-h-[60vh] flex-col justify-between rounded-2xl bg-(--forest) p-10 text-white print:min-h-[250mm] print:rounded-none">
        <Logo variant="negativo" className="h-10 w-auto self-start" />
        <div>
          <div className="text-sm uppercase tracking-[0.2em] text-(--calm)">Book de vendas 2027</div>
          <h1 className="mt-3 text-5xl font-medium !text-white">{segment.name}</h1>
          <div className="mt-6 h-1 w-16 rounded bg-(--accent)" />
        </div>
        <div className="text-sm text-(--calm)">
          {segment.leader && <div>Líder do segmento: <b className="text-white">{segment.leader}</b></div>}
          <div>{final ? `Versão final de ${fmtDate(strategy?.finalized_at)}` : `Rascunho de ${today}`}</div>
        </div>
      </header>

      {/* estratégia */}
      <section className="mt-8 break-before-page">
        <h2 className="mb-4 text-2xl">Estratégia do segmento</h2>
        {(strategy?.thesis ?? "").trim() ? <div className="mb-5"><div className="eyebrow mb-1">Onde vamos focar e por quê</div><p className="whitespace-pre-wrap text-[15px] leading-relaxed">{strategy!.thesis}</p></div> : <p className="mb-5 text-sm text-(--ink-3)">A tese do segmento ainda não foi escrita.</p>}
        {(strategy?.message ?? "").trim() && <div className="mb-6"><div className="eyebrow mb-1">Mensagem aos vendedores</div><p className="whitespace-pre-wrap text-[15px] leading-relaxed">{strategy!.message}</p></div>}

        <h3 className="mb-2 text-lg">Em resumo</h3>
        <table className="w-full border-collapse text-[13px]">
          <thead><tr className="border-b-2 border-(--forest) text-left text-[11px] uppercase tracking-wider text-(--ink-3)"><th className="py-1.5 pr-2">Nível</th><th className="pr-2">Oferta</th><th className="pr-2">BU</th><th className="pr-2 text-right">Nota</th><th>Por quê</th></tr></thead>
          <tbody>
            {[...book.foco, ...book.apoio].map((o) => (
              <tr key={o.offerId} className="break-inside-avoid border-b border-(--line) align-top">
                <td className="py-1.5 pr-2 font-semibold">{LEVEL_LABEL[o.level]}</td><td className="pr-2">{o.name}</td><td className="pr-2">{o.buCode}</td><td className="pr-2 text-right tabular-nums">{o.score}</td><td className="text-(--ink-2)">{o.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {book.fora.length > 0 && <p className="mt-3 text-[13px] text-(--ink-2)"><b>Fora do radar neste ciclo:</b> {book.fora.map((o) => o.name).join(" · ")}</p>}
      </section>

      {/* ofertas em Foco: uma página cada */}
      {book.foco.map((o) => (
        <article key={o.offerId} className="break-before-page pt-8 print:pt-0">
          <div className="mb-4 flex flex-wrap items-center gap-2 text-xs">
            <span className="badge bg-(--brand) text-white">Foco</span>
            <span className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">{o.buCode}{o.code ? ` · ${o.code}` : ""}</span>
            <span className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">Nota {o.score} · {o.classLabel}</span>
            {o.info?.offer_type && <span className="badge bg-(--brand-50) text-(--forest) ring-1 ring-(--line)">{o.info.offer_type}</span>}
          </div>
          <h2 className="mb-2 text-3xl">{o.name}</h2>
          {(o.pitch?.descricao ?? o.info?.description ?? "").trim() && <p className="mb-4 text-[15px] leading-relaxed text-(--ink-2)">{o.pitch?.descricao ?? o.info?.description}</p>}
          {o.note && <p className="mb-4 rounded-lg bg-(--accent-100) px-3 py-2 text-[13px] text-(--accent-800)"><b>Por que é Foco:</b> {o.note}</p>}
          <PitchBody o={o} />
        </article>
      ))}

      {/* ofertas em Apoio: versão resumida */}
      {book.apoio.length > 0 && (
        <section className="break-before-page pt-8 print:pt-0">
          <h2 className="mb-1 text-2xl">Ofertas de apoio</h2>
          <p className="mb-4 text-sm text-(--ink-2)">Entram na conversa quando o cliente demonstra a necessidade.</p>
          <div className="space-y-3">
            {book.apoio.map((o) => (
              <div key={o.offerId} className="break-inside-avoid rounded-lg border border-(--line) p-3 text-[13px]">
                <div className="flex flex-wrap items-baseline gap-2"><b className="text-[15px]">{o.name}</b><span className="text-(--ink-3)">{o.buCode} · nota {o.score}</span></div>
                {o.pitch ? (
                  <ul className="mt-1 space-y-0.5 text-(--ink-2)">
                    {o.pitch.proposta_valor && <li><b>Proposta de valor:</b> {clip(o.pitch.proposta_valor)}</li>}
                    {o.pitch.pitch_abertura && <li><b>Abertura:</b> {clip(o.pitch.pitch_abertura)}</li>}
                    {!o.pitch.proposta_valor && !o.pitch.pitch_abertura && o.pitch.descricao && <li>{clip(o.pitch.descricao)}</li>}
                  </ul>
                ) : <p className="mt-1 text-(--ink-3)">Pitch ainda não escrito.</p>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* o que dizem as regiões */}
      {views.length > 0 && (
        <section className="break-before-page pt-8 print:pt-0">
          <h2 className="mb-1 text-2xl">O que dizem as regiões</h2>
          <p className="mb-4 text-sm text-(--ink-2)">O tempero de quem vende na ponta.</p>
          <div className="space-y-4">
            {views.map((v, i) => (
              <div key={i} className="break-inside-avoid rounded-lg border border-(--line) p-4">
                <h3 className="mb-2 text-lg">{v.regional || "—"}</h3>
                <div className="grid gap-4 text-[13px] sm:grid-cols-2">
                  <div><div className="eyebrow mb-1">O que funciona</div><Text v={v.works} /></div>
                  <div><div className="eyebrow mb-1">O que não funciona</div><Text v={v.not_works} /></div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <footer className="mt-10 border-t border-(--line) pt-3 text-xs text-(--ink-3)">Orbitta360 · Selbetti · Book de vendas 2027 · {segment.name}</footer>
    </div>
  );
}
