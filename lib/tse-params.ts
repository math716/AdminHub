/**
 * Validação centralizada dos parâmetros usados nas rotas /api/tse/*.
 * Previne path traversal ao restringir `ano` e `uf` a valores conhecidos.
 */

export const ANOS_VALIDOS = new Set(['2018', '2020', '2022', '2024']);

export const UFS_VALIDAS = new Set([
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO',
  'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO', 'BR'
]);

export function anoValido(ano: string | null | undefined): ano is string {
  return typeof ano === 'string' && ANOS_VALIDOS.has(ano);
}

export function ufValida(uf: string | null | undefined): uf is string {
  return typeof uf === 'string' && UFS_VALIDAS.has(uf.toUpperCase());
}
