"""
Lê os JSONs capturados pelo scrape-powerbi-pr.py e tenta extrair:
  - parlamentar, município, valor, ano, número de emenda

Salva um CSV consolidado em data/estados/emendas_PR_powerbi.csv
"""

import json, csv, sys, re
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

RAW_DIR  = Path(__file__).parent.parent / 'data' / 'estados' / 'powerbi_pr_raw'
OUT_CSV  = Path(__file__).parent.parent / 'data' / 'estados' / 'emendas_PR_powerbi.csv'

def flatten_value(v):
    """Extrai valor escalar de um nó do Power BI (pode ser dict com 'Value')."""
    if isinstance(v, dict):
        return v.get('Value', v.get('value', str(v)))
    return v

def extract_rows_from_pbi_json(data: dict) -> list[dict]:
    """Tenta extrair linhas de tabela dos formatos conhecidos do Power BI."""
    rows = []

    # Formato executeSemanticQuery → results[0].result.data.dsr.DS[0].PH[0].DM0
    try:
        ds = data['results'][0]['result']['data']['dsr']['DS']
        for dataset in ds:
            for ph in dataset.get('PH', []):
                for dm_key in ['DM0', 'DM1', 'DM2']:
                    if dm_key not in ph:
                        continue
                    cols = None
                    # Pega schema de colunas no ValueDicts ou IS
                    for item in ph[dm_key]:
                        if 'S' in item:
                            cols = [c.get('N', f'col{i}') for i, c in enumerate(item['S'])]
                        if cols and 'C' in item:
                            row = {}
                            for ci, val in enumerate(item['C']):
                                if ci < len(cols):
                                    row[cols[ci]] = flatten_value(val)
                            if row:
                                rows.append(row)
        if rows:
            return rows
    except (KeyError, IndexError, TypeError):
        pass

    # Formato querydata → resultado diferente
    try:
        for result in data.get('results', []):
            tables = result.get('tables', [])
            for table in tables:
                col_names = [c['name'] for c in table.get('columns', [])]
                for r in table.get('rows', []):
                    rows.append(dict(zip(col_names, r)))
        if rows:
            return rows
    except (KeyError, TypeError):
        pass

    # Formato modelsAndExploration — schema, não dados
    return rows


def main():
    files = sorted(RAW_DIR.glob('*.json'))
    if not files:
        print(f'Nenhum arquivo JSON em {RAW_DIR}')
        print('Execute primeiro: python scripts/scrape-powerbi-pr.py')
        return

    print(f'Processando {len(files)} arquivos JSON...\n')

    all_rows   = []
    all_cols   = set()
    file_stats = []

    for f in files:
        try:
            data = json.loads(f.read_text(encoding='utf-8'))
        except Exception as e:
            print(f'  {f.name}: erro ao ler — {e}')
            continue

        rows = extract_rows_from_pbi_json(data)
        file_stats.append((f.name, len(rows), list(rows[0].keys()) if rows else []))

        if rows:
            all_cols.update(rows[0].keys())
            all_rows.extend(rows)
            print(f'  {f.name}: {len(rows)} linhas, colunas: {list(rows[0].keys())}')
        else:
            # Mostra estrutura top-level para diagnóstico
            top_keys = list(data.keys()) if isinstance(data, dict) else ['[lista]']
            print(f'  {f.name}: sem linhas extraídas — keys: {top_keys}')

    if not all_rows:
        print('\n⚠  Nenhuma linha de dados encontrada nos JSONs.')
        print('Os arquivos capturados podem ser de schema/metadata, não de dados.')
        print('\nEstrutura dos arquivos encontrados:')
        for f in files[:5]:
            data = json.loads(f.read_text(encoding='utf-8'))
            print(f'\n  {f.name}:')
            print(f'    {json.dumps(data, ensure_ascii=False)[:300]}')
        return

    print(f'\nTotal: {len(all_rows)} linhas, {len(all_cols)} colunas')
    print(f'Colunas: {sorted(all_cols)}')

    # Salva CSV
    cols_sorted = sorted(all_cols)
    with open(OUT_CSV, 'w', encoding='utf-8-sig', newline='') as f:
        w = csv.DictWriter(f, fieldnames=cols_sorted, extrasaction='ignore')
        w.writeheader()
        w.writerows(all_rows)

    print(f'\n✅ CSV salvo: {OUT_CSV}')
    print(f'   {len(all_rows)} linhas, {len(all_cols)} colunas')
    print('\nAmostra das primeiras 3 linhas:')
    for row in all_rows[:3]:
        print(f'  {row}')


if __name__ == '__main__':
    main()
