# Orbitta360 — Plataforma de Priorização do Portfólio 2027 (Selbetti)

Plataforma web com login e perfis para o Planejamento Comercial 2027:

- **Score de Priorização do Portfólio** — cada Head de BU pontua suas ofertas por segmento (5 critérios, score 0–100, classificação, pitch).
- **Manter / Mudar / Treinar** — Diretores Comerciais *(Fase 2)*.
- **Consolidação** — ranking, heatmap e exportação para a Diretoria Corporativa *(Fases 2 e 3)*.

**Estado atual: Fases 1 e 2.**

- **Fase 1** — login e perfis com RLS, admin de usuários e configuração, ofertas + importação do Excel, matriz de pontuação, pitch, rascunho/envio/reabertura, painel de progresso, log de auditoria básico.
- **Fase 2** — Manter / Mudar / Treinar do Diretor Comercial, ranking por segmento, heatmap BU × segmento, consolidado de Manter/Mudar/Treinar, progresso dos diretores e exportação para Excel (inclui o "pacote do segmento").
- **Fase 3** — comparativo entre critérios (risco de entrega; dor máxima com abertura difícil) e auditoria completa (nomes legíveis, filtros, paginação e Excel).

Stack: Next.js (App Router) + TypeScript + Tailwind · Supabase (Auth, Postgres, Row Level Security) · ExcelJS.

> **Segurança:** o controle por perfil vale **no banco** (RLS, em `supabase/migrations/0001_schema.sql`), não só na interface. A chave `service_role` só é usada no servidor (convite de usuários e scripts) e nunca deve ir para o navegador nem para o Git.

---

## 1. Rodar localmente

Pré-requisitos: Node 20+ e um projeto Supabase (gratuito serve para testar).

### 1.1 Criar o projeto Supabase

1. Em <https://supabase.com> crie um projeto (região `South America (São Paulo)` se disponível).
2. **Authentication → Sign In / Providers → Email:** deixe e-mail e senha ligados e **desative "Allow new users to sign up"** (só entra quem for convidado).
3. **Authentication → Email Templates**, troque os links para o fluxo do sistema:
   - **Invite user** — o link deve ser:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha`
   - **Reset password** — o link deve ser:
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/definir-senha`
4. **Authentication → URL Configuration:** `Site URL` = a URL do sistema (local: `http://localhost:3000`; produção: a URL publicada). Inclua a mesma URL em *Redirect URLs*.
5. **Identificação nos e-mails:** em **Authentication → Email Templates** troque o assunto dos modelos *Invite user* e *Reset password* para mencionar o **Orbitta360** (ex.: “Seu acesso ao Orbitta360”), e, no SMTP próprio, use “Orbitta360” como nome do remetente.
6. **E-mail em produção:** o envio padrão do Supabase é limitado a poucos e-mails por hora. Para convidar os 10 heads e os diretores de uma vez, configure um SMTP próprio em **Project Settings → Authentication → SMTP**.

### 1.2 Aplicar o banco

Abra **SQL Editor** no Supabase e execute, **nesta ordem**, o conteúdo de:

1. [`supabase/migrations/0001_schema.sql`](supabase/migrations/0001_schema.sql) — Fase 1;
2. [`supabase/migrations/0002_mmt.sql`](supabase/migrations/0002_mmt.sql) — Fase 2 (Manter/Mudar/Treinar e leitura do diretor);
3. [`supabase/migrations/0003_grouping.sql`](supabase/migrations/0003_grouping.sql) — tipo e modelo de receita padronizados, agrupamento de ofertas e etapas da BU. **Atenção:** enquadra as ofertas já cadastradas nas listas novas (o que não é Software nem Hardware vira *Serviço*; o que não é recorrente vira *Pontual*) e libera as BUs que já tinham notas, para ninguém perder trabalho.

(Se preferir a CLI do Supabase: `supabase link` + `supabase db push`, que aplica as duas na ordem.) 4. [`supabase/migrations/0004_offer_codes.sql`](supabase/migrations/0004_offer_codes.sql) — ID automático e sequencial das ofertas. **Atenção:** numera as ofertas que estão sem ID (na ordem de criação, a partir do maior número da BU), tira o ID das repetidas dentro da BU (a mais antiga mantém) e passa a exigir ID único por BU.

5. [`supabase/migrations/0005_pitch_per_offer.sql`](supabase/migrations/0005_pitch_per_offer.sql) — **pitch por oferta × segmento** (antes era por BU × segmento). **Atenção:** os pitches já preenchidos não têm oferta para apontar, então ficam guardados na tabela `pitches_legacy` (sem acesso pelo app; nada é apagado) e a tela passa a começar sem pitches.

