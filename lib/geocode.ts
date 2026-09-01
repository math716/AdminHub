// Geocodificação de endereços (Nominatim / OpenStreetMap), do lado do servidor.
//
// Existia só como rota HTTP (/api/geocode), acionada por um botão no formulário
// de agenda. Evento criado pela sincronização do Google ou pela importação de
// PDF entrava SEM coordenada — e sem coordenada não há pino no mapa nem rota.
//
// O cuidado central aqui NÃO é encontrar o endereço: é não inventar um.
// Testando com a agenda real de um gabinete do DF, a busca ingênua devolveu
// "GUARA" como a cidade de Guará no interior de São Paulo (600 km de distância)
// e "RESIDENCIA" como um bairro em Goias. Um pino errado no mapa é pior que
// pino nenhum, porque parece certo. Daí as tres defesas abaixo:
//
//   1. termos genericos ("residencia", "agenda pessoal") nunca sao consultados;
//   2. a busca e enviesada para a regiao onde o gabinete ja atua (viewbox);
//   3. resultado longe demais dessa regiao e descartado.
//
// O Nominatim e gratuito e sem chave, mas a politica de uso exige no maximo
// UMA consulta por segundo e um User-Agent identificavel — por isso o lote e
// sequencial e com pausa.

import { prisma } from '@/lib/db';

const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
const USER_AGENT = 'AdminHub/1.0 (gabinete@adminhub.app)';

/** Pausa exigida pela politica do Nominatim entre duas consultas. */
const INTERVALO_MS = 1100;

/** Meio grau ~= 55 km. Enviesa a busca sem excluir a regiao metropolitana. */
const VIEWBOX_GRAUS = 1.2;

/** Acima disto o resultado e considerado outra cidade de mesmo nome. */
const RAIO_MAX_KM = 150;

const cache = new Map<string, Coordenada | null>();

export interface Coordenada { lat: number; lng: number }
export interface Ancora extends Coordenada {}

/**
 * Termos que descrevem um compromisso, nao um lugar. O Nominatim sempre acha
 * ALGUMA coisa para eles — em geral um bairro homonimo em outro estado.
 */
const GENERICOS = [
  'residencia', 'agenda pessoal', 'pessoal', 'particular', 'gabinete',
  'escritorio', 'casa', 'em casa', 'home office', 'online', 'remoto',
  'a definir', 'a confirmar', 'interno', 'reuniao interna', 'almoco',
  'deslocamento', 'livre', 'diversos', 'varios',
  // Vistos na agenda real do cliente: "COMITE" foi parar em Minas Gerais e
  // "Residencia" no Espirito Santo, porque o servico de mapas sempre encontra
  // ALGUMA coisa com esses nomes.
  'comite', 'sede', 'sede do comite', 'base', 'ponto de apoio', 'qg',
  'jantar', 'cafe da manha', 'reuniao', 'evento', 'compromisso', 'visita',
];

// Faixa dos acentos combinantes (U+0300-U+036F). Montada com fromCharCode
// porque escrever esses caracteres direto no fonte os deixa invisiveis e
// sujeitos a corrupcao por editor.
const COMBINANTES = new RegExp(
  '[' + String.fromCharCode(0x300) + '-' + String.fromCharCode(0x36f) + ']', 'g');

/** Tira acentos sem depender de caracteres combinantes no codigo-fonte. */
function semAcento(s: string): string {
  return s.normalize('NFD').replace(COMBINANTES, '').toLowerCase().trim();
}

export function ehGenerico(consulta: string): boolean {
  const limpo = semAcento(consulta).replace(/[.,;-]/g, ' ').replace(/\s+/g, ' ').trim();

  // Qualquer numero indica endereco de verdade junto: "COMITE Central, SQN 210"
  // tem onde ser encontrado, ao contrario de "COMITE" sozinho.
  if (/\d/.test(limpo)) return false;

  return GENERICOS.some(g => limpo === g || limpo.startsWith(g + ' '));
}

/**
 * Uma consulta so vale sem viés geografico quando ela mesma diz onde fica:
 * tem numero, ou cita cidade/UF. "Guara" sozinho, nao.
 */
