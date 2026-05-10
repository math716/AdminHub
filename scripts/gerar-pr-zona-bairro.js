/**
 * Pré-gera arquivos JSON estáticos de fração zona→bairro para municípios do PR.
 * Output: public/data/tse/pr-zona-bairro/{MUNICIPIO_NORM}.json
 * Execute: node scripts/gerar-pr-zona-bairro.js
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const PR_MUNICIPIOS_COM_BAIRROS = new Set([
  'AMPERE','ARAUCARIA','ASSIS CHATEAUBRIAND','BOM SUCESSO DO SUL','CAMPO BONITO',
  'CAMPO MOURAO','CAPANEMA','CASCAVEL','CHOPINZINHO','CIANORTE','CIDADE GAUCHA',
  'CLEVELANDIA','COLOMBO','CURITIBA','DOIS VIZINHOS','FAZENDA RIO GRANDE',
  'FOZ DO IGUACU','FRANCISCO BELTRAO','GUARAPUAVA','IBEMA','IRATI',
  'LARANJEIRAS DO SUL','LONDRINA','MARECHAL CANDIDO RONDON','MARINGA','MEDIANEIRA',
  'NOVA ESPERANCA','NOVA PRATA DO IGUACU','PALMAS','PALOTINA','PARANAGUA',
  'PATO BRANCO','PINHAIS','PLANALTO','PONTA GROSSA','REALEZA','SALTO DO LONTRA',
  'SANTA IZABEL DO OESTE','SAO JOAO','SAO JOSE DOS PINHAIS','TOLEDO','UNIAO DA VITORIA',
]);

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const gzPath  = path.join(__dirname, '..', 'public', 'data', 'tse', 'locais', 'PR.json.gz');
const jsonPath = path.join(__dirname, '..', 'public', 'data', 'tse', 'locais', 'PR.json');
const outDir  = path.join(__dirname, '..', 'public', 'data', 'tse', 'pr-zona-bairro');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Lendo PR.json.gz...');
let raw;
if (fs.existsSync(gzPath)) {
  raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8');
} else if (fs.existsSync(jsonPath)) {
  raw = fs.readFileSync(jsonPath, 'utf8');
} else {
  console.error('Arquivo PR.json.gz não encontrado em', gzPath);
  process.exit(1);
}

const locais = JSON.parse(raw);
console.log(`Total de registros: ${locais.length}`);

for (const munNorm of PR_MUNICIPIOS_COM_BAIRROS) {
  const locaisMun = locais.filter(l => norm(l.municipio) === munNorm && l.bairro?.trim());

  if (locaisMun.length === 0) {
    console.warn(`  AVISO: nenhum local encontrado para ${munNorm}`);
    continue;
  }

  const porZona = {};
  for (const l of locaisMun) {
    if (!porZona[l.zona]) porZona[l.zona] = [];
    porZona[l.zona].push(norm(l.bairro));
  }

  const zonaBairroMap = {};
  for (const [zonaStr, bairros] of Object.entries(porZona)) {
    const zona  = Number(zonaStr);
    const total = bairros.length;
    const contagem = {};
    for (const b of bairros) contagem[b] = (contagem[b] ?? 0) + 1;
    zonaBairroMap[zona] = {};
    for (const [b, cnt] of Object.entries(contagem)) {
      zonaBairroMap[zona][b] = Math.round((cnt / total) * 10000) / 10000;
    }
  }

  const fileName = `${munNorm.replace(/\s+/g, '_')}.json`;
  const outPath  = path.join(outDir, fileName);
  fs.writeFileSync(outPath, JSON.stringify(zonaBairroMap), 'utf8');
  console.log(`  OK: ${munNorm} → ${fileName} (${Object.keys(zonaBairroMap).length} zonas)`);
}

console.log('\nConcluído!');
