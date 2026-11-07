import { FormFooter } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { Bu } from "@/lib/types";

export function BuForm({ mode, action, bu, nextSort, cancelHref }: {
  mode: "new" | "edit"; action: (fd: FormData) => Promise<void>; bu?: Bu; nextSort: number; cancelHref: string;
}) {
  return (
    <form action={action}>
      {bu && <input type="hidden" name="id" value={bu.id} />}
      <section className="card !p-5">
        <h2 className="mb-4">Unidade de Negócio</h2>
        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label" htmlFor="b-code">Sigla *</label>
            <input id="b-code" name="code" required maxLength={10} defaultValue={bu?.code} className="input uppercase" placeholder="PRT" />
          </div>
          <div className="md:col-span-2">
            <label className="label" htmlFor="b-name">Nome *</label>
            <input id="b-name" name="name" required defaultValue={bu?.name} className="input" />
          </div>
          <div>
            <label className="label" htmlFor="b-sort">Ordem</label>
            <input id="b-sort" name="sort" inputMode="numeric" defaultValue={bu?.sort ?? nextSort} className="input" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-(--line-strong) bg-white px-3 py-2 text-sm font-medium md:col-span-4 md:w-fit">
            <input type="checkbox" name="active" defaultChecked={bu?.active ?? true} className="size-4" /> BU ativa
          </label>
        </div>
        <p className="mt-3 text-xs text-(--ink-3)">BU inativa deixa de aparecer no acompanhamento e nas telas dos heads.</p>
      </section>
      <FormFooter cancelHref={cancelHref} cancelLabel={mode === "new" ? "Cancelar" : "Voltar à lista"}>
        <SubmitButton>{mode === "new" ? "Cadastrar BU" : "Salvar alterações"}</SubmitButton>
      </FormFooter>
    </form>
  );
}
