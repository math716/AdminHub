"""
Extrai dados de emendas parlamentares do PR via API direta do Power BI.

Não precisa de browser/Playwright — usa as credenciais públicas do relatório.

Pré-requisitos:
  pip install requests

Uso:
  python scripts/scrape-powerbi-pr.py

Saída:
  data/estados/powerbi_pr_raw/*.json   (páginas brutas)
  data/estados/emendas_PR_powerbi.csv  (consolidado final)
"""

import requests, json, csv, sys, time, argparse
from pathlib import Path

sys.stdout.reconfigure(encoding='utf-8')

# ── Argumentos CLI ────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description='Extrai emendas PR do Power BI')
parser.add_argument('--anos', default='', help='Anos separados por vírgula (ex: 2024,2025). Vazio = todos.')
ARGS = parser.parse_args()

# ── Credenciais capturadas do DevTools ────────────────────────────────────────
RESOURCE_KEY = "7a5c4f7a-8c02-4434-aa1a-9f373c26fea0"
MODEL_ID      = 6960064
BASE_URL      = "https://wabi-brazil-south-b-primary-api.analysis.windows.net"

HEADERS = {
    "X-PowerBI-ResourceKey": RESOURCE_KEY,
    "Content-Type": "application/json;charset=UTF-8",
    "Accept": "application/json, text/plain, */*",
    "Origin": "https://app.powerbi.com",
    "Referer": "https://app.powerbi.com/",
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
}

RAW_DIR  = Path(__file__).parent.parent / "data" / "estados" / "powerbi_pr_raw"
DATA_DIR = Path(__file__).parent.parent / "data" / "estados"
RAW_DIR.mkdir(parents=True, exist_ok=True)
DATA_DIR.mkdir(parents=True, exist_ok=True)

ANOS_DISPONIVEIS = [2020, 2021, 2022, 2023, 2024, 2025, 2026]

PAGE_SIZE = 500   # linhas por requisição (máximo aceito pelo Power BI)

# ── Schema descoberto via model.json ─────────────────────────────────────────
# Tabela principal e colunas extraídas dos visualContainers do relatório
TABELA = "Emendas"
COLUNAS = [
    "Nome do Autor da Emenda",
    "Código da Emenda",
    "Ano da Emenda",
    "Valor Pago",
    "Favorecido",
    "UF Favorecido",
    "Código UG",
    "Código Documento",
    "Código Unidade Orçamentária",
    "Órgão",
    "Órgão Superior",
    "Tipo de Emendas B-C-I",
    "Categoria Econômica",
    "Categoria CONCATENADA",
    "Fontes de Recursos GOV",
    "Programa CONCATENADA",
    "Ação CONCATENADA",
    "Função CONCATENADA",
    "SubFunção CONCATENADA",
    "Grupo de Despes CONCATENADA",
    "Modalidade de Aplicação CONCATENADA",
    "Elemento Despesa CONCATENADA",
    "Transferencias SIM NAO",
    "Possui convênio?",
    "CO",
]


# ── 2. Consulta paginada ───────────────────────────────────────────────────────

def build_query(table: str, columns: list[str], ano: int | None = None, restart_tokens: list | None = None) -> dict:
    """Monta payload para POST /querydata com paginação e filtro opcional de ano."""
    from_clause  = [{"Name": "t", "Entity": table, "Type": 0}]
    select_clause = [
        {
            "Column": {
                "Expression": {"SourceRef": {"Source": "t"}},
                "Property": col,
            },
            "Name": f"t.{col}",
        }
        for col in columns
    ]
    projections = list(range(len(columns)))

    query: dict = {
        "Version": 2,
        "From": from_clause,
        "Select": select_clause,
    }

    # Filtro de ano via coluna "Ano da Emenda"
    if ano:
        query["Where"] = [
            {
                "Condition": {
                    "Comparison": {
                        "ComparisonKind": 0,   # Equal
                        "Left": {
                            "Column": {
                                "Expression": {"SourceRef": {"Source": "t"}},
                                "Property": "Ano da Emenda",
                            }
                        },
                        "Right": {"Literal": {"Value": f"{ano}L"}},
                    }
                }
            }
        ]

    binding: dict = {
        "Primary": {"Groupings": [{"Projections": projections}]},
        "DataReduction": {
            "DataVolume": 4,
            "Primary": {"Window": {"Count": PAGE_SIZE}},
        },
        "Version": 1,
    }
    if restart_tokens:
        binding["DataReduction"]["Primary"]["Window"]["RestartTokens"] = restart_tokens

    return {
        "version": "1.0.0",
        "cancelQueries": [],
        "modelId": MODEL_ID,
        "queries": [
            {
                "Query": {
                    "Commands": [
                        {
                            "SemanticQueryDataShapeCommand": {
                                "Query": query,
                                "Binding": binding,
                            }
                        }
                    ]
                },
                "QueryId": "",
            }
        ],
    }


