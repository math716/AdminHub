/**
 * Pré-gera arquivos JSON estáticos de fração zona→bairro para municípios de MG.
 * Output: public/data/tse/mg-zona-bairro/{MUNICIPIO_NORM}.json
 * Execute: node scripts/gerar-mg-zona-bairro.js
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const MG_MUNICIPIOS_COM_BAIRROS = new Set([
  'ABAETE','ARAXA','AUGUSTO DE LIMA','BARBACENA','BELO HORIZONTE','BETIM','BICAS',
  'CAMPINA VERDE','CANAPOLIS','CARANGOLA','CARATINGA','CARMO DO PARANAIBA',
  'CONCEICAO DAS ALAGOAS','COQUEIRAL','COROMANDEL','CORONEL FABRICIANO','CRUCILANDIA',
  'GOVERNADOR VALADARES','IBIA','IPATINGA','ITABIRITO','ITAUNA','ITUIUTABA',
  'JUIZ DE FORA','MATUTINA','MONTE ALEGRE DE MINAS','NANUQUE','NATERCIA','NOVA ERA',
  'NOVA PONTE','PAINS','PASSOS','PATOS DE MINAS','PATROCINIO','PECANHA','PIRAPORA',
  'POMPEU','PONTE NOVA','POCOS DE CALDAS','RIO CASCA','SACRAMENTO','SANTA JULIANA',
  'SOBRALIA','SAO GERALDO DO BAIXIO','SAO GOTARDO','SAO JOAO DEL REI','SAO ROMAO',
  'TEOFILO OTONI','TIMOTEO','TRES CORACOES','TUPACIGUARA','UBERABA','UBERLANDIA',
  'URUANA DE MINAS','VARGINHA',
]);

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const gzPath   = path.join(__dirname, '..', 'public', 'data', 'tse', 'locais', 'MG.json.gz');
const jsonPath  = path.join(__dirname, '..', 'public', 'data', 'tse', 'locais', 'MG.json');
const outDir   = path.join(__dirname, '..', 'public', 'data', 'tse', 'mg-zona-bairro');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Lendo MG.json.gz...');
let raw;
if (fs.existsSync(gzPath)) {
  raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8');
} else if (fs.existsSync(jsonPath)) {
  raw = fs.readFileSync(jsonPath, 'utf8');
} else {
  console.error('Arquivo MG.json.gz não encontrado em', gzPath);
  process.exit(1);
}

const locais = JSON.parse(raw);
console.log(`Total de registros: ${locais.length}`);

for (const munNorm of MG_MUNICIPIOS_COM_BAIRROS) {
  const locaisMun = locais.filter(l => norm(l.municipio) === munNorm && l.bairro?.trim());

  if (locaisMun.length === 0) {
    console.warn(`  AVISO: nenhum local encontrado para ${munNorm}`);
    continue;
  }

  // Agrupa por zona
  const porZona = {};
  for (const l of locaisMun) {
    if (!porZona[l.zona]) porZona[l.zona] = [];
    porZona[l.zona].push(norm(l.bairro));
  }

  // Para cada zona, calcula fração de cada bairro
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
