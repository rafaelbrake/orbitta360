"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Icon } from "@/components/Icon";

export type FilterField =
  | { type: "search"; name: string; placeholder: string }
  | { type: "select"; name: string; label: string; options: { value: string; label: string }[]; allLabel?: string };

/** Campo de busca: digita à vontade e aplica depois de uma pausa (300 ms). Acompanha mudanças feitas por fora (voltar, limpar). */
function SearchField({ name, placeholder, onApply }: { name: string; placeholder: string; onApply: (name: string, value: string) => void }) {
  const params = useSearchParams();
  const urlValue = params.get(name) ?? "";
  const [text, setText] = useState(urlValue);
  const [lastSent, setLastSent] = useState(urlValue);
  const [lastUrl, setLastUrl] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A URL mudou por um motivo que não foi a nossa digitação: acompanha.
  if (urlValue !== lastUrl) {
    setLastUrl(urlValue);
    if (urlValue !== lastSent) {
      setText(urlValue);
      setLastSent(urlValue);
    }
  }

  const change = (value: string) => {
    setText(value);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setLastSent(value);
      onApply(name, value);
    }, 300);
  };

  return (
    <div className="min-w-56 flex-1">
      <label className="label" htmlFor={`flt-${name}`}>Buscar</label>
      <div className="relative">
        <Icon name="search" size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--ink-3)" />
        <input id={`flt-${name}`} type="search" value={text} onChange={(e) => change(e.target.value)} placeholder={placeholder} className="input !pl-10" autoComplete="off" />
      </div>
    </div>
  );
}

/** Lista suspensa: aplica na hora. Remonta quando a URL muda, então sempre mostra o filtro vigente. */
function SelectField({ field, onApply }: { field: Extract<FilterField, { type: "select" }>; onApply: (name: string, value: string) => void }) {
  const params = useSearchParams();
  const value = params.get(field.name) ?? "";
  return (
    <div className="min-w-40">
      <label className="label" htmlFor={`flt-${field.name}`}>{field.label}</label>
      <select key={value} id={`flt-${field.name}`} className="input" defaultValue={value} onChange={(e) => onApply(field.name, e.target.value)}>
        <option value="">{field.allLabel ?? "Todos"}</option>
        {field.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

/**
 * Barra de filtros no topo das listagens. Aplica sozinha, sem botão, e guarda o filtro na URL
 * (dá para copiar o link e o botão Voltar funciona). Mudar um filtro volta para a página 1.
 */
export function ListFilters({ fields, total, noun }: { fields: FilterField[]; total: number; noun: [string, string] }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();

  const go = (u: URLSearchParams) => {
    u.delete("page");
    u.delete("ok");
    u.delete("erro");
    const q = u.toString();
    startTransition(() => router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false }));
  };
  const apply = (name: string, value: string) => {
    const u = new URLSearchParams(params.toString());
    if (value) u.set(name, value);
    else u.delete(name);
    go(u);
  };
  const clear = () => {
    const u = new URLSearchParams(params.toString());
    for (const f of fields) u.delete(f.name);
    go(u);
  };
  const active = fields.some((f) => params.get(f.name));

  return (
    <div className="card mb-4 flex flex-wrap items-end gap-3 !p-3" role="search">
      {fields.map((f) =>
        f.type === "search" ? <SearchField key={f.name} name={f.name} placeholder={f.placeholder} onApply={apply} /> : <SelectField key={f.name} field={f} onApply={apply} />,
      )}
      <div className="flex items-center gap-3 pb-1.5">
        {active && (
          <button type="button" className="btn btn-sm" onClick={clear}>
            <Icon name="close" size={16} />Limpar filtros
          </button>
        )}
        <span className="flex items-center gap-1.5 text-sm text-(--ink-3)" aria-live="polite">
          {pending && <Icon name="progress_activity" size={16} className="spin" />}
          {total} {total === 1 ? noun[0] : noun[1]}
        </span>
      </div>
    </div>
  );
}
