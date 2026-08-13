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

// Textos possíveis para o botão de download
const TEXTOS_BOTAO = ['Baixar os dados', 'Exportar dados', 'Export data', 'Download'];

// Textos possíveis no modal de confirmação que o Power BI mostra após clicar em exportar
const TEXTOS_CONFIRMACAO = [
  'Dados subjacentes', 'Underlying data',
  'Dados resumidos',   'Summarized data',
  'Exportar',          'Export',
  'OK', 'Confirmar',
];

const DEST_DIR = path.join('data', 'estados');
const ANOS = (process.env.ANOS ?? '2025,2026').split(',').map(Number).filter(Boolean);

async function downloadAnoTentativa(ano: number, tentativa: number): Promise<boolean> {
  const url = PAINEIS[ano];
  if (!url) { console.error(`[${ano}] Sem URL configurada`); return false; }

  const destFile = path.join(DEST_DIR, `Emendas_Impositivas_${ano}.xlsx`);
  console.log(`\n[${ano}] Abrindo Power BI (tentativa ${tentativa}): ${url.slice(0, 80)}...`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();

  // ── Fallback: intercepta respostas HTTP que pareçam XLSX ─────────────────
  let responseBuffer: Buffer | null = null;
  page.on('response', async (response) => {
    if (responseBuffer) return;
    const ct  = response.headers()['content-type'] ?? '';
    const cd  = response.headers()['content-disposition'] ?? '';
    const isXlsx =
      ct.includes('spreadsheetml') ||
      ct.includes('excel') ||
      ct.includes('octet-stream') ||
      cd.toLowerCase().includes('.xlsx') ||
      cd.toLowerCase().includes('.xls');
    if (!isXlsx) return;
    try {
      const body = await response.body();
      // Valida magic bytes XLSX (PK\x03\x04)
      if (body.length > 1_000 && body[0] === 0x50 && body[1] === 0x4b) {
        responseBuffer = body;
        console.log(`[${ano}] Arquivo interceptado via response: ${body.length} bytes`);
      }
    } catch { /* corpo já consumido */ }
  });

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });

    console.log(`[${ano}] Aguardando renderização (60s)...`);
    await page.waitForTimeout(60_000);

    // ── Procura o botão de download na página e em todos os iframes ─────────
    const frames = [page.mainFrame(), ...page.frames()];
    let downloadEvent: any = null;
    let botaoEncontrado = false;

    outer: for (const frame of frames) {
      for (const texto of TEXTOS_BOTAO) {
        try {
          const btn = frame.getByText(texto, { exact: false });
          await btn.waitFor({ timeout: 3_000 });
          console.log(`[${ano}] Botão encontrado: "${texto}" (frame: ${frame.url().slice(0, 60)})`);
          botaoEncontrado = true;

          // Prepara listener de download ANTES de clicar
          const dlPromise = page.waitForEvent('download', { timeout: 90_000 });

          await btn.click();
          console.log(`[${ano}] Botão clicado — procurando modal de confirmação...`);

          // Aguarda um instante para o modal aparecer
          await page.waitForTimeout(2_000);

          // Tenta confirmar o modal em TODOS os frames (inclusive o mesmo onde estava o botão)
          let modalConfirmado = false;
          for (const textoConf of TEXTOS_CONFIRMACAO) {
            for (const f of [frame, ...page.frames()]) {
              try {
                const item = f.getByText(textoConf, { exact: false }).first();
                await item.waitFor({ timeout: 2_000 });
                await item.click();
                console.log(`[${ano}] Modal confirmado via "${textoConf}"`);
                modalConfirmado = true;
                break;
              } catch { /* tenta próximo */ }
            }
            if (modalConfirmado) break;
          }

          if (!modalConfirmado) {
            console.log(`[${ano}] Modal não encontrado — pode não ser necessário ou já foi dispensado.`);
          }

          // Aguarda download nativo OU resposta interceptada
          console.log(`[${ano}] Aguardando download (90s)...`);
          const result = await Promise.race([
            dlPromise.then(dl => ({ tipo: 'download', dl } as const)).catch(() => null),
            new Promise<{ tipo: 'response' } | null>(resolve => {
              const check = setInterval(() => {
                if (responseBuffer) { clearInterval(check); resolve({ tipo: 'response' }); }
              }, 500);
              setTimeout(() => { clearInterval(check); resolve(null); }, 90_000);
            }),
          ]);

          if (result?.tipo === 'download') {
            downloadEvent = result.dl;
          }

          break outer;
        } catch { /* botão não encontrado neste frame, tenta próximo */ }
      }
    }

    if (!botaoEncontrado) {
      console.error(`[${ano}] ✗ Botão de download não encontrado em nenhum frame.`);
      await page.screenshot({ path: `data/estados/debug-sp-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
      return false;
    }

    // ── Salva o arquivo (download nativo ou buffer interceptado) ────────────
    if (downloadEvent) {
      await downloadEvent.saveAs(destFile);
      console.log(`[${ano}] Salvo via download nativo.`);
    } else if (responseBuffer) {
      fs.writeFileSync(destFile, responseBuffer);
      console.log(`[${ano}] Salvo via resposta interceptada.`);
    } else {
      console.error(`[${ano}] ✗ Download não concluído após 90s.`);
      await page.screenshot({ path: `data/estados/debug-sp-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
      return false;
    }

    // ── Valida magic bytes XLSX ──────────────────────────────────────────────
    const buf = fs.readFileSync(destFile).slice(0, 4);
    if (buf[0] !== 0x50 || buf[1] !== 0x4b) {
      console.error(`[${ano}] ✗ Arquivo inválido (não é XLSX)`);
      fs.unlinkSync(destFile);
      return false;
    }

    const kb = (fs.statSync(destFile).size / 1024).toFixed(0);
    console.log(`[${ano}] ✓ Salvo: ${destFile} (${kb} KB)`);
    return true;
  } catch (e) {
    console.error(`[${ano}] ✗ Erro:`, e);
    await page.screenshot({ path: `data/estados/debug-sp-${ano}-t${tentativa}.png`, fullPage: true }).catch(() => {});
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
      console.log(`[${ano}] Aguardando 20s antes da tentativa ${t + 1}...`);
      await new Promise(r => setTimeout(r, 20_000));
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
