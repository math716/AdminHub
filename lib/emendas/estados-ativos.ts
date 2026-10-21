/**
 * Estados cujas emendas ESTADUAIS o sistema mostra.
 *
 * Só os que têm importação automática e conferida com a fonte oficial: SP
 * (portal da transparência), DF (SISCONEP) e RJ (Redeplan). Os outros 22
 * vieram de importações manuais de maio a julho de 2026, nunca mais
 * atualizadas, e a validação de 21/10/2026 achou números irreais (GO com
 * R$ 2 trilhões em 2024, o texto da emenda no lugar do nome do deputado),
 * valores zerados (MS, RN, RO) e emendas sem município (BA, RS). Ficam no
 * banco, mas fora das telas e da Gabi até ganharem importação conferida —
 * aí é só acrescentar a UF aqui.
 *
 * Emendas FEDERAIS aparecem para todos os estados, sempre.
 */
// DECISÃO PENDENTE (21/10/2026): por ora TODAS as UFs aparecem — nada fica
// escondido até o usuário decidir. Para mostrar só as conferidas, deixar aqui
// ['SP', 'DF', 'RJ'] (e devolver à instrução da Gabi a frase sobre isso).
export const UFS_ESTADUAIS_ATIVAS = [
  'AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA',
  'PB', 'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO',
] as const;

/** Filtro do Prisma (EmendaParlamentarWhereInput): federal, ou estadual de UF ativa. */
export const filtroEsferaAtiva = {
  OR: [
    { esfera: 'FEDERAL' as const },
    { uf: { in: [...UFS_ESTADUAIS_ATIVAS] } },
  ],
};

/** O mesmo em SQL, para a tabela emendas_parlamentares com o apelido dado. */
export const sqlEsferaAtiva = (apelido = 'e') =>
  `(${apelido}.esfera::text = 'FEDERAL' OR ${apelido}.uf IN (${UFS_ESTADUAIS_ATIVAS.map(u => `'${u}'`).join(', ')}))`;

export const ufTemEstaduais = (uf?: string | null) =>
  !!uf && (UFS_ESTADUAIS_ATIVAS as readonly string[]).includes(uf.toUpperCase());
