import { redirect } from "next/navigation";

/** Redireciona com mensagem de sucesso/erro (exibida pelo componente <Flash/>). */
export function flash(path: string, kind: "ok" | "erro", message: string): never {
  const sep = path.includes("?") ? "&" : "?";
  redirect(`${path}${sep}${kind}=${encodeURIComponent(message)}`);
}