6. [`supabase/migrations/0006_pitch_fields.sql`](supabase/migrations/0006_pitch_fields.sql) — **nova ficha de pitch** (descrição da oferta, cases em lista, perfil de cliente em campos específicos; saem sinergias, aderência e expansão). **Atenção:** apaga as colunas que saíram, mas antes copia a tabela inteira para `pitches_backup_0006` (sem acesso pelo app), aproveita o que já foi escrito (o ICP antigo vira *Perfil de cliente*, o case antigo vira o primeiro item da lista) e passa a exigir *perfil de cliente* e *persona decisora* no lugar do ICP e da aderência.

7. [`supabase/migrations/0007_offers_complete.sql`](supabase/migrations/0007_offers_complete.sql) — a etapa 1 (*conferir as ofertas*) só pode ser confirmada com **tipo e modelo de receita** preenchidos em todas as ofertas ativas da BU (o ticket continua opcional). Não altera dados; BUs que já confirmaram a etapa não são afetadas.

8. [`supabase/migrations/0008_offer_code_over_99.sql`](supabase/migrations/0008_offer_code_over_99.sql) — corrige o ID automático acima de 99 ofertas por BU (a 100ª virava `OF-10` e o cadastro falhava; agora segue `OF-100`, `OF-101`…). Não altera dados.

9. [`supabase/migrations/0009_delivery_waves.sql`](supabase/migrations/0009_delivery_waves.sql) — **duas ondas de entrega dos heads**: Onda 1 (Saúde e Indústria) até **12/11/2026** e Onda 2 (Varejo e Governo) até **19/11/2026**. Só ajusta dados: define a onda de cada segmento, **ativa os quatro segmentos** (Indústria e Governo entram na matriz dos heads) e grava os prazos. O prazo geral dos heads passa a ser o da última onda (19/11). Pode ser aplicada mais de uma vez.

10. [`supabase/migrations/0010_segment_leaders_regional_views.sql`](supabase/migrations/0010_segment_leaders_regional_views.sql) — **líderes de segmento** (atribuição de usuário a segmento, independente do perfil) e **visão regional** dos Diretores Comerciais (um recado por diretor e segmento). O líder lê a visão e os destaques de todos sobre o segmento dele; o envio do diretor passa a aceitar só a visão regional. Não altera dados existentes.

11. [`supabase/migrations/0011_segment_consolidation.sql`](supabase/migrations/0011_segment_consolidation.sql) — **consolidação por segmento**: o líder lê **ao vivo** as notas, pitches e ofertas das BUs sobre o segmento dele (somente leitura); prioridades por oferta em três níveis (**Foco, Apoio, Fora do radar**) com limite de ofertas em Foco por segmento (padrão 5, configurável pela Diretoria Corporativa em *Segmentos*); estratégia do segmento (tese e mensagem aos vendedores); **versão final** que o líder ou a Diretoria travam e só a Diretoria reabre. Não altera dados existentes.

12. [`supabase/migrations/0012_segment_pitches.sql`](supabase/migrations/0012_segment_pitches.sql) — **pitch editado pelo líder**: o líder edita uma cópia do pitch de cada oferta no segmento dele (o texto escrito pelo head fica intacto em `pitches`); o book usa a versão do líder quando existe e, senão, a do head. A edição segue a trava da versão final. Não altera dados existentes.

Quem já rodou as anteriores aplica só as novas.

#### Ondas de entrega dos heads

Cada segmento tem uma **onda** (campo *Onda* em *Segmentos*) e cada onda tem o **seu prazo** (em *Configuração → Prazos de entrega dos heads, por onda*). O envio da BU continua sendo um só, mas o sistema acompanha o andamento por onda: o cabeçalho da BU mostra as entregas ("Saúde e Indústria até 12/11 · Varejo e Governo até 19/11"), a matriz de classificação agrupa as colunas por onda e mostra um cartão por onda com prazo, dias restantes e avaliações feitas; o painel do admin traz um cartão e uma coluna de progresso por onda, e o botão *Copiar pendentes* gera a lista por onda. O prazo geral dos heads é sempre o da última onda. Para mudar uma data ou mover um segmento de onda, não precisa de migration: é só editar em *Configuração* ou *Segmentos*.

#### Base de ofertas a partir de uma planilha

Para carregar a base padrão de produtos (planilha com as colunas **Produto** e **BU** na linha 1):

```bash
npm run load:produtos -- --file "/caminho/Produtos.xlsx"             # SIMULA: mostra o que seria criado por BU
npm run load:produtos -- --file "/caminho/Produtos.xlsx" --confirm   # grava
```

