"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";
import { FlashFromUrl } from "@/components/Flash";
import { Icon, type IconName } from "@/components/Icon";
import { Logo } from "@/components/Logo";

export interface NavItem { href: string; label: string; icon: IconName; /** prefixo que marca o item como ativo */ match?: string; exact?: boolean }
export interface NavGroup { title?: string; items: NavItem[] }

const isActive = (pathname: string, item: NavItem) => {
  if (item.exact) return pathname === item.href;
  const prefix = item.match ?? item.href;
  return pathname === prefix || pathname.startsWith(prefix + "/");
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

const COLLAPSE_KEY = "orbitta360.sidebar.collapsed";

export function AppShell({ groups, user, signOut, children }: {
  groups: NavGroup[]; user: { name: string; role: string }; signOut: () => Promise<void>; children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [drawerFor, setDrawerFor] = useState<string | null>(null); // guarda o pathname em que a gaveta abriu
  const drawerOpen = drawerFor === pathname; // navegar fecha a gaveta sozinho
  const drawerRef = useRef<HTMLDivElement>(null);

  // Preferência de menu recolhido (só por usuário/navegador; falha de storage não impede o uso).
  useEffect(() => {
    try {
      if (localStorage.getItem(COLLAPSE_KEY) === "1") setCollapsed(true);
    } catch {}
  }, []);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      try { localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1"); } catch {}
      return !c;
    });

  useEffect(() => {
    if (!drawerOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setDrawerFor(null);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    drawerRef.current?.querySelector<HTMLElement>("a,button")?.focus();
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [drawerOpen]);

  const nav = (compact: boolean) => (
    <nav aria-label="Navegação principal" className="flex-1 space-y-5 overflow-y-auto px-3 py-4">
      {groups.map((g, i) => (
        <div key={i}>
          {g.title && !compact && <div className="eyebrow mb-1.5 px-3 !text-white/50">{g.title}</div>}
          {g.title && compact && i > 0 && <div className="mx-3 mb-2 border-t border-white/15" />}
          <ul className="space-y-1">
            {g.items.map((it) => {
              const active = isActive(pathname, it);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    title={compact ? it.label : undefined}
                    aria-current={active ? "page" : undefined}
                    className={`group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${compact ? "justify-center" : ""} ${
                      active ? "bg-white/12 text-white" : "text-white/75 hover:bg-white/8 hover:text-white"
                    }`}
                  >
                    {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r bg-(--accent)" aria-hidden />}
                    <Icon name={it.icon} size={21} className={active ? "text-(--accent)" : ""} />
                    {!compact && <span className="truncate">{it.label}</span>}
                    {compact && <span className="sr-only">{it.label}</span>}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );

  const account = (compact: boolean) => (
    <div className="border-t border-white/15 p-3">
      <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${compact ? "justify-center" : ""}`}>
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-(--calm) text-sm font-bold text-(--forest)" title={compact ? `${user.name} · ${user.role}` : undefined}>
          {initials(user.name)}
        </span>
        {!compact && (
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-white">{user.name}</div>
            <div className="truncate text-xs text-white/65">{user.role}</div>
          </div>
        )}
      </div>
      <form action={signOut} className="mt-1">
        <button className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-white/75 transition-colors hover:bg-white/8 hover:text-white ${compact ? "justify-center" : ""}`} title={compact ? "Sair" : undefined}>
          <Icon name="logout" size={20} />
          {compact ? <span className="sr-only">Sair</span> : "Sair"}
        </button>
      </form>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      {/* Menu fixo (desktop) */}
      <aside className={`sticky top-0 hidden h-screen shrink-0 flex-col bg-(--forest) transition-[width] duration-200 lg:flex ${collapsed ? "w-[76px]" : "w-64"}`}>
        <div className={`flex h-16 items-center border-b border-white/15 ${collapsed ? "justify-center" : "justify-between px-5"}`}>
          {collapsed ? (
            <button type="button" onClick={toggleCollapsed} className="btn btn-ghost btn-icon !text-white hover:!bg-white/10" aria-label="Expandir menu" aria-expanded={false}>
              <Icon name="chevron_right" />
            </button>
          ) : (
            <>
              <Link href="/" aria-label="Orbitta360 · início"><Logo variant="negativo" className="h-7" /></Link>
              <button type="button" onClick={toggleCollapsed} className="btn btn-ghost btn-icon btn-sm !text-white hover:!bg-white/10" aria-label="Recolher menu" aria-expanded>
                <Icon name="chevron_left" />
              </button>
            </>
          )}
        </div>
        {!collapsed && <div className="px-5 pt-4 font-[family-name:var(--font-oswald)] text-base tracking-wide text-(--calm)">Orbitta360</div>}
        {nav(collapsed)}
        {account(collapsed)}
        <div className="h-1 bg-(--accent)" aria-hidden />
      </aside>

      {/* Barra superior (celular/tablet) */}
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b-4 border-(--accent) bg-(--forest) px-3 lg:hidden">
        <button type="button" className="btn btn-ghost btn-icon !text-white hover:!bg-white/10" aria-label="Abrir menu" aria-expanded={drawerOpen} onClick={() => setDrawerFor(pathname)}>
          <Icon name="menu" />
        </button>
        <Link href="/" aria-label="Orbitta360 · início"><Logo variant="negativo" className="h-6" /></Link>
        <span className="font-[family-name:var(--font-oswald)] tracking-wide text-(--calm)">Orbitta360</span>
      </header>

      {/* Gaveta (celular/tablet) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-(--forest)/60 [animation:fade-in_0.15s_var(--ease)]" onClick={() => setDrawerFor(null)} />
          <div ref={drawerRef} className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-(--forest) shadow-(--shadow-3) [animation:slide-in_0.2s_var(--ease)]">
            <div className="flex h-14 items-center justify-between border-b border-white/15 px-4">
              <Logo variant="negativo" className="h-6" />
              <button type="button" className="btn btn-ghost btn-icon !text-white hover:!bg-white/10" aria-label="Fechar menu" onClick={() => setDrawerFor(null)}>
                <Icon name="close" />
              </button>
            </div>
            {nav(false)}
            {account(false)}
          </div>
        </div>
      )}

      <Suspense fallback={null}><FlashFromUrl /></Suspense>
      <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-10 lg:py-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
