'use client';

import { useState, useRef, useEffect } from 'react';
import { X, Send, Bot, Loader2, MessageSquare } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';

// Recharts carregado só no cliente
const BarChart      = dynamic(() => import('recharts').then(m => m.BarChart),      { ssr: false });
const Bar           = dynamic(() => import('recharts').then(m => m.Bar),           { ssr: false });
const PieChart      = dynamic(() => import('recharts').then(m => m.PieChart),      { ssr: false });
const Pie           = dynamic(() => import('recharts').then(m => m.Pie),           { ssr: false });
const Cell          = dynamic(() => import('recharts').then(m => m.Cell),          { ssr: false });
const XAxis         = dynamic(() => import('recharts').then(m => m.XAxis),         { ssr: false });
const YAxis         = dynamic(() => import('recharts').then(m => m.YAxis),         { ssr: false });
const Tooltip       = dynamic(() => import('recharts').then(m => m.Tooltip),       { ssr: false });
const ResponsiveContainer = dynamic(() => import('recharts').then(m => m.ResponsiveContainer), { ssr: false });
const LineChart     = dynamic(() => import('recharts').then(m => m.LineChart),     { ssr: false });
const Line          = dynamic(() => import('recharts').then(m => m.Line),          { ssr: false });

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------
interface Message {
  role: 'user' | 'assistant';
  content: string;
  visualizacao?: Visualizacao;
}

interface Visualizacao {
  tipo: 'barras' | 'donut' | 'serie_temporal' | 'cards_kpi' | 'tabela';
  titulo?: string;
  dados: any;
}

// ---------------------------------------------------------------------------
// Renderer de visualizações compactas
// ---------------------------------------------------------------------------
const COLORS = ['#4a9ede', '#22d3ee', '#a78bfa', '#34d399', '#f87171', '#fbbf24', '#fb923c', '#e879f9'];

