'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, MessageSquare, Clock, Plus, Trash2, ChevronLeft, ScrollText } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';

const VisualizacoesCard = dynamic(
  () => import('./gabi-charts').then(m => m.VisualizacoesCard),
  { ssr: false, loading: () => null },
);

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Visualizacao {
  tipo: 'barras' | 'donut' | 'serie_temporal' | 'cards_kpi' | 'tabela';
  titulo?: string;
  dados: any;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  visualizacoes?: Visualizacao[];
  tools?: string[];
  dadosBrutos?: Record<string, any>;
  userQuestion?: string;
}

interface GabiConversa {
  id: string;
  titulo: string | null;
  mensagens: Array<{ role: 'user' | 'assistant'; content: string }>;
  criadaEm: string;
}

type View = 'chat' | 'history';

// ─── localStorage ────────────────────────────────────────────────────────────

const LS_MSGS = 'gabi_session_msgs';
const LS_ID   = 'gabi_session_id';

function lsGet<T>(key: string): T | null {
  try { return JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { return null; }
}
function lsSet(key: string, val: unknown) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function lsDel(...keys: string[]) {
  try { keys.forEach(k => localStorage.removeItem(k)); } catch {}
}

// ─── Markdown parser ──────────────────────────────────────────────────────────

type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'hr' }
  | { type: 'paragraph'; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'table'; headers: string[]; rows: string[][] };

