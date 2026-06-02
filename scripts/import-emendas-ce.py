"""
Importa emendas parlamentares estaduais do Ceará (CE).

Fontes:
  data/estados/EMENDAS_CE_2024.csv  — latin-1, semicolon, 1035 linhas
  data/estados/EMENDAS_CE_2025.csv  — utf-8-sig, semicolon, 965 linhas

2024 colunas (col idx):
   1  COD_PARLAMENTAR  → (só para ID)
   2  NOM_PARLAMENTAR  → parlamentar.nome
   3  Nº Id Emenda     → idPortal = CE2024_{id} (único)
  16  DSC_FUNCAO       → area
  22  Objeto/Local     → municipioNome (extração por texto, raramente presente)
  12  VLR_EMENDA       → valorProposto (inteiro)
  39  Despesas Empenhadas → valorEmpenhado
  41  Despesas Pagas   → valorPago

2025 colunas (col idx):
   1  COD_PARLAMENTAR  → (só para ID)
   2  NOM_PARLAMENTAR  → parlamentar.nome
   3  COD_EMENDA       → parte do idPortal = CE2025_r{row_idx}
  17  DSC_FUNCAO       → area
  23  DSC_ACAO         → municipioNome (extração via regex "município de X")
  41  VAL_EMENDA       → valorProposto
  44  VAL_EMPENHADO    → valorEmpenhado
  45  VAL_PAGO         → valorPago
"""

import sys, os, re, csv, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF     = 'CE'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# ── Função → área ──────────────────────────────────────────────────────────────

FUNCAO_AREA: dict[str, str] = {
    'SAUDE':               'SAUDE',
    'EDUCACAO':            'EDUCACAO',
    'SEGURANCA PUBLICA':   'SEGURANCA',
    'ASSISTENCIA SOCIAL':  'ASSISTENCIA_SOCIAL',
    'HABITACAO':           'HABITACAO',
    'SANEAMENTO':          'SANEAMENTO',
    'AGRICULTURA':         'AGRICULTURA',
    'CULTURA':             'CULTURA',
    'DESPORTO E LAZER':    'ESPORTE',
    'GESTAO AMBIENTAL':    'MEIO_AMBIENTE',
    'URBANISMO':           'INFRAESTRUTURA',
    'TRANSPORTE':          'INFRAESTRUTURA',
    'ORGANIZACAO AGRARIA': 'AGRICULTURA',
    'DIREITOS DA CIDADANIA': 'ASSISTENCIA_SOCIAL',
}

def sem_acento(s: str) -> str:
    s = s.replace('-', ' ')
    return ''.join(
        c for c in unicodedata.normalize('NFD', s)
        if unicodedata.category(c) != 'Mn'
    )

def area_de_funcao(funcao: str) -> str:
    k = sem_acento(funcao.strip().upper())
    return FUNCAO_AREA.get(k, 'OUTROS')

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

def build_municipio_lookup(cur) -> tuple[dict, list]:
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'CE'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    nomes_ord = sorted(ibge_map.keys(), key=len, reverse=True)
    return ibge_map, nomes_ord

# Pattern: "município de X" — captures the city name after "município de"
_RE_MUNI = re.compile(
    r'munic[íi]p(?:io|ais)?\s+de\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌa-záéíóúâêîôûãõàèì]'
    r'[A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌa-záéíóúâêîôûãõàèì\s]+?)(?=\s*[,\n.]|\s*$)',
    re.IGNORECASE,
)
# Fallback: "em <Cidade>" at end of text
_RE_EM = re.compile(
    r'\bem\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÀÈÌ][a-záéíóúâêîôûãõàèì]+(?:\s+[A-Za-záéíóúâêîôûãõàèì]+)*)$',
)

def extrair_municipio(texto: str, ibge_map: dict, nomes_ord: list):
    """Tenta extrair município do texto livre. Retorna (nome_norm, codigoIbge)."""
    if not texto:
        return None, None

    # 1. "município de X"
    m = _RE_MUNI.search(texto)
    if m:
        candidato = sem_acento(m.group(1).strip().upper())
        if candidato in ibge_map:
            return normalizar_nome(m.group(1).strip()), ibge_map[candidato]
        # Try word-boundary match against DB list
        for nome in nomes_ord:
            if candidato.startswith(nome) or nome.startswith(candidato):
                return normalizar_nome(m.group(1).strip()), ibge_map[nome]

    # 2. DB lookup — word-boundary scan over the whole text
    t = sem_acento(texto.upper())
    for nome in nomes_ord:
        if len(nome) < 4:   # skip tiny names (e.g. ICÓ matches many things)
            continue
        if re.search(r'\b' + re.escape(nome) + r'\b', t):
            return normalizar_nome(nome), ibge_map[nome]

    return None, None

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

# ── Parsers ────────────────────────────────────────────────────────────────────

