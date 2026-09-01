export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth-options';
import { ancoraDoGabinete, variantesDeBusca, ehGenerico, conferirNumeros, type Ancora } from '@/lib/geocode';

// Cache em memória: chave → { results, expiresAt }
const geocodeCache = new Map<string, { results: unknown[]; aproximado?: boolean; expiresAt: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 horas

/** Faixa em graus ao redor do gabinete usada para enviesar a busca (~130 km). */
const VIEWBOX_GRAUS = 1.2;

// Proxy para o Nominatim (OpenStreetMap) — sem custo, sem chave.
// GET /api/geocode?address=Rua+das+Flores+123
export async function GET(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: 'Não autorizado' }, { status: 401 });

  const address = request.nextUrl.searchParams.get('address');
  if (!address) return NextResponse.json({ error: 'Parâmetro address obrigatório' }, { status: 400 });

  // estrito=1 (importação em lote): descarta resultado longe demais da região
  // do gabinete, em vez de só reordenar. Aqui ninguém está conferindo endereço
  // por endereço, então um homônimo de outro estado passaria batido.
  const estrito = request.nextUrl.searchParams.get('estrito') === '1';

  // lote=1 (importação de agenda): recusa nomes que descrevem o compromisso e
  // não um lugar — "COMITÊ", "Residência", "Agenda Pessoal". O serviço de mapas
  // sempre encontra ALGUMA coisa para eles, e na agenda real do cliente isso
  // colocou compromissos de Brasília em Minas Gerais e no Espírito Santo.
  // No formulário manual não vale: ali a pessoa digitou de propósito.
  const lote = request.nextUrl.searchParams.get('lote') === '1';
  // Cidade deduzida do lote inteiro, enviada à parte. Se viesse grudada no
  // endereço, o "DF" do fim seria confundido com a região do compromisso ao
  // montar as versões curtas da busca.
  const cidade = (request.nextUrl.searchParams.get('cidade') ?? '').trim();
  if (lote && ehGenerico(address)) {
    return NextResponse.json({ results: [], semLugar: true });
  }

  const gabineteId = (session.user as any)?.gabineteId as string | undefined;

  // A âncora entra na chave: o mesmo endereço deve resolver diferente para
  // gabinetes de estados diferentes.
  const ancora = gabineteId ? await ancoraDoGabinete(gabineteId).catch(() => undefined) : undefined;
  // `estrito` entra na chave: o modo solto e o estrito podem devolver
  // resultados diferentes para o mesmo endereço.
  const cacheKey = `${address.toLowerCase().trim()}|${cidade}|${ancora ? `${ancora.lat.toFixed(2)},${ancora.lng.toFixed(2)}` : ''}|${estrito ? 'e' : ''}`;
  const cached = geocodeCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return NextResponse.json({
      results: cached.results,
      ...(cached.aproximado && { aproximado: true }),
    });
  }

  try {
    // limit alto de propósito: o Nominatim ordena por semelhança de NOME, não
    // por proximidade. "Prefeitura de São Paulo" devolvia a prefeitura de São
    // José do Rio Preto, porque ele lê "São Paulo" como o estado. Buscamos
    // vários e reordenamos pelo mais perto de onde o gabinete atua.
    const viewbox = ancora
      ? '&viewbox=' + [
          ancora.lng - VIEWBOX_GRAUS, ancora.lat + VIEWBOX_GRAUS,
          ancora.lng + VIEWBOX_GRAUS, ancora.lat - VIEWBOX_GRAUS,
        ].map(n => n.toFixed(4)).join(',')
      : '';

    const buscar = (termo: string) => fetch(
      'https://nominatim.openstreetmap.org/search'
      + `?format=json&limit=15&addressdetails=1&countrycodes=br&q=${encodeURIComponent(termo)}${viewbox}`,
      { headers: { 'User-Agent': 'AdminHub/1.0 (gabinete@adminhub.app)' } },
    );

    // Tenta versões progressivamente mais curtas até encontrar. Endereço de
    // gabinete vem com um rastro de complementos — "SHIN CA 05, Conjunto J,
    // Bloco J2 Ed. Lúcia Plaza, 3º Andar, Salas 308/309" não existe na base do
    // serviço, mas "SHIN CA 05, Lago Norte" existe. Sem isto, endereço do DF
    // completo e correto simplesmente não era encontrado.
    const variantes = variantesDeBusca(address)
      .map(v => (cidade ? `${v}, ${cidade}` : v))
      .slice(0, 5);

    /**
     * Um resultado só com bairro ou cidade, sem rua, é o serviço dizendo "achei
     * a região, não o endereço". Ele SEMPRE devolve algo assim, então parar na
     * primeira resposta colocava o compromisso no centro do bairro mesmo
     * havendo uma versão da busca capaz de achar a rua exata.
     */
    const temRua = (d: any[]) => Boolean(d?.[0]?.address?.road || d?.[0]?.address?.house_number);

    /**
     * Joga fora a resposta que CONTRADIZ o endereco perguntado.
     *
     * Buscando "SMPW Quadra 05, Conjunto 06, Chacara 09" o servico devolveu
     * "SMPW Quadra 26 Conjunto 08 Lote 09" — outra quadra, quilometros dali. A
     * busca e por semelhanca de texto, entao ele sempre acha o parecido; quem
     * confere se o numero e o mesmo somos nos. Divergencia so no conjunto ou no
     * lote passa, marcada como aproximada: e o vizinho, nao outro endereco.
     */
    const limpar = (d: any[]) => (Array.isArray(d) ? d : [])
      .filter(it => conferirNumeros(address, String(it?.display_name ?? '')) !== 'conflito');

    let res = await buscar(variantes[0]);
    let data: any[] = res.ok ? limpar(await res.json()) : [];
    let reserva: any[] = temRua(data) ? [] : data;   // guarda o aproximado

    for (let i = 1; i < variantes.length && res.ok && !temRua(data); i++) {
      await new Promise(r => setTimeout(r, 1100));     // uma consulta por segundo
      const proxima = await buscar(variantes[i]);
      if (!proxima.ok) break;
      const d = limpar(await proxima.json());
      if (temRua(d)) { data = d; break; }
      if (d?.length && reserva.length === 0) reserva = d;
      data = [];
    }

    // Nenhuma variante achou a rua: fica a melhor aproximação (o bairro).
    if (!temRua(data) && reserva.length > 0) data = reserva;

    if (!res.ok) {
      // 403/429 do Nominatim = uso acima do permitido (uma consulta por
      // segundo). Isso acontece de verdade quando uma importação em lote está
      // rodando ao mesmo tempo, e precisa ser dito com estas palavras: quem vê
      // "nenhum endereço encontrado" tenta de novo com outro texto, o que não
      // resolve e piora o bloqueio.
      const bloqueado = res.status === 403 || res.status === 429;
      console.warn(`[geocode] Nominatim ${res.status} para "${address.slice(0, 60)}"`);
      return NextResponse.json(
        {
          error: bloqueado
            ? 'O serviço de mapas está recusando consultas no momento. Aguarde um instante e tente de novo.'
            : 'Falha ao consultar o serviço de mapas.',
          bloqueado,
        },
        { status: 502 },
      );
    }

    let results = data.map((item) => ({
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      displayName: item.display_name,
      // O nome do lugar na frente do endereco. Sem ele, quem buscou o estadio
      // Mane Garrincha lia "SRPN Trecho 1, Setor de Administracao Municipal" e
      // nao tinha como saber que era o estadio — o endereco esta certo, mas nao
      // se parece com o que a pessoa escreveu.
      endereco: [
        item.name && item.name !== item.address?.road ? item.name : null,
        item.address?.road,
        item.address?.house_number,
        item.address?.suburb || item.address?.neighbourhood,
        item.address?.city || item.address?.town || item.address?.village,
        item.address?.state,
      ]
        .filter(Boolean)
        .join(', '),
    })).filter(r => Number.isFinite(r.lat) && Number.isFinite(r.lng));

    // No formulário NÃO descartamos os distantes: a pessoa está digitando de
    // propósito e pode marcar um compromisso em outro estado. Só reordenamos, e
    // a tela mostra o endereço encontrado para ela conferir. Em lote (estrito),
    // o corte volta.
    if (ancora) {
      results = results
        .map(r => ({ ...r, _km: distanciaKm(ancora, r) }))
        .sort((a, b) => a._km - b._km)
        .filter(r => !estrito || r._km <= 150)
        .map(({ _km, ...r }) => r);
    }
    results = results.slice(0, 5);

    // Um resultado a centenas de quilômetros da região do gabinete pode estar
    // certo (compromisso em outro estado) ou ser homônimo — "SHIS" sozinho
    // resolve para Luziânia/GO. Quem decide é quem está na tela, mas ela
    // precisa ser avisada.
    const longe = ancora && results[0]
      ? Math.round(distanciaKm(ancora, results[0]))
      : null;

    // O servico SEMPRE devolve alguma coisa: nao achando a rua, devolve a
    // regiao. Isso apareceu na tela como se fosse o endereco encontrado
    // ("Taguatinga Sul, Taguatinga"), e a pessoa dava por conferido. Precisa
    // estar escrito que e aproximado.
    const aproximado = results.length > 0
      && (!temRua(data)
        || conferirNumeros(address, String(data[0]?.display_name ?? '')) === 'aproximado');

    const payload = {
      results,
      ...(aproximado && { aproximado: true }),
      ...(longe !== null && longe > 100 && { distanciaKm: longe }),
    };
    geocodeCache.set(cacheKey, { results, aproximado, expiresAt: Date.now() + CACHE_TTL_MS });
    return NextResponse.json(payload);
  } catch {
    return NextResponse.json({ error: 'Erro ao geocodificar endereço' }, { status: 500 });
  }
}

function distanciaKm(a: Ancora, b: { lat: number; lng: number }): number {
  const R = 6371;
  const rad = (g: number) => (g * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
