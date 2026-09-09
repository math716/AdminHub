/**
 * Baixa a base aberta de emendas de São Paulo.
 * Uso: npx tsx scripts/download-emendas-sp.ts [--forcar]
 *
 * Fonte: https://www.transparencia.sp.gov.br/EmendasParlamentares/Concedidas
 *        (link "Dados Abertos" → emendas.zip)
 *
 * Substitui o download pelo painel do Power BI, que exigia abrir o Chromium e
 * clicar em "Baixar os dados". Além de frágil, o painel publicava um conjunto
 * DIFERENTE do portal da transparência: conferido em setembro de 2026, o
 * deputado Gilmaci Santos aparecia no sistema com 12 emendas em 2026 (R$ 13,2 M)
 * contra 5 no portal (R$ 4,8 M) — sete códigos que não existem na base oficial.
 *
 * O ZIP tem 2 MB e traz um CSV de 57 MB com 2019 a 2026 numa tacada.
 *
 * Só baixa se mudou: o servidor manda ETag e responde 304 quando o arquivo é o
 * mesmo. O estado fica em .sp-estado.json, guardado entre execuções pelo cache
 * do GitHub Actions.
 */
import path from 'path';
import fs from 'fs';
import zlib from 'zlib';

const URL_ZIP = 'https://www.transparencia.sp.gov.br/Dados%20Abertos/Emendas/emendas.zip';
const DEST_DIR = path.join('data', 'estados');
const DEST_CSV = path.join(DEST_DIR, 'sp-emendas.csv');
const ESTADO = path.join(DEST_DIR, '.sp-estado.json');
const TIMEOUT_MS = 300_000;

/** O portal recusa alguns clientes automatizados; um User-Agent de navegador passa. */
const CABECALHOS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 '
    + '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
  'Accept-Language': 'pt-BR,pt;q=0.9',
};

const FORCAR = process.env.FORCAR === '1' || process.argv.includes('--forcar');

/**
 * Extrai o primeiro arquivo do ZIP.
 *
 * O formato é simples o bastante para não valer uma dependência nova, mas tem
 * uma pegadinha: este ZIP é gravado com "descritor de dados" (bit 3 das flags),
 * e nesse modo o tamanho no cabeçalho local vem ZERADO — quem tenta ler dali
 * descomprime zero byte e recebe "unexpected end of file".
 *
 * Os tamanhos verdadeiros estão no diretório central, no fim do arquivo. É de
 * lá que lemos, entrando pelo registro EOCD.
 */
function primeiroDoZip(buf: Buffer): { nome: string; conteudo: Buffer } {
  if (buf.readUInt32LE(0) !== 0x04034b50) throw new Error('não parece um ZIP');

  // EOCD: assinatura 0x06054b50, procurada do fim para o começo.
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('ZIP sem diretório central');

  const central = buf.readUInt32LE(eocd + 16);
  if (buf.readUInt32LE(central) !== 0x02014b50) throw new Error('diretório central inválido');

  const metodo = buf.readUInt16LE(central + 10);
  const tamComprimido = buf.readUInt32LE(central + 20);
  const nomeTam = buf.readUInt16LE(central + 28);
  const nome = buf.subarray(central + 46, central + 46 + nomeTam).toString('utf8');
  const local = buf.readUInt32LE(central + 42);

  // No cabeçalho local, só os tamanhos de nome e extra são confiáveis — e
  // podem diferir dos do diretório central, então são lidos de lá mesmo.
  const inicio = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
  const dados = buf.subarray(inicio, inicio + tamComprimido);

  if (metodo === 0) return { nome, conteudo: dados };
  if (metodo === 8) return { nome, conteudo: zlib.inflateRawSync(dados) };
  throw new Error(`método de compressão ${metodo} não suportado`);
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });

  let visto: { etag?: string; em?: string } = {};
  try { visto = JSON.parse(fs.readFileSync(ESTADO, 'utf8')); } catch { /* primeira vez */ }

  const cabecalhos = { ...CABECALHOS };
  if (!FORCAR && visto.etag && fs.existsSync(DEST_CSV)) cabecalhos['If-None-Match'] = visto.etag;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(URL_ZIP, { headers: cabecalhos, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }

  if (res.status === 304) {
    console.log(`Nada mudou no portal desde ${visto.em?.slice(0, 10)} — não há o que importar.`);
    if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'mudou=false\n');
    return;
  }
  if (!res.ok) throw new Error(`o portal respondeu ${res.status}`);

  const zip = Buffer.from(await res.arrayBuffer());
  const { nome, conteudo } = primeiroDoZip(zip);
  if (conteudo.length < 1_000_000) {
    throw new Error(`o CSV veio com ${conteudo.length} bytes — pequeno demais para a base inteira`);
  }
  fs.writeFileSync(DEST_CSV, conteudo);

  fs.writeFileSync(ESTADO, JSON.stringify({
    etag: res.headers.get('etag') ?? undefined,
    em: new Date().toISOString(),
  }, null, 1));

  const linhas = conteudo.toString('latin1').split('\n').length - 1;
  console.log(`✓ ${DEST_CSV} — ${(conteudo.length / 1024 / 1024).toFixed(1)} MB, `
    + `${linhas.toLocaleString('pt-BR')} linhas (de ${nome} no ZIP)`);
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, 'mudou=true\n');
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
