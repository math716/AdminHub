'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { X, Send, Loader2, MessageSquare, Clock, Plus, Trash2, ChevronLeft, ScrollText, Sparkles } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import dynamic from 'next/dynamic';
import { getGabiFace, subscribeGabiFace } from './gabi-face-store';

const VisualizacoesCard = dynamic(
  () => import('./gabi-charts').then(m => m.VisualizacoesCard),
  { ssr: false, loading: () => null },
);

const RelatorioTerritorialCard = dynamic(
  () => import('./gabi-charts').then(m => m.RelatorioTerritorialCard),
  { ssr: false, loading: () => null },
);

// Personagem 3D (só carrega o three.js no cliente). Ativa quando
// NEXT_PUBLIC_GABI_MODEL_URL está definido; senão usa o "G".
const GabiAvatar3D = dynamic(
  () => import('./gabi-avatar-3d').then(m => m.GabiAvatar3D),
  { ssr: false, loading: () => null },
);
// Modelo embutido em public/models/gabi.glb (pode trocar por env var).
const HAS_GABI_3D = true;

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
  // Guarda a mensagem COMPLETA (com visualizacoes/tools/dadosBrutos), para que
  // os cards de gráficos e o botão de PDF continuem funcionando ao reabrir uma
  // conversa do histórico. Conversas antigas só têm role/content — o histórico
  // delas continua legível, apenas sem os cards.
  mensagens: Message[];
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
  | { type: 'bullet'; text: string; ordem?: number }
  | { type: 'table'; headers: string[]; rows: string[][] };

// Emojis decorativos no início de títulos ("📊 Dimensão absoluta") deixam a
// resposta com cara de rascunho. O conteúdo é o mesmo sem eles.
function semEmojiInicial(s: string): string {
  return s.replace(/^(?:\s*(?:[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}])+)\s*/u, '').trim() || s.trim();
}

