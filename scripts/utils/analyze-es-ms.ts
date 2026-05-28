import * as fs from 'fs';
import * as XLSX from 'xlsx';
import { parse } from 'csv/sync';

function parseCsvSemicolon(path: string): Record<string, string>[] {
  const text = fs.readFileSync(path, 'utf-8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true, delimiter: ';' });
}

function parseCsvQuoted(path: string): Record<string, string>[] {
  const text = fs.readFileSync(path, 'utf-8').replace(/^﻿/, '');
  return parse(text, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true, trim: true, delimiter: ';' });
}

// ─── ES ──────────────────────────────────────────────────────────────────────

console.log('\n========== ES ==========');
const esFiles = ['data/estados/ES-2024.csv', 'data/estados/ES-2025.csv', 'data/estados/ES-2026.csv'];
let esAll: Record<string, string>[] = [];
for (const f of esFiles) {
  const rows = parseCsvSemicolon(f);
  esAll = esAll.concat(rows);
  const comDesc = rows.filter((r) => r['DescricaoRegiaoBeneficiada']?.trim()).length;
  const comEmpenho = rows.filter((r) => parseFloat(r['ValorEmpenho']?.replace(',', '.') ?? '0') > 0).length;
  const comPago = rows.filter((r) => parseFloat(r['ValorPago']?.replace(',', '.') ?? '0') > 0).length;
  console.log(`${f}: ${rows.length} linhas | DescricaoRegiao preenchida: ${comDesc} | com empenho: ${comEmpenho} | com pago: ${comPago}`);
}
const esAnos = [...new Set(esAll.map((r) => r['AnoEmenda']))].sort();
const esAutores = new Set(esAll.map((r) => r['NomeAutor']).filter(Boolean)).size;
console.log(`Total ES: ${esAll.length} | anos: ${esAnos.join(', ')} | deputados: ${esAutores}`);
console.log('Exemplo NomeAutor:', esAll[0]?.['NomeAutor']);
console.log('Exemplo Id:', esAll[0]?.['Id']);
console.log('Exemplo Funcao:', esAll[5]?.['Funcao']);

// ─── MS XLSX ─────────────────────────────────────────────────────────────────

console.log('\n========== MS XLSX (2017-2023) ==========');
const wb = XLSX.readFile('data/estados/MS-2017 A 2023.xlsx');
console.log('Abas:', wb.SheetNames);
const ws = wb.Sheets[wb.SheetNames[0]];
const msXlsx: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
console.log(`Total linhas: ${msXlsx.length}`);
if (msXlsx[0]) console.log('Colunas:', Object.keys(msXlsx[0]).join(' | '));
const msAnos = [...new Set(msXlsx.map((r: any) => String(r['Ano'] ?? r['ano'] ?? r['ANO'] ?? r['exercicio'] ?? '')))].filter(Boolean).sort();
console.log('Anos:', msAnos.join(', '));
const ex = msXlsx.find((r: any) => Object.values(r).some((v) => String(v).toLowerCase().includes('dep') || String(v).match(/^\d{4}EM/)));
if (ex) console.log('Exemplo row:', JSON.stringify(ex).slice(0, 400));
else console.log('Primeiro row:', JSON.stringify(msXlsx[0]).slice(0, 400));

// ─── MS CSV ──────────────────────────────────────────────────────────────────

console.log('\n========== MS CSV ==========');
const msCsvFiles = ['data/estados/MS-2024.csv', 'data/estados/MS-2025.csv', 'data/estados/MS-2026.csv'];
for (const f of msCsvFiles) {
  const rows = parseCsvQuoted(f);
  const anos = [...new Set(rows.map((r) => r['Ano'] ?? r['ano'] ?? ''))].filter(Boolean);
  console.log(`${f}: ${rows.length} linhas`);
  if (rows[0]) console.log('  colunas:', Object.keys(rows[0]).join(' | '));
}
