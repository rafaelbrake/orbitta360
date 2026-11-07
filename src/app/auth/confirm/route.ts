import { NextResponse, type NextRequest } from "next/server";
import { parseOtpType, safeNext } from "@/lib/auth-link";

/**
 * Destino dos links de convite e de redefinição de senha enviados por e-mail.
 * Este endereço NÃO consome o link: antivírus e filtros de e-mail abrem os links antes da pessoa,
 * e o token vale uma vez só. Ele apenas leva à página com o botão "Continuar", que confirma de verdade.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const token_hash = searchParams.get("token_hash");
  const type = parseOtpType(searchParams.get("type"));

  if (token_hash && type) {
    const url = new URL("/auth/continuar", request.url);
    url.searchParams.set("token_hash", token_hash);
    url.searchParams.set("type", type);
    url.searchParams.set("next", safeNext(searchParams.get("next")));
    return NextResponse.redirect(url);
  }
  const url = new URL("/login", request.url);
  url.searchParams.set("erro", "Link inválido ou expirado. Peça um novo convite ou use “Esqueci minha senha”.");
  return NextResponse.redirect(url);
}
