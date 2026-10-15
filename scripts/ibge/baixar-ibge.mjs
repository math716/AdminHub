// Baixa do IBGE o que os mapas usam e guarda em public/geojson/ibge/:
//   brasil.json             contorno dos estados (malha do país)
//   estados/{UF}.json       contorno das cidades de cada estado
//   municipios/{UF}.json    lista de cidades (código IBGE + nome)
//
// Por quê: em out/2026 o IBGE parou de responder aos servidores da Vercel
// (fora do Brasil) e os mapas de estado e cidade ficaram em branco, em
// homologação e produção ao mesmo tempo. Daqui do Brasil o IBGE responde;
// com os arquivos no sistema, os mapas não dependem mais dele a cada acesso.
//
//   node scripts/ibge/baixar-ibge.mjs
//
// Rodar de novo só se o IBGE mudar a malha (criação de município é rara).

import fs from 'fs';
import path from 'path';

const UF_CODIGO = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52, MA: 21, MT: 51, MS: 50, MG: 31, PA: 15,
  PB: 25, PR: 41, PE: 26, PI: 22, RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};
const BASE = 'https://servicodados.ibge.gov.br/api';
const SAIDA = path.join(process.cwd(), 'public', 'geojson', 'ibge');

async function baixar(url, destino) {
  for (let t = 1; t <= 4; t++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const dados = await res.json();
      fs.mkdirSync(path.dirname(destino), { recursive: true });
      fs.writeFileSync(destino, JSON.stringify(dados));
      return fs.statSync(destino).size;
    } catch (e) {
      console.warn(`  tentativa ${t} falhou (${e.message}): ${url}`);
      await new Promise(r => setTimeout(r, 2000 * t));
    }
  }
  throw new Error(`não consegui baixar ${url}`);
}

let total = 0;
total += await baixar(`${BASE}/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF`,
  path.join(SAIDA, 'brasil.json'));
for (const [uf, cod] of Object.entries(UF_CODIGO)) {
  const a = await baixar(`${BASE}/v3/malhas/estados/${cod}?formato=application/vnd.geo+json&qualidade=intermediaria&intrarregiao=municipio`,
    path.join(SAIDA, 'estados', `${uf}.json`));
  const b = await baixar(`${BASE}/v1/localidades/estados/${cod}/municipios`, path.join(SAIDA, 'municipios', `${uf}.json`));
  total += a + b;
  console.log(`${uf}: malha ${(a / 1024).toFixed(0)} KB, lista ${(b / 1024).toFixed(0)} KB`);
}
console.log(`Total: ${(total / 1024 / 1024).toFixed(1)} MB em ${SAIDA}`);

// Lista compacta embutida no código (lib/ibge-local lê esta, não a da rede).
const compacta = {};
for (const uf of Object.keys(UF_CODIGO)) {
  compacta[uf] = JSON.parse(fs.readFileSync(path.join(SAIDA, 'municipios', `${uf}.json`), 'utf8')).map(m => [m.id, m.nome]);
}
fs.writeFileSync(path.join(process.cwd(), 'lib', 'ibge-municipios.json'), JSON.stringify(compacta));
console.log('lib/ibge-municipios.json atualizado');
