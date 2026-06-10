"""
Importa Emendas Estaduais PR — 2021 a 2026.

Fonte: CSV gerado pelo scrape-powerbi-pr.py a partir do Power BI da SEFAZ/PR.

Campos do CSV:
  Nome do Autor da Emenda, Código da Emenda, Ano da Emenda, Valor Pago,
  Favorecido, UF Favorecido, Código UG, Código Documento,
  Código Unidade Orçamentária, Órgão, Órgão Superior,
  Tipo de Emendas B-C-I, Categoria Econômica, Categoria CONCATENADA,
  Fontes de Recursos GOV, Programa CONCATENADA, Ação CONCATENADA,
  Função CONCATENADA, SubFunção CONCATENADA, Grupo de Despes CONCATENADA,
  Modalidade de Aplicação CONCATENADA, Elemento Despesa CONCATENADA,
  Transferencias SIM NAO, Possui convênio?, CO

Uso:
  python scripts/import-emendas-pr.py
  python scripts/import-emendas-pr.py --anos 2024,2025,2026
  python scripts/import-emendas-pr.py --ano 2025
"""

import sys, os, re, unicodedata, csv, argparse, time
import psycopg2, psycopg2.extras

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Config ────────────────────────────────────────────────────────────────────
DATA_DIR     = os.path.join(os.path.dirname(__file__), '..', 'data', 'estados')
DATABASE_URL = os.environ.get('DATABASE_URL', '')

UF     = 'PR'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_FEDERAL'   # emendas federais destinadas ao PR
BATCH  = 200

ANOS_PADRAO = [2021, 2022, 2023, 2024, 2025, 2026]

# ── Mapeamento Função → Área ───────────────────────────────────────────────────
FUNCAO_AREA = [
    ('SAUDE',            'SAUDE'),
    ('SAÚDE',            'SAUDE'),
    ('HOSPITAL',         'SAUDE'),
    ('EDUCACAO',         'EDUCACAO'),
    ('EDUCAÇÃO',         'EDUCACAO'),
    ('ENSINO',           'EDUCACAO'),
    ('ASSISTENCIA SOCIAL','ASSISTENCIA_SOCIAL'),
    ('ASSISTÊNCIA SOCIAL','ASSISTENCIA_SOCIAL'),
    ('SOCIAL',           'ASSISTENCIA_SOCIAL'),
    ('ESPORTE',          'ESPORTE'),
    ('LAZER',            'ESPORTE'),
    ('CULTURA',          'CULTURA'),
    ('SEGURANÇA',        'SEGURANCA'),
    ('SEGURANCA',        'SEGURANCA'),
    ('DEFESA CIVIL',     'SEGURANCA'),
    ('AGRICULTURA',      'AGRICULTURA'),
    ('AGROPECUARIA',     'AGRICULTURA'),
    ('HABITACAO',        'HABITACAO'),
    ('HABITAÇÃO',        'HABITACAO'),
    ('SANEAMENTO',       'SANEAMENTO'),
    ('INFRAESTRUTURA',   'INFRAESTRUTURA'),
    ('OBRAS',            'INFRAESTRUTURA'),
    ('TRANSPORT',        'INFRAESTRUTURA'),
    ('ESTRADA',          'INFRAESTRUTURA'),
    ('MEIO AMBIENTE',    'MEIO_AMBIENTE'),
    ('AMBIENTAL',        'MEIO_AMBIENTE'),
    ('ENCARGOS',         'OUTROS'),
]

# ── Helpers ───────────────────────────────────────────────────────────────────
def sem_acento(s: str) -> str:
    s = s.replace('-', ' ')
    return ''.join(c for c in unicodedata.normalize('NFD', s) if unicodedata.category(c) != 'Mn')

def area_de_funcao(funcao: str, acao: str = '', programa: str = '') -> str:
    texto = sem_acento((funcao + ' ' + acao + ' ' + programa).upper())
    for kw, area in FUNCAO_AREA:
        if sem_acento(kw) in texto:
            return area
    return 'OUTROS'

def normalizar_nome(s: str) -> str:
    if not s: return s
    stop = {'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos'}
    words = s.strip().lower().split()
    return ' '.join(w.capitalize() if i == 0 or w not in stop else w for i, w in enumerate(words))

def to_float(v) -> float:
    if not v: return 0.0
    s = str(v).strip().replace(' ', '')
    if ',' in s and '.' in s:
        s = s.replace('.', '').replace(',', '.')
    elif ',' in s:
        s = s.replace(',', '.')
    try: return float(s)
    except: return 0.0

