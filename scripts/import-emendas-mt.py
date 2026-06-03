"""
Importa Emendas Estaduais MT — 2021 a 2026 (somente linhas com parlamentar).

Fontes: MT_{ANO}.csv (Windows-1252, semicolon)
  [0] Concedente  [1] Proponente   [2] Objeto    [3] Processo
  [4] SIGADOC     [5] Número       [6] Ação       [7] V. Concedente Financeira
  [8] V. Proponente Financeira    [9] Contrapartida  [10] Valor Convênio
  [11] Vigência   [12] Nm. Emenda  [13] Parlamentar   [14] Val. Utilizada Emenda
  [15] Exercício

Apenas linhas com col[13] (Parlamentar) preenchido.
Município extraído de Proponente quando "PREFEITURA MUNICIPAL DE <CIDADE>".
valorEmpenhado = Val. Utilizada Emenda; sem valorPago (não disponível).
idPortal: MT{ano}_{Nm.Emenda}_r{idx}
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'MT'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

ORGAO_AREA_KW = [
    ('SAÚDE','SAUDE'),('SAUDE','SAUDE'),('MEDICAMENTO','SAUDE'),('HOSPITAL','SAUDE'),('FUNDO ESTADUAL DE SAUDE','SAUDE'),
    ('EDUCAÇÃO','EDUCACAO'),('EDUCACAO','EDUCACAO'),('ESCOLA','EDUCACAO'),('ENSINO','EDUCACAO'),('UNEMAT','EDUCACAO'),('SEDUC','EDUCACAO'),
    ('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),('CIDADANIA','ASSISTENCIA_SOCIAL'),
    ('ESPORTE','ESPORTE'),('ESPORTES','ESPORTE'),('LAZER','ESPORTE'),('SECEL','ESPORTE'),
    ('CULTURA','CULTURA'),
    ('SEGURANÇA','SEGURANCA'),('SEGURANCA','SEGURANCA'),('DEFESA CIVIL','SEGURANCA'),
    ('AGRICULTURA','AGRICULTURA'),('AGROPECUÁRIA','AGRICULTURA'),('AGROPECUARIA','AGRICULTURA'),('FLORESTAL','AGRICULTURA'),
    ('HABITAÇÃO','HABITACAO'),('HABITACAO','HABITACAO'),
    ('SANEAMENTO','SANEAMENTO'),
    ('INFRAESTRUTURA','INFRAESTRUTURA'),('OBRAS','INFRAESTRUTURA'),('TRANSPORT','INFRAESTRUTURA'),('SEDOP','INFRAESTRUTURA'),
    ('MEIO AMBIENTE','MEIO_AMBIENTE'),('AMBIENTAL','MEIO_AMBIENTE'),('SEMA','MEIO_AMBIENTE'),
    ('DESENVOLVIMENTO ECONÔMICO','OUTROS'),('DESENVOLVIMENTO ECONOMICO','OUTROS'),('SEDEC','OUTROS'),
]

def sem_acento(s):
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_orgao(orgao):
    o = sem_acento(orgao.upper())
    for kw, area in ORGAO_AREA_KW:
        if sem_acento(kw) in o:
            return area
    return 'OUTROS'

def normalizar_nome(s):
    if not s: return s
    stop = {'de','da','do','das','dos','e','em','na','no','nas','nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def to_float(v):
    if not v: return 0.0
    s = str(v).strip().replace('.','').replace(',','.')
    try: return float(s)
    except: return 0.0

def cuid_like():
    import random, string, time
    ts = hex(int(time.time()*1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase+string.digits, k=20))
    return 'c'+ts+rand

_RE_PREF = re.compile(r'PREFEITURA\s+MUNICIPAL\s+DE\s+(.+)', re.IGNORECASE)

def extrair_municipio_proponente(proponente, ibge_map):
    m = _RE_PREF.match(proponente.strip())
    if not m: return None, None
    nome = m.group(1).strip()
    key = sem_acento(nome.upper())
    if key in ibge_map:
        return normalizar_nome(nome), ibge_map[key]
    # Tenta primeiras palavras
    for n in range(min(4, len(key.split())), 0, -1):
        prefixo = ' '.join(key.split()[:n])
        for k, cod in ibge_map.items():
            if k.startswith(prefixo):
                return normalizar_nome(nome), cod
    return normalizar_nome(nome), None

def parse_csv(ano, enc, ibge_map):
    path = os.path.join(DATA_DIR, f'MT_{ano}.csv')
    raw = open(path,'rb').read()
    text = raw.decode(enc, errors='replace')
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=';'))

    emendas = []; sem_ibge = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 15: continue
        parlamentar = row[13].strip()
        if not parlamentar: continue

        concedente = row[0].strip()
        proponente = row[1].strip()
        objeto     = row[2].strip()
        nm_emenda  = row[12].strip()
        val_str    = row[14].strip()
        val_emp    = to_float(val_str)
        if val_emp == 0: continue

        muni_nome, codigo_ibge = extrair_municipio_proponente(proponente, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        id_portal = f'MT{ano}_{nm_emenda}_r{idx}' if nm_emenda else f'MT{ano}_r{idx}'

        emendas.append({
            'idPortal':      id_portal,
            'numero':        nm_emenda or None,
            'ano':           ano,
            'tipo':          'EMENDA LOA',
            'funcao':        concedente[:200],
            'area':          area_de_orgao(concedente),
            'objeto':        objeto[:500] or None,
            'orgao':         concedente[:200],
            'beneficiario':  proponente[:300] if proponente else None,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_emp,
            'valEmp':        val_emp,
            'valPago':       0.0,
            'parlUpper':     parlamentar.upper(),
            'parlNome':      normalizar_nome(parlamentar),
            'partido':       None,
        })

    print(f'  MT_{ano}: {len(emendas)} emendas com parlamentar | sem IBGE: {sem_ibge}')
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
        esfera=%s,ano=%s,tipo=%s,funcao=%s,area=%s,objeto=%s,
        "orgaoExecutor"=%s,beneficiario=%s,uf=%s,"codigoIbge"=%s,
        "municipioNome"=%s,"valorEmpenhado"=%s,"valorPago"=%s,
        "valorProposto"=%s,"parlamentarId"=%s,"updatedAt"=%s
"""

