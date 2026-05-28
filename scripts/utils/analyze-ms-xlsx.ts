import * as XLSX from 'xlsx';

const wb = XLSX.readFile('data/estados/MS-2017 A 2023.xlsx');
const ws = wb.Sheets[wb.SheetNames[0]];
const rows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

const por2021a2023 = rows.filter((r) => [2021, 2022, 2023].includes(Number(r['Ano'])));
console.log(`Linhas 2021-2023: ${por2021a2023.length}`);

const comDeputado = por2021a2023.filter((r) => String(r['Nome do deputado']).trim()).length;
const semDeputado = por2021a2023.length - comDeputado;
console.log(`Com deputado: ${comDeputado} | Sem deputado: ${semDeputado}`);

const ex = por2021a2023.find((r) => String(r['Nome do deputado']).trim());
if (ex) {
  console.log('\nExemplo 2021-2023:');
  ['Ano', 'Nome do deputado', 'Município', 'Ação a ser financiada', 'Número do processo', 'Valor total da solicitação'].forEach((k) => {
    console.log(`  ${k}: ${ex[k]}`);
  });
}

const anos: Record<string, { total: number; comDep: number }> = {};
for (const r of rows) {
  const ano = String(Number(r['Ano']));
  if (!anos[ano]) anos[ano] = { total: 0, comDep: 0 };
  anos[ano].total++;
  if (String(r['Nome do deputado']).trim()) anos[ano].comDep++;
}
console.log('\nPor ano:');
Object.entries(anos).sort().forEach(([a, v]) => console.log(`  ${a}: ${v.total} linhas, ${v.comDep} com deputado`));
