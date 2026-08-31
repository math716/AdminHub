'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { useTheme } from 'next-themes';
import {
  Settings, Smartphone, Wifi, WifiOff, RefreshCw,
  Loader2, CheckCircle2, AlertCircle, Trash2, QrCode,
  Sun, Moon, Palette, X,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SedeGabinete } from '@/components/configuracoes/sede-gabinete';

type WaStatus = 'loading' | 'not_configured' | 'disconnected' | 'connecting' | 'connected';

interface InstanceData {
  configured: boolean;
  connected: boolean;
  instanceName?: string;
  state?: string;
  qrCode?: string | null;
}

export default function ConfiguracoesPage() {
  const { data: session, status } = useSession() || {};
  const router = useRouter();
  const userRole = (session?.user as any)?.role;

  const [waStatus, setWaStatus] = useState<WaStatus>('loading');
  const [instanceData, setInstanceData] = useState<InstanceData | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  const canAccess = userRole === 'AGENTE_POLITICO' || userRole === 'CHEFE';

  useEffect(() => {
    if (status === 'authenticated' && !canAccess) {
      router.replace('/dashboard');
    }
  }, [status, canAccess, router]);

  const showToast = (type: 'ok' | 'err', msg: string) => {
    setToast({ type, msg });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/whatsapp/instance');
      const data: InstanceData = await res.json();
      setInstanceData(data);

      if (!data.configured) { setWaStatus('not_configured'); return; }
      if (data.connected) { setWaStatus('connected'); setQrCode(null); return; }
      if (data.state === 'connecting') { setWaStatus('connecting'); }
      else { setWaStatus('disconnected'); }
      if (data.qrCode) setQrCode(data.qrCode);
    } catch {
      setWaStatus('not_configured');
    }
  }, []);

  useEffect(() => {
    if (canAccess) fetchStatus();
  }, [canAccess, fetchStatus]);

  // Poll while connecting (waiting for QR scan)
  useEffect(() => {
    if (waStatus !== 'connecting' && waStatus !== 'disconnected') return;
    const interval = setInterval(async () => {
      const res = await fetch('/api/whatsapp/instance');
      const data: InstanceData = await res.json();
      if (data.connected) {
        setWaStatus('connected');
        setQrCode(null);
        showToast('ok', 'WhatsApp conectado com sucesso!');
        clearInterval(interval);
      } else if (data.qrCode && data.qrCode !== qrCode) {
        setQrCode(data.qrCode);
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [waStatus, qrCode]);

  const handleCreate = async () => {
    setCreating(true);
    try {
      const res = await fetch('/api/whatsapp/instance', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        setQrCode(data.qrCode);
        setWaStatus('disconnected');
        showToast('ok', 'Instância criada! Escaneie o QR Code com o WhatsApp.');
      } else {
        showToast('err', data.error ?? 'Erro ao criar instância.');
      }
    } finally { setCreating(false); }
  };

  const handleDelete = async () => {
    setConfirmDisconnect(true);
  };

  const doDisconnect = async () => {
    setConfirmDisconnect(false);
    setDeleting(true);
    try {
      await fetch('/api/whatsapp/instance', { method: 'DELETE' });
      setQrCode(null);
      setInstanceData(null);
      setWaStatus('loading');
      showToast('ok', 'WhatsApp desconectado.');
      await fetchStatus();
    } finally { setDeleting(false); }
  };

  const handleCancelQr = async () => {
    try {
      await fetch('/api/whatsapp/instance', { method: 'DELETE' });
    } catch { /* ignora */ }
    setQrCode(null);
    setInstanceData(null);
    setWaStatus('not_configured');
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  if (status === 'loading') return null;
  if (!canAccess) return null;

  const cardStyle = { background: 'var(--bg-card)', border: '1px solid var(--border-default)' };

  return (
    <div className="space-y-6 max-w-2xl">

      {/* Toast */}
      <AnimatePresence>
        {toast && (
          <motion.div initial={{ opacity: 0, y: -12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
            className="fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium"
            style={toast.type === 'ok'
              ? { background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', color: '#4ade80' }
              : { background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
            {toast.type === 'ok' ? <CheckCircle2 className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {toast.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <PageHeader
        icon={Settings}
        title="Configurações"
        subtitle="Configurações do gabinete"
      />

      {/* Aparência Section */}
      <AparenciaCard />

      {/* Sede do gabinete — ponto de partida das rotas do dia */}
      <SedeGabinete />

      {/* WhatsApp Section */}
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--tint-06)' }}>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" style={{ color: '#25d366' }} />
            <h2 className="font-semibold text-sm text-[color:var(--text-primary)]">WhatsApp</h2>
          </div>
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-1.5 rounded-lg transition-all hover:bg-[var(--tint-06)] disabled:opacity-40"
            style={{ color: 'var(--tint-45)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="p-5">
          {/* NOT CONFIGURED */}
          {waStatus === 'not_configured' && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)' }}>
                <WifiOff className="w-6 h-6" style={{ color: 'var(--tint-35)' }} />
              </div>
              <p className="text-[color:var(--text-primary)] font-medium mb-1">Evolution API não configurada</p>
              <p className="text-xs mb-4" style={{ color: 'var(--tint-45)' }}>
                O servidor de WhatsApp ainda não está instalado. Siga o guia de instalação.
              </p>
              <span className="text-xs px-3 py-1.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.2)' }}>
                Aguardando configuração do servidor
              </span>
            </div>
          )}

          {/* LOADING */}
          {waStatus === 'loading' && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--brand-cobalt)' }} />
            </div>
          )}

          {/* CONNECTED */}
          {waStatus === 'connected' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3 p-4 rounded-xl"
                style={{ background: 'rgba(34,197,94,0.07)', border: '1px solid rgba(34,197,94,0.2)' }}>
                <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: 'rgba(37,211,102,0.15)' }}>
                  <Wifi className="w-5 h-5" style={{ color: '#25d366' }} />
                </div>
                <div>
                  <p className="text-[color:var(--text-primary)] font-semibold text-sm">WhatsApp Conectado</p>
                  <p className="text-xs" style={{ color: 'var(--tint-45)' }}>
                    Instância: <span style={{ color: 'var(--brand-cobalt)' }}>{instanceData?.instanceName}</span>
                  </p>
                </div>
                <CheckCircle2 className="w-5 h-5 ml-auto flex-shrink-0" style={{ color: '#4ade80' }} />
              </div>

              <p className="text-xs" style={{ color: 'var(--tint-45)' }}>
                O número conectado será usado para disparar mensagens para os contatos do gabinete.
                Não desconecte o WhatsApp no celular para manter o serviço ativo.
              </p>

              <button onClick={handleDelete} disabled={deleting}
                className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all hover:opacity-80 disabled:opacity-50"
                style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', color: '#fca5a5' }}>
                {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Desconectar WhatsApp
              </button>
            </div>
          )}

          {/* DISCONNECTED / QR */}
          {(waStatus === 'disconnected' || waStatus === 'connecting') && (
            <div className="space-y-4">
              {!qrCode ? (
                // Sem QR code — mostrar apenas o botão, sem spinner
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'var(--brand-cobalt-soft)', border: '1px solid rgba(37,99,235,0.25)' }}>
                    <QrCode className="w-6 h-6" style={{ color: 'var(--brand-cobalt)' }} />
                  </div>
                  <p className="text-[color:var(--text-primary)] font-medium mb-1">
                    {instanceData?.instanceName ? 'WhatsApp desconectado' : 'Nenhum número conectado'}
                  </p>
                  <p className="text-xs mb-4" style={{ color: 'var(--tint-45)' }}>
                    Clique abaixo para gerar o QR Code e conectar o WhatsApp do gabinete.
                  </p>
                  <button onClick={handleCreate} disabled={creating}
                    className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)', color: 'var(--text-primary)' }}>
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                    {creating ? 'Gerando QR Code…' : instanceData?.instanceName ? 'Reconectar WhatsApp' : 'Gerar QR Code'}
                  </button>
                </div>
              ) : (
                // QR code disponível — mostrar para escanear
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: 'var(--brand-cobalt-soft)', border: '1px solid rgba(37,99,235,0.25)' }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--brand-cobalt)' }} />
                    <p className="text-xs" style={{ color: 'var(--brand-cobalt-text)' }}>
                      Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo → Escaneie o QR Code
                    </p>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <div className="p-3 rounded-2xl bg-white">
                      <img src={qrCode} alt="QR Code WhatsApp" className="w-40 h-40 sm:w-52 sm:h-52 object-contain" />
                    </div>
                    <p className="text-xs flex items-center gap-1.5" style={{ color: 'var(--tint-35)' }}>
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Aguardando escaneamento… (atualiza automaticamente)
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={handleCreate} disabled={creating}
                      className="flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
                      style={{ background: 'var(--tint-04)', border: '1px solid var(--tint-08)', color: 'var(--tint-45)' }}>
                      {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                      Gerar novo QR Code
                    </button>
                    <button onClick={handleCancelQr}
                      className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#fca5a5' }}>
                      <X className="w-3.5 h-3.5" />
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={confirmDisconnect}
        title="Desconectar WhatsApp?"
        message="Será necessário escanear o QR Code novamente para reconectar o WhatsApp a este gabinete."
        confirmLabel="Sim, desconectar"
        variant="danger"
        onConfirm={doDisconnect}
        onCancel={() => setConfirmDisconnect(false)}
      />
    </div>
  );
}

// ──────────────────────────────────────────────────────────
// Card de aparência — toggle dark/light
// ──────────────────────────────────────────────────────────
function AparenciaCard() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { update } = useSession();
  const [mounted, setMounted] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme === 'system' ? resolvedTheme : theme) ?? 'dark' : 'dark';

  const choose = async (next: 'light' | 'dark') => {
    if (next === current) return;
    setSaving(true);
    setTheme(next);
    try {
      await fetch('/api/users/me/theme', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ theme: next }),
      });
      // Refresca o JWT pra próxima session/tab abrir com o tema correto
      await update();
    } catch {
      // segue só no localStorage
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-default)' }}
    >
      <div
        className="px-5 py-4 flex items-center justify-between"
        style={{ borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4" style={{ color: 'var(--brand-cobalt)' }} />
          <h2 className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Aparência</h2>
        </div>
        {saving && (
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: 'var(--text-tertiary)' }} />
        )}
      </div>

      <div className="p-5">
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          Escolha o tema da plataforma. Sua preferência sincroniza entre dispositivos.
        </p>

        <div className="grid grid-cols-2 gap-3 max-w-md">
          <button
            type="button"
            onClick={() => choose('light')}
            className="flex items-center gap-3 p-4 rounded-xl text-left transition-colors"
            style={{
              background: current === 'light' ? 'var(--brand-cobalt-soft)' : 'var(--bg-card-subtle)',
              border: `1px solid ${current === 'light' ? 'var(--brand-cobalt)' : 'var(--border-default)'}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: '#F5F7FA', border: '1px solid #E2E8F0' }}
            >
              <Sun className="w-5 h-5" style={{ color: '#D97706' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{
                color: current === 'light' ? 'var(--brand-cobalt-text)' : 'var(--text-primary)',
              }}>
                Claro
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Fundo branco
              </p>
            </div>
          </button>

          <button
            type="button"
            onClick={() => choose('dark')}
            className="flex items-center gap-3 p-4 rounded-xl text-left transition-colors"
            style={{
              background: current === 'dark' ? 'var(--brand-cobalt-soft)' : 'var(--bg-card-subtle)',
              border: `1px solid ${current === 'dark' ? 'var(--brand-cobalt)' : 'var(--border-default)'}`,
            }}
          >
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(148,163,184,0.18)' }}
            >
              <Moon className="w-5 h-5" style={{ color: '#60A5FA' }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold" style={{
                color: current === 'dark' ? 'var(--brand-cobalt-text)' : 'var(--text-primary)',
              }}>
                Escuro
              </p>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>
                Fundo navy
              </p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
