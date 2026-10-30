// Votos de um candidato num BAIRRO (ou distrito) de uma cidade, para a Gabi.
//
// O TSE publica o voto de cada LOCAL DE VOTAÇÃO (arquivos de seção). Somando
// os locais que ficam dentro do contorno oficial do bairro — os 96 distritos
// de São Paulo, os bairros do Censo 2022 nas outras cidades — sai o voto real
// do bairro. Antes a Gabi só tinha a zona eleitoral e, perguntada sobre
// Guaianases, escolheu por conta própria uma zona "vizinha" (a 347, que nem
// é de lá). Agora ela tem o número do bairro ou diz que não encontrou.
//
// Sem contorno para a cidade (ou sem bairro com aquele nome), cai no bairro
// do ENDEREÇO de cada local de votação, que também vem do TSE.

import { carregarBairros, dentroDaFeicao } from '@/lib/agent/report/mapa-bairros';
import {
  baseEstaticos, loadSecaoMunicipio, normalizarTextoTse, type CandidatoJson, type SecaoMunicipio,
} from '@/lib/tse-static';

type Pertence = (indiceLocal: number) => boolean;

interface Area { nome: string; pertence: Pertence }

const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 1000) / 10 : 0);

/** Código do cargo no arquivo de seção ("3" = Governador). */
function codigoDoCargo(secao: SecaoMunicipio, cargo: string): string | null {
  const alvo = normalizarTextoTse(cargo);
  return Object.entries(secao.cargos).find(([, nome]) => normalizarTextoTse(nome) === alvo)?.[0] ?? null;
}

/**
 * Chave de comparação tolerante à grafia: "Guaianazes" = "Guaianases",
 * "Ypiranga" = "Ipiranga", "Moóca" = "Mooca" (o TSE e o mapa nem sempre
 * escrevem igual).
 */
function chave(nome: string): string {
  return normalizarTextoTse(nome)
    .toLowerCase().replace(/z/g, 's').replace(/y/g, 'i').replace(/ph/g, 'f').replace(/(.)\1+/g, '$1');
}

/** Melhor nome para o pedido: igual > começa com > contém (o mais curto vence). */
function escolherNome(nomes: string[], pedido: string): string | null {
  const alvo = chave(pedido);
  const norm = nomes.map(n => ({ n, k: chave(n) }));
  const igual = norm.find(x => x.k === alvo);
  if (igual) return igual.n;
  const candidatos = norm
    .filter(x => x.k.startsWith(alvo) || alvo.startsWith(x.k) || x.k.includes(alvo))
    .sort((a, b) => a.k.length - b.k.length);
  return candidatos[0]?.n ?? null;
}

/**
 * Nomes parecidos para sugerir: pontua pelas palavras do pedido (4+ letras)
 * que aparecem no nome, pesando as mais longas — "Guaianazinho do Norte"
 * sugere GUAIANASES antes de qualquer bairro "(ZONA NORTE)".
 */
function parecidos(nomes: string[], pedido: string): string[] {
  const palavras = chave(pedido).split(' ').filter(p => p.length >= 4).map(p => p.slice(0, 6));
  return [...new Set(nomes)]
    .map(n => ({ n, pontos: palavras.reduce((s, p) => s + (chave(n).includes(p) ? p.length : 0), 0) }))
    .filter(x => x.pontos > 0)
    .sort((a, b) => b.pontos - a.pontos || a.n.length - b.n.length)
    .slice(0, 8)
    .map(x => x.n);
}