function ehEspecifica(consulta: string): boolean {
  const s = semAcento(consulta);
  return /\d/.test(s) || s.split(',').length >= 3 || /\b(df|sp|rj|mg|brasilia|distrito federal)\b/.test(s);
}

/**
 * Monta a consulta a partir dos campos do evento.
 *
 * `endereco` e sempre melhor que `local`: "SHIN CA5, Bloco J2" localiza, ao
 * passo que "LAGO NORTE" sozinho cai no centro da regiao. Havendo os dois, o
 * local entra como complemento e ajuda a desambiguar.
 */
export function consultaDoEvento(campos: { endereco?: string | null; local?: string | null }): string | null {
  const endereco = (campos.endereco ?? '').trim();
  const local = (campos.local ?? '').trim();

  const texto = endereco && local && !semAcento(endereco).includes(semAcento(local))
    ? `${endereco}, ${local}`
    : endereco || local;

  if (!texto) return null;
  if (ehGenerico(texto)) return null;   // compromisso sem lugar de verdade
  return texto;
}

/**
 * Complementos que o Nominatim nao indexa e que fazem a busca voltar vazia.
 * "QI 15, Cj 7, Casa 23" nao existe na base; "QI 15" existe.
 */
const COMPLEMENTOS = /^(cj|conj|conjunto|casa|bloco|bl|apto|apartamento|sala|salas|lote|lt|chacara|andar|loja|ed|edificio|predio|torre|km)\b/;

/**
 * O mesmo complemento colado no fim de um trecho, sem virgula separando:
 * "Av. Salvador Coelho Quadra 41" -> "Av. Salvador Coelho".
 */
const COMPLEMENTO_NO_FIM =
  /\s+(cj|conj|conjunto|casa|bloco|bl|apto|apartamento|sala|salas|lote|lt|chacara|chácara|quadra|qd|andar|loja)\s*[\w/-]*$/i;

/** Palavra de complemento em QUALQUER posicao da parte, nao so no inicio. */
const TEM_COMPLEMENTO =
  /(cj|conj|conjunto|casa|bloco|bl|apto|apartamento|sala|salas|lote|lt|chacara|andar|loja|ed|edificio|predio|torre|quadra|qd|km)/;

/**
 * Versoes progressivamente mais curtas da consulta, da mais completa a mais
 * simples. Quem chama tenta uma a uma e para na primeira que encontrar.
 *
 * Endereco de gabinete vem com um rastro de complementos:
 *
 *   "SHIN CA 05, Conjunto J, Bloco J2 Ed. Lucia Plaza, 3o Andar,
 *    Salas 308/309 - Caravelas Filmes, LAGO NORTE"
 *
 * Medido: o texto inteiro nao acha; "SHIN CA 05, 3o Andar, LAGO NORTE" tambem
 * nao — bastava o "3o Andar" para estragar; "SHIN CA 05, LAGO NORTE" acha.
 * Uma unica simplificacao nao dava conta porque "3o Andar" COMECA com o
 * numero, e o filtro antigo so olhava o inicio da parte.
 */
export function variantesDeBusca(consulta: string): string[] {
  const partes = consulta.split(',').map(p => p.trim()).filter(Boolean);
  const saida: string[] = [consulta];

  // Sem as partes que sao puro complemento (em qualquer posicao da parte).
  const uteis = partes.filter(p => !TEM_COMPLEMENTO.test(semAcento(p)));
  if (uteis.length > 0 && uteis.length < partes.length) saida.push(uteis.join(', '));

  // O essencial: a via e a regiao. Descarta todo o miolo.
  if (partes.length > 2) saida.push(`${partes[0]}, ${partes[partes.length - 1]}`);

  // Ultimo recurso: so a regiao. Impreciso, mas coloca o compromisso no
  // bairro certo — e a tela mostra o nome do lugar para a pessoa julgar.
  if (partes.length > 1) saida.push(partes[partes.length - 1]);

  return [...new Set(saida)].filter(v => v.trim().length > 2);
}

