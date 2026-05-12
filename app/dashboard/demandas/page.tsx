'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Modal } from '@/components/ui/modal';
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
  X
} from 'lucide-react';
import { motion } from 'framer-motion';
import {
  ESTADOS_BRASIL,
  CATEGORY_LABELS,
  STATUS_LABELS,
  PRIORITY_LABELS
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

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta demanda?')) return;

    try {
      const res = await fetch(`/api/demands/${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchDemands();
      }
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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Demandas</h1>
          <p className="text-slate-400">Gerencie as demandas do gabinete</p>
        </div>
        <Button onClick={() => { resetForm(); setEditingDemand(null); setShowModal(true); }}>
          <Plus className="h-5 w-5 mr-2" />
          Nova Demanda
        </Button>
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
        <div className="text-center py-12 text-slate-400">Carregando...</div>
      ) : (demands?.length ?? 0) === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <FileText className="h-12 w-12 text-slate-500 mx-auto mb-4" />
            <p className="text-slate-400">Nenhuma demanda encontrada</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {demands?.map?.((demand, index) => (
            <motion.div
              key={demand?.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: index * 0.05 }}
            >
              <Card hover className="cursor-pointer" onClick={() => handleEdit(demand)}>
                <CardContent>
                  <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-3">
                        <div className="p-2 bg-[#1e3a5f]/10 rounded-lg">
                          <FileText className="h-5 w-5 text-cyan-400" />
                        </div>
                        <div className="flex-1">
                          <h3 className="font-semibold text-white">{demand?.title}</h3>
                          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-slate-400">
                            <span className="flex items-center gap-1">
                              <User className="h-4 w-4" />
                              {demand?.solicitante}
                            </span>
                            <span className="flex items-center gap-1">
                              <MapPin className="h-4 w-4" />
                              {demand?.municipio}, {demand?.estado}
                            </span>
                            <span className="flex items-center gap-1">
                              <Calendar className="h-4 w-4" />
                              {new Date(demand?.createdAt)?.toLocaleDateString?.('pt-BR')}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant={demand?.status === 'RESOLVIDA' ? 'success' : demand?.status === 'EM_ANDAMENTO' ? 'info' : 'danger'}>
                        {STATUS_LABELS?.[demand?.status] ?? demand?.status}
                      </Badge>
                      <Badge variant={demand?.priority === 'ALTA' ? 'danger' : demand?.priority === 'MEDIA' ? 'warning' : 'default'}>
                        {PRIORITY_LABELS?.[demand?.priority] ?? demand?.priority}
                      </Badge>
                      <Badge>
                        {CATEGORY_LABELS?.[demand?.category] ?? demand?.category}
                      </Badge>
                      {(userRole === 'CHEFE' || userRole === 'ADMIN') && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(demand?.id); }}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
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
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500"
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
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500"
              />
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Contato</label>
              <input
                value={formData.contato}
                onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                placeholder="Telefone ou email"
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Estado + Município + Bairro */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Estado *</label>
              <select
                value={formData.estado}
                onChange={(e) => setFormData({ ...formData, estado: e.target.value, municipio: '' })}
                required
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none focus:border-sky-500"
              >
                {estadoOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0d1b2a]">{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Município *</label>
              <select
                value={formData.municipio}
                onChange={(e) => setFormData({ ...formData, municipio: e.target.value })}
                required
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none focus:border-sky-500"
              >
                <option value="" className="bg-[#0d1b2a]">Selecione</option>
                {formMunicipios?.map?.((m) => (
                  <option key={m.id} value={m.nome} className="bg-[#0d1b2a]">{m.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Bairro</label>
              <input
                value={formData.bairro}
                onChange={(e) => setFormData({ ...formData, bairro: e.target.value })}
                placeholder="Bairro"
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500"
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
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500"
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
              <select
                value={formData.category}
                onChange={(e) => setFormData({ ...formData, category: e.target.value as DemandCategory })}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none focus:border-sky-500"
              >
                {categoryOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0d1b2a]">{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Status</label>
              <select
                value={formData.status}
                onChange={(e) => setFormData({ ...formData, status: e.target.value as DemandStatus })}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none focus:border-sky-500"
              >
                {statusOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0d1b2a]">{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-400 uppercase tracking-wide">Prioridade</label>
              <select
                value={formData.priority}
                onChange={(e) => setFormData({ ...formData, priority: e.target.value as DemandPriority })}
                className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm outline-none focus:border-sky-500"
              >
                {priorityOptions.map((o) => (
                  <option key={o.value} value={o.value} className="bg-[#0d1b2a]">{o.label}</option>
                ))}
              </select>
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
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500 resize-none"
            />
          </div>

          {/* Foto */}
          <div>
            <label className="text-xs text-gray-400 uppercase tracking-wide">Foto (opcional)</label>
            <div className="mt-1 flex items-center gap-3">
              <button
                type="button"
                onClick={() => fotoInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-gray-300 hover:bg-white/10"
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
              className="mt-1 w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm outline-none focus:border-sky-500 resize-none"
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
    </div>
  );
}
