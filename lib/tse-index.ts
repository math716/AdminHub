// Índice nacional de candidatos (nome → UF/cargo).
//
// Vive num módulo SEPARADO de tse-static de propósito: o tracing da Vercel
// arrasta para o bundle todo arquivo que o código de um módulo importado
// referencia. Com estas funções dentro de tse-static, a rota do relatório —
// que importa tse-static apenas para ler os votos, e nunca usa o índice —
// carregava 1 MB a mais e o build estourava o teto de 250 MB por 220 KB.
// Só lib/agent/executors.ts (usado pela rota de chat) importa este arquivo.

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { normalizarTextoTse, TITULOS_COMUNS } from './tse-static';

// Achar alguém sem saber a UF exigiria abrir os 27 arquivos do ano (~5s e
// centenas de MB de heap). O índice traz só o que identifica a pessoa; é
// gerado por scripts/build-tse-index.mts.
export interface CandidatoIndice {
  uf: string; nomeUrna: string; nome: string;
  cargo: string; partido: string; totalVotos: number; situacao: string;
}

const indiceCache = new Map<string, CandidatoIndice[] | null>();

function loadIndice(ano: string): CandidatoIndice[] | null {
  if (indiceCache.has(ano)) return indiceCache.get(ano)!;
  let dados: CandidatoIndice[] | null = null;
  try {
    // Fora de public/data/tse/ de propósito: o tracing da Vercel puxa aquele
    // diretório inteiro para TODA rota que o lê, e o índice acabava viajando
    // no bundle do relatório (que não o usa) — o build falhava por 220 KB.
    const fp = path.join(process.cwd(), 'public', 'data', 'tse-index', `${ano}.json.gz`);
    if (fs.existsSync(fp)) {
      const cru: any[] = JSON.parse(zlib.gunzipSync(fs.readFileSync(fp) as any).toString('utf8'));
      dados = cru.map(e => ({
        uf: e.u, nomeUrna: e.n, nome: e.c, cargo: e.g,
        partido: e.p, totalVotos: e.v, situacao: e.s,
      }));
    }
  } catch {
    dados = null;
  }
  indiceCache.set(ano, dados);
  return dados;
}

/**
 * Procura um candidato em TODAS as UFs de um ano, para descobrir o estado a
 * partir só do nome ("André do Prado" → SP). Devolve os melhores palpites,
 * mais votados primeiro. Retorna `null` se o índice do ano não existir — aí o
 * chamador segue pelo caminho antigo em vez de quebrar.
 */
export function buscarCandidatoNacional(
  nome: string,
  ano: string,
  cargo?: string,
  limite = 8,
): CandidatoIndice[] | null {
  const idx = loadIndice(ano);
  if (!idx) return null;

  const palavras = normalizarTextoTse(nome).split(' ').filter(p => p.length > 2);
  if (palavras.length === 0) return [];
  const cargoNorm = cargo ? normalizarTextoTse(cargo) : '';
  const identificadoras = palavras.filter(p => !TITULOS_COMUNS.has(p));

  // Casa PALAVRA INTEIRA: com `includes`, "andre" casava dentro de
  // "alexandre" e a busca por "André do Prado" trazia "ALEXANDRE PRADO".
  const temPalavra = (alvo: string[], p: string) => alvo.includes(p);

  const casa = (c: CandidatoIndice, exigirTodas: boolean) => {
    if (cargoNorm && !normalizarTextoTse(c.cargo).includes(cargoNorm)) return false;
    const alvo = `${normalizarTextoTse(c.nomeUrna)} ${normalizarTextoTse(c.nome)}`.split(' ');
    return exigirTodas
      ? palavras.every(p => temPalavra(alvo, p))
      : identificadoras.length > 0 && identificadoras.every(p => temPalavra(alvo, p));
  };

  // 1ª passada exige todas as palavras; se nada casar, ignora títulos genéricos
  // ("Deputado André do Prado" → "André do Prado").
  let achados = idx.filter(c => casa(c, true));
  if (achados.length === 0 && identificadoras.length < palavras.length) {
    achados = idx.filter(c => casa(c, false));
  }
  return achados.sort((a, b) => b.totalVotos - a.totalVotos).slice(0, limite);
}

/**
 * UF mais provável de um conjunto de nomes. Quando o usuário cita vários
 * candidatos sem dizer o estado, o estado em comum entre eles é a resposta —
 * é assim que "André do Prado e Ricardo Molina" vira SP.
 */
export function inferirUfPorNomes(
  nomes: string[],
  ano: string,
  cargo?: string,
): { uf: string | null; porNome: Record<string, CandidatoIndice[]> } {
  const porNome: Record<string, CandidatoIndice[]> = {};
  // Peso por UF: cada nome vota na UF do seu melhor palpite. Um nome que só
  // existe num estado decide; nomes ambíguos apenas reforçam.
  const peso: Record<string, number> = {};

  for (const n of nomes) {
    const achados = buscarCandidatoNacional(n, ano, cargo) ?? [];
    porNome[n] = achados;
    const ufsDoNome = new Set<string>();
    for (const c of achados) {
      if (ufsDoNome.has(c.uf)) continue;
      ufsDoNome.add(c.uf);
      // O mais votado do nome pesa mais que os homônimos fracos
      peso[c.uf] = (peso[c.uf] ?? 0) + (c === achados[0] ? 2 : 1);
    }
  }

  const ranking = Object.entries(peso).sort((a, b) => b[1] - a[1]);
  return { uf: ranking[0]?.[0] ?? null, porNome };
}