def cuid_like() -> str:
    import random, string
    ts   = hex(int(time.time() * 1000))[2:]
    rand = ''.join(random.choices(string.ascii_lowercase + string.digits, k=20))
    return 'c' + ts + rand

# ── Extração de município do campo Favorecido ─────────────────────────────────

# Padrões explícitos: captura o que vem após a preposição de/do/da
_PADROES_EXPLICITOS = [
    # Entidades municipais diretas
    re.compile(r'PREFEITURA\s+(?:MUNICIPAL\s+)?(?:DE\s+|DO\s+|DA\s+)?(.+)',        re.I),
    re.compile(r'CAMARA\s+(?:MUNICIPAL\s+)?(?:DE\s+|DO\s+|DA\s+)?(.+)',            re.I),
    re.compile(r'FUNDO\s+MUNICIPAL\s+(?:DE\s+\w+\s+)?(?:DE\s+|DO\s+|DA\s+)(.+)',  re.I),
    # Entidades com cidade no nome após DE/DO/DA
    re.compile(r'UNIVERSIDADE\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)', re.I),
    re.compile(r'HOSPITAL\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',     re.I),
    re.compile(r'INSTITUTO\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',    re.I),
    re.compile(r'FACULDADE\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',   re.I),
    re.compile(r'COLEGIO\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',     re.I),
    re.compile(r'ESCOLA\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',      re.I),
    re.compile(r'SECRETARIA\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',  re.I),
    re.compile(r'FUNDACAO\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)',   re.I),
    re.compile(r'ASSOCIACAO\s+.{0,40}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)', re.I),
    re.compile(r'SANTA CASA\s+.{0,20}?\s+(?:DE\s+|DO\s+|DA\s+)([A-ZÁÉÍÓÚÃÕÂÊÔÇÀ][A-ZÁÉÍÓÚÃÕÂÊÔÇÀ\s]{2,40}?)(?:\s*[-–/]|\s*$)', re.I),
]

# Palavras-chave que indicam beneficiário estadual/federal (sem município específico)
_ESTADUAL_KEYWORDS = {
    'ESTADO DO PARANA', 'ESTADO DO PR', 'GOVERNO DO PARANA',
    'PARANA EDIFICACOES', 'PARANACIDADE', 'PARANAEDUCACAO',
    'SANEPAR', 'COPEL', 'COHAPAR', 'EMATER',
    'FUNDO ESTADUAL', 'SECRETARIA ESTADUAL', 'SECRETARIA DE ESTADO',
    'MINISTERIO', 'FUNDO NACIONAL', 'GOVERNO FEDERAL',
    'UNIVERSIDADE FEDERAL DO PARANA', 'UFPR',
}


def _busca_em_ibge(candidato: str, ibge_map: dict):
    """Tenta encontrar candidato no mapa IBGE — exato, depois por prefixo."""
    key = sem_acento(candidato.upper().strip())
    if key in ibge_map:
        return normalizar_nome(candidato.lower()), ibge_map[key]
    # Remove sufixos comuns que podem ter escapado
    key = re.sub(r'\s*(DO\s+PARANA|DE\s+PARANA|PR|PARANA)\s*$', '', key).strip()
    if key in ibge_map:
        return normalizar_nome(key.lower()), ibge_map[key]
    # Prefixo decrescente (3 → 2 → 1 palavra)
    palavras = key.split()
    for n in range(min(4, len(palavras)), 0, -1):
        pfx = ' '.join(palavras[:n])
        if len(pfx) < 4:
            continue
        matches = [(k, v) for k, v in ibge_map.items() if k == pfx]
        if len(matches) == 1:
            nome, cod = matches[0]
            return normalizar_nome(nome.lower()), cod
    return None, None


