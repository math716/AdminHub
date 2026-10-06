/**
 * TSE → votos REAIS por local de votação, por município.
 * =====================================================
 *
 * Antes, o voto "por bairro" era estimado: os votos do candidato na ZONA eram
 * divididos igualmente entre as seções da zona. Bairros da mesma zona saíam
 * fortes ou fracos pelo número de seções, não pelo desempenho real — e o pino
 * do bairro ficava na média das coordenadas das escolas, num ponto onde não
 * há escola nenhuma (caso da Mooca, out/2026).
 *
 * Este gerador cruza dois arquivos do TSE:
 *   votacao_secao_{ano}_{UF}.csv          votos de cada candidato em cada seção
 *   eleitorado_local_votacao_{ano}_{UF}.csv  local de cada seção: nome,
 *                                            endereço, bairro, coordenadas
 * e grava, por município e turno, cada local de votação com os votos de cada
 * candidato nele:
 *
 *   public/data/tse/secao/{ano}/{turno}/{UF}/{MUNICIPIO}.json.gz
 *   {
 *     locais: [{ z, l, n, e, b, lat, lng, s }],   // zona, nº local, nome,
 *                                                   // endereço, bairro, coord, seções
 *     cargos: { "<cd>": "<Deputado Estadual>" },
 *     votos:  { "<cd>:<numero>": [[iLocal, votos], ...] }
 *   }
 *
 * O candidato é identificado por cargo + número na urna: é o que existe em
 * todos os anos (SQ_CANDIDATO não vem nos arquivos antigos) e é único dentro
 * da eleição de um estado.
 *
 * USO:
 *   npx tsx scripts/tse/secao-to-json.ts --dir "C:\...\tse-downloads" --ano 2026 --ufs SP,DF
 *   (pastas esperadas: <dir>\secao\votacao_secao_{ano}_{UF}.csv e
 *    <dir>\locais\eleitorado_local_votacao_{ano}_{UF}.csv — ZIPs já extraídos)
 */

import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import readline from 'readline';

