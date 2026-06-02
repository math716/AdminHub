"""
Importa emendas parlamentares estaduais do Tocantins (TO).

Fonte: data/estados/EMENDAS_TO_2021_A_2026.xls
  (arquivo HTML disfarçado de XLS — parseado via regex)

Colunas:
  0  Número         → idPortal / numero (ex: 010408.00001/2021)
  1  Data Abertura  → ano extraído
  2  Parlamentar    → parlamentar.nome
  3  Órgão Concedente → area
  4  Objeto da Emenda → objeto
  5  Proponente     → município via lookup no banco
  6  Natureza Despesa → tipo
  7  Valor          → valorEmpenhado (R$300.000,00)
  8  Nota de Empenho → (ignorado)
  9  Ordem Bancária → (ignorado)
 10  Situação       → (ignorado)
"""

import sys, os, re, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

XLS_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados',
                        'EMENDAS_TO_2021_A_2026.xls')

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF     = 'TO'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# ── Órgão → área ──────────────────────────────────────────────────────────────

ORGAO_AREA: dict[str, str] = {
    'SAÚDE':            'SAUDE',
    'SAUDE':            'SAUDE',
    'EDUCAÇÃO':         'EDUCACAO',
    'EDUCACAO':         'EDUCACAO',
    'SEDUC':            'EDUCACAO',
    'UNIVERSIDADE':     'EDUCACAO',
    'SEGURANÇA':        'SEGURANCA',
    'SEGURANCA':        'SEGURANCA',
    'BOMBEIROS':        'SEGURANCA',
    'CIDADANIA E JUSTIÇA': 'ASSISTENCIA_SOCIAL',
    'SOCIAL':           'ASSISTENCIA_SOCIAL',
    'HABITAÇÃO':        'HABITACAO',
    'HABITACAO':        'HABITACAO',
    'CIDADES':          'INFRAESTRUTURA',
    'TRANSPORTES':      'INFRAESTRUTURA',
    'OBRAS':            'INFRAESTRUTURA',
    'AGRICULTURA':      'AGRICULTURA',
    'PECUÁRIA':         'AGRICULTURA',
    'MEIO AMBIENTE':    'MEIO_AMBIENTE',
    'RECURSOS HÍDRICOS':'MEIO_AMBIENTE',
    'ESPORTES':         'ESPORTE',
    'JUVENTUDE':        'ESPORTE',
    'TURISMO':          'OUTROS',
    'CULTURA':          'CULTURA',
    'TRABALHO':         'OUTROS',
}

def area_de_orgao(orgao: str) -> str:
    o = orgao.upper()
    for keyword, area in ORGAO_AREA.items():
        if keyword in o:
            return area
    return 'OUTROS'

# ── Helpers ────────────────────────────────────────────────────────────────────

def sem_acento(s: str) -> str:
    s = s.replace('-', ' ')
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

def normalizar_nome(s: str) -> str:
    if not s:
        return s
    stop = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos'}
    words = s.strip().lower().split()
    return ' '.join(
        w.capitalize() if i == 0 or w not in stop else w
        for i, w in enumerate(words)
    )

def to_float(v: str) -> float:
    if not v:
        return 0.0
    try:
        s = re.sub(r'[R$\s]', '', v).replace('.', '').replace(',', '.')
        return float(s)
    except (ValueError, TypeError):
        return 0.0

