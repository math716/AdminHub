/**
 * Baixa os XLSX de emendas impositivas SP via Power BI (botão "Baixar os dados").
 * Uso: ANOS=2025,2026 npx tsx scripts/download-emendas-sp-powerbi.ts
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const PAINEIS: Record<number, string> = {
  2023: 'https://app.powerbi.com/view?r=eyJrIjoiZjcyNDM3OTgtZTE2ZC00N2JmLWE3NmQtNTg3YzBmYzk0NTAxIiwidCI6IjNhNzhiMGNkLTdjOGUtNDkyOS04M2Q1LTE5MGE2Y2MwMTM2NSJ9',
  2024: 'https://app.powerbi.com/view?r=eyJrIjoiN2FlOTlmMzgtNjg5OC00NjFiLThkOTMtYWVlZTc4OGMzMThhIiwidCI6IjNhNzhiMGNkLTdjOGUtNDkyOS04M2Q1LTE5MGE2Y2MwMTM2NSJ9',
  2025: 'https://app.powerbi.com/view?r=eyJrIjoiYzUzYTU0ZTctOWM2My00ZDg0LWJlMWEtNTExMWJmMjc1NmQ4IiwidCI6IjNhNzhiMGNkLTdjOGUtNDkyOS04M2Q1LTE5MGE2Y2MwMTM2NSJ9',
  2026: 'https://app.powerbi.com/view?r=eyJrIjoiNWU3NWQyOGUtZWYwNy00NDA2LWE3Y2UtOWFlMmFlN2Q4NGVkIiwidCI6IjNhNzhiMGNkLTdjOGUtNDkyOS04M2Q1LTE5MGE2Y2MwMTM2NSJ9',
};

const DEST_DIR = path.join('data', 'estados');
const ANOS = (process.env.ANOS ?? '2025,2026').split(',').map(Number).filter(Boolean);

async function downloadAno(ano: number): Promise<boolean> {
  const url = PAINEIS[ano];
  if (!url) { console.error(`[${ano}] Sem URL configurada`); return false; }

  const destFile = path.join(DEST_DIR, `Emendas_Impositivas_${ano}.xlsx`);
  console.log(`\n[${ano}] Abrindo Power BI: ${url.slice(0, 80)}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    // Power BI precisa de tempo para renderizar o relatório completo
    console.log(`[${ano}] Aguardando renderização (30s)...`);
    await page.waitForTimeout(30_000);

    let download = null;

    // Tenta encontrar o botão na página principal e em cada iframe
    const targets = [page, ...page.frames()];
    for (const target of targets) {
      try {
        const btn = target.getByText('Baixar os dados', { exact: false });
        await btn.waitFor({ timeout: 5_000 });
        const dlPromise = page.waitForEvent('download', { timeout: 60_000 });
        await btn.click();

        // Power BI pode mostrar dialog de seleção de dados
        try {
          await page.getByText('Dados subjacentes', { exact: false }).click({ timeout: 8_000 });
        } catch { /* sem dialog, download já iniciou */ }

        download = await dlPromise;
        break;
      } catch { /* botão não encontrado neste frame, tenta próximo */ }
    }

    if (!download) {
      console.error(`[${ano}] ✗ Botão "Baixar os dados" não encontrado após 30s`);
      return false;
    }

    await download.saveAs(destFile);

    // Valida se é realmente um XLSX (magic bytes 50 4B 03 04)
    const buf = fs.readFileSync(destFile).slice(0, 4);
    if (buf.toString('hex') !== '504b0304') {
      console.error(`[${ano}] ✗ Arquivo inválido (não é XLSX)`);
      fs.unlinkSync(destFile);
      return false;
    }

    const kb = (fs.statSync(destFile).size / 1024).toFixed(0);
    console.log(`[${ano}] ✓ Salvo: ${destFile} (${kb} KB)`);
    return true;
  } catch (e) {
    console.error(`[${ano}] ✗ Erro:`, e);
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function main() {
  fs.mkdirSync(DEST_DIR, { recursive: true });

  console.log(`Anos a baixar: ${ANOS.join(', ')}`);
  const resultados: { ano: number; ok: boolean }[] = [];

  for (const ano of ANOS) {
    const ok = await downloadAno(ano);
    resultados.push({ ano, ok });
  }

  console.log('\n=== Resumo ===');
  for (const r of resultados) {
    console.log(`  ${r.ano}: ${r.ok ? '✓ OK' : '✗ FALHOU'}`);
  }

  if (resultados.some(r => !r.ok)) process.exit(1);
}

main().catch(e => { console.error(e); process.exit(1); });
