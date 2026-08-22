'use client';

// Botão "Conectar com Google" e o estado da conexão do gabinete.
//
// A conexão é do GABINETE, não do usuário: quem conecta é o chefe de gabinete
// ou o administrador, e toda a equipe passa a ver os mesmos compromissos.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, RefreshCw, Unlink, AlertTriangle, Check } from 'lucide-react';

interface Conexao {
  email: string;
  calendarId: string;
  ultimaSync: string | null;
  ultimoErro: string | null;
  eventosImportados: number;
  conectadoPorNome: string | null;
}

interface Estado {
  disponivel: boolean;   // false = credenciais do Google ausentes no ambiente
  conectado: boolean;
  conexao: Conexao | null;
}

function quandoFoi(iso: string | null): string {
  if (!iso) return 'ainda não sincronizada';
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'agora mesmo';
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return new Date(iso).toLocaleDateString('pt-BR');
}


/**
 * Logo "G" do Google, nas quatro cores oficiais. Vem inline porque as diretrizes
 * de marca não permitem recolorir nem redesenhar o símbolo — usar um ícone
 * genérico de link, como estava antes, descaracteriza o botão.
 */
function LogoGoogle({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function GoogleConexao({ onSincronizou }: { onSincronizou?: () => void }) {
  const params = useSearchParams();
  const { data: sessao } = useSession();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [falhouCarregar, setFalhouCarregar] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const res = await fetch('/api/agenda/google');
      if (res.ok) { setEstado(await res.json()); setFalhouCarregar(false); }
      else setFalhouCarregar(true);
    } catch {
      setFalhouCarregar(true);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // O callback do Google devolve o resultado pela query da URL.
  useEffect(() => {
    const r = params.get('google');
    if (!r) return;
    if (r === 'conectado') {
      const n = params.get('importados');
      setAviso({ tipo: 'ok', texto: params.get('aviso') === 'sync-falhou'
        ? 'Conta conectada. A primeira sincronização falhou — tente "Sincronizar agora".'
        : `Agenda conectada${n ? ` — ${n} compromisso${n === '1' ? '' : 's'} importado${n === '1' ? '' : 's'}` : ''}.` });
      onSincronizou?.();
    } else if (r === 'cancelado') {
      setAviso({ tipo: 'erro', texto: 'Conexão cancelada.' });
    } else {
      const motivos: Record<string, string> = {
        'sem-refresh-token': 'O Google não liberou acesso contínuo. Remova o AdminHub em myaccount.google.com/permissions e conecte de novo.',
        'estado-invalido': 'A autorização expirou. Tente novamente.',
        'sem-codigo': 'O Google não devolveu a autorização.',
        token: 'Não foi possível concluir a autorização.',
      };
      setAviso({ tipo: 'erro', texto: motivos[params.get('motivo') ?? ''] ?? 'Não foi possível conectar.' });
    }
    // Limpa a query para o aviso não reaparecer a cada recarga
    window.history.replaceState({}, '', window.location.pathname);
  }, [params, onSincronizou]);

  const conectar = async () => {
    setOcupado(true); setAviso(null);
    try {
      const res = await fetch('/api/agenda/google', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) { setAviso({ tipo: 'erro', texto: d.error ?? 'Não foi possível iniciar a conexão.' }); return; }
      window.location.href = d.url;   // vai para o consentimento do Google
    } catch {
      setAviso({ tipo: 'erro', texto: 'Falha de conexão.' });
    } finally { setOcupado(false); }
  };

  const sincronizar = async () => {
    setOcupado(true); setAviso(null);
    try {
      const res = await fetch('/api/agenda/google/sincronizar', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) {
        setAviso({ tipo: 'erro', texto: d.erro ?? 'Não foi possível sincronizar.' });
      } else {
        const partes = [
          d.criados ? `${d.criados} novo${d.criados === 1 ? '' : 's'}` : '',
          d.atualizados ? `${d.atualizados} atualizado${d.atualizados === 1 ? '' : 's'}` : '',
          d.removidos ? `${d.removidos} removido${d.removidos === 1 ? '' : 's'}` : '',
        ].filter(Boolean);
        setAviso({ tipo: 'ok', texto: partes.length ? `Sincronizado: ${partes.join(', ')}.` : 'Tudo já estava em dia.' });
        onSincronizou?.();
      }
      carregar();
    } catch {
      setAviso({ tipo: 'erro', texto: 'Falha de conexão.' });
    } finally { setOcupado(false); }
  };

  const desconectar = async () => {
    if (!confirm('Desconectar o Google Agenda? Os compromissos já importados continuam aqui, mas deixam de ser atualizados.')) return;
    setOcupado(true);
    try {
      await fetch('/api/agenda/google', { method: 'DELETE' });
      setAviso({ tipo: 'ok', texto: 'Agenda desconectada.' });
      carregar();
    } finally { setOcupado(false); }
  };

  // Sem credenciais no ambiente (ou falha ao consultar), o recurso não tem como
  // funcionar. Some para o usuário comum, mas ADMINISTRADOR vê o motivo: sumir
  // calado deixa quem configura sem saber se falta variável, se a chamada
  // quebrou ou se o código nem subiu.
  const papel = (sessao?.user as any)?.role;
  const administra = ['ADMIN', 'SUPER_ADMIN', 'CHEFE', 'AGENTE_POLITICO'].includes(papel);

  if (!estado?.disponivel) {
    if (!administra) return null;
    if (!estado && !falhouCarregar) return null;   // ainda carregando
    return (
      <div className="rounded-xl px-4 py-3 flex items-start gap-2"
        style={{ background: 'var(--bg-card)', border: '1px dashed var(--border-default)' }}>
        <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--warning)' }} />
        <div>
          <p className="text-[12.5px] font-semibold" style={{ color: 'var(--text-primary)' }}>
            Google Agenda ainda não disponível
          </p>
          <p className="text-[11.5px] mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
            {falhouCarregar
              ? 'Não consegui consultar a integração. Recarregue a página; se persistir, avise a equipe técnica.'
              : 'Faltam as credenciais do Google neste ambiente (GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET). Só administradores veem este aviso.'}
          </p>
        </div>
      </div>
    );
  }

  const c = estado.conexao;
  return (
    <div className="rounded-xl px-4 py-3"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <span className="flex-shrink-0 rounded-full" style={{ width: 3, height: 15, background: 'linear-gradient(135deg, #2563EB, #4f8ff7)' }} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em]" style={{ color: 'var(--text-tertiary)' }}>
              Google Agenda
            </p>
            <p className="text-[13px] truncate" style={{ color: 'var(--text-secondary)' }}>
              {estado.conectado
                ? <>Conectada a <strong style={{ color: 'var(--text-primary)' }}>{c?.email}</strong> · atualizada {quandoFoi(c?.ultimaSync ?? null)}</>
                : 'Traga os compromissos do Google para a agenda do gabinete.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {estado.conectado ? (
            <>
              {/* Ação principal: superfície do Google com o logo, para o vínculo
                  ficar evidente mesmo depois de conectado. */}
              <button onClick={sincronizar} disabled={ocupado}
                className="flex items-center gap-2 px-4 transition-all hover:brightness-[0.97] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
                style={{
                  height: 38, borderRadius: 19,
                  background: 'var(--google-btn-bg)',
                  border: '1px solid var(--google-btn-borda)',
                  boxShadow: 'var(--google-btn-sombra)',
                  color: 'var(--google-btn-texto)',
                  fontSize: 13, fontWeight: 500, letterSpacing: '0.01em',
                }}>
                {ocupado
                  ? <Loader2 className="w-4 h-4 animate-spin" style={{ color: '#4285F4' }} />
                  : <RefreshCw className="w-4 h-4" style={{ color: '#4285F4' }} />}
                Sincronizar
              </button>
              <button onClick={desconectar} disabled={ocupado}
                title="Desconectar a conta do Google"
                className="flex items-center justify-center transition-all hover:opacity-100 disabled:opacity-40"
                style={{
                  width: 38, height: 38, borderRadius: 19,
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-tertiary)', opacity: 0.75,
                }}>
                <Unlink className="w-4 h-4" />
              </button>
            </>
          ) : (
            /* Botão no padrão de marca do Google: superfície própria, logo em
               quatro cores e altura de 40px, como nas diretrizes. */
            <button onClick={conectar} disabled={ocupado}
              className="flex items-center gap-3 pl-3 pr-4 transition-all hover:brightness-[0.97] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed"
              style={{
                height: 40, borderRadius: 20,
                background: 'var(--google-btn-bg)',
                border: '1px solid var(--google-btn-borda)',
                boxShadow: 'var(--google-btn-sombra)',
                color: 'var(--google-btn-texto)',
                fontSize: 14, fontWeight: 500, letterSpacing: '0.01em',
              }}>
              {ocupado
                ? <Loader2 className="w-[18px] h-[18px] animate-spin" style={{ color: '#4285F4' }} />
                : <LogoGoogle size={18} />}
              Conectar com Google
            </button>
          )}
        </div>
      </div>

      {/* Erro da última sincronização automática — sem isto, ela pararia de
          atualizar em silêncio e ninguém saberia por quê. */}
      {estado.conectado && c?.ultimoErro && (
        <p className="flex items-start gap-1.5 text-[11.5px] mt-2.5 pt-2.5"
          style={{ color: 'var(--warning)', borderTop: '1px solid var(--border-default)' }}>
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />
          <span>Última sincronização falhou. Se persistir, desconecte e conecte de novo.</span>
        </p>
      )}

      {aviso && (
        <p className="flex items-start gap-1.5 text-[11.5px] mt-2.5 pt-2.5"
          style={{ color: aviso.tipo === 'ok' ? 'var(--success)' : 'var(--danger)', borderTop: '1px solid var(--border-default)' }}>
          {aviso.tipo === 'ok' ? <Check className="w-3.5 h-3.5 flex-shrink-0 mt-px" /> : <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 mt-px" />}
          <span>{aviso.texto}</span>
        </p>
      )}
    </div>
  );
}
