"""
Importa Emendas Estaduais AM — 2021 a 2026, INDIVIDUAL e BANCADA.

Fontes: AM_{ANO}_{INDIVIDUAL|BANCADA}.CSV
  [0] Cód. Órgão   [1] Órgão         [2] Cód. Parlamentar  [3] Parlamentar
  [4] emendaano    [5] coprogramatrabalho  [6] objetoemenda
  [7] vacadastrado [8] vasolicitado   [9] vaautorizado
  [10] vaempenhado [11] valiquidado   [12] vapago

Observações:
  - Não há coluna de município nem beneficiário — município extraído do
    texto de objetoemenda via regex (cobertura ~32%).
  - idPortal: AM{ano}_{I|B}_r{idx} (estável por posição dentro do arquivo).
  - valorEmpenhado = vaempenhado; valorPago = vapago; valorProposto = vaautorizado.
  - Campo objeto armazena o texto de objetoemenda (exibido nos detalhes).
"""

import sys, os, re, unicodedata, csv
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = ('postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
                '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres')
UF    = 'AM'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# ── Área ────────────────────────────────────────────────────────────────────────
ORGAO_AREA_KW = [
    ('SAÚDE', 'SAUDE'), ('SAUDE', 'SAUDE'), ('MEDICAMENTO', 'SAUDE'), ('HOSPITAL', 'SAUDE'),
    ('EDUCAÇÃO', 'EDUCACAO'), ('EDUCACAO', 'EDUCACAO'), ('CETAM', 'EDUCACAO'), ('ESCOLA', 'EDUCACAO'), ('ENSINO', 'EDUCACAO'),
    ('ASSISTÊNCIA SOCIAL', 'ASSISTENCIA_SOCIAL'), ('ASSISTENCIA SOCIAL', 'ASSISTENCIA_SOCIAL'),
    ('CIDADANIA', 'ASSISTENCIA_SOCIAL'), ('SOCIAL', 'ASSISTENCIA_SOCIAL'),
    ('ESPORTE', 'ESPORTE'), ('ESPORTES', 'ESPORTE'), ('ALTO RENDIMENTO', 'ESPORTE'),
    ('CULTURA', 'CULTURA'),
    ('SEGURANÇA', 'SEGURANCA'), ('SEGURANCA', 'SEGURANCA'), ('DEFESA CIVIL', 'SEGURANCA'),
    ('AGRICULTURA', 'AGRICULTURA'), ('AGROPECUÁRIA', 'AGRICULTURA'), ('AGROPECUARIA', 'AGRICULTURA'), ('FLORESTAL', 'AGRICULTURA'),
    ('HABITAÇÃO', 'HABITACAO'), ('HABITACAO', 'HABITACAO'),
    ('SANEAMENTO', 'SANEAMENTO'),
    ('INFRAESTRUTURA', 'INFRAESTRUTURA'), ('OBRAS', 'INFRAESTRUTURA'), ('TRANSPORT', 'INFRAESTRUTURA'),
    ('MEIO AMBIENTE', 'MEIO_AMBIENTE'), ('AMBIENTAL', 'MEIO_AMBIENTE'), ('SUSTENTÁVEL', 'MEIO_AMBIENTE'),
]

def sem_acento(s: str) -> str:
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_orgao(orgao: str) -> str:
    o = sem_acento(orgao.upper())
    for kw, area in ORGAO_AREA_KW:
        if sem_acento(kw) in o:
            return area
    return 'OUTROS'

def normalizar_nome(s: str) -> str:
    if not s:
        return s
    stop = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def to_float(v) -> float:
    if not v:
        return 0.0
    s = str(v).strip().replace('.', '').replace(',', '.')
    try:
        return float(s)
    except ValueError:
        return 0.0

