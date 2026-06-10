"""
Importa Emendas Estaduais PI — 2021 a 2026.

Dois formatos:

2021-2025 (14 colunas, semicolon):
  [0] id  [1] exercicio  [2] autor ("N - Nome Deputado")
  [3] unidade_gestora  [4] funcao  [5] subfuncao  [6] acao
  [7] nota_empenho  [8] credor ("CNPJ - NOME")
  [9] tipo_licitacao  [10] descricao
  [11] valor_empenhado  [12] valor_liquidado  [13] valor_pago
  Município: extraído do campo credor (PREFEITURA MUNICIPAL DE X / FUNDO MUNICIPAL DE X)
  idPortal: PI{ano}_{nota_empenho}

2026 (10 colunas, semicolon):
  [0] id  [1] emenda_valor  [2] status  [3] emenda_numero
  [4] parlamentar_nome  [5] parlamentar_partido
  [6] modalidade_emenda_nome  [7] beneficiario_nome
  [8] localidade_beneficiada  [9] objetivo_titulo
  Município: extraído de localidade_beneficiada
  idPortal: PI2026_{emenda_numero}
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'PI'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

FUNCAO_AREA_KW = [
    ('SAUDE','SAUDE'),('SAÚDE','SAUDE'),('HOSPITAL','SAUDE'),('MEDICAMENTO','SAUDE'),('FUNDO MUNICIPAL DE SAUDE','SAUDE'),
    ('EDUCACAO','EDUCACAO'),('EDUCAÇÃO','EDUCACAO'),('ESCOLA','EDUCACAO'),('ENSINO','EDUCACAO'),('SEMED','EDUCACAO'),
    ('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),('SOCIAL','ASSISTENCIA_SOCIAL'),
    ('ESPORTE','ESPORTE'),('LAZER','ESPORTE'),
    ('CULTURA','CULTURA'),
    ('SEGURANÇA','SEGURANCA'),('SEGURANCA','SEGURANCA'),('DEFESA CIVIL','SEGURANCA'),
    ('AGRICULTURA','AGRICULTURA'),('AGROPECUARIA','AGRICULTURA'),('AGROPECUÁRIA','AGRICULTURA'),
    ('HABITACAO','HABITACAO'),('HABITAÇÃO','HABITACAO'),
    ('SANEAMENTO','SANEAMENTO'),
    ('INFRAESTRUTURA','INFRAESTRUTURA'),('OBRAS','INFRAESTRUTURA'),('TRANSPORT','INFRAESTRUTURA'),('ESTRADA','INFRAESTRUTURA'),
    ('MEIO AMBIENTE','MEIO_AMBIENTE'),('AMBIENTAL','MEIO_AMBIENTE'),
]

def sem_acento(s):
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_campo(campo):
    o = sem_acento(campo.upper())
    for kw, area in FUNCAO_AREA_KW:
        if sem_acento(kw) in o:
            return area
    return 'OUTROS'

def normalizar_nome(s):
    if not s: return s
    stop = {'de','da','do','das','dos','e','em','na','no','nas','nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def to_float(v):
    """Valores do PI estão em formato decimal US: '90000.00' ou '300000.00'.
    Não remover o ponto — ele é separador decimal, não de milhar."""
    if not v: return 0.0
    s = str(v).strip()
    # Formato BR com vírgula decimal: '90.000,00'
    if ',' in s:
        s = s.replace('.', '').replace(',', '.')
    # Formato US com ponto decimal: '90000.00' — usar direto
    try: return float(s)
    except: return 0.0

def cuid_like():
    import random, string, time
    ts = hex(int(time.time()*1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase+string.digits, k=20))
    return 'c'+ts+rand

# ── Extração de parlamentar de "N - Nome" ─────────────────────────────────────
def extrair_parlamentar(autor):
    m = re.match(r'^\d+\s*-\s*(.+)', autor.strip())
    return m.group(1).strip() if m else autor.strip()

# ── Extração de CNPJ e nome de credor ────────────────────────────────────────
_RE_CREDOR = re.compile(r'^(\d{14}|\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2})\s*-\s*(.+)$')

def extrair_credor(credor):
    m = _RE_CREDOR.match(credor.strip())
    if m:
        return m.group(1).replace('.','').replace('/','').replace('-',''), m.group(2).strip()
    return None, credor.strip()

# ── Extração de município de nome de entidade ─────────────────────────────────
_RE_PREF = re.compile(r'PREFEITURA\s+(?:MUNICIPAL\s+)?(?:DE\s+)?(.+)', re.IGNORECASE)
_RE_FUNDO = re.compile(r'FUNDO\s+MUNICIPAL\s+(?:DE\s+)?(?:\w+\s+)?(?:DE\s+)?(.+)', re.IGNORECASE)

def extrair_municipio_credor(nome_credor, ibge_map):
    for pat in [_RE_PREF, _RE_FUNDO]:
        m = pat.match(nome_credor.strip())
        if not m: continue
        candidato = m.group(1).strip().rstrip('.,- ')
        # Remove abreviações finais ex: "DE MATIAS OLIMPIO" ou "SAUDE DE TERESINA"
        # Tenta limpar sufixos comuns de fundos
        candidato = re.sub(r'\s+(?:SAUDE|EDUCACAO|EDUCAÇÃO|SAÚDE|SOCIAL|ASSISTENCIA).*$', '', candidato, flags=re.IGNORECASE).strip()
        key = sem_acento(candidato.upper())
        if key in ibge_map:
            return normalizar_nome(candidato), ibge_map[key]
        palavras = key.split()
        for n in range(min(3, len(palavras)), 0, -1):
            pfx = ' '.join(palavras[:n])
            for k, cod in ibge_map.items():
                if k.startswith(pfx):
                    return normalizar_nome(candidato), cod
    return None, None

# ── Extração de município de localidade_beneficiada (2026) ────────────────────
_RE_MUNI_LOC = re.compile(r'MUNIC[ÍI]PIO\s+DE\s+([A-ZÀ-Ú][A-ZÀ-Úa-zà-ú\s]+?)(?:\s*-\s*PI|\s+E\s+REGI|\s*$)', re.IGNORECASE)

def extrair_municipio_localidade(localidade, ibge_map):
    if not localidade: return None, None
    loc = localidade.strip()
    # Tenta regex "Município de X"
    m = _RE_MUNI_LOC.search(loc)
    candidato = m.group(1).strip() if m else loc

    # Remove sufixos indesejados
    candidato = re.sub(r'\s*-\s*PI.*$', '', candidato, flags=re.IGNORECASE).strip()
    candidato = re.sub(r'\s+E\s+REGI.*$', '', candidato, flags=re.IGNORECASE).strip()
    if not candidato or len(candidato) < 3: return None, None
    if candidato.lower() in ('estado do piauí', 'estado do piaui', 'piaui', 'piauí'): return None, None

    key = sem_acento(candidato.upper())
    if key in ibge_map:
        return normalizar_nome(candidato), ibge_map[key]
    palavras = key.split()
    for n in range(min(3, len(palavras)), 0, -1):
        pfx = ' '.join(palavras[:n])
        for k, cod in ibge_map.items():
            if k.startswith(pfx):
                return normalizar_nome(candidato), cod
    return normalizar_nome(candidato), None

def decode_file(path):
    raw = open(path, 'rb').read()
    for enc in ['utf-8-sig', 'windows-1252', 'latin-1']:
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode('latin-1', errors='replace')

# ── Parse 2021-2025 ──────────────────────────────────────────────────────────
def parse_csv_old(ano, ibge_map):
    path = os.path.join(DATA_DIR, f'PI_{ano}.csv')
    if not os.path.exists(path):
        print(f'  PI_{ano}.csv: nao encontrado, pulando.')
        return []
    text = decode_file(path)
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=';'))

    emendas = []; sem_ibge = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 14: continue
        autor_raw    = row[2].strip()
        funcao_raw   = row[4].strip()
        nota_emp     = row[7].strip()
        credor_raw   = row[8].strip()
        descricao    = row[10].strip()
        val_emp      = to_float(row[11])
        val_pago     = to_float(row[13])

        if not autor_raw: continue
        if val_emp == 0 and val_pago == 0: continue

        parlamentar = extrair_parlamentar(autor_raw)
        cnpj_c, nome_credor = extrair_credor(credor_raw)
        muni_nome, codigo_ibge = extrair_municipio_credor(nome_credor, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        funcao = re.sub(r'^\d+\s*-\s*', '', funcao_raw).strip()
        area = area_de_campo(funcao + ' ' + descricao)
        id_portal = f'PI{ano}_{nota_emp}' if nota_emp else f'PI{ano}_r{idx}'

        emendas.append({
            'idPortal':      id_portal,
            'numero':        nota_emp or None,
            'ano':           ano,
            'tipo':          'EMENDA IMPOSITIVA',
            'funcao':        funcao[:200] if funcao else None,
            'area':          area,
            'objeto':        descricao[:500] if descricao else None,
            'orgao':         funcao[:200] if funcao else None,
            'beneficiario':  nome_credor[:300] if nome_credor else None,
            'cnpj':          cnpj_c,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_emp,
            'valEmp':        val_emp,
            'valPago':       val_pago,
            'parlUpper':     parlamentar.upper(),
            'parlNome':      normalizar_nome(parlamentar),
            'partido':       None,
        })

    print(f'  PI_{ano}: {len(emendas)} emendas | sem IBGE: {sem_ibge}')
    return emendas

# ── Parse 2026 ───────────────────────────────────────────────────────────────
def parse_csv_2026(ibge_map):
    path = os.path.join(DATA_DIR, 'PI_2026.csv')
    if not os.path.exists(path):
        print('  PI_2026.csv: nao encontrado, pulando.')
        return []
    text = decode_file(path)
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=';'))

    emendas = []; sem_ibge = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 10: continue
        val_str       = row[1].strip()
        status        = row[2].strip()
        emenda_num    = row[3].strip()
        parlamentar   = row[4].strip()
        partido       = row[5].strip()
        modalidade    = row[6].strip()
        beneficiario  = row[7].strip()
        localidade    = row[8].strip()
        objetivo      = row[9].strip()

        if not parlamentar: continue
        val = to_float(val_str)
        if val == 0: continue

        muni_nome, codigo_ibge = extrair_municipio_localidade(localidade, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        area = area_de_campo(objetivo + ' ' + modalidade)
        id_portal = f'PI2026_{emenda_num}' if emenda_num else f'PI2026_r{idx}'

        emendas.append({
            'idPortal':      id_portal,
            'numero':        emenda_num or None,
            'ano':           2026,
            'tipo':          modalidade[:100] if modalidade else 'EMENDA IMPOSITIVA',
            'funcao':        modalidade[:200] if modalidade else None,
            'area':          area,
            'objeto':        objetivo[:500] if objetivo else None,
            'orgao':         beneficiario[:200] if beneficiario else None,
            'beneficiario':  beneficiario[:300] if beneficiario else None,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val,
            'valEmp':        val,
            'valPago':       0.0,
            'parlUpper':     parlamentar.upper(),
            'parlNome':      normalizar_nome(parlamentar),
            'partido':       partido or None,
        })

    print(f'  PI_2026: {len(emendas)} emendas | sem IBGE: {sem_ibge}')
    return emendas

INSERT_SQL = """
    INSERT INTO emendas_parlamentares (
        id,"idPortal",esfera,ano,numero,tipo,funcao,area,
        objeto,"orgaoExecutor",beneficiario,"cnpjBeneficiario",
        uf,"codigoIbge","municipioNome",
        "valorEmpenhado","valorPago","valorProposto","valorRestoPago",
        "parlamentarId","fetchedAt","updatedAt"
    ) VALUES (
        %s,%s,%s,%s,%s,%s,%s,%s,
        %s,%s,%s,%s,
        %s,%s,%s,
        %s,%s,%s,0,
        %s,%s,%s
    )
    ON CONFLICT ("idPortal") DO UPDATE SET
        esfera=EXCLUDED.esfera,ano=EXCLUDED.ano,tipo=EXCLUDED.tipo,
        funcao=EXCLUDED.funcao,area=EXCLUDED.area,objeto=EXCLUDED.objeto,
        "orgaoExecutor"=EXCLUDED."orgaoExecutor",beneficiario=EXCLUDED.beneficiario,
        uf=EXCLUDED.uf,"codigoIbge"=EXCLUDED."codigoIbge",
        "municipioNome"=EXCLUDED."municipioNome",
        "valorEmpenhado"=EXCLUDED."valorEmpenhado","valorPago"=EXCLUDED."valorPago",
        "valorProposto"=EXCLUDED."valorProposto","parlamentarId"=EXCLUDED."parlamentarId",
        "updatedAt"=EXCLUDED."updatedAt"
