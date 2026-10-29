// Bancada do Senado em exercício, pela data.
//
// O Senado renova de forma alternada: uma eleição troca 2 vagas por estado
// (2018, 2026…), a seguinte troca 1 (2022, 2030…). Os 3 senadores em
// exercício são os da última eleição cujos eleitos já tomaram posse (1º de
// fevereiro do ano seguinte) mais os da anterior. O texto da Gabi era fixo em
// "2018 + 2022" e ficaria errado em fevereiro de 2027 sem ninguém lembrar.

/** Eleição geral mais recente cujos eleitos já tomaram posse. */
export function ultimaEleicaoEmposseada(agora = new Date()): number {
  let ano = agora.getFullYear();
  while (ano % 4 !== 2) ano--;
  // Posse em 1º/02 do ano seguinte (horário de Brasília).
  if (agora < new Date(`${ano + 1}-02-01T00:00:00-03:00`)) ano -= 4;
  return ano;
}

/** [eleição anterior, eleição mais recente] da bancada em exercício. */
export function anosDoSenadoEmExercicio(agora = new Date()): [number, number] {
  const recente = ultimaEleicaoEmposseada(agora);
  return [recente - 4, recente];
}

/** Vagas por estado que a eleição renovou: 2 (2018, 2026…) ou 1 (2022, 2030…). */
export function vagasNaEleicao(ano: number): 1 | 2 {
  return (ano - 2018) % 8 === 0 ? 2 : 1;
}

/** Próxima eleição geral cujos eleitos ainda não tomaram posse (se já aconteceu). */
export function eleicaoAguardandoPosse(agora = new Date()): number | null {
  const proxima = ultimaEleicaoEmposseada(agora) + 4;
  // A eleição é em outubro; antes disso ela ainda não aconteceu.
  return agora >= new Date(`${proxima}-10-01T00:00:00-03:00`) ? proxima : null;
}
