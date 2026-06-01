"""
Importa emendas_parlamentares_2024_PE.csv para o banco.

Fonte: SIGEPE PE — registros de empenho que referenciam emendas parlamentares.
Importa APENAS linhas onde foi possível extrair nome do parlamentar E município.

Mapeamento:
  numero_empenho  → idPortal + numero
  cd_nm_subacao   → tipo (EMENDA PARLAMENTAR | EMENDA DERIVADA)
  cd_nm_funcao    → funcao + area
  cd_nm_acao      → objeto
  unidade_gestora → orgaoExecutor
  credor          → beneficiario + cnpjBeneficiario
  vlrempenhado    → valorEmpenhado
  vlrtotalpago    → valorPago
  obs + credor    → parlamentar.nome (via regex) + municipioNome (via regex/lookup)
"""

import sys, os, re, csv, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

CSV_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados',
                        'emendas_parlamentares_2024_PE.csv')

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF    = 'PE'
ANO   = 2024
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# Grafias divergentes entre a fonte e o banco (chave = sem_acento(UPPER(nome_csv)))
ALIAS_MUNICIPIO: dict[str, str] = {
    'BELEM DE SAO FRANCISCO': 'BELEM DO SAO FRANCISCO',
    'ITAMARACA':              'ILHA DE ITAMARACA',
}

# ── Classificação de área ──────────────────────────────────────────────────────

FUNCAO_AREA = {
    '10': 'SAUDE', '12': 'HABITACAO', '08': 'ASSISTENCIA_SOCIAL',
    '09': 'ASSISTENCIA_SOCIAL', '11': 'EDUCACAO', '13': 'CULTURA',
    '26': 'INFRAESTRUTURA', '15': 'INFRAESTRUTURA', '17': 'INFRAESTRUTURA',
    '18': 'MEIO_AMBIENTE', '20': 'AGRICULTURA', '27': 'ESPORTE',
    '16': 'HABITACAO', '22': 'SANEAMENTO', '04': 'INFRAESTRUTURA',
    '14': 'SANEAMENTO', '28': 'OUTROS', '06': 'SEGURANCA', '05': 'SEGURANCA',
}

def classificar_area(funcao: str | None) -> str:
    if not funcao:
        return 'OUTROS'
    m = re.match(r'^(\d+)', str(funcao).strip())
    if m:
        return FUNCAO_AREA.get(m.group(1), 'OUTROS')
    f = funcao.lower()
    if 'saúde' in f or 'saude' in f:          return 'SAUDE'
    if 'educação' in f or 'educac' in f:       return 'EDUCACAO'
    if 'saneamento' in f:                      return 'SANEAMENTO'
    if 'transp' in f or 'infraes' in f:        return 'INFRAESTRUTURA'
    if 'assistência' in f or 'social' in f:    return 'ASSISTENCIA_SOCIAL'
    if 'segurança' in f or 'segur' in f:       return 'SEGURANCA'
    if 'habitação' in f or 'habitac' in f:     return 'HABITACAO'
    if 'agricultur' in f or 'agrope' in f:     return 'AGRICULTURA'
    if 'esporte' in f or 'desport' in f:       return 'ESPORTE'
    if 'cultura' in f:                         return 'CULTURA'
    if 'meio ambiente' in f or 'ambient' in f: return 'MEIO_AMBIENTE'
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

def to_float(v) -> float:
    try:
        return float(v or 0)
    except (ValueError, TypeError):
        return 0.0