"""

def reconectar():
    c = psycopg2.connect(DATABASE_URL)
    return c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando...')
    conn, cur = reconectar()

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='PI' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municipios PI.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing...')
    todas = []
    for ano in [2021, 2022, 2023, 2024, 2025]:
        todas.extend(parse_csv_old(ano, ibge_map))
    todas.extend(parse_csv_2026(ibge_map))
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas PI.')

    parls_novos = {}
    for e in todas:
        pu = e['parlUpper']
        if pu not in parl_map and pu not in parls_novos:
            parls_novos[pu] = {'id': cuid_like(), 'nome': e['parlNome']}
    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    for pu, p in parls_novos.items():
        cur.execute("INSERT INTO parlamentares (id,nome,partido,uf,cargo,ativo,\"createdAt\",\"updatedAt\") VALUES (%s,%s,NULL,%s,%s,true,%s,%s) ON CONFLICT DO NOTHING",
                    (p['id'], p['nome'], UF, CARGO, now, now))
        parl_map[pu] = p['id']
    conn.commit()

    total = len(todas); inseridas = 0
    for i in range(0, total, BATCH):
        batch = todas[i:i+BATCH]
        tentativas = 0
        while True:
            try:
                for e in batch:
                    pid = parl_map.get(e['parlUpper'])
                    cur.execute(INSERT_SQL, (
                        cuid_like(), e['idPortal'], ESFERA, e['ano'], e['numero'],
                        e['tipo'], e['funcao'], e['area'],
                        e['objeto'], e['orgao'], e['beneficiario'], e['cnpj'],
                        UF, e['codigoIbge'], e['municipioNome'],
                        e['valEmp'], e['valPago'], e['valProp'],
                        pid, now, now,
                    ))
                conn.commit(); inseridas += len(batch); break
            except psycopg2.OperationalError:
                tentativas += 1
                if tentativas > 5: raise
                try: conn.close()
                except: pass
                import time; time.sleep(5 * tentativas)
                conn, cur = reconectar()
        print(f'  {inseridas}/{total} ({inseridas*100//total}%)...', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas PI.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