def reconectar():
    c = psycopg2.connect(DATABASE_URL)
    return c, c.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando…')
    conn, cur = reconectar()

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='MT' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios MT.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing…')
    todas = []
    for ano, enc in [(2021,'windows-1252'),(2022,'windows-1252'),(2023,'windows-1252'),
                     (2024,'windows-1252'),(2025,'windows-1252'),(2026,'iso8859-15')]:
        todas.extend(parse_csv(ano, enc, ibge_map))
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas MT.')

    parls_novos = {}
    for e in todas:
        pu = e['parlUpper']
        if pu not in parl_map and pu not in parls_novos:
            parls_novos[pu] = {'id': cuid_like(), 'nome': e['parlNome']}
    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    for pu, p in parls_novos.items():
        cur.execute("INSERT INTO parlamentares (id,nome,partido,uf,cargo,ativo,\"createdAt\",\"updatedAt\") VALUES (%s,%s,NULL,%s,%s,true,%s,%s) ON CONFLICT DO NOTHING",
                    (p['id'],p['nome'],UF,CARGO,now,now))
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
                        # UPDATE
                        ESFERA, e['ano'], e['tipo'], e['funcao'], e['area'], e['objeto'],
                        e['orgao'], e['beneficiario'], UF, e['codigoIbge'],
                        e['municipioNome'], e['valEmp'], e['valPago'], e['valProp'], pid, now,
                    ))
                conn.commit(); inseridas += len(batch); break
            except psycopg2.OperationalError:
                tentativas += 1
                if tentativas > 3: raise
                try: conn.close()
                except: pass
                conn, cur = reconectar()
        print(f'  {inseridas}/{total} ({inseridas*100//total}%)…', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas MT.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
