/**
 * Baixa as emendas parlamentares do DF do SISCONEP Cidadão.
 * Uso: ANOS=2025,2026 npx tsx scripts/download-emendas-df-sisconep.ts
 *
 * Chama a API do site direto, sem navegador.
 *
 * A versão anterior abria o Chromium e clicava na tela. Quebrou por duas
 * razões ao mesmo tempo: o botão passou a se chamar "Pesquisar" (era "Buscar")
 * e a resposta mudou de forma. Clicar em tela é assim — depende do texto do
 * botão, da classe do dropdown e da ordem dos cliques, e qualquer ajuste de
 * layout do site derruba o robô.
 *
 * O site é OutSystems, e a tela busca os dados numa chamada só:
 *
 *   POST /screenservices/SISCONEPCidadao/MainFlow/Emendas/DataActionGetEmendas
 *
 * É essa chamada que fazemos aqui. O ano vai em `clientVariables.Ano`, e
 * `MaxRecords` alto traz o ano inteiro de uma vez, sem paginar.
 *
 * O OutSystems exige duas versões no corpo, e as duas mudam a cada publicação
 * do site — por isso são DESCOBERTAS a cada execução, e não fixadas no código:
 *
 *   moduleVersion  GET /moduleservices/moduleversioninfo
 *   apiVersion     está no .js da tela, cujo caminho vem de /moduleservices/moduleinfo
 *
 * Sem o cabeçalho X-CSRFToken a chamada volta "Invalid Login".
 */
import path from 'path';
import fs from 'fs';

const BASE = 'https://sistemas.df.gov.br/SISCONEPCIDADAO';
const HOST = 'https://sistemas.df.gov.br';
const DEST_DIR = path.join('data', 'estados');
const ANOS = (process.env.ANOS ?? '2025,2026').split(',').map(Number).filter(Boolean);

/** Um ano do DF tem centenas de emendas; o teto evita paginar. */
const MAX_RECORDS = 100_000;
const TIMEOUT_MS = 120_000;

async function buscar(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

/** As duas versões que o OutSystems exige, lidas do site na hora. */
async function descobrirVersoes(): Promise<{ moduleVersion: string; apiVersion: string }> {
  const info = await (await buscar(`${BASE}/moduleservices/moduleversioninfo`)).json();
  const moduleVersion = info?.versionToken;
  if (!moduleVersion) throw new Error('moduleversioninfo não trouxe versionToken');

  // O caminho do .js da tela leva um hash que muda a cada publicação.
  const manifesto = await (await buscar(`${BASE}/moduleservices/moduleinfo?${Date.now()}`)).text();
  const caminho = manifesto.match(
    /"([^"]*SISCONEPCidadao\.MainFlow\.Emendas\.mvc\.js)":"(\?[^"]+)"/);
  if (!caminho) throw new Error('moduleinfo não trouxe o .js da tela de emendas');

  const js = await (await buscar(HOST + caminho[1] + caminho[2])).text();
  const api = js.match(/"DataActionGetEmendas",\s*"[^"]+",\s*"([^"]+)"/);
  if (!api) throw new Error('não achei a apiVersion de DataActionGetEmendas no .js da tela');

  return { moduleVersion, apiVersion: api[1] };
}

async function baixarAno(ano: number, versoes: { moduleVersion: string; apiVersion: string }) {
  const res = await buscar(
    `${BASE}/screenservices/SISCONEPCidadao/MainFlow/Emendas/DataActionGetEmendas`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
        // Vazio mesmo: sem o cabeçalho presente, a resposta é "Invalid Login".
        'X-CSRFToken': '',
      },
      body: JSON.stringify({
        versionInfo: versoes,
        viewName: 'MainFlow.Emendas',
        screenData: {
          variables: {
            TableSort: '',
            StartIndex: 0,
            MaxRecords: MAX_RECORDS,
            // Filtro vazio = o ano inteiro. O ano NÃO entra aqui: vai em
            // clientVariables, que é onde a tela guarda o exercício.
            Filtro: {
              NrEmenda: '', ParlamentarId: '0', UnidadeOrcamentaria: '',
              StatusEmenda: '', Subtitulo: '', LeiId: '0', IsImpositiva: false,
            },
          },
        },
        clientVariables: {
          Ano: ano, IsChangeYear: true, ScrollHeigth: 500, Parlamentar_Filter: '0',
        },
      }),
    },
  );

  const texto = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${texto.slice(0, 200)}`);

  let json: any;
  try { json = JSON.parse(texto); } catch { throw new Error(`resposta não é JSON: ${texto.slice(0, 200)}`); }
  if (json?.exception) throw new Error(`o site recusou: ${json.exception.message}`);

  // ListAux é a lista completa e detalhada — tem o Id real da emenda, a
  // natureza e a unidade gestora. `List` é a página exibida na tela e volta
  // vazia nesta chamada; `Relatorio` traz os mesmos registros, mas com Id "0".
  const lista = json?.data?.ListAux?.List;
  if (!Array.isArray(lista) || lista.length === 0) {
    const chaves = Object.keys(json?.data ?? {}).join(', ');
    throw new Error(`sem registros em data.ListAux.List (chaves recebidas: ${chaves})`);
  }

  return { json, total: lista.length, contagem: json?.data?.Count };
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });
  console.log(`Anos a baixar: ${ANOS.join(', ')}`);

  console.log('Descobrindo as versões do site…');
  const versoes = await descobrirVersoes();
  console.log(`  moduleVersion=${versoes.moduleVersion}  apiVersion=${versoes.apiVersion}`);

  const resultados: { ano: number; ok: boolean; total?: number; erro?: string }[] = [];

  for (const ano of ANOS) {
    const destino = path.join(DEST_DIR, `Emendas_DF_${ano}.json`);
    try {
      const { json, total, contagem } = await baixarAno(ano, versoes);
      fs.writeFileSync(destino, JSON.stringify(json));
      const kb = (fs.statSync(destino).size / 1024).toFixed(0);
      console.log(`[${ano}] ✓ ${destino} (${kb} KB, ${total} registros${
        contagem != null && contagem !== total ? `, o site diz ${contagem}` : ''})`);
      resultados.push({ ano, ok: true, total });
    } catch (e) {
      const erro = e instanceof Error ? e.message : String(e);
      console.error(`[${ano}] ✗ ${erro}`);
      resultados.push({ ano, ok: false, erro });
    }
  }

  console.log('\n=== Resumo ===');
  for (const r of resultados) {
    console.log(`  ${r.ano}: ${r.ok ? `✓ ${r.total} registros` : `✗ ${r.erro}`}`);
  }

  if (resultados.some(r => !r.ok)) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
