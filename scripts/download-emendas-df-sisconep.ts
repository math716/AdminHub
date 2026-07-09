/**
 * Baixa os XLS de emendas parlamentares do DF via SISCONEP Cidadão.
 * Uso: ANOS=2025,2026 npx tsx scripts/download-emendas-df-sisconep.ts
 *
 * URL: https://sistemas.df.gov.br/SISCONEPCIDADAO/
 * - Seleciona o ano no dropdown vscomp (data-value="YYYY")
 * - Clica em Buscar
 * - Clica em Excel (link de exportação no topo)
 * - Aguarda o download
 */
import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

const BASE_URL = 'https://sistemas.df.gov.br/SISCONEPCIDADAO/';
const DEST_DIR = path.join('data', 'estados');
const ANOS = (process.env.ANOS ?? '2025,2026').split(',').map(Number).filter(Boolean);

async function downloadAno(ano: number): Promise<boolean> {
  const destFile = path.join(DEST_DIR, `Emendas_DF_${ano}.xls`);
  console.log(`\n[${ano}] Abrindo SISCONEP: ${BASE_URL}`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page    = await context.newPage();

  try {
    await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    console.log(`[${ano}] Página carregada.`);

    // ── Selecionar ano no vscomp ────────────────────────────────────────────
    // O componente vscomp tem opções com [data-value="YYYY"]
    // Precisa clicar no dropdown primeiro para abrir as opções
    const dropdownSel = [
      'vscomp-element',
      '.vscomp-wrapper',
      '[class*="vscomp"]',
    ];

    let dropdownAberto = false;
    for (const sel of dropdownSel) {
      try {
        await page.locator(sel).first().click({ timeout: 5_000 });
        dropdownAberto = true;
        console.log(`[${ano}] Dropdown aberto via "${sel}"`);
        break;
      } catch { /* tenta próximo */ }
    }

    if (!dropdownAberto) {
      // Tenta clicar via texto que contenha "Exercício"
      try {
        await page.getByText(/exerc[íi]cio/i).first().click({ timeout: 5_000 });
        dropdownAberto = true;
        console.log(`[${ano}] Dropdown aberto via texto "Exercício"`);
      } catch { /* continua */ }
    }

    if (dropdownAberto) {
      await page.waitForTimeout(500);

      // Clica na opção do ano desejado
      const optionSels = [
        `[data-value="${ano}"]`,
        `vs-option[data-value="${ano}"]`,
        `.vscomp-option[data-value="${ano}"]`,
      ];

      let anoSelecionado = false;
      for (const sel of optionSels) {
        try {
          await page.locator(sel).first().click({ timeout: 3_000 });
          anoSelecionado = true;
          console.log(`[${ano}] Ano ${ano} selecionado via "${sel}"`);
          break;
        } catch { /* tenta próximo */ }
      }

      if (!anoSelecionado) {
        // Fallback: busca por texto "2024", "2025", etc.
        try {
          await page.getByText(String(ano), { exact: true }).first().click({ timeout: 3_000 });
          anoSelecionado = true;
          console.log(`[${ano}] Ano ${ano} selecionado via texto exato`);
        } catch { /* continua sem selecionar */ }
      }

      if (!anoSelecionado) {
        console.warn(`[${ano}] Não foi possível selecionar o ano — tentando mesmo assim`);
      }
    }

    await page.waitForTimeout(500);

    // ── Clicar em Buscar ───────────────────────────────────────────────────
    const buscarSels = [
      'button:has-text("Buscar")',
      'input[value="Buscar"]',
      '[class*="buscar"]',
    ];

    for (const sel of buscarSels) {
      try {
        await page.locator(sel).first().click({ timeout: 5_000 });
        console.log(`[${ano}] Buscar clicado.`);
        break;
      } catch { /* tenta próximo */ }
    }

    // Aguarda carregamento dos dados (tabela ou spinner desaparecendo)
    console.log(`[${ano}] Aguardando dados (15s)...`);
    await page.waitForTimeout(15_000);

    // ── Clicar em Excel e aguardar download ────────────────────────────────
    const excelSels = [
      'a:has-text("Excel")',
      'button:has-text("Excel")',
      '[title*="Excel"]',
      '[class*="excel"]',
      'a[href*="excel"]',
      'a[href*="xls"]',
    ];

    let download = null;
    for (const sel of excelSels) {
      try {
        const el = page.locator(sel).first();
        await el.waitFor({ timeout: 5_000 });

        // Escuta download tanto na página principal quanto em popups
        const dlPage    = page.waitForEvent('download',    { timeout: 180_000 });
        const dlContext = context.waitForEvent('page', { timeout: 10_000 })
          .then(p => p.waitForEvent('download', { timeout: 180_000 }))
          .catch(() => null);

        await el.click();
        console.log(`[${ano}] Excel clicado via "${sel}" — aguardando download (180s)...`);

        const result = await Promise.race([dlPage, dlContext]);
        if (result) {
          download = result;
          console.log(`[${ano}] Download capturado via "${sel}"`);
        }
        break;
      } catch { /* tenta próximo */ }
    }

    if (!download) {
      // Última tentativa: aguarda mais 120s por download tardio (o modal "Gerando Excel" pode demorar)
      console.log(`[${ano}] Aguardando download tardio (120s)...`);
      try {
        download = await page.waitForEvent('download', { timeout: 120_000 });
        console.log(`[${ano}] Download capturado na espera adicional.`);
      } catch { /* nenhum download */ }
    }

    if (!download) {
      await page.screenshot({ path: `data/estados/debug-df-${ano}.png`, fullPage: true }).catch(() => {});
      console.error(`[${ano}] ✗ Botão Excel não encontrado (screenshot salvo)`);
      return false;
    }

    await download.saveAs(destFile);

    // Valida se o arquivo tem conteúdo mínimo (>2KB)
    const size = fs.statSync(destFile).size;
    if (size < 2_048) {
      console.error(`[${ano}] ✗ Arquivo muito pequeno (${size} bytes) — possivelmente inválido`);
      fs.unlinkSync(destFile);
      return false;
    }

    const kb = (size / 1024).toFixed(0);
    console.log(`[${ano}] ✓ Salvo: ${destFile} (${kb} KB)`);
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
