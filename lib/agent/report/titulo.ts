// Assunto do relatório, derivado dos dados que a consulta trouxe.
//
// O cabeçalho do PDF trazia a pergunta literal ("certo, então vamos continuar
// com os 12, me gere um relatório de comparação entre esses 12"), que num
// documento fica com cara de recado. Aqui o tema é montado a partir dos dados
// — sempre fiel ao conteúdo e sem depender do modelo.

import { tituloCaso } from './geo-map';

export interface DadosRelatorio {
  titulo?: string;
  dadosBrutos?: Record<string, any>;
}

/** "ANDRÉ DO PRADO" → "André do Prado"; corta a lista em N nomes + "e outros". */
export function listarNomes(nomes: string[], max = 3): string {
  const bons = nomes.filter(Boolean).map(n => tituloCaso(n));
  if (bons.length === 0) return '';
  if (bons.length <= max) {
    return bons.length === 1 ? bons[0]
      : `${bons.slice(0, -1).join(', ')} e ${bons[bons.length - 1]}`;
  }
  return `${bons.slice(0, max).join(', ')} e outros ${bons.length - max}`;
}

const CARGO_TITULO: Record<string, string> = {
  'deputado estadual': 'deputados estaduais', 'deputado federal': 'deputados federais',
  'deputado distrital': 'deputados distritais', 'senador': 'senadores',
  'governador': 'governadores', 'prefeito': 'prefeitos', 'vereador': 'vereadores',
  'presidente': 'presidenciáveis',
};

export function assuntoDoRelatorio(input: DadosRelatorio): string | null {
  const d = input.dadosBrutos ?? {};

  // Eleitoral
  const cands: any[] = d.buscar_votacao?.candidatos ?? [];
  if (cands.length > 0) {
    const ano = cands[0].ano ?? '';
    const uf  = cands[0].uf && cands[0].uf !== 'BR' ? cands[0].uf : '';
    // Consulta a um município: o título tem de dizer QUAL. "Ranking de
    // vereadores eleitos — SP 2024" não identifica o documento; a eleição é
    // municipal e existe uma por cidade.
    const muni = d.buscar_votacao?.municipioConsultado
      ? tituloCaso(String(d.buscar_votacao.municipioConsultado))
      : '';
    const local = muni ? (uf ? `${muni} (${uf})` : muni) : uf;
    const escopo = [local, ano].filter(Boolean).join(' ');
    if (cands.length === 1) {
      return `Desempenho eleitoral de ${listarNomes([cands[0].nomeUrna || cands[0].nome])}${escopo ? ` — ${escopo}` : ''}`;
    }
    if (cands.length <= 6) {
      return `Comparativo eleitoral: ${listarNomes(cands.map(c => c.nomeUrna || c.nome))}${escopo ? ` — ${escopo}` : ''}`;
    }
    // Muitos candidatos: o assunto é a disputa, não a lista de nomes
    const cargo = CARGO_TITULO[String(cands[0].cargo ?? '').toLowerCase()] ?? 'candidatos';
    const eleitos = d.buscar_votacao?.filtradoPorEleitos ? 'eleitos' : 'mais votados';
    return `Ranking de ${cargo} ${eleitos}${escopo ? ` — ${escopo}` : ''}`;
  }

  // Comparativo de emendas
  const comp: any[] = (d.comparar_parlamentares?.parlamentares ?? []).filter((p: any) => !p.naoEncontrado);
  if (comp.length > 0) {
    const uf = comp.find((p: any) => p.uf)?.uf ?? '';
    return `Comparativo de emendas: ${listarNomes(comp.map((p: any) => p.nome))}${uf ? ` — ${uf}` : ''}`;
  }

  // Emendas
  const emendas: any[] = d.buscar_emendas?.emendas ?? [];
  if (emendas.length > 0) {
    const cont = (campo: string) => {
      const m: Record<string, number> = {};
      for (const e of emendas) { const v = String(e?.[campo] ?? '').trim(); if (v && v !== 'N/A') m[v] = (m[v] ?? 0) + 1; }
      return Object.entries(m).sort((a, b) => b[1] - a[1]);
    };
    const parls = cont('parlamentar');
    const uf  = cont('uf')[0]?.[0] ?? '';
    const ano = cont('ano')[0]?.[0] ?? '';
    const escopo = [uf, ano].filter(Boolean).join(' ');
    if (parls.length === 1) return `Emendas de ${listarNomes([parls[0][0]])}${escopo ? ` — ${escopo}` : ''}`;
    if (parls.length > 1)  return `Emendas parlamentares${escopo ? ` — ${escopo}` : ''} (${parls.length} parlamentares)`;
    return `Emendas parlamentares${escopo ? ` — ${escopo}` : ''}`;
  }

  // Gabinete
  if (d.buscar_agenda?.encontrado) {
    const p = d.buscar_agenda.periodo ?? {};
    const ano = String(p.de ?? '').slice(0, 4);
    return `Agenda do gabinete${ano ? ` — ${ano}` : ''}`;
  }
  if (d.buscar_contatos?.encontrado) return 'Base de contatos do gabinete';
  if (d.buscar_demandas)            return 'Demandas do gabinete';
  if (d.dados_municipio?.municipio) {
    return `Perfil de ${tituloCaso(String(d.dados_municipio.municipio))}${d.dados_municipio.uf ? ` — ${d.dados_municipio.uf}` : ''}`;
  }
  return null;
}

