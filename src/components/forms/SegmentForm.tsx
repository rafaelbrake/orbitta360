import { FormFooter } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { Segment } from "@/lib/types";

export function SegmentForm({ mode, action, segment, nextSort, cancelHref, waveOptions = [] }: {
  mode: "new" | "edit"; action: (fd: FormData) => Promise<void>; segment?: Segment; nextSort: number; cancelHref: string; waveOptions?: string[];
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
          <div className="md:col-span-2">
            <label className="label" htmlFor="s-leader">Líder do segmento</label>
            <input id="s-leader" name="leader" defaultValue={segment?.leader ?? ""} className="input" />
          </div>
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
