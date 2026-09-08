import React, { useState, useMemo, useRef } from 'react';
import * as Icons from 'lucide-react';
import { Guest, RsvpResponse, WeddingConfig } from '../types';
import { getApiUrl } from '../utils/apiUrl';

interface ConfirmedGuestItem {
  sourceId: string;
  sourceType: 'guest' | 'rsvp';
  name: string;
  phone?: string;
  passes: number;
  notes?: string;
  firstConfirmedAt?: string;
  secondConfirmation: 'yes' | 'no' | 'pending';
  secondConfirmedAt?: string;
  guestCode?: string;
}

interface SecondConfirmationTabProps {
  guests: Guest[];
  rsvps: RsvpResponse[];
  config: WeddingConfig;
  onConfigChange: (newConfig: WeddingConfig) => void;
  onUpdateGuestSecondConfirmation: (guestId: string, status: 'yes' | 'no' | 'pending') => Promise<void>;
  onUpdateRsvpSecondConfirmation: (rsvpId: string, status: 'yes' | 'no' | 'pending') => Promise<void>;
  onReload: () => void;
  isLoading?: boolean;
}

export default function SecondConfirmationTab({
  guests,
  rsvps,
  config,
  onConfigChange,
  onUpdateGuestSecondConfirmation,
  onUpdateRsvpSecondConfirmation,
  onReload,
  isLoading = false,
}: SecondConfirmationTabProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'yes' | 'no' | 'pending'>('all');
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(config.secondConfirmationDeadline || '12 de septiembre');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Unified list of confirmed guests
  const confirmedList: ConfirmedGuestItem[] = useMemo(() => {
    const list: ConfirmedGuestItem[] = [];
    const processedNames = new Set<string>();

    // 1. First add from registered guest list if confirmed attending
    for (const g of guests) {
      // If confirmed attending, or if confirmed is true and not attending === 'no'
      const isAttending = g.confirmed && g.attending !== 'no';
      if (isAttending) {
        // Find if there is an RSVP response matching this guest to pull phone/notes
        const matchingRsvp = rsvps.find(
          (r) => r.fullName.trim().toLowerCase() === g.name.trim().toLowerCase()
        );

        list.push({
          sourceId: g.id,
          sourceType: 'guest',
          name: g.name,
          phone: matchingRsvp?.phone,
          passes: g.guestsCount ?? (matchingRsvp?.guestsCount ?? (g.maxGuests || 1)),
          notes: g.notes || matchingRsvp?.notes,
          firstConfirmedAt: g.submittedAt || matchingRsvp?.submittedAt,
          secondConfirmation: g.secondConfirmation || matchingRsvp?.secondConfirmation || 'pending',
          secondConfirmedAt: g.secondConfirmedAt || matchingRsvp?.secondConfirmedAt,
          guestCode: g.code,
        });

        processedNames.add(g.name.trim().toLowerCase());
      }
    }

    // 2. Add from RSVPs where attending === 'yes' that aren't already included
    for (const r of rsvps) {
      if (r.attending === 'yes') {
        const normalizedName = (r.fullName || '').trim().toLowerCase();
        if (!processedNames.has(normalizedName)) {
          list.push({
            sourceId: r.id,
            sourceType: 'rsvp',
            name: r.fullName || 'Invitado',
            phone: r.phone,
            passes: r.guestsCount || 1,
            notes: r.notes,
            firstConfirmedAt: r.submittedAt,
            secondConfirmation: r.secondConfirmation || 'pending',
            secondConfirmedAt: r.secondConfirmedAt,
          });
          processedNames.add(normalizedName);
        }
      }
    }

    // 3. Fallback: If no confirmed guests yet, also allow guests that exist so organizer can reconfirm them directly
    if (list.length === 0 && guests.length > 0) {
      for (const g of guests) {
        list.push({
          sourceId: g.id,
          sourceType: 'guest',
          name: g.name,
          passes: g.maxGuests || 1,
          notes: g.notes,
          firstConfirmedAt: g.submittedAt,
          secondConfirmation: g.secondConfirmation || 'pending',
          secondConfirmedAt: g.secondConfirmedAt,
          guestCode: g.code,
        });
      }
    }

    // Sort alphabetically by name
    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [guests, rsvps]);

  // Filtered list
  const filteredList = useMemo(() => {
    return confirmedList.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.phone && item.phone.includes(searchTerm));
      const matchesFilter = filterStatus === 'all' || item.secondConfirmation === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [confirmedList, searchTerm, filterStatus]);

  // Statistics
  const stats = useMemo(() => {
    const total = confirmedList.length;
    const reconfirmedYes = confirmedList.filter((i) => i.secondConfirmation === 'yes').length;
    const reconfirmedNo = confirmedList.filter((i) => i.secondConfirmation === 'no').length;
    const pending = confirmedList.filter((i) => i.secondConfirmation === 'pending' || !i.secondConfirmation).length;
    const totalFinalPasses = confirmedList
      .filter((i) => i.secondConfirmation === 'yes')
      .reduce((sum, i) => sum + i.passes, 0);

    return { total, reconfirmedYes, reconfirmedNo, pending, totalFinalPasses };
  }, [confirmedList]);

  // Handler for toggle Yes / No
  const handleToggleStatus = async (item: ConfirmedGuestItem, newStatus: 'yes' | 'no' | 'pending') => {
    setUpdatingId(item.sourceId);
    try {
      if (item.sourceType === 'guest') {
        await onUpdateGuestSecondConfirmation(item.sourceId, newStatus);
      } else {
        await onUpdateRsvpSecondConfirmation(item.sourceId, newStatus);
      }
    } finally {
      setUpdatingId(null);
    }
  };

  // Image upload handler
  const handleImageFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploadingImage(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      onConfigChange({
        ...config,
        secondConfirmationImage: base64,
      });
      setIsUploadingImage(false);
    };
    reader.onerror = () => {
      setIsUploadingImage(false);
      alert('Error al cargar la imagen');
    };
    reader.readAsDataURL(file);
  };

  const handleSaveImageUrl = () => {
    if (!imageUrlInput.trim()) return;
    onConfigChange({
      ...config,
      secondConfirmationImage: imageUrlInput.trim(),
    });
    setImageUrlInput('');
    setShowUrlInput(false);
  };

  const handleSaveDeadline = () => {
    onConfigChange({
      ...config,
      secondConfirmationDeadline: deadlineInput.trim(),
    });
    setIsEditingDeadline(false);
  };

  // Export to Excel / CSV
  const handleExportExcel = () => {
    if (confirmedList.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    const headers = [
      'Nombre del Invitado',
      'Teléfono',
      'Pases Asignados',
      '1ª Confirmación',
      '2ª Confirmación (Límite: 12 Sept)',
      'Fecha 2ª Confirmación',
      'Notas / Observaciones',
    ];

    const rows = confirmedList.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${(item.phone || '').replace(/"/g, '""')}"`,
      item.passes,
      '"Asistirá"',
      item.secondConfirmation === 'yes'
        ? '"SÍ (Confirmado)"'
        : item.secondConfirmation === 'no'
        ? '"NO (Cancelado)"'
        : '"PENDIENTE"',
      `"${item.secondConfirmedAt ? new Date(item.secondConfirmedAt).toLocaleString('es-ES') : '-'}"`,
      `"${(item.notes || '').replace(/"/g, '""')}"`,
    ]);

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((e) => e.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Segunda_Confirmacion_${config.coupleName1}_y_${config.coupleName2}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to PDF / Printable Report
  const handleExportPDF = () => {
    if (confirmedList.length === 0) {
      alert('No hay datos para generar el reporte.');
      return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Por favor permite las ventanas emergentes para generar el reporte PDF.');
      return;
    }

    const dateFormatted = new Date().toLocaleDateString('es-ES', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Segunda Confirmación - ${config.coupleName1} & ${config.coupleName2}</title>
          <meta charset="utf-8" />
          <style>
            body {
              font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
              color: #292524;
              padding: 30px;
              margin: 0;
              line-height: 1.5;
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #753636;
              padding-bottom: 20px;
              margin-bottom: 25px;
            }
            .header h1 {
              font-size: 26px;
              color: #753636;
              margin: 0 0 6px 0;
              text-transform: uppercase;
              letter-spacing: 2px;
            }
            .header h2 {
              font-size: 16px;
              font-weight: normal;
              color: #78716c;
              margin: 0 0 10px 0;
            }
            .badge-deadline {
              display: inline-block;
              background-color: #fef3c7;
              color: #92400e;
              font-weight: 600;
              padding: 6px 14px;
              border-radius: 20px;
              font-size: 12px;
              text-transform: uppercase;
              letter-spacing: 1px;
            }
            .stats-container {
              display: flex;
              justify-content: space-between;
              gap: 12px;
              margin-bottom: 25px;
            }
            .stat-box {
              flex: 1;
              background: #f5f5f4;
              border: 1px solid #e7e5e4;
              border-radius: 8px;
              padding: 12px;
              text-align: center;
            }
            .stat-number {
              font-size: 20px;
              font-weight: bold;
              margin-top: 4px;
            }
            .stat-yes { color: #059669; }
            .stat-no { color: #dc2626; }
            .stat-pending { color: #d97706; }
            .stat-total { color: #753636; }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 10px;
              font-size: 12px;
            }
            th {
              background-color: #f5f5f4;
              color: #44403c;
              font-weight: 600;
              text-align: left;
              padding: 10px 8px;
              border-bottom: 2px solid #d6d3d1;
              text-transform: uppercase;
              font-size: 11px;
            }
            td {
              padding: 9px 8px;
              border-bottom: 1px solid #e7e5e4;
            }
            tr:nth-child(even) {
              background-color: #fafaf9;
            }
            .status-tag {
              display: inline-block;
              padding: 3px 8px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: bold;
              text-transform: uppercase;
            }
            .tag-yes { background-color: #d1fae5; color: #065f46; }
            .tag-no { background-color: #fee2e2; color: #991b1b; }
            .tag-pending { background-color: #fef3c7; color: #92400e; }
            .footer {
              margin-top: 35px;
              text-align: center;
              font-size: 11px;
              color: #a8a29e;
              border-top: 1px solid #e7e5e4;
              padding-top: 15px;
            }
            @media print {
              body { padding: 10px; }
              button { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>${config.coupleName1} & ${config.coupleName2}</h1>
            <h2>Reporte Oficial: Segunda Confirmación de Asistencia</h2>
            <div class="badge-deadline">Fecha Máxima: ${config.secondConfirmationDeadline || '12 de septiembre'}</div>
          </div>

          <div class="stats-container">
            <div class="stat-box">
              <div style="font-size: 10px; text-transform: uppercase; color: #78716c;">Total Primer RSVP</div>
              <div class="stat-number stat-total">${stats.total}</div>
            </div>
            <div class="stat-box">
              <div style="font-size: 10px; text-transform: uppercase; color: #78716c;">Reconfirmados (SÍ)</div>
              <div class="stat-number stat-yes">${stats.reconfirmedYes}</div>
            </div>
            <div class="stat-box">
              <div style="font-size: 10px; text-transform: uppercase; color: #78716c;">No Asistirán (NO)</div>
              <div class="stat-number stat-no">${stats.reconfirmedNo}</div>
            </div>
            <div class="stat-box">
              <div style="font-size: 10px; text-transform: uppercase; color: #78716c;">Pendientes</div>
              <div class="stat-number stat-pending">${stats.pending}</div>
            </div>
            <div class="stat-box">
              <div style="font-size: 10px; text-transform: uppercase; color: #78716c;">Comensales Finales</div>
              <div class="stat-number stat-yes">${stats.totalFinalPasses}</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 30px;">#</th>
                <th>Invitado</th>
                <th>Teléfono</th>
                <th style="text-align: center;">Pases</th>
                <th>Segunda Confirmación</th>
                <th>Fecha Respuesta</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${confirmedList
                .map(
                  (item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${item.name}</strong></td>
                  <td>${item.phone || '-'}</td>
                  <td style="text-align: center; font-weight: bold;">${item.passes}</td>
                  <td>
                    ${
                      item.secondConfirmation === 'yes'
                        ? '<span class="status-tag tag-yes">✓ Asistirá (Sí)</span>'
                        : item.secondConfirmation === 'no'
                        ? '<span class="status-tag tag-no">✕ No Asistirá</span>'
                        : '<span class="status-tag tag-pending">? Pendiente</span>'
                    }
                  </td>
                  <td>${item.secondConfirmedAt ? new Date(item.secondConfirmedAt).toLocaleDateString('es-ES') : '-'}</td>
                  <td style="color: #78716c; font-size: 11px;">${item.notes || '-'}</td>
                </tr>
              `
                )
                .join('')}
            </tbody>
          </table>

          <div class="footer">
            Generado el ${dateFormatted} | Boda ${config.coupleName1} & ${config.coupleName2}
          </div>

          <script>
            window.onload = function() {
              window.print();
            };
          </script>
        </body>
      </html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
  };

  const secondConfirmationImg = config.secondConfirmationImage || config.images.portrait || '/images/invitacion_1.webp';

  return (
    <div className="space-y-6 text-left">
      {/* 1. TOP DEADLINE & HERO BANNER */}
      <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-amber-950/40 via-stone-900/60 to-stone-950/80 p-6 backdrop-blur-md shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="space-y-1.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[11px] font-semibold tracking-wider uppercase">
              <Icons.CalendarCheck className="w-3.5 h-3.5 text-amber-400" />
              <span>Segunda Confirmación de Asistencia</span>
            </div>

            <h3 className="text-xl font-serif text-stone-100 font-medium">
              Reconfirmación Oficial de Invitados
            </h3>

            <div className="flex items-center gap-2 text-stone-300 text-sm">
              <Icons.Clock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                Fecha máxima de confirmación:{' '}
                <strong className="text-amber-400 underline decoration-amber-500/40 underline-offset-4 font-semibold">
                  {config.secondConfirmationDeadline || '12 de septiembre'}
                </strong>
              </span>

              {isEditingDeadline ? (
                <div className="flex items-center gap-1 ml-2">
                  <input
                    type="text"
                    value={deadlineInput}
                    onChange={(e) => setDeadlineInput(e.target.value)}
                    className="px-2 py-0.5 text-xs bg-stone-900 border border-stone-700 rounded text-stone-100 outline-none focus:border-amber-500"
                    placeholder="ej. 12 de septiembre"
                  />
                  <button
                    type="button"
                    onClick={handleSaveDeadline}
                    className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                    title="Guardar fecha"
                  >
                    <Icons.Check className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditingDeadline(false)}
                    className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                    title="Cancelar"
                  >
                    <Icons.X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsEditingDeadline(true)}
                  className="p-1 text-stone-500 hover:text-amber-400 transition-colors ml-1 cursor-pointer"
                  title="Editar fecha límite"
                >
                  <Icons.Edit3 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <p className="text-xs text-stone-400 max-w-xl">
              Pregunta y registra nombre por nombre la confirmación definitiva de los invitados que ya habían confirmado en la primera etapa, asegurando el aforo exacto para el banquete.
            </p>
          </div>

          {/* Action buttons: Reload, Excel, PDF */}
          <div className="flex flex-wrap items-center gap-2 self-start md:self-center">
            <button
              type="button"
              onClick={onReload}
              className="p-2.5 rounded-xl border border-stone-800 hover:border-stone-700 bg-stone-900 text-stone-300 hover:text-stone-100 transition-all cursor-pointer"
              title="Recargar datos"
            >
              <Icons.RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleExportExcel}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-stone-950 rounded-xl font-semibold transition-all shadow cursor-pointer active:scale-95"
              title="Descargar tabla en formato Excel (CSV compatible)"
            >
              <Icons.Download className="w-4 h-4" />
              <span>Descargar Excel</span>
            </button>

            <button
              type="button"
              onClick={handleExportPDF}
              className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs uppercase tracking-wider bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-semibold transition-all shadow cursor-pointer active:scale-95"
              title="Imprimir o guardar reporte PDF oficial"
            >
              <Icons.FileText className="w-4 h-4" />
              <span>Descargar PDF</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. STATS OVERVIEW CARDS */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="p-3.5 bg-stone-900/60 border border-stone-800 rounded-xl text-center">
          <p className="text-[10px] text-stone-400 uppercase tracking-wider">Confirmados 1ª Ronda</p>
          <p className="text-xl font-semibold text-stone-100 mt-1">{stats.total}</p>
        </div>
        <div className="p-3.5 bg-emerald-950/20 border border-emerald-800/40 rounded-xl text-center">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Reconfirmados (SÍ)</p>
          <p className="text-xl font-semibold text-emerald-400 mt-1">{stats.reconfirmedYes}</p>
        </div>
        <div className="p-3.5 bg-red-950/20 border border-red-800/40 rounded-xl text-center">
          <p className="text-[10px] text-red-400 uppercase tracking-wider font-medium">No Asistirán (NO)</p>
          <p className="text-xl font-semibold text-red-400 mt-1">{stats.reconfirmedNo}</p>
        </div>
        <div className="p-3.5 bg-amber-950/20 border border-amber-800/40 rounded-xl text-center">
          <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">Pendientes</p>
          <p className="text-xl font-semibold text-amber-400 mt-1">{stats.pending}</p>
        </div>
        <div className="col-span-2 sm:col-span-1 p-3.5 bg-stone-900/60 border border-amber-600/30 rounded-xl text-center">
          <p className="text-[10px] text-amber-300 uppercase tracking-wider font-medium">Comensales Finales</p>
          <p className="text-xl font-semibold text-amber-400 mt-1">{stats.totalFinalPasses}</p>
        </div>
      </div>

      {/* 3. DEDICATED IMAGE INTRO SECTION (as requested: "deja espacio para introducir una imagen como las de la invitacion principal") */}
      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <Icons.Image className="w-5 h-5 text-amber-500" />
            <div>
              <h4 className="text-sm font-semibold text-stone-200">
                Imagen de la Segunda Confirmación
              </h4>
              <p className="text-xs text-stone-400">
                Espacio para introducir una foto romántica o postal, con el mismo estilo visual de la invitación principal.
              </p>
            </div>
          </div>

          {/* Image controls */}
          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageFile}
              accept="image/*"
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploadingImage}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-900 hover:bg-stone-800 text-stone-200 border border-stone-700 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
            >
              <Icons.UploadCloud className="w-3.5 h-3.5 text-amber-500" />
              <span>{isUploadingImage ? 'Cargando...' : 'Subir Foto'}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowUrlInput(!showUrlInput)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-stone-200 border border-stone-800 rounded-lg transition-colors cursor-pointer"
            >
              <span>Pegar URL</span>
            </button>
          </div>
        </div>

        {/* URL Input Form */}
        {showUrlInput && (
          <div className="flex gap-2 p-3 bg-stone-900/60 rounded-xl border border-stone-800">
            <input
              type="url"
              value={imageUrlInput}
              onChange={(e) => setImageUrlInput(e.target.value)}
              placeholder="https://ejemplo.com/foto-pareja.jpg"
              className="flex-1 px-3 py-1.5 bg-stone-950 border border-stone-700 rounded-lg text-xs text-stone-100 outline-none focus:border-amber-500"
            />
            <button
              type="button"
              onClick={handleSaveImageUrl}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 text-xs font-semibold rounded-lg cursor-pointer transition-colors"
            >
              Guardar URL
            </button>
          </div>
        )}

        {/* Image Showcase Card (styled like the polaroids and invitation portrait) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
          <div className="md:col-span-1">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden border-2 border-stone-700/60 shadow-xl bg-stone-900 group">
              <img
                src={secondConfirmationImg}
                alt="Segunda Confirmación Pareja"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-stone-950/80 via-transparent to-transparent flex items-end p-3">
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-widest text-amber-400 font-mono">
                    Postal Conmemorativa
                  </p>
                  <p className="text-xs text-stone-100 font-serif">
                    {config.coupleName1} & {config.coupleName2}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div className="md:col-span-2 space-y-2 text-left text-xs text-stone-300">
            <div className="p-3.5 bg-stone-900/40 rounded-xl border border-stone-800/80 space-y-1.5">
              <p className="font-semibold text-stone-200 flex items-center gap-1.5">
                <Icons.Sparkles className="w-3.5 h-3.5 text-amber-500" />
                <span>Presentación Visual de Segunda Confirmación</span>
              </p>
              <p className="text-stone-400">
                Esta imagen se muestra como encabezado oficial de la etapa de reconfirmación. Se recomienda usar una foto en horizontal o vertical de alta resolución.
              </p>
              <div className="flex items-center gap-3 pt-1 text-[11px] text-amber-400/90 font-mono">
                <span>Estado: Activa</span>
                <span>•</span>
                <span>Límite: {config.secondConfirmationDeadline || '12 de septiembre'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* 4. INTERACTIVE GUESTS LIST (NAME BY NAME YES / NO BUTTONS) */}
      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Icons.UserCheck className="w-4 h-4 text-amber-500" />
              <span>Lista de Reconfirmación (Nombre por Nombre)</span>
            </h4>
            <p className="text-xs text-stone-400 mt-0.5">
              Haz clic en "Sí" o "No" para cada invitado. Los cambios se guardan instantáneamente.
            </p>
          </div>

          {/* Search and filters */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Icons.Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar invitado..."
                className="pl-8 pr-3 py-1.5 bg-stone-900 border border-stone-700 rounded-lg text-xs text-stone-200 outline-none focus:border-amber-500 placeholder-stone-500 w-44"
              />
            </div>

            {/* Filter buttons */}
            <div className="inline-flex rounded-lg border border-stone-800 p-0.5 bg-stone-900 text-xs">
              <button
                type="button"
                onClick={() => setFilterStatus('all')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === 'all'
                    ? 'bg-amber-600 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Todos ({confirmedList.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('yes')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === 'yes'
                    ? 'bg-emerald-600 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Sí ({stats.reconfirmedYes})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('no')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === 'no'
                    ? 'bg-red-600 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                No ({stats.reconfirmedNo})
              </button>
              <button
                type="button"
                onClick={() => setFilterStatus('pending')}
                className={`px-2.5 py-1 rounded-md transition-colors cursor-pointer ${
                  filterStatus === 'pending'
                    ? 'bg-amber-500 text-stone-950 font-semibold'
                    : 'text-stone-400 hover:text-stone-200'
                }`}
              >
                Pendientes ({stats.pending})
              </button>
            </div>
          </div>
        </div>

        {/* List / Table */}
        {isLoading ? (
          <div className="py-12 text-center text-stone-500 text-xs">
            Cargando confirmaciones...
          </div>
        ) : filteredList.length === 0 ? (
          <div className="py-12 text-center text-stone-500 text-xs space-y-2">
            <Icons.Users className="w-8 h-8 text-stone-600 mx-auto" />
            <p>No se encontraron invitados con los filtros seleccionados.</p>
          </div>
        ) : (
          <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-950/20">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-900 text-stone-400 border-b border-stone-800 uppercase tracking-wider">
                    <th className="p-3 font-semibold">Invitado</th>
                    <th className="p-3 font-semibold text-center">Pases</th>
                    <th className="p-3 font-semibold">1ª Confirmación</th>
                    <th className="p-3 font-semibold text-center">¿Asistirá? (Segunda Confirmación)</th>
                    <th className="p-3 font-semibold">Observaciones / Contacto</th>
                    <th className="p-3 text-center font-semibold">Recordatorio</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50 text-stone-300">
                  {filteredList.map((item) => {
                    const isYes = item.secondConfirmation === 'yes';
                    const isNo = item.secondConfirmation === 'no';
                    const isPending = !item.secondConfirmation || item.secondConfirmation === 'pending';
                    const isItemUpdating = updatingId === item.sourceId;

                    // WhatsApp reminder message
                    const reminderMsg = encodeURIComponent(
                      `¡Hola ${item.name}! Te escribimos con mucho cariño para nuestra boda. Te recordamos que la fecha máxima para la segunda confirmación de asistencia es el ${
                        config.secondConfirmationDeadline || '12 de septiembre'
                      }. ¿Nos acompañas en nuestro gran día? 🎉🥂`
                    );

                    return (
                      <tr
                        key={item.sourceId}
                        className={`transition-colors ${
                          isYes
                            ? 'bg-emerald-950/10 hover:bg-emerald-950/20'
                            : isNo
                            ? 'bg-red-950/10 hover:bg-red-950/20'
                            : 'hover:bg-stone-900/30'
                        }`}
                      >
                        {/* Guest Name */}
                        <td className="p-3">
                          <div className="font-semibold text-stone-100 flex items-center gap-1.5">
                            <span>{item.name}</span>
                          </div>
                          {item.phone && (
                            <div className="text-[10px] text-stone-400 mt-0.5 font-mono">
                              Tel: {item.phone}
                            </div>
                          )}
                        </td>

                        {/* Passes */}
                        <td className="p-3 text-center">
                          <span className="inline-block px-2.5 py-1 rounded-full bg-stone-900 border border-stone-700 font-mono font-bold text-stone-200">
                            {item.passes} {item.passes === 1 ? 'pase' : 'pases'}
                          </span>
                        </td>

                        {/* First RSVP status */}
                        <td className="p-3">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-900 text-stone-300 border border-stone-800 text-[10px]">
                            <Icons.Check className="w-3 h-3 text-emerald-400" />
                            <span>Confirmó Sí</span>
                          </span>
                          {item.firstConfirmedAt && (
                            <div className="text-[9px] text-stone-500 mt-0.5">
                              {new Date(item.firstConfirmedAt).toLocaleDateString('es-ES')}
                            </div>
                          )}
                        </td>

                        {/* INTERACTIVE YES / NO BUTTONS */}
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5 bg-stone-900/90 p-1 rounded-xl border border-stone-800">
                            {/* YES BUTTON */}
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item, 'yes')}
                              disabled={isItemUpdating}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                isYes
                                  ? 'bg-emerald-600 text-white shadow-md scale-105'
                                  : 'text-stone-400 hover:text-emerald-400 hover:bg-stone-800/80'
                              }`}
                              title="Marcar como confirmado que SÍ asistirá"
                            >
                              <Icons.Check className="w-3.5 h-3.5" />
                              <span>Sí</span>
                            </button>

                            {/* NO BUTTON */}
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(item, 'no')}
                              disabled={isItemUpdating}
                              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                                isNo
                                  ? 'bg-red-600 text-white shadow-md scale-105'
                                  : 'text-stone-400 hover:text-red-400 hover:bg-stone-800/80'
                              }`}
                              title="Marcar como NO asistirá (canceló/declinó)"
                            >
                              <Icons.X className="w-3.5 h-3.5" />
                              <span>No</span>
                            </button>

                            {/* RESET TO PENDING IF NOT PENDING */}
                            {!isPending && (
                              <button
                                type="button"
                                onClick={() => handleToggleStatus(item, 'pending')}
                                disabled={isItemUpdating}
                                className="p-1.5 text-stone-500 hover:text-stone-300 transition-colors rounded hover:bg-stone-800 cursor-pointer"
                                title="Restablecer a pendiente"
                              >
                                <Icons.RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Status sublabel */}
                          <div className="text-[10px] mt-1">
                            {isYes ? (
                              <span className="text-emerald-400 font-medium">✓ Reconfirmado</span>
                            ) : isNo ? (
                              <span className="text-red-400 font-medium">✕ Declinó</span>
                            ) : (
                              <span className="text-amber-400/90 italic">⏳ Esperando respuesta</span>
                            )}
                          </div>
                        </td>

                        {/* Notes */}
                        <td className="p-3 max-w-[200px] truncate text-stone-400" title={item.notes || ''}>
                          {item.notes ? (
                            <span>{item.notes}</span>
                          ) : (
                            <span className="text-stone-600 italic">Sin observaciones</span>
                          )}
                        </td>

                        {/* WhatsApp / Contact reminder */}
                        <td className="p-3 text-center">
                          {item.phone ? (
                            <a
                              href={`https://wa.me/${item.phone.replace(/[^0-9]/g, '')}?text=${reminderMsg}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-lg text-[10px] font-medium transition-colors cursor-pointer"
                              title="Enviar recordatorio por WhatsApp con fecha límite del 12 de septiembre"
                            >
                              <Icons.MessageCircle className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </a>
                          ) : (
                            <span className="text-[10px] text-stone-600">Sin cel</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 5. FOOTER DE LA INVITACIÓN PRINCIPAL CON LOGO E IMAGEN (as requested: "y deja el footer de la invitacion principal con logo e imagen en esta nueva tab") */}
      <div className="mt-10 pt-6 border-t border-stone-800/80 space-y-6">
        <div className="flex items-center gap-2 text-stone-400 text-xs uppercase tracking-widest font-mono">
          <Icons.Sparkles className="w-4 h-4 text-amber-500" />
          <span>Cierre Oficial de la Invitación</span>
        </div>

        {/* The Exact Footer Component Layout from InvitationPreview */}
        <div
          className="w-full flex flex-col items-center justify-center py-8 px-4 rounded-3xl relative overflow-hidden border border-stone-800/80 shadow-2xl"
          style={{ backgroundColor: config.theme?.bg || '#FDFBF7' }}
        >
          {/* Blurred Romantic Photo */}
          {(config.blurredPhotoUrl || config.secondConfirmationImage) && (
            <div className="w-full max-w-[450px] aspect-[4/3] rounded-[28px] overflow-hidden relative shadow-lg border border-stone-300/40 mb-8 group">
              <img
                src={config.blurredPhotoUrl || config.secondConfirmationImage}
                alt="Cierre romántico"
                className="w-full h-full object-cover filter blur-[3px] scale-105 transition-all duration-700 group-hover:blur-[1px]"
                referrerPolicy="no-referrer"
              />
              <div className="absolute inset-0 bg-stone-900/20 flex flex-col items-center justify-center p-6 text-center select-none">
                <span
                  className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-white/95 drop-shadow-md font-medium"
                  style={{ fontFamily: config.theme?.fontBody || 'sans-serif' }}
                >
                  Te esperamos en nuestro gran día
                </span>
                <h4
                  className="text-xl md:text-2xl font-light text-white drop-shadow-lg uppercase tracking-widest mt-2"
                  style={{ fontFamily: config.theme?.fontTitle || 'serif' }}
                >
                  {config.coupleName1} & {config.coupleName2}
                </h4>
              </div>
            </div>
          )}

          {/* Official Logo / Monogram */}
          <div className="flex flex-col items-center justify-center text-center max-w-[320px] mx-auto mt-2 w-full">
            {config.bottomLogoUrl ? (
              <div className="w-32 h-32 md:w-40 md:h-40 flex items-center justify-center transition-all duration-300 hover:scale-105">
                <img
                  src={getApiUrl(config.bottomLogoUrl)}
                  alt="Logo oficial"
                  className="max-w-full max-h-full object-contain pointer-events-none select-none"
                  referrerPolicy="no-referrer"
                />
              </div>
            ) : (
              <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border border-dashed border-stone-400/60 flex flex-col items-center justify-center text-stone-500 p-4 hover:border-amber-600 transition-colors">
                <Icons.Sparkles className="w-5 h-5 text-stone-400 mb-1" />
                <span className="text-[8px] uppercase tracking-wider text-stone-500 font-light">Espacio de Logo</span>
              </div>
            )}
          </div>

          {/* Footer Text */}
          <footer
            className="w-full text-center pt-8 pb-2 text-xs uppercase tracking-widest text-stone-600"
            style={{ fontFamily: config.theme?.fontBody || 'sans-serif' }}
          >
            {config.coupleName1} & {config.coupleName2} —{' '}
            {new Date(config.dateIso).toLocaleDateString('es-ES', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
            }).replace(/\//g, ' . ')}
          </footer>
        </div>
      </div>
    </div>
  );
}
