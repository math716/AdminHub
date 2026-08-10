// Mapeamento RA do DF → Zonas Eleitorais correspondentes (TSE-DF)
const RA_TO_ZONAS_RAW: Record<string, number[]> = {
  'PLANO PILOTO':       [1, 2],
  'BRASILIA':           [1, 2],
  'ASA SUL':            [1],
  'ASA NORTE':          [2],
  'LAGO SUL':           [1],
  'LAGO NORTE':         [2],
  'CRUZEIRO':           [3],
  'SUDOESTE':           [3],
  'OCTOGONAL':          [3],
  'SUDOESTE E OCTOGONAL': [3],
  'TAGUATINGA':         [4],
  'CEILANDIA':          [5, 6],
  'CEILANDIA NORTE':    [5],
  'CEILANDIA SUL':      [6],
  'SAMAMBAIA':          [8],
  'NUCLEO BANDEIRANTE': [9],
  'RIACHO FUNDO':       [9],
  'RIACHO FUNDO II':    [20],
  'GUARA':              [10],
  'PARK WAY':           [10],
  'SIA':                [10],
  'SANTA MARIA':        [11],
  'PLANALTINA':         [13],
  'ARAPOANGA':          [13],
  'FERCAL':             [13],
  'SOBRADINHO':         [14],
  'SOBRADINHO II':      [14],
  'GAMA':               [15],
  'BRAZLANDIA':         [16],
  'RECANTO DAS EMAS':   [17],
  'SAO SEBASTIAO':      [18],
  'JARDIM BOTANICO':    [18],
  'SOL NASCENTE':       [5],
  'SOL NASCENTE/POR DO SOL': [5],
  'PARANOA':            [19],
  'ITAPOA':             [19],
  'AGUAS CLARAS':       [20],
  'VICENTE PIRES':      [20],
  'ESTRUTURAL':         [21],
  'SCIA':               [21],
  'VARJAO':             [21],
  'CANDANGOLANDIA':     [21],
};

function normRA(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

export function zonasParaRA(raName: string): number[] {
  return RA_TO_ZONAS_RAW[normRA(raName)] ?? [];
}

/**
 * Dado um array de nomes de RAs, retorna os registros de zona
 * (tipo ZONA) a criar no banco, sem duplicatas.
 */
export function derivarZonasDeRas(
  raNames: string[]
): { uf: string; regiaoNome: string; tipo: string }[] {
  const zonasSet = new Set<number>();
  raNames.forEach(r => zonasParaRA(r).forEach(z => zonasSet.add(z)));
  return Array.from(zonasSet).map(z => ({ uf: 'DF', regiaoNome: `Zona ${z}`, tipo: 'ZONA' }));
}
