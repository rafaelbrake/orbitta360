"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { flash } from "@/lib/flash";
import { SITE_URL } from "@/lib/env";
import { parseOtpType, safeNext } from "@/lib/auth-link";

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

export async function signIn(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email"), password: String(fd.get("password") ?? "") });
  if (error) flash("/login", "erro", "E-mail ou senha inválidos.");
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestReset(fd: FormData) {
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(str(fd, "email"), { redirectTo: `${SITE_URL}/auth/confirm?next=/definir-senha` });
  // Mesma resposta exista ou não o e-mail (não revela quem tem conta).
  flash("/esqueci-senha", "ok", "Se o e-mail estiver cadastrado, você receberá um link para definir a senha.");
}

export async function setPassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) flash("/definir-senha", "erro", "A senha precisa ter pelo menos 8 caracteres.");
  if (password !== confirm) flash("/definir-senha", "erro", "As senhas não conferem.");
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) flash("/definir-senha", "erro", "Não foi possível salvar a senha. Abra o link do e-mail novamente.");
  redirect("/");
}

/** Confirma o link do e-mail (convite ou redefinição) quando a pessoa clica em "Continuar". */
export async function confirmEmailLink(fd: FormData) {
  const token_hash = str(fd, "token_hash");
  const type = parseOtpType(fd.get("type"));
  const bad = "Link inválido ou expirado. Peça um novo convite ou use “Esqueci minha senha”.";
  if (!token_hash || !type) flash("/login", "erro", bad);
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type: type!, token_hash });
  if (error) flash("/login", "erro", bad);
  redirect(safeNext(fd.get("next")));
}
