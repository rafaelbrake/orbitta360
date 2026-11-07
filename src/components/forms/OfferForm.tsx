import { FormFooter } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import { OfferIdFields } from "@/components/forms/OfferIdFields";
import { OfferPricingFields } from "@/components/forms/OfferPricingFields";
import type { Offer } from "@/lib/types";

export interface BuOption { id: string; code: string; name: string }

/**
 * Campos de uma oferta (ou de um agrupamento): o mesmo formulário serve para cadastrar e para ver/editar.
 * Tipo e modelo de receita são listas padronizadas; a BU é escolhida entre as BUs cadastradas
 * e não muda depois do cadastro.
 */
export function OfferForm({ mode, action, code, offer, readOnly, cancelHref, buOptions, buId, back, kind = "oferta", lockBu = false, nextCodes = {}, children }: {
  mode: "new" | "edit"; action: (fd: FormData) => Promise<void>; code: string; offer?: Offer; readOnly: boolean; cancelHref: string;
  buOptions: BuOption[]; buId: string; back?: string; kind?: "oferta" | "agrupamento"; lockBu?: boolean; nextCodes?: Record<string, string>; children?: React.ReactNode;
}) {
  const d = readOnly;
  const noun = kind === "agrupamento" ? "agrupamento" : "oferta";
  return (
    <form action={action}>
      <input type="hidden" name="code" value={code} />
      {offer && <input type="hidden" name="id" value={offer.id} />}
      {back && <input type="hidden" name="back" value={back} />}

      <section className="card !p-5">
        <h2 className="mb-4">Identificação</h2>
        <div className="grid gap-4 md:grid-cols-6">
          <OfferIdFields mode={mode} lockBu={lockBu} buOptions={buOptions} buId={buId} offerCode={offer?.code ?? null} nextCodes={nextCodes} />
          <div className="md:col-span-3">
            <label className="label" htmlFor="o-name">Nome *</label>
            <input id="o-name" name="name" required defaultValue={offer?.name ?? ""} disabled={d} className="input" />
          </div>
          <div className="md:col-span-6">
            <label className="label" htmlFor="o-desc">Descrição curta</label>
            <textarea id="o-desc" name="description" rows={2} maxLength={1000} defaultValue={offer?.description ?? ""} disabled={d} className="input" />
          </div>
        </div>
      </section>

      <section className="card mt-4 !p-5">
        <h2 className="mb-4">Classificação e receita</h2>
        <OfferPricingFields offer={offer} disabled={d} />
      </section>

      {children}

      {!readOnly && (
        <FormFooter cancelHref={cancelHref} cancelLabel={mode === "new" ? "Cancelar" : "Voltar à lista"}>
          <SubmitButton>{mode === "new" ? `Cadastrar ${noun}` : "Salvar alterações"}</SubmitButton>
        </FormFooter>
      )}
    </form>
  );
}
