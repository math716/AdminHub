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
 * Saída: public/data/tse/<ano>/_index.json.gz
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const BASE = path.join(process.cwd(), 'public', 'data', 'tse');

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

function gerarAno(ano: string): void {
  const ufs = ufsDoAno(ano);
  if (ufs.length === 0) { console.log(`${ano}: nenhuma UF — pulando`); return; }

  const entradas: EntradaIndice[] = [];
  for (const uf of ufs) {
    // Um estado por vez, descartado logo em seguida: manter os 27 em memória
    // é o que estourava o heap.
    const data = lerUf(ano, uf);
    if (!data) continue;
    for (const c of data) {
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
    process.stdout.write(`\r${ano}: ${uf} — ${entradas.length} candidatos indexados   `);
  }

  const destino = path.join(BASE, ano, '_index.json.gz');
  const buf = zlib.gzipSync(Buffer.from(JSON.stringify(entradas), 'utf8'), { level: 9 });
  fs.writeFileSync(destino, buf);
  console.log(`\r${ano}: ${entradas.length} candidatos → ${path.relative(process.cwd(), destino)} (${(buf.length / 1024 / 1024).toFixed(1)} MB)   `);
}

const alvos = process.argv.slice(2).filter(a => /^\d{4}$/.test(a));
for (const ano of (alvos.length > 0 ? alvos : anosDisponiveis())) gerarAno(ano);
