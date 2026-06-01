"""
Extrai dados do relatório Power BI de emendas parlamentares PR.

Estratégia:
  1. Abre o relatório num browser Chromium via Playwright (visível para você acompanhar)
  2. Intercepta todas as chamadas à API interna do Power BI (querydata / executeSemanticQuery)
  3. Salva cada resposta JSON em data/estados/powerbi_pr_raw/
  4. Após capturar o layout inicial, tenta trocar o filtro de ano para 2021–2026
     e capturar os dados de cada período

Pré-requisitos:
  pip install playwright
  python -m playwright install chromium

Uso:
  python scripts/scrape-powerbi-pr.py

Os arquivos JSON ficam em data/estados/powerbi_pr_raw/.
Depois rode  python scripts/parse-powerbi-pr.py  para converter em CSV.
"""

import asyncio, json, os, re, sys, time
from pathlib import Path
from playwright.async_api import async_playwright, Response

sys.stdout.reconfigure(encoding='utf-8')

URL     = ('https://app.powerbi.com/view?r='
           'eyJrIjoiN2UzN2UyMTQtODgxMC00N2NiLWE1NzQtZjFkYmZkZWQ0YzVmIiwidCI6ImY3'
           'MGEwYWY2LWRhMGYtNDViZS1iN2VkLTlmOGMxYjI0YmZkZiIsImMiOjR9')

OUT_DIR = Path(__file__).parent.parent / 'data' / 'estados' / 'powerbi_pr_raw'
OUT_DIR.mkdir(parents=True, exist_ok=True)

# Padrões de URL que carregam dados reais
DATA_PATTERNS = [
    'querydata',
    'executeSemanticQuery',
    'modelsAndExploration',
    'conceptualschema',
    'datamodel',
]

captured: list[dict] = []

async def handle_response(response: Response):
    """Intercepta respostas da API do Power BI e salva."""
    url = response.url
    if not any(p in url for p in DATA_PATTERNS):
        return
    try:
        ct = response.headers.get('content-type', '')
        if 'json' not in ct:
            return
        body = await response.json()
        ts   = int(time.time() * 1000)
        slug = re.sub(r'[^a-z0-9]', '_', url.split('/')[-1].split('?')[0].lower())[:40]
        fname = OUT_DIR / f'{ts}_{slug}.json'
        fname.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding='utf-8')
        captured.append({'url': url, 'file': str(fname)})
        print(f'  [capturado] {fname.name}  ({url[:80]})')
    except Exception as e:
        pass  # respostas binárias ou sem JSON — ignora


async def main():
    print(f'Salvando em: {OUT_DIR}')
    print('Abrindo browser... (NÃO feche a janela durante a captura)\n')

    async with async_playwright() as p:
        browser = await p.chromium.launch(
            headless=False,          # visível para acompanhar
            args=['--start-maximized'],
        )
        ctx  = await browser.new_context(viewport={'width': 1600, 'height': 900})
        page = await ctx.new_page()
        page.on('response', handle_response)

        print(f'[1/4] Carregando relatório: {URL[:60]}...')
        await page.goto(URL, timeout=60_000)
        await page.wait_for_timeout(8_000)   # aguarda o relatório renderizar

        print(f'[2/4] Captura inicial: {len(captured)} respostas.')

        # ── Tenta localizar e interagir com filtro de ano ──────────────────────
        # Power BI filtros costumam ser <div> ou <button> com texto de ano
        anos = [2021, 2022, 2023, 2024, 2025, 2026]
        print('[3/4] Procurando filtro de ano no relatório...')

        for ano in anos:
            print(f'  → tentando selecionar ano {ano}...')
            antes = len(captured)

            # Estratégia 1: clica em elemento com o texto do ano
            try:
                loc = page.locator(f'text="{ano}"').first
                if await loc.is_visible(timeout=2000):
                    await loc.click()
                    await page.wait_for_timeout(4_000)
                    print(f'     clicou em "{ano}" — +{len(captured)-antes} respostas capturadas')
                    continue
            except Exception:
                pass

            # Estratégia 2: procura slicer/dropdown com o ano
            try:
                loc2 = page.locator(f'[aria-label*="{ano}"], [title*="{ano}"]').first
                if await loc2.is_visible(timeout=1500):
                    await loc2.click()
                    await page.wait_for_timeout(4_000)
                    print(f'     clicou via aria-label "{ano}" — +{len(captured)-antes} respostas')
                    continue
            except Exception:
                pass

            print(f'     ano {ano} não encontrado automaticamente')

        print(f'\n[4/4] Total de respostas capturadas: {len(captured)}')

        if not captured:
            print('\n⚠  Nenhum dado capturado automaticamente.')
            print('   O relatório pode precisar de interação manual.')
            print('   Interaja com os filtros/visuais na janela aberta,')
            print('   que cada clique vai capturar mais dados automaticamente.')
            print('   Pressione ENTER aqui quando terminar de explorar o relatório.')
            input()
        else:
            print('\nAguardando 5s para capturar dados finais...')
            await page.wait_for_timeout(5_000)

        await browser.close()

    # ── Relatório final ────────────────────────────────────────────────────────
    print(f'\n=== Arquivos salvos em {OUT_DIR} ===')
    for item in captured:
        print(f'  {Path(item["file"]).name}')

    print(f'\nTotal: {len(captured)} arquivos JSON.')
    print('Execute agora:  python scripts/parse-powerbi-pr.py')


if __name__ == '__main__':
    asyncio.run(main())
