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
