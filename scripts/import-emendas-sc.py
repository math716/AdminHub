"""
Importa emendas parlamentares estaduais de Santa Catarina (SC).

Fontes:
  - data/estados/emendas_parlamentares_SC.csv → 2024, 2025, 2026
      Colunas: Responsável; Subação; Unidade Gestora; Localização;
               Objeto de Execução; Ano; Planejado PPA; Total Empenhado;
               Total Liquidado; Total Liquidado Restos a Pagar; Total Pago;
               Total Pago Restos a Pagar
      idPortal: código extraído de "Objeto de Execução" (ex.: 2024OE002176)
      Município: extraído do texto do Objeto via lookup no banco

  - data/estados/SC_2023.pdf → 2023
      Colunas tabelares: MUNICÍPIO | AUTOR DA EMENDA | N. EMENDA |
                         VALOR R$   | CLASSIFICAÇÃO DESPESA | OBJETO
      Município: coluna direta

Pré-requisitos:
  pip install pdfplumber psycopg2-binary
"""

import sys, os, re, csv, unicodedata
import psycopg2, psycopg2.extras
import pdfplumber
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

CSV_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados',
                        'emendas_parlamentares_SC.csv')
PDF_2023 = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados',
                        'SC_2023.pdf')

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF     = 'SC'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# ── Subação → área ─────────────────────────────────────────────────────────────

SUBACAO_AREA: dict[str, str] = {
    '14240': 'SAUDE',
    '14227': 'EDUCACAO',
    '15098': 'INFRAESTRUTURA',
    '15097': 'AGRICULTURA',
    '15100': 'SEGURANCA',
    '15382': 'OUTROS',   # Fundo Social
    '14203': 'OUTROS',   # Fundam
}

def area_de_subacao(subacao: str) -> str:
    m = re.search(r'(\d{5})', str(subacao))
    if m:
        return SUBACAO_AREA.get(m.group(1), 'OUTROS')
    t = subacao.lower()
    if 'saúde' in t or 'saude' in t:            return 'SAUDE'
    if 'educação' in t or 'educac' in t:        return 'EDUCACAO'
    if 'infraestrutura' in t or 'mobilidade' in t: return 'INFRAESTRUTURA'
    if 'agricultur' in t:                       return 'AGRICULTURA'
    if 'segurança' in t or 'seguranca' in t:    return 'SEGURANCA'
    return 'OUTROS'

# ── Helpers ────────────────────────────────────────────────────────────────────

def sem_acento(s: str) -> str:
    s = s.replace('-', ' ').replace('\n', ' ')
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

def to_float(v) -> float:
    if not v or str(v).strip() in ('', 'None'):
        return 0.0
    try:
        # Formato BR: R$ 1.234,56  ou  inteiro simples: 100000
        s = re.sub(r'[R$\s]', '', str(v)).replace('.', '').replace(',', '.')
        return float(s)
    except (ValueError, TypeError):
        return 0.0

