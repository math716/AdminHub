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

async function downloadAnoTentativa(ano: number, tentativa: number): Promise<boolean> {
  const destFile = path.join(DEST_DIR, `Emendas_DF_${ano}.json`);
  console.log(`\n[${ano}] Abrindo SISCONEP (tentativa ${tentativa}): ${BASE_URL}`);

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

    // ── Abre o vscomp e verifica que as opções ficaram visíveis ─────────────
    // Clica até 4 vezes: se após o clique a opção do ano não aparecer em 3s,
    // o dropdown não abriu de verdade e tentamos de novo.
    const dropdownSelectors = ['.vscomp-wrapper', 'vscomp-element', '[class*="vscomp"]'];
    let dropdownAberto = false;

    for (let tentDrop = 1; tentDrop <= 4 && !dropdownAberto; tentDrop++) {
      for (const sel of dropdownSelectors) {
        try {
          await page.locator(sel).first().waitFor({ state: 'visible', timeout: 15_000 });
          await page.locator(sel).first().click({ timeout: 5_000 });
          // Verifica se alguma opção de ano ficou visível (prova que abriu)
          await page.locator(`[data-value="${ano}"]`).first()
            .waitFor({ state: 'visible', timeout: 3_000 });
          dropdownAberto = true;
          console.log(`[${ano}] Dropdown aberto via "${sel}" (clique ${tentDrop})`);
          break;
        } catch { /* opção não apareceu — tenta próximo seletor ou reclica */ }
      }
      if (!dropdownAberto && tentDrop < 4) {
        console.log(`[${ano}] Dropdown não abriu na tentativa ${tentDrop}, aguardando 1s...`);
        await page.waitForTimeout(1_000);
      }
    }

    if (!dropdownAberto) {
      console.error(`[${ano}] ✗ Dropdown não abriu após 4 cliques — abortando tentativa.`);
      await page.screenshot({ path: `data/estados/debug-df-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
      return false;
    }

    await page.waitForTimeout(300);

    // ── Selecionar o ano ───────────────────────────────────────────────────
    let anoSelecionado = false;
    for (const sel of [
      `[data-value="${ano}"]`,
      `vs-option[data-value="${ano}"]`,
      `.vscomp-option[data-value="${ano}"]`,
    ]) {
      try {
        await page.locator(sel).first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator(sel).first().click({ timeout: 3_000 });
        anoSelecionado = true;
        console.log(`[${ano}] Ano ${ano} selecionado via "${sel}"`);
        break;
      } catch { /* tenta próximo */ }
    }
    if (!anoSelecionado) {
      try {
        await page.getByText(String(ano), { exact: true }).first().click({ timeout: 3_000 });
        anoSelecionado = true;
        console.log(`[${ano}] Ano ${ano} selecionado via texto exato`);
      } catch { /* continua */ }
    }

    if (!anoSelecionado) {
      console.error(`[${ano}] ✗ Não foi possível selecionar o ano ${ano} — abortando tentativa.`);
      await page.screenshot({ path: `data/estados/debug-df-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
      return false;
    }

    await page.waitForTimeout(500);

    // ── Clicar em Buscar ──────────────────────────────────────────────────
    let buscarClicado = false;
    for (const sel of ['button:has-text("Buscar")', 'input[value="Buscar"]', '[class*="buscar"]']) {
      try {
        await page.locator(sel).first().waitFor({ state: 'visible', timeout: 5_000 });
        await page.locator(sel).first().click({ timeout: 5_000 });
        buscarClicado = true;
        console.log(`[${ano}] Buscar clicado.`);
        break;
      } catch { /* tenta próximo */ }
    }

    if (!buscarClicado) {
      console.error(`[${ano}] ✗ Botão Buscar não encontrado — abortando tentativa.`);
      await page.screenshot({ path: `data/estados/debug-df-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
      return false;
    }

    // Aguarda carregamento inicial dos dados
    console.log(`[${ano}] Aguardando dados (15s)...`);
    await page.waitForTimeout(15_000);

    // ── Clicar em Excel ───────────────────────────────────────────────────
    let excelClicado = false;
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
        excelClicado = true;
        console.log(`[${ano}] Excel clicado via "${sel}" — aguardando geração (300s)...`);
        break;
      } catch { /* tenta próximo */ }
    }

    if (!excelClicado) {
      console.error(`[${ano}] ✗ Botão Excel não encontrado — abortando tentativa.`);
      await page.screenshot({ path: `data/estados/debug-df-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
      return false;
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
      await page.screenshot({ path: `data/estados/debug-df-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
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
    await page.screenshot({ path: `data/estados/debug-df-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
    return false;
  } finally {
    await context.close();
    await browser.close();
  }
}

async function downloadAno(ano: number): Promise<boolean> {
  const MAX_TENTATIVAS = 3;
  for (let t = 1; t <= MAX_TENTATIVAS; t++) {
    const ok = await downloadAnoTentativa(ano, t);
    if (ok) return true;
    if (t < MAX_TENTATIVAS) {
      console.log(`[${ano}] Aguardando 15s antes da tentativa ${t + 1}...`);
      await new Promise(r => setTimeout(r, 15_000));
    }
  }
  console.error(`[${ano}] ✗ Falhou após ${MAX_TENTATIVAS} tentativas.`);
  return false;
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
