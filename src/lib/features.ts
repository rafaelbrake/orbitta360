/**
 * Interruptores de funcionalidades.
 *
 * Área dos Diretores Comerciais (Manter / Mudar / Treinar e as telas deles): oculta por enquanto,
 * enquanto o foco é a avaliação dos heads. Nada foi apagado (código e dados continuam no lugar):
 * para religar, defina ENABLE_DIRECTORS=true no ambiente (.env.local ou painel da hospedagem) e reinicie.
 */
export const DIRECTORS_ENABLED = process.env.ENABLE_DIRECTORS === "true";

/**
 * Telas de contexto no início das rodadas (mercado, funil, faturamento, perguntas e o texto de contexto):
 * ocultas por decisão da Diretoria, para a reunião ir direto à decisão. Os dados continuam no banco;
 * para religar, defina ENABLE_ROUND_CONTEXT=true no ambiente e reinicie.
 */
export const ROUND_CONTEXT_ENABLED = process.env.ENABLE_ROUND_CONTEXT === "true";

/**
 * Botão "Reavaliar nota" do pitch (chama o Claude pela API da Anthropic): só aparece quando há chave configurada.
 * Sem ANTHROPIC_API_KEY, nenhum texto sai do sistema. A gravação da nota usa a chave de serviço do Supabase.
 */
export const PITCH_EVALUATOR_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

/** Botão "Gerar tese com IA": basta a chave da Anthropic (quem grava o texto é o líder, com o próprio acesso). */
export const THESIS_ENABLED = Boolean(process.env.ANTHROPIC_API_KEY);