def parse_2024(ibge_map, nomes_ord) -> list[dict]:
    path = os.path.join(DATA_DIR, 'EMENDAS_CE_2024.csv')
    if not os.path.exists(path):
        print('  EMENDAS_CE_2024.csv não encontrado, pulando.')
        return []
    emendas = []
    sem_muni = 0
    with open(path, encoding='latin-1', errors='replace', newline='') as fh:
        reader = csv.reader(fh, delimiter=';')
        next(reader)  # header
        for row in reader:
            if len(row) < 40:
                continue
            cod_parl   = row[1].strip()
            parl_raw   = row[2].strip()
            id_emenda  = row[3].strip()
            funcao     = row[16].strip()
            objeto_raw = row[22].strip()
            val_prop   = to_float(row[12])
            val_emp    = to_float(row[39])
            val_pago   = to_float(row[41])

            if not parl_raw or not id_emenda:
                continue

            area = area_de_funcao(funcao)
            muni_nome, codigo_ibge = extrair_municipio(objeto_raw, ibge_map, nomes_ord)
            if not muni_nome:
                sem_muni += 1

            emendas.append({
                'idPortal':      f'CE2024_{id_emenda}',
                'numero':        id_emenda,
                'ano':           2024,
                'tipo':          None,
                'funcao':        funcao[:100] if funcao else None,
                'area':          area,
                'objeto':        objeto_raw[:500] if objeto_raw else None,
                'orgao':         None,
                'beneficiario':  None,
                'cnpj':          None,
                'codigoIbge':    codigo_ibge,
                'municipioNome': muni_nome,
                'valEmp':        val_emp,
                'valPago':       val_pago,
                'valProp':       val_prop if val_prop > 0 else max(val_emp, val_pago),
                'parlUpper':     parl_raw.upper(),
                'parlNome':      normalizar_nome(parl_raw),
            })

    pct = (len(emendas) - sem_muni) * 100 // len(emendas) if emendas else 0
    print(f'  CE_2024: {len(emendas)} emendas | sem município: {sem_muni} ({100-pct}%)')
    return emendas


def parse_2025(ibge_map, nomes_ord) -> list[dict]:
    path = os.path.join(DATA_DIR, 'EMENDAS_CE_2025.csv')
    if not os.path.exists(path):
        print('  EMENDAS_CE_2025.csv não encontrado, pulando.')
        return []
    emendas = []
    sem_muni = 0
    with open(path, encoding='utf-8-sig', errors='replace', newline='') as fh:
        reader = csv.reader(fh, delimiter=';')
        next(reader)  # header
        for idx, row in enumerate(reader):
            if len(row) < 42:
                continue
            parl_raw   = row[2].strip()
            funcao     = row[17].strip()
            dsc_acao   = row[23].strip()
            val_prop   = to_float(row[41])
            val_emp    = to_float(row[44])
            val_pago   = to_float(row[45])

            if not parl_raw:
                continue

            area = area_de_funcao(funcao)
            muni_nome, codigo_ibge = extrair_municipio(dsc_acao, ibge_map, nomes_ord)
            if not muni_nome:
                sem_muni += 1

            emendas.append({
                'idPortal':      f'CE2025_r{idx}',
                'numero':        row[3].strip() if len(row) > 3 else str(idx),
                'ano':           2025,
                'tipo':          None,
                'funcao':        funcao[:100] if funcao else None,
                'area':          area,
                'objeto':        dsc_acao[:500] if dsc_acao else None,
                'orgao':         None,
                'beneficiario':  None,
                'cnpj':          None,
                'codigoIbge':    codigo_ibge,
                'municipioNome': muni_nome,
                'valEmp':        val_emp,
                'valPago':       val_pago,
                'valProp':       val_prop if val_prop > 0 else max(val_emp, val_pago),
                'parlUpper':     parl_raw.upper(),
                'parlNome':      normalizar_nome(parl_raw),
            })

    pct = (len(emendas) - sem_muni) * 100 // len(emendas) if emendas else 0
    print(f'  CE_2025: {len(emendas)} emendas | sem município: {sem_muni} ({100-pct}%)')
    return emendas

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando ao banco…')
    conn, cur = reconectar()

    ibge_map, nomes_ord = build_municipio_lookup(cur)
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios CE no banco.')

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados CE já no banco.')

    now = datetime.utcnow()

    # ── 1. Parse arquivos ──────────────────────────────────────────────────────
    todas: list[dict] = []
    todas.extend(parse_2024(ibge_map, nomes_ord))
    todas.extend(parse_2025(ibge_map, nomes_ord))
    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas para importar.')

    # ── 2. Novos parlamentares ─────────────────────────────────────────────────
    parls_novos: dict[str, dict] = {}
    for e in todas:
        pu = e['parlUpper']
        if pu not in parl_map and pu not in parls_novos:
            parls_novos[pu] = {
                'id':      cuid_like(),
                'nome':    e['parlNome'],
                'partido': None,
                'uf':      UF,
                'cargo':   CARGO,
            }

    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')
    for pu, p in parls_novos.items():
        cur.execute("""
            INSERT INTO parlamentares (id, nome, partido, uf, cargo, ativo, "createdAt", "updatedAt")
            VALUES (%s, %s, %s, %s, %s, true, %s, %s)
            ON CONFLICT DO NOTHING
        """, (p['id'], p['nome'], p['partido'], p['uf'], p['cargo'], now, now))
        parl_map[pu] = p['id']
    conn.commit()
    print(f'[{datetime.now():%H:%M:%S}] Parlamentares inseridos.')

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

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas CE importadas com sucesso.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
