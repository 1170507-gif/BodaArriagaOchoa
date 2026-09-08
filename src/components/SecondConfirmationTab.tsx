import React, { useState, useMemo, useRef } from 'react';
import * as Icons from 'lucide-react';
import { Guest, RsvpResponse, WeddingConfig } from '../types';
import { getApiUrl } from '../utils/apiUrl';

export interface ConfirmedGuestItem {
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

export interface UnconfirmedGuestItem {
  sourceId: string;
  sourceType: 'guest' | 'rsvp';
  name: string;
  phone?: string;
  passes: number;
  notes?: string;
  guestCode?: string;
  reason: 'no_registration' | 'declined';
}

interface SecondConfirmationTabProps {
  guests: Guest[];
  rsvps: RsvpResponse[];
  config: WeddingConfig;
  onConfigChange: (newConfig: WeddingConfig) => void;
  onUpdateGuestSecondConfirmation: (guestId: string, status: 'yes' | 'no' | 'pending') => Promise<void>;
  onUpdateRsvpSecondConfirmation: (rsvpId: string, status: 'yes' | 'no' | 'pending') => Promise<void>;
  onMoveGuestToSecondConfirmation?: (guestId: string, status?: 'yes' | 'no' | 'pending', phone?: string) => Promise<void>;
  onRemoveGuestFromSecondConfirmation?: (guestId: string, sourceType?: 'guest' | 'rsvp') => Promise<void>;
  onUpdateGuestPhone?: (guestId: string, newPhone: string) => Promise<void>;
  onUpdateGuestName?: (guestId: string, newName: string) => Promise<void>;
  onUpdateRsvpName?: (rsvpId: string, newName: string) => Promise<void>;
  onUpdateGuestPasses?: (targetId: string, passes: number, sourceType?: 'guest' | 'rsvp') => Promise<void>;
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
  onMoveGuestToSecondConfirmation,
  onRemoveGuestFromSecondConfirmation,
  onUpdateGuestPhone,
  onUpdateGuestName,
  onUpdateRsvpName,
  onUpdateGuestPasses,
  onReload,
  isLoading = false,
}: SecondConfirmationTabProps) {
  // Filters and search for Confirmed Group
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'yes' | 'no' | 'pending'>('all');

  // Search for Unconfirmed Group
  const [unconfirmedSearch, setUnconfirmedSearch] = useState('');

  // Inline phone editing state
  const [editingPhoneId, setEditingPhoneId] = useState<string | null>(null);
  const [phoneDraft, setPhoneDraft] = useState('');

  // Inline name editing state
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState('');

  // Inline passes editing state
  const [editingPassesId, setEditingPassesId] = useState<string | null>(null);
  const [passesDraft, setPassesDraft] = useState<number>(1);

  // Action feedback message
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);

  // Config & Deadline states
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [deadlineInput, setDeadlineInput] = useState(config.secondConfirmationDeadline || '12 de septiembre');
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [imageUrlInput, setImageUrlInput] = useState('');
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Helper to normalize names for deduplication
  const normalize = (str: string) =>
    str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // Separate guests into two distinct groups:
  // 1. Confirmed in 1st stage or manually moved to 2nd confirmation
  // 2. Unconfirmed / Pending manual confirmation
  const { confirmedList, unconfirmedList } = useMemo(() => {
    const confirmed: ConfirmedGuestItem[] = [];
    const unconfirmed: UnconfirmedGuestItem[] = [];
    const processedGuestIds = new Set<string>();
    const processedNames = new Set<string>();

    // 1. Process registered guests from the guests collection
    for (const g of guests) {
      const normName = normalize(g.name);
      // Look for a matching RSVP response to pull phone or notes if missing on guest
      const matchingRsvp = rsvps.find((r) => normalize(r.fullName) === normName);

      // Prioritize guest.phone, fallback to matching RSVP phone
      const phone = g.phone || matchingRsvp?.phone;

      // A guest is confirmed if g.confirmed is true and not attending === 'no'
      // If g.confirmed is explicitly false or attending is 'no', they are strictly in unconfirmed group
      let isAttending = false;
      if (g.confirmed === true && g.attending !== 'no') {
        isAttending = true;
      } else if (g.confirmed === false || g.attending === 'no') {
        isAttending = false;
      } else if (matchingRsvp) {
        isAttending = matchingRsvp.attending === 'yes';
      }

      if (isAttending) {
        confirmed.push({
          sourceId: g.id,
          sourceType: 'guest',
          name: g.name,
          phone,
          passes: g.guestsCount ?? (matchingRsvp?.guestsCount ?? (g.maxGuests || 1)),
          notes: g.notes || matchingRsvp?.notes,
          firstConfirmedAt: g.submittedAt || matchingRsvp?.submittedAt,
          secondConfirmation: g.secondConfirmation || matchingRsvp?.secondConfirmation || 'pending',
          secondConfirmedAt: g.secondConfirmedAt || matchingRsvp?.secondConfirmedAt,
          guestCode: g.code || g.id,
        });
      } else {
        unconfirmed.push({
          sourceId: g.id,
          sourceType: 'guest',
          name: g.name,
          phone,
          passes: g.maxGuests || 1,
          notes: g.notes || matchingRsvp?.notes,
          guestCode: g.code || g.id,
          reason: g.attending === 'no' || matchingRsvp?.attending === 'no' ? 'declined' : 'no_registration',
        });
      }

      processedGuestIds.add(g.id);
      processedNames.add(normName);
    }

    // 2. Process RSVPs from the rsvps collection that might not match a guest by name
    for (const r of rsvps) {
      const normName = normalize(r.fullName || '');
      if (!processedNames.has(normName)) {
        const rsvpCode = (r as any).code || r.id;
        if (r.attending === 'yes') {
          confirmed.push({
            sourceId: r.id,
            sourceType: 'rsvp',
            name: r.fullName || 'Invitado',
            phone: r.phone,
            passes: r.guestsCount || 1,
            notes: r.notes,
            firstConfirmedAt: r.submittedAt,
            secondConfirmation: r.secondConfirmation || 'pending',
            secondConfirmedAt: r.secondConfirmedAt,
            guestCode: rsvpCode,
          });
        } else {
          unconfirmed.push({
            sourceId: r.id,
            sourceType: 'rsvp',
            name: r.fullName || 'Invitado',
            phone: r.phone,
            passes: r.guestsCount || 1,
            notes: r.notes,
            reason: 'declined',
            guestCode: rsvpCode,
          });
        }
        processedNames.add(normName);
      }
    }

    // Sort both alphabetically
    confirmed.sort((a, b) => a.name.localeCompare(b.name));
    unconfirmed.sort((a, b) => a.name.localeCompare(b.name));

    return { confirmedList: confirmed, unconfirmedList: unconfirmed };
  }, [guests, rsvps]);

  // Filtered confirmed list
  const filteredConfirmedList = useMemo(() => {
    return confirmedList.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.phone && item.phone.includes(searchTerm));
      const matchesFilter = filterStatus === 'all' || item.secondConfirmation === filterStatus;
      return matchesSearch && matchesFilter;
    });
  }, [confirmedList, searchTerm, filterStatus]);

  // Filtered unconfirmed list
  const filteredUnconfirmedList = useMemo(() => {
    return unconfirmedList.filter((item) => {
      const matchesSearch =
        item.name.toLowerCase().includes(unconfirmedSearch.toLowerCase()) ||
        (item.phone && item.phone.includes(unconfirmedSearch));
      return matchesSearch;
    });
  }, [unconfirmedList, unconfirmedSearch]);

  // Statistics including all assigned passes (even unconfirmed)
  const stats = useMemo(() => {
    const total = confirmedList.length;
    const reconfirmedYes = confirmedList.filter((i) => i.secondConfirmation === 'yes').length;
    const reconfirmedNo = confirmedList.filter((i) => i.secondConfirmation === 'no').length;
    const pending = confirmedList.filter((i) => i.secondConfirmation === 'pending' || !i.secondConfirmation).length;

    // Total assigned passes across ALL registered guests (confirmed + unconfirmed)
    const totalAssignedAllPasses = [...confirmedList, ...unconfirmedList].reduce((sum, i) => sum + (i.passes || 1), 0);
    // Total passes of guests confirmed for 2nd stage
    const totalFinalPasses = confirmedList
      .filter((i) => i.secondConfirmation === 'yes')
      .reduce((sum, i) => sum + (i.passes || 1), 0);
    // Total passes pending in 2nd stage
    const totalPendingPasses = confirmedList
      .filter((i) => i.secondConfirmation === 'pending' || !i.secondConfirmation)
      .reduce((sum, i) => sum + (i.passes || 1), 0);
    // Total passes unconfirmed in 1st stage
    const totalUnconfirmedPasses = unconfirmedList.reduce((sum, i) => sum + (i.passes || 1), 0);

    return {
      total,
      reconfirmedYes,
      reconfirmedNo,
      pending,
      totalAssignedAllPasses,
      totalFinalPasses,
      totalPendingPasses,
      totalUnconfirmedPasses,
    };
  }, [confirmedList, unconfirmedList]);

  // Helper to build dedicated URL for a guest
  const getDirectGuestUrl = (guestCode: string) => {
    return `${window.location.origin}${window.location.pathname}?confirmacion2=true&g=${encodeURIComponent(guestCode)}`;
  };

  // WhatsApp Link Generator with direct link to front-end second confirmation
  const buildWhatsAppUrl = (phone: string | undefined, guestName: string, isConfirmedStage1: boolean, guestCode: string) => {
    const deadline = config.secondConfirmationDeadline || '12 de septiembre';
    const coupleNames = `${config.coupleName1} & ${config.coupleName2}`;
    const directUrl = getDirectGuestUrl(guestCode);
    
    const message = isConfirmedStage1
      ? `¡Hola ${guestName}! 💛 Te escribimos con mucho cariño de parte de ${coupleNames} para recordarte que la fecha límite de tu segunda confirmación de asistencia es el ${deadline}. En la imagen que te compartimos puedes ver el dress code y sus restricciones. Ayúdanos, por favor, confirmando tus pases asignados directamente aquí: ${directUrl}`
      : `¡Hola ${guestName}! 💛 Te escribimos con mucho cariño de parte de ${coupleNames}. Estamos cerrando la lista oficial de comensales y la fecha límite para confirmar es el ${deadline}. En la imagen que te compartimos puedes ver el dress code y sus restricciones. Ayúdanos, por favor, confirmando tus pases asignados directamente aquí: ${directUrl}`;

    const encoded = encodeURIComponent(message);
    if (!phone || !phone.trim()) {
      return `https://api.whatsapp.com/send?text=${encoded}`;
    }

    const clean = phone.replace(/[^0-9]/g, '');
    if (!clean) {
      return `https://api.whatsapp.com/send?text=${encoded}`;
    }
    return `https://api.whatsapp.com/send?phone=${clean}&text=${encoded}`;
  };

  // Handler for toggle Yes / No in 2nd confirmation
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

  // Handler to move an unconfirmed guest into the 2nd confirmation group
  const handleMoveToSecondConfirmation = async (
    item: UnconfirmedGuestItem,
    targetStatus: 'yes' | 'no' | 'pending' = 'pending'
  ) => {
    setUpdatingId(item.sourceId);
    try {
      if (item.sourceType === 'guest') {
        if (onMoveGuestToSecondConfirmation) {
          await onMoveGuestToSecondConfirmation(item.sourceId, targetStatus, item.phone);
        } else {
          await onUpdateGuestSecondConfirmation(item.sourceId, targetStatus);
        }
      } else {
        await onUpdateRsvpSecondConfirmation(item.sourceId, targetStatus);
      }
      setActionFeedback(`"${item.name}" fue movido a la Segunda Confirmación con estado ${targetStatus === 'yes' ? 'SÍ' : 'Pendiente'}`);
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setUpdatingId(null);
    }
  };

  // Handler to remove guest from 2nd confirmation (send back to unconfirmed)
  const handleRemoveFromSecondConfirmation = async (item: ConfirmedGuestItem) => {
    setUpdatingId(item.sourceId);
    try {
      if (onRemoveGuestFromSecondConfirmation) {
        await onRemoveGuestFromSecondConfirmation(item.sourceId, item.sourceType);
      } else if (item.sourceType === 'guest') {
        await onUpdateGuestSecondConfirmation(item.sourceId, 'no');
      } else {
        await onUpdateRsvpSecondConfirmation(item.sourceId, 'no');
      }
      setActionFeedback(`"${item.name}" regresó al grupo de No Confirmados`);
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setUpdatingId(null);
    }
  };

  // Inline name editing
  const handleStartEditName = (id: string, currentName: string) => {
    setEditingNameId(id);
    setNameDraft(currentName);
  };

  const handleSaveName = async (sourceId: string, sourceType: 'guest' | 'rsvp') => {
    const trimmed = nameDraft.trim();
    if (!trimmed) {
      setEditingNameId(null);
      return;
    }
    setUpdatingId(sourceId);
    try {
      if (sourceType === 'guest') {
        if (onUpdateGuestName) {
          await onUpdateGuestName(sourceId, trimmed);
        }
      } else {
        if (onUpdateRsvpName) {
          await onUpdateRsvpName(sourceId, trimmed);
        }
      }
      setActionFeedback(`Nombre final actualizado a "${trimmed}"`);
      setTimeout(() => setActionFeedback(null), 3500);
    } finally {
      setUpdatingId(null);
      setEditingNameId(null);
    }
  };

  // Inline passes editing
  const handleStartEditPasses = (id: string, currentPasses: number) => {
    setEditingPassesId(id);
    setPassesDraft(currentPasses || 1);
  };

  const handleSavePasses = async (sourceId: string, sourceType: 'guest' | 'rsvp') => {
    const valid = Math.max(1, Math.min(50, Math.round(Number(passesDraft) || 1)));
    setUpdatingId(sourceId);
    try {
      if (onUpdateGuestPasses) {
        await onUpdateGuestPasses(sourceId, valid, sourceType);
      }
      setActionFeedback(`Pases asignados actualizados a ${valid}`);
      setTimeout(() => setActionFeedback(null), 3000);
    } finally {
      setUpdatingId(null);
      setEditingPassesId(null);
    }
  };

  // Inline phone saving
  const handleStartEditPhone = (id: string, currentPhone?: string) => {
    setEditingPhoneId(id);
    setPhoneDraft(currentPhone || '');
  };

  const handleSavePhone = async (id: string) => {
    if (onUpdateGuestPhone) {
      await onUpdateGuestPhone(id, phoneDraft.trim());
      setActionFeedback(`Teléfono actualizado`);
      setTimeout(() => setActionFeedback(null), 3000);
    }
    setEditingPhoneId(null);
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
    if (confirmedList.length === 0 && unconfirmedList.length === 0) {
      alert('No hay datos para exportar.');
      return;
    }

    // Section 1: 2nd Confirmation list
    const headers1 = [
      'SECCIÓN 1: INVITADOS EN SEGUNDA CONFIRMACIÓN',
      '',
      '',
      '',
      '',
      '',
      '',
    ];
    const subheaders1 = [
      'Nombre del Invitado',
      'Teléfono',
      'Pases Asignados',
      '1ª Confirmación',
      '2ª Confirmación (Límite: 12 Sept)',
      'Fecha 2ª Confirmación',
      'Notas / Observaciones',
    ];

    const rows1 = confirmedList.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${(item.phone || '').replace(/"/g, '""')}"`,
      item.passes,
      '"Asistirá (1ª Etapa)"',
      item.secondConfirmation === 'yes'
        ? '"SÍ (Confirmado)"'
        : item.secondConfirmation === 'no'
        ? '"NO (Canceló)"'
        : '"PENDIENTE"',
      `"${item.secondConfirmedAt ? new Date(item.secondConfirmedAt).toLocaleString('es-ES') : '-'}"`,
      `"${(item.notes || '').replace(/"/g, '""')}"`,
    ]);

    // Section 2: Unconfirmed list
    const headers2 = [
      '',
      '',
      '',
      '',
      '',
      '',
      '',
    ];
    const section2Title = [
      'SECCIÓN 2: INVITADOS NO CONFIRMADOS (1ª ETAPA / MANUALES PENDIENTES)',
      '',
      '',
      '',
      '',
      '',
      '',
    ];
    const subheaders2 = [
      'Nombre del Invitado',
      'Teléfono',
      'Pases Asignados',
      'Estado 1ª Etapa',
      'Acción Sugerida',
      'Código Invitado',
      'Notas',
    ];

    const rows2 = unconfirmedList.map((item) => [
      `"${item.name.replace(/"/g, '""')}"`,
      `"${(item.phone || '').replace(/"/g, '""')}"`,
      item.passes,
      item.reason === 'declined' ? '"Declinó en 1ª Etapa"' : '"Sin registro en web"',
      '"Asignar o llamar manual"',
      `"${item.guestCode || '-'}"`,
      `"${(item.notes || '').replace(/"/g, '""')}"`,
    ]);

    const allLines = [
      headers1.join(','),
      subheaders1.join(','),
      ...rows1.map((e) => e.join(',')),
      headers2.join(','),
      section2Title.join(','),
      subheaders2.join(','),
      ...rows2.map((e) => e.join(',')),
    ];

    const csvContent = '\uFEFF' + allLines.join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `Segunda_Confirmacion_Completa_${config.coupleName1}_y_${config.coupleName2}_${new Date().toISOString().slice(0, 10)}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Export to PDF / Printable Report
  const handleExportPDF = () => {
    if (confirmedList.length === 0 && unconfirmedList.length === 0) {
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
            .section-title {
              font-size: 15px;
              font-weight: bold;
              color: #44403c;
              margin-top: 30px;
              margin-bottom: 10px;
              border-left: 4px solid #753636;
              padding-left: 8px;
              text-transform: uppercase;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              margin-top: 8px;
              font-size: 12px;
              margin-bottom: 25px;
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
              padding: 8px;
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
              <div style="font-size: 10px; text-transform: uppercase; color: #78716c;">En 2ª Confirmación</div>
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

          <div class="section-title">1. Invitados en Segunda Confirmación (Lista Principal)</div>
          <table>
            <thead>
              <tr>
                <th style="width: 25px;">#</th>
                <th>Invitado</th>
                <th>Teléfono</th>
                <th style="text-align: center;">Pases</th>
                <th>2ª Confirmación</th>
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
                  <td>${item.phone || '<span style="color:#a8a29e;">Sin teléfono</span>'}</td>
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

          <div class="section-title">2. Invitados No Confirmados en 1ª Etapa (${unconfirmedList.length} registrados)</div>
          <table>
            <thead>
              <tr>
                <th style="width: 25px;">#</th>
                <th>Invitado</th>
                <th>Teléfono</th>
                <th style="text-align: center;">Pases</th>
                <th>Estado 1ª Etapa</th>
                <th>Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${unconfirmedList
                .map(
                  (item, idx) => `
                <tr>
                  <td>${idx + 1}</td>
                  <td><strong>${item.name}</strong></td>
                  <td>${item.phone || '<span style="color:#a8a29e;">Sin teléfono</span>'}</td>
                  <td style="text-align: center; font-weight: bold;">${item.passes}</td>
                  <td>
                    ${
                      item.reason === 'declined'
                        ? '<span class="status-tag tag-no">Declinó 1ª Etapa</span>'
                        : '<span class="status-tag tag-pending">Sin Registro en Web</span>'
                    }
                  </td>
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
    <div className="space-y-8 text-left">
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
              Gestiona nombre por nombre la confirmación definitiva. También puedes decidir a quién de los no confirmados de la 1ª etapa sumar a la lista para que cuenten en el aforo final.
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
              title="Descargar tabla en formato Excel (CSV compatible con lista de confirmados y no confirmados)"
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

      {/* 2. STATS OVERVIEW CARDS WITH ASSIGNED PASSES (EVEN UNCONFIRMED) */}
      <div className="grid grid-cols-2 sm:grid-cols-6 gap-3">
        <div className="p-3 bg-stone-900/80 border border-amber-500/30 rounded-xl text-center shadow-sm">
          <p className="text-[10px] text-amber-300 uppercase tracking-wider font-medium">Total Pases Asignados</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{stats.totalAssignedAllPasses}</p>
          <span className="text-[9px] text-stone-400">Todos los invitados</span>
        </div>
        <div className="p-3 bg-emerald-950/30 border border-emerald-800/40 rounded-xl text-center shadow-sm">
          <p className="text-[10px] text-emerald-400 uppercase tracking-wider font-medium">Pases Ratificados (SÍ)</p>
          <p className="text-xl font-bold text-emerald-400 mt-1">{stats.totalFinalPasses}</p>
          <span className="text-[9px] text-emerald-500/80">{stats.reconfirmedYes} invitaciones</span>
        </div>
        <div className="p-3 bg-red-950/30 border border-red-800/40 rounded-xl text-center shadow-sm">
          <p className="text-[10px] text-red-400 uppercase tracking-wider font-medium">No Asistirán (NO)</p>
          <p className="text-xl font-bold text-red-400 mt-1">{stats.reconfirmedNo}</p>
          <span className="text-[9px] text-red-500/80">Cancelados</span>
        </div>
        <div className="p-3 bg-amber-950/30 border border-amber-800/40 rounded-xl text-center shadow-sm">
          <p className="text-[10px] text-amber-400 uppercase tracking-wider font-medium">Pases Pendientes 2ª</p>
          <p className="text-xl font-bold text-amber-400 mt-1">{stats.totalPendingPasses}</p>
          <span className="text-[9px] text-amber-500/80">{stats.pending} en espera</span>
        </div>
        <div className="p-3 bg-purple-950/20 border border-purple-800/40 rounded-xl text-center shadow-sm">
          <p className="text-[10px] text-purple-400 uppercase tracking-wider font-medium">Pases No Confirmados 1ª</p>
          <p className="text-xl font-bold text-purple-400 mt-1">{stats.totalUnconfirmedPasses}</p>
          <span className="text-[9px] text-purple-400/80">{unconfirmedList.length} por rescatar</span>
        </div>
        <div className="p-3 bg-stone-900/60 border border-stone-800 rounded-xl text-center shadow-sm">
          <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">En 2ª Confirmación</p>
          <p className="text-xl font-bold text-stone-100 mt-1">{stats.total}</p>
          <span className="text-[9px] text-stone-500">Invitaciones</span>
        </div>
      </div>

      {/* 3. DEDICATED IMAGE INTRO SECTION */}
      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-stone-800 pb-3">
          <div className="flex items-center gap-2">
            <Icons.Image className="w-5 h-5 text-amber-500" />
            <div>
              <h4 className="text-sm font-semibold text-stone-200">
                Imagen de la Segunda Confirmación
              </h4>
              <p className="text-xs text-stone-400">
                Espacio para introducir una foto romántica o postal con el mismo estilo visual de la invitación principal.
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

        {/* Image Showcase Card */}
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

      {/* 4. GRUPO 1: LISTA PRINCIPAL DE SEGUNDA CONFIRMACIÓN (NOMBRE POR NOMBRE) */}
      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <h4 className="text-sm font-semibold text-stone-200 flex items-center gap-2">
              <Icons.UserCheck className="w-4 h-4 text-amber-500" />
              <span>Invitados en Segunda Confirmación ({confirmedList.length})</span>
            </h4>
            <p className="text-xs text-stone-400 mt-0.5">
              Haz clic en "Sí" o "No" para cada invitado. Si no tienen teléfono registrado, el botón de WhatsApp siempre creará el enlace para que elijas el contacto.
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
                placeholder="Buscar invitado o teléfono..."
                className="pl-8 pr-3 py-1.5 bg-stone-900 border border-stone-700 rounded-lg text-xs text-stone-200 outline-none focus:border-amber-500 placeholder-stone-500 w-48"
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

        {/* Action feedback message */}
        {actionFeedback && (
          <div className="flex items-center justify-between p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs animate-fadeIn">
            <div className="flex items-center gap-2">
              <Icons.CheckCircle2 className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="font-medium">{actionFeedback}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="p-1 text-stone-400 hover:text-stone-200 cursor-pointer"
            >
              <Icons.X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Table of Confirmed Guests */}
        {isLoading ? (
          <div className="py-12 text-center text-stone-500 text-xs">
            Cargando confirmaciones...
          </div>
        ) : filteredConfirmedList.length === 0 ? (
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
                    <th className="p-3 font-semibold">Invitado (Editar)</th>
                    <th className="p-3 font-semibold">Teléfono</th>
                    <th className="p-3 font-semibold text-center">Pases</th>
                    <th className="p-3 font-semibold text-center">¿Asistirá? (Segunda Confirmación)</th>
                    <th className="p-3 font-semibold text-center">WhatsApp</th>
                    <th className="p-3 text-center font-semibold">Mover a No Confirmados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50 text-stone-300">
                  {filteredConfirmedList.map((item) => {
                    const isYes = item.secondConfirmation === 'yes';
                    const isNo = item.secondConfirmation === 'no';
                    const isPending = !item.secondConfirmation || item.secondConfirmation === 'pending';
                    const isItemUpdating = updatingId === item.sourceId;
                    const isEditingPhone = editingPhoneId === item.sourceId;
                    const isEditingName = editingNameId === item.sourceId;
                    const isEditingPasses = editingPassesId === item.sourceId;

                    const guestCode = item.guestCode || item.sourceId;
                    const whatsappUrl = buildWhatsAppUrl(item.phone, item.name, true, guestCode);
                    const dedicatedUrl = getDirectGuestUrl(guestCode);

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
                        {/* Guest Name with Inline Edit */}
                        <td className="p-3">
                          {isEditingName ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveName(item.sourceId, item.sourceType);
                                  if (e.key === 'Escape') setEditingNameId(null);
                                }}
                                className="w-36 sm:w-48 px-2 py-1 bg-stone-900 border border-amber-500 rounded text-xs text-stone-100 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveName(item.sourceId, item.sourceType)}
                                className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                                title="Guardar nombre final"
                              >
                                <Icons.Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNameId(null)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <Icons.X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group">
                              <span className="font-semibold text-stone-100">{item.name}</span>
                              <button
                                type="button"
                                onClick={() => handleStartEditName(item.sourceId, item.name)}
                                className="opacity-60 group-hover:opacity-100 text-stone-400 hover:text-amber-400 transition-opacity p-0.5 cursor-pointer"
                                title="Editar nombre final"
                              >
                                <Icons.Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                          {item.notes && (
                            <div className="text-[10px] text-stone-400 mt-0.5 truncate max-w-[180px]" title={item.notes}>
                              Nota: {item.notes}
                            </div>
                          )}
                        </td>

                        {/* Phone with Inline Edit */}
                        <td className="p-3">
                          {isEditingPhone ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={phoneDraft}
                                onChange={(e) => setPhoneDraft(e.target.value)}
                                placeholder="ej. 9876-5432"
                                className="w-28 px-2 py-1 bg-stone-900 border border-amber-500 rounded text-xs text-stone-100 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePhone(item.sourceId)}
                                className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                                title="Guardar teléfono"
                              >
                                <Icons.Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPhoneId(null)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <Icons.X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : item.phone ? (
                            <div className="flex items-center gap-1.5 font-mono text-stone-200">
                              <Icons.Phone className="w-3 h-3 text-stone-500" />
                              <span>{item.phone}</span>
                              <button
                                type="button"
                                onClick={() => handleStartEditPhone(item.sourceId, item.phone)}
                                className="p-0.5 text-stone-500 hover:text-amber-400 transition-colors cursor-pointer"
                                title="Editar número telefónico"
                              >
                                <Icons.Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEditPhone(item.sourceId, '')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-amber-950/30 text-amber-400 border border-amber-800/40 hover:bg-amber-900/40 transition-colors cursor-pointer"
                              title="Haz clic para registrar el número de teléfono"
                            >
                              <Icons.Plus className="w-2.5 h-2.5" />
                              <span>+ Agregar cel</span>
                            </button>
                          )}
                        </td>

                        {/* Passes with Inline Edit */}
                        <td className="p-3 text-center">
                          {isEditingPasses ? (
                            <div className="inline-flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={passesDraft}
                                onChange={(e) => setPassesDraft(Math.max(1, parseInt(e.target.value) || 1))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSavePasses(item.sourceId, item.sourceType);
                                  if (e.key === 'Escape') setEditingPassesId(null);
                                }}
                                className="w-14 px-1.5 py-0.5 bg-stone-900 border border-amber-500 rounded text-center text-xs text-stone-100 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePasses(item.sourceId, item.sourceType)}
                                className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                                title="Guardar pases"
                              >
                                <Icons.Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPassesId(null)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <Icons.X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1 group">
                              <span className="inline-block px-2.5 py-1 rounded-full bg-stone-900 border border-stone-700 font-mono font-bold text-stone-200">
                                {item.passes} {item.passes === 1 ? 'pase' : 'pases'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEditPasses(item.sourceId, item.passes)}
                                className="opacity-60 group-hover:opacity-100 text-stone-400 hover:text-amber-400 transition-opacity p-0.5 cursor-pointer"
                                title="Editar pases asignados"
                              >
                                <Icons.Edit2 className="w-3 h-3" />
                              </button>
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
                              title="Confirmar que SÍ asistirá definitivamente"
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
                              title="Marcar que NO asistirá (declinó)"
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

                          {/* Sublabel */}
                          <div className="text-[10px] mt-1">
                            {isYes ? (
                              <span className="text-emerald-400 font-medium">✓ Reconfirmado</span>
                            ) : isNo ? (
                              <span className="text-red-400 font-medium">✕ Declinó</span>
                            ) : (
                              <span className="text-amber-400/90 italic">⏳ Pendiente</span>
                            )}
                          </div>
                        </td>

                        {/* WhatsApp & Dedicated Link (ALWAYS CREATED) */}
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-lg text-[11px] font-medium transition-all cursor-pointer shadow-sm active:scale-95"
                              title={
                                item.phone
                                  ? `Abrir chat directo con ${item.phone} (Enlace personalizado)`
                                  : 'Sin celular registrado: abre WhatsApp para elegir el contacto a quien enviar el recordatorio'
                              }
                            >
                              <Icons.MessageCircle className="w-3.5 h-3.5 text-emerald-400" />
                              <span>
                                {item.phone ? 'WhatsApp' : 'WhatsApp (Elegir)'}
                              </span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(dedicatedUrl);
                                setActionFeedback(`Enlace dedicado copiado para ${item.name}`);
                                setTimeout(() => setActionFeedback(null), 3000);
                              }}
                              className="p-1.5 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-amber-400 border border-stone-800 transition-colors cursor-pointer"
                              title="Copiar enlace dedicado personalizado"
                            >
                              <Icons.Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>

                        {/* Move back to unconfirmed */}
                        <td className="p-3 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveFromSecondConfirmation(item)}
                            disabled={isItemUpdating}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-stone-900 border border-stone-800 hover:border-amber-500/50 hover:bg-stone-800 text-stone-400 hover:text-amber-300 transition-all cursor-pointer whitespace-nowrap active:scale-95 disabled:opacity-50"
                            title="Regresar este invitado al grupo de No Confirmados"
                          >
                            <Icons.ArrowDown className="w-3.5 h-3.5 text-amber-500" />
                            <span>Mover a No Confirmados</span>
                          </button>
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

      {/* 5. GRUPO 2: INVITADOS NO CONFIRMADOS DE LA 1ª ETAPA (AL FINAL) */}
      <div className="bg-stone-950/50 border border-stone-800 rounded-2xl p-5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-b border-stone-800 pb-3">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-0.5 rounded-full bg-stone-900 text-stone-400 border border-stone-700 text-[10px] font-semibold tracking-wider uppercase mb-1">
              <Icons.UserPlus className="w-3 h-3 text-amber-500" />
              <span>Confirmaciones Manuales / 1ª Etapa</span>
            </div>
            <h4 className="text-sm font-semibold text-stone-200">
              Invitados No Confirmados en 1ª Etapa ({unconfirmedList.length})
            </h4>
            <p className="text-xs text-stone-400 mt-0.5">
              Algunos invitados confirman por llamada o en persona sin usar la web. Desde aquí puedes decidir a quién asignar a la Segunda Confirmación y moverlos para que cuenten en el conteo final.
            </p>
          </div>

          {/* Search within unconfirmed */}
          <div className="relative">
            <Icons.Search className="w-3.5 h-3.5 text-stone-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={unconfirmedSearch}
              onChange={(e) => setUnconfirmedSearch(e.target.value)}
              placeholder="Buscar no confirmados..."
              className="pl-8 pr-3 py-1.5 bg-stone-900 border border-stone-700 rounded-lg text-xs text-stone-200 outline-none focus:border-amber-500 placeholder-stone-500 w-52"
            />
          </div>
        </div>

        {filteredUnconfirmedList.length === 0 ? (
          <div className="py-8 text-center text-stone-500 text-xs">
            {unconfirmedList.length === 0
              ? '¡Excelente! Todos los invitados registrados están en la lista de Segunda Confirmación.'
              : 'No se encontraron invitados con la búsqueda actual.'}
          </div>
        ) : (
          <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-950/30">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-stone-900/80 text-stone-400 border-b border-stone-800 uppercase tracking-wider">
                    <th className="p-3 font-semibold">Invitado (Editar)</th>
                    <th className="p-3 font-semibold">Teléfono</th>
                    <th className="p-3 font-semibold text-center">Pases</th>
                    <th className="p-3 font-semibold">Estado 1ª Etapa</th>
                    <th className="p-3 font-semibold text-center">Contactar (WhatsApp)</th>
                    <th className="p-3 font-semibold text-center">Decidir Asignación a 2ª Confirmación</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-800/50 text-stone-300">
                  {filteredUnconfirmedList.map((item) => {
                    const isItemUpdating = updatingId === item.sourceId;
                    const isEditingPhone = editingPhoneId === item.sourceId;
                    const isEditingName = editingNameId === item.sourceId;
                    const isEditingPasses = editingPassesId === item.sourceId;
                    const guestCode = item.guestCode || item.sourceId;
                    const whatsappUrl = buildWhatsAppUrl(item.phone, item.name, false, guestCode);
                    const dedicatedUrl = getDirectGuestUrl(guestCode);

                    return (
                      <tr key={item.sourceId} className="hover:bg-stone-900/30 transition-colors">
                        {/* Name with Inline Edit */}
                        <td className="p-3">
                          {isEditingName ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={nameDraft}
                                onChange={(e) => setNameDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSaveName(item.sourceId, item.sourceType);
                                  if (e.key === 'Escape') setEditingNameId(null);
                                }}
                                className="w-36 sm:w-48 px-2 py-1 bg-stone-900 border border-amber-500 rounded text-xs text-stone-100 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSaveName(item.sourceId, item.sourceType)}
                                className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                                title="Guardar nombre final"
                              >
                                <Icons.Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingNameId(null)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <Icons.X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 group">
                              <span className="font-medium text-stone-200">{item.name}</span>
                              <button
                                type="button"
                                onClick={() => handleStartEditName(item.sourceId, item.name)}
                                className="opacity-60 group-hover:opacity-100 text-stone-400 hover:text-amber-400 transition-opacity p-0.5 cursor-pointer"
                                title="Editar nombre final"
                              >
                                <Icons.Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Phone with Inline Edit */}
                        <td className="p-3">
                          {isEditingPhone ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={phoneDraft}
                                onChange={(e) => setPhoneDraft(e.target.value)}
                                placeholder="ej. 9876-5432"
                                className="w-28 px-2 py-1 bg-stone-900 border border-amber-500 rounded text-xs text-stone-100 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePhone(item.sourceId)}
                                className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                                title="Guardar teléfono"
                              >
                                <Icons.Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPhoneId(null)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <Icons.X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : item.phone ? (
                            <div className="flex items-center gap-1.5 font-mono text-stone-300">
                              <Icons.Phone className="w-3 h-3 text-stone-500" />
                              <span>{item.phone}</span>
                              <button
                                type="button"
                                onClick={() => handleStartEditPhone(item.sourceId, item.phone)}
                                className="p-0.5 text-stone-500 hover:text-amber-400 transition-colors cursor-pointer"
                                title="Editar teléfono"
                              >
                                <Icons.Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleStartEditPhone(item.sourceId, '')}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-stone-900 text-amber-400 border border-stone-800 hover:border-amber-500/50 transition-colors cursor-pointer"
                              title="Registrar teléfono"
                            >
                              <Icons.Plus className="w-2.5 h-2.5" />
                              <span>+ Agregar cel</span>
                            </button>
                          )}
                        </td>

                        {/* Passes with Inline Edit */}
                        <td className="p-3 text-center">
                          {isEditingPasses ? (
                            <div className="inline-flex items-center justify-center gap-1">
                              <input
                                type="number"
                                min={1}
                                max={50}
                                value={passesDraft}
                                onChange={(e) => setPassesDraft(Math.max(1, parseInt(e.target.value) || 1))}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') handleSavePasses(item.sourceId, item.sourceType);
                                  if (e.key === 'Escape') setEditingPassesId(null);
                                }}
                                className="w-14 px-1.5 py-0.5 bg-stone-900 border border-amber-500 rounded text-center text-xs text-stone-100 outline-none"
                                autoFocus
                              />
                              <button
                                type="button"
                                onClick={() => handleSavePasses(item.sourceId, item.sourceType)}
                                className="p-1 rounded bg-amber-600 hover:bg-amber-500 text-stone-950 cursor-pointer"
                                title="Guardar pases"
                              >
                                <Icons.Check className="w-3 h-3" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingPassesId(null)}
                                className="p-1 rounded bg-stone-800 hover:bg-stone-700 text-stone-400 cursor-pointer"
                                title="Cancelar"
                              >
                                <Icons.X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="inline-flex items-center justify-center gap-1 group">
                              <span className="inline-block px-2.5 py-1 rounded-full bg-stone-900 border border-stone-800 font-mono text-stone-300">
                                {item.passes} {item.passes === 1 ? 'pase' : 'pases'}
                              </span>
                              <button
                                type="button"
                                onClick={() => handleStartEditPasses(item.sourceId, item.passes)}
                                className="opacity-60 group-hover:opacity-100 text-stone-400 hover:text-amber-400 transition-opacity p-0.5 cursor-pointer"
                                title="Editar pases asignados"
                              >
                                <Icons.Edit2 className="w-3 h-3" />
                              </button>
                            </div>
                          )}
                        </td>

                        {/* Reason / Status */}
                        <td className="p-3">
                          {item.reason === 'declined' ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-red-950/40 text-red-400 border border-red-800/40 text-[10px]">
                              <Icons.X className="w-2.5 h-2.5" />
                              <span>Declinó en 1ª Etapa</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-stone-900 text-stone-400 border border-stone-800 text-[10px]">
                              <Icons.Clock className="w-2.5 h-2.5 text-amber-500" />
                              <span>Sin registrar en web</span>
                            </span>
                          )}
                        </td>

                        {/* WhatsApp & Dedicated Link (ALWAYS CREATED) */}
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            <a
                              href={whatsappUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-400 border border-emerald-800/40 rounded-lg text-[11px] font-medium transition-all cursor-pointer active:scale-95"
                              title={
                                item.phone
                                  ? `Abrir chat directo con ${item.phone} (Enlace personalizado)`
                                  : 'Sin celular: abre WhatsApp para elegir el contacto a quien preguntar'
                              }
                            >
                              <Icons.MessageCircle className="w-3 h-3 text-emerald-400" />
                              <span>{item.phone ? 'WhatsApp' : 'WhatsApp (Elegir)'}</span>
                            </a>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(dedicatedUrl);
                                setActionFeedback(`Enlace dedicado copiado para ${item.name}`);
                                setTimeout(() => setActionFeedback(null), 3000);
                              }}
                              className="p-1 rounded-lg bg-stone-900 hover:bg-stone-800 text-stone-400 hover:text-amber-400 border border-stone-800 transition-colors cursor-pointer"
                              title="Copiar enlace dedicado personalizado"
                            >
                              <Icons.Copy className="w-3 h-3" />
                            </button>
                          </div>
                        </td>

                        {/* MOVE TO SECOND CONFIRMATION BUTTONS */}
                        <td className="p-3 text-center">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Move and mark YES */}
                            <button
                              type="button"
                              onClick={() => handleMoveToSecondConfirmation(item, 'yes')}
                              disabled={isItemUpdating}
                              className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-stone-950 font-semibold rounded-lg text-[11px] transition-all cursor-pointer shadow-sm active:scale-95"
                              title="Confirmar manual y mover a la lista oficial con SÍ asistirá"
                            >
                              <Icons.ArrowUp className="w-3 h-3" />
                              <span>Mover como SÍ</span>
                            </button>

                            {/* Move as Pending */}
                            <button
                              type="button"
                              onClick={() => handleMoveToSecondConfirmation(item, 'pending')}
                              disabled={isItemUpdating}
                              className="flex items-center gap-1 px-2 py-1 bg-stone-800 hover:bg-stone-700 text-amber-300 font-medium rounded-lg text-[11px] transition-all cursor-pointer"
                              title="Mover a la Segunda Confirmación como Pendiente para decidir después"
                            >
                              <Icons.Plus className="w-3 h-3" />
                              <span>Mover Pendiente</span>
                            </button>
                          </div>
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

      {/* 6. FRONTEND INVITATION PREVIEW / LINK BANNER */}
      <div className="pt-6 pb-2 border-t border-stone-800">
        <div className="bg-stone-900/60 border border-amber-600/30 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 text-left">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
              <Icons.ExternalLink className="w-5 h-5" />
            </div>
            <div>
              <h5 className="text-sm font-semibold text-stone-200">
                Frontend de Segunda Confirmación para Invitados
              </h5>
              <p className="text-xs text-stone-400">
                Aquí los invitados ingresan o buscan su nombre para ver sus pases asignados y confirmar con botones interactivos minimalistas, postal con foto, logo y pie de página.
              </p>
            </div>
          </div>

          <a
            href="?confirmacion2=true"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-semibold text-xs tracking-wider uppercase transition-all shadow-md active:scale-95 shrink-0"
          >
            <span>Abrir Vista Invitados</span>
            <Icons.ExternalLink className="w-4 h-4" />
          </a>
        </div>
      </div>
    </div>
  );
}