function arg(flag: string, def = ''): string {
  const i = process.argv.indexOf(flag);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

const DIR = path.resolve(arg('--dir', './tse-downloads'));
const ANO = arg('--ano');
const UFS = arg('--ufs').split(',').map(s => s.trim().toUpperCase()).filter(Boolean);
const SAIDA = path.join(process.cwd(), 'public', 'data', 'tse', 'secao', ANO);

if (!ANO || UFS.length === 0) {
  console.error('Informe --ano 2026 e --ufs SP,DF');
  process.exit(1);
}

/** Mesmo padrão dos arquivos por estado: maiúsculas, sem acento, apóstrofo vira espaço. */
function normText(s: string): string {
  return s.toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/['’`´]/g, ' ').replace(/\s+/g, ' ').trim();
}

function splitLine(line: string): string[] {
  const cols: string[] = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') inQ = !inQ;
    else if (c === ';' && !inQ) { cols.push(cur); cur = ''; }
    else cur += c;
  }
  cols.push(cur);
  return cols;
}

/** Lê um CSV do TSE linha a linha (latin1), sem carregar o arquivo inteiro. */
async function lerCsv(arquivo: string, onRow: (get: (col: string) => string) => void) {
  const rl = readline.createInterface({ input: fs.createReadStream(arquivo, { encoding: 'latin1' }), crlfDelay: Infinity });
  let idx: Record<string, number> | null = null;
  let n = 0;
  for await (const linha of rl) {
    if (!linha) continue;
    const cols = splitLine(linha);
    if (!idx) { idx = Object.fromEntries(cols.map((c, i) => [c.trim(), i])); continue; }
    const get = (col: string) => { const i = idx![col]; return i === undefined ? '' : (cols[i] ?? '').trim(); };
    onRow(get);
    if (++n % 2_000_000 === 0) process.stdout.write(`\r    ${(n / 1e6).toFixed(0)} mi linhas…`);
  }
  if (n >= 2_000_000) process.stdout.write('\n');
  return n;
}

/** Coordenada dentro do Brasil, ou null. O TSE usa -1 para "sem coordenada". */
function coord(v: string, min: number, max: number): number | null {
  if (!v) return null;
  const n = parseFloat(v.replace(',', '.'));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}
const lat = (v: string) => coord(v, -34, 6);
const lng = (v: string) => coord(v, -75, -28);

const PROPORCIONAIS = /deputado|vereador/i;

interface Local { z: number; l: string; n: string; e: string; b: string; lat: number | null; lng: number | null; s: number }

/**
 * Arquivo de locais da UF. Em 2026 o TSE separa por estado; em 2018 vem um
 * arquivo só para o país — aí ele é lido inteiro e filtrado pela UF.
 */
function arquivoDeLocais(uf: string): { arquivo: string; filtrarUf: boolean } | null {
  const porUf = path.join(DIR, 'locais', `eleitorado_local_votacao_${ANO}_${uf}.csv`);
  if (fs.existsSync(porUf)) return { arquivo: porUf, filtrarUf: false };
  for (const nome of [`eleitorado_local_votacao_${ANO}.csv`, `eleitorado_local_votacao_${ANO}_BRASIL.csv`]) {
    const p = path.join(DIR, 'locais', nome);
    if (fs.existsSync(p)) return { arquivo: p, filtrarUf: true };
  }
  return null;
}

async function processarUf(uf: string) {
  const fonteLocais = arquivoDeLocais(uf);
  const arqLocais = fonteLocais?.arquivo ?? '';
  const arqSecao = path.join(DIR, 'secao', `votacao_secao_${ANO}_${uf}.csv`);
  if (!fs.existsSync(arqSecao)) { console.log(`  [SKIP] ${uf} — falta ${path.basename(arqSecao)}`); return; }

  // 1) Locais: município → (zona-nºlocal) → dados do local. Uma linha por
  //    seção no arquivo do TSE; conta as seções e guarda a primeira coordenada
  //    válida (todas as seções do mesmo local têm a mesma).
  const locaisPorMun = new Map<string, Map<string, Local>>();
  if (fonteLocais) {
    console.log(`  locais: ${path.basename(arqLocais)}${fonteLocais.filtrarUf ? ` (filtrado por ${uf})` : ''}`);
    await lerCsv(arqLocais, get => {
      if (fonteLocais.filtrarUf && get('SG_UF') !== uf) return;
      if ((get('NR_TURNO') || '1') !== '1') return;   // os locais são os mesmos no 2º turno
      const mun = normText(get('NM_MUNICIPIO'));
      const chave = `${parseInt(get('NR_ZONA'), 10)}-${get('NR_LOCAL_VOTACAO')}`;
      let m = locaisPorMun.get(mun);
      if (!m) locaisPorMun.set(mun, m = new Map());
      const atual = m.get(chave);
      if (atual) { atual.s++; return; }
      m.set(chave, {
        z: parseInt(get('NR_ZONA'), 10), l: get('NR_LOCAL_VOTACAO'),
        n: get('NM_LOCAL_VOTACAO'), e: get('DS_ENDERECO'), b: normText(get('NM_BAIRRO')),
        lat: lat(get('NR_LATITUDE')), lng: lng(get('NR_LONGITUDE')), s: 1,
      });
    });
  } else {
    console.log(`  [AVISO] ${uf} — sem ${path.basename(arqLocais)}: locais só com nome/endereço da votação, sem coordenada`);
  }

  // 2) Votos: turno → município → candidato (cargo:número) → (zona-nºlocal) → votos
  type Acc = Map<string, Map<string, Map<string, number>>>;
  const porTurno = new Map<string, Acc>();
  const cargos = new Map<string, string>();
  console.log(`  votos: ${path.basename(arqSecao)}`);
  const linhas = await lerCsv(arqSecao, get => {
    // Só a eleição ordinária (CD_TIPO_ELEICAO 2). O TSE põe no arquivo do ano
    // as suplementares de depois (Senado-MT 2020 no de 2018; prefeitos de
    // 2021–2023 no de 2020), e o mesmo número somaria as duas eleições.
    const tipo = get('CD_TIPO_ELEICAO');
    if (tipo && tipo !== '2') return;
    const nr = get('NR_VOTAVEL');
    const cd = get('CD_CARGO');
    const dsCargo = get('DS_CARGO');
    const sq = get('SQ_CANDIDATO');
    // Só voto nominal em candidato: fora branco/nulo (95–98), e voto de
    // legenda (número de 2 dígitos em cargo proporcional). Onde o arquivo traz
    // SQ_CANDIDATO, ele decide (-1/-3 = não é candidato).
    if (sq) { if (!(parseInt(sq, 10) > 0)) return; }
    else {
      if (['95', '96', '97', '98'].includes(nr)) return;
      if (PROPORCIONAIS.test(dsCargo) && nr.length <= 2) return;
    }
    const votos = parseInt(get('QT_VOTOS'), 10);
    if (!(votos > 0)) return;
    cargos.set(cd, dsCargo);
    const turno = (get('NR_TURNO') || '1').replace(/^0+/, '') || '1';
    const mun = normText(get('NM_MUNICIPIO'));
    const local = `${parseInt(get('NR_ZONA'), 10)}-${get('NR_LOCAL_VOTACAO')}`;
    let t = porTurno.get(turno); if (!t) porTurno.set(turno, t = new Map());
    let m = t.get(mun); if (!m) t.set(mun, m = new Map());
    const cand = `${cd}:${nr}`;
    let c = m.get(cand); if (!c) m.set(cand, c = new Map());
    c.set(local, (c.get(local) ?? 0) + votos);

    // Local que não está no arquivo de locais (raro): entra só com o que a
    // votação informa, sem coordenada — não some.
    let lm = locaisPorMun.get(mun); if (!lm) locaisPorMun.set(mun, lm = new Map());
    if (!lm.has(local)) {
      lm.set(local, { z: parseInt(get('NR_ZONA'), 10), l: get('NR_LOCAL_VOTACAO'), n: get('NM_LOCAL_VOTACAO'),
        e: get('DS_LOCAL_VOTACAO_ENDERECO'), b: '', lat: null, lng: null, s: 0 });
    }
  });
  console.log(`  ${linhas.toLocaleString('pt-BR')} linhas de votação lidas`);

  // 3) Grava um arquivo por município e turno
  let arquivos = 0, bytes = 0;
  for (const [turno, muns] of porTurno) {
    const dir = path.join(SAIDA, turno, uf);
    fs.mkdirSync(dir, { recursive: true });
    for (const [mun, cands] of muns) {
      const lm = locaisPorMun.get(mun) ?? new Map<string, Local>();
      const chaves = [...lm.keys()];
      const pos = new Map(chaves.map((k, i) => [k, i]));
      const votos: Record<string, Array<[number, number]>> = {};
      for (const [cand, porLocal] of cands) {
        votos[cand] = [...porLocal.entries()]
          .filter(([k]) => pos.has(k))
          .map(([k, v]) => [pos.get(k)!, v] as [number, number]);
      }
      const corpo = { locais: chaves.map(k => lm.get(k)!), cargos: Object.fromEntries(cargos), votos };
      const gz = zlib.gzipSync(Buffer.from(JSON.stringify(corpo), 'utf8'), { level: 9 });
      fs.writeFileSync(path.join(dir, `${mun}.json.gz`), gz);
      arquivos++; bytes += gz.length;
    }
    console.log(`  → turno ${turno}: ${muns.size} municípios`);
  }
  console.log(`  ${uf} ${ANO}: ${arquivos} arquivos, ${(bytes / 1024 / 1024).toFixed(1)} MB`);
}

/**
 * Presidente: os votos por seção vêm num arquivo nacional à parte
 * (votacao_secao_{ano}_BR.csv), não nos dos estados. Lido UMA vez e somado aos
 * arquivos de município já gerados — rodar depois das UFs (`--presidente`).
 * Rodar duas vezes é seguro: o cargo é sobrescrito, não somado.
 */
async function processarPresidente() {
  const arq = path.join(DIR, 'secao', `votacao_secao_${ANO}_BR.csv`);
  if (!fs.existsSync(arq)) { console.log(`  [SKIP] presidente — falta ${path.basename(arq)}`); return; }
  // turno → UF → município → candidato → local → votos
  const acc = new Map<string, Map<string, Map<string, Map<string, Map<string, number>>>>>();
  const nomesLocal = new Map<string, { n: string; e: string }>();
  let cdPresidente = '1';
  console.log(`  presidente: ${path.basename(arq)}`);
  await lerCsv(arq, get => {
    // Só a linha que é mesmo de presidente: em 2026 o arquivo nacional saiu
    // antes do resultado presidencial, e qualquer outro cargo nele não pode
    // ser gravado como "Presidente".
    if (normText(get('DS_CARGO')) !== 'PRESIDENTE') return;
    const sq = get('SQ_CANDIDATO');
    if (sq && !(parseInt(sq, 10) > 0)) return;
    if (!sq && ['95', '96', '97', '98'].includes(get('NR_VOTAVEL'))) return;
    const votos = parseInt(get('QT_VOTOS'), 10);
    if (!(votos > 0)) return;
    const uf = get('SG_UF');
    if (!UFS.includes(uf)) return;
    cdPresidente = get('CD_CARGO') || cdPresidente;
    const turno = (get('NR_TURNO') || '1').replace(/^0+/, '') || '1';
    const mun = normText(get('NM_MUNICIPIO'));
    const local = `${parseInt(get('NR_ZONA'), 10)}-${get('NR_LOCAL_VOTACAO')}`;
    nomesLocal.set(`${uf}|${mun}|${local}`, { n: get('NM_LOCAL_VOTACAO'), e: get('DS_LOCAL_VOTACAO_ENDERECO') });
    const nivel = <K, V>(m: Map<K, V>, k: K, criar: () => V) => { let v = m.get(k); if (!v) m.set(k, v = criar()); return v; };
    const c = nivel(nivel(nivel(nivel(acc, turno, () => new Map()), uf, () => new Map()), mun, () => new Map()),
      `${get('CD_CARGO')}:${get('NR_VOTAVEL')}`, () => new Map<string, number>());
    c.set(local, (c.get(local) ?? 0) + votos);
  });

  let atualizados = 0;
  for (const [turno, ufs] of acc) {
    for (const [uf, muns] of ufs) {
      for (const [mun, cands] of muns) {
        const dir = path.join(SAIDA, turno, uf);
        const arquivo = path.join(dir, `${mun}.json.gz`);
        // 2º turno sem nenhum outro cargo no município: o arquivo nasce aqui.
        const corpo: any = fs.existsSync(arquivo)
          ? JSON.parse(zlib.gunzipSync(fs.readFileSync(arquivo)).toString('utf8'))
          : { locais: [], cargos: {}, votos: {} };
        const pos = new Map<string, number>(corpo.locais.map((l: Local, i: number) => [`${l.z}-${l.l}`, i]));
        corpo.cargos[cdPresidente] = 'Presidente';
        for (const k of Object.keys(corpo.votos)) if (k.startsWith(`${cdPresidente}:`)) delete corpo.votos[k];
        for (const [cand, porLocal] of cands) {
          corpo.votos[cand] = [...porLocal.entries()].map(([k, v]) => {
            if (!pos.has(k)) {
              const [z, l] = k.split('-');
              const nm = nomesLocal.get(`${uf}|${mun}|${k}`);
              corpo.locais.push({ z: Number(z), l, n: nm?.n ?? '', e: nm?.e ?? '', b: '', lat: null, lng: null, s: 0 });
              pos.set(k, corpo.locais.length - 1);
            }
            return [pos.get(k)!, v];
          });
        }
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(arquivo, zlib.gzipSync(Buffer.from(JSON.stringify(corpo), 'utf8'), { level: 9 }));
        atualizados++;
      }
    }
  }
  console.log(`  presidente: ${atualizados} arquivos de município atualizados`);
}

(async () => {
  console.log(`Votos por local de votação — ${ANO} — ${UFS.join(', ')}`);
  if (process.argv.includes('--presidente')) {
    await processarPresidente();
  } else {
    for (const uf of UFS) {
      console.log(`\n[${uf}]`);
      await processarUf(uf);
    }
  }
  console.log('\nConcluído.');
})();
