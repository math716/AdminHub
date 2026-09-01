/**
 * Baixa as planilhas de emendas de Minas Gerais do portal da ALMG.
 * Uso: npx tsx scripts/download-emendas-mg.ts
 *
 * Só baixa o que mudou.
 *
 * O portal serve os arquivos com ETag e Last-Modified, e respeita requisição
 * condicional: mandando o ETag da última vez, ele responde 304 sem corpo. É o
 * que evita baixar 9 MB e reescrever milhares de linhas no banco por nada — a
 * planilha de MG é atualizada de tempos em tempos, não toda semana.
 *
 * O estado (o ETag de cada arquivo) fica em .mg-estado.json, guardado entre as
 * execuções pelo cache do GitHub Actions. Se o cache sumir, o pior que
 * acontece é uma importação a mais: o import é idempotente.
 *
 * Os endereços NÃO estão fixos no código. O caminho no portal carrega o ano e
 * um nome ("/dados-emendas/2026_Marcel/"), então muda — os links são lidos da
 * própria página de transparência a cada execução.
 *
 * Saída para o workflow: `mudou=true|false` em $GITHUB_OUTPUT, para o passo de
 * importar rodar só quando houver o que importar.
 */
import path from 'path';
import fs from 'fs';

const PAGINA = 'https://www.emendas.mg.gov.br/transparencia/';
const DEST_DIR = path.join('data', 'estados');
const ESTADO = path.join(DEST_DIR, '.mg-estado.json');
const TIMEOUT_MS = 300_000;

/**
 * Primeiro ano que interessa.
 *
 * O portal serve duas planilhas: 2023 em diante e 2022 para trás. A antiga
 * tem OUTRO layout de colunas — o importador lê as 30 mil linhas dela e
 * mapeia zero. Como o gabinete só acompanha de 2023 em diante, ela fica de
 * fora, em vez de o workflow baixar 4,6 MB para importar nada.
 *
 * Os anos saem do NOME do arquivo ("DADOS_EMENDAS_2023_2024_2025_2026.xlsx"),
 * e não de uma lista fixa: quando MG publicar 2027, ele entra sozinho.
 */
const ANO_MINIMO = Number(process.env.ANO_MINIMO ?? 2023);

/** Baixa tudo de novo, ignorando o que já foi visto. */
const FORCAR = process.env.FORCAR === '1' || process.argv.includes('--forcar');

interface Visto { etag?: string; lastModified?: string; tamanho?: number; em: string }

async function buscar(url: string, init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal, redirect: 'follow' });
  } finally {
    clearTimeout(t);
  }
}

function lerEstado(): Record<string, Visto> {
  try { return JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { return {}; }
}

/** Os .xlsx que a página de transparência oferece, na ordem em que aparecem. */
async function descobrirArquivos(): Promise<{ url: string; nome: string }[]> {
  const res = await buscar(PAGINA);
  if (!res.ok) throw new Error(`a página de transparência respondeu ${res.status}`);
  const html = await res.text();

  const data = html.match(/Data de atualiza[^:]*:\s*([0-9]{2}\/[0-9]{2}\/[0-9]{4})/);
  if (data) console.log(`O portal declara atualização em ${data[1]}.`);

  const urls = [...new Set(
    [...html.matchAll(/https?:\/\/[^"'\s)]+\.xlsx/gi)].map(m => m[0]))];
  if (urls.length === 0) throw new Error('nenhum .xlsx encontrado na página de transparência');

  // Espaco no nome quebraria o laco do workflow, que separa os caminhos por
  // espaco. O nome vem do portal, entao nao da para confiar que nunca tera um.
  const todos = urls.map(url => ({
    url,
    nome: decodeURIComponent(url.split('/').pop()!).replace(/\s+/g, '_'),
  }));

  const querido: { url: string; nome: string }[] = [];
  for (const a of todos) {
    const anos = [...a.nome.matchAll(/(19|20)\d{2}/g)].map(m => Number(m[0]));
    if (anos.length === 0) {
      // Nome sem ano: não dá para saber o que é. Entra, e o passo de importar
      // dirá quantas linhas aproveitou — melhor do que perder dado calado.
      console.log(`  ${a.nome} — sem ano no nome, baixando por precaução.`);
      querido.push(a);
    } else if (anos.some(n => n >= ANO_MINIMO)) {
      querido.push(a);
    } else {
      console.log(`  ${a.nome} — só tem anos anteriores a ${ANO_MINIMO}, ignorando.`);
    }
  }
  return querido;
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });

  const arquivos = await descobrirArquivos();
  console.log(`${arquivos.length} planilha(s) no portal:`);
  for (const a of arquivos) console.log(`  ${a.nome}`);

  const estado = lerEstado();
  if (FORCAR) console.log('\nModo forçado: baixando tudo, sem olhar o que já foi visto.');

  let mudou = false;
  const baixados: string[] = [];

  for (const { url, nome } of arquivos) {
    const destino = path.join(DEST_DIR, nome);
    const visto = FORCAR ? undefined : estado[url];

    // Pergunta antes de baixar: mudou desde a última vez? O servidor responde
    // 304 e encerra o assunto sem mandar os 9 MB.
    const cabecalhos: Record<string, string> = {};
    if (visto?.etag) cabecalhos['If-None-Match'] = visto.etag;
    else if (visto?.lastModified) cabecalhos['If-Modified-Since'] = visto.lastModified;

    const res = await buscar(url, { headers: cabecalhos });

    if (res.status === 304 && fs.existsSync(destino)) {
      console.log(`\n[${nome}] sem alteração desde ${visto?.em?.slice(0, 10)} — pulando.`);
      continue;
    }
    // 304 com o arquivo ausente (cache do Actions veio sem os arquivos):
    // precisa baixar de novo, sem condicional.
    const resposta = res.status === 304 ? await buscar(url) : res;
    if (!resposta.ok) {
      throw new Error(`[${nome}] o portal respondeu ${resposta.status}`);
    }

    const buf = Buffer.from(await resposta.arrayBuffer());
    if (buf.length < 10_000) {
      throw new Error(`[${nome}] veio pequeno demais (${buf.length} bytes) — não parece a planilha`);
    }
    fs.writeFileSync(destino, buf);

    estado[url] = {
      etag: resposta.headers.get('etag') ?? undefined,
      lastModified: resposta.headers.get('last-modified') ?? undefined,
      tamanho: buf.length,
      em: new Date().toISOString(),
    };
    mudou = true;
    baixados.push(destino);
    console.log(`\n[${nome}] ✓ ${(buf.length / 1024 / 1024).toFixed(1)} MB`
      + (estado[url].lastModified ? ` (o portal diz: ${estado[url].lastModified})` : ''));
  }

  fs.writeFileSync(ESTADO, JSON.stringify(estado, null, 1));

  console.log('\n=== Resumo ===');
  if (mudou) {
    console.log(`  ${baixados.length} planilha(s) baixada(s):`);
    for (const b of baixados) console.log(`    ${b}`);
  } else {
    console.log('  Nada mudou no portal desde a última execução — não há o que importar.');
  }

  // O workflow lê isto para decidir se roda o import.
  if (process.env.GITHUB_OUTPUT) {
    // Barra normal sempre: quem le e o shell do runner, que e Linux.
    const paraShell = baixados.map(b => b.split(path.sep).join('/'));
    fs.appendFileSync(process.env.GITHUB_OUTPUT,
      `mudou=${mudou}\narquivos=${paraShell.join(' ')}\n`);
  }
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