function VisualizacaoCard({ vis }: { vis: Visualizacao }) {
  const { tipo, titulo, dados } = vis;

  return (
    <div
      className="mt-2 rounded-xl overflow-hidden"
      style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)' }}
    >
      {titulo && (
        <div className="px-3 pt-2 pb-1">
          <p className="text-xs font-semibold" style={{ color: '#4a9ede' }}>{titulo}</p>
        </div>
      )}

      {tipo === 'barras' && dados?.itens && (
        <div className="px-2 pb-2" style={{ height: 160 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={dados.itens} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94a3b8' }} interval={0} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#0d1b2a', border: '1px solid #1b4965', borderRadius: 8, fontSize: 11 }}
                cursor={{ fill: 'rgba(74,158,222,0.1)' }}
              />
              <Bar dataKey="valor" radius={[3, 3, 0, 0]}>
                {dados.itens.map((_: any, i: number) => (
                  <Cell key={i} fill={dados.itens[i]?.cor || COLORS[i % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {tipo === 'donut' && dados?.itens && (
        <div className="px-2 pb-2 flex items-center gap-2" style={{ height: 150 }}>
          <ResponsiveContainer width="55%" height="100%">
            <PieChart>
              <Pie
                data={dados.itens}
                dataKey="valor"
                nameKey="label"
                cx="50%" cy="50%"
                innerRadius="55%" outerRadius="80%"
              >
                {dados.itens.map((_: any, i: number) => (
                  <Cell key={i} fill={dados.itens[i]?.cor || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{ background: '#0d1b2a', border: '1px solid #1b4965', borderRadius: 8, fontSize: 11 }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-1 overflow-hidden">
            {dados.itens.slice(0, 6).map((item: any, i: number) => (
              <div key={i} className="flex items-center gap-1.5 text-[10px]" style={{ color: '#94a3b8' }}>
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: item.cor || COLORS[i % COLORS.length] }} />
                <span className="truncate">{item.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tipo === 'serie_temporal' && dados?.pontos && (
        <div className="px-2 pb-2" style={{ height: 150 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={dados.pontos} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="data" tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <YAxis tick={{ fontSize: 9, fill: '#94a3b8' }} />
              <Tooltip
                contentStyle={{ background: '#0d1b2a', border: '1px solid #1b4965', borderRadius: 8, fontSize: 11 }}
              />
              <Line type="monotone" dataKey="valor" stroke="#4a9ede" strokeWidth={2} dot={{ r: 3, fill: '#4a9ede' }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {tipo === 'cards_kpi' && dados?.cards && (
        <div className="px-3 pb-3 grid grid-cols-2 gap-2">
          {dados.cards.slice(0, 4).map((card: any, i: number) => (
            <div key={i} className="rounded-lg p-2" style={{ background: 'rgba(74,158,222,0.08)', border: '1px solid rgba(74,158,222,0.15)' }}>
              <p className="text-[9px] uppercase tracking-wide" style={{ color: '#94a3b8' }}>{card.label}</p>
              <p className="text-sm font-bold mt-0.5" style={{ color: '#e2e8f0' }}>
                {card.valor}{card.unidade ? <span className="text-[10px] font-normal ml-0.5" style={{ color: '#94a3b8' }}>{card.unidade}</span> : null}
              </p>
              {card.variacao !== undefined && (
                <p className="text-[10px] mt-0.5" style={{ color: card.variacao >= 0 ? '#4ade80' : '#f87171' }}>
                  {card.variacao >= 0 ? '+' : ''}{card.variacao}%
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {tipo === 'tabela' && dados?.colunas && dados?.linhas && (
        <div className="overflow-x-auto px-2 pb-2">
          <table className="w-full text-[10px]" style={{ color: '#94a3b8' }}>
            <thead>
              <tr>
                {dados.colunas.map((col: string, i: number) => (
                  <th key={i} className="text-left px-2 py-1 font-semibold" style={{ color: '#4a9ede', borderBottom: '1px solid rgba(74,158,222,0.2)' }}>
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dados.linhas.slice(0, 8).map((linha: any[], i: number) => (
                <tr key={i} style={{ borderBottom: '1px solid rgba(74,158,222,0.08)' }}>
                  {linha.map((cel, j) => (
                    <td key={j} className="px-2 py-1 truncate max-w-[80px]">{String(cel ?? '')}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Componente principal
// ---------------------------------------------------------------------------
const WELCOME: Message = {
  role: 'assistant',
  content: 'Olá! Sou a Gabi, sua assistente de IA no AdminHub. Posso consultar emendas, votações, demandas e dados de municípios. Como posso ajudar?',
};

export function GabiFAB() {
  const [open, setOpen]       = useState(false);
  const [messages, setMessages] = useState<Message[]>([WELCOME]);
  const [input, setInput]     = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);
  const bottomRef  = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: Message = { role: 'user', content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setInput('');
    setError(null);
    setLoading(true);

    try {
      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const errMsg =
          res.status === 402 ? 'Créditos insuficientes na conta Anthropic.' :
          res.status === 503 ? 'API temporariamente sobrecarregada. Aguarde e tente novamente.' :
          data.error ?? 'Erro ao contatar a Gabi.';
        setError(errMsg);
      } else {
        setMessages(prev => [...prev, {
          role: 'assistant',
          content: data.content,
          visualizacao: data.visualizacao,
        }]);
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

  return (
    <>
      {/* ── Painel de chat ── */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.97 }}
            transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            className="fixed bottom-24 right-4 sm:right-6 z-50 flex flex-col"
            style={{
              width: 'min(400px, calc(100vw - 32px))',
              height: 'min(560px, calc(100vh - 120px))',
              background: 'var(--bg-card)',
              border: '1px solid rgba(74,158,222,0.25)',
              borderRadius: 20,
              boxShadow: '0 24px 60px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}
          >
            {/* Header */}
            <div
              className="flex items-center gap-3 px-4 py-3 flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #0f2240, #1a3a6b)', borderBottom: '1px solid rgba(74,158,222,0.2)' }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'linear-gradient(135deg, #1d6fd8, #22d3ee)' }}
              >
                <Bot className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white leading-tight">Gabi</p>
                <p className="text-[10px]" style={{ color: '#94A3B8' }}>Assistente IA · AdminHub</p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1 rounded-lg transition-colors hover:bg-white/10"
                style={{ color: '#94A3B8' }}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Mensagens */}
            <div className="flex-1 min-h-0 overflow-y-auto px-4 py-3 space-y-3 scrollbar-dark">
              {messages.map((msg, i) => (
                <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[88%]">
                    <div
                      className="px-3 py-2 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                      style={
                        msg.role === 'user'
                          ? { background: 'linear-gradient(135deg, #1d6fd8, #4a9ede)', color: '#fff', borderBottomRightRadius: 6 }
                          : { background: 'var(--tint-06)', border: '1px solid var(--tint-10)', color: 'var(--text-primary)', borderBottomLeftRadius: 6 }
                      }
                    >
                      {msg.content}
                    </div>
                    {msg.visualizacao && (
                      <VisualizacaoCard vis={msg.visualizacao} />
                    )}
                  </div>
                </div>
              ))}

              {/* Indicador de digitação */}
              {loading && (
                <div className="flex justify-start">
                  <div className="px-4 py-3 rounded-2xl" style={{ background: 'var(--tint-06)', border: '1px solid var(--tint-10)', borderBottomLeftRadius: 6 }}>
                    <div className="flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#4a9ede', animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#4a9ede', animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: '#4a9ede', animationDelay: '300ms' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Erro */}
              {error && (
                <div
                  className="text-xs px-3 py-2 rounded-xl text-center"
                  style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: '1px solid rgba(239,68,68,0.2)' }}
                >
                  {error}
                </div>
              )}

              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="flex items-end gap-2 p-3 flex-shrink-0" style={{ borderTop: '1px solid var(--tint-08)' }}>
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Pergunte sobre emendas, votos, demandas..."
                rows={1}
                disabled={loading}
                className="flex-1 resize-none rounded-xl px-3 py-2 text-sm outline-none scrollbar-dark"
                style={{
                  background: 'var(--tint-06)',
                  border: '1px solid var(--tint-10)',
                  color: 'var(--text-primary)',
                  maxHeight: 100,
                  lineHeight: '1.5',
                }}
                onInput={e => {
                  const el = e.currentTarget;
                  el.style.height = 'auto';
                  el.style.height = Math.min(el.scrollHeight, 100) + 'px';
                }}
              />
              <button
                onClick={send}
                disabled={!input.trim() || loading}
                className="flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-150"
                style={{
                  background: input.trim() && !loading ? 'linear-gradient(135deg, #1d6fd8, #4a9ede)' : 'var(--tint-08)',
                  color: input.trim() && !loading ? '#fff' : 'var(--text-tertiary)',
                }}
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── FAB ── */}
      <motion.button
        onClick={() => setOpen(o => !o)}
        whileHover={{ scale: 1.08 }}
        whileTap={{ scale: 0.94 }}
        className="fixed bottom-6 right-4 sm:right-6 z-50 w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
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