O produto vira o nome da oferta, a BU é reconhecida pelo nome e o ID (OF-NN) é gerado pelo banco, na ordem da planilha. Tipo, modelo de receita e ticket entram em branco: os heads completam **na própria tabela da etapa 1** (listas em cada linha, salvamento automático, edição em lote por seleção e filtro de pendentes). Em cada linha (ou em lote, por seleção) o head pode **desconsiderar** uma oferta que não vale para a BU: ela não é apagada, só sai das próximas etapas (agrupamento, classificação e envio) e pode ser **reconsiderada** depois (filtro *Situação → Desconsideradas*). Agrupamentos e ofertas que já estão dentro de um agrupamento não podem ser desconsiderados antes de desfazer o agrupamento; com a etapa 1 já confirmada, só volta oferta que já tenha tipo e modelo. Seguro para rodar de novo: nomes que já existem na BU são ignorados. Se alguma BU da planilha não existir, nada é gravado.

#### Diretores regionais e líderes de segmento

Os Diretores Comerciais lideram **regiões** (Sul, SP, demais estados; Governo atua no país todo) e, cada um, **um segmento** na consolidação final. O trabalho tem duas partes:
1. **Visão da região** (*Minha região*, no menu do diretor): para cada segmento, um recado curto sobre *o que funciona* e *o que não funciona* na região (salva sozinho). Os *Destaques por oferta* (Manter / Mudar / Treinar) continuam disponíveis como complemento. O diretor envia tudo de uma vez; basta ter a visão de um segmento.
2. **Consolidação do segmento** (*Meu segmento*, no menu do líder; a Diretoria acessa por *Consolidação por segmento*): o líder vê **ao vivo** o ranking do segmento (todas as BUs), a visão regional de todos os diretores e os destaques por oferta; escreve a estratégia (tese e mensagem aos vendedores); define o nível de cada oferta (**Foco**, **Apoio**, **Fora do radar**; Foco tem limite, padrão 5, que a Diretoria muda em *Segmentos*). *Aplicar sugestão* preenche os níveis a partir das faixas dos heads sem mexer no que o líder já decidiu. Ao terminar, o líder (ou a Diretoria) **trava a versão final**; só a Diretoria reabre. O líder também **edita o pitch** de cada oferta (uma cópia do segmento; o texto do head fica guardado e dá para voltar a ele) e abre o **book de vendas** em página de impressão (A4): capa, estratégia, resumo, uma página por oferta em Foco com o pitch completo, versão resumida das de Apoio, as ofertas fora do radar e o que dizem as regiões. No diálogo de impressão do navegador, escolha *Salvar como PDF*.

O líder é cadastrado em *Segmentos → editar → Líder(es) do segmento* e pode ser qualquer usuário (o líder de Governo continua head da PRT). Para o diretor aparecer com a regional certa, preencha *Regional* no cadastro dele (Sul, SP, Demais estados, Nacional).

#### Área dos Diretores Comerciais (oculta por enquanto)

O foco atual é a avaliação dos heads, então tudo o que é dos Diretores Comerciais fica **oculto**: o menu e as telas deles (Manter / Mudar / Treinar, ranking e heatmap do diretor), o bloco e o indicador de diretores no *Progresso*, a aba Manter / Mudar / Treinar do consolidado, o prazo dos diretores na *Configuração*, a opção *Diretor Comercial* ao convidar usuários e a aba MMT do pacote do segmento (Excel). Quem já tem perfil de diretor, ao entrar, vê um aviso de que a área ainda não foi liberada. **Nada foi apagado**: código, dados e usuários continuam no banco. Para religar, defina `ENABLE_DIRECTORS=true` no ambiente (`.env.local` ou o painel da hospedagem) e reinicie; o interruptor está em [`src/lib/features.ts`](src/lib/features.ts).

### 1.3 Configurar o ambiente

```bash
cp .env.example .env.local
```

Preencha `.env.local` com os dados de **Project Settings → API**: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. O arquivo não é versionado.

### 1.4 Carregar a configuração inicial

```bash
npm install
npm run seed
```

Cria as 10 BUs, os segmentos (Onda 2027/I ativa; 2027/II inativa), os 5 critérios com pesos e rubricas, as 4 faixas e os parâmetros/prazos. Os dados vêm dos arquivos em [`seed/`](seed) (JSON, fáceis de editar). Rodar de novo **não sobrescreve** o que o admin já alterou.

### 1.5 Subir o sistema

```bash
npm run dev
```

Acesse <http://localhost:3000>.

### 1.6 (Opcional) Dados de exemplo para testar perfis

```bash
npm run seed:demo -- --confirm
```

