import * as fs from 'fs';
import { parse } from 'csv/sync';

const text = fs.readFileSync('data/estados/AL-EMENDAS.csv', 'utf-8').replace(/^﻿/, '');

const records: Record<string, string>[] = parse(text, {
  columns: true,
  skip_empty_lines: true,
  relax_quotes: true,
  relax_column_count: true,
  trim: true,
});

console.log(`Total de linhas: ${records.length}`);

const anos = [...new Set(records.map((r) => r['ano']))].filter(Boolean).sort();
console.log(`Anos: ${anos.join(', ')}`);

const parlamentares = new Set(records.map((r) => r['parlamentar']).filter((v) => v && v.trim() && v !== '-'));
console.log(`Parlamentares únicos: ${parlamentares.size}`);
if (parlamentares.size <= 60) console.log([...parlamentares].sort().join('\n'));

const municipios = new Set(records.map((r) => r['municipio']).filter((v) => v && v.trim() && v !== '-'));
console.log(`\nMunicípios únicos: ${municipios.size}`);

const semParlamentar = records.filter((r) => !r['parlamentar']?.trim() || r['parlamentar'] === '-').length;
const semMunicipio = records.filter((r) => !r['municipio']?.trim() || r['municipio'] === '-').length;
console.log(`Sem parlamentar: ${semParlamentar}`);
console.log(`Sem município: ${semMunicipio}`);

const ids = records.map((r) => r['codigo_identificador_emenda']).filter(Boolean);
const uniqIds = new Set(ids).size;
console.log(`\nIDs únicos: ${uniqIds} de ${ids.length}`);

const ex = records.find((r) => r['parlamentar']?.trim() && r['parlamentar'] !== '-' && r['municipio']?.trim() && r['municipio'] !== '-');
if (ex) {
  console.log('\nExemplo:');
  ['parlamentar', 'partido', 'municipio', 'ano', 'codigo_identificador_emenda', 'modalidade', 'funcao', 'valor_emenda', 'valor_empenhado', 'valor_liquidado', 'valor_pago', 'objeto_despesa'].forEach((k) => {
    console.log(`  ${k}: ${ex[k]}`);
  });
}
