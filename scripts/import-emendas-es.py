"""
Importa emendas-estaduais-2024_ES.csv e emendas-estaduais-2025_ES.csv.

Fonte: ALES (Assembleia Legislativa do ES) — dados de emendas parlamentares estaduais.

Mapeamento:
  NomeAutor        → parlamentar.nome  (strip "Dep. ")
  NumeroEmenda     → idPortal + numero (ex: "2024 / E1179")
  AnoEmenda        → ano
  TipoEmenda       → tipo
  ObjetoFinalidade → objeto
  ValorPrevisto    → valorProposto  (todos os registros)
  ValorEmpenho     → valorEmpenhado (apenas 2025, 71%)
  ValorPago        → valorPago      (apenas 2025, 71%)
  Favorecido       → beneficiario   (apenas 2025)
  CpfCnpjNis      → cnpjBeneficiario
  CodigoFuncao     → funcao + area  (apenas 2025)
  OrgaoExecutor    → orgaoExecutor  (código numérico)
  Município        → extraído de ObjetoFinalidade+Favorecido via lookup no banco
"""

import sys, os, re, csv, unicodedata
import psycopg2, psycopg2.extras
from datetime import datetime

if sys.stdout.encoding and sys.stdout.encoding.lower() != 'utf-8':
    sys.stdout.reconfigure(encoding='utf-8')

# ── Configuração ───────────────────────────────────────────────────────────────

FILES = [
    {'path': os.path.join(os.path.dirname(__file__), '..', 'data', 'estados',
                          'emendas-estaduais-2024_ES.csv'), 'ano': 2024},
    {'path': os.path.join(os.path.dirname(__file__), '..', 'data', 'estados',
                          'emendas-estaduais-2025_ES.csv'), 'ano': 2025},
]

DATABASE_URL = (
    'postgresql://postgres.mtjugadcnwjbcpfzavxs:Meug4binete'
    '@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'
)

UF     = 'ES'
ESFERA = 'ESTADUAL'
CARGO  = 'DEPUTADO_ESTADUAL'
BATCH  = 200

# ── Classificação de área ──────────────────────────────────────────────────────

FUNCAO_AREA = {
    '10': 'SAUDE',        '12': 'HABITACAO',      '08': 'ASSISTENCIA_SOCIAL',
    '09': 'ASSISTENCIA_SOCIAL', '11': 'EDUCACAO',  '13': 'CULTURA',
    '26': 'INFRAESTRUTURA', '15': 'INFRAESTRUTURA', '17': 'INFRAESTRUTURA',
    '18': 'MEIO_AMBIENTE', '20': 'AGRICULTURA',    '27': 'ESPORTE',
    '16': 'HABITACAO',    '22': 'SANEAMENTO',      '04': 'INFRAESTRUTURA',
    '14': 'SANEAMENTO',   '28': 'OUTROS',          '06': 'SEGURANCA',
    '05': 'SEGURANCA',    '23': 'OUTROS',           '24': 'OUTROS',
}

def classificar_area(codigo_funcao) -> str:
    if not codigo_funcao:
        return 'OUTROS'
    m = re.match(r'^(\d+)', str(codigo_funcao).strip())
    if m:
        return FUNCAO_AREA.get(m.group(1), 'OUTROS')
    return 'OUTROS'

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
    """Converte valor com vírgula decimal (padrão BR) para float."""
    if not v or str(v).strip() in ('', 'None'):
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

def limpar_nome_parlamentar(nome: str) -> str:
    """Remove prefixos 'Dep.' / 'Dep' e normaliza."""
    nome = re.sub(r'^Dep\.?\s+', '', nome.strip(), flags=re.IGNORECASE)
    return normalizar_nome(nome)

# ── Lookup de município por nome de entidade ──────────────────────────────────

def build_municipio_lookup(cur) -> tuple[dict, list]:
    cur.execute("""
        SELECT DISTINCT ON (UPPER(TRIM(nome)))
               UPPER(TRIM(nome)) AS nome_upper, "codigoIbge"
          FROM municipio_stats
         WHERE uf = 'ES'
         ORDER BY UPPER(TRIM(nome))
    """)
    ibge_map = {sem_acento(r['nome_upper']): r['codigoIbge'] for r in cur.fetchall()}
    # ordena do nome mais longo ao mais curto para evitar match parcial
    nomes_ordenados = sorted(ibge_map.keys(), key=len, reverse=True)
    return ibge_map, nomes_ordenados

_muni_cache: tuple[dict, list] | None = None

def achar_municipio(texto: str, ibge_map: dict, nomes_ordenados: list):
    t = sem_acento(texto.upper())
    for nome in nomes_ordenados:
        if re.search(r'\b' + re.escape(nome) + r'\b', t):
            return normalizar_nome(nome), ibge_map[nome]
    return None, None

# ── Main ───────────────────────────────────────────────────────────────────────

