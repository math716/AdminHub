'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import * as XLSX from 'xlsx';
import {
  Upload, FileText, CheckCircle, AlertCircle, Loader2,
  X, ChevronDown, Info, RefreshCw, Table2,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ESTADOS_BRASIL } from '@/lib/types';
import type { MappedRow } from '@/app/api/importacao/process/route';

// ──────────────────────────────────────────────────────────────
// Colunas do Portal Federal (para detecção automática)
// ──────────────────────────────────────────────────────────────
const PORTAL_FEDERAL_COLS = [
  'Código da Emenda',
  'Ano da Emenda',
  'Nome do Autor da Emenda',
  'Valor Empenhado',
  'Fase da despesa',
];

// ──────────────────────────────────────────────────────────────
// Campos padrão para mapeamento
// ──────────────────────────────────────────────────────────────
interface FieldDef {
  key: keyof MappedRow;
  label: string;
  required: boolean;
  hint?: string;
}

const STANDARD_FIELDS: FieldDef[] = [
  { key: 'codigoEmenda',    label: 'Código da Emenda (ID único)',  required: true  },
  { key: 'nomeAutor',       label: 'Nome do Autor / Parlamentar',  required: true  },
  { key: 'valorEmpenhado',  label: 'Valor Empenhado',              required: true  },
  { key: 'anoEmenda',       label: 'Ano',                          required: false, hint: 'Pode ser definido abaixo' },
  { key: 'uf',              label: 'UF do Município',              required: false, hint: 'Pode ser definido abaixo' },
  { key: 'municipio',       label: 'Nome do Município',            required: false },
  { key: 'ibge',            label: 'Código IBGE',                  required: false },
  { key: 'valorPago',       label: 'Valor Pago',                   required: false },
  { key: 'cpfAutor',        label: 'CPF do Autor',                 required: false },
  { key: 'cargo',           label: 'Cargo (DEPUTADO_FEDERAL...)',  required: false },
  { key: 'partido',         label: 'Partido',                      required: false },
  { key: 'numero',          label: 'Número da Emenda',             required: false },
  { key: 'tipo',            label: 'Tipo de Emenda',               required: false },
  { key: 'funcao',          label: 'Função / Área temática',       required: false },
  { key: 'objeto',          label: 'Objeto / Descrição',           required: false },
  { key: 'beneficiario',    label: 'Nome do Beneficiário',         required: false },
  { key: 'cnpjBeneficiario',label: 'CNPJ do Beneficiário',         required: false },
];

// Mapeamento automático: nome de coluna no arquivo → campo padrão
const AUTO_MAP: Record<string, keyof MappedRow> = {
  // Portal Federal (colunas exatas)
  'código da emenda':                                    'codigoEmenda',
  'ano da emenda':                                       'anoEmenda',
  'nome do autor da emenda':                             'nomeAutor',
  'número da emenda':                                    'numero',
  'tipo de emenda':                                      'tipo',
  'valor empenhado':                                     'valorEmpenhado',
  'valor pago':                                          'valorPago',
  'subfunção':                                           'funcao',
  'uf de aplicação do recurso':                          'uf',
  'município de aplicação do recurso':                   'municipio',
  'código ibge do município de aplicação do recurso':    'ibge',
  'favorecido':                                          'beneficiario',
  'código favorecido':                                   'cnpjBeneficiario',
  // Genéricos
  'codigo_emenda':     'codigoEmenda',
  'codigo emenda':     'codigoEmenda',
  'id':                'codigoEmenda',
  'id_emenda':         'codigoEmenda',
  'ano':               'anoEmenda',
  'exercicio':         'anoEmenda',
  'exercício':         'anoEmenda',
  'autor':             'nomeAutor',
  'parlamentar':       'nomeAutor',
  'deputado':          'nomeAutor',
  'nome_autor':        'nomeAutor',
  'nome_parlamentar':  'nomeAutor',
  'valor_empenhado':   'valorEmpenhado',
  'empenhado':         'valorEmpenhado',
  'valor_pago':        'valorPago',
  'pago':              'valorPago',
  'liquidado':         'valorPago',
  'municipio':         'municipio',
  'município':         'municipio',
  'cidade':            'municipio',
  'localidade':        'municipio',
  'localidade_beneficiada': 'municipio',
  'ibge':              'ibge',
  'cod_ibge':          'ibge',
  'codigo_ibge':       'ibge',
  'uf':                'uf',
  'estado':            'uf',
  'cpf':               'cpfAutor',
  'cpf_autor':         'cpfAutor',
  'cargo':             'cargo',
  'partido':           'partido',
  'sigla_partido':     'partido',
  'numero':            'numero',
  'num_emenda':        'numero',
  'tipo':              'tipo',
  'modalidade':        'tipo',
  'funcao':            'funcao',
  'função':            'funcao',
  'area':              'funcao',
  'área':              'funcao',
  'objeto':            'objeto',
  'descrição':         'objeto',
  'descricao':         'objeto',
  'objetivo_titulo':   'objeto',
  'beneficiario':      'beneficiario',
  'beneficiário':      'beneficiario',
  'cnpj':              'cnpjBeneficiario',
};

