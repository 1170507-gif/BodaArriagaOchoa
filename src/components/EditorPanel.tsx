import React, { useState } from 'react';
import * as Icons from 'lucide-react';
import { WeddingConfig, DetailCardData, RsvpResponse } from '../types';
import { saveVideoToIndexedDB, clearVideoFromIndexedDB } from '../utils/indexedDB';
import { getApiUrl } from '../utils/apiUrl';

interface EditorPanelProps {
  config: WeddingConfig;
  onChangeConfig: (newConfig: WeddingConfig) => void;
  rsvps: RsvpResponse[];
  onClearRsvps: () => void;
  onResetToDefault: () => void;
  isFirebaseActive: boolean;
  onTriggerFirebaseSetup: () => void;
  localVideoUrl: string | null;
  onVideoUpload: (url: string | null) => void;
}

type TabType = 'texts' | 'style' | 'sections' | 'details' | 'images' | 'rsvps' | 'save';

export default function EditorPanel({
  config,
  onChangeConfig,
  rsvps,
  onClearRsvps,
  onResetToDefault,
  isFirebaseActive,
  onTriggerFirebaseSetup,
  localVideoUrl,
  onVideoUpload,
}: EditorPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('texts');
  const [showRsvpClearConfirm, setShowRsvpClearConfirm] = useState(false);
  const [rsvpFilter, setRsvpFilter] = useState<'all' | 'yes' | 'no'>('all');
  const [isVideoUploading, setIsVideoUploading] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldPath: string, uploadType: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingField(fieldPath);
    try {
      const arrayBuffer = await file.arrayBuffer();
      
      const response = await fetch(getApiUrl(`/api/upload-image?type=${uploadType}`), {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'image/png'
        },
        body: arrayBuffer
      });

      if (!response.ok) {
        throw new Error('Server response not ok');
      }

      const data = await response.json();
      if (data.success && data.url) {
        updateConfigField(fieldPath, data.url);
      } else {
        throw new Error(data.error || 'Invalid server response');
      }
    } catch (err) {
      console.error('Error uploading image:', err);
      alert('Error al subir la imagen al servidor. Inténtalo de nuevo.');
    } finally {
      setUploadingField(null);
    }
  };

  const [isPolaroidUploading, setIsPolaroidUploading] = useState(false);

  const handlePolaroidAdd = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsPolaroidUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const uploadId = `polaroid_${Date.now()}`;
      const response = await fetch(getApiUrl(`/api/upload-image?type=${uploadId}`), {
        method: 'POST',
        headers: {
          'Content-Type': file.type || 'image/png'
        },
        body: arrayBuffer
      });

      if (!response.ok) {
        throw new Error('Server response not ok');
      }

      const data = await response.json();
      if (data.success && data.url) {
        const currentPolaroids = config.polaroids || [];
        const newPolaroid = {
          id: uploadId,
          url: data.url,
          caption: 'Nuevo momento'
        };
        updateConfigField('polaroids', [...currentPolaroids, newPolaroid]);
      } else {
        throw new Error(data.error || 'Invalid response');
      }
    } catch (err) {
      console.error('Error uploading polaroid:', err);
      alert('Error al subir la polaroid al servidor. Inténtalo de nuevo.');
    } finally {
      setIsPolaroidUploading(false);
    }
  };

  const handlePolaroidCaptionChange = (id: string, newCaption: string) => {
    const currentPolaroids = config.polaroids || [];
    const updated = currentPolaroids.map(p => p.id === id ? { ...p, caption: newCaption } : p);
    updateConfigField('polaroids', updated);
  };

  const handlePolaroidDelete = (id: string) => {
    const currentPolaroids = config.polaroids || [];
    const updated = currentPolaroids.filter(p => p.id !== id);
    updateConfigField('polaroids', updated);
  };

  const renderImageUploader = (fieldPath: string, uploadType: string, label: string) => {
    const isUploading = uploadingField === fieldPath;
    const value = fieldPath.split('.').reduce((acc, part) => acc?.[part], config as any) || '';

    return (
      <div className="space-y-1.5">
        <label className="block text-xs text-stone-400 font-medium">{label}</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={value}
            onChange={(e) => updateConfigField(fieldPath, e.target.value)}
            placeholder="Ej: https://ejemplo.com/imagen.png"
            className="flex-1 bg-stone-800 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs"
          />
          <div className="relative shrink-0">
            <input
              type="file"
              accept="image/*"
              disabled={isUploading}
              onChange={(e) => handleImageUpload(e, fieldPath, uploadType)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
            />
            <button
              type="button"
              className={`px-3 py-1.5 text-xs rounded border flex items-center gap-1 bg-stone-800 hover:bg-stone-700 text-stone-300 transition-all ${
                isUploading ? 'border-amber-500/50 text-amber-500 animate-pulse' : 'border-stone-700 hover:border-stone-600'
              }`}
            >
              {isUploading ? (
                <>
                  <Icons.Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Cargando...</span>
                </>
              ) : (
                <>
                  <Icons.UploadCloud className="w-3.5 h-3.5" />
                  <span>Subir PNG</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const handleVideoFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsVideoUploading(true);
    try {
      await saveVideoToIndexedDB(file);
      const url = URL.createObjectURL(file);
      onVideoUpload(url);
    } catch (err) {
      console.error('Error saving video to IndexedDB:', err);
      alert('Error al guardar el video en el almacenamiento local de tu navegador. Intenta con un archivo de menor peso.');
    } finally {
      setIsVideoUploading(false);
    }
  };

  const handleClearLocalVideo = async () => {
    try {
      await clearVideoFromIndexedDB();
      if (localVideoUrl) {
        URL.revokeObjectURL(localVideoUrl);
      }
      onVideoUpload(null);
    } catch (err) {
      console.error('Error clearing local video:', err);
    }
  };

  const updateConfigField = (path: string, value: any) => {
    const keys = path.split('.');
    const updated = { ...config };
    let current: any = updated;

    for (let i = 0; i < keys.length - 1; i++) {
      current[keys[i]] = { ...current[keys[i]] };
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    onChangeConfig(updated);
  };

  const handleAddDetail = () => {
    const newDetail: DetailCardData = {
      id: `detail-${Date.now()}`,
      title: 'Nuevo Evento',
      description: '19:00 horas\nLugar del evento\nDetalles adicionales',
      icon: 'Calendar',
    };
    onChangeConfig({
      ...config,
      details: [...config.details, newDetail],
    });
  };

  const handleUpdateDetail = (index: number, updatedDetail: DetailCardData) => {
    const updatedDetails = [...config.details];
    updatedDetails[index] = updatedDetail;
    onChangeConfig({
      ...config,
      details: updatedDetails,
    });
  };

  const handleDeleteDetail = (index: number) => {
    const updatedDetails = config.details.filter((_, i) => i !== index);
    onChangeConfig({
      ...config,
      details: updatedDetails,
    });
  };

  const availableIcons = [
    { name: 'Clock', label: 'Reloj / Hora' },
    { name: 'GlassWater', label: 'Copa / Recepción' },
    { name: 'Shirt', label: 'Código Vestimenta' },
    { name: 'MapPin', label: 'Ubicación' },
    { name: 'Calendar', label: 'Calendario / Fecha' },
    { name: 'Heart', label: 'Corazón' },
    { name: 'Gift', label: 'Regalo / Mesa' },
    { name: 'Music', label: 'Música' },
    { name: 'Camera', label: 'Fotos' },
    { name: 'Sparkles', label: 'Fuegos / Brillo' },
    { name: 'Plane', label: 'Viaje / Vuelos' },
    { name: 'Utensils', label: 'Catering / Cena' },
  ];

  const handleExportJson = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(config, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", `invitacion-boda-${config.coupleName1}-${config.coupleName2}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleCopyJson = () => {
    navigator.clipboard.writeText(JSON.stringify(config, null, 2));
    alert('Configuración copiada al portapapeles!');
  };

  const filteredRsvps = rsvps.filter(r => {
    if (rsvpFilter === 'all') return true;
    return r.attending === rsvpFilter;
  });

  const totalAttendingGuests = rsvps
    .filter(r => r.attending === 'yes')
    .reduce((sum, r) => sum + r.guestsCount, 0);

  return (
    <div className="w-full h-full bg-stone-900 text-stone-200 flex flex-col border-r border-stone-800 shadow-2xl overflow-hidden select-none">
      {/* Panel Title */}
      <div className="p-4 border-b border-stone-800 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Icons.Wand2 className="w-5 h-5 text-amber-400 shrink-0" />
          <h2 className="font-semibold text-stone-100 text-sm tracking-wide">Personalizar Invitación</h2>
        </div>
        <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded-full font-medium">
          Creador de Boda
        </span>
      </div>

      {/* Firebase Cloud Alert Banner */}
      {!isFirebaseActive && (
        <div className="p-3 bg-amber-500/10 border-b border-amber-500/20 text-xs text-amber-300 flex flex-col gap-2 shrink-0">
          <p className="font-light">
            <strong>Modo Local:</strong> Tus cambios se guardan solo en tu navegador. Activa la base de datos para guardar tus cambios en la nube y recibir confirmaciones RSVP reales de tus invitados.
          </p>
          <button
            onClick={onTriggerFirebaseSetup}
            className="w-full bg-amber-500 hover:bg-amber-600 text-stone-950 font-medium py-1.5 px-3 rounded-md flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <Icons.Database className="w-3.5 h-3.5" /> Activar Conexión en la Nube
          </button>
        </div>
      )}

      {isFirebaseActive && (
        <div className="p-2.5 bg-emerald-500/10 border-b border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-2 shrink-0">
          <Icons.CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 animate-pulse" />
          <span>¡Servicio de Nube Activo! Las confirmaciones y el diseño se sincronizan en tiempo real.</span>
        </div>
      )}

      {/* Tabs list (Horizontal scrolls on small width) */}
      <div className="flex bg-stone-950 border-b border-stone-800 overflow-x-auto scrollbar-none shrink-0 text-xs">
        <button
          onClick={() => setActiveTab('texts')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'texts' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Contenido
        </button>
        <button
          onClick={() => setActiveTab('style')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'style' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Diseño y Colores
        </button>
        <button
          onClick={() => setActiveTab('details')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'details' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Eventos / Detalle
        </button>
        <button
          onClick={() => setActiveTab('sections')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'sections' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Secciones
        </button>
        <button
          onClick={() => setActiveTab('images')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'images' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Imágenes
        </button>
        <button
          onClick={() => setActiveTab('rsvps')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 flex items-center gap-1 ${
            activeTab === 'rsvps' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Asistencias ({rsvps.length})
        </button>
        <button
          onClick={() => setActiveTab('save')}
          className={`px-4 py-3 font-medium transition-colors cursor-pointer border-b-2 shrink-0 ${
            activeTab === 'save' ? 'text-amber-400 border-amber-400 bg-stone-900/30' : 'text-stone-400 border-transparent hover:text-stone-200'
          }`}
        >
          Guardar
        </button>
      </div>

      {/* Editor Content Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5 text-sm font-light">
        {/* ------ TEXTS TAB ------ */}
        {activeTab === 'texts' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Nombres de la Pareja</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Nombre Novio/a 1</label>
                  <input
                    type="text"
                    value={config.coupleName1}
                    onChange={(e) => updateConfigField('coupleName1', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Nombre Novio/a 2</label>
                  <input
                    type="text"
                    value={config.coupleName2}
                    onChange={(e) => updateConfigField('coupleName2', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs"
                  />
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-stone-400 mb-1">Invitación / Subtítulo</label>
              <textarea
                value={config.subtitle}
                onChange={(e) => updateConfigField('subtitle', e.target.value)}
                rows={2}
                placeholder="Ej: Te invitamos a celebrar nuestra unión..."
                className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs resize-none"
              />
            </div>

            <div className="border-t border-stone-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Fecha y Lugar</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Fecha de la Boda (para la Cuenta Regresiva)</label>
                  <input
                    type="datetime-local"
                    value={config.dateIso.substring(0, 16)}
                    onChange={(e) => updateConfigField('dateIso', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs"
                  />
                </div>

                <div>
                  <label className="block text-xs text-stone-400 mb-1">Fecha Literal (como aparecerá en la tarjeta)</label>
                  <textarea
                    value={config.dateText}
                    onChange={(e) => updateConfigField('dateText', e.target.value)}
                    rows={2}
                    placeholder="Ej: Viernes, quince de agosto de dos mil veinticinco..."
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs resize-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Lugar Corto (Cinta superior)</label>
                    <input
                      type="text"
                      value={config.locationName}
                      onChange={(e) => updateConfigField('locationName', e.target.value)}
                      placeholder="Ej: Toscana, Italia"
                      className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-400 mb-1">Lugar Largo (Tarjeta)</label>
                    <textarea
                      value={config.locationText}
                      onChange={(e) => updateConfigField('locationText', e.target.value)}
                      rows={2}
                      placeholder="Ej: Villa Cora, Toscana, Italia"
                      className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs resize-none"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-stone-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Portada (Overlay)</h3>
              <div>
                <label className="block text-xs text-stone-400 mb-1">Texto del Botón de Entrada</label>
                <input
                  type="text"
                  value={config.overlayOpenText}
                  onChange={(e) => updateConfigField('overlayOpenText', e.target.value)}
                  className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs"
                />
              </div>
            </div>

            <div className="border-t border-stone-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Música de Fondo</h3>
              <div>
                <label className="block text-xs text-stone-400 mb-1">URL del Archivo de Audio MP3 (Dropbox/Directo)</label>
                <input
                  type="text"
                  value={config.musicUrl}
                  onChange={(e) => updateConfigField('musicUrl', e.target.value)}
                  placeholder="https://ejemplo.com/musica.mp3"
                  className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs"
                />
              </div>
            </div>
          </div>
        )}

        {/* ------ STYLE TAB ------ */}
        {activeTab === 'style' && (
          <div className="space-y-4">
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Paleta de Colores</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="flex items-center gap-2 bg-stone-800/50 p-2 rounded border border-stone-800">
                  <input
                    type="color"
                    value={config.theme.bg}
                    onChange={(e) => updateConfigField('theme.bg', e.target.value)}
                    className="w-8 h-8 rounded border-0 cursor-pointer"
                  />
                  <div>
                    <label className="block text-[10px] text-stone-400">Color de Fondo</label>
                    <span className="text-xs font-mono">{config.theme.bg}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-stone-800/50 p-2 rounded border border-stone-800">
                  <input
                    type="color"
                    value={config.theme.text}
                    onChange={(e) => updateConfigField('theme.text', e.target.value)}
                    className="w-8 h-8 rounded border-0 cursor-pointer"
                  />
                  <div>
                    <label className="block text-[10px] text-stone-400">Texto Principal</label>
                    <span className="text-xs font-mono">{config.theme.text}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-stone-800/50 p-2 rounded border border-stone-800">
                  <input
                    type="color"
                    value={config.theme.textDark}
                    onChange={(e) => updateConfigField('theme.textDark', e.target.value)}
                    className="w-8 h-8 rounded border-0 cursor-pointer"
                  />
                  <div>
                    <label className="block text-[10px] text-stone-400">Texto Oscuro</label>
                    <span className="text-xs font-mono">{config.theme.textDark}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-stone-800/50 p-2 rounded border border-stone-800">
                  <input
                    type="color"
                    value={config.theme.accent}
                    onChange={(e) => updateConfigField('theme.accent', e.target.value)}
                    className="w-8 h-8 rounded border-0 cursor-pointer"
                  />
                  <div>
                    <label className="block text-[10px] text-stone-400">Color de Acento</label>
                    <span className="text-xs font-mono">{config.theme.accent}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 bg-stone-800/50 p-2 rounded border border-stone-800 col-span-2">
                  <input
                    type="color"
                    value={config.theme.border}
                    onChange={(e) => updateConfigField('theme.border', e.target.value)}
                    className="w-8 h-8 rounded border-0 cursor-pointer"
                  />
                  <div>
                    <label className="block text-[10px] text-stone-400">Color de Bordes y Divisor Floral</label>
                    <span className="text-xs font-mono">{config.theme.border}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="border-t border-stone-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Tipografías (Elegantes Google Fonts)</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Fuentes de Títulos y Nombres</label>
                  <select
                    value={config.theme.fontTitle}
                    onChange={(e) => updateConfigField('theme.fontTitle', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                  >
                    <option value="playfair">Playfair Display (Serif Elegante)</option>
                    <option value="cormorant">Cormorant Garamond (Serif Clásico)</option>
                    <option value="cinzel">Cinzel (Imperial Romano)</option>
                    <option value="great-vibes">Great Vibes (Caligrafía Romantic / Script)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-stone-400 mb-1">Fuentes de Cuerpo e Info</label>
                  <select
                    value={config.theme.fontBody}
                    onChange={(e) => updateConfigField('theme.fontBody', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                  >
                    <option value="montserrat">Montserrat (Slab Moderno)</option>
                    <option value="inter">Inter (Sans-Serif Limpio)</option>
                    <option value="lato">Lato (Legible y Suave)</option>
                  </select>
                </div>
              </div>
            </div>

            <div className="border-t border-stone-800 pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Diseño de la Tarjeta</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-400 mb-1">Borde de Tarjeta</label>
                  <select
                    value={config.theme.cardBorderWidth}
                    onChange={(e) => updateConfigField('theme.cardBorderWidth', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                  >
                    <option value="1px">Fino (1px)</option>
                    <option value="2px">Estándar (2px)</option>
                    <option value="4px">Grueso (4px)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs text-stone-400 mb-1">Borde Redondeado</label>
                  <select
                    value={config.theme.cardBorderRadius}
                    onChange={(e) => updateConfigField('theme.cardBorderRadius', e.target.value)}
                    className="w-full bg-stone-800 border border-stone-700 rounded px-3 py-2 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                  >
                    <option value="0px">Recto (0px)</option>
                    <option value="12px">Suave (12px)</option>
                    <option value="24px">Elegante (24px)</option>
                    <option value="40px">Curvado (40px)</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs text-stone-400 mb-1">Espaciado Interior (Multiplicador: {config.theme.paddingMultiplier}x)</label>
                  <input
                    type="range"
                    min="0.7"
                    max="1.3"
                    step="0.1"
                    value={config.theme.paddingMultiplier}
                    onChange={(e) => updateConfigField('theme.paddingMultiplier', parseFloat(e.target.value))}
                    className="w-full accent-amber-400"
                  />
                  <div className="flex justify-between text-[10px] text-stone-500 mt-1">
                    <span>Compacto</span>
                    <span>Estándar</span>
                    <span>Espacioso</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------ EVENTS / DETAILS TAB ------ */}
        {activeTab === 'details' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Tarjetas de Eventos</h3>
              <button
                onClick={handleAddDetail}
                className="bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded text-xs flex items-center gap-1 cursor-pointer transition-all"
              >
                <Icons.Plus className="w-3 h-3" /> Agregar Evento
              </button>
            </div>

            {config.details.length === 0 ? (
              <p className="text-xs text-stone-500 italic text-center py-4 bg-stone-850 rounded border border-dashed border-stone-800">
                No hay tarjetas de detalles. Agrega una arriba.
              </p>
            ) : (
              <div className="space-y-3">
                {config.details.map((detail, index) => (
                  <div key={detail.id} className="p-3 bg-stone-800/40 rounded border border-stone-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-medium text-stone-400">Evento #{index + 1}</span>
                      <button
                        onClick={() => handleDeleteDetail(index)}
                        className="text-red-400 hover:text-red-300 p-1 cursor-pointer"
                        title="Eliminar evento"
                      >
                        <Icons.Trash className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] text-stone-500 mb-0.5">Título</label>
                        <input
                          type="text"
                          value={detail.title}
                          onChange={(e) => handleUpdateDetail(index, { ...detail, title: e.target.value })}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 outline-none focus:border-amber-400 text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] text-stone-500 mb-0.5">Icono</label>
                        <select
                          value={detail.icon}
                          onChange={(e) => handleUpdateDetail(index, { ...detail, icon: e.target.value })}
                          className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                        >
                          {availableIcons.map(ic => (
                            <option key={ic.name} value={ic.name}>{ic.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] text-stone-500 mb-0.5">Descripción (Soporta saltos de línea)</label>
                      <textarea
                        value={detail.description}
                        onChange={(e) => handleUpdateDetail(index, { ...detail, description: e.target.value })}
                        rows={3}
                        className="w-full bg-stone-800 border border-stone-700 rounded px-2 py-1 text-stone-100 outline-none focus:border-amber-400 text-xs resize-none"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------ SECTIONS TAB ------ */}
        {activeTab === 'sections' && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-3">Activar/Desactivar Secciones</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 bg-stone-800/40 rounded border border-stone-800">
                <div>
                  <span className="block text-xs font-medium text-stone-200">Pantalla de Apertura (Overlay)</span>
                  <span className="text-[10px] text-stone-500">Muestra las cortinas florales en móvil antes de abrir.</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.sections.showOverlay}
                  onChange={(e) => updateConfigField('sections.showOverlay', e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer accent-amber-400"
                />
              </div>

              <div className="flex flex-col p-3 bg-stone-800/40 rounded border border-stone-800 gap-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-medium text-stone-200">Cuenta Regresiva (Countdown)</span>
                    <span className="text-[10px] text-stone-500">Muestra los días, horas y minutos restantes.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.sections.showCountdown}
                    onChange={(e) => updateConfigField('sections.showCountdown', e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer accent-amber-400"
                  />
                </div>

                {config.sections.showCountdown && (
                  <div className="space-y-3 pl-3 border-l-2 border-amber-500/30 mt-1">
                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Fecha y Hora de la Boda</label>
                      <input
                        type="datetime-local"
                        value={config.dateIso ? config.dateIso.substring(0, 16) : ''}
                        onChange={(e) => updateConfigField('dateIso', e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Tamaño de la Cuenta Regresiva</label>
                      <select
                        value={config.countdownScale || 1.0}
                        onChange={(e) => updateConfigField('countdownScale', Number(e.target.value))}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                      >
                        <option value="0.7">Muy Pequeño (0.7x)</option>
                        <option value="0.85">Pequeño (0.85x)</option>
                        <option value="1.0">Normal (1.0x)</option>
                        <option value="1.2">Grande (1.2x)</option>
                        <option value="1.4">Muy Grande (1.4x)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Formato de Cuenta Regresiva</label>
                      <select
                        value={config.countdownFormat || 'full'}
                        onChange={(e) => updateConfigField('countdownFormat', e.target.value)}
                        className="w-full bg-stone-900 border border-stone-700 rounded px-2 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                      >
                        <option value="full">Días, Horas, Minutos, Segundos (Completo)</option>
                        <option value="short">D, H, M, S (Abreviado)</option>
                        <option value="days-hours">Solo Días y Horas</option>
                        <option value="days">Solo Días</option>
                      </select>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-800/40 rounded border border-stone-800">
                <div>
                  <span className="block text-xs font-medium text-stone-200">Detalles de Eventos (Cards)</span>
                  <span className="text-[10px] text-stone-500">Muestra ceremonias, código de vestimenta, etc.</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.sections.showDetails}
                  onChange={(e) => updateConfigField('sections.showDetails', e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer accent-amber-400"
                />
              </div>

              <div className="flex items-center justify-between p-3 bg-stone-800/40 rounded border border-stone-800">
                <div>
                  <span className="block text-xs font-medium text-stone-200">Formulario RSVP</span>
                  <span className="text-[10px] text-stone-500">Permite a los invitados confirmar su asistencia.</span>
                </div>
                <input
                  type="checkbox"
                  checked={config.sections.showRsvp}
                  onChange={(e) => updateConfigField('sections.showRsvp', e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer accent-amber-400"
                />
              </div>

              {/* Sección de Video */}
              <div className="p-3 bg-stone-800/40 rounded border border-stone-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="block text-xs font-medium text-stone-200">Sección de Video</span>
                    <span className="text-[10px] text-stone-500">Muestra un video de la boda en la parte superior.</span>
                  </div>
                  <input
                    type="checkbox"
                    checked={config.sections.showVideo}
                    onChange={(e) => updateConfigField('sections.showVideo', e.target.checked)}
                    className="w-4 h-4 rounded cursor-pointer accent-amber-400"
                  />
                </div>

                {config.sections.showVideo && (
                  <div className="space-y-3 border-t border-stone-800/60 pt-2.5">
                    {/* Subir Video Local */}
                    <div className="bg-stone-900/60 p-2.5 rounded border border-stone-800/80 space-y-2">
                      <span className="block text-[10px] font-medium text-stone-300 uppercase tracking-wider">Subir Video Personal</span>
                      
                      {localVideoUrl ? (
                        <div className="space-y-2">
                          <div className="flex items-center gap-2 text-[10px] text-emerald-400 bg-emerald-500/10 p-2 rounded border border-emerald-500/20">
                            <Icons.CheckCircle className="w-3.5 h-3.5 shrink-0" />
                            <span>¡Video personal cargado y guardado en tu navegador!</span>
                          </div>
                          <button
                            onClick={handleClearLocalVideo}
                            className="w-full bg-red-950/40 hover:bg-red-900/40 border border-red-900/50 text-red-300 rounded py-1.5 px-3 text-[10px] font-medium transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <Icons.Trash className="w-3 h-3" />
                            <span>Eliminar Video de mi Navegador</span>
                          </button>
                        </div>
                      ) : (
                        <div>
                          <label
                            htmlFor="video-upload"
                            className="w-full bg-amber-500/10 hover:bg-amber-500/20 border border-dashed border-amber-500/40 text-amber-400 rounded py-2.5 px-3 text-[10px] font-semibold transition-all flex flex-col items-center justify-center gap-1.5 cursor-pointer text-center"
                          >
                            <Icons.UploadCloud className="w-5 h-5 animate-pulse text-amber-300" />
                            <span>{isVideoUploading ? 'Guardando en navegador...' : 'Haz clic para seleccionar tu video'}</span>
                          </label>
                          <input
                            id="video-upload"
                            type="file"
                            accept="video/*"
                            onChange={handleVideoFileChange}
                            className="hidden"
                            disabled={isVideoUploading}
                          />
                          <p className="text-[9px] text-stone-500 mt-1.5 leading-normal text-center">
                            Selecciona el archivo de video que subiste al chat para verlo reproduciéndose en tiempo real dentro de tu invitación.
                          </p>
                        </div>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">O usar una URL de video externa</label>
                      <input
                        type="text"
                        value={config.videoUrl || ''}
                        onChange={(e) => updateConfigField('videoUrl', e.target.value)}
                        placeholder="https://ejemplo.com/video.mp4"
                        className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] text-stone-400 mb-1">Relación de Aspecto</label>
                      <select
                        value={config.videoAspectRatio || '9:16'}
                        onChange={(e) => updateConfigField('videoAspectRatio', e.target.value)}
                        className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs cursor-pointer"
                      >
                        <option value="9:16">Vertical (9:16)</option>
                        <option value="16:9">Horizontal (16:9)</option>
                        <option value="1:1">Cuadrado (1:1)</option>
                      </select>
                    </div>

                    <div className="border-t border-stone-800/60 pt-3 mt-2 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="block text-[11px] font-medium text-stone-300">Mostrar Texto sobre el Video</span>
                        <input
                          type="checkbox"
                          checked={config.showVideoTextOverlay !== false}
                          onChange={(e) => updateConfigField('showVideoTextOverlay', e.target.checked)}
                          className="w-4 h-4 rounded cursor-pointer accent-amber-400"
                        />
                      </div>

                      {config.showVideoTextOverlay !== false && (
                        <div className="space-y-3 bg-stone-900/40 p-2.5 rounded border border-stone-800/60">
                          <div>
                            <label className="block text-[10px] text-stone-400 mb-1">Frase / Cita (Cielo)</label>
                            <textarea
                              value={config.videoTextPhrase || ''}
                              onChange={(e) => updateConfigField('videoTextPhrase', e.target.value)}
                              rows={2}
                              className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs resize-none"
                              placeholder="Escribe la frase de introducción de la boda..."
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-stone-400 mb-1">Nombres de los Novios</label>
                            <input
                              type="text"
                              value={config.videoTextNames || ''}
                              onChange={(e) => updateConfigField('videoTextNames', e.target.value)}
                              className="w-full bg-stone-800 border border-stone-700 rounded px-2.5 py-1.5 text-stone-100 outline-none focus:border-amber-400 text-xs"
                              placeholder="Ej: Alejandro & Alejandra"
                            />
                          </div>

                          <div>
                            <label className="block text-[10px] text-stone-400 mb-1">Posición Vertical: {config.videoTextOverlayY ?? 25}%</label>
                            <input
                              type="range"
                              min="5"
                              max="95"
                              value={config.videoTextOverlayY ?? 25}
                              onChange={(e) => updateConfigField('videoTextOverlayY', parseInt(e.target.value))}
                              className="w-full accent-amber-400"
                            />
                            <p className="text-[9px] text-stone-500 mt-0.5 leading-normal">
                              Desliza para mover verticalmente hacia el cielo o centro del video. ¡También puedes arrastrar el texto directamente en la pantalla de la invitación!
                            </p>
                          </div>

                          <div>
                            <label className="block text-[10px] text-stone-400 mb-1">Tamaño del Texto (Escala): {config.videoTextOverlayScale ?? 1.0}x</label>
                            <input
                              type="range"
                              min="0.6"
                              max="1.8"
                              step="0.05"
                              value={config.videoTextOverlayScale ?? 1.0}
                              onChange={(e) => updateConfigField('videoTextOverlayScale', parseFloat(e.target.value))}
                              className="w-full accent-amber-400"
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ------ IMAGES TAB ------ */}
        {activeTab === 'images' && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Imágenes de la Invitación</h3>
            <p className="text-[10px] text-stone-500 leading-normal mb-3">
              Puedes ingresar una URL de imagen externa o presionar <strong>"Subir PNG"</strong> para subir un archivo directamente desde tu computadora o celular. Las imágenes se guardarán de forma local y nativa en el servidor.
            </p>

            <div className="space-y-4">
              <div>
                <span className="block text-[11px] font-semibold uppercase text-stone-400 mb-3 border-b border-stone-800 pb-1.5">Fotografías Principales</span>
                <div className="space-y-3">
                  {renderImageUploader('images.portrait', 'portrait', 'Foto Principal (Retrato con Arco)')}
                  {renderImageUploader('images.overlayCenter', 'overlayCenter', 'Foto del Círculo Central en Portada')}
                </div>
              </div>

              <div className="border-t border-stone-800 pt-3">
                <span className="block text-[11px] font-semibold uppercase text-stone-400 mb-2 border-b border-stone-800 pb-1.5 flex justify-between items-center">
                  <span>Galería de Polaroids</span>
                  <label className="text-[9px] uppercase bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 rounded px-2 py-0.5 cursor-pointer transition-all">
                    {isPolaroidUploading ? 'Subiendo...' : '+ Agregar Polaroid'}
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePolaroidAdd}
                      className="hidden"
                      disabled={isPolaroidUploading}
                    />
                  </label>
                </span>
                <p className="text-[9px] text-stone-500 leading-normal mb-3">
                  Sube fotografías tipo Polaroid que aparecerán con un marco clásico y letra manuscrita. Puedes desplazar el carrusel hacia la derecha y personalizar cada pie de foto.
                </p>

                <div className="space-y-2.5 max-h-[220px] overflow-y-auto pr-1">
                  {(config.polaroids || []).map((p) => (
                    <div key={p.id} className="flex gap-2 items-center bg-stone-900/40 p-2 rounded border border-stone-800">
                      <div className="w-10 h-10 rounded overflow-hidden shrink-0 bg-stone-850">
                        <img src={p.url} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={p.caption || ''}
                          onChange={(e) => handlePolaroidCaptionChange(p.id, e.target.value)}
                          placeholder="Pie de foto (ej: El día del Sí)"
                          className="w-full bg-stone-850 border border-stone-750 rounded px-2 py-1 text-stone-200 text-[11px] outline-none focus:border-amber-400"
                        />
                      </div>
                      <button
                        onClick={() => handlePolaroidDelete(p.id)}
                        className="p-1.5 text-stone-500 hover:text-red-400 hover:bg-stone-800 rounded transition-colors"
                        title="Eliminar Polaroid"
                      >
                        <Icons.Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                  {(config.polaroids || []).length === 0 && (
                    <p className="text-[10px] text-stone-500 italic text-center py-4">No hay fotos de Polaroid agregadas aún.</p>
                  )}
                </div>
              </div>

              <div className="border-t border-stone-800 pt-3">
                <span className="block text-[11px] font-semibold uppercase text-stone-400 mb-3 border-b border-stone-800 pb-1.5">Adornos de las Secciones (Decorativos PNG)</span>
                <div className="space-y-3">
                  {renderImageUploader('images.floralDivider', 'floralDivider', 'Adorno / Separador Floral General (Reemplaza divisor SVG)')}
                  {renderImageUploader('images.countdownHeader', 'countdownHeader', 'Cabecera de Cuenta Regresiva (Countdown PNG)')}
                  {renderImageUploader('images.detailsHeader', 'detailsHeader', 'Cabecera de Eventos / Detalles (Details PNG)')}
                  {renderImageUploader('images.rsvpHeader', 'rsvpHeader', 'Cabecera de Confirmación (RSVP PNG)')}
                </div>
              </div>

              <div className="border-t border-stone-800 pt-3">
                <span className="block text-[11px] font-semibold uppercase text-stone-400 mb-3 border-b border-stone-800 pb-1.5">Cortinas de la Portada (Polígonos PNG)</span>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {renderImageUploader('images.overlayLeft', 'overlayLeft', 'Cortina Izquierda')}
                  {renderImageUploader('images.overlayRight', 'overlayRight', 'Cortina Derecha')}
                  {renderImageUploader('images.overlayTop', 'overlayTop', 'Cortina Superior')}
                  {renderImageUploader('images.overlayBottom', 'overlayBottom', 'Cortina Inferior')}
                </div>
              </div>

              <div className="border-t border-stone-800 pt-3">
                <span className="block text-[11px] font-semibold uppercase text-stone-400 mb-3 border-b border-stone-800 pb-1.5">Elementos del Final (RSVP & Cierre)</span>
                <div className="space-y-3">
                  {renderImageUploader('blurredPhotoUrl', 'blurred_photo', 'Foto Final Difuminada / Desenfocada')}
                  {renderImageUploader('bottomLogoUrl', 'bottom_logo', 'Logo Oficial de la Pareja para el Cierre')}
                  
                  <div>
                    <label className="block text-[10px] uppercase text-stone-400 font-medium mb-1">
                      Enlace o Detalles de la Web Oficial
                    </label>
                    <input
                      type="text"
                      value={config.weddingWebsiteUrl || ''}
                      onChange={(e) => updateConfigField('weddingWebsiteUrl', e.target.value)}
                      placeholder="Ej: www.nuestra-boda.com"
                      className="w-full bg-stone-900 border border-stone-800 rounded px-2.5 py-1.5 text-stone-200 text-xs outline-none focus:border-amber-400"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ------ RSVPS ADMIN TAB ------ */}
        {activeTab === 'rsvps' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Panel de Respuestas (RSVP)</h3>
                <p className="text-[10px] text-stone-500 mt-0.5">Asistentes confirmados: <strong className="text-amber-400">{totalAttendingGuests}</strong></p>
              </div>
              <button
                onClick={() => setShowRsvpClearConfirm(true)}
                className="text-[10px] bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30 px-2 py-1 rounded cursor-pointer transition-all"
              >
                Limpiar todo
              </button>
            </div>

            {/* Confirm Clear Modals */}
            {showRsvpClearConfirm && (
              <div className="p-3 bg-red-950/40 border border-red-800/50 rounded-lg text-xs space-y-2">
                <p className="text-red-300 font-light">¿Estás seguro de que quieres borrar todas las confirmaciones? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setShowRsvpClearConfirm(false)}
                    className="px-2 py-1 bg-stone-800 hover:bg-stone-700 rounded text-stone-300 cursor-pointer text-[10px]"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={() => {
                      onClearRsvps();
                      setShowRsvpClearConfirm(false);
                    }}
                    className="px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded cursor-pointer text-[10px]"
                  >
                    Sí, borrar
                  </button>
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-1.5 bg-stone-950 p-1 rounded-lg border border-stone-850 text-xs">
              <button
                onClick={() => setRsvpFilter('all')}
                className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-all cursor-pointer ${rsvpFilter === 'all' ? 'bg-amber-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'}`}
              >
                Todos ({rsvps.length})
              </button>
              <button
                onClick={() => setRsvpFilter('yes')}
                className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-all cursor-pointer ${rsvpFilter === 'yes' ? 'bg-emerald-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'}`}
              >
                Asistirá ({rsvps.filter(r => r.attending === 'yes').length})
              </button>
              <button
                onClick={() => setRsvpFilter('no')}
                className={`flex-1 py-1 px-2 rounded-md font-medium text-center transition-all cursor-pointer ${rsvpFilter === 'no' ? 'bg-rose-500 text-stone-950' : 'text-stone-400 hover:text-stone-200'}`}
              >
                No asistirá ({rsvps.filter(r => r.attending === 'no').length})
              </button>
            </div>

            {/* Guest list */}
            {filteredRsvps.length === 0 ? (
              <p className="text-xs text-stone-500 italic text-center py-6 bg-stone-850 rounded border border-stone-800">
                Ninguna confirmación que coincida.
              </p>
            ) : (
              <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                {filteredRsvps.map((rsvp) => (
                  <div key={rsvp.id} className="p-3 bg-stone-950 border border-stone-850 rounded-lg space-y-1 text-xs">
                    <div className="flex items-center justify-between">
                      <strong className="text-stone-200 text-sm">{rsvp.fullName}</strong>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-semibold ${
                        rsvp.attending === 'yes' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                      }`}>
                        {rsvp.attending === 'yes' ? `Asiste (${rsvp.guestsCount})` : 'No asiste'}
                      </span>
                    </div>
                    <div className="text-[11px] text-stone-400 flex items-center gap-1">
                      <Icons.Phone className="w-3.5 h-3.5 shrink-0" />
                      <span>{rsvp.phone || (rsvp as any).email || 'Sin teléfono'}</span>
                    </div>
                    {rsvp.notes && (
                      <div className="text-[11px] text-stone-500 italic bg-stone-900 p-1.5 rounded border border-stone-850 mt-1.5 whitespace-pre-line">
                        "{rsvp.notes}"
                      </div>
                    )}
                    <div className="text-[9px] text-stone-600 text-right mt-1">
                      {new Date(rsvp.submittedAt).toLocaleString('es-ES')}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ------ SAVE / EXPORT TAB ------ */}
        {activeTab === 'save' && (
          <div className="space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400 mb-2">Exportar y Respaldar</h3>
            <p className="text-xs text-stone-500 leading-normal mb-3">
              Puedes descargar la configuración en un archivo para importarla de nuevo, o copiar el código JSON de tu diseño.
            </p>

            <div className="space-y-2">
              <button
                onClick={handleExportJson}
                className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 border border-stone-700 cursor-pointer transition-all text-xs"
              >
                <Icons.Download className="w-4 h-4 text-amber-400" /> Descargar Diseño (.json)
              </button>

              <button
                onClick={handleCopyJson}
                className="w-full bg-stone-800 hover:bg-stone-700 text-stone-200 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 border border-stone-700 cursor-pointer transition-all text-xs"
              >
                <Icons.Copy className="w-4 h-4 text-amber-400" /> Copiar Código JSON del Diseño
              </button>
            </div>

            <div className="border-t border-stone-800 pt-4 mt-4 space-y-3">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-amber-400">Valores Originales</h3>
                <p className="text-[11px] text-stone-500 mt-0.5 leading-normal">
                  ¿Quieres volver a empezar? Restablece la invitación a los valores por defecto (Alexander & Sophia con el estilo original).
                </p>
              </div>

              <button
                onClick={() => {
                  if (confirm('¿Estás seguro de que deseas restablecer el diseño original? Se perderán los cambios de estilo no respaldados.')) {
                    onResetToDefault();
                  }
                }}
                className="w-full bg-red-950/20 hover:bg-red-950/40 text-red-300 border border-red-900/40 py-2.5 px-4 rounded-lg flex items-center justify-center gap-2 cursor-pointer transition-all text-xs"
              >
                <Icons.RotateCcw className="w-4 h-4 text-red-400" /> Restablecer Valores Originales
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Editor Panel Footer */}
      <div className="p-3 bg-stone-950 border-t border-stone-800 text-[10px] text-stone-500 text-center shrink-0">
        Hecho para Alexander & Sophia — Diseñador de Bodas v1.0
      </div>
    </div>
  );
}
