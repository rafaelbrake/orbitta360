"use client";

import { useState } from "react";
import { FormFooter } from "@/components/ui";
import { SubmitButton } from "@/components/SubmitButton";
import type { Bu, Profile, Role, Segment } from "@/lib/types";

function Checks({ name, items, checked }: { name: string; items: { id: string; label: string }[]; checked: string[] }) {
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((i) => (
        <label key={i.id} className="flex cursor-pointer items-center gap-2 rounded-lg border border-(--line-strong) bg-white px-3 py-1.5 text-sm has-[:checked]:border-(--brand) has-[:checked]:bg-(--brand-50) has-[:checked]:font-semibold">
          <input type="checkbox" name={name} value={i.id} defaultChecked={checked.includes(i.id)} className="size-4" />
          {i.label}
        </label>
      ))}
    </div>
  );
}

/** Cadastro de usuário (convite) e edição, no mesmo formulário. Mostra só o que vale para o perfil escolhido. */
export function UserForm({ mode, action, user, bus, segs, buIds = [], segIds = [], cancelHref, allowDirector = true }: {
  mode: "new" | "edit"; action: (fd: FormData) => Promise<void>; user?: Profile; bus: Bu[]; segs: Segment[]; buIds?: string[]; segIds?: string[]; cancelHref: string;
  /** false enquanto a área dos Diretores Comerciais estiver oculta (quem já é diretor continua aparecendo como tal) */
  allowDirector?: boolean;
}) {
  const [role, setRole] = useState<Role>(user?.role ?? "head");

  return (
    <form action={action}>
      {user && <input type="hidden" name="id" value={user.id} />}

      <section className="card !p-5">
        <h2 className="mb-4">Dados</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {mode === "new" ? (
            <div>
              <label className="label" htmlFor="u-email">E-mail *</label>
              <input id="u-email" name="email" type="email" required className="input" placeholder="nome@selbetti.com.br" />
              <p className="mt-1 text-xs text-(--ink-3)">A pessoa recebe um convite para criar a senha.</p>
            </div>
          ) : (
            <div>
              <span className="label">E-mail</span>
              <div className="input flex items-center bg-(--brand-50) text-(--ink-2)">{user?.email}</div>
            </div>
          )}
          <div>
            <label className="label" htmlFor="u-name">Nome</label>
            <input id="u-name" name="full_name" defaultValue={user?.full_name ?? ""} className="input" />
          </div>
        </div>
      </section>

      <section className="card mt-4 !p-5">
        <h2 className="mb-4">Perfil e acesso</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label className="label" htmlFor="u-role">Perfil *</label>
            <select id="u-role" name="role" className="input" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option value="head">Head de BU</option>
              {(allowDirector || user?.role === "diretor") && <option value="diretor">Diretor Comercial</option>}
              <option value="admin">Diretoria Corporativa (admin)</option>
            </select>
          </div>
          {mode === "edit" && (
            <label className="flex cursor-pointer items-center gap-2 self-end rounded-lg border border-(--line-strong) bg-white px-3 py-2 text-sm font-medium md:w-fit">
              <input type="checkbox" name="active" defaultChecked={user?.active} className="size-4" /> Usuário ativo
            </label>
          )}
        </div>

        {role === "head" && (
          <div className="mt-5">
            <span className="label">BUs que ele pontua</span>
            <Checks name="bus" items={bus.map((b) => ({ id: b.id, label: b.code }))} checked={buIds} />
            <p className="mt-1.5 text-xs text-(--ink-3)">O Head só enxerga e edita as BUs marcadas.</p>
          </div>
        )}

        {role === "diretor" && (
          <div className="mt-5 space-y-5">
            <div className="max-w-sm">
              <label className="label" htmlFor="u-reg">Regional</label>
              <input id="u-reg" name="regional" defaultValue={user?.regional ?? ""} className="input" />
            </div>
            <div>
              <span className="label">Segmentos em que registra</span>
              <Checks name="segments" items={segs.map((s) => ({ id: s.id, label: s.name }))} checked={segIds} />
              <p className="mt-1.5 text-xs text-(--ink-3)">Sem nenhum marcado, ele pode registrar em qualquer segmento ativo.</p>
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" name="can_see_bu_detail" defaultChecked={user?.can_see_bu_detail} className="size-4" />
              Pode ver o detalhe por BU (ranking, heatmap e pitches das BUs já enviadas)
            </label>
          </div>
        )}

        {role === "admin" && <p className="mt-4 text-sm text-(--ink-2)">A Diretoria Corporativa enxerga e administra tudo; não há BUs ou segmentos a atribuir.</p>}
      </section>

      <FormFooter cancelHref={cancelHref} cancelLabel={mode === "new" ? "Cancelar" : "Voltar à lista"}>
        <SubmitButton pendingLabel={mode === "new" ? "Enviando convite…" : "Salvando…"}>{mode === "new" ? "Enviar convite por e-mail" : "Salvar alterações"}</SubmitButton>
      </FormFooter>
    </form>
  );
}