def parse_dsr(body: dict, columns: list[str]) -> tuple[list[dict], list | None]:
    """
    Extrai linhas do formato DSR do Power BI.

    Lida com:
    - ValueDicts: colunas de texto são armazenadas como índice num dicionário
    - R bitmask: indica quais colunas repetir da linha anterior (carry-forward)
    - Paginação via RestartTokens

    Retorna (linhas, restart_tokens_para_proxima_pagina).
    """
    rows: list[dict] = []
    restart_tokens = None

    try:
        ds_list = body["results"][0]["result"]["data"]["dsr"]["DS"]
    except (KeyError, IndexError, TypeError):
        return rows, None

    for dataset in ds_list:
        value_dicts: dict = dataset.get("ValueDicts", {})

        for ph in dataset.get("PH", []):
            for dm_key in ("DM0", "DM1", "DM2"):
                dm = ph.get(dm_key)
                if not dm:
                    continue

                # Schema: lista de {N, T, DN?}
                schema: list[dict] = []
                # Linha anterior (para carry-forward)
                prev_raw: list = []

                for item in dm:
                    # Atualiza schema quando presente
                    if "S" in item:
                        schema = item["S"]
                        prev_raw = []

                    if not schema or "C" not in item:
                        continue

                    num_cols = len(schema)
                    r_mask   = item.get("R", 0)
                    c_vals   = item["C"]

                    # Expande C usando o bitmask R:
                    # bit i = 1 → coluna i repete da linha anterior
                    raw: list = []
                    c_idx = 0
                    for col_i in range(num_cols):
                        if r_mask & (1 << col_i):
                            # carry-forward
                            raw.append(prev_raw[col_i] if col_i < len(prev_raw) else None)
                        else:
                            raw.append(c_vals[c_idx] if c_idx < len(c_vals) else None)
                            c_idx += 1

                    prev_raw = raw

                    # Resolve índices de ValueDicts para strings reais
                    resolved: list = []
                    for col_i, val in enumerate(raw):
                        dn = schema[col_i].get("DN") if col_i < len(schema) else None
                        if dn and dn in value_dicts and isinstance(val, int):
                            d = value_dicts[dn]
                            val = d[val] if 0 <= val < len(d) else val
                        elif isinstance(val, dict):
                            val = val.get("Value", val.get("value", val))
                        resolved.append(val)

                    # Mapeia G0,G1… → nomes reais das colunas
                    row: dict = {}
                    for col_i, val in enumerate(resolved):
                        col_name = columns[col_i] if col_i < len(columns) else f"col{col_i}"
                        row[col_name] = val if val is not None else ""
                    rows.append(row)

        # Restart token para próxima página
        rt = dataset.get("RT")
        if rt:
            restart_tokens = rt

    return rows, restart_tokens


def fetch_table(table: str, columns: list[str], ano: int | None = None) -> list[dict]:
    """Busca todas as linhas de uma tabela, paginando automaticamente."""
    url     = f"{BASE_URL}/public/reports/querydata?synchronous=true"
    all_rows: list[dict] = []
    restart_tokens = None
    page = 0
    slug = f"{table.replace(' ','_')}_ano{ano}" if ano else table.replace(' ','_')

    while True:
        page += 1
        payload = build_query(table, columns, ano=ano, restart_tokens=restart_tokens)
        print(f"    página {page}… ", end="", flush=True)

        r = requests.post(url, headers=HEADERS, json=payload, timeout=60)
        if not r.ok:
            print(f"ERRO {r.status_code}: {r.text[:200]}")
            break

        body = r.json()

        # Salva JSON bruto para diagnóstico
        fname = RAW_DIR / f"{slug}__p{page:03d}.json"
        fname.write_text(json.dumps(body, ensure_ascii=False, indent=2), encoding="utf-8")

        rows, restart_tokens = parse_dsr(body, columns)
        all_rows.extend(rows)
        print(f"{len(rows)} linhas  (total: {len(all_rows)})")

        if not rows or not restart_tokens:
            break

        time.sleep(0.3)   # respeita o servidor

    return all_rows


# ── 3. Main ────────────────────────────────────────────────────────────────────

def main():
    print("=" * 60)
    print("Extrator Power BI — Emendas Parlamentares PR")
    print("=" * 60)

    # Determina quais anos processar
    if ARGS.anos.strip():
        anos = [int(a.strip()) for a in ARGS.anos.split(',') if a.strip().isdigit()]
    else:
        anos = ANOS_DISPONIVEIS

    print(f"\nTabela  : '{TABELA}'")
    print(f"Colunas : {len(COLUNAS)}")
    print(f"Anos    : {anos}\n")

    csvs_gerados = []

    for ano in anos:
        print(f"\n{'='*50}")
        print(f"  ANO {ano}")
        print(f"{'='*50}")

        rows = fetch_table(TABELA, COLUNAS, ano=ano)

        if not rows:
            print(f"  ⚠  Nenhuma linha para {ano}.")
            continue

        out_csv = DATA_DIR / f"emendas_PR_{ano}.csv"
        all_cols = list(rows[0].keys())
        with open(out_csv, "w", encoding="utf-8-sig", newline="") as f:
            w = csv.DictWriter(f, fieldnames=all_cols, extrasaction="ignore")
            w.writeheader()
            w.writerows(rows)

        print(f"  ✅  {len(rows)} linhas → {out_csv.name}")
        csvs_gerados.append((out_csv, len(rows)))

    print(f"\n{'='*60}")
    print(f"CONCLUÍDO — {len(csvs_gerados)} arquivo(s) gerado(s):")
    for path, n in csvs_gerados:
        print(f"  {path.name}  ({n} linhas)")


if __name__ == "__main__":
    main()