def cuid_like() -> str:
    import random, string, time
    ts   = hex(int(time.time() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
    return 'c' + ts + rand

# ── Extração de parlamentar e município do campo obs/credor ───────────────────

# Padrões ordenados do mais específico ao mais genérico
PARL_PATS = [
    r'PARLAMENTAR\s+(.+?)\s+PARA\s+O\s+MUNIC',
    r'DEP(?:UTAD[OA]A?)\.?\s+(.+?)\s+P/\s+O\s+MUNIC',
    r'DEP(?:UTAD[OA]A?)\.?\s+(.+?)\s*[-–]\s*MUNIC',
    r'SUBAÇÃO[^,]+,\s*DEPUTAD[OA]A?\s+(.+?)\)',
    r'EMPENHO.*?SUBAÇÃO[^,]+,\s*(.+?)\)',
    r'ESTADUAL\s+(.+?)\s+PARA\s+O\s+MUNIC',
    r'(?:EP|EMENDA)\s+\d+[/\d]*\s+D[OA]\s+DEP(?:UTAD[OA]A?)\.?\s+(.+?)(?:\s*,|\s*\.|$|\s+CUJO|\s+P/)',
    r'DEP(?:UTAD[OA]A?)\.?\s+(.+?)\s*,',
    r'EMENDA PARLAMENTAR\s*[-–]\s*(.+?)\s*$',
]

MUNI_OBS_PATS = [
    r'MUNIC[IÍ]PIO\s+DE\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ\s]+?)(?:\s*[,\.)\n]|\s+EP\b|\s+GD\b|\s+SEI\b|\s+PARA\b|\s*$)',
    r'P/\s+O\s+MUNIC[IÍ]PIO\s+DE\s+([A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ\s]+?)(?:\s*[,\.\n]|\s*$)',
]
MUNI_CRED_PAT = (
    r'(?:FUNDO\s+MUNICIPAL\b[^\-]*\bDE\s+|(?:FEM[-\s]+)?PREFEITURA\s+(?:MUNICIPAL\s+)?DE\s+'
    r'|MUNICIPIO\s+DE\s+)([A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ][A-ZÁÀÂÃÉÊÍÓÔÕÚÜÇ\s]+?)(?:\s*$)'
)

_RESIDUOS = re.compile(
    r'\s+PARA\s+O\s+MUNIC.*$|^\s*(?:ESTADUAL|PARLAMENTAR|DEPUTAD[OA]A?)\s+',
    re.IGNORECASE,
)

def limpar_parl(s: str | None) -> str | None:
    if not s:
        return None
    s = _RESIDUOS.sub('', s).strip().rstrip(',.;- ')
    if re.search(r'\d', s):
        return None
    if len(s) < 4 or len(s) > 60:
        return None
    return s or None

def extrair_parlamentar(obs: str) -> str | None:
    for pat in PARL_PATS:
        m = re.search(pat, obs, re.IGNORECASE)
        if m:
            nome = limpar_parl(m.group(1))
            if nome:
                return nome
    return None

def extrair_municipio(obs: str, cred: str) -> str | None:
    for pat in MUNI_OBS_PATS:
        m = re.search(pat, obs, re.IGNORECASE)
        if m:
            v = m.group(1).strip().rstrip(',.- ')
            if len(v) > 2:
                return v
    m = re.search(MUNI_CRED_PAT, cred, re.IGNORECASE)
    if m:
        return m.group(1).strip().rstrip(',.- ')
    return None

def extrair_cnpj_beneficiario(credor: str):
    """Retorna (cnpj_ou_None, nome_beneficiario)."""
    m = re.match(r'^(\d{14}|PF\d+)\s*-\s*(.+)$', credor.strip())
    if m:
        raw = m.group(1)
        cnpj = raw if re.match(r'^\d{14}$', raw) else None
        return cnpj, m.group(2).strip()
    return None, credor.strip() or None

def extrair_tipo(subacao: str) -> str:
    s = subacao.upper()
    if 'DERIVADA' in s:
        return 'EMENDA DERIVADA'
    return 'EMENDA PARLAMENTAR'

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'[{datetime.now():%H:%M:%S}] Lendo {CSV_PATH}…')
    with open(CSV_PATH, encoding='utf-8-sig', errors='replace') as f:
        reader = csv.reader(f, delimiter=';')
        headers = next(reader)
        rows = list(reader)
    idx = {h: i for i, h in enumerate(headers)}
    print(f'[{datetime.now():%H:%M:%S}] {len(rows)} linhas carregadas.')

    print(f'[{datetime.now():%H:%M:%S}] Conectando ao banco…')
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    # ── 1. Mapa nome→IBGE dos municípios PE ──────────────────────────────────
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = %s
         ORDER BY UPPER(TRIM(nome)), ano DESC
    """, (UF,))
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios PE no banco.')

    # ── 2. Parlamentares existentes ───────────────────────────────────────────
    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s
    """, (CARGO,))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados estaduais já no banco.')

    # ── 3. Processar e filtrar linhas ─────────────────────────────────────────
    emendas_upsert = []
    parls_novos: dict[str, dict] = {}
    ignoradas = descartadas_sem_parl = descartadas_sem_muni = 0

    for row in rows:
        obs    = row[idx['obs']].strip()
        credor = row[idx['credor']].strip()

        parl_nome = extrair_parlamentar(obs)
        muni_nome = extrair_municipio(obs, credor)

        if not parl_nome:
            descartadas_sem_parl += 1
            continue
        if not muni_nome:
            descartadas_sem_muni += 1
            continue

        num_empenho = row[idx['numero_empenho']].strip()
        if not num_empenho:
            ignoradas += 1
            continue

        subacao    = row[idx['cd_nm_subacao']].strip()
        funcao     = row[idx['cd_nm_funcao']].strip() or None
        objeto     = row[idx['cd_nm_acao']].strip() or None
        orgao      = row[idx['unidade_gestora']].strip() or None
        val_emp    = to_float(row[idx['vlrempenhado']])
        val_liq    = to_float(row[idx['vlrliquidado']])
        val_pago   = to_float(row[idx['vlrtotalpago']])
        val_prop   = val_emp if val_emp > 0 else (val_liq if val_liq > 0 else val_pago)

        cnpj, beneficiario = extrair_cnpj_beneficiario(credor)
        tipo  = extrair_tipo(subacao)
        area  = classificar_area(funcao)

        muni_key    = sem_acento(muni_nome.upper())
        muni_key    = ALIAS_MUNICIPIO.get(muni_key, muni_key)
        codigo_ibge = ibge_map.get(muni_key)

        parl_upper = parl_nome.upper()
        if parl_upper not in parl_map and parl_upper not in parls_novos:
            parls_novos[parl_upper] = {
                'id':      cuid_like(),
                'nome':    normalizar_nome(parl_nome),
                'partido': None,
                'uf':      UF,
                'cargo':   CARGO,
            }

        emendas_upsert.append({
            'num_empenho': num_empenho,
            'tipo':        tipo,
            'funcao':      funcao,
            'area':        area,
            'objeto':      objeto,
            'orgao':       orgao,
            'beneficiario': beneficiario,
            'cnpj':        cnpj,
            'codigoIbge':  codigo_ibge,
            'municipioNome': normalizar_nome(muni_nome),
            'valEmp':      val_emp,
            'valPago':     val_pago,
            'valProp':     val_prop,
            'parlUpper':   parl_upper,
        })

    print(f'[{datetime.now():%H:%M:%S}] {len(emendas_upsert)} emendas válidas para upsert.')
    print(f'[{datetime.now():%H:%M:%S}] Descartadas: sem parlamentar={descartadas_sem_parl}, sem município={descartadas_sem_muni}, sem número={ignoradas}.')
    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    sem_ibge = {e['municipioNome'] for e in emendas_upsert if not e['codigoIbge']}
    if sem_ibge:
        print(f'[{datetime.now():%H:%M:%S}] ⚠  {len(sem_ibge)} municípios sem IBGE:')
        for m in sorted(sem_ibge)[:20]:
            print(f'     - {m}')

    # ── 4. Inserir novos parlamentares ────────────────────────────────────────
    now = datetime.utcnow()
    for parl_upper, p in parls_novos.items():
        cur.execute("""
            INSERT INTO parlamentares (id, nome, partido, uf, cargo, ativo, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, true, %s, %s)
            ON CONFLICT DO NOTHING
        """, (p['id'], p['nome'], p['partido'], p['uf'], p['cargo'], now, now))
        parl_map[parl_upper] = p['id']
    conn.commit()
    print(f'[{datetime.now():%H:%M:%S}] Parlamentares inseridos.')

    # ── 5. Upsert emendas em batches ──────────────────────────────────────────
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
            beneficiario     = EXCLUDED.beneficiario,
            "cnpjBeneficiario" = EXCLUDED."cnpjBeneficiario",
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

    total = len(emendas_upsert)
    inseridas = 0
    for i in range(0, total, BATCH):
        batch = emendas_upsert[i:i + BATCH]
        tentativas = 0
        while True:
            try:
                for e in batch:
                    parl_id = parl_map.get(e['parlUpper'])
                    cur.execute(INSERT_SQL, (
                        cuid_like(),
                        e['num_empenho'], ESFERA, ANO, e['num_empenho'],
                        e['tipo'], e['funcao'], e['area'],
                        e['objeto'], e['orgao'], e['beneficiario'], e['cnpj'],
                        UF, e['codigoIbge'], e['municipioNome'],
                        e['valEmp'], e['valPago'], e['valProp'],
                        parl_id, now, now,
                    ))
                conn.commit()
                inseridas += len(batch)
                break
            except psycopg2.OperationalError as ex:
                tentativas += 1
                if tentativas > 3:
                    raise
                print(f'\n[{datetime.now():%H:%M:%S}] Conexão perdida, reconectando ({tentativas}/3)…')
                try:
                    conn.close()
                except Exception:
                    pass
                conn, cur = reconectar()

        pct = inseridas * 100 // total
        print(f'[{datetime.now():%H:%M:%S}] {inseridas}/{total} ({pct}%)…', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas PE 2024 importadas com sucesso.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