Cria 1 admin, 1 head por BU, 1 head com duas BUs (ITD + ITS), 1 diretor comercial e ofertas **fictícias**. As senhas são geradas e gravadas em `.demo-users.txt` (ignorado pelo Git). **Use só em projeto de teste.**

---

## 2. Criar o primeiro admin

1. No Supabase: **Authentication → Users → Add user → Create new user**, informe seu e-mail e uma senha e marque *Auto Confirm User*.
2. No **SQL Editor**, promova o usuário:

```sql
update public.profiles set role = 'admin' where email = 'seu.email@selbetti.com.br';
```

3. Entre no sistema com esse e-mail. A partir daí, tudo é feito pela interface.

## 3. Convidar usuários

Em **Cadastros → Usuários → Convidar usuário** (somente admin): informe e-mail, nome e perfil.

| Perfil | Atribuir | O que enxerga |
|---|---|---|
| **Head de BU** | uma ou mais BUs | só as ofertas, notas e pitches das BUs atribuídas |
| **Diretor Comercial** | regional e segmentos | registra Manter / Mudar / Treinar; vê o score **agregado** por segmento; o detalhe por BU só se o admin liberar |
| **Diretoria Corporativa** | — | tudo; configura e administra |

A pessoa recebe um e-mail, define a senha e já entra. Para trocar BUs, perfil ou desativar alguém, use a lista na mesma tela.

### Cadastro dos Heads em lote

Para cadastrar vários heads de uma vez, preencha uma planilha (Excel `.xlsx` ou CSV; modelo em [`modelos/heads-modelo.csv`](modelos/heads-modelo.csv)) com o cabeçalho na linha 1 e um head por linha: **Nome · E-mail · BU**. A BU pode ser a sigla ou o nome; quem cuida de mais de uma separa por `+`, vírgula ou "e" (`ITD + ITS`), ou usa uma linha por BU com o mesmo e-mail.

```bash
npm run load:heads -- --file "/caminho/heads.xlsx"             # SIMULA: mostra o que seria feito, sem gravar
npm run load:heads -- --file "/caminho/heads.xlsx" --confirm   # cadastra e envia os convites por e-mail
```

Opções: `--sem-email` (cadastra e vincula as BUs sem enviar e-mail), `--reenviar` (para quem já existe e nunca entrou, envia o e-mail de senha de novo) e `--site URL` (endereço nos links; padrão `https://www.orbitta360.com`). Se qualquer linha tiver problema (e-mail inválido, BU desconhecida, pessoa que já é admin ou diretor), **nada é gravado** e o relatório diz o que corrigir. Pode rodar de novo com segurança: quem já existe só ganha as BUs que faltam. Antes de enviar convites, configure o SMTP próprio no Supabase e os modelos de e-mail (seção 6).

## 4. Fluxo de uso

