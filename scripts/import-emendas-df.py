"""
Importa emendas parlamentares estaduais do Distrito Federal (DF).

Fontes: data/estados/DF_2021.csv … DF_2026.csv
  Encoding: cp1252 (2021-2025), utf-8-sig (2026)
  Delimiter: TAB (2021-2025), semicolon (2026)
  Nota 2025: cada linha está envolta em aspas externas — strip necessário.
  Nota 2026: primeira linha é título, headers na linha 2.

Colunas (col idx):
  0  Autor         → parlamentar.nome
  1  Tipo de Emenda→ tipo
  2  Emenda        → idPortal (código) + objeto (descrição)
  6  Função        → area
  20 Empenhado     → valorEmpenhado
  22 Pago          → valorPago

Município: DF é cidade-estado — codigoIbge fixo 5300108 (Brasília).
"""

import sys, os, re, csv, io, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF            = 'DF'
ESFERA        = 'ESTADUAL'
CARGO         = 'DEPUTADO_ESTADUAL'
CODIGO_IBGE   = '5300108'   # Brasília — único município do DF
MUNICIPIO_NOME = 'Brasília'
BATCH         = 200

ANOS = [2021, 2022, 2023, 2024, 2025, 2026]

# ── Função → área ──────────────────────────────────────────────────────────────

FUNCAO_AREA: dict[str, str] = {
    'EDUCAÇÃO':              'EDUCACAO',
    'SAÚDE':                 'SAUDE',
    'ASSISTÊNCIA SOCIAL':    'ASSISTENCIA_SOCIAL',
    'SEGURANÇA PÚBLICA':     'SEGURANCA',
    'HABITAÇÃO':             'HABITACAO',
    'SANEAMENTO':            'SANEAMENTO',
    'AGRICULTURA':           'AGRICULTURA',
    'CULTURA':               'CULTURA',
    'DESPORTO E LAZER':      'ESPORTE',
    'GESTÃO AMBIENTAL':      'MEIO_AMBIENTE',
    'URBANISMO':             'INFRAESTRUTURA',
    'TRANSPORTE':            'INFRAESTRUTURA',
    'INFRAESTRUTURA':        'INFRAESTRUTURA',
}

def area_de_funcao(funcao: str) -> str:
    f = funcao.strip().upper()
    return FUNCAO_AREA.get(f, 'OUTROS')

# ── Helpers ────────────────────────────────────────────────────────────────────

def normalizar_nome(s: str) -> str:
    if not s:
        return s
    stop = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos'}
    words = s.strip().lower().split()
    return ' '.join(
        w.capitalize() if i == 0 or w not in stop else w
        for i, w in enumerate(words)
    )

def to_float_br(v) -> float:
    if not v or str(v).strip() in ('', '0', 'None'):
        return 0.0
    try:
        return float(str(v).strip().replace('.', '').replace(',', '.'))
    except (ValueError, TypeError):
        return 0.0

def cuid_like() -> str:
    import random, string, time
    ts   = hex(int(time.time() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
    return 'c' + ts + rand

# ── Leitura de arquivo por ano ─────────────────────────────────────────────────

def ler_arquivo(ano: int) -> list[list[str]]:
    path = os.path.join(DATA_DIR, f'DF_{ano}.csv')
    if not os.path.exists(path):
        return []

    if ano <= 2024:
        with open(path, encoding='cp1252', errors='replace', newline='') as fh:
            reader = csv.reader(fh, delimiter='\t')
            next(reader)  # pula header
            return list(reader)

    elif ano == 2025:
        # Linhas envolvidas em aspas externas — strip e split manual por TAB
        with open(path, encoding='cp1252', errors='replace', newline='') as fh:
            lines = fh.read().splitlines()
        rows = []
        for line in lines[1:]:   # pula header
            line = line.strip().strip('"')
            rows.append([c.strip('"') for c in line.split('\t')])
        return rows

    else:  # 2026
        # Linha 0 = título, linha 1 = header, dados a partir da linha 2
        with open(path, encoding='utf-8-sig', errors='replace', newline='') as fh:
            content = fh.readlines()
        data_str = ''.join(content[2:])
        return list(csv.reader(io.StringIO(data_str), delimiter=';'))

# ── Parse linha → dict de emenda ──────────────────────────────────────────────

def parse_row(row: list[str], ano: int) -> dict | None:
    if len(row) < 21:
        return None

    autor_raw = row[0].strip()
    if not autor_raw:
        return None

    tipo_raw  = row[1].strip() if len(row) > 1 else ''
    emenda_raw = row[2].strip() if len(row) > 2 else ''
    funcao     = row[6].strip() if len(row) > 6 else ''
    val_emp    = to_float_br(row[20]) if len(row) > 20 else 0.0
    val_pago   = to_float_br(row[22]) if len(row) > 22 else 0.0

    # Código e descrição da emenda: "XX.XXX.XXXX.XXXX.XXXX - DESCRIÇÃO"
    m = re.match(r'^([\d.]+)\s*-\s*(.*)', emenda_raw)
    if not m:
        return None
    codigo    = m.group(1).strip()
    descricao = m.group(2).strip()[:500]

    # idPortal único: código + ano (mesmo código pode reaparecer em outros anos)
    id_portal = f'DF{ano}_{codigo}'

    area = area_de_funcao(funcao)

    # Normaliza nome do parlamentar (pega todos os nomes para criar parlamentares)
    parl_upper = autor_raw.upper()
    parl_nome  = normalizar_nome(autor_raw)

    return {
        'idPortal':      id_portal,
        'numero':        codigo,
        'ano':           ano,
        'tipo':          tipo_raw[:100] if tipo_raw else None,
        'funcao':        funcao[:100]   if funcao   else None,
        'area':          area,
        'objeto':        descricao,
        'orgao':         None,
        'beneficiario':  None,
        'cnpj':          None,
        'codigoIbge':    CODIGO_IBGE,
        'municipioNome': MUNICIPIO_NOME,
        'valEmp':        val_emp,
        'valPago':       val_pago,
        'valProp':       max(val_emp, val_pago),
        'parlUpper':     parl_upper,
        'parlNome':      parl_nome,
    }

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

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados DF já no banco.')

    now = datetime.utcnow()

    # ── 1. Parse todos os anos ─────────────────────────────────────────────────
    todas: list[dict] = []
    for ano in ANOS:
        rows_raw = ler_arquivo(ano)
        emendas_ano = []
        for row in rows_raw:
            e = parse_row(row, ano)
            if e:
                emendas_ano.append(e)
        print(f'  DF_{ano}: {len(emendas_ano)} emendas')
        todas.extend(emendas_ano)

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

    # ── 3. Upsert emendas em batches ───────────────────────────────────────────
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
                if tentativas > 3:
                    raise
                print(f'\n  Reconectando ({tentativas}/3)…')
                try: conn.close()
                except Exception: pass
                conn, cur = reconectar()

        pct = inseridas * 100 // total
        print(f'  {inseridas}/{total} ({pct}%)…', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas DF importadas com sucesso.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
