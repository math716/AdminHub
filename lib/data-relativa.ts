/**
 * "Hoje", "Ontem", "Há 3 dias" — o rótulo de idade usado no histórico da Gabi.
 *
 * O cálculo anterior era `(agora - data) / 24h`, que mede horas corridas e não
 * dias do calendário. Com isso o rótulo subestimava a idade em até um dia:
 * uma conversa de ontem às 22h, vista hoje às 8h, tem 10 horas de vida e
 * aparecia como "Hoje"; uma de anteontem à noite aparecia como "Ontem".
 *
 * O defeito estava lá desde o início e só ficou visível quando o gabinete
 * passou a usar a Gabi em dias seguidos — antes, as conversas ficavam longe o
 * bastante para o erro não aparecer.
 *
 * Aqui a conta é feita entre as meias-noites, no fuso de quem está olhando,
 * que é o que a pessoa entende por "ontem".
 */
export function rotuloDeData(iso: string, agora: Date = new Date()): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';

  const meiaNoite = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();

  // `round` e não `floor`: num dia de mudança de horário a diferença entre duas
  // meias-noites é de 23 ou 25 horas, e o `floor` erraria o dia.
  const dias = Math.round((meiaNoite(agora) - meiaNoite(d)) / 86_400_000);

  // Data no futuro (relógio adiantado, fuso do servidor) não vira "Há -1 dias".
  if (dias <= 0) return 'Hoje';
  if (dias === 1) return 'Ontem';
  if (dias < 7) return `Há ${dias} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}
