'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { PageHeader } from '@/components/ui/page-header';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { StatCard } from '@/components/ui/stat-card';
import { EmptyState } from '@/components/ui/empty-state';
import { LoadingState } from '@/components/ui/loading-state';
import {
  Plus,
  Search,
  Filter,
  FileText,
  Trash2,
  MapPin,
  User,
  Calendar,
  Camera,
  Navigation,
  Loader2,
  CheckCircle,
  X,
  AlertTriangle,
  Clock,
  CircleDot,
  ListChecks,
  Flag
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ESTADOS_BRASIL,
  CATEGORY_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS,
  CATEGORY_COLORS,
  STATUS_COLORS,
  PRIORITY_COLORS
} from '@/lib/types';
import { DemandCategory, DemandStatus, DemandPriority } from '@prisma/client';

interface Demand {
  id: string;
  title: string;
  description: string | null;
  solicitante: string;
  contato: string | null;
  estado: string;
  municipio: string;
  bairro: string | null;
  endereco: string | null;
  lat: number | null;
  lng: number | null;
  foto: string | null;
  category: DemandCategory;
  status: DemandStatus;
  priority: DemandPriority;
  observations: string | null;
  createdAt: string;
  closedAt: string | null;
  createdBy: { name: string; email: string };
}

export default function DemandasPage() {
  const { data: session } = useSession() || {};
  const userRole = (session?.user as any)?.role || 'ASSESSOR';
  const [demands, setDemands] = useState<Demand[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingDemand, setEditingDemand] = useState<Demand | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterEstado, setFilterEstado] = useState('');

  // Form
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    solicitante: '',
    contato: '',
    estado: '',
    municipio: '',
    bairro: '',
    endereco: '',
    lat: null as number | null,
    lng: null as number | null,
    foto: '',
    category: 'OUTROS' as DemandCategory,
    status: 'PENDENTE' as DemandStatus,
    priority: 'MEDIA' as DemandPriority,
    observations: ''
  });
  const [formMunicipios, setFormMunicipios] = useState<{ id: number; nome: string }[]>([]);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const fetchDemands = async () => {
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterCategory) params.set('category', filterCategory);
      if (filterPriority) params.set('priority', filterPriority);
      if (filterEstado) params.set('estado', filterEstado);
      if (searchTerm) params.set('search', searchTerm);

      const res = await fetch(`/api/demands?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setDemands(data ?? []);
      }
    } catch (error) {
      console.error('Error fetching demands:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDemands();
  }, [filterStatus, filterCategory, filterPriority, filterEstado, searchTerm]);

  useEffect(() => {
    if (formData.estado) {
      const uf = ESTADOS_BRASIL?.find?.((e) => e?.sigla === formData.estado);
      if (uf) {
        fetch(`/api/ibge/municipios?uf=${uf.sigla}`)
          .then(res => res.json())
          .then(data => setFormMunicipios(data ?? []))
          .catch(() => setFormMunicipios([]));
      }
    } else {
      setFormMunicipios([]);
    }
  }, [formData.estado]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);

    try {
      let payload = { ...formData };

      // Auto-geocode if address present but no coordinates
      if (payload.endereco && !payload.lat && !payload.lng) {
        try {
          const addr = payload.endereco || `${payload.municipio} ${payload.estado}`;
          const geoRes = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
          const geoData = await geoRes.json();
          const first = geoData?.results?.[0];
          if (first) {
            payload = { ...payload, lat: first.lat, lng: first.lng };
          }
        } catch {
          // proceed without coords
        }
      }

      const url = editingDemand ? `/api/demands/${editingDemand.id}` : '/api/demands';
      const method = editingDemand ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setShowModal(false);
        setEditingDemand(null);
        resetForm();
        fetchDemands();
      }
    } catch (error) {
      console.error('Error saving demand:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (demand: Demand) => {
    setEditingDemand(demand);
    setFormData({
      title: demand?.title ?? '',
      description: demand?.description ?? '',
      solicitante: demand?.solicitante ?? '',
      contato: demand?.contato ?? '',
      estado: demand?.estado ?? '',
      municipio: demand?.municipio ?? '',
      bairro: demand?.bairro ?? '',
      endereco: demand?.endereco ?? '',
      lat: demand?.lat ?? null,
      lng: demand?.lng ?? null,
      foto: demand?.foto ?? '',
      category: demand?.category ?? 'OUTROS',
      status: demand?.status ?? 'PENDENTE',
      priority: demand?.priority ?? 'MEDIA',
      observations: demand?.observations ?? ''
    });
    setShowModal(true);
  };

  const handleDelete = (id: string) => setConfirmDeleteId(id);

  const doDelete = async () => {
    if (!confirmDeleteId) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/demands/${id}`, { method: 'DELETE' });
      if (res.ok) fetchDemands();
    } catch (error) {
      console.error('Error deleting demand:', error);
    }
  };

  const resetForm = () => {
    setFormData({
      title: '',
      description: '',
      solicitante: '',
      contato: '',
      estado: '',
      municipio: '',
      bairro: '',
      endereco: '',
      lat: null,
      lng: null,
      foto: '',
      category: 'OUTROS',
      status: 'PENDENTE',
      priority: 'MEDIA',
      observations: ''
    });
  };

  const geocodeFormAddress = useCallback(async () => {
    const addr = formData.endereco || `${formData.municipio} ${formData.estado}`;
    if (!addr.trim()) return;
    setGeoLoading(true);
    try {
      const res = await fetch(`/api/geocode?address=${encodeURIComponent(addr)}`);
      const data = await res.json();
      const first = data?.results?.[0];
      if (first) {
        setFormData((f) => ({ ...f, lat: first.lat, lng: first.lng }));
      }
    } catch (err) {
      console.error('Geocoding error:', err);
    } finally {
      setGeoLoading(false);
    }
  }, [formData.endereco, formData.municipio, formData.estado]);

  const handleFotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setFormData((f) => ({ ...f, foto: (ev.target?.result as string) ?? '' }));
    reader.readAsDataURL(file);
  };

  const categoryOptions = Object.entries(CATEGORY_LABELS ?? {})?.map?.(([value, label]) => ({
    value,
    label: label ?? value
  })) ?? [];

  const statusOptions = Object.entries(STATUS_LABELS ?? {})?.map?.(([value, label]) => ({
    value,
    label: label ?? value
  })) ?? [];

  const priorityOptions = Object.entries(PRIORITY_LABELS ?? {})?.map?.(([value, label]) => ({
    value,
    label: label ?? value
  })) ?? [];

  const estadoOptions = [{ value: '', label: 'Selecione' }, ...(ESTADOS_BRASIL?.map?.((e) => ({
    value: e?.sigla ?? '',
    label: e?.nome ?? ''
  })) ?? [])];

  // Stats por status
  const stats = {
    total: demands?.length ?? 0,
    pendente: demands?.filter?.(d => d?.status === 'PENDENTE')?.length ?? 0,
    andamento: demands?.filter?.(d => d?.status === 'EM_ANDAMENTO')?.length ?? 0,
    resolvida: demands?.filter?.(d => d?.status === 'RESOLVIDA')?.length ?? 0,
  };

  const statCards = [
    {
      label: 'Total',
      value: stats.total,
      icon: ListChecks,
      color: '#C9A227',
      tint: 'rgba(201,162,39,0.12)',
      border: 'rgba(201,162,39,0.28)',
    },
    {
      label: 'Pendentes',
      value: stats.pendente,
      icon: AlertTriangle,
      color: STATUS_COLORS.PENDENTE,
      tint: 'rgba(239,68,68,0.10)',
      border: 'rgba(239,68,68,0.25)',
    },
    {
      label: 'Em Andamento',
      value: stats.andamento,
      icon: Clock,
      color: STATUS_COLORS.EM_ANDAMENTO,
      tint: 'rgba(33,150,243,0.10)',
      border: 'rgba(33,150,243,0.25)',
    },
    {
      label: 'Resolvidas',
      value: stats.resolvida,
      icon: CheckCircle,
      color: STATUS_COLORS.RESOLVIDA,
      tint: 'rgba(76,175,80,0.10)',
      border: 'rgba(76,175,80,0.28)',
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FileText}
        title="Demandas"
        subtitle="Gerencie as demandas do gabinete"
        actions={
          <Button onClick={() => { resetForm(); setEditingDemand(null); setShowModal(true); }}>
            <Plus className="h-5 w-5 mr-2" />
            Nova Demanda
          </Button>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {statCards.map((s, i) => (
          <StatCard
            key={s.label}
            label={s.label}
            value={s.value}
            icon={s.icon}
            color={s.color}
            delay={i * 0.05}
          />
        ))}
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Input
                placeholder="Buscar demandas..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search className="h-5 w-5" />}
              />
            </div>
            <Button variant="outline" onClick={() => setShowFilters(!showFilters)}>
              <Filter className="h-5 w-5 mr-2" />
              Filtros
            </Button>
          </div>

          {showFilters && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 pt-4 border-t"
            >
              <Select
                label="Status"
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                options={[{ value: '', label: 'Todos' }, ...statusOptions]}
              />
              <Select
                label="Categoria"
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...categoryOptions]}
              />
              <Select
                label="Prioridade"
                value={filterPriority}
                onChange={(e) => setFilterPriority(e.target.value)}
                options={[{ value: '', label: 'Todas' }, ...priorityOptions]}
              />
              <Select
                label="Estado"
                value={filterEstado}
                onChange={(e) => setFilterEstado(e.target.value)}
                options={estadoOptions}
              />
            </motion.div>
          )}
        </CardContent>
      </Card>

      {/* Demands List */}
      {loading ? (
        <LoadingState />
      ) : (demands?.length ?? 0) === 0 ? (
        <EmptyState
          icon={FileText}
          title="Nenhuma demanda encontrada"
          description="Ajuste os filtros ou cadastre uma nova demanda."
        />
      ) : (
        <div className="space-y-3">
          {demands?.map?.((demand, index) => {
            const catColor = CATEGORY_COLORS?.[demand?.category] ?? '#94A3B8';
            const statusColor = STATUS_COLORS?.[demand?.status] ?? '#94A3B8';
            const priorityColor = PRIORITY_COLORS?.[demand?.priority] ?? '#94A3B8';
            const isPending = demand?.status === 'PENDENTE';
            const isHighPriority = demand?.priority === 'ALTA';

            return (
              <motion.div
                key={demand?.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(index * 0.04, 0.3) }}
                whileHover={{ y: -2 }}
                className="group relative"
              >
                <div
                  onClick={() => handleEdit(demand)}
                  className="relative cursor-pointer rounded-xl overflow-hidden transition-all duration-300 hover:shadow-2xl"
                  style={{
                    background: '#ffffff',
                    border: '1px solid #e5eaf3',
                    ,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = `${catColor}55`;
                    e.currentTarget.style.boxShadow = `0 10px 30px -10px ${catColor}40`;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = '#f3f4f6';
                    e.currentTarget.style.boxShadow = 'none';
                  }}
                >
                  {/* Barra lateral da categoria */}
                  <div
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{
                      background: `linear-gradient(180deg, ${catColor} 0%, ${catColor}80 100%)`,
                      boxShadow: `0 0 12px ${catColor}66`,
                    }}
                  />

                  {/* Brilho sutil ao passar o mouse */}
                  <div
                    className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
                    style={{
                      background: `radial-gradient(circle at top left, ${catColor}10 0%, transparent 60%)`,
                    }}
                  />

                  <div className="relative px-5 py-4 pl-6">
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-3.5">
                          <div
                            className="p-2.5 rounded-lg flex-shrink-0 transition-transform group-hover:scale-105"
                            style={{
                              background: `${catColor}15`,
                              border: `1px solid ${catColor}35`,
                              boxShadow: `inset 0 0 12px ${catColor}10`,
                            }}
                          >
                            <FileText className="h-5 w-5" style={{ color: catColor }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              {/* Indicador de status */}
                              <span className="relative inline-flex items-center justify-center flex-shrink-0">
                                <span
                                  className="block w-2 h-2 rounded-full"
                                  style={{
                                    background: statusColor,
                                    boxShadow: `0 0 8px ${statusColor}`,
                                  }}
                                />
                                {isPending && (
                                  <span
                                    className="absolute inline-flex h-3 w-3 rounded-full opacity-60 animate-ping"
                                    style={{ background: statusColor }}
                                  />
                                )}
                              </span>
                              <h3 className="font-semibold text-gray-800 truncate text-[15px] capitalize">
                                {demand?.title}
                              </h3>
                              {isHighPriority && (
                                <Flag className="h-3.5 w-3.5 flex-shrink-0" style={{ color: priorityColor }} fill={priorityColor} />
                              )}
                            </div>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5 text-[13px] text-slate-400">
                              <span className="flex items-center gap-1.5">
                                <User className="h-3.5 w-3.5 text-slate-500" />
                                <span className="text-slate-300">{demand?.solicitante}</span>
                              </span>
                              <span className="flex items-center gap-1.5">
                                <MapPin className="h-3.5 w-3.5 text-slate-500" />
                                {demand?.municipio}, {demand?.estado}
                              </span>
                              <span className="flex items-center gap-1.5">
                                <Calendar className="h-3.5 w-3.5 text-slate-500" />
                                {new Date(demand?.createdAt)?.toLocaleDateString?.('pt-BR')}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 pl-12 lg:pl-0">
                        {/* Status */}
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border"
                          style={{
                            background: `${statusColor}15`,
                            color: statusColor,
                            borderColor: `${statusColor}40`,
                          }}
                        >
                          <CircleDot className="h-3 w-3" />
                          {STATUS_LABELS?.[demand?.status] ?? demand?.status}
                        </span>

                        {/* Prioridade */}
                        <span
                          className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border"
                          style={{
                            background: `${priorityColor}15`,
                            color: priorityColor,
                            borderColor: `${priorityColor}40`,
                          }}
                        >
                          {PRIORITY_LABELS?.[demand?.priority] ?? demand?.priority}
                        </span>

                        {/* Categoria — com cor própria */}
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold tracking-wide border"
                          style={{
                            background: `${catColor}15`,
                            color: catColor,
                            borderColor: `${catColor}40`,
                          }}
                        >
                          <span
                            className="inline-block w-1.5 h-1.5 rounded-full"
                            style={{ background: catColor, boxShadow: `0 0 6px ${catColor}` }}
                          />
                          {CATEGORY_LABELS?.[demand?.category] ?? demand?.category}
                        </span>

                        {(userRole === 'ADMIN' || userRole === 'AGENTE_POLITICO' || userRole === 'CHEFE') && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(demand?.id); }}
                            className="ml-1 p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors"
                            aria-label="Excluir demanda"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditingDemand(null); }}
        title={editingDemand ? 'Editar Demanda' : 'Nova Demanda'}
        size="lg"
        dark
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Título */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Título *</label>
            <input
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              required
              placeholder="Descreva a demanda em uma linha"
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500"
            />
          </div>

          {/* Solicitante + Contato */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Solicitante *</label>
              <input
                value={formData.solicitante}
                onChange={(e) => setFormData({ ...formData, solicitante: e.target.value })}
                required
                placeholder="Nome completo"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Contato</label>
              <input
                value={formData.contato}
                onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                placeholder="Telefone ou email"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Estado + Município + Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Estado *</label>
              <Select
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value, municipio: '' })}
                options={estadoOptions}
                placeholder="UF"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Município *</label>
              <Select
                value={formData.municipio}
                onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                options={[{ value: '', label: 'Selecione' }, ...(formMunicipios?.map?.((m) => ({ value: m.nome, label: m.nome })) ?? [])]}
                placeholder="Selecione"
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Bairro</label>
              <input
                value={formData.bairro}
                onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                placeholder="Bairro"
                className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Endereço + Geocodificar */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Endereço completo</label>
            <div className="flex gap-2 mt-1">
              <input
                value={formData.endereco}
                onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                placeholder="Rua, número, bairro"
                className="flex-1 bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500"
              />
              <button
                type="button"
                onClick={geocodeFormAddress}
                disabled={geoLoading}
                className="flex items-center gap-1.5 px-3 py-2 bg-sky-700 hover:bg-sky-600 text-white rounded-lg text-sm disabled:opacity-50 whitespace-nowrap"
              >
                {geoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                Localizar
              </button>
            </div>
            {formData.lat && formData.lng && (
              <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                <CheckCircle className="w-3 h-3" /> Localização: {formData.lat.toFixed(5)}, {formData.lng.toFixed(5)}
              </p>
            )}
          </div>

          {/* Categoria + Status + Prioridade */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Categoria</label>
              <Select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as DemandCategory })}
                options={categoryOptions}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
              <Select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as DemandStatus })}
                options={statusOptions}
                className="mt-1"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Prioridade</label>
              <Select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as DemandPriority })}
                options={priorityOptions}
                className="mt-1"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Descrição</label>
            <textarea
              rows={3}
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Detalhes da demanda..."
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500 resize-none"
            />
          </div>

          {/* Foto */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Foto (opcional)</label>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-gray-100"
              >
                <Camera className="w-4 h-4" />
                {formData.foto ? 'Trocar foto' : 'Adicionar foto'}
              </button>
              {formData.foto && (
                <div className="flex items-center gap-2">
                  <img src={formData.foto} alt="Preview" className="w-12 h-12 rounded-lg object-cover border border-white/10" />
                  <button type="button" onClick={() => setFormData((f) => ({ ...f, foto: '' }))} className="text-gray-500 hover:text-red-400">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
            <input ref={fotoInputRef} type="file" accept="image/*" onChange={handleFotoChange} className="hidden" />
          </div>

          {/* Observações */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Observações</label>
            <textarea
              rows={3}
              value={formData.observations}
              onChange={(e) => setFormData({ ...formData, observations: e.target.value })}
              className="mt-1 w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-gray-800 text-sm outline-none focus:border-sky-500 resize-none"
            />
          </div>

          {/* Botões */}
          <div className="flex justify-end gap-3 pt-4 border-t border-white/10">
            <button
              type="button"
              onClick={() => { setShowModal(false); setEditingDemand(null); }}
              className="px-4 py-2 text-gray-400 hover:text-white text-sm transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2 bg-sky-600 hover:bg-sky-500 text-white rounded-lg text-sm disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
              {editingDemand ? 'Salvar Alterações' : 'Criar Demanda'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Excluir demanda?"
        message="Esta demanda será removida permanentemente. Esta ação não pode ser desfeita."
        confirmLabel="Sim, excluir"
        variant="danger"
        onConfirm={doDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}



