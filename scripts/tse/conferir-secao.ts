/**
 * Confere os votos por local de votação contra o total oficial de cada
 * candidato (arquivo por zona). Rodar depois de importar-secao.sh.
 *
 *   npx tsx scripts/tse/conferir-secao.ts --ano 2026 [--turno 2]
 *
 * Compara município a município: nas eleições municipais o mesmo número
 * (Prefeito 13, Vereador 13000) existe em milhares de cidades.
 *
 * Diferença esperada e aceitável: candidato com votos ANULADOS (sub judice,
 * indeferido) — o total por zona conta só os válidos, a seção conta todos.
 */
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

const arg = (f: string, d = '') => { const i = process.argv.indexOf(f); return i !== -1 ? process.argv[i + 1] : d; };
const ANO = arg('--ano');
const TURNO = arg('--turno', '1');
const BASE = path.join(process.cwd(), 'public', 'data', 'tse');
const ler = (p: string) => JSON.parse(zlib.gunzipSync(fs.readFileSync(p)).toString('utf8'));
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
// Igual a nomeArquivoMunicipio (lib/tse-static.ts).
const arqMun = (m: string) => m.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/['’`´]/g, ' ').replace(/\s+/g, ' ').trim();

const dirSecao = path.join(BASE, 'secao', ANO, TURNO);
if (!fs.existsSync(dirSecao)) { console.log(`Sem votos por local em ${ANO}, turno ${TURNO}.`); process.exit(0); }

let ufsOk = 0, ufsComDiferenca = 0;
for (const uf of fs.readdirSync(dirSecao).sort()) {
  const arqCand = path.join(BASE, ANO, ...(TURNO === '1' ? [] : ['t2']), `${uf}.json.gz`);
  if (!fs.existsSync(arqCand)) { console.log(`${uf}: sem arquivo de candidatos para comparar`); continue; }
  const candidatos: any[] = ler(arqCand);

  // Soma de cada candidato (município + nome do cargo + número).
  const soma = new Map<string, number>();
  let locais = 0, semCoord = 0;
  for (const f of fs.readdirSync(path.join(dirSecao, uf))) {
    const d = ler(path.join(dirSecao, uf, f));
    locais += d.locais.length;
    semCoord += d.locais.filter((l: any) => l.lat == null).length;
    for (const [chave, lista] of Object.entries(d.votos as Record<string, Array<[number, number]>>)) {
      const [cd, nr] = chave.split(':');
      const k = `${f.replace(/.json.gz$/, '')}|${norm(d.cargos[cd] ?? cd)}:${nr}`;
      soma.set(k, (soma.get(k) ?? 0) + lista.reduce((s, [, v]) => s + v, 0));
    }
  }

  const difs: string[] = [];
  let iguais = 0, comparados = 0;
  for (const c of candidatos) {
    if (!c.totalVotos || c.numero == null) continue;
    comparados++;
    const oficial = new Map<string, number>();
    for (const z of c.zonas ?? []) oficial.set(arqMun(z.municipio), (oficial.get(arqMun(z.municipio)) ?? 0) + z.votos);
    const erradas = [...oficial].filter(([m, v]) => (soma.get(`${m}|${norm(c.cargo)}:${c.numero}`) ?? 0) !== v);
    if (erradas.length === 0) iguais++;
    else difs.push(`${c.nomeUrna} (${c.cargo} ${c.numero}): ` + erradas.slice(0, 2).map(([m, v]) =>
      `${m} oficial ${v} × locais ${soma.get(`${m}|${norm(c.cargo)}:${c.numero}`) ?? 0}`).join('; '));
  }
  const pct = comparados ? (iguais / comparados * 100).toFixed(1) : '—';
  console.log(`${uf}: ${iguais}/${comparados} candidatos batem (${pct}%) · ${locais} locais, ${semCoord} sem coordenada`);
  difs.slice(0, 4).forEach(d => console.log(`    ≠ ${d}`));
  if (difs.length) ufsComDiferenca++; else ufsOk++;
}
console.log(`\n${ANO} turno ${TURNO}: ${ufsOk} UFs exatas, ${ufsComDiferenca} com alguma diferença`);
