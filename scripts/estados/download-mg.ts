/**
 * Baixa o XLSX de emendas MG (ALMG) via Playwright.
 *
 * O portal emendas.mg.gov.br bloqueia curl/wget por IP do GitHub Actions.
 * Playwright (Chromium headless) navega diretamente para a URL do arquivo,
 * contornando o bloqueio da página HTML sem precisar fazer scraping.
 *
 * Padrão da URL:
 *   https://www.emendas.mg.gov.br/wp-content/dados-emendas/${ANO}_Marcel/
 *   DADOS_EMENDAS_2023_2024_..._${ANO}.xlsx
 *
 * Uso: npx tsx scripts/estados/download-mg.ts
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const DEST_DIR  = path.join('data', 'estados');
const DEST_FILE = path.join(DEST_DIR, 'mg-emendas.xlsx');

const BASE_URL = 'https://www.emendas.mg.gov.br/wp-content/dados-emendas';

function buildCandidateUrls(): string[] {
  const year = new Date().getFullYear();
  const candidates: string[] = [];

  // Constrói filename com todos os anos desde 2023 (padrão atual do portal)
  // Ex: DADOS_EMENDAS_2023_2024_2025_2026.xlsx
  for (let y = year; y >= year - 1; y--) {
    const anos = Array.from({ length: y - 2022 }, (_, i) => 2023 + i).join('_');
    candidates.push(`${BASE_URL}/${y}_Marcel/DADOS_EMENDAS_${anos}.xlsx`);
    // Fallback: filename com só o ano da pasta
    candidates.push(`${BASE_URL}/${y}_Marcel/DADOS_EMENDAS_${y}.xlsx`);
  }

  return candidates;
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });

  const candidates = buildCandidateUrls();
  console.log('\n📥 Download MG — tentando URLs:');
  candidates.forEach((u) => console.log(`   ${u}`));

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
  });

  let downloaded = false;

  for (const url of candidates) {
    console.log(`\nTentando: ${url}`);
    const page = await context.newPage();
    try {
      // Navega diretamente para a URL do arquivo — o browser dispara o download automaticamente
      const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 120_000 }),
        page.goto(url, { waitUntil: 'commit', timeout: 30_000 }),
      ]);

      await download.saveAs(DEST_FILE);

      // Valida magic bytes do XLSX (PK 50 4B 03 04)
      const buf = fs.readFileSync(DEST_FILE).slice(0, 4);
      if (buf.toString('hex') !== '504b0304') {
        console.warn(`   ⚠ Arquivo baixado não é XLSX válido — tentando próxima URL`);
        fs.unlinkSync(DEST_FILE);
        await page.close();
        continue;
      }

      const kb = (fs.statSync(DEST_FILE).size / 1024).toFixed(0);
      console.log(`✅ Arquivo salvo: ${DEST_FILE} (${kb} KB)`);
      downloaded = true;
      await page.close();
      break;
    } catch (e: any) {
      console.warn(`   ⚠ Falhou: ${e.message}`);
      // Captura HTTP status se disponível
      try {
        const resp = await page.evaluate(() => document.title);
        if (resp) console.warn(`   Título da página: "${resp}"`);
      } catch { /* ignore */ }
      await page.close();
    }
  }

  await context.close();
  await browser.close();

  if (!downloaded) {
    console.error('\n❌ Nenhuma URL funcionou.');
    console.error('   Verifique se o padrão da URL mudou em:');
    console.error('   https://www.emendas.mg.gov.br/transparencia/');
    process.exit(1);
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