def extrair_municipio(favorecido: str, ibge_map: dict, ibge_sorted: list | None = None) -> tuple:
    """
    Tenta inferir município e código IBGE a partir do campo Favorecido.

    Estratégias (em ordem):
    1. Padrões explícitos (Prefeitura de X, Universidade de X, Hospital de X…)
    2. Varredura: procura qualquer nome de município do PR dentro do texto
    """
    if not favorecido:
        return None, None

    fav_upper = sem_acento(favorecido.strip().upper())

    # Ignora beneficiários claramente estaduais/federais
    for kw in _ESTADUAL_KEYWORDS:
        if sem_acento(kw) in fav_upper:
            return None, None

    # ── Estratégia 1: padrões explícitos ──────────────────────────────────────
    for pat in _PADROES_EXPLICITOS:
        m = pat.search(favorecido)
        if not m:
            continue
        candidato = m.group(1).strip().rstrip('.,- ')
        nome, cod = _busca_em_ibge(candidato, ibge_map)
        if cod:
            return nome, cod

    # ── Estratégia 2: varredura por nome de município no texto ─────────────────
    # Ordena por comprimento decrescente para preferir nomes mais longos
    # (ex: "PONTA GROSSA" antes de "GROSSA")
    if ibge_sorted is None:
        ibge_sorted = sorted(ibge_map.keys(), key=len, reverse=True)

    for mun_key in ibge_sorted:
        if len(mun_key) < 4:
            continue
        # Busca o nome do município como palavra completa no texto
        pattern = r'(?<![A-Z])' + re.escape(mun_key) + r'(?![A-Z])'
        if re.search(pattern, fav_upper):
            return normalizar_nome(mun_key.lower()), ibge_map[mun_key]

    return None, None

# ── Leitura do CSV ────────────────────────────────────────────────────────────
def ler_csv(path: str) -> list[dict]:
    raw = open(path, 'rb').read()
    for enc in ['utf-8-sig', 'utf-8', 'windows-1252', 'latin-1']:
        try:
            text = raw.decode(enc)
            break
        except Exception:
            pass
    else:
        text = raw.decode('latin-1', errors='replace')

    reader = csv.DictReader(text.splitlines())
    return list(reader)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description='Importa emendas PR para o banco')
    parser.add_argument('--anos',  default='', help='Anos separados por vírgula')
    parser.add_argument('--ano',   default='', help='Ano único')
    args = parser.parse_args()

    if args.ano:
        anos = [int(args.ano)]
    elif args.anos:
        anos = [int(a.strip()) for a in args.anos.split(',') if a.strip().isdigit()]
    else:
        anos = ANOS_PADRAO

    if not DATABASE_URL:
        print('ERRO: variável DATABASE_URL não definida.')
        sys.exit(1)

    conn = psycopg2.connect(DATABASE_URL)
    conn.autocommit = False
    cur  = conn.cursor()

    # Carrega mapa IBGE dos municípios do PR
    print('Carregando municípios do PR…')
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'PR'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(row[0]): row[1] for row in cur.fetchall()}
    ibge_sorted = sorted(ibge_map.keys(), key=len, reverse=True)
    print(f'  {len(ibge_map)} municípios carregados.')

    total_inseridos = 0
    total_atualizados = 0

    for ano in anos:
        csv_path = os.path.join(DATA_DIR, f'emendas_PR_{ano}.csv')
        if not os.path.exists(csv_path):
            print(f'\n[{ano}] Arquivo não encontrado: {csv_path} — pulando.')
            continue

        linhas = ler_csv(csv_path)
        print(f'\n[{ano}] {len(linhas)} linhas encontradas em {os.path.basename(csv_path)}')

        # Agrupa por Código da Emenda + Código Documento (cada linha é um documento de pagamento)
        # Para o banco: upsert por idPortal = "PR{ano}_{CodigoDocumento}"
        batch_data = []

        for row in linhas:
            nome_autor   = (row.get('Nome do Autor da Emenda') or '').strip()
            cod_emenda   = (row.get('Código da Emenda') or '').strip()
            cod_doc      = (row.get('Código Documento') or '').strip()
            ano_emenda   = int(row.get('Ano da Emenda') or ano)
            valor_pago   = to_float(row.get('Valor Pago') or 0)
            favorecido   = (row.get('Favorecido') or '').strip()
            uf_fav       = (row.get('UF Favorecido') or '').strip()
            orgao        = (row.get('Órgão') or '').strip()
            orgao_sup    = (row.get('Órgão Superior') or '').strip()
            funcao       = (row.get('Função CONCATENADA') or '').strip()
            subfuncao    = (row.get('SubFunção CONCATENADA') or '').strip()
            acao         = (row.get('Ação CONCATENADA') or '').strip()
            programa     = (row.get('Programa CONCATENADA') or '').strip()
            tipo_emenda  = (row.get('Tipo de Emendas B-C-I') or '').strip()
            cod_ug       = (row.get('Código UG') or '').strip()
            cod_uo       = (row.get('Código Unidade Orçamentária') or '').strip()

            if not nome_autor or valor_pago <= 0:
                continue

            # idPortal único por documento
            id_portal = f'PR{ano_emenda}_{cod_doc}' if cod_doc else f'PR{ano_emenda}_{cod_emenda}_{cuid_like()[:8]}'

            # Município: tenta inferir do Favorecido
            mun_nome, mun_ibge = extrair_municipio(favorecido, ibge_map, ibge_sorted)
            # Se UF do favorecido for PR mas não identificou município, usa PR como UF
            cod_uf = uf_fav if uf_fav else 'PR'

            area = area_de_funcao(funcao, acao, programa)

            # Garante parlamentar existente (upsert por nome + cargo + uf)
            cur.execute("""
                INSERT INTO parlamentares (id, nome, cargo, uf, "idPortal", "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, NOW(), NOW())
                ON CONFLICT ("idPortal") DO UPDATE
                  SET nome = EXCLUDED.nome, "updatedAt" = NOW()
                RETURNING id
            """, (
                cuid_like(),
                normalizar_nome(nome_autor.lower()),
                CARGO,
                'PR',
                f'PR_PARL_{sem_acento(nome_autor.upper()).replace(" ", "_")}',
            ))
            parl_id = cur.fetchone()[0]

            batch_data.append((
                cuid_like(),     # id
                id_portal,       # idPortal
                ESFERA,          # esfera
                ano_emenda,      # ano
                cod_emenda,      # numero
                tipo_emenda,     # tipo
                funcao,          # funcao
                subfuncao,       # subfuncao
                area,            # area
                acao,            # objeto
                0.0,             # valorEmpenhado
                valor_pago,      # valorPago
                0.0,             # valorRestoPago
                orgao,           # orgaoExecutor
                cod_uo or cod_ug,# unidadeOrcamentaria
                favorecido,      # beneficiario
                None,            # cnpjBeneficiario
                cod_uf,          # uf
                mun_ibge,        # codigoIbge
                mun_nome,        # municipioNome
                parl_id,         # parlamentarId
            ))

            if len(batch_data) >= BATCH:
                ins, upd = upsert_batch(cur, batch_data)
                total_inseridos  += ins
                total_atualizados += upd
                batch_data = []
                print(f'    {total_inseridos + total_atualizados} registros processados…', end='\r')

        if batch_data:
            ins, upd = upsert_batch(cur, batch_data)
            total_inseridos  += ins
            total_atualizados += upd

        conn.commit()
        print(f'  [{ano}] ✅  inseridos: {total_inseridos}  atualizados: {total_atualizados}')

    cur.close()
    conn.close()
    print(f'\nConcluído. Total: {total_inseridos} inseridos, {total_atualizados} atualizados.')


