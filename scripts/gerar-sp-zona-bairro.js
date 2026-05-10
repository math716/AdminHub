/**
 * Pré-gera arquivos JSON estáticos de fração zona→bairro para municípios de SP
 * (exceto São Paulo capital, que já usa SP_ZONA_DISTRITO_MAP hardcoded).
 * Output: public/data/tse/sp-zona-bairro/{MUNICIPIO_NORM}.json
 * Execute: node scripts/gerar-sp-zona-bairro.js
 */
const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SP_MUNICIPIOS_COM_BAIRROS = new Set([
  'ANHEMBI','ARTUR NOGUEIRA','ATIBAIA','BARUERI','BAURU','BEBEDOURO','BERTIOGA',
  'BOITUVA','BOM JESUS DOS PERDOES','BOTUCATU','BRAGANCA PAULISTA','CAIEIRAS',
  'CATANDUVA','CUBATAO','DIADEMA','EMBU DAS ARTES','GUARATINGUETA','GUARUJA',
  'GUARULHOS','HORTOLANDIA','ILHABELA','ITANHAEM','ITAPIRA','ITAQUAQUECETUBA',
  'ITARARE','ITATINGA','JABOTICABAL','JUNDIAI','MAUA','MIRASSOL','MOCOCA',
  'MONGAGUA','NOVA ODESSA','OSASCO','OURO VERDE','PAULINIA','PIRACICABA',
  'PRAIA GRANDE','RIBEIRAO PIRES','RIBEIRAO PRETO','RIO CLARO',
  'SANTA CRUZ DAS PALMEIRAS','SANTA GERTRUDES','SANTO ANDRE','SANTOS','SUMARE',
  'SAO BERNARDO DO CAMPO','SAO CAETANO DO SUL','SAO JOSE DO RIO PRETO',
  'SAO JOSE DOS CAMPOS','SAO MANUEL','SAO SEBASTIAO','SAO VICENTE',
  'TAMBAU','TATUI','TAUBATE','UBATUBA','VINHEDO',
]);

function norm(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toUpperCase().replace(/[^A-Z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

const gzPath  = path.join(__dirname, '..', 'public', 'data', 'tse', 'locais', 'SP.json.gz');
const jsonPath = path.join(__dirname, '..', 'public', 'data', 'tse', 'locais', 'SP.json');
const outDir  = path.join(__dirname, '..', 'public', 'data', 'tse', 'sp-zona-bairro');

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

console.log('Lendo SP.json.gz...');
let raw;
if (fs.existsSync(gzPath)) {
  raw = zlib.gunzipSync(fs.readFileSync(gzPath)).toString('utf8');
} else if (fs.existsSync(jsonPath)) {
  raw = fs.readFileSync(jsonPath, 'utf8');
} else {
  console.error('Arquivo SP.json.gz não encontrado em', gzPath);
  process.exit(1);
}

const locais = JSON.parse(raw);
console.log(`Total de registros: ${locais.length}`);

for (const munNorm of SP_MUNICIPIOS_COM_BAIRROS) {
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