def cuid_like() -> str:
    import random, string, time
    ts   = hex(int(time.time() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
    return 'c' + ts + rand

# ── Lookup de município por nome ───────────────────────────────────────────────

def build_municipio_lookup(cur) -> tuple[dict, list]:
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'SC'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    nomes_ordenados = sorted(ibge_map.keys(), key=len, reverse=True)
    return ibge_map, nomes_ordenados

def achar_municipio(texto: str, ibge_map: dict, nomes_ord: list):
    """Busca nome de município no texto; retorna (nome_normalizado, codigoIbge)."""
    t = sem_acento(texto.upper())
    for nome in nomes_ord:
        if re.search(r'\b' + re.escape(nome) + r'\b', t):
            return normalizar_nome(nome), ibge_map[nome]
    return None, None

def lookup_direto(municipio_raw: str, ibge_map: dict) -> tuple[str | None, str | None]:
    """Lookup direto por nome exato (para dados do PDF onde a coluna é o município)."""
    key = sem_acento(municipio_raw.upper().strip())
    codigo = ibge_map.get(key)
    if codigo:
        return normalizar_nome(municipio_raw), codigo
    # Tenta sem sufixos como " DO SUL", " DA SERRA" etc.
    # (já coberto pelo sem_acento, não precisa mais)
    return normalizar_nome(municipio_raw), None

# ── Parse CSV (2024 / 2025 / 2026) ────────────────────────────────────────────

def parse_csv(ibge_map: dict, nomes_ord: list) -> list[dict]:
    rows_out = []
    sem_muni = 0
    sem_codigo = 0

    with open(CSV_FILE, encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f, delimiter=';')
        headers = next(reader)
        idx = {h.strip(): i for i, h in enumerate(headers)}
        rows_raw = list(reader)

    print(f'  CSV: {len(rows_raw)} linhas brutas')

    for row in rows_raw:
        if len(row) <= max(idx.values()):
            row += [''] * (max(idx.values()) + 1 - len(row))

        parl_raw = row[idx['Responsável']].strip() if 'Responsável' in idx else ''
        if not parl_raw:
            continue  # linhas agregadas sem parlamentar

        subacao  = row[idx['Subação']].strip()         if 'Subação'              in idx else ''
        objeto   = row[idx['Objeto de Execução']].strip() if 'Objeto de Execução' in idx else ''
        ano_raw  = row[idx['Ano']].strip()             if 'Ano'                  in idx else ''
        val_emp  = to_float(row[idx['Total Empenhado']])  if 'Total Empenhado'   in idx else 0.0
        val_pago = to_float(row[idx['Total Pago']])       if 'Total Pago'        in idx else 0.0

        # Ignora linha agregada de subação (Ano = texto)
        try:
            ano = int(ano_raw)
        except ValueError:
            continue

        # Código da emenda: prefixo "ANOOExxxxxx" no objeto
        m_cod = re.match(r'^(\d{4}OE\d+)', objeto)
        if not m_cod:
            sem_codigo += 1
            continue
        codigo = m_cod.group(1)

        # Texto descritivo após o código (para busca de município)
        descricao = objeto[len(codigo):].lstrip(' -').strip()

        area = area_de_subacao(subacao)

        # Município via lookup no texto completo do objeto
        muni_nome, codigo_ibge = achar_municipio(objeto, ibge_map, nomes_ord)
        if not muni_nome:
            sem_muni += 1

        rows_out.append({
            'idPortal':     codigo,
            'numero':       codigo,
            'ano':          ano,
            'tipo':         'Emenda Individual',
            'funcao':       subacao[:100] if subacao else None,
            'area':         area,
            'objeto':       descricao[:500] if descricao else None,
            'orgao':        None,
            'beneficiario': None,
            'cnpj':         None,
            'codigoIbge':   codigo_ibge,
            'municipioNome': muni_nome,
            'valEmp':       val_emp,
            'valPago':      val_pago,
            'valProp':      max(val_emp, val_pago),
            'parlUpper':    parl_raw.upper(),
            'parlNome':     normalizar_nome(parl_raw),
        })

    print(f'  CSV: {len(rows_out)} emendas válidas | sem município: {sem_muni} | sem código: {sem_codigo}')
    return rows_out

# ── Parse PDF 2023 ─────────────────────────────────────────────────────────────

def parse_pdf_2023(ibge_map: dict, nomes_ord: list) -> list[dict]:
    rows_out = []
    sem_muni = 0
    area_atual = 'OUTROS'

    with pdfplumber.open(PDF_2023) as pdf:
        for page in pdf.pages:
            tables = page.extract_tables()
            for table in tables:
                for row in table:
                    if not row:
                        continue
                    c0 = (row[0] or '').strip()

                    # Detecta seção de área
                    if 'Subação' in c0 or 'SUBAÇÃO' in c0:
                        area_atual = area_de_subacao(c0)
                        continue
                    if 'ANEXO' in c0.upper():
                        area_atual = area_de_subacao(c0)
                        continue

                    # Linha de header
                    if c0 in ('MUNICÍPIO', 'Município', 'MUNICIPIO') or not c0:
                        continue

                    # Precisa de pelo menos 4 colunas: município, autor, nº, valor
                    if len(row) < 4 or not row[1]:
                        continue

                    # Limpa quebras de linha dentro das células
                    municipio_raw = c0.replace('\n', ' ').strip()
                    autor_raw     = (row[1] or '').replace('\n', ' ').strip()
                    num_emenda    = (row[2] or '').replace('\n', ' ').strip()
                    valor_raw     = (row[3] or '').replace('\n', ' ').strip()
                    objeto_raw    = (row[5] or '').replace('\n', ' ').strip() if len(row) > 5 else ''

                    if not municipio_raw or not autor_raw or not num_emenda:
                        continue

                    valor = to_float(valor_raw)

                    # idPortal: SC2023_<numero_emenda> (normalizado)
                    num_limpo  = re.sub(r'[^A-Za-z0-9]', '', num_emenda)
                    id_portal  = f'SC2023_{num_limpo}'

                    # Município: lookup direto; fallback: busca no texto do objeto
                    muni_nome, codigo_ibge = lookup_direto(municipio_raw, ibge_map)
                    if not codigo_ibge and objeto_raw:
                        muni_nome2, codigo_ibge2 = achar_municipio(objeto_raw, ibge_map, nomes_ord)
                        if codigo_ibge2:
                            codigo_ibge = codigo_ibge2
                    if not codigo_ibge:
                        sem_muni += 1

                    rows_out.append({
                        'idPortal':      id_portal,
                        'numero':        num_emenda,
                        'ano':           2023,
                        'tipo':          'Emenda Individual',
                        'funcao':        None,
                        'area':          area_atual,
                        'objeto':        objeto_raw[:500] if objeto_raw else None,
                        'orgao':         None,
                        'beneficiario':  None,
                        'cnpj':          None,
                        'codigoIbge':    codigo_ibge,
                        'municipioNome': muni_nome,
                        'valEmp':        valor,
                        'valPago':       valor,
                        'valProp':       valor,
                        'parlUpper':     autor_raw.upper(),
                        'parlNome':      normalizar_nome(autor_raw),
                    })

    print(f'  PDF 2023: {len(rows_out)} emendas válidas | sem município: {sem_muni}')
    return rows_out

# ── Upsert no banco ────────────────────────────────────────────────────────────

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
        esfera             = EXCLUDED.esfera,
        ano                = EXCLUDED.ano,
        tipo               = EXCLUDED.tipo,
        funcao             = EXCLUDED.funcao,
        area               = EXCLUDED.area,
        objeto             = EXCLUDED.objeto,
        uf                 = EXCLUDED.uf,
        "codigoIbge"       = EXCLUDED."codigoIbge",
        "municipioNome"    = EXCLUDED."municipioNome",
        "valorEmpenhado"   = EXCLUDED."valorEmpenhado",
        "valorPago"        = EXCLUDED."valorPago",
        "valorProposto"    = EXCLUDED."valorProposto",
        "parlamentarId"    = EXCLUDED."parlamentarId",
        "updatedAt"        = EXCLUDED."updatedAt"
"""

def reconectar():
    c = psycopg2.connect(DATABASE_URL)
    return c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def upsert_emendas(emendas: list[dict], parl_map: dict, now: datetime,
                   conn, cur) -> int:
    total     = len(emendas)
    inseridas = 0

    for i in range(0, total, BATCH):
        batch = emendas[i:i + BATCH]
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
                if tentativas > 3:
                    raise
                print(f'\n  Reconectando ({tentativas}/3)…')
                try: conn.close()
                except Exception: pass
                conn, cur = reconectar()

        pct = inseridas * 100 // total
        print(f'  {inseridas}/{total} ({pct}%)…', end='\r', flush=True)

    print()
    return inseridas

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando ao banco…')
    conn, cur = reconectar()

    # Municípios SC
    ibge_map, nomes_ord = build_municipio_lookup(cur)
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios SC no banco.')

    # Parlamentares existentes
    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados SC já no banco.')

    now = datetime.utcnow()

    # ── 1. Parse fontes ────────────────────────────────────────────────────────
    print(f'\n[{datetime.now():%H:%M:%S}] Lendo CSV (2024/2025/2026)…')
    emendas_csv = parse_csv(ibge_map, nomes_ord)

    print(f'[{datetime.now():%H:%M:%S}] Lendo PDF SC_2023…')
    emendas_pdf = parse_pdf_2023(ibge_map, nomes_ord)

    todas = emendas_csv + emendas_pdf
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas para importar.')

    # ── 2. Novos parlamentares ─────────────────────────────────────────────────
    parls_novos: dict[str, dict] = {}
    for e in todas:
        pu = e['parlUpper']
        if pu not in parl_map and pu not in parls_novos:
            parls_novos[pu] = {
                'id':      cuid_like(),
                'nome':    e['parlNome'],
                'partido': None,
                'uf':      UF,
                'cargo':   CARGO,
            }

    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    for pu, p in parls_novos.items():
        cur.execute("""
            INSERT INTO parlamentares (id, nome, partido, uf, cargo, ativo, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, true, %s, %s)
            ON CONFLICT DO NOTHING
        """, (p['id'], p['nome'], p['partido'], p['uf'], p['cargo'], now, now))
        parl_map[pu] = p['id']
    conn.commit()
    print(f'[{datetime.now():%H:%M:%S}] Parlamentares inseridos.')

    # ── 3. Upsert emendas ──────────────────────────────────────────────────────
    # CSV primeiro (2024/2025/2026)
    anos_csv = sorted(set(e['ano'] for e in emendas_csv))
    print(f'\n[{datetime.now():%H:%M:%S}] Importando CSV ({anos_csv})…')
    n_csv = upsert_emendas(emendas_csv, parl_map, now, conn, cur)
    print(f'[{datetime.now():%H:%M:%S}] ✅ {n_csv} emendas do CSV importadas.')

    # PDF 2023
    print(f'[{datetime.now():%H:%M:%S}] Importando PDF 2023…')
    n_pdf = upsert_emendas(emendas_pdf, parl_map, now, conn, cur)
    print(f'[{datetime.now():%H:%M:%S}] ✅ {n_pdf} emendas do PDF 2023 importadas.')

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ Total: {n_csv + n_pdf} emendas SC importadas.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
