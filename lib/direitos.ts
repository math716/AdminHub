// Rodapé de direitos autorais das telas públicas (login, cadastro, registro).
// O AdminHub foi criado em 2026; a partir de 2027 vira "2026–<ano atual>"
// sozinho, sem ninguém precisar lembrar de trocar o ano no código.
const ANO_CRIACAO = 2026;

export function textoDireitos(): string {
  const atual = new Date().getFullYear();
  const anos = atual > ANO_CRIACAO ? `${ANO_CRIACAO}–${atual}` : String(ANO_CRIACAO);
  return `© ${anos} AdminHub · Todos os direitos reservados`;
}
