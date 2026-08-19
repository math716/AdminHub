/**
 * Gera o índice nacional de candidatos do TSE.
 *
 * Sem ele, achar alguém sem saber a UF exige abrir os 27 arquivos do ano
 * (~5s e centenas de MB de heap) — inviável numa função serverless. O índice
 * guarda só o que identifica a pessoa (nome, UF, cargo, partido, votos,
 * situação), sem os votos por município/zona, que são o grosso do peso.
 *
 * Uso:  npx tsx scripts/build-tse-index.mts [ano...]
 *       (sem argumentos, gera para todos os anos encontrados)
 *
 * Saída: public/data/tse-index/<ano>.json.gz
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const BASE = path.join(process.cwd(), 'public', 'data', 'tse');
// O índice mora FORA de BASE: ver comentário em lib/tse-static.ts (loadIndice).
const DEST = path.join(process.cwd(), 'public', 'data', 'tse-index');

/** Registro enxuto — chaves curtas porque isto se repete centenas de milhares de vezes. */
interface EntradaIndice {
  u: string; // uf
  n: string; // nomeUrna
  c: string; // nome civil
  g: string; // cargo
  p: string; // partido
  v: number; // totalVotos
  s: string; // situacao
}

function anosDisponiveis(): string[] {
  return fs.readdirSync(BASE).filter(d => /^\d{4}$/.test(d)).sort();
}

function ufsDoAno(ano: string): string[] {
  return fs.readdirSync(path.join(BASE, ano))
    .map(f => f.replace(/\.json(\.gz)?$/i, ''))
    .filter(s => /^[A-Z]{2}$/.test(s) && s !== 'BR')
    .sort();
}

function lerUf(ano: string, uf: string): any[] | null {
  const base = path.join(BASE, ano, uf);
  try {
    if (fs.existsSync(`${base}.json.gz`)) {
      return JSON.parse(zlib.gunzipSync(fs.readFileSync(`${base}.json.gz`)).toString('utf8'));
    }
    if (fs.existsSync(`${base}.json`)) {
      return JSON.parse(fs.readFileSync(`${base}.json`, 'utf8'));
    }
  } catch (e) {
    console.warn(`  ! falha ao ler ${ano}/${uf}: ${String(e).slice(0, 80)}`);
  }
  return null;
}

const norm = (t: string) => (t ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * O bundle da função na Vercel já vive perto do teto de 250 MB, então o índice
 * precisa ser enxuto. Anos de eleição municipal têm ~500 mil candidatos (quase
 * todos vereadores com poucas centenas de votos) e sozinhos custariam ~18 MB;
 * indexar só quem se elegeu derruba para ~2,5 MB. Quem é procurado pelo nome,
 * sem contexto, é justamente quem tem mandato. Anos gerais (deputados,
 * senadores, governadores) são pequenos e entram inteiros.
 */
const LIMIAR_MUNICIPAL = 150_000; // acima disto, é ano de eleição municipal

// Anos municipais ficam de FORA por padrão: a função de chat já ocupa ~246 MB
// dos 250 MB da Vercel, e nem indexando só os eleitos (2,5 MB) havia folga.
// Quem pergunta por nome sem dizer o estado quase sempre fala de deputado,
// senador ou governador — esses estão nos anos gerais, que custam 0,5 MB cada.
// Com mais espaço (VERCEL_SUPPORT_LARGE_FUNCTIONS=1), rode com --municipais.
const INCLUIR_MUNICIPAIS = process.argv.includes('--municipais');

function gerarAno(ano: string): void {
  const ufs = ufsDoAno(ano);
  if (ufs.length === 0) { console.log(`${ano}: nenhuma UF — pulando`); return; }

  // 1ª passada: quantos candidatos o ano tem, para decidir se filtra
  let total = 0;
  const porUf: Record<string, any[]> = {};
  for (const uf of ufs) {
    const data = lerUf(ano, uf);
    if (!data) continue;
    porUf[uf] = data;
    total += data.length;
    process.stdout.write(`\r${ano}: lendo ${uf} — ${total} candidatos   `);
  }
  const municipal = total > LIMIAR_MUNICIPAL;
  if (municipal && !INCLUIR_MUNICIPAIS) {
    const antigo = path.join(DEST, `${ano}.json.gz`);
    if (fs.existsSync(antigo)) fs.unlinkSync(antigo);
    console.log(`
${ano}: eleição municipal (${total} candidatos) — fora do índice por limite de tamanho   `);
    return;
  }
  const filtrar = municipal;

  const entradas: EntradaIndice[] = [];
  for (const uf of ufs) {
    for (const c of porUf[uf] ?? []) {
      // "eleito" precisa casar o INÍCIO: `includes` pegaria "NÃO ELEITO".
      if (filtrar && !/^eleito/.test(norm(c.situacao ?? ''))) continue;
      entradas.push({
        u: uf,
        n: c.nomeUrna ?? '',
        c: c.nome ?? '',
        g: c.cargo ?? '',
        p: c.partido ?? '',
        v: c.totalVotos ?? 0,
        s: c.situacao ?? '',
      });
    }
    delete porUf[uf]; // libera o estado já processado
  }
  if (filtrar) {
    process.stdout.write(`\r${ano}: eleição municipal — indexando só os ${entradas.length} eleitos de ${total}   `);
  }

  fs.mkdirSync(DEST, { recursive: true });
  const destino = path.join(DEST, `${ano}.json.gz`);
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(entradas), 'utf8'), { level: 9 });
  fs.writeFileSync(destino, buf);
  console.log(`\r${ano}: ${entradas.length} candidatos → ${path.relative(process.cwd(), destino)} (${(buf.length / 1024 / 1024).toFixed(1)} MB)   `);
}

const alvos = process.argv.slice(2).filter(a => /^\d{4}$/.test(a));
for (const ano of (alvos.length > 0 ? alvos : anosDisponiveis())) gerarAno(ano);
