/**
 * Votos de PRESIDENTE por cidade, do Brasil inteiro, num arquivo só.
 *
 * Para "a cidade do Brasil onde Lula teve mais votos", a Gabi teria de abrir
 * os 27 arquivos do ano — SP/2018 sozinho ocupa 428 MB de heap. Este arquivo
 * traz só os presidenciáveis, cidade a cidade (~100 KB), e é buscado por HTTP
 * como o resto da base (não entra no pacote da função).
 *
 * Uso:  NODE_OPTIONS=--max-old-space-size=8192 \
 *       npx tsx scripts/tse/gerar-presidente-municipios.ts [ano...]
 *       (sem argumentos: 2018, 2022 e 2026; turno 2 onde houver {ano}/t2/)
 *
 * Saída: public/data/tse/presidente-municipios/{ano}-t{turno}.json.gz
 *   { ano, turno, candidatos: [{nomeUrna, nome, numero, partido, situacao, totalVotos}],
 *     municipios: [[uf, nome, votosCand0, votosCand1, ...]] }
 * Confere: a soma das cidades + exterior (ZZ) tem de bater com o total do BR.json.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const BASE = path.join(process.cwd(), 'public', 'data', 'tse');
const DEST = path.join(BASE, 'presidente-municipios');
const UFS = ['AC', 'AL', 'AM', 'AP', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MG', 'MS', 'MT', 'PA', 'PB',
  'PE', 'PI', 'PR', 'RJ', 'RN', 'RO', 'RR', 'RS', 'SC', 'SE', 'SP', 'TO'];

const ler = (fp: string): any[] => JSON.parse(zlib.gunzipSync(fs.readFileSync(fp)).toString('utf8'));

function gerar(ano: string, turno: 1 | 2): boolean {
  const dir = turno === 2 ? path.join(BASE, ano, 't2') : path.join(BASE, ano);
  const brFp = path.join(dir, 'BR.json.gz');
  if (!fs.existsSync(brFp)) { console.log(`${ano} t${turno}: sem BR.json.gz — pulando`); return true; }

  const br = ler(brFp).filter(c => c.cargo === 'Presidente').sort((a, b) => b.totalVotos - a.totalVotos);
  const candidatos = br.map(c => ({
    nomeUrna: c.nomeUrna, nome: c.nome, numero: c.numero, partido: c.partido,
    situacao: c.situacao, totalVotos: c.totalVotos,
  }));
  const idx = new Map<number, number>(br.map((c, i) => [c.numero, i]));
  const soma = new Array(br.length).fill(0);
  const municipios: Array<[string, string, ...number[]]> = [];

  for (const uf of UFS) {
    const fp = path.join(dir, `${uf}.json.gz`);
    if (!fs.existsSync(fp)) { console.warn(`  ! ${ano} t${turno}: falta ${uf}`); return false; }
    const pres = ler(fp).filter(c => c.cargo === 'Presidente');
    const porCidade = new Map<string, number[]>();
    for (const c of pres) {
      const i = idx.get(c.numero);
      if (i === undefined) { console.warn(`  ! ${uf}: presidente ${c.numero} fora do BR`); return false; }
      for (const [mun, v] of Object.entries(c.votos ?? {}) as Array<[string, number]>) {
        const linha = porCidade.get(mun) ?? new Array(br.length).fill(0);
        linha[i] += v;
        soma[i] += v;
        porCidade.set(mun, linha);
      }
    }
    for (const [mun, v] of [...porCidade.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
      municipios.push([uf, mun, ...v]);
    }
  }

  // Cidades + exterior = total nacional, candidato a candidato.
  let ok = true;
  br.forEach((c, i) => {
    const exterior = c.votosPorEstado?.ZZ ?? 0;
    if (soma[i] + exterior !== c.totalVotos) {
      ok = false;
      console.warn(`  ! ${c.nomeUrna}: cidades ${soma[i]} + exterior ${exterior} ≠ total ${c.totalVotos}`);
    }
  });
  if (!ok) return false;

  fs.mkdirSync(DEST, { recursive: true });
  const saida = path.join(DEST, `${ano}-t${turno}.json.gz`);
  fs.writeFileSync(saida, zlib.gzipSync(Buffer.from(JSON.stringify({ ano: Number(ano), turno, candidatos, municipios }), 'utf8'), { level: 9 }));
  console.log(`${ano} t${turno}: ${municipios.length} cidades, ${br.length} candidatos, ${(fs.statSync(saida).size / 1024).toFixed(0)} KB — confere com o total nacional`);
  return true;
}

const anos = process.argv.slice(2).filter(a => /^\d{4}$/.test(a));
let falhou = false;
for (const ano of anos.length ? anos : ['2018', '2022', '2026']) {
  if (!gerar(ano, 1)) falhou = true;
  if (fs.existsSync(path.join(BASE, ano, 't2')) && !gerar(ano, 2)) falhou = true;
}
if (falhou) { console.error('Houve divergência — nada acima marcado com ! foi gravado.'); process.exit(1); }