def cuid_like() -> str:
    import random, string, time
    ts   = hex(int(time.time() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
    return 'c' + ts + rand

# ── Extração de município ────────────────────────────────────────────────────────
_RE_MUNI = [
    re.compile(r'munic[íi]p(?:io|ais)?\s+(?:de\s+)?([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,40}?)(?=\s*[,\.\(]|\s+visando|\s+para|\s+a\s+fim|\s*$)', re.IGNORECASE),
    re.compile(r'fundo\s+municipal\s+de\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,35}?)(?=\s*[,\.])', re.IGNORECASE),
    re.compile(r'prefeitura\s+(?:municipal\s+)?de\s+([A-ZÀ-Úa-zà-ú][A-ZÀ-Úa-zà-ú\s]{2,35}?)(?=\s*[,\.\(])', re.IGNORECASE),
]

def extrair_municipio(texto: str, ibge_map: dict) -> tuple[str | None, str | None]:
    for pat in _RE_MUNI:
        m = pat.search(texto)
        if not m:
            continue
        candidato = m.group(1).strip().rstrip('.,').strip()
        if len(candidato) < 3 or len(candidato) > 50:
            continue
        key = sem_acento(candidato.upper())
        # Verifica contra municípios reais do AM
        if key in ibge_map:
            return normalizar_nome(candidato), ibge_map[key]
        # Tenta match parcial (primeiras 2 palavras)
        palavras = key.split()
        if len(palavras) >= 2:
            prefixo = ' '.join(palavras[:2])
            for nome_mapa, cod in ibge_map.items():
                if nome_mapa.startswith(prefixo):
                    return normalizar_nome(candidato), cod
    return None, None

# ── Parse CSV ────────────────────────────────────────────────────────────────────
def parse_csv(ano: int, tipo_code: str, fname: str, ibge_map: dict) -> list[dict]:
    path = os.path.join(DATA_DIR, fname)
    if not os.path.exists(path):
        print(f'  {fname}: não encontrado, pulando.')
        return []

    raw = open(path, 'rb').read()
    text = raw.decode('windows-1252', errors='replace')
    lines = [l for l in text.splitlines() if l.strip()]
    if len(lines) < 2:
        print(f'  {fname}: sem dados.')
        return []

    reader = csv.reader(lines, delimiter=';')
    rows = list(reader)

    emendas = []
    sem_ibge = 0
    tipo_label = 'EMENDA INDIVIDUAL' if tipo_code == 'I' else 'EMENDA BANCADA'

    for idx, row in enumerate(rows[1:]):
        if len(row) < 13:
            continue
        orgao_cod  = str(row[0] or '').strip()
        orgao_nome = str(row[1] or '').strip()
        parl_raw   = str(row[3] or '').strip()
        emendaano  = str(row[4] or '').strip()  # "009/2021"
        objeto_raw = str(row[6] or '').strip()
        val_prop   = to_float(row[9])   # vaautorizado
        val_emp    = to_float(row[10])  # vaempenhado
        val_liq    = to_float(row[11])  # valiquidado (não mapeado no schema, ignorado)
        val_pago   = to_float(row[12])  # vapago

        if not parl_raw or not emendaano:
            continue
        # Pula linhas sem valor algum
        if val_prop == 0 and val_emp == 0 and val_pago == 0:
            continue

        muni_nome, codigo_ibge = extrair_municipio(objeto_raw, ibge_map)
        if not codigo_ibge:
            sem_ibge += 1

        id_portal = f'AM{ano}_{tipo_code}_r{idx}'

        emendas.append({
            'idPortal':      id_portal,
            'numero':        emendaano,
            'ano':           ano,
            'tipo':          tipo_label,
            'funcao':        orgao_nome[:200] if orgao_nome else None,
            'area':          area_de_orgao(orgao_nome),
            'objeto':        objeto_raw[:500] if objeto_raw else None,
            'orgao':         orgao_nome[:200] if orgao_nome else None,
            'beneficiario':  None,
            'cnpj':          None,
            'codigoIbge':    codigo_ibge,
            'municipioNome': muni_nome,
            'valProp':       val_prop if val_prop > 0 else val_emp,
            'valEmp':        val_emp,
            'valPago':       val_pago,
            'parlUpper':     parl_raw.upper(),
            'parlNome':      normalizar_nome(parl_raw),
            'partido':       None,
        })

    print(f'  {fname}: {len(emendas)} emendas | sem IBGE: {sem_ibge} ({sem_ibge*100//len(emendas) if emendas else 0}%)')
    return emendas

# ── SQL ──────────────────────────────────────────────────────────────────────────
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

# ── Main ─────────────────────────────────────────────────────────────────────────
def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando…')
    conn, cur = reconectar()

    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats WHERE uf = 'AM'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios AM no banco.')

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados AM já no banco.')

    now = datetime.utcnow()

    print(f'\n[{datetime.now():%H:%M:%S}] Parsing arquivos…')
    todas: list[dict] = []
    for ano in [2021, 2022, 2023, 2024, 2025, 2026]:
        todas.extend(parse_csv(ano, 'I', f'AM_{ano}_INDIVIDUAL.CSV', ibge_map))
        todas.extend(parse_csv(ano, 'B', f'AM_{ano}_BANCADA.CSV',    ibge_map))

    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas.')

    # Novos parlamentares
    parls_novos: dict[str, dict] = {}
    for e in todas:
        pu = e['parlUpper']
        if pu not in parl_map and pu not in parls_novos:
            parls_novos[pu] = {'id': cuid_like(), 'nome': e['parlNome']}

    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    for pu, p in parls_novos.items():
        cur.execute("""
            INSERT INTO parlamentares (id, nome, partido, uf, cargo, ativo, "createdAt", "updatedAt")
            VALUES (%s, %s, NULL, %s, %s, true, %s, %s)
            ON CONFLICT DO NOTHING
        """, (p['id'], p['nome'], UF, CARGO, now, now))
        parl_map[pu] = p['id']
    conn.commit()

    # Upsert emendas
    total     = len(todas)
    inseridas = 0
    for i in range(0, total, BATCH):
        batch = todas[i:i + BATCH]
        tentativas = 0
        while True:
            try:
                for e in batch:
                    cur.execute(INSERT_SQL, (
                        cuid_like(),
                        e['idPortal'], ESFERA, e['ano'], e['numero'],
                        e['tipo'], e['funcao'], e['area'],
                        e['objeto'], e['orgao'], e['beneficiario'], e['cnpj'],
                        UF, e['codigoIbge'], e['municipioNome'],
                        e['valEmp'], e['valPago'], e['valProp'],
                        parl_map.get(e['parlUpper']), now, now,
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

        print(f'  {inseridas}/{total} ({inseridas*100//total}%)…', end='\r', flush=True)

    print(f'\n[{datetime.now():%H:%M:%S}] Concluido: {inseridas} emendas AM importadas/atualizadas.')
    cur.close()
    conn.close()

if __name__ == '__main__':
    main()