def main():
    print(f'[{datetime.now():%H:%M:%S}] Conectando ao banco…')
    conn = psycopg2.connect(DATABASE_URL)
    cur  = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)

    ibge_map, nomes_muni = build_municipio_lookup(cur)
    print(f'[{datetime.now():%H:%M:%S}] {len(ibge_map)} municípios ES no banco.')

    cur.execute("""
        SELECT id, UPPER(TRIM(nome)) AS nome_upper
          FROM parlamentares WHERE cargo = %s AND uf = %s
    """, (CARGO, UF))
    parl_map: dict[str, str] = {r['nome_upper']: r['id'] for r in cur.fetchall()}
    print(f'[{datetime.now():%H:%M:%S}] {len(parl_map)} deputados ES já no banco.')

    now = datetime.utcnow()
    total_importadas = 0

    for file_cfg in FILES:
        ano  = file_cfg['ano']
        path = file_cfg['path']
        print(f'\n[{datetime.now():%H:%M:%S}] ── Processando ES {ano} ──')
        print(f'[{datetime.now():%H:%M:%S}] Lendo {path}…')

        with open(path, encoding='utf-8-sig', errors='replace') as f:
            reader = csv.reader(f, delimiter=';')
            headers = next(reader)
            rows    = list(reader)
        idx = {h: i for i, h in enumerate(headers)}
        print(f'[{datetime.now():%H:%M:%S}] {len(rows)} linhas carregadas.')

        emendas_upsert = []
        parls_novos: dict[str, dict] = {}
        sem_muni = 0

        for row in rows:
            numero_emenda = row[idx['NumeroEmenda']].strip()
            if not numero_emenda:
                continue

            nome_autor_raw = row[idx['NomeAutor']].strip()
            if not nome_autor_raw:
                continue

            parl_nome  = limpar_nome_parlamentar(nome_autor_raw)
            tipo       = row[idx['TipoEmenda']].strip() or None
            objeto     = row[idx['ObjetoFinalidade']].strip() or None
            orgao_cod  = row[idx['OrgaoExecutor']].strip() or None
            val_prev   = to_float_br(row[idx['ValorPrevisto']])

            # Campos presentes apenas em 2025
            val_emp  = to_float_br(row[idx.get('ValorEmpenho', -1)] if idx.get('ValorEmpenho') is not None else '0') if 'ValorEmpenho' in idx else 0.0
            val_pago = to_float_br(row[idx['ValorPago']]    if 'ValorPago'    in idx else '0')
            favorecido_raw = row[idx['Favorecido']].strip()   if 'Favorecido'   in idx else ''
            cnpj_raw       = row[idx['CpfCnpjNis']].strip()   if 'CpfCnpjNis'   in idx else ''
            cod_funcao     = row[idx['CodigoFuncao']].strip()  if 'CodigoFuncao'  in idx else ''

            # CNPJ: só aceita 14 dígitos
            cnpj = cnpj_raw if re.match(r'^\d{14}$', cnpj_raw) else None
            beneficiario = favorecido_raw or None
            funcao = cod_funcao or None
            area   = classificar_area(cod_funcao)

            # valorProposto = previsto; empenhado/pago só se disponíveis
            val_prop = val_prev if val_prev > 0 else max(val_emp, val_pago)
            if val_emp == 0 and val_pago == 0:
                val_emp = val_prev   # 2024: tudo como proposto

            # Município via lookup nas entidades beneficiadas
            texto_busca = (objeto or '') + ' ' + (favorecido_raw or '')
            muni_nome, codigo_ibge = achar_municipio(texto_busca, ibge_map, nomes_muni)
            if not muni_nome:
                sem_muni += 1

            # Parlamentar
            parl_upper = parl_nome.upper()
            if parl_upper not in parl_map and parl_upper not in parls_novos:
                parls_novos[parl_upper] = {
                    'id':      cuid_like(),
                    'nome':    parl_nome,
                    'partido': None,
                    'uf':      UF,
                    'cargo':   CARGO,
                }

            emendas_upsert.append({
                'idPortal':    numero_emenda,
                'numero':      numero_emenda,
                'ano':         ano,
                'tipo':        tipo,
                'funcao':      funcao,
                'area':        area,
                'objeto':      objeto,
                'orgao':       orgao_cod,
                'beneficiario': beneficiario,
                'cnpj':        cnpj,
                'codigoIbge':  codigo_ibge,
                'municipioNome': muni_nome,
                'valEmp':      val_emp,
                'valPago':     val_pago,
                'valProp':     val_prop,
                'parlUpper':   parl_upper,
            })

        print(f'[{datetime.now():%H:%M:%S}] {len(emendas_upsert)} emendas para upsert | sem município: {sem_muni} ({sem_muni*100//len(emendas_upsert) if emendas_upsert else 0}%)')
        print(f'[{datetime.now():%H:%M:%S}] {len(parls_novos)} novos parlamentares.')

        # Inserir novos parlamentares
        for parl_upper, p in parls_novos.items():
            cur.execute("""
                INSERT INTO parlamentares (id, nome, partido, uf, cargo, ativo, "createdAt", "updatedAt")
                VALUES (%s, %s, %s, %s, %s, true, %s, %s)
                ON CONFLICT DO NOTHING
            """, (p['id'], p['nome'], p['partido'], p['uf'], p['cargo'], now, now))
            parl_map[parl_upper] = p['id']
        conn.commit()
        print(f'[{datetime.now():%H:%M:%S}] Parlamentares inseridos.')

        # Upsert emendas em batches
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
                "cnpjBeneficiario" = EXCLUDED."cnpjBeneficiario",
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

        total     = len(emendas_upsert)
        inseridas = 0
        for i in range(0, total, BATCH):
            batch = emendas_upsert[i:i + BATCH]
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
                except psycopg2.OperationalError as ex:
                    tentativas += 1
                    if tentativas > 3:
                        raise
                    print(f'\n[{datetime.now():%H:%M:%S}] Conexão perdida, reconectando ({tentativas}/3)…')
                    try: conn.close()
                    except Exception: pass
                    conn, cur = reconectar()

            pct = inseridas * 100 // total
            print(f'[{datetime.now():%H:%M:%S}] {inseridas}/{total} ({pct}%)…', end='\r', flush=True)

        print(f'\n[{datetime.now():%H:%M:%S}] ✅ {inseridas} emendas ES {ano} importadas.')
        total_importadas += inseridas

    print(f'\n[{datetime.now():%H:%M:%S}] ✅ Total: {total_importadas} emendas ES importadas com sucesso.')
    cur.close()
    conn.close()


if __name__ == '__main__':
    main()
