// Feriados e datas comemorativas que o Google põe na agenda.
//
// A agenda do Google mostra feriados ("Nossa Senhora Aparecida") e datas
// comemorativas ("Dia do Professor") como eventos de dia inteiro, e a
// sincronização os trazia como Compromisso — contavam nos totais e ocupavam
// "Próximos compromissos". O Google dá a esses eventos um id começando pela
// data ("20261012_…"); os eventos normais têm id aleatório sem "_" no início,
// e a ocorrência de um evento recorrente leva a data no FIM ("abc…_20261012").
//
// Sem dependência do servidor: usado também pela tela da agenda.

export function ehDataComemorativaGoogle(googleEventId?: string | null): boolean {
  return !!googleEventId && /^\d{8}_/.test(googleEventId);
}

/** Mesmo teste, em SQL (Postgres), para contar/filtrar direto no banco. */
export const SQL_DATA_COMEMORATIVA = `"googleEventId" ~ '^[0-9]{8}_'`;

/** Feriados nacionais (fixos + móveis pela Páscoa), por "MM-DD". */
export function getFeriados(ano: number): Record<string, string> {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = new Date(ano, month - 1, day);

  const addDays = (d: Date, n: number) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const fmt = (d: Date) => `${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  return {
    '01-01': 'Confraternização Universal',
    '04-21': 'Tiradentes',
    '05-01': 'Dia do Trabalho',
    '09-07': 'Independência do Brasil',
    '10-12': 'Nossa Senhora Aparecida',
    '11-02': 'Finados',
    '11-15': 'Proclamação da República',
    '11-20': 'Consciência Negra',
    '12-25': 'Natal',
    [fmt(addDays(pascoa, -48))]: 'Segunda de Carnaval',
    [fmt(addDays(pascoa, -47))]: 'Terça de Carnaval',
    [fmt(addDays(pascoa, -2))]:  'Sexta-feira Santa',
    [fmt(pascoa)]:               'Páscoa',
    [fmt(addDays(pascoa, 60))]:  'Corpus Christi',
  };
}
