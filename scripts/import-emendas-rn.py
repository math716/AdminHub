"""
Importa Emendas Estaduais RN — 2023 a 2026.

Fonte: RN_2021-2026.csv (comma, UTF-8/windows-1252), 36 colunas:
  [0]  Exercicio            [1]  Codigo Emenda
  [2]  Tipo de autoria      [3]  Tipo de Emenda
  [4]  Nome do Deputado     [5]  Orgao
  [8]  Descrição            [9]  Beneficiário
  [10] Localidade beneficiada  [12] Area temática
  [25] Valor alocado        [26] Valor empenhado
  [27] Valor liquidado      [28] Valor pago

Apenas exercícios com ano numérico (4 dígitos).
valorProposto = Valor alocado; valorEmpenhado = Valor empenhado.
Valores no formato americano "300,000.00" (vírgula = sep milhar).
Município extraído de Localidade beneficiada (quando disponível).
idPortal: RN{ano}_{codigo_emenda_sanitizado}
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'RN'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

AREA_KW = [
    ('SAUDE','SAUDE'),('SAÚDE','SAUDE'),('HOSPITAL','SAUDE'),('MEDICAMENTO','SAUDE'),
    ('EDUCACAO','EDUCACAO'),('EDUCAÇÃO','EDUCACAO'),('ESCOLA','EDUCACAO'),('ENSINO','EDUCACAO'),
    ('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),
    ('SOCIAL','ASSISTENCIA_SOCIAL'),('CIDADANIA','ASSISTENCIA_SOCIAL'),
    ('ESPORTE','ESPORTE'),('LAZER','ESPORTE'),
    ('CULTURA','CULTURA'),
    ('SEGURANÇA','SEGURANCA'),('SEGURANCA','SEGURANCA'),('DEFESA CIVIL','SEGURANCA'),
    ('AGRICULTURA','AGRICULTURA'),('AGROPECUARIA','AGRICULTURA'),('AGROPECUÁRIA','AGRICULTURA'),
    ('HABITACAO','HABITACAO'),('HABITAÇÃO','HABITACAO'),
    ('SANEAMENTO','SANEAMENTO'),
    ('INFRAESTRUTURA','INFRAESTRUTURA'),('OBRAS','INFRAESTRUTURA'),('TRANSPORT','INFRAESTRUTURA'),
    ('MEIO AMBIENTE','MEIO_AMBIENTE'),('AMBIENTAL','MEIO_AMBIENTE'),
]

def sem_acento(s):
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_campo(campo):
    o = sem_acento(campo.upper())
    for kw, area in AREA_KW:
        if sem_acento(kw) in o:
            return area
    return 'OUTROS'

def normalizar_nome(s):
    if not s: return s
    stop = {'de','da','do','das','dos','e','em','na','no','nas','nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def to_float_us(v):
    """Formato americano: 300,000.00 — vírgula é separador de milhar."""
    if not v: return 0.0
    s = str(v).strip().replace(',', '')
    try: return float(s)
    except: return 0.0

def cuid_like():
    import random, string, time
    ts = hex(int(time.time()*1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase+string.digits, k=20))
    return 'c'+ts+rand

_INVALIDO = re.compile(r'EM\s+PROCESSO|PT\s+PRONTO|pt\s+em\s+and', re.IGNORECASE)

def extrair_municipio(localidade, ibge_map):
    if not localidade or _INVALIDO.search(localidade):
        return None, None
    # Limpa
    nome = localidade.strip()
    # Remove sufixo "/ RN" ou "- RN"
    nome = re.sub(r'\s*[/\-]\s*RN\s*$', '', nome, flags=re.IGNORECASE).strip()
    if not nome or len(nome) < 3:
        return None, None
    key = sem_acento(nome.upper())
    if key in ibge_map:
        return normalizar_nome(nome), ibge_map[key]
    # Tenta primeiras palavras
    palavras = key.split()
    for n in range(min(3, len(palavras)), 0, -1):
        pfx = ' '.join(palavras[:n])
        for k, cod in ibge_map.items():
            if k.startswith(pfx):
                return normalizar_nome(nome), cod
    return normalizar_nome(nome), None

def decode_file(path):
    raw = open(path, 'rb').read()
    for enc in ['utf-8-sig', 'windows-1252', 'latin-1']:
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode('latin-1', errors='replace')

def parse_csv(ibge_map):
    path = os.path.join(DATA_DIR, 'RN_2021-2026.csv')
    if not os.path.exists(path):
        print('  RN_2021-2026.csv: nao encontrado.')
        return []
    text = decode_file(path)
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=','))

    emendas = []; sem_ibge = 0; puladas = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 29: continue
        exercicio = row[0].strip().rstrip()
        # Aceita apenas anos com 4 dígitos
        if not re.match(r'^\d{4}$', exercicio):
            puladas += 1
            continue
        ano = int(exercicio)

        codigo    = row[1].strip()
        autoria   = row[2].strip()   # Individual / Bancada
        tipo_em   = row[3].strip()   # Tipo de Emenda
        deputado  = row[4].strip()
        orgao     = row[5].strip()
        descricao = row[8].strip()
        benefic   = row[9].strip()
        localidade = row[10].strip()
        area_raw  = row[12].strip()

        val_prop  = to_float_us(row[25])
        val_emp   = to_float_us(row[26])
        val_pago  = to_float_us(row[28])

        if not deputado: continue
        if val_prop == 0 and val_emp == 0: continue

        tipo_label = f'EMENDA {autoria.upper()}' if autoria else 'EMENDA INDIVIDUAL'
        area = area_de_campo(area_raw) if area_raw and not _INVALIDO.search(area_raw) else area_de_campo(orgao)

        muni_nome, codigo_ibge = extrair_municipio(localidade, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        codigo_clean = re.sub(r'[^\w]', '_', codigo)
        id_portal = f'RN{ano}_{codigo_clean}'

        objeto = descricao[:500] if descricao and not _INVALIDO.search(descricao) else None
        benef_final = benefic[:300] if benefic and not _INVALIDO.search(benefic) else None

        emendas.append({
            'idPortal':      id_portal,
            'numero':        codigo or None,
            'ano':           ano,
            'tipo':          tipo_label,
            'funcao':        orgao[:200] if orgao else None,
            'area':          area,
            'objeto':        objeto,
            'orgao':         orgao[:200] if orgao else None,
            'beneficiario':  benef_final,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_prop if val_prop > 0 else val_emp,
            'valEmp':        val_emp,
            'valPago':       val_pago,
            'parlUpper':     deputado.upper(),
            'parlNome':      normalizar_nome(deputado),
            'partido':       None,
        })

    print(f'  RN: {len(emendas)} emendas | sem IBGE: {sem_ibge} | linhas invalidas: {puladas}')
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

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='RN' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municipios RN.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing...')
    todas = parse_csv(ibge_map)
    print(f'[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas RN.')

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

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas RN.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
