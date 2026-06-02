"""
Importa emendas parlamentares estaduais do Maranhão (MA).

Fonte: data/estados/emendas_estaduais_2026_MA.csv
  Encoding: utf-8-sig, delimiter: vírgula

Colunas (col idx):
   1  Número Emenda     → idPortal / numero
   2  Exercício         → ano
   3  Parlamentar       → parlamentar.nome
  10  Localizador de Gasto → municipioNome + lookup IBGE
  11  Objeto            → objeto
  12  Função            → area
  19  Valor Empenhado   → valorEmpenhado (inteiro)
  21  Valor Pago        → valorPago (inteiro)
"""

import sys, os, re, csv, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
CSV_FILE = os.path.join(DATA_DIR, 'emendas_estaduais_2026_MA.csv')

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF     = 'MA'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# ── Função → área ──────────────────────────────────────────────────────────────

FUNCAO_AREA: dict[str, str] = {
    'SAÚDE':                  'SAUDE',
    'SAUDE':                  'SAUDE',
    'EDUCAÇÃO':               'EDUCACAO',
    'EDUCACAO':               'EDUCACAO',
    'SEGURANÇA PÚBLICA':      'SEGURANCA',
    'SEGURANCA PUBLICA':      'SEGURANCA',
    'ASSISTÊNCIA SOCIAL':     'ASSISTENCIA_SOCIAL',
    'ASSISTENCIA SOCIAL':     'ASSISTENCIA_SOCIAL',
    'AGRICULTURA':            'AGRICULTURA',
    'CULTURA':                'CULTURA',
    'TRANSPORTE':             'INFRAESTRUTURA',
    'URBANISMO':              'INFRAESTRUTURA',
    'HABITAÇÃO':              'HABITACAO',
    'HABITACAO':              'HABITACAO',
    'SANEAMENTO':             'SANEAMENTO',
    'MEIO AMBIENTE':          'MEIO_AMBIENTE',
    'GESTÃO AMBIENTAL':       'MEIO_AMBIENTE',
    'DESPORTO E LAZER':       'ESPORTE',
    'ESPORTE':                'ESPORTE',
}

def sem_acento(s: str) -> str:
    s = s.replace('-', ' ')
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

def area_de_funcao(funcao: str) -> str:
    f = sem_acento(funcao.strip().upper())
    for k, v in FUNCAO_AREA.items():
        if sem_acento(k) == f:
            return v
    return 'OUTROS'

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

def to_float(v) -> float:
    if v is None or str(v).strip() in ('', 'None', '--'):
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

# ── Lookup de município ────────────────────────────────────────────────────────

ESTADUAL_KEYWORDS = {'NO ESTADO DO MARANHÃO', 'MARANHÃO', 'ESTADO'}

def build_municipio_lookup(cur) -> tuple[dict, list]:
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'MA'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    nomes_ord = sorted(ibge_map.keys(), key=len, reverse=True)
    return ibge_map, nomes_ord

def lookup_municipio(localizador: str, ibge_map: dict, nomes_ord: list):
    raw = str(localizador or '').strip()
    if not raw:
        return None, None
    raw_upper = raw.upper()
    if any(kw in raw_upper for kw in ESTADUAL_KEYWORDS):
        return None, None
    key = sem_acento(raw_upper)
    # Tentativa direta
    if key in ibge_map:
        return normalizar_nome(raw), ibge_map[key]
    # Busca por palavra-limite
    for nome in nomes_ord:
        if re.search(r'\b' + re.escape(nome) + r'\b', key):
            return normalizar_nome(raw), ibge_map[nome]
    return normalizar_nome(raw), None

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

    ibge_map, nomes_ord = build_municipio_lookup(cur)
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios MA no banco.')

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados MA já no banco.')

    now = datetime.utcnow()

    # ── 1. Parse CSV ──────────────────────────────────────────────────────────
    todas: list[dict] = []
    parls_novos: dict[str, dict] = {}
    sem_muni = 0

    with open(CSV_FILE, encoding='utf-8-sig', newline='') as fh:
        reader = csv.reader(fh)
        next(reader)  # pula header
        for row in reader:
            if len(row) < 20:
                continue
            numero   = str(row[1]).strip()
            ano_str  = str(row[2]).strip()
            parl_raw = str(row[3]).strip()
            local    = str(row[10]).strip()
            objeto   = str(row[11]).strip()
            funcao   = str(row[12]).strip()
            val_emp  = to_float(row[19])
            val_pago = to_float(row[21]) if len(row) > 21 else 0.0

            if not numero or not parl_raw:
                continue
            try:
                ano = int(ano_str)
            except ValueError:
                continue
            if ano < 2018 or ano > 2030:
                continue

            area = area_de_funcao(funcao)
            muni_nome, codigo_ibge = lookup_municipio(local, ibge_map, nomes_ord)
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

            todas.append({
                'idPortal':      numero,
                'numero':        numero,
                'ano':           ano,
                'tipo':          None,
                'funcao':        funcao[:100] if funcao else None,
                'area':          area,
                'objeto':        objeto[:500] if objeto else None,
                'orgao':         None,
                'beneficiario':  None,
                'cnpj':          None,
                'codigoIbge':    codigo_ibge,
                'municipioNome': muni_nome,
                'valEmp':        val_emp,
                'valPago':       val_pago,
                'valProp':       val_emp if val_emp > 0 else val_pago,
                'parlUpper':     parl_upper,
                'parlNome':      normalizar_nome(parl_raw),
            })

    pct = (len(todas) - sem_muni) * 100 // len(todas) if todas else 0
    print(f'[{datetime.now():%H:%M:%S}] {len(todas)} emendas | sem município: {sem_muni} ({100-pct}%)')
    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')

    # ── 2. Novos parlamentares ─────────────────────────────────────────────────
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
                if tentativas > 3:
                    raise
                print(f'\n  Reconectando ({tentativas}/3)…')
                try: conn.close()
                except Exception: pass
                conn, cur = reconectar()

        pct = inseridas * 100 // total
        print(f'  {inseridas}/{total} ({pct}%)…', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas MA importadas com sucesso.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