function parseMarkdown(text: string): Block[] {
  const lines  = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (/^(-{3,}|\*{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' }); i++; continue;
    }

    const hm = trimmed.match(/^(#{1,3})\s+(.+)/);
    if (hm) {
      blocks.push({ type: 'heading', level: Math.min(hm[1].length, 3) as 1 | 2 | 3, text: hm[2] });
      i++; continue;
    }

    if (trimmed.startsWith('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        tableLines.push(lines[i].trim()); i++;
      }
      const data = tableLines.filter(l => !/^\|[\s|:-]+\|$/.test(l));
      if (data.length >= 2) {
        const parseRow = (l: string) => l.slice(1, -1).split('|').map(c => c.trim());
        blocks.push({ type: 'table', headers: parseRow(data[0]), rows: data.slice(1).map(parseRow) });
      }
      continue;
    }

    const bm = trimmed.match(/^[-*•]\s+(.+)/);
    if (bm) { blocks.push({ type: 'bullet', text: bm[1] }); i++; continue; }

    const nm = trimmed.match(/^\d+[.)]\s+(.+)/);
    if (nm) { blocks.push({ type: 'bullet', text: nm[1] }); i++; continue; }

    blocks.push({ type: 'paragraph', text: trimmed }); i++;
  }

  return blocks;
}

// ─── Inline renderer ──────────────────────────────────────────────────────────

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={i} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</strong>;
        if (p.startsWith('*') && p.endsWith('*'))
          return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// ─── Block renderer ───────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <div className="space-y-2 text-sm leading-relaxed">
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'heading': {
            const sizes = ['text-base', 'text-sm', 'text-sm'];
            const colors = ['var(--text-primary)', 'var(--text-primary)', '#4a9ede'];
            return (
              <p key={i} className={`font-bold ${sizes[block.level - 1]} mt-3 first:mt-0`} style={{ color: colors[block.level - 1] }}>
                <Inline text={block.text} />
              </p>
            );
          }
          case 'hr':
            return <hr key={i} className="my-2 border-0 border-t" style={{ borderColor: 'rgba(74,158,222,0.15)' }} />;
          case 'paragraph':
            return (
              <p key={i} style={{ color: 'var(--text-secondary)' }}>
                <Inline text={block.text} />
              </p>
            );
          case 'bullet':
            return (
              <div key={i} className="flex gap-2">
                <span className="flex-shrink-0 mt-0.5 font-bold" style={{ color: '#4a9ede' }}>·</span>
                <span style={{ color: 'var(--text-secondary)' }}><Inline text={block.text} /></span>
              </div>
            );
          case 'table':
            return (
              <div key={i} className="overflow-x-auto rounded-lg my-2" style={{ border: '1px solid rgba(74,158,222,0.2)' }}>
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr style={{ background: 'rgba(74,158,222,0.12)' }}>
                      {block.headers.map((h, hi) => (
                        <th key={hi} className="px-3 py-2 text-left font-semibold whitespace-nowrap"
                          style={{ color: '#4a9ede', borderBottom: '1px solid rgba(74,158,222,0.2)' }}>
                          {h.replace(/\*\*/g, '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={ri} style={{ borderBottom: ri < block.rows.length - 1 ? '1px solid rgba(74,158,222,0.08)' : 'none', background: ri % 2 ? 'rgba(74,158,222,0.03)' : 'transparent' }}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-3 py-1.5" style={{ color: 'var(--text-secondary)' }}>
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Tool chips ────────────────────────────────────────────────────────────────

const TOOL_LABELS: Record<string, string> = {
  buscar_emendas:        'buscar_emendas',
  buscar_votacao:        'buscar_votacao',
  buscar_demandas:       'buscar_demandas',
  dados_municipio:       'dados_municipio',
  comparar_parlamentares:'comparar_parlamentares',
};

function ToolChips({ tools }: { tools?: string[] }) {
  if (!tools || tools.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5 mb-2">
      {tools.map(t => (
        <span key={t}
          className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium"
          style={{ background: 'rgba(74,158,222,0.1)', color: '#4a9ede', border: '1px solid rgba(74,158,222,0.2)' }}>
          <span style={{ fontSize: 8 }}>◆</span>
          {TOOL_LABELS[t] ?? t}
        </span>
      ))}
    </div>
  );
}

// ─── Constantes ───────────────────────────────────────────────────────────────

const WELCOME: Message = {
  role: 'assistant',
  content: 'Olá, Sou a Gabi! Assessora Virtual do seu Gabinete, como posso te ajudar hoje?',
};

function formatHistDate(iso: string): string {
  const d    = new Date(iso);
  const now  = new Date();
  const diff = Math.floor((now.getTime() - d.getTime()) / 86_400_000);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Ontem';
  if (diff < 7)  return `Há ${diff} dias`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' });
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function GabiFAB() {
  const [open, setOpen]         = useState(false);
  const [view, setView]         = useState<View>('chat');
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [historico, setHistorico]   = useState<GabiConversa[]>([]);
  const [histLoading, setHistLoading] = useState(false);
  const [sessaoId, setSessaoId] = useState<string | null>(null);
  const [saving, setSaving]     = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);

  // ── Restaurar sessão ───────────────────────────────────────────────────────

  useEffect(() => {
    const storedMsgs = lsGet<Message[]>(LS_MSGS);
    if (Array.isArray(storedMsgs) && storedMsgs.length > 0) setMessages(storedMsgs);
    const storedId = lsGet<string>(LS_ID);
    if (storedId) setSessaoId(storedId);
  }, []);

  // ── Sincronizar no localStorage ────────────────────────────────────────────

  useEffect(() => { lsSet(LS_MSGS, messages); }, [messages]);

  // ── Scroll e foco ─────────────────────────────────────────────────────────

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (open && view === 'chat') setTimeout(() => inputRef.current?.focus(), 150); }, [open, view]);

  // ── Bloquear scroll do body ────────────────────────────────────────────────

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── Salvar conversa no banco ───────────────────────────────────────────────

  const salvarConversa = useCallback(async (msgs: Message[]): Promise<string | null> => {
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return null;
    try {
      const res = await fetch('/api/agent/conversas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          titulo: userMsgs[0].content.slice(0, 100),
          mensagens: msgs.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (res.ok) return (await res.json()).id as string;
    } catch {}
    return null;
  }, []);

  // ── Nova conversa ─────────────────────────────────────────────────────────

  const novaConversa = useCallback(async () => {
    if (messages.length > 1 && !sessaoId) {
      setSaving(true);
      const id = await salvarConversa(messages);
      if (id) { setSessaoId(id); lsSet(LS_ID, id); }
      setSaving(false);
    }
    setMessages([WELCOME]);
    setSessaoId(null);
    lsDel(LS_MSGS, LS_ID);
    setView('chat');
  }, [messages, sessaoId, salvarConversa]);

  // ── Histórico ─────────────────────────────────────────────────────────────

  const carregarHistorico = useCallback(async () => {
    setView('history');
    setHistLoading(true);
    try {
      const res = await fetch('/api/agent/conversas');
      if (res.ok) setHistorico(await res.json());
    } catch {}
    setHistLoading(false);
  }, []);

  const carregarConversa = useCallback((c: GabiConversa) => {
    const msgs: Message[] = (c.mensagens ?? []).map(m => ({ role: m.role, content: m.content }));
    const final = msgs.length > 0 ? msgs : [WELCOME];
    setMessages(final);
    setSessaoId(c.id);
    lsSet(LS_MSGS, final);
    lsSet(LS_ID, c.id);
    setView('chat');
  }, []);

  const deletarConversa = useCallback(async (id: string) => {
    setHistorico(prev => prev.filter(c => c.id !== id));
    if (sessaoId === id) { setSessaoId(null); lsDel(LS_ID); }
    try { await fetch(`/api/agent/conversas/${id}`, { method: 'DELETE' }); } catch {}
  }, [sessaoId]);

  // ── Enviar mensagem ───────────────────────────────────────────────────────

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    const history = [...messages, { role: 'user' as const, content: text }];
    setMessages(history);
    setInput('');
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map(m => ({ role: m.role, content: m.content })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          res.status === 402 ? 'Créditos insuficientes na conta Anthropic.' :
          res.status === 429 ? 'Limite mensal de tokens atingido para este gabinete.' :
          res.status === 503 ? 'API temporariamente sobrecarregada. Tente novamente.' :
          data.error ?? 'Erro ao contatar a Gabi.'
        );
      } else {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content: data.content,
            visualizacoes: data.visualizacoes,
            tools: data.tools,
            dadosBrutos: data.dadosBrutos,
            userQuestion: text,
          },
        ]);
      }
    } catch {
      setError('Falha de conexão. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  // ── PDF ───────────────────────────────────────────────────────────────────

  const exportarPDF = async () => {
    if (pdfLoading || messages.length <= 1) return;
    setPdfLoading(true);
    try {
      const res = await fetch('/api/agent/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: messages.map(m => ({ role: m.role, content: m.content })), titulo: 'Relatório — Gabi IA' }),
      });
      if (!res.ok) { setError('Erro ao gerar PDF.'); return; }
      const blob = await res.blob();
      const url  = URL.createObjectURL(blob);
      Object.assign(document.createElement('a'), { href: url, download: `gabi-relatorio-${Date.now()}.pdf` }).click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Falha ao gerar PDF.');
    } finally {
      setPdfLoading(false);
    }
  };

  const temConversa = messages.length > 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      {/* ── Modal overlay ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
            onClick={e => { if (e.target === e.currentTarget) setOpen(false); }}
          >
            {/* ── Modal ── */}
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              className="relative flex flex-col w-full"
              style={{
                maxWidth: 960,
                height: 'min(740px, calc(100vh - 32px))',
                background: 'var(--bg-card)',
                border: '1px solid rgba(74,158,222,0.2)',
                borderRadius: 20,
                boxShadow: '0 32px 80px rgba(0,0,0,0.7)',
                overflow: 'hidden',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div
                className="flex items-center gap-3 px-5 py-4 flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #0c1d38 0%, #162d55 100%)', borderBottom: '1px solid rgba(74,158,222,0.18)' }}
              >
                <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 font-bold text-white text-base"
                  style={{ background: 'linear-gradient(135deg, #1d6fd8, #22d3ee)' }}>
                  G
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-white leading-tight">Gabi</p>
                  <p className="text-xs" style={{ color: '#64748b' }}>
                    {view === 'history' ? 'Histórico de conversas' : 'Assistente IA · AdminHub'}
                  </p>
                </div>

                {view === 'chat' && (
                  <div className="flex items-center gap-1">
                    <ActionBtn onClick={novaConversa} title="Nova conversa" disabled={saving}>
                      {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    </ActionBtn>
                    <ActionBtn onClick={carregarHistorico} title="Histórico">
                      <Clock className="w-4 h-4" />
                    </ActionBtn>
                    {temConversa && (
                      <ActionBtn onClick={exportarPDF} title="Exportar conversa completa" disabled={pdfLoading}>
                        {pdfLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ScrollText className="w-4 h-4" />}
                      </ActionBtn>
                    )}
                  </div>
                )}

                {view === 'history' && (
                  <ActionBtn onClick={() => setView('chat')} title="Voltar">
                    <ChevronLeft className="w-4 h-4" />
                  </ActionBtn>
                )}

                <ActionBtn onClick={() => setOpen(false)} title="Fechar">
                  <X className="w-4 h-4" />
                </ActionBtn>
              </div>

              {/* ── VIEW: HISTÓRICO ── */}
              {view === 'history' && (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {histLoading ? (
                    <div className="flex items-center justify-center h-40">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#4a9ede' }} />
                    </div>
                  ) : historico.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: '#64748b' }}>
                      <Clock className="w-10 h-10 opacity-30" />
                      <p className="text-sm font-medium">Nenhuma conversa salva</p>
                      <p className="text-xs opacity-60">Use o botão + para iniciar uma nova conversa</p>
                    </div>
                  ) : (
                    <div className="py-2">
                      {historico.map(c => (
                        <button
                          key={c.id}
                          onClick={() => carregarConversa(c)}
                          className="w-full text-left px-5 py-3.5 flex items-start gap-3 transition-colors hover:bg-white/5 group"
                          style={{ borderBottom: '1px solid rgba(74,158,222,0.06)' }}
                        >
                          <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0 opacity-40" style={{ color: '#4a9ede' }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {c.titulo || 'Conversa sem título'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: '#64748b' }}>
                              {formatHistDate(c.criadaEm)} · {(c.mensagens ?? []).length} mensagens
                            </p>
                          </div>
                          <button
                            onClick={e => { e.stopPropagation(); deletarConversa(c.id); }}
                            className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500/15 flex-shrink-0"
                            style={{ color: '#ef4444' }}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* ── VIEW: CHAT ── */}
              {view === 'chat' && (
                <>
                  {/* Mensagens */}
                  <div
                    className="flex-1 min-h-0 overflow-y-auto py-6 px-5 space-y-6"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'rgba(74,158,222,0.15) transparent' }}
                  >
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar Gabi */}
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center mt-0.5 font-bold text-white text-sm"
                            style={{ background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)' }}>
                            G
                          </div>
                        )}

                        {/* Conteúdo */}
                        <div className={`flex flex-col gap-1 ${msg.role === 'user' ? 'items-end' : 'items-start'} max-w-[82%]`}>
                          <span className="text-[11px] font-medium px-1" style={{ color: '#64748b' }}>
                            {msg.role === 'user' ? 'Você' : 'Gabi'}
                          </span>

                          {/* Tool chips — acima do balão, apenas para mensagens da Gabi */}
                          {msg.role === 'assistant' && <ToolChips tools={msg.tools} />}

                          {/* Balão */}
                          <div
                            className="rounded-2xl px-4 py-3"
                            style={
                              msg.role === 'user'
                                ? { background: 'linear-gradient(135deg, #1d6fd8, #3b82f6)', color: '#fff', borderBottomRightRadius: 6 }
                                : { background: 'var(--tint-06)', border: '1px solid var(--tint-10)', borderBottomLeftRadius: 6 }
                            }
                          >
                            {msg.role === 'user'
                              ? <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                              : <MarkdownContent content={msg.content} />
                            }
                          </div>

                          {/* Visualizações combinadas */}
                          {msg.visualizacoes && msg.visualizacoes.length > 0 && (
                            <VisualizacoesCard
                              visualizacoes={msg.visualizacoes}
                              tools={msg.tools}
                              dadosBrutos={msg.dadosBrutos}
                              titulo={msg.userQuestion}
                              conteudo={msg.content}
                              onNavigate={() => setOpen(false)}
                            />
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Digitando */}
                    {loading && (
                      <div className="flex gap-3">
                        <div className="w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-white text-sm"
                          style={{ background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)' }}>
                          G
                        </div>
                        <div className="rounded-2xl px-4 py-3 mt-5" style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', borderBottomLeftRadius: 6 }}>
                          <div className="flex items-center gap-1.5">
                            {[0, 150, 300].map(delay => (
                              <span key={delay} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#4a9ede', animationDelay: `${delay}ms` }} />
                            ))}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Erro */}
                    {error && (
                      <div className="mx-auto text-sm px-4 py-2.5 rounded-xl text-center max-w-sm" style={{ background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '1px solid rgba(239,68,68,0.15)' }}>
                        {error}
                      </div>
                    )}

                    <div ref={bottomRef} />
                  </div>

                  {/* Input */}
                  <div className="flex-shrink-0 px-5 py-4" style={{ borderTop: '1px solid var(--tint-08)', background: 'var(--bg-card)' }}>
                    <div className="flex items-end gap-3">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Pergunte sobre emendas, votos, demandas, candidatos..."
                        rows={1}
                        disabled={loading}
                        className="flex-1 resize-none rounded-xl px-4 py-3 text-sm outline-none"
                        style={{
                          background: 'var(--tint-06)',
                          border: '1px solid var(--tint-10)',
                          color: 'var(--text-primary)',
                          maxHeight: 120,
                          lineHeight: '1.5',
                        }}
                        onInput={e => {
                          const el = e.currentTarget;
                          el.style.height = 'auto';
                          el.style.height = Math.min(el.scrollHeight, 120) + 'px';
                        }}
                      />
                      <button
                        onClick={send}
                        disabled={!input.trim() || loading}
                        className="flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-150"
                        style={{
                          background: input.trim() && !loading ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'var(--tint-08)',
                          color: input.trim() && !loading ? '#fff' : 'var(--text-tertiary)',
                        }}
                      >
                        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-[10px] mt-2 text-center" style={{ color: 'var(--text-tertiary)' }}>
                      Enter para enviar · Shift+Enter para nova linha
                    </p>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB ── */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-4 sm:right-6 z-40 w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
        style={{
          background: open
            ? 'linear-gradient(135deg, #374151, #4b5563)'
            : 'linear-gradient(135deg, #1d6fd8, #22d3ee)',
          boxShadow: open
            ? '0 4px 20px rgba(0,0,0,0.4)'
            : '0 4px 24px rgba(29,111,216,0.55)',
        }}
        aria-label={open ? 'Fechar Gabi' : 'Abrir Gabi'}
      >
        <AnimatePresence mode="wait">
          {open ? (
            <motion.div key="x" initial={{ rotate: -90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: 90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <X className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <motion.div key="chat" initial={{ rotate: 90, opacity: 0 }} animate={{ rotate: 0, opacity: 1 }} exit={{ rotate: -90, opacity: 0 }} transition={{ duration: 0.15 }}>
              <MessageSquare className="w-6 h-6 text-white" />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>
    </>
  );
}

// ─── Botão de ação do header ─────────────────────────────────────────────────

function ActionBtn({ onClick, title, disabled, children }: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="p-2 rounded-lg transition-colors hover:bg-white/10 disabled:opacity-50"
      style={{ color: '#94a3b8' }}
    >
      {children}
    </button>
  );
}
