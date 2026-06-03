"""
Importa Emendas Estaduais RO — 2023 a 2026.

Fonte: RO.xlsx (aba TEntity), 30 colunas:
  [0]  Exercicio          [1]  Data_emissao
  [2]  Nome_unidade       [4]  Cod_documento (NE)
  [5]  Nome_fonte_detalhada → Parlamentar
  [6]  Descricao          [7]  Empenhado
  [8]  Liquidado          [9]  Pago
  [11] Maior_empenhar → valorProposto
  [13] Descricao_funcao   [16] Cod_documento_pe (PE)
  [19] Cod_emenda         [23] Localidade Beneficiada
  [27] Tipo Emenda        [29] Beneficiario

Município extraído de Localidade Beneficiada ("Cacoal - RO" → "Cacoal").
valorEmpenhado = Empenhado; valorProposto = Maior_empenhar; valorPago = Pago.
idPortal: RO{ano}_{cod_ne_sanitizado}
"""

import sys, os, re, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

try:
    import openpyxl
except ImportError:
    print('Instale openpyxl: pip install openpyxl')
    sys.exit(1)

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF     = 'RO'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

FUNCAO_AREA = {
    'SAUDE': 'SAUDE', 'SAÚDE': 'SAUDE',
    'EDUCACAO': 'EDUCACAO', 'EDUCAÇÃO': 'EDUCACAO',
    'ASSISTENCIA SOCIAL': 'ASSISTENCIA_SOCIAL', 'ASSISTÊNCIA SOCIAL': 'ASSISTENCIA_SOCIAL',
    'ESPORTE': 'ESPORTE', 'LAZER': 'ESPORTE', 'DESPORTO': 'ESPORTE',
    'CULTURA': 'CULTURA',
    'SEGURANCA PUBLICA': 'SEGURANCA', 'SEGURANÇA PÚBLICA': 'SEGURANCA',
    'AGRICULTURA': 'AGRICULTURA', 'AGROPECUARIA': 'AGRICULTURA',
    'HABITACAO': 'HABITACAO', 'HABITAÇÃO': 'HABITACAO',
    'SANEAMENTO': 'SANEAMENTO',
    'TRANSPORTE': 'INFRAESTRUTURA', 'INFRAESTRUTURA': 'INFRAESTRUTURA',
    'MEIO AMBIENTE': 'MEIO_AMBIENTE',
}

def sem_acento(s):
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_funcao(funcao):
    if not funcao: return 'OUTROS'
    f = sem_acento(funcao.upper())
    for kw, area in FUNCAO_AREA.items():
        if sem_acento(kw) in f:
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
    # "Estado de Rondônia" ou similar → sem município
    if 'estado' in loc.lower() or loc.upper() in ('RONDONIA', 'RONDÔNIA', 'RO'):
        return None, None
    # Remove sufixo " - RO" ou "/ RO"
    nome = re.sub(r'\s*[-/]\s*RO\s*$', '', loc, flags=re.IGNORECASE).strip()
    if not nome or len(nome) < 3:
        return None, None
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

def parse_xlsx(ibge_map):
    path = os.path.join(DATA_DIR, 'RO.xlsx')
    if not os.path.exists(path):
        print('  RO.xlsx: nao encontrado.')
        return []

    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb['TEntity']

    emendas = []; sem_ibge = 0; puladas = 0
    for row in ws.iter_rows(values_only=True, min_row=2):
        if not row[0]: continue

        exercicio = str(row[0]).strip()
        if not re.match(r'^\d{4}$', exercicio):
            puladas += 1; continue
        ano = int(exercicio)

        parlamentar = str(row[5] or '').strip()
        if not parlamentar or parlamentar in ('-', 'None', ''):
            puladas += 1; continue

        orgao       = str(row[2] or '').strip()
        cod_ne      = str(row[4] or '').strip()
        descricao   = str(row[6] or '').strip()
        val_emp     = to_float_brl(row[7])
        val_pago    = to_float_brl(row[9])
        val_prop    = to_float_brl(row[11])
        funcao      = str(row[13] or '').strip()
        cod_pe      = str(row[16] or '').strip()
        cod_emenda  = str(row[19] or '').strip()
        localidade  = str(row[23] or '').strip()
        tipo_emenda = str(row[27] or '').strip()
        beneficiario = str(row[29] or '').strip()

        if val_prop == 0 and val_emp == 0: continue

        muni_nome, codigo_ibge = extrair_municipio(localidade, ibge_map)
        if not codigo_ibge: sem_ibge += 1

        cod_clean = re.sub(r'[^\w]', '', cod_ne) or re.sub(r'[^\w]', '', cod_pe) or f'r{len(emendas)}'
        id_portal = f'RO{ano}_{cod_clean}'

        tipo_label = f'EMENDA {tipo_emenda.upper()}' if tipo_emenda and tipo_emenda not in ('NÃO INFORMADO', '-') else 'EMENDA INDIVIDUAL'

        benef = None
        if beneficiario and beneficiario not in ('Não informado (verificar descrição)', '-', 'None'):
            benef = beneficiario[:300]

        emendas.append({
            'idPortal':      id_portal,
            'numero':        cod_emenda if cod_emenda and cod_emenda != 'NÃO INFORMADO' else None,
            'ano':           ano,
            'tipo':          tipo_label,
            'funcao':        funcao[:200] if funcao else orgao[:200],
            'area':          area_de_funcao(funcao),
            'objeto':        descricao[:500] if descricao else None,
            'orgao':         orgao[:200] if orgao else None,
            'beneficiario':  benef,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_prop if val_prop > 0 else val_emp,
            'valEmp':        val_emp,
            'valPago':       val_pago,
            'parlUpper':     parlamentar.upper(),
            'parlNome':      normalizar_nome(parlamentar),
            'partido':       None,
        })

    print(f'  RO: {len(emendas)} emendas | sem IBGE: {sem_ibge} | puladas: {puladas}')
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

    cur.execute("SELECT DISTINCT ON (UPPER(TRIM(nome))) UPPER(TRIM(nome)) AS n, \"codigoIbge\" FROM municipio_stats WHERE uf='RO' ORDER BY UPPER(TRIM(nome))")
    ibge_map = {sem_acento(r['n']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municipios RO.')

    cur.execute("SELECT id, UPPER(TRIM(nome)) AS n FROM parlamentares WHERE cargo=%s AND uf=%s", (CARGO, UF))
    parl_map = {r['n']: r['id'] for r in cur.fetchall()}
    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing...')
    todas = parse_xlsx(ibge_map)
    print(f'[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas RO.')

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

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas RO.')
    cur.close(); conn.close()

if __name__ == '__main__':
    main()