function autoDetectMapping(headers: string[]): Record<keyof MappedRow, string> {
  const mapping: Partial<Record<keyof MappedRow, string>> = {};
  for (const h of headers) {
    const key = AUTO_MAP[h.toLowerCase().trim()];
    if (key && !mapping[key]) mapping[key] = h;
  }
  return mapping as Record<keyof MappedRow, string>;
}

function isPortalFederal(headers: string[]): boolean {
  const lowers = headers.map((h) => h.toLowerCase().trim());
  return PORTAL_FEDERAL_COLS.every((col) => lowers.includes(col.toLowerCase()));
}

function parseFile(file: File): Promise<{ headers: string[]; rows: Record<string, string>[] }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array', raw: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const raw = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' }) as string[][];
        if (raw.length < 2) { reject(new Error('Arquivo vazio ou sem dados')); return; }
        const headers = raw[0].map((h) => String(h ?? '').trim()).filter(Boolean);
        const rows: Record<string, string>[] = [];
        for (let i = 1; i < raw.length; i++) {
          const row: Record<string, string> = {};
          headers.forEach((h, j) => { row[h] = String(raw[i][j] ?? '').trim(); });
          if (Object.values(row).some((v) => v !== '')) rows.push(row);
        }
        resolve({ headers, rows });
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
    reader.readAsArrayBuffer(file);
  });
}

function toFloat(v: string | undefined): number {
  if (!v) return 0;
  const s = v.trim().replace(/\s/g, '');
  if (/^\d{1,3}(\.\d{3})*(,\d+)?$/.test(s)) return parseFloat(s.replace(/\./g, '').replace(',', '.')) || 0;
  return parseFloat(s.replace(',', '.')) || 0;
}

function applyMapping(
  rawRows: Record<string, string>[],
  mapping: Partial<Record<keyof MappedRow, string>>,
  ufGlobal: string,
  anoGlobal: number,
): MappedRow[] {
  return rawRows
    .map((r) => {
      const get = (field: keyof MappedRow): string => {
        const col = mapping[field];
        return col ? (r[col] ?? '') : '';
      };
      const codigoEmenda = get('codigoEmenda');
      if (!codigoEmenda) return null;
      const anoRaw = get('anoEmenda');
      const ano = anoRaw ? parseInt(anoRaw, 10) || anoGlobal : anoGlobal;
      return {
        codigoEmenda,
        anoEmenda:       ano,
        nomeAutor:       get('nomeAutor') || '—',
        cpfAutor:        get('cpfAutor') || null,
        cargo:           get('cargo') || null,
        partido:         get('partido') || null,
        ufAutor:         null,
        uf:              get('uf') || ufGlobal || null,
        municipio:       get('municipio') || null,
        ibge:            get('ibge') || null,
        valorEmpenhado:  toFloat(get('valorEmpenhado')),
        valorPago:       toFloat(get('valorPago')) || null,
        valorRestoPago:  null,
        tipo:            get('tipo') || null,
        funcao:          get('funcao') || null,
        objeto:          get('objeto') || null,
        numero:          get('numero') || null,
        beneficiario:    get('beneficiario') || null,
        cnpjBeneficiario: get('cnpjBeneficiario') || null,
      } as MappedRow;
    })
    .filter(Boolean) as MappedRow[];
}

// ──────────────────────────────────────────────────────────────
// Página
// ──────────────────────────────────────────────────────────────
type Stage = 'idle' | 'parsing' | 'mapping' | 'ready' | 'importing' | 'done';

