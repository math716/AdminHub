/**
 * Baixa os XLS de emendas parlamentares do DF via SISCONEP Cidadão.
 * Uso: ANOS=2025,2026 npx tsx scripts/download-emendas-df-sisconep.ts
 *
 * URL: https://sistemas.df.gov.br/SISCONEPCIDADAO/
 * O botão "Excel" do site usa fetch()→blob→link programático, então
 * o evento 'download' do Playwright não dispara. Solução: interceptar
 * a resposta HTTP diretamente com page.on('response').
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://sistemas.df.gov.br/SISCONEPCIDADAO/';
const DEST_DIR = path.join('data', 'estados');
const ANOS = (process.env.ANOS ?? '2025,2026').split(',').map(Number).filter(Boolean);

async function downloadAno(ano: number): Promise<boolean> {
  const destFile = path.join(DEST_DIR, `Emendas_DF_${ano}.json`);
  console.log(`\n[${ano}] Abrindo SISCONEP: ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page    = await context.newPage();

  let fileBuffer: Buffer | null = null;

  // ── Intercepta respostas HTTP procurando o arquivo Excel ──────────────────
  page.on('response', async (response) => {
    const ct  = response.headers()['content-type'] ?? '';
    const cd  = response.headers()['content-disposition'] ?? '';
    const url = response.url();

    const isExcel =
      ct.includes('excel') ||
      ct.includes('spreadsheetml') ||
      ct.includes('octet-stream') ||
      cd.toLowerCase().includes('.xls') ||
      url.toLowerCase().includes('excel') ||
      url.toLowerCase().includes('.xls');

    if (isExcel) {
      try {
        const body = await response.body();
        if (body.length > 1_000) {
          fileBuffer = body;
          console.log(`[${ano}] Arquivo interceptado: ${body.length} bytes (${ct || url.split('?')[0].slice(-40)})`);
        }
      } catch { /* corpo já consumido ou resposta sem corpo */ }
    }
  });

  // Loga requests XHR/fetch para diagnóstico
  page.on('request', (req) => {
    if (['xhr', 'fetch'].includes(req.resourceType())) {
      const u = req.url();
      if (/excel|export|download|xls/i.test(u)) {
        console.log(`[${ano}] → Request: ${u.slice(0, 120)}`);
      }
    }
  });

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    console.log(`[${ano}] Página carregada.`);

    // ── Selecionar ano no vscomp ───────────────────────────────────────────
    let dropdownAberto = false;
    for (const sel of ['vscomp-element', '.vscomp-wrapper', '[class*="vscomp"]']) {
      try {
        await page.locator(sel).first().click({ timeout: 5_000 });
        dropdownAberto = true;
        console.log(`[${ano}] Dropdown aberto via "${sel}"`);
        break;
      } catch { /* tenta próximo */ }
    }
    if (!dropdownAberto) {
      try {
        await page.getByText(/exerc[íi]cio/i).first().click({ timeout: 5_000 });
        dropdownAberto = true;
        console.log(`[${ano}] Dropdown aberto via texto "Exercício"`);
      } catch { /* continua */ }
    }

    if (dropdownAberto) {
      await page.waitForTimeout(500);
      let anoSelecionado = false;
      for (const sel of [`[data-value="${ano}"]`, `vs-option[data-value="${ano}"]`, `.vscomp-option[data-value="${ano}"]`]) {
        try {
          await page.locator(sel).first().click({ timeout: 3_000 });
          anoSelecionado = true;
          console.log(`[${ano}] Ano ${ano} selecionado via "${sel}"`);
          break;
        } catch { /* tenta próximo */ }
      }
      if (!anoSelecionado) {
        try {
          await page.getByText(String(ano), { exact: true }).first().click({ timeout: 3_000 });
          console.log(`[${ano}] Ano ${ano} selecionado via texto exato`);
        } catch { console.warn(`[${ano}] Não foi possível selecionar o ano`); }
      }
    }

    await page.waitForTimeout(500);

    // ── Clicar em Buscar ──────────────────────────────────────────────────
    for (const sel of ['button:has-text("Buscar")', 'input[value="Buscar"]', '[class*="buscar"]']) {
      try {
        await page.locator(sel).first().click({ timeout: 5_000 });
        console.log(`[${ano}] Buscar clicado.`);
        break;
      } catch { /* tenta próximo */ }
    }

    // Aguarda carregamento inicial dos dados
    console.log(`[${ano}] Aguardando dados (15s)...`);
    await page.waitForTimeout(15_000);

    // ── Clicar em Excel ───────────────────────────────────────────────────
    for (const sel of [
      'a:has-text("Excel")',
      'button:has-text("Excel")',
      '[title*="Excel"]',
      '[class*="excel"]',
      'a[href*="excel"]',
      'a[href*="xls"]',
    ]) {
      try {
        const el = page.locator(sel).first();
        await el.waitFor({ timeout: 5_000 });
        await el.click();
        console.log(`[${ano}] Excel clicado via "${sel}" — aguardando geração (300s)...`);
        break;
      } catch { /* tenta próximo */ }
    }

    // ── Aguarda até 300s pelo arquivo interceptado ────────────────────────
    const deadline = Date.now() + 300_000;
    while (!fileBuffer && Date.now() < deadline) {
      await page.waitForTimeout(3_000);
      if (fileBuffer) break;
      const pct = Math.round((300_000 - (deadline - Date.now())) / 3_000);
      if (pct % 10 === 0) process.stdout.write(`\r[${ano}] aguardando... ${Math.round((deadline - Date.now()) / 1000)}s restantes   `);
    }
    process.stdout.write('\n');

    if (!fileBuffer) {
      await page.screenshot({ path: `data/estados/debug-df-${ano}.png`, fullPage: true }).catch(() => {});
      console.error(`[${ano}] ✗ Arquivo não recebido após 300s (screenshot salvo)`);
      return false;
    }

    fs.writeFileSync(destFile, fileBuffer);

    // Valida se é JSON com dados
    try {
      const json = JSON.parse(fileBuffer.toString('utf8'));
      const lista = json?.data?.List?.List;
      if (!Array.isArray(lista) || lista.length === 0) {
        console.error(`[${ano}] ✗ JSON sem registros`);
        fs.unlinkSync(destFile);
        return false;
      }
      const kb = (fs.statSync(destFile).size / 1024).toFixed(0);
      console.log(`[${ano}] ✓ Salvo: ${destFile} (${kb} KB, ${lista.length} registros)`);
    } catch {
      console.error(`[${ano}] ✗ Resposta não é JSON válido`);
      fs.unlinkSync(destFile);
      return false;
    }
    return true;
  } catch (e) {
    console.error(`[${ano}] ✗ Erro:`, e);
    await page.screenshot({ path: `data/estados/debug-df-${ano}.png`, fullPage: true }).catch(() => {});
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
