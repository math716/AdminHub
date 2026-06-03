"""
Importa Emendas Estaduais SE — 2022 a 2025.

Fontes: SE_{ANO}.csv (comma, windows-1252 em 2022-2024, UTF-8 em 2025)
  [0] Exercício  [1] Órgão Processador  [2] Parlamentar
  [3] Descrição do Objeto  [4] Executor  [5] Localidade
  [6] Ação  [7] GND  [8] Valor Indicado  [9] Valor Pago

Todas as entradas são emendas parlamentares (coluna Parlamentar preenchida).
Município extraído da coluna Localidade (já fornecida).

Formato de valores:
  - "R$<NBSP>200,00": valor em mil reais → × 1000 → R$200.000
  - "1.000.000" (sem prefixo R$): valor direto em reais

idPortal: SE{ano}_r{idx}
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'SE'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

ORGAO_AREA_KW = [
    ('SAUDE','SAUDE'),('SAÚDE','SAUDE'),('HOSPITAL','SAUDE'),('MEDICAMENTO','SAUDE'),
    ('SES','SAUDE'),('FUSERN','SAUDE'),('AMBULAN','SAUDE'),
    ('EDUCACAO','EDUCACAO'),('EDUCAÇÃO','EDUCACAO'),('ESCOLA','EDUCACAO'),('ENSINO','EDUCACAO'),
    ('SEED','EDUCACAO'),('CETEC','EDUCACAO'),
    ('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),
    ('SOCIAL','ASSISTENCIA_SOCIAL'),('CIDADANIA','ASSISTENCIA_SOCIAL'),
    ('ESPORTE','ESPORTE'),('LAZER','ESPORTE'),('SECEL','ESPORTE'),
    ('CULTURA','CULTURA'),
    ('SEGURANÇA','SEGURANCA'),('SEGURANCA','SEGURANCA'),('BOMBEIRO','SEGURANCA'),('CBM','SEGURANCA'),('POLICIA','SEGURANCA'),
    ('AGRICULTURA','AGRICULTURA'),('AGROPECUARIA','AGRICULTURA'),('AGROPECUÁRIA','AGRICULTURA'),('EMDAGRO','AGRICULTURA'),
    ('HABITACAO','HABITACAO'),('HABITAÇÃO','HABITACAO'),('CEHOP','HABITACAO'),
    ('SANEAMENTO','SANEAMENTO'),('SANEAMENTO BASICO','SANEAMENTO'),('DESO','SANEAMENTO'),('CODERSE','SANEAMENTO'),
    ('INFRAESTRUTURA','INFRAESTRUTURA'),('OBRAS','INFRAESTRUTURA'),('DER','INFRAESTRUTURA'),('RODOVIARIA','INFRAESTRUTURA'),
    ('MEIO AMBIENTE','MEIO_AMBIENTE'),('AMBIENTAL','MEIO_AMBIENTE'),('ADEMA','MEIO_AMBIENTE'),
]

def sem_acento(s):
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_orgao(orgao, descricao=''):
    o = sem_acento(orgao.upper()) + ' ' + sem_acento(descricao.upper())
    for kw, area in ORGAO_AREA_KW:
        if sem_acento(kw) in o:
            return area
    return 'OUTROS'

def normalizar_nome(s):
    if not s: return s
    stop = {'de','da','do','das','dos','e','em','na','no','nas','nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def parse_valor_se(v):
    """
    Dois formatos:
      'R$<NBSP>200,00'  → strip prefixo, parse → 200.0 → × 1000 = 200000
      ' 1.000.000 '     → sem R$, ponto é sep milhar → 1000000
    """
    if not v: return 0.0
    s = v.strip()
    if not s or s in ('—', '-', '—'): return 0.0

    tem_rs = 'R' in s and '$' in s

    # Extrai apenas dígitos, vírgula e ponto
    digits = re.sub(r'[^\d\.,]', '', s)
    if not digits: return 0.0

    if ',' in digits and '.' in digits:
        # ambos: ponto = milhar, vírgula = decimal
        digits = digits.replace('.', '').replace(',', '.')
    elif ',' in digits:
        # só vírgula: separador decimal
        digits = digits.replace(',', '.')
    elif '.' in digits:
        partes = digits.split('.')
        if len(partes) > 2 or (len(partes) == 2 and len(partes[1]) == 3):
            # ponto = milhar (ex: 1.000.000)
            digits = digits.replace('.', '')
        # senão: decimal normal

    try:
        val = float(digits)
    except ValueError:
        return 0.0

    if tem_rs:
        val *= 1000.0  # mil reais

    return val

def cuid_like():
    import random, string, time
    ts = hex(int(time.time()*1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase+string.digits, k=20))
    return 'c'+ts+rand

def extrair_municipio(localidade, ibge_map):
    if not localidade: return None, None
    nome = localidade.strip()
    if not nome or len(nome) < 2: return None, None
    key = sem_acento(nome.upper())
    if key in ibge_map:
        return normalizar_nome(nome), ibge_map[key]
    palavras = key.split()
    for n in range(min(3, len(palavras)), 0, -1):
        pfx = ' '.join(palavras[:n])
        for k, cod in ibge_map.items():
            if k.startswith(pfx):
                return normalizar_nome(nome), cod
    return normalizar_nome(nome), None

def decode_file(path):
    raw = open(path, 'rb').read()
    for enc in ['utf-8-sig', 'utf-8', 'windows-1252', 'latin-1']:
        try:
            return raw.decode(enc)
        except Exception:
            pass
    return raw.decode('latin-1', errors='replace')

def parse_csv(ano, ibge_map):
    path = os.path.join(DATA_DIR, f'SE_{ano}.csv')
    if not os.path.exists(path):
        print(f'  SE_{ano}.csv: nao encontrado, pulando.')
        return []
    text = decode_file(path)
    lines = [l for l in text.splitlines() if l.strip()]
    rows = list(csv.reader(lines, delimiter=','))

    emendas = []; sem_ibge = 0
    for idx, row in enumerate(rows[1:]):
        if len(row) < 9: continue
        parlamentar = row[2].strip()
        if not parlamentar: continue

        orgao      = row[1].strip()
        descricao  = row[3].strip()
        executor   = row[4].strip()
        localidade = row[5].strip()
        val_ind    = row[8].strip()
        val_pago_s = row[9].strip() if len(row) > 9 else ''

        val_prop = parse_valor_se(val_ind)
        val_pago = parse_valor_se(val_pago_s)

        if val_prop == 0 and val_pago == 0: continue

        muni_nome, codigo_ibge = extrair_municipio(localidade, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        beneficiario = executor[:300] if executor and executor != descricao else None

        emendas.append({
            'idPortal':      f'SE{ano}_r{idx}',
            'numero':        None,
            'ano':           ano,
            'tipo':          'TRANSFERENCIA ESPECIAL',
            'funcao':        orgao[:200] if orgao else None,
            'area':          area_de_orgao(orgao, descricao),
            'objeto':        descricao[:500] if descricao else None,
            'orgao':         orgao[:200] if orgao else None,
            'beneficiario':  beneficiario,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_prop,
            'valEmp':        val_prop,
            'valPago':       val_pago,
            'parlUpper':     parlamentar.upper(),
            'parlNome':      normalizar_nome(parlamentar),
            'partido':       None,
        })

    print(f'  SE_{ano}: {len(emendas)} emendas | sem IBGE: {sem_ibge}')
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

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='SE' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municipios SE.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing...')
    todas = []
    for ano in [2022, 2023, 2024, 2025]:
        todas.extend(parse_csv(ano, ibge_map))
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas SE.')

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

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas SE.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
