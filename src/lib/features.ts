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
