/**
 * Converte Campinas-SP.json (UTM Zone 23S / SIRGAS 2000) → WGS84
 * e gera public/geojson/municipios/SP/CAMPINAS.json
 *
 * Executar: node scripts/convert-campinas.mjs
 */

import { readFile, writeFile, mkdir } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

// ── UTM Zone 23S → WGS84 (GRS80) ──────────────────────────────────────────
const a  = 6378137.0;
const f  = 1 / 298.257223563;
const b  = a * (1 - f);
const e2 = 2 * f - f * f;
const ep2 = e2 / (1 - e2);
const k0 = 0.9996;
const FE = 500000;
const FN = 10000000; // hemisfério sul
const lon0 = -45 * Math.PI / 180; // meridiano central zona 23

function utmToWgs84(easting, northing) {
  const x = easting - FE;
  const y = northing - FN;

  const M = y / k0;
  const mu = M / (a * (1 - e2/4 - 3*e2*e2/64 - 5*e2*e2*e2/256));

  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const phi1 = mu
    + (3*e1/2 - 27*e1*e1*e1/32) * Math.sin(2*mu)
    + (21*e1*e1/16 - 55*e1*e1*e1*e1/32) * Math.sin(4*mu)
    + (151*e1*e1*e1/96) * Math.sin(6*mu)
    + (1097*e1*e1*e1*e1/512) * Math.sin(8*mu);

  const N1  = a / Math.sqrt(1 - e2 * Math.sin(phi1)**2);
  const T1  = Math.tan(phi1)**2;
  const C1  = ep2 * Math.cos(phi1)**2;
  const R1  = a * (1 - e2) / Math.pow(1 - e2 * Math.sin(phi1)**2, 1.5);
  const D   = x / (N1 * k0);

  const lat = phi1
    - (N1 * Math.tan(phi1) / R1) * (
        D*D/2
      - (5 + 3*T1 + 10*C1 - 4*C1*C1 - 9*ep2) * D*D*D*D/24
      + (61 + 90*T1 + 298*C1 + 45*T1*T1 - 252*ep2 - 3*C1*C1) * D*D*D*D*D*D/720
    );

  const lon = lon0 + (
      D
    - (1 + 2*T1 + C1) * D*D*D/6
    + (5 - 2*C1 + 28*T1 - 3*C1*C1 + 8*ep2 + 24*T1*T1) * D*D*D*D*D/120
  ) / Math.cos(phi1);

  return [lon * 180 / Math.PI, lat * 180 / Math.PI];
}

function convertRing(ring) {
  return ring.map(([x, y]) => utmToWgs84(x, y));
}

function convertGeometry(geom) {
  if (geom.type === 'Polygon') {
    return { ...geom, coordinates: geom.coordinates.map(convertRing) };
  }
  if (geom.type === 'MultiPolygon') {
    return { ...geom, coordinates: geom.coordinates.map(poly => poly.map(convertRing)) };
  }
  return geom;
}

// ── Main ───────────────────────────────────────────────────────────────────
const srcPath = path.join(ROOT, 'public', 'geojson', 'Campinas-SP.json');
const outDir  = path.join(ROOT, 'public', 'geojson', 'municipios', 'SP');
const outPath = path.join(outDir, 'CAMPINAS.json');

const raw = await readFile(srcPath, 'utf-8');
const src = JSON.parse(raw);

const features = src.features.map(f => ({
  ...f,
  geometry: convertGeometry(f.geometry),
  properties: {
    ...f.properties,
    NM_BAIRRO: f.properties.DESCRICAO ?? f.properties.REGIAO ?? '',
    NM_MUN: 'Campinas',
  },
}));

await mkdir(outDir, { recursive: true });
await writeFile(outPath, JSON.stringify({ type: 'FeatureCollection', features }), 'utf-8');

console.log(`Gerado: ${outPath}`);
console.log(`Total de regiões: ${features.length}`);
features.forEach(f => console.log(' -', f.properties.NM_BAIRRO));