export async function votosNoBairro(params: {
  ano: string; turno: number; uf: string; municipio: string; bairro: string;
  candidato: CandidatoJson;
  /** Todos os candidatos do mesmo cargo (para dizer quem venceu no bairro). */
  disputa: CandidatoJson[];
}) {
  const { ano, turno, uf, municipio, bairro, candidato } = params;
  const secao = await loadSecaoMunicipio(ano, turno, uf, municipio);
  if (!secao) {
    return { encontrado: false, motivo: `Não há votos por local de votação de ${municipio} (${uf}) em ${ano}.` };
  }
  const cd = codigoDoCargo(secao, candidato.cargo);
  const lista = cd && candidato.numero != null ? secao.votos[`${cd}:${candidato.numero}`] : null;
  if (!cd || !lista) {
    return { encontrado: false, motivo: `${candidato.nomeUrna} não tem votos por local de votação em ${municipio}.` };
  }
  const doCandidato = new Map(lista);
  const totalNaCidade = lista.reduce((s, [, v]) => s + v, 0);

  // Eleição suplementar juntada pelo TSE no arquivo do ano: os locais não
  // batem com o oficial — melhor não dizer nada por bairro do que dizer errado.
  const alvoMun = normalizarTextoTse(municipio);
  const oficial = (candidato.zonas ?? [])
    .filter(z => normalizarTextoTse(z.municipio) === alvoMun)
    .reduce((s, z) => s + z.votos, 0);
  if (oficial > 0 && oficial !== totalNaCidade) {
    return {
      encontrado: false,
      motivo: `Os votos por local de ${candidato.nomeUrna} em ${municipio} não batem com o total oficial ` +
        '(o TSE juntou ali uma eleição suplementar) — não dá para separar por bairro com segurança.',
    };
  }

  // ── Em qual bairro fica cada local ────────────────────────────────────────
  let areas: Area[] = [];
  let nomesDosContornos: string[] = [];
  let metodo: 'contorno' | 'endereco' = 'contorno';
  const features = await carregarBairros(uf, municipio, await baseEstaticos()).catch(() => null);
  if (features && features.length > 0) {
    // Um local, um bairro: o primeiro contorno que o contém.
    const bairroDoLocal = secao.locais.map(l => {
      if (l.lat == null || l.lng == null) return null;
      const f = features.find(ft => dentroDaFeicao(l.lng!, l.lat!, ft.geometry));
      return f ? String(f.properties?.NM_BAIRRO ?? '') : null;
    });
    const nomes = [...new Set(bairroDoLocal.filter((n): n is string => !!n))];
    areas = nomes.map(nome => ({ nome, pertence: (i: number) => bairroDoLocal[i] === nome }));
    nomesDosContornos = nomes;
  }
  let escolhido = escolherNome(areas.map(a => a.nome), bairro);
  if (!escolhido) {
    // Sem contorno, ou o nome não é de nenhum contorno: bairro do endereço.
    metodo = 'endereco';
    const nomes = [...new Set(secao.locais.map(l => (l.b || '').trim()).filter(Boolean))];
    areas = nomes.map(nome => ({ nome, pertence: (i: number) => (secao.locais[i].b || '').trim() === nome }));
    escolhido = escolherNome(nomes, bairro);
  }
  if (!escolhido) {
    return {
      encontrado: false,
      motivo: `Não encontrei o bairro "${bairro}" em ${municipio}.`,
      sugestoes: parecidos([...nomesDosContornos, ...areas.map(a => a.nome)], bairro),
    };
  }
  const area = areas.find(a => a.nome === escolhido)!;

  // ── Votos do candidato no bairro ──────────────────────────────────────────
  const locais: Array<{ nome: string; endereco: string; bairroDoEndereco: string; zona: number; votos: number }> = [];
  const porZona: Record<number, number> = {};
  let votos = 0;
  secao.locais.forEach((l, i) => {
    if (!area.pertence(i)) return;
    const v = doCandidato.get(i) ?? 0;
    votos += v;
    porZona[l.z] = (porZona[l.z] ?? 0) + v;
    locais.push({ nome: l.n, endereco: l.e, bairroDoEndereco: l.b, zona: l.z, votos: v });
  });
  locais.sort((a, b) => b.votos - a.votos);

  // Posição do bairro entre todos os bairros da cidade, para este candidato.
  const porArea = areas.map(a => {
    let s = 0;
    secao.locais.forEach((_, i) => { if (a.pertence(i)) s += doCandidato.get(i) ?? 0; });
    return { nome: a.nome, votos: s };
  }).sort((a, b) => b.votos - a.votos);
  const posicao = porArea.findIndex(a => a.nome === escolhido) + 1;

  // ── A disputa no bairro: todos do mesmo cargo ────────────────────────────
  const prefixo = `${cd}:`;
  const nomePorNumero = new Map(params.disputa.map(c => [String(c.numero), c]));
  const disputa = Object.entries(secao.votos)
    .filter(([k]) => k.startsWith(prefixo))
    .map(([k, pares]) => {
      const numero = k.slice(prefixo.length);
      let s = 0;
      for (const [i, v] of pares) if (area.pertence(i)) s += v;
      const c = nomePorNumero.get(numero);
      return { numero, nomeUrna: c?.nomeUrna ?? '', partido: c?.partido ?? null, votos: s, oficial: !!c };
    })
    // Número fora da lista oficial (registro indeferido): voto que não conta.
    .filter(x => x.oficial && x.votos > 0)
    .map(({ oficial: _o, ...x }) => x)
    .sort((a, b) => b.votos - a.votos);
  const totalDisputa = disputa.reduce((s, x) => s + x.votos, 0);

  return {
    encontrado: true,
    bairro: escolhido,
    pedido: bairro,
    metodo: metodo === 'contorno'
      ? 'Locais de votação dentro do contorno oficial do bairro/distrito (votos reais do TSE por local)'
      : 'Locais de votação cujo endereço o TSE registra nesse bairro (votos reais do TSE por local)',
    votos,
    percentualDaCidade: pct(votos, totalNaCidade),
    totalNaCidade,
    posicaoEntreBairros: posicao,
    totalBairros: porArea.length,
    votosPorZona: Object.entries(porZona).map(([zona, v]) => ({ zona: Number(zona), votos: v })).sort((a, b) => b.votos - a.votos),
    locaisDeVotacao: locais,
    // Quem venceu no bairro, entre todos do cargo (votos nominais).
    disputaNoBairro: disputa.slice(0, 10).map(x => ({ ...x, percentual: pct(x.votos, totalDisputa) })),
    candidatosNoBairro: disputa.length,
    vencedorNoBairro: disputa[0]?.nomeUrna ?? null,
  };
}
