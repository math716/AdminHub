// Helpers do histórico de conversas da Gabi, compartilhados entre o POST
// (criar) e o PUT (atualizar) de /api/agent/conversas.
//
// As mensagens são gravadas COMPLETAS (com visualizacoes/dadosBrutos) para que
// os cards de dados e os botões de relatório sobrevivam ao reabrir a conversa.

const LIMITE_JSON = 800_000; // ~800 KB por conversa

// Payloads que ACIONAM botões na conversa (relatório territorial etc.). São
// minúsculos e são justamente o que não pode sumir — preserva sempre.
const PAYLOADS_LEVES = new Set(['gerar_relatorio_territorial']);

function podar(dadosBrutos: Record<string, any>): Record<string, any> | undefined {
  const leves: Record<string, any> = {};
  for (const k of Object.keys(dadosBrutos)) {
    if (PAYLOADS_LEVES.has(k)) leves[k] = dadosBrutos[k];
  }
  return Object.keys(leves).length > 0 ? leves : undefined;
}

/**
 * Reduz a conversa até caber no limite, descartando primeiro os dados pesados
 * das mensagens MAIS ANTIGAS (as recentes são as que o usuário ainda olha).
 * Os payloads leves que acionam botões nunca são descartados.
 */
export function enxugar(mensagens: any[]): any[] {
  const msgs = mensagens.map(m => ({ ...m }));
  const tamanho = () => JSON.stringify(msgs).length;

  for (let i = 0; i < msgs.length && tamanho() > LIMITE_JSON; i++) {
    if (!msgs[i]?.dadosBrutos) continue;
    const leves = podar(msgs[i].dadosBrutos);
    if (leves) msgs[i].dadosBrutos = leves;
    else delete msgs[i].dadosBrutos;
  }
  // Ainda grande (conversa muito longa): remove também as visualizações antigas
  for (let i = 0; i < msgs.length && tamanho() > LIMITE_JSON; i++) {
    if (msgs[i]?.visualizacoes) delete msgs[i].visualizacoes;
  }
  return msgs;
}

/** Valida o corpo de criação/atualização de conversa. */
export function validarMensagens(mensagens: unknown): mensagens is any[] {
  return Array.isArray(mensagens) && mensagens.length > 0;
}
