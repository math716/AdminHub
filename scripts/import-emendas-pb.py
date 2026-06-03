"""
Importa Emendas Estaduais PB — 2021 a 2026.

Fontes: PB_{ANO}.csv (semicolon, UTF-8 ou windows-1252)
  [0] num_emenda   [1] nome_deputado  [2] tipo       [3] secretaria
  [4] objeto       [5] beneficiario_final  [6] tipo_entidade
  [7] valor        [8] localizacao

Município: se tipo_entidade contém 'Munic', usa beneficiario_final;
           senão tenta regex no campo objeto.
valorEmpenhado = valor (campo único, sem separação por fase).
idPortal: PB{ano}_r{idx}
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'PB'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

ORGAO_AREA_KW = [
    ('SAUDE','SAUDE'),('SAÚDE','SAUDE'),('HOSPITAL','SAUDE'),('MEDICAMENTO','SAUDE'),
    ('EDUCACAO','EDUCACAO'),('EDUCAÇÃO','EDUCACAO'),('ESCOLA','EDUCACAO'),('ENSINO','EDUCACAO'),
    ('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),
    ('CIDADANIA','ASSISTENCIA_SOCIAL'),('SOCIAL','ASSISTENCIA_SOCIAL'),
    ('ESPORTE','ESPORTE'),('LAZER','ESPORTE'),
    ('CULTURA','CULTURA'),
    ('SEGURANÇA','SEGURANCA'),('SEGURANCA','SEGURANCA'),('DEFESA CIVIL','SEGURANCA'),
    ('AGRICULTURA','AGRICULTURA'),('AGROPECUÁRIA','AGRICULTURA'),('AGROPECUARIA','AGRICULTURA'),
    ('HABITACAO','HABITACAO'),('HABITAÇÃO','HABITACAO'),
    ('SANEAMENTO','SANEAMENTO'),
    ('INFRAESTRUTURA','INFRAESTRUTURA'),('OBRAS','INFRAESTRUTURA'),('TRANSPORT','INFRAESTRUTURA'),
    ('MEIO AMBIENTE','MEIO_AMBIENTE'),('AMBIENTAL','MEIO_AMBIENTE'),
    ('DESENVOLVIMENTO','OUTROS'),('FUNDO DE DESENVOLVIMENTO','OUTROS'),
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

_RE_MUNI_OBJ = [
    re.compile(r'munic[íi]p(?:io|ais)?\s+(?:de\s+)?([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s\-]{2,40}?)(?=\s*[\-\(\,\.]|\s+mediante|\s+para|\s*$)', re.IGNORECASE),
    re.compile(r'(?:para\s+o\s+)?munic[íi]pio\s+de\s+([A-ZÁÉÍÓÚÀÂÊÔÃÕÇÜA-Za-záéíóúàâêôãõçü][A-ZÀ-Úa-zà-ú\s\-]{2,40}?)(?=\s*[\(\,\-]|\s*$|\s+mediante)', re.IGNORECASE),
    re.compile(r'cidade\s+de\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,35}?)(?=\s*[\-\(\,\.])', re.IGNORECASE),
]

def extrair_municipio_objeto(texto, ibge_map):
    for pat in _RE_MUNI_OBJ:
        m = pat.search(texto)
        if not m:
            continue
        candidato = m.group(1).strip().rstrip('.,- ').strip()
        # remove sufixo de UF ex: "(Pb)" ou "-PB"
        candidato = re.sub(r'\s*[\(\-]\s*[A-Z]{2}\s*\)?$', '', candidato).strip()
        if len(candidato) < 3 or len(candidato) > 50:
            continue
        key = sem_acento(candidato.upper())
        if key in ibge_map:
            return normalizar_nome(candidato), ibge_map[key]
        for n in range(min(3, len(key.split())), 0, -1):
            prefixo = ' '.join(key.split()[:n])
            for k, cod in ibge_map.items():
                if k.startswith(prefixo):
                    return normalizar_nome(candidato), cod
    return None, None

def extrair_municipio(beneficiario, tipo_entidade, objeto, ibge_map):
    # Se beneficiário é município, usa direto
    if tipo_entidade and 'munic' in tipo_entidade.lower():
        key = sem_acento(beneficiario.upper())
        if key in ibge_map:
            return normalizar_nome(beneficiario), ibge_map[key]
        for n in range(min(3, len(key.split())), 0, -1):
            pfx = ' '.join(key.split()[:n])
            for k, cod in ibge_map.items():
                if k.startswith(pfx):
                    return normalizar_nome(beneficiario), cod
    # Tenta extrair do objeto
    return extrair_municipio_objeto(objeto, ibge_map)

def decode_file(path):
    raw = open(path, 'rb').read()
    for enc in ['utf-8-sig', 'windows-1252', 'latin-1']:
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode('latin-1', errors='replace')

def parse_csv(ano, ibge_map):
    path = os.path.join(DATA_DIR, f'PB_{ano}.csv')
    if not os.path.exists(path):
        print(f'  PB_{ano}.csv: nao encontrado, pulando.')
        return []
    text = decode_file(path)
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=';'))

    emendas = []; sem_ibge = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 8: continue
        num_emenda    = row[0].strip()
        nome_dep      = row[1].strip()
        tipo          = row[2].strip()
        secretaria    = row[3].strip()
        objeto        = row[4].strip()
        beneficiario  = row[5].strip()
        tipo_entidade = row[6].strip()
        valor_str     = row[7].strip()

        if not nome_dep: continue
        val = to_float(valor_str)
        if val == 0: continue

        muni_nome, codigo_ibge = extrair_municipio(beneficiario, tipo_entidade, objeto, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        id_portal = f'PB{ano}_r{idx}'

        emendas.append({
            'idPortal':      id_portal,
            'numero':        num_emenda or None,
            'ano':           ano,
            'tipo':          tipo or 'EMENDA IMPOSITIVA',
            'funcao':        secretaria[:200] if secretaria else None,
            'area':          area_de_orgao(secretaria),
            'objeto':        objeto[:500] if objeto else None,
            'orgao':         secretaria[:200] if secretaria else None,
            'beneficiario':  beneficiario[:300] if beneficiario else None,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val,
            'valEmp':        val,
            'valPago':       0.0,
            'parlUpper':     nome_dep.upper(),
            'parlNome':      normalizar_nome(nome_dep),
            'partido':       None,
        })

    print(f'  PB_{ano}: {len(emendas)} emendas | sem IBGE: {sem_ibge}')
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

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='PB' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municipios PB.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing...')
    todas = []
    for ano in [2021, 2022, 2023, 2024, 2025, 2026]:
        todas.extend(parse_csv(ano, ibge_map))
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas PB.')

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
                if tentativas > 3: raise
                try: conn.close()
                except: pass
                conn, cur = reconectar()
        print(f'  {inseridas}/{total} ({inseridas*100//total}%)...', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas PB.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