1. **Admin** confere **Configuração** (pesos, rubricas, faixas e prazos) e os cadastros de **Segmentos** (quais estão ativos) e **BUs**, e convida os heads.
2. **Head** entra e segue **três etapas, em ordem** (o sistema bloqueia a seguinte até concluir a anterior):
   1. **Conferir as ofertas** — cadastra ou importa o que falta e confirma que a lista está completa.
   2. **Agrupar as semelhantes** — junta ofertas parecidas em uma só (ex.: “Alocação – Dev C#”, “– Dev Java” e “– Arquiteto” viram “Alocação de mão de obra – Desenvolvedor”). Ofertas sem parecidas seguem avulsas. Confirma o agrupamento.
   3. **Classificar** — informa o **ticket médio da BU**, pontua cada item (agrupamentos e ofertas avulsas) × segmento (nota 1–5 por critério; evidência obrigatória para 4 e 5), preenche o **pitch de cada oferta (ou agrupamento) em cada segmento em que ela for Alta ou Potencial** e clica em **Enviar**. O rascunho é salvo automaticamente.
   Dá para voltar a uma etapa anterior; isso reabre as seguintes e bloqueia a classificação até confirmar de novo (as notas já lançadas ficam guardadas).
3. **Diretor Comercial** entra, cria registros de **Manter**, **Mudar** ou **Treinar** (tipo + segmento + BU; oferta é opcional), preenche os campos do tipo, marca a **prioridade** (Alta/Média/Baixa) e clica em **Enviar**. O rascunho é salvo automaticamente. Segmentos atribuídos ao perfil limitam onde ele registra; sem atribuição, vale qualquer segmento ativo. A regional vem do perfil.
4. **Admin** acompanha o **Progresso** (heads por BU e diretores), copia a lista de pendentes e, se preciso, **reabre** um envio.
5. **Admin** consolida em **Consolidado**: ranking por segmento, heatmap, Manter/Mudar/Treinar, e exporta para Excel.

### Telas consolidadas (Diretoria Corporativa)

| Tela | O que mostra | Exportação |
|---|---|---|
| **Ranking por segmento** | todas as ofertas do segmento, de todas as BUs, por score; classificação, selo de especialista, notas C1–C5, link para o pitch (leitura). Filtros: onda, segmento, BU, classificação | ranking filtrado · **pacote do segmento** (ranking + pitches + Manter/Mudar/Treinar, em 3 abas) |
| **Heatmap BU × segmento** | por célula: nº de ofertas Alta + Potencial e maior score; clique abre o ranking daquela BU/segmento | duas abas (contagem e maior score) |
| **Comparativo de critérios** | duas listas: **risco de entrega** (score ≥ início da faixa Potencial, mas Cases e prontidão ≤ 2) e **dor máxima com abertura difícil** (dor ≥ 5, abertura ≤ 2). Os limiares são campos da tela | duas abas |
| **Manter / Mudar / Treinar** | registros por segmento → BU → tipo, ordenados por prioridade. Filtros: segmento, BU, tipo | planilha com uma linha por registro |

### Auditoria

Em **Auditoria** (admin): quem, o quê, a que se refere (ex.: *SOC Gerenciado × Saúde*) e cada campo alterado com antes → depois (ex.: *Nota C4: 2 → 5*). Filtros por tipo, usuário, ação e período (datas no horário de Brasília), 50 por página, e exportação para Excel com os mesmos filtros (até 5.000 linhas). Notas, pitches e ofertas só são registrados depois do primeiro envio da BU; Manter/Mudar/Treinar, depois do primeiro envio do diretor; configuração, perfis e envios, sempre.

O ranking e o heatmap consideram só ofertas **ativas** com nota completa (células "não se aplica" ficam de fora) e incluem rascunhos para a Diretoria Corporativa. O **Diretor Comercial com "ver o detalhe por BU" liberado** (em *Usuários*) enxerga ranking, heatmap e pitches apenas das BUs que **já enviaram**, sempre em leitura. Sem essa liberação, ele vê só a tabela agregada por segmento (contagens por faixa e maior score, sem nomes de BU ou oferta).

### Padrão das telas de cadastro

Usuários, BUs, Segmentos, Ofertas (por BU) e os registros de Manter / Mudar / Treinar seguem o mesmo desenho:

1. **Listagem** em tabela, com **filtros no topo** (busca por texto sem diferenciar acento, listas por tipo, situação etc.). Os filtros aplicam sozinhos, ficam na URL (dá para copiar o link e o botão Voltar funciona) e a lista é paginada (20 por página).
2. Em cada linha, **Ver / editar** abre a **tela de detalhe**, onde se vê e se edita o registro completo. A ação de ativar/desativar fica no topo da tela.
3. **Botão de novo** (“Convidar usuário”, “Nova oferta”, “Novo segmento”…) abre a **tela de inserção**.

Depois de cadastrar, o sistema volta para a lista; depois de editar, permanece no detalhe com um aviso de confirmação. Itens não são apagados: são **desativados** (preserva notas e histórico). Para um cadastro novo, as peças reutilizáveis estão em `src/components/` (`ListFilters`, `Pagination`, `BackLink`, `FormFooter`) e os formulários em `src/components/forms/`.

### Pitch: por oferta × segmento

Cada célula **oferta (ou agrupamento) × segmento** classificada como **Alta ou Potencial** exige a sua ficha de pitch. Duas ofertas no mesmo segmento têm pitches separados, e a mesma oferta em dois segmentos também. Na matriz, a célula Alta/Potencial mostra “Pitch obrigatório”, “Completar pitch” ou “Pitch preenchido”, com link direto para a ficha; a tela de avaliação e a lista de pendências do envio apontam para a mesma ficha. Oferta dentro de um agrupamento não tem pitch próprio (o pitch é do agrupamento). A BU do pitch vem da oferta (o cliente não escolhe) e o banco só aceita gravar depois das etapas de conferência e agrupamento.

**Campos da ficha**
- **Descrição da oferta:** já vem preenchida com a descrição cadastrada da oferta (editável, só para este pitch).
- **Principais dores do segmento**, **Proposta de valor**, **Pitch de abertura para o AM** e **3 perguntas de descoberta**.
- **Cases de sucesso:** lista com um ou mais cases (cliente, desafio, solução e resultado), com “Adicionar case” e “Remover”. Opcional.
- **Perfil ideal de cliente**, em campos específicos: *perfil de cliente / sub-segmento* (ex.: Hospitais, Clínicas), *persona decisora* (ex.: Diretor de TI, CIO), *persona influenciadora* (ex.: Diretor de Marketing), *quantidade de funcionários* (faixa de–até), *modelo de receita* (Recorrente ou Pontual, já vem da oferta) e *ticket* (valor **mensal** se recorrente; **volume do deal** se pontual, mesma lógica do cadastro de ofertas).
- **Obrigatórios para enviar:** descrição, dores, proposta de valor, pitch de abertura, perfil de cliente e persona decisora. O topo da ficha mostra “N de 6 obrigatórios”.

O Excel de pitches e o “pacote do segmento” trazem uma linha por oferta × segmento, com ID e nome da oferta, os cases numerados em uma só célula e o perfil de cliente em colunas separadas.

### Ofertas: campos padronizados e agrupamento

- **ID automático:** a oferta nova recebe o próximo ID **sequencial da BU** (`OF-01`, `OF-02`…; agrupamentos usam `AG-01`, `AG-02`…). O cadastro mostra o número que será usado, o usuário não digita, e o ID não muda depois. O número é gerado no banco, então dois cadastros ao mesmo tempo nunca repetem. Na importação, a coluna ID é opcional: em branco, o sistema numera; preenchida, é mantida e não pode repetir na BU.

- **Ticket da oferta (um só campo, dois significados):** em oferta **Recorrente** informe o **valor mensal** do contrato; em oferta **Pontual**, o **volume do deal**. O rótulo e a ajuda do campo mudam conforme o modelo escolhido, e as listas mostram “/mês” ou “/deal”. Em cálculos, o valor é levado a uma **base anual** (recorrente × 12; pontual como está, via `annualizedTicket` em `src/lib/offers.ts`): é assim que a sugestão de nota do critério “Receita e margem” o compara com o ticket médio anual da BU. Qualquer cálculo futuro com o ticket deve usar essa função. No agrupamento, o ticket só é sugerido (média) quando todas as ofertas têm o mesmo modelo.

- **Tipo:** Software, Hardware ou Serviço. **Modelo de receita:** Recorrente ou Pontual. São listas fechadas (o banco recusa outros valores). **BU:** escolhida entre as BUs cadastradas no cadastro da oferta (o head só vê as dele) e não muda depois.
- **Agrupamento:** é uma oferta nova que reúne as originais. O nome é sugerido pelo começo em comum dos nomes; tipo e modelo vêm preenchidos quando as ofertas escolhidas têm o mesmo e o ticket é a média delas (tudo editável). Só o agrupamento (ou a oferta avulsa) é classificado; as originais ficam guardadas dentro dele e podem ser removidas ou o agrupamento desfeito (as notas antigas das originais voltam a valer). Um agrupamento tem no mínimo 2 ofertas e não entra em outro agrupamento.
- **Regras no banco:** a classificação só é aceita depois das etapas 1 e 2 (exceto para a Diretoria Corporativa); oferta dentro de agrupamento não recebe nota; o envio exige as etapas concluídas.

### Importar o template Excel

Em **Minhas ofertas → Importar do Excel**: aba `1. Ofertas`, cabeçalho na linha 5, dados a partir da linha 7 (a linha 6, de exemplo, é ignorada). Colunas: A = ID, B = Nome, C = Descrição, D = Tipo, E = Modelo de receita, F = Ticket (valor **mensal** se Recorrente; **volume do deal** se Pontual). A prévia mostra o que será criado e o que foi ajustado (tipo e modelo são enquadrados nas listas padronizadas, ex.: “Serviço gerenciado” vira Serviço); nomes duplicados (no arquivo ou já cadastrados na BU) são avisados e ignorados.

### Regras de cálculo

- Score = Σ (nota ÷ 5 × peso), pesos em pontos somando 100, arredondado. Ex.: notas 5-4-3-5-3 → 30+20+12+15+6 = **83** (Prioridade potencial).
- O score e a classificação **não são gravados**: são calculados a partir das notas e da configuração vigente. Mudar pesos ou faixas recalcula tudo.
- Selo "Venda liderada pelo especialista": critério 4 ≤ 2 e score ≥ início da faixa Potencial (70).
- Sugestão de nota do critério 2: nota 3 = ticket médio **anual** da BU; cada nota acima/abaixo = ±20% (passo configurável). O ticket da oferta entra na base anual: recorrente = valor mensal × 12; pontual = volume do deal.
- Para **enviar**: todas as células avaliadas (ou "não se aplica"), evidência nas notas 4 e 5, e **pitch por oferta × segmento** (descrição, dores, proposta de valor, pitch de abertura, perfil de cliente e persona decisora) em cada célula Alta/Potencial.

---

## 5. Testes

```bash
npm test
```

- `tests/scoring.test.ts` — cálculo (5-4-3-5-3 = 83), faixas, selo de especialista, sugestão de ticket.
- `tests/rls.test.ts` — **isolamento no banco**: roda a migration em um Postgres em memória (PGlite) e executa as consultas como cada usuário, sob RLS. Garante que um head não lê nem altera dados de outra BU, não vira admin, não mexe em configuração, que enviado = somente leitura, que o admin reabre, e que o score do SQL bate com o do TypeScript.
- `tests/import-offers.test.ts` — leitura do template (linha 6 ignorada, vazias, duplicados).
- `tests/mmt.test.ts` — campos obrigatórios por tipo, ordenação por prioridade, status do diretor.
- `tests/phase3.test.ts` — regras e limiares do comparativo, diferenças legíveis da auditoria, filtros validados e exportações.
- `tests/consolidated.test.ts` — paginação além de 1.000 linhas, heatmap e exportações Excel (lidas de volta do arquivo).

O `tests/rls.test.ts` também cobre o Manter/Mudar/Treinar: diretor só vê e altera os próprios registros, não escreve em nome de outro nem troca autor/tipo, a regional vem do perfil, envio exige registros completos e vira somente leitura, admin reabre, período fechado bloqueia, e as regras de "completo" da tela são idênticas às do banco.

> O teste de RLS simula o Supabase (`auth.uid()` e os roles). Ele valida as políticas SQL; a verificação ponta a ponta com o projeto Supabase real é feita ao usar o sistema com os perfis de exemplo.

## 6. Deploy (Vercel)

Qualquer hospedagem Node serve; abaixo, o roteiro da **Vercel**. Pré-requisitos (já feitos neste projeto): migrations 0001 a 0009 aplicadas no Supabase, `npm run seed` e a carga de ofertas rodados. **Não rode `npm run seed:demo` no banco de produção** (cria usuários de exemplo).

1. **Repositório.** Suba o código para um repositório **privado** no GitHub (o `.env.local` e o `.demo-users.txt` já são ignorados pelo git; não há chaves no código).
2. **Importar na Vercel** (*Add New → Project*): o Next.js é detectado sozinho; não precisa de `vercel.json`.
3. **Variáveis de ambiente** (*Settings → Environment Variables*, ambiente *Production*):
   - `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Supabase → *Project Settings → API*);
   - `SUPABASE_SERVICE_ROLE_KEY` (marque como *Sensitive*; só o servidor usa, para convidar usuários);
   - `NEXT_PUBLIC_SITE_URL` = a URL final (ex.: `https://orbitta360.seudominio.com.br`), sem barra no fim;
   - **não** defina `ENABLE_DIRECTORS` (a área dos Diretores Comerciais fica oculta).
   Depois de mudar uma variável, faça *Redeploy*.
4. **Região das funções.** Se o projeto Supabase está em São Paulo, em *Settings → Functions* escolha a região *São Paulo (gru1)*: evita latência entre a Vercel e o banco.
5. **Supabase → Authentication → URL Configuration:** *Site URL* = a URL final e, em *Redirect URLs*, `https://SUA-URL/auth/confirm` (e `http://localhost:3000/auth/confirm` para desenvolvimento). Sem isso o link do convite e o de "esqueci a senha" não funcionam.
6. **Modelos de e-mail do Supabase (obrigatório).** Em *Authentication → Email Templates*, troque os links de *Invite user* e *Reset password* pelos do passo 3 da seção 1.2 (`{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite&next=/definir-senha` e o equivalente com `type=recovery`). Com o modelo padrão (`{{ .ConfirmationURL }}`) o link cai em "Link inválido ou expirado". O link do e-mail leva a uma página com o botão **Continuar**: o token só é gasto no clique, porque antivírus e filtros de e-mail corporativos abrem os links antes da pessoa e inutilizariam o convite.
7. **SMTP dos convites.** O SMTP padrão do Supabase tem limite muito baixo de envios por hora; antes de convidar todos os heads configure um SMTP próprio em *Authentication → SMTP Settings* (Resend, SendGrid, o e-mail corporativo…).
8. **Convidar os heads** em *Usuários → Novo usuário* (perfil *Head de BU* e as BUs de cada um). Cada pessoa recebe o e-mail e define a senha.
9. **Teste de fumaça depois do deploy:** entrar como admin; abrir *Progresso* (duas ondas, prazos 12/11 e 19/11); convidar um e-mail seu como head de uma BU e abrir o link; conferir a etapa 1 (tabela editável) e *Configuração*.
10. **Importação de Excel** pelo formulário aceita arquivos de até 4 MB (limite de corpo da requisição na Vercel).
11. Outra hospedagem (servidor da TI): `npm run build && npm start` (porta 3000), atrás de HTTPS.

## 7. Identidade visual e design system

Segue o [brand book da Selbetti](https://conteudo.selbetti.com.br/brand-book-selbetti). Somente tema claro. Os tokens ficam em [`src/app/globals.css`](src/app/globals.css) (`:root`): cores da marca (Selbetti Green `#00754A`, Signal Orange `#EF8943`, Calm Green `#80BAA5`, Forest `#17392F`) e variações suaves, neutros tingidos de verde, raios, sombras e a escala tipográfica.

**Princípios**
- **Contraste:** texto branco só sobre Selbetti Green ou Forest; o laranja é destaque (faixa, item ativo, selo do especialista) e, quando leva texto, o texto é Forest ou marrom escuro. Os neutros de texto passam de 5:1.
- **Estado nunca só por cor:** status, avisos e erros levam ícone e texto.
- **Fontes:** a oficial, **Gotham**, é licenciada e não existe na web; o sistema usa **Montserrat** como substituta (e a Gotham, onde estiver instalada). Títulos em **Oswald**, a fonte de apoio do brand book. Com licença web da Gotham, basta declarar o `@font-face`.
- **Ícones:** Material Symbols outline, como pede o brand book. O conjunto usado é gerado por `npm run icons` (edite a lista em [`scripts/gen-icons.mjs`](scripts/gen-icons.mjs)) em `src/components/icons.generated.ts`; nada é baixado em tempo de execução.
- **Movimento:** transições curtas, desligadas quando o sistema pede `prefers-reduced-motion`.

**Componentes** (em `src/components/`)

| Componente | Uso |
|---|---|
| `AppShell` | menu lateral recolhível (preferência guardada no navegador) e gaveta no celular |
| `PageHeader`, `Tabs`, `Notice`, `StatusBadge`, `ClassBadge`, `ProgressBar` (`ui.tsx`) | cabeçalho de página, abas, avisos com ícone, selos, progresso |
| `StatTile`, `SegmentedBar` | indicadores de topo e distribuição de status (barra fina com legenda) |
| `Toast` / `Flash` | avisos de sucesso e erro; `?ok=` e `?erro=` viram toast e saem da URL |
| `ConfirmSubmit` | confirmação (`<dialog>` nativo) antes de enviar, reabrir, excluir e desativar |
| `SubmitButton` | botão de envio com carregamento e proteção contra duplo clique |
| `EmptyState`, `loading.tsx` | estados vazios com orientação e esqueleto de carregamento |
| `Logo`, `BrandPattern` | logotipo oficial e padrão de pontos e quadrados |

**Tabelas:** use a classe `table-wrap` no contêiner (rolagem, cabeçalho fixo, linha em destaque ao passar o mouse). **Heatmap:** escala de um só tom em quatro etapas, uma por faixa de classificação.

- **Logotipo e favicon:** arquivos oficiais em [`public/brand/`](public/brand) (versão **negativa**, branca, no menu e no login, sobre fundo Forest; versão **original** para fundos claros) e `src/app/icon.png`, reduzidos para 960 px. Use pelo componente `Logo`: não recolorir, distorcer nem colar outros elementos ao lado. O brand book pede validação das aplicações com marketing@selbetti.com.br.
- **Padrão gráfico:** o login usa uma aproximação em SVG do padrão de pontos e quadrados (`BrandPattern.tsx`), com área livre em volta do logo. Para o arquivo oficial, troque o componente por uma imagem.

## 8. Estrutura

```
supabase/migrations/   0001 schema/RLS/auditoria · 0002 Manter-Mudar-Treinar e leitura do diretor
seed/                  configuração inicial em JSON (BUs, segmentos, critérios, faixas, prazos)
scripts/               seed e seed-demo
src/lib/scoring.ts     cálculo, classificação, sugestão de ticket
src/app/(app)/bu/      módulo do Head (matriz, ofertas, avaliação, pitch)
src/components/           design system (AppShell, ui, Toast, ListFilters, Icon…)
src/components/forms/     formulários de cadastro (usuário, oferta, segmento, BU)
src/app/(app)/diretor/ módulo do Diretor Comercial (registros de Manter/Mudar/Treinar)
src/app/(app)/consolidado/ ranking, heatmap, Manter/Mudar/Treinar consolidado, pitch (leitura), exportação Excel
src/app/(app)/admin/   progresso, usuários, configuração, auditoria
tests/                 cálculo, RLS no banco, importação
```

Não armazene dados de remuneração, salários ou bônus nesta plataforma.
