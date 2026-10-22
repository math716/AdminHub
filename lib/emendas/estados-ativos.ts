/**
 * Estados cujas emendas ESTADUAIS o sistema mostra.
 *
 * Decisão de 21/10/2026, depois da validação dos dados:
 *   - SP, DF e RJ: importação automática conferida com a fonte oficial.
 *   - ES, MG e PE: importação automática dos portais de dados abertos
 *     (scripts/estados/import-dados-abertos.ts, workflow das quartas), que
 *     substitui a importação manual de maio–julho.
 *   - PB, BA, AL e PI: fonte incompleta (cidade em parte das emendas, só
 *     2026, ou sem valores); seguem com os dados manuais.
 *   - Os demais ficam FORA das telas e da Gabi: não há fonte que traga
 *     deputado, cidade e valores, e os dados manuais têm erros (GO com
 *     R$ 2 trilhões em 2024 e o texto da emenda no lugar do deputado; MS, RN
 *     e RO com valores zerados; RS sem município). Continuam no banco.
 *
 * Emendas FEDERAIS aparecem para todos os estados, sempre.
 */
export const UFS_ESTADUAIS_ATIVAS = [
  'SP', 'DF', 'RJ',
  'ES', 'MG', 'PE',
  'PB', 'BA', 'AL', 'PI',
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

/**
 * Estados que publicam só o VALOR DESTINADO de cada emenda estadual, sem
 * empenho nem pagamento por emenda. No RJ (validação de 22/10/2026) as
 * planilhas trazem só o valor; o único relatório de execução é de abril de
 * 2026 e mostra R$ 0 empenhado. O valor fica gravado em valorEmpenhado (e
 * valorProposto), mas a tela e a Gabi o apresentam como "valor destinado" e
 * dizem que a execução não é publicada — nunca como empenhado nem pago R$ 0.
 */
export const UFS_SO_VALOR_DESTINADO = ['RJ'] as const;

export const ufSoValorDestinado = (uf?: string | null) =>
  !!uf && (UFS_SO_VALOR_DESTINADO as readonly string[]).includes(uf.toUpperCase());

/** A emenda é estadual de um estado que só publica o valor destinado? */
export const soValorDestinado = (e: { esfera: string; uf?: string | null }) =>
  e.esfera === 'ESTADUAL' && ufSoValorDestinado(e.uf);

/** Filtro do Prisma para as mesmas emendas. */
export const filtroSoValorDestinado = {
  esfera: 'ESTADUAL' as const,
  uf: { in: [...UFS_SO_VALOR_DESTINADO] as string[] },
};
