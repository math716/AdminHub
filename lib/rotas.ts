// Cálculo de rotas entre compromissos (OSRM / OpenStreetMap).
//
// Fica isolado de propósito: o provedor de rotas é a peça mais provável de
// mudar. O `router.project-osrm.org` é gratuito e não exige chave, mas é um
// servidor de demonstração mantido pela comunidade — mesma situação dos tiles
// do OSM. Se um dia precisar de garantia de disponibilidade, trocar por
// OpenRouteService ou GraphHopper é mexer só neste arquivo.

const OSRM = 'https://router.project-osrm.org';

/** Compromissos de um dia não passam disso; o teto protege o servidor público. */
const MAX_PONTOS = 25;

const TIMEOUT_MS = 15_000;

export interface Ponto {
  lat: number;
  lng: number;
  nome?: string;
}

export interface Trecho {
  de: string;
  para: string;
  distanciaKm: number;
  duracaoMin: number;
}

export interface Rota {
  trechos: Trecho[];
  distanciaTotalKm: number;
  duracaoTotalMin: number;
  /** Pares [lat, lng], prontos para o Leaflet desenhar. */
  linha: Array<[number, number]>;
}

/**
 * Traça a rota passando pelos pontos NA ORDEM recebida.
 *
 * Devolve null quando não há pontos suficientes ou o serviço falha — a tela
 * segue mostrando os pinos, apenas sem a linha. Nunca lança.
 */
export async function tracarRota(pontos: Ponto[]): Promise<Rota | null> {
  if (pontos.length < 2) return null;

  const usados = pontos.slice(0, MAX_PONTOS);
  const coords = usados.map(p => `${p.lng},${p.lat}`).join(';');  // OSRM usa lng,lat
  const url = `${OSRM}/route/v1/driving/${coords}?overview=full&geometries=geojson`;

  const dados = await buscar(url);
  const rota = dados?.routes?.[0];
  if (!rota) return null;

  // Uma "leg" para cada par consecutivo de pontos.
  const trechos: Trecho[] = (rota.legs ?? []).map((leg: any, i: number) => ({
    de: usados[i]?.nome ?? `Ponto ${i + 1}`,
    para: usados[i + 1]?.nome ?? `Ponto ${i + 2}`,
    distanciaKm: Math.round((leg.distance ?? 0) / 100) / 10,
    duracaoMin: Math.round((leg.duration ?? 0) / 60),
  }));

  return {
    trechos,
    distanciaTotalKm: Math.round((rota.distance ?? 0) / 100) / 10,
    duracaoTotalMin: Math.round((rota.duration ?? 0) / 60),
    // O GeoJSON vem [lng, lat]; o Leaflet espera [lat, lng].
    linha: (rota.geometry?.coordinates ?? []).map((c: [number, number]) => [c[1], c[0]] as [number, number]),
  };
}

/**
 * Resolve em que ORDEM visitar os pontos para gastar menos tempo, mantendo o
 * primeiro como partida e o último como chegada.
 *
 * Devolve os índices na nova ordem — quem chamou decide se aplica. Null quando
 * não compensa (menos de 4 pontos) ou o serviço falha.
 */
export async function ordenarParadas(pontos: Ponto[]): Promise<number[] | null> {
  if (pontos.length < 4) return null;   // com 3 ou menos não há o que otimizar

  const usados = pontos.slice(0, MAX_PONTOS);
  const coords = usados.map(p => `${p.lng},${p.lat}`).join(';');
  const url = `${OSRM}/trip/v1/driving/${coords}`
    + '?source=first&destination=last&roundtrip=false&overview=false';

  const dados = await buscar(url);
  if (!dados?.trips?.[0]) return null;

  // waypoints[i].waypoint_index diz a posição do ponto i na viagem otimizada.
  const ordem: number[] = new Array(usados.length);
  for (let i = 0; i < usados.length; i++) {
    const idx = dados.waypoints?.[i]?.waypoint_index;
    if (typeof idx !== 'number') return null;
    ordem[idx] = i;
  }
  return ordem.every(n => typeof n === 'number') ? ordem : null;
}

async function buscar(url: string): Promise<any | null> {
  try {
    const controle = new AbortController();
    const t = setTimeout(() => controle.abort(), TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controle.signal,
      headers: { 'User-Agent': 'AdminHub/1.0 (gabinete@adminhub.app)' },
    });
    clearTimeout(t);

    if (!res.ok) {
      console.warn(`[rotas] OSRM respondeu ${res.status}`);
      return null;
    }
    const dados = await res.json();
    if (dados?.code !== 'Ok') {
      console.warn(`[rotas] OSRM: ${dados?.code} ${dados?.message ?? ''}`);
      return null;
    }
    return dados;
  } catch (err) {
    console.warn('[rotas] falhou:', String(err).slice(0, 120));
    return null;
  }
}

/**
 * Minutos livres entre o fim de um compromisso e o início do seguinte.
 * Negativo quando eles se sobrepõem.
 */
export function folgaMinutos(fimAnterior: Date, inicioSeguinte: Date): number {
  return Math.round((inicioSeguinte.getTime() - fimAnterior.getTime()) / 60000);
}