/** Mantida para a sincronizacao do Google, que usa uma unica alternativa. */
export function simplificar(consulta: string): string | null {
  const vs = variantesDeBusca(consulta);
  return vs.length > 1 ? vs[1] : null;
}

function distanciaKm(a: Coordenada, b: Coordenada): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function chaveCache(consulta: string, ancora?: Ancora): string {
  return `${semAcento(consulta)}|${ancora ? `${ancora.lat.toFixed(2)},${ancora.lng.toFixed(2)}` : ''}`;
}

/** Uma consulta ao Nominatim. Devolve null quando nao encontra — nunca lanca. */
async function consultarNominatim(consulta: string, ancora?: Ancora): Promise<Coordenada | null> {
  const chave = chaveCache(consulta, ancora);
  if (cache.has(chave)) return cache.get(chave) ?? null;

  // Sem ancora e sem pistas de cidade na propria consulta, o risco de cair na
  // cidade errada e alto demais — melhor devolver nada.
  if (!ancora && !ehEspecifica(consulta)) {
    cache.set(chave, null);
    return null;
  }

  try {
    // limit alto de proposito: o Nominatim ordena por relevancia textual, NAO
    // por proximidade. Buscamos varios e escolhemos o mais perto da ancora.
    let url = `${NOMINATIM}?format=json&limit=10&countrycodes=br&q=${encodeURIComponent(consulta)}`;
    if (ancora) {
      const v = [
        ancora.lng - VIEWBOX_GRAUS, ancora.lat + VIEWBOX_GRAUS,
        ancora.lng + VIEWBOX_GRAUS, ancora.lat - VIEWBOX_GRAUS,
      ].map(n => n.toFixed(4)).join(',');
      url += `&viewbox=${v}`;   // enviesa sem excluir: bounded=1 perderia vizinhos legitimos
    }

    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT } });
    if (!res.ok) {
      console.warn(`[geocode] Nominatim respondeu ${res.status}`);
      return null;
    }

    const dados: any[] = await res.json();
    const candidatos = (Array.isArray(dados) ? dados : [])
      .map(r => ({ lat: parseFloat(r.lat), lng: parseFloat(r.lon) }))
      .filter(c => Number.isFinite(c.lat) && Number.isFinite(c.lng));
    if (candidatos.length === 0) { cache.set(chave, null); return null; }

    // "Prefeitura de Sao Paulo" devolvia a prefeitura de Sao Jose do Rio Preto:
    // o Nominatim le "Sao Paulo" como o ESTADO e ordena por semelhanca de nome.
    // Com a ancora, o mais PROXIMO e quase sempre o certo.
    const coord = ancora
      ? candidatos.reduce((a, b) => (distanciaKm(ancora, b) < distanciaKm(ancora, a) ? b : a))
      : candidatos[0];

    // Homonimo em outro estado: descarta em vez de plotar longe.
    if (ancora && distanciaKm(ancora, coord) > RAIO_MAX_KM) {
      console.warn(`[geocode] "${consulta.slice(0, 40)}" caiu a ${Math.round(distanciaKm(ancora, coord))} km — descartado`);
      cache.set(chave, null);
      return null;
    }

    cache.set(chave, coord);
    return coord;
  } catch (err) {
    console.warn('[geocode] falhou:', String(err).slice(0, 120));
    return null;
  }
}

/**
 * Geocodifica uma consulta, tentando a versao simplificada quando a completa
 * nao retorna nada.
 *
 * A cascata existe porque endereco de gabinete vem com complemento
 * ("QI 15, Cj 7, Casa 23") que o Nominatim nao conhece. Retirado o
 * complemento, a busca acerta a rua. NAO ha um terceiro nivel caindo para a
 * regiao: "Planaltina" sozinho resolve para Planaltina de Goias, outra cidade
 * a 40 km — dentro do raio aceito, e portanto um erro que passaria batido.
 */
