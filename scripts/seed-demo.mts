/**
 * DADOS DE EXEMPLO para testar com perfis diferentes. Use apenas em projeto de teste.
 *   npm run seed:demo -- --confirm
 * Cria: 1 admin, 1 head por BU, 1 head com 2 BUs (ITD+ITS), 2 diretores comerciais (um com detalhe das BUs liberado) e ofertas fictícias.
 * As senhas são geradas e gravadas em .demo-users.txt (ignorado pelo git); não são exibidas no terminal.
 */
import { randomBytes } from "node:crypto";
import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";
import { adminClient, must, readJson, root } from "./_client.mjs";

const { url, supabase } = adminClient();
if (!process.argv.includes("--confirm")) {
  console.error(`Isto cria usuários e ofertas FICTÍCIOS no projeto ${url}.\nRode com --confirm se for um projeto de teste.`);
  process.exit(1);
}

const bus = must(await supabase.from("bus").select("id,code"), "bus") as { id: string; code: string }[];
if (bus.length === 0) {
  console.error("Rode antes: npm run seed");
  process.exit(1);
}
const buId = Object.fromEntries(bus.map((b) => [b.code, b.id]));
const segs = must(await supabase.from("segments").select("id,name").in("name", ["Saúde", "Governo"]), "segments") as { id: string; name: string }[];

const lines: string[] = ["E-mail | Senha | Perfil"];

async function user(email: string, name: string, role: "admin" | "head" | "diretor", buCodes: string[] = [], regional?: string) {
  const password = randomBytes(12).toString("base64url");
  let id: string | undefined;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: name } });
  if (created.error) {
    // já existe: localiza e redefine a senha
    const list = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
    id = list.data.users.find((u) => u.email === email)?.id;
    if (!id) {
      console.error(`Falha ao criar ${email}: ${created.error.message}`);
      process.exit(1);
    }
    await supabase.auth.admin.updateUserById(id, { password });
  } else id = created.data.user.id;

  must(await supabase.from("profiles").upsert({ id, email, full_name: name, role, regional: regional ?? null, active: true }), `perfil ${email}`);
  await supabase.from("user_bus").delete().eq("user_id", id);
  if (buCodes.length) must(await supabase.from("user_bus").insert(buCodes.map((c) => ({ user_id: id, bu_id: buId[c] }))), `vínculos ${email}`);
  if (role === "diretor") {
    await supabase.from("user_segments").delete().eq("user_id", id);
    must(await supabase.from("user_segments").insert(segs.map((s) => ({ user_id: id, segment_id: s.id }))), "segmentos do diretor");
  }
  lines.push(`${email} | ${password} | ${role}${buCodes.length ? " " + buCodes.join("+") : ""}`);
}

await user("demo.admin@example.com", "Demo Diretoria Corporativa", "admin");
for (const b of bus) if (!["ITD", "ITS"].includes(b.code)) await user(`demo.head.${b.code.toLowerCase()}@example.com`, `Demo Head ${b.code}`, "head", [b.code]);
await user("demo.head.itd-its@example.com", "Demo Head ITD+ITS", "head", ["ITD", "ITS"]);
await user("demo.diretor@example.com", "Demo Diretor Comercial", "diretor", [], "Sul");
await user("demo.diretor.detalhe@example.com", "Demo Diretor (vê detalhe das BUs)", "diretor", [], "Norte");
must(await supabase.from("profiles").update({ can_see_bu_detail: true }).eq("email", "demo.diretor.detalhe@example.com"), "liberar detalhe");

const offers = readJson<Record<string, { code: string; name: string; description: string; offer_type: string; revenue_model: string; ticket_medio: number }[]>>("offers_demo.json");
for (const [code, list] of Object.entries(offers)) {
  if (code.startsWith("_")) continue;
  const existing = new Set((must(await supabase.from("offers").select("name").eq("bu_id", buId[code]), `ofertas ${code}`) as { name: string }[]).map((o) => o.name.toLowerCase()));
  const fresh = list.filter((o) => !existing.has(o.name.toLowerCase())).map((o) => ({ ...o, bu_id: buId[code] }));
  if (fresh.length) must(await supabase.from("offers").insert(fresh), `ofertas ${code}`);
}

const file = path.join(root, ".demo-users.txt");
writeFileSync(file, lines.join("\n") + "\n", { mode: 0o600 });
chmodSync(file, 0o600);
console.log(`Pronto. ${lines.length - 1} usuários de exemplo e as ofertas fictícias foram criados.\nLogins e senhas: ${file}`);
