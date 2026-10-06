// Gera o índice do que existe em public/data/tse.
//
// Necessário porque a leitura passou de disco para HTTP: dá para BUSCAR um
// arquivo pela rede, mas não para listar o conteúdo de uma pasta. O manifesto
// é pequeno (poucos KB) e viaja dentro da função, ao contrário dos dados.
//
//   node scripts/gerar-manifesto-tse.mjs
// Rode sempre que acrescentar ou remover anos/UFs da base.

import fs from 'fs';
import path from 'path';

const BASE = path.join(process.cwd(), 'public', 'data', 'tse');
const SAIDA = path.join(process.cwd(), 'lib', 'tse-manifesto.json');

const porUf = {};
const locais = [];
// 2º turno: {ano}/t2/{UF}.json.gz — anos e UFs que tiveram (governador,
// presidente, prefeito de cidade grande).
const turno2 = {};
// Votos por local de votação: secao/{ano}/{turno}/{UF}/{MUNICIPIO}.json.gz.
// Guarda ano → turno → UFs; o município se descobre buscando o arquivo.
const secao = {};

for (const dir of fs.readdirSync(BASE)) {
  const cheio = path.join(BASE, dir);
  if (!fs.statSync(cheio).isDirectory()) continue;

  if (dir === 'secao') {
    for (const ano of fs.readdirSync(cheio)) {
      for (const turno of fs.readdirSync(path.join(cheio, ano))) {
        const ufs = fs.readdirSync(path.join(cheio, ano, turno)).filter(u => /^[A-Z]{2}$/.test(u)).sort();
        if (ufs.length) ((secao[ano] ??= {})[turno] = ufs);
      }
    }
    continue;
  }

  if (dir === 'locais') {
    for (const arq of fs.readdirSync(cheio)) {
      const sigla = arq.replace(/\.json(\.gz)?$/i, '').toUpperCase();
      if (/^[A-Z]{2}$/.test(sigla)) locais.push(sigla);
    }
    continue;
  }

  if (!/^\d{4}$/.test(dir)) continue;
  const ano = Number(dir);
  for (const arq of fs.readdirSync(cheio)) {
    if (arq === 't2') {
      turno2[ano] = fs.readdirSync(path.join(cheio, arq))
        .map(a => a.replace(/\.json(\.gz)?$/i, '').toUpperCase())
        .filter(u => /^[A-Z]{2}$/.test(u)).sort();
      continue;
    }
    const sigla = arq.replace(/\.json(\.gz)?$/i, '').toUpperCase();
    if (!/^[A-Z]{2}$/.test(sigla)) continue;
    (porUf[sigla] ??= []).push(ano);
  }
}

for (const uf of Object.keys(porUf)) porUf[uf].sort((a, b) => b - a);
locais.sort();

const manifesto = { geradoEm: new Date().toISOString().slice(0, 10), anosPorUf: porUf, locais, turno2, secao };
fs.writeFileSync(SAIDA, JSON.stringify(manifesto, null, 2) + '\n');

const kb = (fs.statSync(SAIDA).size / 1024).toFixed(1);
console.log(`${SAIDA} — ${kb} KB`);
console.log(`  UFs: ${Object.keys(porUf).length} · anos: ${[...new Set(Object.values(porUf).flat())].sort().join(', ')} · locais: ${locais.length}`);
