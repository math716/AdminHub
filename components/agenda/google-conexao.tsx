'use client';

// Botão "Conectar com Google" e o estado da conexão do gabinete.
//
// A conexão é do GABINETE, não do usuário: quem conecta é o chefe de gabinete
// ou o administrador, e toda a equipe passa a ver os mesmos compromissos.

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession } from 'next-auth/react';
import { Loader2, RefreshCw, Link2, Unlink, AlertTriangle, Check } from 'lucide-react';

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
              <button onClick={sincronizar} disabled={ocupado}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-semibold transition-all hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #2563EB, #4f8ff7)', color: '#fff' }}>
                {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                Sincronizar agora
              </button>
              <button onClick={desconectar} disabled={ocupado}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all hover:opacity-80 disabled:opacity-60"
                style={{ color: 'var(--text-tertiary)', border: '1px solid var(--border-default)' }}>
                <Unlink className="w-3.5 h-3.5" />
                Desconectar
              </button>
            </>
          ) : (
            <button onClick={conectar} disabled={ocupado}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all hover:opacity-90 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #2563EB, #4f8ff7)', color: '#fff' }}>
              {ocupado ? <Loader2 className="w-4 h-4 animate-spin" /> : <Link2 className="w-4 h-4" />}
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
