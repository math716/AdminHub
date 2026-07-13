/**
 * Baixa o XLSX de emendas MG (ALMG) via Playwright.
 * O portal emendas.mg.gov.br bloqueia curl/wget por IP do GitHub Actions,
 * mas um browser real (Chromium headless) passa a verificação de bot.
 *
 * Uso: npx tsx scripts/estados/download-mg.ts
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PAGE_URL = 'https://www.emendas.mg.gov.br/transparencia/';
const DEST_DIR  = path.join('data', 'estados');
const DEST_FILE = path.join(DEST_DIR, 'mg-emendas.xlsx');

// Textos do botão de download que o portal pode usar
const TEXTOS_BOTAO = [
  'Relatorio de execução',
  'Relatório de Execução',
  'relatório de execução',
  'Execução',
  'DADOS_EMENDAS',
  'Baixar',
  'Download',
  'xlsx',
  'XLSX',
];

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });

  console.log(`\n📥 Download MG — ${PAGE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    acceptDownloads: true,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'pt-BR',
  });
  const page = await context.newPage();

  try {
    console.log('Abrindo portal...');
    await page.goto(PAGE_URL, { waitUntil: 'networkidle', timeout: 60_000 });

    // Aguarda um pouco para JS da página finalizar
    await page.waitForTimeout(3_000);

    const title = await page.title();
    console.log(`Título da página: "${title}"`);

    // Tenta clicar em um link/botão que dispare o download do XLSX
    let download = null;

    // Estratégia 1: procura links que apontem para XLSX diretamente
    const xlsxLinks = await page.$$eval('a[href]', (links) =>
      links
        .map((a) => ({ href: (a as HTMLAnchorElement).href, text: a.textContent?.trim() ?? '' }))
        .filter((l) => l.href.toLowerCase().includes('.xlsx') || l.href.toLowerCase().includes('dados_emendas'))
    );

    if (xlsxLinks.length > 0) {
      // Filtra fora dicionários e anos antigos
      const candidatos = xlsxLinks.filter(
        (l) => !l.href.toLowerCase().includes('dicionario') &&
                !l.href.match(/202[0-2]/),
      );
      const link = candidatos[0] ?? xlsxLinks[0];
      console.log(`Link XLSX encontrado: ${link.href} ("${link.text}")`);

      const dlPromise = page.waitForEvent('download', { timeout: 120_000 });
      await page.click(`a[href="${new URL(link.href).pathname}"], a[href="${link.href}"]`).catch(() =>
        page.evaluate((href) => { window.location.href = href; }, link.href)
      );
      download = await dlPromise;
    }

    // Estratégia 2: procura por texto do botão
    if (!download) {
      for (const texto of TEXTOS_BOTAO) {
        try {
          const el = page.getByText(texto, { exact: false });
          await el.first().waitFor({ timeout: 3_000 });
          console.log(`Botão encontrado: "${texto}"`);
          const dlPromise = page.waitForEvent('download', { timeout: 120_000 });
          await el.first().click();
          download = await dlPromise;
          break;
        } catch { /* tenta próximo */ }
      }
    }

    if (!download) {
      // Salva screenshot e HTML para diagnóstico
      await page.screenshot({ path: path.join(DEST_DIR, 'debug-mg.png'), fullPage: true }).catch(() => {});
      const html = await page.content();
      fs.writeFileSync(path.join(DEST_DIR, 'debug-mg.html'), html);
      console.error('❌ Botão/link de download não encontrado.');
      console.error('   Screenshot e HTML salvos em data/estados/debug-mg.*');
      process.exit(1);
    }

    await download.saveAs(DEST_FILE);

    // Valida magic bytes do XLSX (PK 50 4B 03 04)
    const buf = fs.readFileSync(DEST_FILE).slice(0, 4);
    if (buf.toString('hex') !== '504b0304') {
      console.error('❌ Arquivo baixado não é um XLSX válido.');
      fs.unlinkSync(DEST_FILE);
      process.exit(1);
    }

    const kb = (fs.statSync(DEST_FILE).size / 1024).toFixed(0);
    console.log(`✅ Arquivo salvo: ${DEST_FILE} (${kb} KB)`);
  } finally {
    await context.close();
    await browser.close();
  }
}

main().catch((e) => { console.error('❌', e.message); process.exit(1); });