def cuid_like() -> str:
    import random, string, time
    ts   = hex(int(time.time() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
    return 'c' + ts + rand

# ── Parse HTML ─────────────────────────────────────────────────────────────────

def parse_xls_html(path: str) -> list[list[str]]:
    with open(path, encoding='latin-1', errors='replace') as f:
        content = f.read()
    rows_html = re.findall(r'<tr[^>]*>(.*?)</tr>', content, re.DOTALL | re.IGNORECASE)
    result = []
    for tr in rows_html:
        cells = re.findall(r'<t[dh][^>]*>(.*?)</t[dh]>', tr, re.DOTALL | re.IGNORECASE)
        parsed = [re.sub(r'<[^>]+>', '', c).strip() for c in cells]
        if len(parsed) >= 8 and parsed[0] not in ('Número', 'RELATÓRIO DE EMENDAS PARLAMENTARES', ''):
            result.append(parsed)
    return result

# ── Lookup de município ────────────────────────────────────────────────────────

def build_municipio_lookup(cur) -> tuple[dict, list]:
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'TO'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    nomes_ord = sorted(ibge_map.keys(), key=len, reverse=True)
    return ibge_map, nomes_ord

def achar_municipio(texto: str, ibge_map: dict, nomes_ord: list):
    t = sem_acento(texto.upper())
    # Remove sufixos comuns que atrapalham o match
    t = re.sub(r'\bDO TOCANTINS\b|\bDE TOCANTINS\b|/TO\b', '', t)
    for nome in nomes_ord:
        if re.search(r'\b' + re.escape(nome) + r'\b', t):
            return normalizar_nome(nome), ibge_map[nome]
    return None, None

# ── Upsert ─────────────────────────────────────────────────────────────────────

INSERT_SQL = """
    INSERT INTO emendas_parlamentares (
        id, "idPortal", esfera, ano, numero, tipo, funcao, area,
        objeto, "orgaoExecutor", beneficiario, "cnpjBeneficiario",
        uf, "codigoIbge", "municipioNome",
        "valorEmpenhado", "valorPago", "valorProposto", "valorRestoPago",
        "parlamentarId", "fetchedAt", "updatedAt"
    ) VALUES (
        %s, %s, %s, %s, %s, %s, %s, %s,
        %s, %s, %s, %s,
        %s, %s, %s,
        %s, %s, %s, 0,
        %s, %s, %s
    )
    ON CONFLICT ("idPortal") DO UPDATE SET
        esfera           = EXCLUDED.esfera,
        ano              = EXCLUDED.ano,
        tipo             = EXCLUDED.tipo,
        funcao           = EXCLUDED.funcao,
        area             = EXCLUDED.area,
        objeto           = EXCLUDED.objeto,
        "orgaoExecutor"  = EXCLUDED."orgaoExecutor",
        uf               = EXCLUDED.uf,
        "codigoIbge"     = EXCLUDED."codigoIbge",
        "municipioNome"  = EXCLUDED."municipioNome",
        "valorEmpenhado" = EXCLUDED."valorEmpenhado",
        "valorPago"      = EXCLUDED."valorPago",
        "valorProposto"  = EXCLUDED."valorProposto",
        "parlamentarId"  = EXCLUDED."parlamentarId",
        "updatedAt"      = EXCLUDED."updatedAt"
"""

def reconectar():
    c = psycopg2.connect(DATABASE_URL)
    return c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando ao banco…')
    conn, cur = reconectar()

    ibge_map, nomes_ord = build_municipio_lookup(cur)
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios TO no banco.')

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados TO já no banco.')

    now = datetime.utcnow()

    # ── 1. Parse HTML ──────────────────────────────────────────────────────────
    print(f'[{datetime.now():%H:%M:%S}] Lendo HTML (XLS disfarçado)…')
    rows_raw = parse_xls_html(XLS_FILE)
    print(f'[{datetime.now():%H:%M:%S}] {len(rows_raw)} linhas brutas.')

    todas: list[dict] = []
    parls_novos: dict[str, dict] = {}
    sem_muni = 0
    por_ano: dict[int, int] = {}

    for row in rows_raw:
        numero   = row[0].strip()
        data_str = row[1].strip()
        parl_raw = row[2].strip()
        orgao    = row[3].strip()
        objeto   = row[4].strip()
        propon   = row[5].strip()
        tipo_raw = row[6].strip() if len(row) > 6 else ''
        valor_raw= row[7].strip() if len(row) > 7 else ''

        if not numero or not parl_raw:
            continue

        # Ano: extraído do número da emenda (ex: 010408.00001/2021) ou da data
        m_ano = re.search(r'/(\d{4})$', numero)
        if m_ano:
            ano = int(m_ano.group(1))
        else:
            m_data = re.match(r'\d{2}/\d{2}/(\d{4})', data_str)
            ano = int(m_data.group(1)) if m_data else 0
        if ano < 2018 or ano > 2030:
            continue

        valor = to_float(valor_raw)
        area  = area_de_orgao(orgao)

        # Município: busca no Proponente + Objeto
        muni_nome, codigo_ibge = achar_municipio(propon + ' ' + objeto, ibge_map, nomes_ord)
        if not muni_nome:
            sem_muni += 1

        parl_upper = parl_raw.upper()
        if parl_upper not in parl_map and parl_upper not in parls_novos:
            parls_novos[parl_upper] = {
                'id':      cuid_like(),
                'nome':    normalizar_nome(parl_raw),
                'partido': None,
                'uf':      UF,
                'cargo':   CARGO,
            }

        por_ano[ano] = por_ano.get(ano, 0) + 1
        todas.append({
            'idPortal':      numero,
            'numero':        numero,
            'ano':           ano,
            'tipo':          tipo_raw[:100] if tipo_raw else None,
            'funcao':        orgao[:100]    if orgao    else None,
            'area':          area,
            'objeto':        objeto[:500]   if objeto   else None,
            'orgao':         orgao[:100]    if orgao    else None,
            'beneficiario':  propon[:200]   if propon   else None,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valEmp':        valor,
            'valPago':       valor,
            'valProp':       valor,
            'parlUpper':     parl_upper,
            'parlNome':      normalizar_nome(parl_raw),
        })

    total_com_muni = len(todas) - sem_muni
    pct = total_com_muni * 100 // len(todas) if todas else 0
    print(f'[{datetime.now():%H:%M:%S}] {len(todas)} emendas válidas | sem município: {sem_muni} ({100-pct}%)')
    print(f'  Por ano: {dict(sorted(por_ano.items()))}')

    # ── 2. Novos parlamentares ─────────────────────────────────────────────────
    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    for pu, p in parls_novos.items():
        cur.execute("""
            INSERT INTO parlamentares (id, nome, partido, uf, cargo, ativo, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, true, %s, %s)
            ON CONFLICT DO NOTHING
        """, (p['id'], p['nome'], p['partido'], p['uf'], p['cargo'], now, now))
        parl_map[pu] = p['id']
    conn.commit()

    # ── 3. Upsert emendas ─────────────────────────────────────────────────────
    total     = len(todas)
    inseridas = 0
    for i in range(0, total, BATCH):
        batch = todas[i:i + BATCH]
        tentativas = 0
        while True:
            try:
                for e in batch:
                    parl_id = parl_map.get(e['parlUpper'])
                    cur.execute(INSERT_SQL, (
                        cuid_like(),
                        e['idPortal'], ESFERA, e['ano'], e['numero'],
                        e['tipo'], e['funcao'], e['area'],
                        e['objeto'], e['orgao'], e['beneficiario'], e['cnpj'],
                        UF, e['codigoIbge'], e['municipioNome'],
                        e['valEmp'], e['valPago'], e['valProp'],
                        parl_id, now, now,
                    ))
                conn.commit()
                inseridas += len(batch)
                break
            except psycopg2.OperationalError:
                tentativas += 1
                if tentativas > 3: raise
                print(f'\n  Reconectando ({tentativas}/3)…')
                try: conn.close()
                except Exception: pass
                conn, cur = reconectar()

        pct = inseridas * 100 // total
        print(f'  {inseridas}/{total} ({pct}%)…', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas TO importadas.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