export default function ImportacaoPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  useEffect(() => {
    if (status === 'authenticated' && userRole !== 'SUPER_ADMIN') router.replace('/dashboard');
  }, [status, userRole, router]);

  const dropRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);
  const [stage, setStage] = useState<Stage>('idle');
  const [fileName, setFileName] = useState('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [isPortalFed, setIsPortalFed] = useState(false);
  const [mapping, setMapping] = useState<Partial<Record<keyof MappedRow, string>>>({});
  const [uf, setUf] = useState('');
  const [ano, setAno] = useState(new Date().getFullYear());
  const [esfera, setEsfera] = useState<'FEDERAL' | 'ESTADUAL'>('ESTADUAL');
  const [parseError, setParseError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<{ created: number; updated: number; errors: number; erroDetalhes: string[]; total: number } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const handleFile = useCallback(async (file: File) => {
    setParseError(null);
    setStage('parsing');
    setFileName(file.name);
    try {
      const { headers: h, rows: r } = await parseFile(file);
      setHeaders(h);
      setRawRows(r);
      const portalFed = isPortalFederal(h);
      setIsPortalFed(portalFed);
      const detected = autoDetectMapping(h);
      setMapping(detected);
      setStage('mapping');
    } catch (e: any) {
      setParseError(e?.message ?? 'Erro ao processar o arquivo');
      setStage('idle');
    }
  }, []);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const onFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = '';
  }, [handleFile]);

  const requiredMapped = STANDARD_FIELDS
    .filter((f) => f.required)
    .every((f) => mapping[f.key]);

  const handleImport = async () => {
    if (!requiredMapped || !uf || !ano) return;
    setStage('importing');
    setImportError(null);
    setProgress(0);

    const rows = applyMapping(rawRows, mapping, uf, ano);
    const BATCH = 500;
    let totalCreated = 0, totalUpdated = 0, totalErrors = 0;
    const allErros: string[] = [];

    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      try {
        const res = await fetch('/api/importacao/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk, uf, ano, esfera }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        totalCreated  += data.created  ?? 0;
        totalUpdated  += data.updated  ?? 0;
        totalErrors   += data.errors   ?? 0;
        if (Array.isArray(data.erroDetalhes)) allErros.push(...data.erroDetalhes);
      } catch (e: any) {
        setImportError(e?.message ?? 'Erro na requisição');
        setStage('mapping');
        return;
      }
      setProgress(Math.round(((i + chunk.length) / rows.length) * 100));
    }

    setImportResult({ created: totalCreated, updated: totalUpdated, errors: totalErrors, erroDetalhes: allErros, total: rows.length });
    setStage('done');
  };

  const reset = () => {
    setStage('idle');
    setFileName('');
    setHeaders([]);
    setRawRows([]);
    setMapping({});
    setImportResult(null);
    setImportError(null);
    setProgress(0);
    setParseError(null);
  };

  if (status === 'loading') return null;
  if (userRole !== 'SUPER_ADMIN') return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader
        icon={Upload}
        title="Importação de Dados"
        subtitle="Importe emendas de arquivos CSV ou XLSX de portais estaduais ou federais"
      />

      {/* ── IDLE / DROP ZONE ── */}
      {(stage === 'idle' || stage === 'parsing') && (
        <div
          ref={dropRef}
          onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className="rounded-2xl p-12 flex flex-col items-center justify-center cursor-pointer transition-all"
          style={{
            border: `2px dashed ${dragging ? 'rgba(37,99,235,0.6)' : 'var(--tint-10)'}`,
            background: dragging ? 'rgba(37,99,235,0.05)' : 'var(--bg-card-subtle)',
          }}
          onClick={() => document.getElementById('file-input')?.click()}
        >
          <input id="file-input" type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={onFileInput} />
          {stage === 'parsing' ? (
            <Loader2 className="w-10 h-10 animate-spin text-[color:var(--brand-cobalt)] mb-3" />
          ) : (
            <Upload className="w-10 h-10 mb-3" style={{ color: dragging ? 'var(--brand-cobalt-text)' : 'var(--tint-25)' }} />
          )}
          <p className="text-[color:var(--text-primary)] font-semibold text-base">
            {stage === 'parsing' ? 'Lendo arquivo…' : 'Arraste o arquivo aqui ou clique para selecionar'}
          </p>
          <p className="text-slate-600 dark:text-slate-500 text-sm mt-1">CSV ou XLSX — máx. ~50 MB</p>
          {parseError && (
            <p className="mt-3 text-sm text-red-400 flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4" /> {parseError}
            </p>
          )}
        </div>
      )}

      {/* ── MAPPING / READY ── */}
      {(stage === 'mapping' || stage === 'importing') && (
        <div className="space-y-5">
          {/* Cabeçalho do arquivo */}
          <div className="flex items-center justify-between rounded-xl px-4 py-3"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-08)' }}>
            <div className="flex items-center gap-3">
              <FileText className="w-5 h-5 text-[color:var(--brand-cobalt-text)]" />
              <div>
                <p className="text-[color:var(--text-primary)] text-sm font-semibold">{fileName}</p>
                <p className="text-slate-600 dark:text-slate-400 text-xs">{rawRows.length.toLocaleString('pt-BR')} linhas · {headers.length} colunas</p>
              </div>
              {isPortalFed && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-semibold"
                  style={{ background: 'rgba(16,185,129,0.12)', color: '#6ee7b7', border: '1px solid rgba(16,185,129,0.25)' }}>
                  Portal Federal detectado
                </span>
              )}
            </div>
            <button onClick={reset} className="text-slate-600 dark:text-slate-400 hover:text-white p-1">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Configurações globais */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Estado (UF)</label>
              <select
                value={uf}
                onChange={(e) => setUf(e.target.value)}
                className="w-full bg-[var(--tint-06)] border border-[var(--tint-10)] rounded-xl px-3 py-2.5 text-sm text-[color:var(--text-primary)] outline-none focus:border-amber-500/50"
              >
                <option value="">Selecione…</option>
                {ESTADOS_BRASIL.map((e) => (
                  <option key={e.sigla} value={e.sigla}>{e.sigla} — {e.nome}</option>
                ))}
              </select>
              <p className="text-[10px] text-slate-600 mt-1">Usado quando a coluna UF não está mapeada</p>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Ano</label>
              <input
                type="number"
                value={ano}
                onChange={(e) => setAno(parseInt(e.target.value, 10))}
                min={2000} max={2099}
                className="w-full bg-[var(--tint-06)] border border-[var(--tint-10)] rounded-xl px-3 py-2.5 text-sm text-[color:var(--text-primary)] outline-none focus:border-amber-500/50"
              />
              <p className="text-[10px] text-slate-600 mt-1">Usado quando a coluna Ano não está mapeada</p>
            </div>
            <div>
              <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">Esfera</label>
              <div className="flex rounded-xl overflow-hidden" style={{ border: '1px solid var(--tint-10)' }}>
                {(['FEDERAL', 'ESTADUAL'] as const).map((e) => (
                  <button
                    key={e}
                    onClick={() => setEsfera(e)}
                    className="flex-1 py-2.5 text-sm font-medium transition-colors"
                    style={esfera === e
                      ? { background: 'rgba(37,99,235,0.15)', color: 'var(--brand-cobalt-text)' }
                      : { color: 'rgb(148,163,184)' }}
                  >
                    {e === 'FEDERAL' ? 'Federal' : 'Estadual'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Mapeamento de colunas */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--tint-08)' }}>
            <div className="px-4 py-3 flex items-center gap-2" style={{ background: 'var(--bg-card)' }}>
              <Table2 className="w-4 h-4 text-[color:var(--brand-cobalt-text)]" />
              <p className="text-sm font-semibold text-[color:var(--text-primary)]">Mapeamento de colunas</p>
              {isPortalFed && (
                <span className="ml-auto text-[11px] text-slate-600 dark:text-slate-500 flex items-center gap-1">
                  <Info className="w-3 h-3" />
                  Detectado automaticamente — confirme e importe
                </span>
              )}
            </div>
            <div className="divide-y divide-white/5">
              {STANDARD_FIELDS.map((field) => (
                <div key={field.key} className="flex items-center gap-3 px-4 py-2.5"
                  style={{ background: 'var(--bg-card-subtle)' }}>
                  <div className="w-56 flex-shrink-0">
                    <span className="text-xs text-[color:var(--text-primary)]">{field.label}</span>
                    {field.required && <span className="text-red-400 ml-0.5">*</span>}
                    {field.hint && <p className="text-[10px] text-slate-600">{field.hint}</p>}
                  </div>
                  <ChevronDown className="w-3 h-3 text-slate-600 flex-shrink-0" />
                  <select
                    value={mapping[field.key] ?? ''}
                    onChange={(e) => setMapping((prev) => ({ ...prev, [field.key]: e.target.value || undefined }))}
                    className="flex-1 bg-[var(--tint-06)] border border-[var(--tint-10)] rounded-lg px-2.5 py-1.5 text-xs text-[color:var(--text-primary)] outline-none focus:border-amber-500/50"
                  >
                    <option value="">(não mapear)</option>
                    {headers.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                  {mapping[field.key] && (
                    <span className="text-[10px] text-[color:var(--success)] flex-shrink-0 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" /> Mapeado
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Preview da tabela */}
          <PreviewTable headers={headers} rows={rawRows.slice(0, 5)} />

          {/* Validação + botão de importar */}
          {importError && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-red-300"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
              <AlertCircle className="w-4 h-4 flex-shrink-0" /> {importError}
            </div>
          )}

          {!requiredMapped && (
            <div className="rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-[color:var(--brand-cobalt-text)]"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
              <Info className="w-4 h-4 flex-shrink-0" />
              Mapeie os campos obrigatórios (<span className="text-red-400">*</span>) antes de importar.
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={handleImport}
              disabled={!requiredMapped || !uf || !ano || stage === 'importing'}
              className="flex items-center gap-2 px-6 py-3 rounded-xl font-semibold text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(37,99,235,0.2)', color: 'var(--brand-cobalt-text)', border: '1px solid rgba(37,99,235,0.4)' }}
            >
              {stage === 'importing' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              {stage === 'importing' ? `Importando… ${progress}%` : `Importar ${rawRows.length.toLocaleString('pt-BR')} registros`}
            </button>
            {stage === 'importing' && (
              <div className="flex-1 h-2 rounded-full overflow-hidden bg-[var(--tint-10)]">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{ width: `${progress}%`, background: '#2563EB' }}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── DONE ── */}
      {stage === 'done' && importResult && (
        <div className="space-y-4">
          <div className="rounded-2xl p-6"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--tint-08)' }}>
            <div className="flex items-center gap-3 mb-4">
              <CheckCircle className="w-7 h-7 text-[color:var(--success)]" />
              <div>
                <p className="text-[color:var(--text-primary)] font-bold text-lg">Importação concluída!</p>
                <p className="text-slate-600 dark:text-slate-400 text-sm">{fileName} · {importResult.total.toLocaleString('pt-BR')} linhas processadas</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <StatBox label="Criados" value={importResult.created} color="emerald" />
              <StatBox label="Atualizados" value={importResult.updated} color="blue" />
              <StatBox label="Erros" value={importResult.errors} color="red" />
            </div>
            {importResult.erroDetalhes.length > 0 && (
              <div className="mt-4 rounded-xl p-3 text-xs text-red-300 font-mono space-y-1"
                style={{ background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.15)' }}>
                {importResult.erroDetalhes.map((e, i) => <p key={i}>{e}</p>)}
              </div>
            )}
          </div>
          <button onClick={reset} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm text-slate-700 dark:text-slate-300 hover:text-white transition-colors"
            style={{ border: '1px solid var(--tint-10)' }}>
            <RefreshCw className="w-4 h-4" /> Importar outro arquivo
          </button>
        </div>
      )}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────
// Sub-componentes
// ──────────────────────────────────────────────────────────────
function PreviewTable({ headers, rows }: { headers: string[]; rows: Record<string, string>[] }) {
  if (rows.length === 0) return null;
  const visibleCols = headers.slice(0, 8);
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--tint-06)' }}>
      <p className="px-4 py-2 text-[10px] uppercase tracking-widest text-slate-600 dark:text-slate-500 font-semibold"
        style={{ background: 'var(--bg-card)' }}>
        Prévia — primeiras 5 linhas {headers.length > 8 && `(${headers.length - 8} colunas ocultas)`}
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr style={{ background: 'var(--bg-card)' }}>
              {visibleCols.map((h) => (
                <th key={h} className="px-3 py-2 text-left text-slate-600 dark:text-slate-400 font-semibold whitespace-nowrap border-b border-[var(--tint-06)]">
                  {h.length > 20 ? h.slice(0, 18) + '…' : h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? 'var(--tint-08)' : 'rgba(7,29,54,0.1)' }}>
                {visibleCols.map((h) => (
                  <td key={h} className="px-3 py-1.5 text-slate-700 dark:text-slate-300 whitespace-nowrap max-w-[140px] truncate">
                    {row[h] || '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function StatBox({ label, value, color }: { label: string; value: number; color: 'emerald' | 'blue' | 'red' }) {
  const c = { emerald: { bg: 'rgba(16,185,129,0.08)', border: 'rgba(16,185,129,0.2)', text: '#6ee7b7' }, blue: { bg: 'rgba(59,130,246,0.08)', border: 'rgba(59,130,246,0.2)', text: '#93c5fd' }, red: { bg: 'rgba(239,68,68,0.08)', border: 'rgba(239,68,68,0.2)', text: '#fca5a5' } }[color];
  return (
    <div className="rounded-xl p-4 text-center" style={{ background: c.bg, border: `1px solid ${c.border}` }}>
      <p className="text-2xl font-bold" style={{ color: c.text }}>{value.toLocaleString('pt-BR')}</p>
      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">{label}</p>
    </div>
  );
}
