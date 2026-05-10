'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Settings, Smartphone, Wifi, WifiOff, RefreshCw,
  Loader2, CheckCircle2, AlertCircle, Trash2, QrCode,
} from 'lucide-react';

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
  const [toast, setToast] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);

  useEffect(() => {
    if (status === 'authenticated' && userRole !== 'CHEFE' && userRole !== 'ADMIN') {
      router.replace('/dashboard');
    }
  }, [status, userRole, router]);

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
    if (userRole === 'CHEFE' || userRole === 'ADMIN') fetchStatus();
  }, [userRole, fetchStatus]);

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
    if (!confirm('Desconectar o WhatsApp deste gabinete? Será necessário escanear o QR novamente.')) return;
    setDeleting(true);
    try {
      await fetch('/api/whatsapp/instance', { method: 'DELETE' });
      setWaStatus('disconnected');
      setQrCode(null);
      setInstanceData(null);
      showToast('ok', 'WhatsApp desconectado.');
      fetchStatus();
    } finally { setDeleting(false); }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchStatus();
    setRefreshing(false);
  };

  if (status === 'loading') return null;
  if (userRole !== 'CHEFE' && userRole !== 'ADMIN') return null;

  const cardStyle = { background: 'rgba(7,29,54,0.75)', border: '1px solid rgba(201,162,39,0.13)' };

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
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center"
          style={{ background: 'rgba(201,162,39,0.15)', border: '1px solid rgba(201,162,39,0.3)' }}>
          <Settings className="w-5 h-5" style={{ color: '#c9a227' }} />
        </div>
        <div>
          <h1 className="text-white font-bold text-xl tracking-tight">Configurações</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.4)' }}>Configurações do gabinete</p>
        </div>
      </div>

      {/* WhatsApp Section */}
      <div className="rounded-2xl overflow-hidden" style={cardStyle}>
        <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="flex items-center gap-2">
            <Smartphone className="w-4 h-4" style={{ color: '#25d366' }} />
            <h2 className="font-semibold text-sm text-white">WhatsApp</h2>
          </div>
          <button onClick={handleRefresh} disabled={refreshing}
            className="p-1.5 rounded-lg transition-all hover:bg-white/5 disabled:opacity-40"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="p-5">
          {/* NOT CONFIGURED */}
          {waStatus === 'not_configured' && (
            <div className="text-center py-6">
              <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <WifiOff className="w-6 h-6" style={{ color: 'rgba(255,255,255,0.3)' }} />
              </div>
              <p className="text-white font-medium mb-1">Evolution API não configurada</p>
              <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
              <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#c9a227' }} />
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
                  <p className="text-white font-semibold text-sm">WhatsApp Conectado</p>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>
                    Instância: <span style={{ color: '#c9a227' }}>{instanceData?.instanceName}</span>
                  </p>
                </div>
                <CheckCircle2 className="w-5 h-5 ml-auto flex-shrink-0" style={{ color: '#4ade80' }} />
              </div>

              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
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
              {!instanceData?.instanceName && !qrCode ? (
                // Nunca conectou — criar instância
                <div className="text-center py-4">
                  <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                    style={{ background: 'rgba(201,162,39,0.08)', border: '1px solid rgba(201,162,39,0.2)' }}>
                    <QrCode className="w-6 h-6" style={{ color: '#c9a227' }} />
                  </div>
                  <p className="text-white font-medium mb-1">Nenhum número conectado</p>
                  <p className="text-xs mb-4" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    Clique abaixo para gerar o QR Code e conectar o WhatsApp do gabinete.
                  </p>
                  <button onClick={handleCreate} disabled={creating}
                    className="flex items-center gap-2 mx-auto px-5 py-2.5 rounded-xl text-sm font-semibold transition-all hover:opacity-90 disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg,#128c7e,#25d366)', color: '#fff' }}>
                    {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <QrCode className="w-4 h-4" />}
                    Gerar QR Code
                  </button>
                </div>
              ) : (
                // Tem QR code para escanear
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 rounded-xl"
                    style={{ background: 'rgba(201,162,39,0.07)', border: '1px solid rgba(201,162,39,0.2)' }}>
                    <AlertCircle className="w-4 h-4 flex-shrink-0" style={{ color: '#c9a227' }} />
                    <p className="text-xs" style={{ color: '#e6b83a' }}>
                      Abra o WhatsApp no celular → Dispositivos conectados → Conectar dispositivo → Escaneie o QR Code
                    </p>
                  </div>

                  {qrCode ? (
                    <div className="flex flex-col items-center gap-3">
                      <div className="p-3 rounded-2xl bg-white">
                        <img src={qrCode} alt="QR Code WhatsApp" className="w-52 h-52 object-contain" />
                      </div>
                      <p className="text-xs flex items-center gap-1.5" style={{ color: 'rgba(255,255,255,0.35)' }}>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Aguardando escaneamento… (atualiza automaticamente)
                      </p>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="w-6 h-6 animate-spin" style={{ color: '#c9a227' }} />
                    </div>
                  )}

                  <button onClick={handleCreate} disabled={creating}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-xl text-xs font-medium transition-all hover:opacity-80 disabled:opacity-50"
                    style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.4)' }}>
                    {creating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
                    Gerar novo QR Code
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
