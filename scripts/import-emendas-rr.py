"""
Importa Emendas Estaduais RR — 2023 a 2026.

Fontes: RR_{ANO}.csv (semicolon, UTF-8/windows-1252), 14 colunas:
  [0]  Ano               [1]  Emenda (número)
  [2]  Parlamentar       [3]  Link do SEI
  [4]  Tipo de Instrumento  [5]  Tem Empenho?
  [6]  Naturezas da Despesa  [7]  Destinos (órgão executor)
  [8]  Localidades       [9]  Valor da Emenda
  [10] Valor Empenhado   [11] Valor Liquidado
  [12] Valor Pago        [13] Valor a Pagar

Valores no formato "R$ 130.000,00" (ponto = sep milhar, vírgula = decimal).
Município extraído de Localidades (nomes de cidades de RR).
idPortal: RR{ano}_{num_emenda}_r{idx}
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'RR'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

DESTINO_AREA_KW = [
    ('SAUDE','SAUDE'),('SAÚDE','SAUDE'),('SESAU','SAUDE'),('HOSPITAL','SAUDE'),('MEDICAMENTO','SAUDE'),
    ('EDUCACAO','EDUCACAO'),('EDUCAÇÃO','EDUCACAO'),('ESCOLA','EDUCACAO'),('ENSINO','EDUCACAO'),('SEED','EDUCACAO'),
    ('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),('SEAS','ASSISTENCIA_SOCIAL'),('SOCIAL','ASSISTENCIA_SOCIAL'),
    ('ESPORTE','ESPORTE'),('LAZER','ESPORTE'),('SELAR','ESPORTE'),
    ('CULTURA','CULTURA'),('SECEL','CULTURA'),
    ('SEGURANÇA','SEGURANCA'),('SEGURANCA','SEGURANCA'),('SESP','SEGURANCA'),('BOMBEIRO','SEGURANCA'),
    ('AGRICULTURA','AGRICULTURA'),('SEAPA','AGRICULTURA'),('AGROPECUARIA','AGRICULTURA'),('ADERR','AGRICULTURA'),
    ('HABITACAO','HABITACAO'),('HABITAÇÃO','HABITACAO'),
    ('SANEAMENTO','SANEAMENTO'),
    ('INFRAESTRUTURA','INFRAESTRUTURA'),('OBRAS','INFRAESTRUTURA'),('SEINFRA','INFRAESTRUTURA'),('TRANSPORT','INFRAESTRUTURA'),
    ('MEIO AMBIENTE','MEIO_AMBIENTE'),('AMBIENTAL','MEIO_AMBIENTE'),('FEMARH','MEIO_AMBIENTE'),
]

def sem_acento(s):
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_destino(destino):
    o = sem_acento(destino.upper())
    for kw, area in DESTINO_AREA_KW:
        if sem_acento(kw) in o:
            return area
    return 'OUTROS'

def normalizar_nome(s):
    if not s: return s
    stop = {'de','da','do','das','dos','e','em','na','no','nas','nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def to_float_brl(v):
    if not v: return 0.0
    s = str(v).strip()
    s = re.sub(r'[R$\s]', '', s)
    s = s.replace('.', '').replace(',', '.')
    try: return float(s)
    except: return 0.0

def cuid_like():
    import random, string, time
    ts = hex(int(time.time()*1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase+string.digits, k=20))
    return 'c'+ts+rand

def extrair_municipio(localidade, ibge_map):
    if not localidade: return None, None
    loc = str(localidade).strip()
    # Roraima (estado inteiro) → sem município específico
    if loc.lower() in ('roraima', 'rr', 'estado de roraima'):
        return None, None
    key = sem_acento(loc.upper())
    if key in ibge_map:
        return normalizar_nome(loc), ibge_map[key]
    palavras = key.split()
    for n in range(min(3, len(palavras)), 0, -1):
        pfx = ' '.join(palavras[:n])
        for k, cod in ibge_map.items():
            if k.startswith(pfx):
                return normalizar_nome(loc), cod
    return normalizar_nome(loc), None

def decode_file(path):
    raw = open(path, 'rb').read()
    for enc in ['utf-8-sig', 'utf-8', 'windows-1252', 'latin-1']:
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode('latin-1', errors='replace')

def parse_csv(ano, ibge_map):
    path = os.path.join(DATA_DIR, f'RR_{ano}.csv')
    if not os.path.exists(path):
        print(f'  RR_{ano}.csv: nao encontrado, pulando.')
        return []
    text = decode_file(path)
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=';'))

    emendas = []; sem_ibge = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 10: continue
        parlamentar = row[2].strip()
        if not parlamentar: continue

        num_emenda   = row[1].strip()
        instrumento  = row[4].strip()
        destino      = row[7].strip()
        localidade   = row[8].strip()
        val_emenda   = to_float_brl(row[9])
        val_emp      = to_float_brl(row[10])
        val_pago     = to_float_brl(row[12])

        if val_emenda == 0 and val_emp == 0: continue

        muni_nome, codigo_ibge = extrair_municipio(localidade, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        area = area_de_destino(destino)
        tipo = instrumento if instrumento and instrumento not in ('-', '') else 'EMENDA IMPOSITIVA'
        id_portal = f'RR{ano}_{num_emenda}_r{idx}'

        emendas.append({
            'idPortal':      id_portal,
            'numero':        num_emenda or None,
            'ano':           ano,
            'tipo':          tipo[:100],
            'funcao':        destino[:200] if destino else None,
            'area':          area,
            'objeto':        None,
            'orgao':         destino[:200] if destino else None,
            'beneficiario':  None,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_emenda if val_emenda > 0 else val_emp,
            'valEmp':        val_emp,
            'valPago':       val_pago,
            'parlUpper':     parlamentar.upper(),
            'parlNome':      normalizar_nome(parlamentar),
            'partido':       None,
        })

    print(f'  RR_{ano}: {len(emendas)} emendas | sem IBGE: {sem_ibge}')
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

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='RR' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municipios RR.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing...')
    todas = []
    for ano in [2023, 2024, 2025, 2026]:
        todas.extend(parse_csv(ano, ibge_map))
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas RR.')

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

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas RR.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
