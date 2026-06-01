"""
Importa emendas parlamentares estaduais do Acre (AC).

Fontes: data/estados/AC_2023.xlsx … AC_2026.xlsx  (SEPLAN/AC)

Estrutura de cada xlsx:
  Linha 1 → título (ignorada)
  Linha 2 → cabeçalho das colunas:
    0  N° Emenda                          → idPortal / numero
    1  Ano                                → ano
    2  Parlamentar                        → parlamentar.nome
    3  Descrição Modalidade Aplicacao     → tipo
    4  Municípios                         → municipioNome + lookup IBGE
    5  Objeto da Emenda                   → objeto
    6  Concedente                         → orgaoExecutor + area
    7  Nome Entidade Beneficiada          → beneficiario
    8  Valor Emenda                       → valorProposto  (inteiro)
   11  Empenhado                          → valorEmpenhado (BR string)
   12  Pago                               → valorPago      (BR string)
  Linha 3+ → dados
"""

import sys, os, re, unicodedata
import openpyxl
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

UF     = 'AC'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200
ANOS   = [2023, 2024, 2025, 2026]

# ── Concedente → área ──────────────────────────────────────────────────────────

CONCEDENTE_AREA: dict[str, str] = {
    # Educação
    'SEE': 'EDUCACAO', 'IEPTEC': 'EDUCACAO',
    # Saúde
    'SESACRE': 'SAUDE', 'FUNDES': 'SAUDE', 'FUNDHACRE': 'SAUDE',
    'FUNDES/SESACRE': 'SAUDE',
    # Infraestrutura
    'DERACRE': 'INFRAESTRUTURA', 'SEOP': 'INFRAESTRUTURA', 'DETRAN': 'INFRAESTRUTURA',
    # Saneamento
    'SANEACRE': 'SANEAMENTO', 'CAGEACRE': 'SANEAMENTO',
    # Agricultura
    'SEAGRI': 'AGRICULTURA', 'ITERACRE': 'AGRICULTURA',
    # Assistência Social
    'SEASDH': 'ASSISTENCIA_SOCIAL', 'FUNDAC': 'ASSISTENCIA_SOCIAL',
    'FEM': 'ASSISTENCIA_SOCIAL', 'SEMULHER': 'ASSISTENCIA_SOCIAL',
    'SEPI': 'ASSISTENCIA_SOCIAL',
    # Segurança
    'PM/AC': 'SEGURANCA', 'PMAC': 'SEGURANCA', 'PC/AC': 'SEGURANCA',
    'PCAC': 'SEGURANCA', 'CBMAC': 'SEGURANCA', 'SEJUSP': 'SEGURANCA',
    'IAPEN/AC': 'SEGURANCA',
    # Meio ambiente
    'SEMA': 'MEIO_AMBIENTE', 'IMAC': 'MEIO_AMBIENTE',
    # Esporte / lazer
    'SEEL': 'ESPORTE',
    # Cultura
    'SECOM': 'CULTURA', 'FUNTAC': 'CULTURA',
}

def area_de_concedente(concedente: str) -> str:
    c = concedente.strip().upper()
    return CONCEDENTE_AREA.get(c, 'OUTROS')

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

def to_float_br(v) -> float:
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

MUNICIPIOS_ESTADUAIS = {'ESTADO DO ACRE', 'ESTADO', 'AC', ''}

def build_municipio_lookup(cur) -> dict:
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'AC'
         ORDER BY UPPER(TRIM(nome))
    """)
    return {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}

def lookup_municipio(municipio_raw: str, ibge_map: dict):
    """Retorna (nome_normalizado, codigoIbge). None, None para emendas estaduais."""
    raw = str(municipio_raw or '').strip()
    if not raw or sem_acento(raw.upper()) in {sem_acento(m) for m in MUNICIPIOS_ESTADUAIS}:
        return None, None
    key = sem_acento(raw.upper())
    codigo = ibge_map.get(key)
    return normalizar_nome(raw), codigo

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
        "orgaoExecutor"  = EXCLUDED."orgaoExecutor",
        beneficiario     = EXCLUDED.beneficiario,
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

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando ao banco…')
    conn, cur = reconectar()

    ibge_map = build_municipio_lookup(cur)
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios AC no banco.')

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados AC já no banco.')

    now = datetime.utcnow()

    # ── 1. Parse todos os xlsx ─────────────────────────────────────────────────
    todas: list[dict] = []
    parls_novos: dict[str, dict] = {}

    for ano in ANOS:
        path = os.path.join(DATA_DIR, f'AC_{ano}.xlsx')
        wb   = openpyxl.load_workbook(path, read_only=True, data_only=True)
        ws   = wb.active

        emendas_ano = 0
        sem_muni    = 0

        for row in ws.iter_rows(min_row=3, values_only=True):
            # Ignora linha vazia ou linha de cabeçalho repetida
            num_emenda = str(row[0] or '').strip()
            if not num_emenda or num_emenda in ('N° Emenda', 'Emenda'):
                continue

            parl_raw   = str(row[2] or '').strip()
            if not parl_raw or parl_raw == 'Parlamentar':
                continue

            tipo_raw   = str(row[3] or '').strip() or None
            muni_raw   = str(row[4] or '').strip()
            objeto_raw = str(row[5] or '').strip() or None
            concedente = str(row[6] or '').strip()
            benefic    = str(row[7] or '').strip() or None
            val_prop   = float(row[8]) if isinstance(row[8], (int, float)) else to_float_br(row[8])
            val_emp    = to_float_br(row[11])
            val_pago   = to_float_br(row[12])

            # Município
            muni_nome, codigo_ibge = lookup_municipio(muni_raw, ibge_map)
            if not muni_nome:
                sem_muni += 1

            area = area_de_concedente(concedente)

            parl_upper = parl_raw.upper()
            if parl_upper not in parl_map and parl_upper not in parls_novos:
                parls_novos[parl_upper] = {
                    'id':      cuid_like(),
                    'nome':    normalizar_nome(parl_raw),
                    'partido': None,
                    'uf':      UF,
                    'cargo':   CARGO,
                }

            todas.append({
                'idPortal':      str(num_emenda),
                'numero':        str(num_emenda),
                'ano':           ano,
                'tipo':          tipo_raw,
                'funcao':        concedente[:100] if concedente not in ('--', '') else None,
                'area':          area,
                'objeto':        objeto_raw[:500] if objeto_raw else None,
                'orgao':         concedente[:100] if concedente not in ('--', '') else None,
                'beneficiario':  benefic,
                'cnpj':          None,
                'codigoIbge':    codigo_ibge,
                'municipioNome': muni_nome,
                'valEmp':        val_emp,
                'valPago':       val_pago,
                'valProp':       val_prop if val_prop > 0 else max(val_emp, val_pago),
                'parlUpper':     parl_upper,
                'parlNome':      normalizar_nome(parl_raw),
            })
            emendas_ano += 1

        wb.close()
        pct_muni = (emendas_ano - sem_muni) * 100 // emendas_ano if emendas_ano else 0
        print(f'  AC_{ano}: {emendas_ano} emendas | sem município: {sem_muni} ({100-pct_muni}%)')

    print(f'\n[{datetime.now():%H:%M:%S}] Total: {len(todas)} emendas para importar.')
    print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')

    # ── 2. Novos parlamentares ─────────────────────────────────────────────────
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

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas AC importadas com sucesso.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