def upsert_batch(cur, batch: list) -> tuple[int, int]:
    sql = """
        INSERT INTO "emendas_parlamentares" (
            id, "idPortal", esfera, ano, numero, tipo, funcao, subfuncao,
            area, objeto, "valorEmpenhado", "valorPago", "valorRestoPago",
            "orgaoExecutor", "unidadeOrcamentaria", beneficiario, "cnpjBeneficiario",
            uf, "codigoIbge", "municipioNome", "parlamentarId",
            "fetchedAt", "updatedAt"
        ) VALUES (
            %s,%s,%s,%s,%s,%s,%s,%s,
            %s,%s,%s,%s,%s,
            %s,%s,%s,%s,
            %s,%s,%s,%s,
            NOW(), NOW()
        )
        ON CONFLICT ("idPortal") DO UPDATE SET
            "valorPago"          = EXCLUDED."valorPago",
            "valorEmpenhado"     = EXCLUDED."valorEmpenhado",
            area                 = EXCLUDED.area,
            funcao               = EXCLUDED.funcao,
            subfuncao            = EXCLUDED.subfuncao,
            objeto               = EXCLUDED.objeto,
            "orgaoExecutor"      = EXCLUDED."orgaoExecutor",
            beneficiario         = EXCLUDED.beneficiario,
            "municipioNome"      = EXCLUDED."municipioNome",
            "codigoIbge"         = EXCLUDED."codigoIbge",
            "parlamentarId"      = EXCLUDED."parlamentarId",
            "updatedAt"          = NOW()
    """
    psycopg2.extras.execute_batch(cur, sql, batch, page_size=100)
    return len(batch), 0


if __name__ == '__main__':
    main()