function parseMarkdown(text: string): Block[] {
  const lines  = text.split('\n');
  const blocks: Block[] = [];
  let i = 0;

  while (i < lines.length) {
    const trimmed = lines[i].trim();
    if (!trimmed) { i++; continue; }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' }); i++; continue;
    }

    // Até 6 "#": o modelo usa #### com frequência e, sem isso, os cerquilhas
    // apareciam cruas no texto.
    const hm = trimmed.match(/^(#{1,6})\s+(.+)/);
    if (hm) {
      blocks.push({
        type: 'heading',
        level: Math.min(hm[1].length, 3) as 1 | 2 | 3,
        text: semEmojiInicial(hm[2].replace(/\*\*/g, '')),
      });
      i++; continue;
    }

    // "**Título:**" sozinho numa linha funciona como subtítulo — o modelo usa
    // muito esse formato e ele virava um parágrafo em negrito solto.
    const sm = trimmed.match(/^\*\*([^*]+)\*\*:?$/);
    if (sm) {
      blocks.push({ type: 'heading', level: 3, text: semEmojiInicial(sm[1]) });
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

    // Listas numeradas mantêm o número — em análise política a ordem costuma
    // ser a própria prioridade da recomendação.
    const nm = trimmed.match(/^(\d+)[.)]\s+(.+)/);
    if (nm) { blocks.push({ type: 'bullet', text: nm[2], ordem: Number(nm[1]) }); i++; continue; }

    blocks.push({ type: 'paragraph', text: trimmed }); i++;
  }

  return blocks;
}

// ─── Inline renderer ──────────────────────────────────────────────────────────

function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith('**') && p.endsWith('**'))
          return <strong key={i} className="font-semibold" style={{ color: 'var(--text-primary)' }}>{p.slice(2, -2)}</strong>;
        // Números e valores destacados com crase — tabular para alinhar bem
        if (p.startsWith('`') && p.endsWith('`'))
          return (
            <span key={i} className="px-1 py-px rounded tabular-nums text-[0.94em]"
              style={{ background: 'var(--tint-06)', color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
              {p.slice(1, -1)}
            </span>
          );
        if (p.startsWith('*') && p.endsWith('*'))
          return <em key={i}>{p.slice(1, -1)}</em>;
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

// Célula numérica (R$, %, milhares) alinha à direita — regra básica de tabela
// financeira; à esquerda os números ficam ilegíveis para comparação.
const RE_NUMERICO = /^[\s]*(R\$\s*)?[\d.,]+\s*(%|mil|mi|bi|pts?)?\s*$/i;

// ─── Block renderer ───────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  const blocks = parseMarkdown(content);
  return (
    <div style={{ fontSize: 13.5, lineHeight: 1.68 }}>
      {blocks.map((block, i) => {
        const primeiro = i === 0;
        switch (block.type) {
          // Três níveis com pesos distintos: seção (régua fina acima),
          // subseção e rótulo. Hierarquia de relatório, não de bloco de notas.
          case 'heading': {
            if (block.level === 1) {
              return (
                <p key={i} className="font-bold tracking-[-0.01em]"
                  style={{ fontSize: 15, color: 'var(--text-primary)', marginTop: primeiro ? 0 : 20, marginBottom: 8 }}>
                  <Inline text={block.text} />
                </p>
              );
            }
            if (block.level === 2) {
              return (
                <div key={i} style={{ marginTop: primeiro ? 0 : 18, marginBottom: 8 }}>
                  {!primeiro && <div style={{ height: 1, background: 'var(--border-default)', opacity: 0.7, marginBottom: 10 }} />}
                  <p className="font-bold tracking-[-0.01em]" style={{ fontSize: 13.5, color: 'var(--text-primary)' }}>
                    <Inline text={block.text} />
                  </p>
                </div>
              );
            }
            return (
              <p key={i} className="font-semibold uppercase tracking-[0.06em]"
                style={{ fontSize: 10.5, color: 'var(--brand-cobalt-text)', marginTop: primeiro ? 0 : 16, marginBottom: 6 }}>
                <Inline text={block.text} />
              </p>
            );
          }
          case 'hr':
            return <div key={i} style={{ height: 1, background: 'var(--border-default)', opacity: 0.7, margin: '14px 0' }} />;
          case 'paragraph':
            return (
              <p key={i} style={{ color: 'var(--text-secondary)', marginTop: primeiro ? 0 : 8 }}>
                <Inline text={block.text} />
              </p>
            );
          case 'bullet':
            return (
              <div key={i} className="flex gap-2.5" style={{ marginTop: 6 }}>
                {block.ordem !== undefined ? (
                  <span className="flex-shrink-0 font-semibold tabular-nums text-right"
                    style={{ fontSize: 11.5, color: 'var(--brand-cobalt-text)', minWidth: 14, lineHeight: '1.68' }}>
                    {block.ordem}.
                  </span>
                ) : (
                  <span className="flex-shrink-0 rounded-full"
                    style={{ width: 4, height: 4, background: 'var(--brand-cobalt)', marginTop: 9, opacity: 0.85 }} />
                )}
                <span className="flex-1" style={{ color: 'var(--text-secondary)' }}><Inline text={block.text} /></span>
              </div>
            );
          case 'table': {
            // Coluna é numérica quando a maioria das células é número.
            const numerica = block.headers.map((_, ci) => {
              const vals = block.rows.map(r => r[ci] ?? '');
              return vals.filter(v => RE_NUMERICO.test(v.replace(/\*\*/g, ''))).length > vals.length / 2;
            });
            return (
              <div key={i} className="overflow-x-auto rounded-lg" style={{ border: '1px solid var(--border-default)', marginTop: 12, marginBottom: 4 }}>
                <table className="w-full border-collapse" style={{ fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: 'var(--tint-06)' }}>
                      {block.headers.map((h, hi) => (
                        <th key={hi}
                          className={`px-3 py-2 font-semibold uppercase tracking-[0.05em] whitespace-nowrap ${numerica[hi] ? 'text-right' : 'text-left'}`}
                          style={{ fontSize: 10, color: 'var(--text-secondary)', borderBottom: '1px solid var(--border-default)' }}>
                          {h.replace(/\*\*/g, '')}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {block.rows.map((row, ri) => (
                      <tr key={ri} style={{ borderTop: ri > 0 ? '1px solid var(--border-default)' : 'none' }}>
                        {row.map((cell, ci) => (
                          <td key={ci}
                            className={`px-3 py-2 ${numerica[ci] ? 'text-right tabular-nums whitespace-nowrap' : 'text-left'}`}
                            style={{
                              color: ci === 0 ? 'var(--text-primary)' : 'var(--text-secondary)',
                              fontWeight: ci === 0 ? 500 : 400,
                              fontVariantNumeric: numerica[ci] ? 'tabular-nums' : undefined,
                            }}>
                            <Inline text={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          }
          default:
            return null;
        }
      })}
    </div>
  );
}

// ─── Tool chips ────────────────────────────────────────────────────────────────

// Rótulos que o PARLAMENTAR entende. Expor "buscar_votacao" mostra a mecânica
// interna e passa impressão de protótipo — o chip serve para dizer DE ONDE vem
// o dado, o que dá credibilidade à resposta.
const TOOL_LABELS: Record<string, string> = {
  buscar_emendas:               'Emendas parlamentares',
  buscar_votacao:               'Resultados eleitorais',
  buscar_demandas:              'Demandas do gabinete',
  buscar_agenda:                'Agenda do gabinete',
  buscar_contatos:              'Contatos do gabinete',
  dados_municipio:              'Perfil do município',
  comparar_parlamentares:       'Comparativo de emendas',
  localizar_parlamentar:        'Base de parlamentares',
  gerar_relatorio_territorial:  'Análise territorial',
};

function ToolChips({ tools }: { tools?: string[] }) {
  // `gerar_visualizacao` só formata o que já foi buscado — citá-lo como fonte
  // seria ruído.
  const fontes = (tools ?? []).filter(t => t !== 'gerar_visualizacao');
  if (fontes.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2">
      <span className="text-[10px] font-medium uppercase tracking-[0.06em]" style={{ color: 'var(--text-tertiary)' }}>
        Fontes
      </span>
      {fontes.map(t => (
        <span key={t}
          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[10.5px] font-medium"
          style={{ background: 'var(--tint-06)', color: 'var(--text-secondary)', border: '1px solid var(--border-default)' }}>
          <span className="rounded-full" style={{ width: 4, height: 4, background: 'var(--brand-cobalt)' }} />
          {TOOL_LABELS[t] ?? t.replace(/_/g, ' ')}
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
  const [gabiFace, setGabiFace] = useState<string | null>(getGabiFace());
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
  const chatScrollRef = useRef<HTMLDivElement>(null);
  const inputRef  = useRef<HTMLTextAreaElement>(null);
  // Espelha `sessaoId` para o autosave ler o valor atual dentro do debounce.
  const sessaoIdRef = useRef<string | null>(null);

  // ── Restaurar sessão ───────────────────────────────────────────────────────

  useEffect(() => {
    const storedMsgs = lsGet<Message[]>(LS_MSGS);
    if (Array.isArray(storedMsgs) && storedMsgs.length > 0) setMessages(storedMsgs);
    const storedId = lsGet<string>(LS_ID);
    // Popula o ref junto do state: o autosave lê o ref e, sem isso, uma sessão
    // restaurada seria gravada como conversa nova (duplicata no histórico).
    if (storedId) { setSessaoId(storedId); sessaoIdRef.current = storedId; }
  }, []);

  // ── Foto da Gabi 3D (capturada do canvas) para os avatares das mensagens ──
  useEffect(() => subscribeGabiFace(() => setGabiFace(getGabiFace())), []);

  // ── Sincronizar no localStorage ────────────────────────────────────────────

  // Nunca persiste só a saudação. No primeiro ciclo de efeitos `messages` ainda
  // é a mensagem de boas-vindas, e gravar aí apagava a sessão guardada antes de
  // ela chegar ao state — a conversa sumia ao reabrir a página. Quem limpa a
  // sessão é `novaConversa`, via lsDel.
  useEffect(() => {
    if (messages.length <= 1) return;
    lsSet(LS_MSGS, messages);
  }, [messages]);

  // ── Scroll e foco ─────────────────────────────────────────────────────────

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, loading]);
  useEffect(() => { if (open && view === 'chat') setTimeout(() => inputRef.current?.focus(), 150); }, [open, view]);

  // Ao abrir o chat (ou voltar do histórico), começa no FIM da conversa — na
  // última mensagem —, não no topo. O painel entra com animação, então o
  // container só existe/estabiliza um instante depois: salta direto pro fim
  // (sem smooth) já com o layout pronto.
  useEffect(() => {
    if (!open || view !== 'chat') return;
    const irAoFim = () => {
      const el = chatScrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    };
    const t = setTimeout(irAoFim, 120); // após a animação de entrada do painel
    return () => clearTimeout(t);
  }, [open, view]);

  // ── Bloquear scroll do body ────────────────────────────────────────────────

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  // ── Salvar conversa no banco ───────────────────────────────────────────────

  // Cria (POST) ou atualiza (PUT) a conversa no banco. Devolve o id da sessão.
  // O PUT é essencial: sem ele a conversa congela na primeira gravação e as
  // mensagens seguintes — com os cards e os botões de relatório — se perdem.
  const salvarConversa = useCallback(async (msgs: Message[], id: string | null): Promise<string | null> => {
    const userMsgs = msgs.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return id;
    const body = JSON.stringify({
      titulo: userMsgs[0].content.slice(0, 100),
      // Mensagem completa — sem isso os cards de dados somem ao reabrir
      mensagens: msgs,
    });
    try {
      if (id) {
        const res = await fetch(`/api/agent/conversas/${id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body,
        });
        if (res.ok) return id;
        if (res.status !== 404) return id; // erro transitório — tenta de novo depois
        // 404: a conversa foi apagada em outro dispositivo — recria abaixo.
      }
      const res = await fetch('/api/agent/conversas', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body,
      });
      if (res.ok) return (await res.json()).id as string;
    } catch {}
    return id;
  }, []);

  // ── Autosave ──────────────────────────────────────────────────────────────
  // A conversa é gravada sozinha após cada troca de mensagens. Antes só havia
  // gravação ao clicar em "nova conversa", então fechar o chat ou recarregar a
  // página perdia tudo — e o histórico reabria sem os cards.

  useEffect(() => { sessaoIdRef.current = sessaoId; }, [sessaoId]);

  // Serializa as gravações: duas em paralelo com a sessão ainda sem id criariam
  // conversas duplicadas no histórico.
  const gravacaoRef = useRef<Promise<void>>(Promise.resolve());

  const gravar = useCallback((msgs: Message[]) => {
    gravacaoRef.current = gravacaoRef.current.then(async () => {
      const id = await salvarConversa(msgs, sessaoIdRef.current);
      if (id && id !== sessaoIdRef.current) {
        sessaoIdRef.current = id;
        setSessaoId(id);
        lsSet(LS_ID, id);
      }
    }).catch(() => {});
    return gravacaoRef.current;
  }, [salvarConversa]);

  useEffect(() => {
    if (loading) return;                       // espera a resposta terminar
    if (messages.filter(m => m.role === 'user').length === 0) return;
    const timer = setTimeout(() => { gravar(messages); }, 1200);
    return () => clearTimeout(timer);
  }, [messages, loading, gravar]);

  // ── Nova conversa ─────────────────────────────────────────────────────────

  const novaConversa = useCallback(async () => {
    // Garante que a conversa atual está gravada antes de limpar a tela — o
    // autosave pode ainda estar no debounce quando o usuário clica em "+".
    if (messages.filter(m => m.role === 'user').length > 0) {
      setSaving(true);
      await gravar(messages);
      setSaving(false);
    }
    setMessages([WELCOME]);
    setSessaoId(null);
    sessaoIdRef.current = null;
    lsDel(LS_MSGS, LS_ID);
    setView('chat');
  }, [messages, gravar]);

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
    // Preserva visualizacoes/tools/dadosBrutos quando existirem (conversas
    // salvas antes desta correção só têm role/content e reabrem sem cards).
    const msgs: Message[] = (c.mensagens ?? [])
      .filter(m => m && (m.role === 'user' || m.role === 'assistant'))
      .map(m => ({
        role: m.role,
        content: m.content ?? '',
        ...(m.visualizacoes ? { visualizacoes: m.visualizacoes } : {}),
        ...(m.tools ? { tools: m.tools } : {}),
        ...(m.dadosBrutos ? { dadosBrutos: m.dadosBrutos } : {}),
        ...(m.userQuestion ? { userQuestion: m.userQuestion } : {}),
      }));
    const final = msgs.length > 0 ? msgs : [WELCOME];
    setMessages(final);
    setSessaoId(c.id);
    sessaoIdRef.current = c.id; // o autosave passa a atualizar ESTA conversa
    lsSet(LS_MSGS, final);
    lsSet(LS_ID, c.id);
    setView('chat');
  }, []);

  const deletarConversa = useCallback(async (id: string) => {
    setHistorico(prev => prev.filter(c => c.id !== id));
    if (sessaoId === id) { setSessaoId(null); sessaoIdRef.current = null; lsDel(LS_ID); }
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
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
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
                className="relative flex items-center gap-3 px-5 py-4 flex-shrink-0 overflow-hidden"
                style={{ background: 'linear-gradient(135deg, #0a1a33 0%, #0f2547 55%, #17335c 100%)', borderBottom: '1px solid rgba(74,158,222,0.18)' }}
              >
                {/* brilho decorativo (esquerda) */}
                <div className="pointer-events-none absolute top-0 bottom-0 left-0 w-56"
                  style={{ background: 'radial-gradient(130px 90px at 44px 50%, rgba(34,211,238,0.22), transparent 72%)' }} />
                {/* linha de destaque no rodapé */}
                <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-px"
                  style={{ background: 'linear-gradient(90deg, transparent, rgba(74,158,222,0.55), rgba(34,211,238,0.55), transparent)' }} />

                {/* Avatar (personagem 3D quando configurada) + status online */}
                <div className="relative flex-shrink-0">
                  {HAS_GABI_3D ? (
                    <div className="w-14 h-14 rounded-full overflow-hidden"
                      style={{ background: 'linear-gradient(135deg, #123a6b, #0e5e78)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 4px 18px rgba(34,211,238,0.45)' }}>
                      <GabiAvatar3D size={56} />
                    </div>
                  ) : (
                    <div className="w-10 h-10 rounded-full flex items-center justify-center font-bold text-white text-lg"
                      style={{ background: 'linear-gradient(135deg, #1d6fd8, #22d3ee)', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.18), 0 4px 16px rgba(34,211,238,0.40)' }}>
                      G
                    </div>
                  )}
                  <span className="absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2"
                    style={{ background: '#22c55e', borderColor: '#0f2547' }}>
                    <span className="absolute inset-0 rounded-full animate-ping" style={{ background: 'rgba(34,197,94,0.55)' }} />
                  </span>
                </div>

                {/* Título */}
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-white leading-tight tracking-tight text-[15px]">Gabi</p>
                    <Sparkles className="w-3.5 h-3.5 flex-shrink-0" style={{ color: '#22d3ee' }} />
                  </div>
                  <p className="text-[11px] font-medium truncate" style={{ color: 'rgba(226,232,240,0.62)' }}>
                    {view === 'history' ? 'Histórico de conversas' : 'Assessora Virtual · AdminHub'}
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
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-cobalt)' }} />
                    </div>
                  ) : historico.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3" style={{ color: 'var(--text-tertiary)' }}>
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
                          style={{ borderBottom: '1px solid var(--border-default)' }}
                        >
                          <MessageSquare className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--brand-cobalt)', opacity: 0.55 }} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium truncate" style={{ color: 'var(--text-primary)' }}>
                              {c.titulo || 'Conversa sem título'}
                            </p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
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
                    ref={chatScrollRef}
                    className="flex-1 min-h-0 overflow-y-auto py-6 px-5 space-y-6"
                    style={{ scrollbarWidth: 'thin', scrollbarColor: 'var(--border-strong) transparent' }}
                  >
                    {/* Gabi 3D grande na tela inicial (sem conversa ainda) */}
                    {HAS_GABI_3D && messages.length <= 1 && (
                      <div className="flex flex-col items-center pt-2 pb-1">
                        {/* Sem moldura: só o brilho atrás da figura. A caixa
                            com borda e sombra recortava a Gabi do painel. */}
                        <div className="w-44 h-44 overflow-hidden"
                          style={{ background: 'radial-gradient(80% 80% at 50% 30%, var(--gabi-halo), transparent 70%)' }}>
                          <GabiAvatar3D size={176} />
                        </div>
                        <p className="font-bold mt-1 tracking-[-0.01em]"
                          style={{ fontSize: 15, color: 'var(--text-primary)' }}>Gabi</p>
                        <p className="uppercase font-semibold tracking-[0.09em] mt-0.5"
                          style={{ fontSize: 9.5, color: 'var(--brand-cobalt-text)' }}>
                          Sua assessora virtual
                        </p>
                      </div>
                    )}
                    {messages.map((msg, i) => (
                      <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* Avatar Gabi */}
                        {msg.role === 'assistant' && (
                          <div className="w-8 h-8 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center mt-5 font-semibold text-white text-[11px]"
                            style={{
                              background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)',
                              boxShadow: '0 0 0 2px var(--bg-card), 0 0 0 3px var(--gabi-balao-borda), 0 2px 6px rgba(15,23,42,0.14)',
                            }}>
                            {gabiFace ? <img src={gabiFace} alt="Gabi" className="w-full h-full object-cover" /> : 'G'}
                          </div>
                        )}

                        {/* Conteúdo — a resposta da Gabi ganha mais largura que
                            a pergunta: ela carrega tabelas e análise. */}
                        <div className={`flex flex-col gap-1 min-w-0 ${msg.role === 'user' ? 'items-end max-w-[85%]' : 'items-start max-w-[92%]'}`}>
                          <span className="text-[10.5px] font-semibold uppercase tracking-[0.07em] px-0.5"
                            style={{ color: 'var(--text-tertiary)' }}>
                            {msg.role === 'user' ? 'Você' : 'Gabi'}
                          </span>

                          {/* Tool chips — acima do balão, apenas para mensagens da Gabi */}
                          {msg.role === 'assistant' && <ToolChips tools={msg.tools} />}

                          {/* Balão */}
                          <div
                            className="w-full"
                            style={
                              msg.role === 'user'
                                ? {
                                    background: 'var(--gabi-envio)', color: '#fff',
                                    borderRadius: 16, borderTopRightRadius: 5,
                                    padding: '11px 15px',
                                    boxShadow: 'var(--gabi-envio-sombra)',
                                  }
                                : {
                                    // Gradiente leve + sombra própria: o cinza
                                    // chapado deixava a resposta com peso de
                                    // rascunho, sem destaque do painel.
                                    background: 'linear-gradient(180deg, var(--gabi-balao-de), var(--gabi-balao-para))',
                                    border: '1px solid var(--gabi-balao-borda)',
                                    borderRadius: 16, borderTopLeftRadius: 5,
                                    padding: '14px 16px',
                                    boxShadow: 'var(--gabi-balao-sombra)',
                                  }
                            }
                          >
                            {msg.role === 'user'
                              ? <p className="whitespace-pre-wrap" style={{ fontSize: 13.5, lineHeight: 1.6 }}>{msg.content}</p>
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

                          {/* Relatório territorial (por Região Administrativa) */}
                          {msg.role === 'assistant' && msg.dadosBrutos?.gerar_relatorio_territorial?.prontoParaGerar && (
                            <RelatorioTerritorialCard payload={msg.dadosBrutos.gerar_relatorio_territorial} />
                          )}
                        </div>
                      </div>
                    ))}

                    {/* Digitando */}
                    {loading && (
                      <div className="flex gap-3">
                        <div className="w-7 h-7 rounded-full flex-shrink-0 overflow-hidden flex items-center justify-center font-semibold text-white text-[11px]"
                          style={{ background: 'linear-gradient(135deg, #1d4ed8, #22d3ee)', boxShadow: '0 0 0 1px var(--border-default)' }}>
                          {gabiFace ? <img src={gabiFace} alt="Gabi" className="w-full h-full object-cover" /> : 'G'}
                        </div>
                        <div className="flex items-center px-4 py-3"
                          style={{
                            background: 'linear-gradient(180deg, var(--gabi-balao-de), var(--gabi-balao-para))',
                            border: '1px solid var(--gabi-balao-borda)',
                            borderRadius: 16, borderTopLeftRadius: 5,
                            boxShadow: 'var(--gabi-balao-sombra)',
                          }}>
                          <div className="flex items-center gap-1.5">
                            {[0, 150, 300].map(delay => (
                              <span key={delay} className="rounded-full animate-bounce"
                                style={{ width: 5, height: 5, background: 'var(--brand-cobalt)', animationDelay: `${delay}ms` }} />
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
                  <div className="flex-shrink-0 px-5 py-4 relative" style={{ background: 'var(--bg-card)' }}>
                    {/* Filete com brilho no topo — separa a área de escrita do
                        histórico sem o traço seco de uma borda. */}
                    <div aria-hidden className="absolute inset-x-0 top-0 pointer-events-none"
                      style={{ height: 1, background: 'linear-gradient(90deg, transparent, var(--gabi-balao-borda) 18%, var(--gabi-balao-borda) 82%, transparent)' }} />
                    <div className="flex items-end gap-2.5">
                      <textarea
                        ref={inputRef}
                        value={input}
                        onChange={e => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        placeholder="Pergunte sobre emendas, votos, demandas, candidatos..."
                        rows={1}
                        disabled={loading}
                        className="flex-1 resize-none px-4 py-3 outline-none transition-all duration-150"
                        style={{
                          background: 'var(--gabi-campo)',
                          border: '1px solid var(--gabi-balao-borda)',
                          borderRadius: 14,
                          color: 'var(--text-primary)',
                          maxHeight: 120,
                          fontSize: 13.5,
                          lineHeight: '1.55',
                          boxShadow: 'var(--gabi-campo-sombra)',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = 'var(--brand-cobalt)';
                          e.currentTarget.style.boxShadow = 'var(--gabi-campo-sombra), 0 0 0 3px var(--focus-ring)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'var(--gabi-balao-borda)';
                          e.currentTarget.style.boxShadow = 'var(--gabi-campo-sombra)';
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
                        className="flex-shrink-0 flex items-center justify-center transition-all duration-150 disabled:cursor-not-allowed"
                        style={{
                          width: 42, height: 42, borderRadius: 14,
                          background: input.trim() && !loading ? 'var(--gabi-envio)' : 'var(--tint-06)',
                          border: input.trim() && !loading ? 'none' : '1px solid var(--gabi-balao-borda)',
                          color: input.trim() && !loading ? '#fff' : 'var(--text-tertiary)',
                          boxShadow: input.trim() && !loading ? 'var(--gabi-envio-sombra)' : 'none',
                          transform: input.trim() && !loading ? 'scale(1)' : 'scale(0.97)',
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
        className="fixed bottom-6 right-4 sm:right-6 z-[9990] w-14 h-14 rounded-full flex items-center justify-center shadow-lg"
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
