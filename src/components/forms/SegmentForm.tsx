import { FormFooter } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { Segment } from "@/lib/types";

const ROLE_LABEL: Record<string, string> = { admin: "Diretoria", head: "Head de BU", diretor: "Diretor Comercial" };

export function SegmentForm({ mode, action, segment, nextSort, cancelHref, waveOptions = [], people = [], leaderIds = [], focoLimit = 5 }: {
  mode: "new" | "edit"; action: (fd: FormData) => Promise<void>; segment?: Segment; nextSort: number; cancelHref: string; waveOptions?: string[];
  /** usuários que podem liderar o segmento e quem já lidera */
  people?: { id: string; name: string; role: string; regional: string | null }[]; leaderIds?: string[];
  /** máximo de ofertas em Foco na consolidação do segmento */
  focoLimit?: number;
}) {
  return (
    <form action={action}>
      {segment && <input type="hidden" name="id" value={segment.id} />}
      <section className="card !p-5">
        <h2 className="mb-4">Segmento</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <label className="label" htmlFor="s-name">Nome *</label>
            <input id="s-name" name="name" required defaultValue={segment?.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="s-wave">Onda</label>
            <input id="s-wave" name="wave" list="s-wave-list" defaultValue={segment?.wave ?? ""} className="input" placeholder="Onda 1" />
            <datalist id="s-wave-list">{waveOptions.map((w) => <option key={w} value={w} />)}</datalist>
            <p className="mt-1 text-xs text-(--ink-3)">Define o prazo de entrega: o prazo de cada onda fica em Configuração.</p>
          </div>
          <div>
            <label className="label" htmlFor="s-sort">Ordem</label>
            <input id="s-sort" name="sort" inputMode="numeric" defaultValue={segment?.sort ?? nextSort} className="input" />
          </div>
          <div className="md:col-span-4">
            <input type="hidden" name="leaders_present" value="1" />
            <span className="label">Líder(es) do segmento</span>
            <div className="flex flex-wrap gap-2">
              {people.map((p) => (
                <label key={p.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-(--line-strong) bg-white px-3 py-1.5 text-sm has-[:checked]:border-(--brand) has-[:checked]:bg-(--brand-50) has-[:checked]:font-semibold">
                  <input type="checkbox" name="leaders" value={p.id} defaultChecked={leaderIds.includes(p.id)} className="size-4" />
                  {p.name}<span className="text-xs font-normal text-(--ink-3)">{[ROLE_LABEL[p.role] ?? p.role, p.regional].filter(Boolean).join(" · ")}</span>
                </label>
              ))}
              {people.length === 0 && <span className="text-sm text-(--ink-3)">Nenhum usuário ativo ainda.</span>}
            </div>
            <p className="mt-1.5 text-xs text-(--ink-3)">O líder consolida o segmento: lê a visão regional dos diretores e a classificação das BUs e monta a estratégia. Pode ser qualquer usuário (por exemplo, um head que também lidera um segmento).</p>
          </div>
          {mode === "edit" && (
            <div className="md:col-span-2">
              <label className="label" htmlFor="s-foco">Máximo de ofertas em Foco</label>
              <input id="s-foco" name="foco_limit" inputMode="numeric" defaultValue={focoLimit} className="input !w-28" />
              <input type="hidden" name="foco_limit_prev" value={focoLimit} />
              <p className="mt-1 text-xs text-(--ink-3)">Na consolidação, o líder escolhe no máximo este número de ofertas como Foco (padrão 5).</p>
            </div>
          )}
          <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-(--line-strong) bg-white px-3 py-2 text-sm font-medium md:col-span-2 md:w-fit">
            <input type="checkbox" name="active" defaultChecked={segment?.active} className="size-4" /> Ativo para pontuação
          </label>
        </div>
        <p className="mt-3 text-xs text-(--ink-3)">Só segmentos ativos aparecem na matriz de pontuação dos heads. Mantenha inativos os segmentos das próximas ondas.</p>
      </section>
      <FormFooter cancelHref={cancelHref} cancelLabel={mode === "new" ? "Cancelar" : "Voltar à lista"}>
        <SubmitButton>{mode === "new" ? "Cadastrar segmento" : "Salvar alterações"}</SubmitButton>
      </FormFooter>
    </form>
  );
}