export async function geocodificar(consulta: string, ancora?: Ancora): Promise<Coordenada | null> {
  const direta = await consultarNominatim(consulta, ancora);
  if (direta) return direta;

  const curta = simplificar(consulta);
  if (!curta) return null;

  await pausa(INTERVALO_MS);   // a segunda tentativa tambem conta para o limite
  const coord = await consultarNominatim(curta, ancora);

  // Grava o acerto TAMBEM sob a consulta original. Sem isto, o mesmo endereco
  // repetido no lote consultava o cache pela forma completa, encontrava o
  // "nao achei" da primeira tentativa e desistia sem tentar a cascata.
  cache.set(chaveCache(consulta, ancora), coord);
  return coord;
}

/**
 * Centro da atuacao do gabinete, pela MEDIANA das coordenadas que ele ja tem
 * (eventos e demandas). Mediana, e nao media, porque um unico ponto digitado
 * errado puxaria a media para o meio do oceano.
 *
 * Devolve undefined quando o gabinete ainda nao tem nenhum ponto — nesse caso
 * so enderecos autoexplicativos sao geocodificados.
 */
export async function ancoraDoGabinete(gabineteId: string): Promise<Ancora | undefined> {
  const [eventos, demandas] = await Promise.all([
    prisma.agendaEvent.findMany({
      where: { gabineteId, lat: { not: null }, lng: { not: null } },
      select: { lat: true, lng: true }, take: 200,
    }),
    prisma.demand.findMany({
      where: { gabineteId, lat: { not: null }, lng: { not: null } },
      select: { lat: true, lng: true }, take: 200,
    }),
  ]);

  const pontos = [...eventos, ...demandas]
    .filter((p): p is { lat: number; lng: number } => p.lat != null && p.lng != null);
  if (pontos.length === 0) return undefined;

  const mediana = (ns: number[]) => {
    const o = [...ns].sort((a, b) => a - b);
    const m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
  };

  return { lat: mediana(pontos.map(p => p.lat)), lng: mediana(pontos.map(p => p.lng)) };
}

export interface ItemParaGeocodificar {
  endereco?: string | null;
  local?: string | null;
}

export interface OpcoesLote {
  /** Regiao de referencia do gabinete (ver ancoraDoGabinete). */
  ancora?: Ancora;
  /** Teto de consultas, para uma agenda grande nao consumir o turno inteiro. */
  maximo?: number;
  /** Orcamento de tempo. Ao estourar, o que sobrou fica sem coordenada. */
  orcamentoMs?: number;
}

/**
 * Geocodifica uma lista, na ordem, respeitando o limite do Nominatim.
 *
 * Devolve um array do mesmo tamanho e na mesma ordem da entrada, com `null`
 * onde nao havia endereco, onde o texto era generico ou onde a busca nao
 * encontrou nada confiavel. Ficar sem coordenada NAO e erro: o evento e
 * gravado do mesmo jeito, apenas nao aparece no mapa.
 */
export async function geocodificarLote<T extends ItemParaGeocodificar>(
  itens: T[],
  opcoes: OpcoesLote = {},
): Promise<Array<Coordenada | null>> {
  const maximo = opcoes.maximo ?? 40;
  const limite = Date.now() + (opcoes.orcamentoMs ?? 25_000);

  const saida: Array<Coordenada | null> = new Array(itens.length).fill(null);
  let consultas = 0;

  for (let i = 0; i < itens.length; i++) {
    const consulta = consultaDoEvento(itens[i]);
    if (!consulta) continue;   // sem endereco ou generico: nao geocodifica

    const chave = `${semAcento(consulta)}|${opcoes.ancora ? `${opcoes.ancora.lat.toFixed(2)},${opcoes.ancora.lng.toFixed(2)}` : ''}`;
    if (cache.has(chave)) { saida[i] = cache.get(chave) ?? null; continue; }

    if (consultas >= maximo || Date.now() > limite) {
      console.warn(`[geocode] lote interrompido em ${i}/${itens.length} (teto ou tempo)`);
      break;
    }

    if (consultas > 0) await pausa(INTERVALO_MS);
    saida[i] = await geocodificar(consulta, opcoes.ancora);
    consultas++;
  }

  return saida;
}

function pausa(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
