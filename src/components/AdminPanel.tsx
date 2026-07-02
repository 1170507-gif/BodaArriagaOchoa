import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { db, isFirebaseActive, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, deleteDoc, doc, addDoc, updateDoc } from 'firebase/firestore';
import { getApiUrl } from '../utils/apiUrl';
import { RsvpResponse, WeddingConfig, Guest } from '../types';
import EditorPanel from './EditorPanel';

interface AdminPanelProps {
  config: WeddingConfig;
  onVideoUploaded: (newVideoUrl: string) => void;
  onMusicUploaded?: (newMusicUrl: string) => void;
  onConfigChange: (newConfig: WeddingConfig) => void;
  onAdminStatusChange?: (status: boolean) => void;
}

export default function AdminPanel({ config, onVideoUploaded, onMusicUploaded, onConfigChange, onAdminStatusChange }: AdminPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isAdminUrl, setIsAdminUrl] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    onAdminStatusChange?.(isAuthenticated);
  }, [isAuthenticated, onAdminStatusChange]);
  const [rsvps, setRsvps] = useState<RsvpResponse[]>([]);
  const [isLoadingRsvps, setIsLoadingRsvps] = useState(false);
  
  // Tab state
  const [activeTab, setActiveTab] = useState<'guests' | 'rsvps' | 'video' | 'audio' | 'design'>('guests');

  // Guest manager states
  const [guests, setGuests] = useState<Guest[]>([]);
  const [isLoadingGuests, setIsLoadingGuests] = useState(false);
  const [newGuestName, setNewGuestName] = useState('');
  const [newGuestMax, setNewGuestMax] = useState(2);
  const [bulkImportText, setBulkImportText] = useState('');
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [copiedGuestId, setCopiedGuestId] = useState<string | null>(null);
  
  // Video upload states
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadError, setUploadError] = useState('');
  const [localVideoActive, setLocalVideoActive] = useState(false);

  // Audio upload states
  const [audioUploadProgress, setAudioUploadProgress] = useState<number | null>(null);
  const [audioUploadStatus, setAudioUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [audioUploadError, setAudioUploadError] = useState('');
  const [localAudioActive, setLocalAudioActive] = useState(false);

  // Check if admin parameter is present in URL or hash on mount/location change
  useEffect(() => {
    const checkAdminParam = () => {
      const params = new URLSearchParams(window.location.search);
      const isParamAdmin = params.get('admin') === 'true' || params.has('admin');
      const isHashAdmin = window.location.hash.includes('admin');
      const active = isParamAdmin || isHashAdmin;
      setIsAdminUrl(active);
      if (active) {
        setIsOpen(true);
      }
    };
    checkAdminParam();
    window.addEventListener('popstate', checkAdminParam);
    window.addEventListener('hashchange', checkAdminParam);
    return () => {
      window.removeEventListener('popstate', checkAdminParam);
      window.removeEventListener('hashchange', checkAdminParam);
    };
  }, []);

  // Check if server-side video and audio exist on mount
  useEffect(() => {
    fetch(getApiUrl('/api/video-status'))
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          setLocalVideoActive(true);
        }
      })
      .catch(err => console.error('Error checking video status:', err));

    fetch(getApiUrl('/api/audio-status'))
      .then(res => res.json())
      .then(data => {
        if (data.exists) {
          setLocalAudioActive(true);
        }
      })
      .catch(err => console.error('Error checking audio status:', err));
  }, []);

  // Fetch RSVPs and Guests from Firestore/LocalStorage when authenticated & open
  useEffect(() => {
    if (isAuthenticated && isOpen) {
      loadRsvps();
      loadGuests();
    }
  }, [isAuthenticated, isOpen]);

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // remove accents
      .replace(/[^a-z0-9\s-]/g, "") // remove special characters
      .trim()
      .replace(/\s+/g, "-"); // replace spaces with hyphens
  };

  const loadGuests = async () => {
    setIsLoadingGuests(true);
    if (isFirebaseActive && db) {
      try {
        const querySnapshot = await getDocs(collection(db, 'guests'));
        const list: Guest[] = [];
        querySnapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as Guest);
        });
        // Sort alphabetically by name
        list.sort((a, b) => a.name.localeCompare(b.name));
        setGuests(list);
      } catch (err) {
        console.error('Error loading guests from Firestore:', err);
      } finally {
        setIsLoadingGuests(false);
      }
    } else {
      const saved = localStorage.getItem('wedding_guests_v1');
      if (saved) {
        try {
          const list = JSON.parse(saved) as Guest[];
          list.sort((a, b) => a.name.localeCompare(b.name));
          setGuests(list);
        } catch (e) {
          console.error(e);
        }
      }
      setIsLoadingGuests(false);
    }
  };

  const handleCreateGuest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGuestName.trim()) return;

    const slug = generateSlug(newGuestName);
    const newGuest: Omit<Guest, 'id'> = {
      name: newGuestName.trim(),
      maxGuests: Number(newGuestMax),
      code: slug,
      confirmed: false,
    };

    if (isFirebaseActive && db) {
      try {
        await addDoc(collection(db, 'guests'), newGuest);
        setNewGuestName('');
        setNewGuestMax(2);
        loadGuests();
      } catch (err) {
        console.error('Error creating guest in Firestore:', err);
        const errorText = err instanceof Error ? err.message : String(err);
        alert('Error al guardar el invitado en la base de datos: ' + errorText);
        try {
          handleFirestoreError(err, OperationType.CREATE, 'guests');
        } catch (e) {
          // Handled
        }
      }
    } else {
      const saved = localStorage.getItem('wedding_guests_v1');
      let list: Guest[] = [];
      if (saved) {
        try {
          list = JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }
      const fullGuest: Guest = {
        id: `guest-${Date.now()}`,
        ...newGuest,
      };
      const updated = [fullGuest, ...list];
      localStorage.setItem('wedding_guests_v1', JSON.stringify(updated));
      setNewGuestName('');
      setNewGuestMax(2);
      loadGuests();
    }
  };

  const handleDeleteGuest = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este invitado de la lista?')) return;

    if (isFirebaseActive && db) {
      try {
        await deleteDoc(doc(db, 'guests', id));
        setGuests(prev => prev.filter(item => item.id !== id));
      } catch (err) {
        console.error('Error deleting guest from Firestore:', err);
        const errorText = err instanceof Error ? err.message : String(err);
        alert('Error al eliminar de la base de datos: ' + errorText);
        try {
          handleFirestoreError(err, OperationType.DELETE, `guests/${id}`);
        } catch (e) {
          // Handled
        }
      }
    } else {
      const saved = localStorage.getItem('wedding_guests_v1');
      if (saved) {
        try {
          const list = JSON.parse(saved) as Guest[];
          const updated = list.filter(item => item.id !== id);
          localStorage.setItem('wedding_guests_v1', JSON.stringify(updated));
          setGuests(updated);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  const handleBulkImport = async () => {
    if (!bulkImportText.trim()) return;

    const lines = bulkImportText.split('\n');
    const importedGuests: Omit<Guest, 'id'>[] = [];

    for (let line of lines) {
      line = line.trim();
      if (!line) continue;

      let name = line;
      let maxGuests = 2; // default

      // Try parsing comma separation: "Name, passes"
      if (line.includes(',')) {
        const parts = line.split(',');
        name = parts[0].trim();
        const parsedMax = parseInt(parts[1].trim(), 10);
        if (!isNaN(parsedMax)) {
          maxGuests = parsedMax;
        }
      } else {
        // Try parsing space-separated numbers at the end
        const match = line.match(/(.+?)\s+(\d+)$/);
        if (match) {
          name = match[1].trim();
          maxGuests = parseInt(match[2], 10);
        }
      }

      if (name) {
        importedGuests.push({
          name,
          maxGuests,
          code: generateSlug(name),
          confirmed: false,
        });
      }
    }

    if (importedGuests.length === 0) {
      alert('No se detectaron invitados válidos. Usa el formato: Nombre, pases');
      return;
    }

    if (isFirebaseActive && db) {
      try {
        for (const g of importedGuests) {
          await addDoc(collection(db, 'guests'), g);
        }
        alert(`¡Se importaron ${importedGuests.length} invitados con éxito!`);
        setBulkImportText('');
        setIsBulkImportOpen(false);
        loadGuests();
      } catch (err) {
        console.error('Error in bulk import:', err);
        const errorText = err instanceof Error ? err.message : String(err);
        alert('Error al guardar en la base de datos: ' + errorText);
        try {
          handleFirestoreError(err, OperationType.CREATE, 'guests');
        } catch (e) {
          // Handled
        }
      }
    } else {
      const saved = localStorage.getItem('wedding_guests_v1');
      let list: Guest[] = [];
      if (saved) {
        try {
          list = JSON.parse(saved);
        } catch (e) {
          console.error(e);
        }
      }

      const newWithIds = importedGuests.map((g, i) => ({
        id: `guest-${Date.now()}-${i}`,
        ...g,
      }));

      const updated = [...newWithIds, ...list];
      localStorage.setItem('wedding_guests_v1', JSON.stringify(updated));
      alert(`¡Se importaron ${importedGuests.length} invitados localmente!`);
      setBulkImportText('');
      setIsBulkImportOpen(false);
      loadGuests();
    }
  };

  const handleCopyLink = (guest: Guest) => {
    const shareUrl = `${window.location.origin}${window.location.pathname}?g=${guest.code}`;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedGuestId(guest.id);
      setTimeout(() => setCopiedGuestId(null), 2000);
    });
  };

  const loadRsvps = async () => {
    setIsLoadingRsvps(true);
    if (isFirebaseActive && db) {
      try {
        const querySnapshot = await getDocs(collection(db, 'rsvps'));
        const list: RsvpResponse[] = [];
        querySnapshot.forEach((doc) => {
          list.push({ id: doc.id, ...doc.data() } as RsvpResponse);
        });
        // Sort by date submitted desc
        list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
        setRsvps(list);
      } catch (err) {
        console.error('Error loading RSVPs from Firestore:', err);
      } finally {
        setIsLoadingRsvps(false);
      }
    } else {
      // Load local RSVPs
      const saved = localStorage.getItem('wedding_rsvps_v1');
      if (saved) {
        try {
          const list = JSON.parse(saved) as RsvpResponse[];
          list.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());
          setRsvps(list);
        } catch (e) {
          console.error(e);
        }
      }
      setIsLoadingRsvps(false);
    }
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPass = password.trim().toLowerCase();
    if (cleanPass === 'boda' || cleanPass === '1234' || cleanPass === 'alejandro' || cleanPass === 'admin') {
      setIsAuthenticated(true);
      setErrorMsg('');
    } else {
      setErrorMsg('Contraseña incorrecta. Prueba con "boda" o "1234"');
    }
  };

  // RSVP Management: Delete RSVP
  const handleDeleteRsvp = async (id: string) => {
    if (!window.confirm('¿Estás seguro de que deseas eliminar este RSVP?')) return;

    if (isFirebaseActive && db) {
      try {
        await deleteDoc(doc(db, 'rsvps', id));
        setRsvps(prev => prev.filter(item => item.id !== id));
      } catch (err) {
        console.error('Error deleting RSVP from Firestore:', err);
        const errorText = err instanceof Error ? err.message : String(err);
        alert('Error al eliminar de la base de datos: ' + errorText);
        try {
          handleFirestoreError(err, OperationType.DELETE, `rsvps/${id}`);
        } catch (e) {
          // Handled
        }
      }
    } else {
      const saved = localStorage.getItem('wedding_rsvps_v1');
      if (saved) {
        try {
          const list = JSON.parse(saved) as RsvpResponse[];
          const updated = list.filter(item => item.id !== id);
          localStorage.setItem('wedding_rsvps_v1', JSON.stringify(updated));
          setRsvps(updated);
        } catch (e) {
          console.error(e);
        }
      }
    }
  };

  // CSV Export
  const handleExportCSV = () => {
    if (rsvps.length === 0) {
      alert('No hay respuestas para exportar.');
      return;
    }

    // CSV structure
    const headers = ['Nombre Completo', 'Teléfono', 'Asistencia', 'Acompañantes', 'Notas/Restricciones', 'Fecha de Registro'];
    const rows = rsvps.map(item => [
      item.fullName || (item as any).name || 'Invitado',
      item.phone || (item as any).email || 'N/A',
      item.attending === 'yes' ? 'Asistirá' : 'No asistirá',
      item.attending === 'yes' ? (item.guestsCount ?? (item as any).guests ?? 1) : 0,
      item.notes ? item.notes.replace(/\n/g, ' ') : '',
      new Date(item.submittedAt).toLocaleString('es-ES')
    ]);

    const csvContent = "\uFEFF" + [headers.join(','), ...rows.map(e => e.map(val => `"${val}"`).join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `RSVPs_Boda_${config.coupleName1}_y_${config.coupleName2}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Server-Side Video File Upload Handler
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadError('');

    try {
      const reader = new FileReader();

      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', getApiUrl('/api/upload-video'), true);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const percentComplete = Math.round((evt.loaded / evt.total) * 100);
              setUploadProgress(percentComplete);
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              try {
                const response = JSON.parse(xhr.responseText);
                setUploadStatus('success');
                setLocalVideoActive(true);
                // Call parent callback to instantly switch to the server-hosted video url!
                onVideoUploaded(response.url);
              } catch (err) {
                setUploadStatus('error');
                setUploadError('Error parsing server response');
              }
            } else {
              setUploadStatus('error');
              setUploadError(`Error del servidor: ${xhr.status} ${xhr.statusText}`);
            }
          };

          xhr.onerror = () => {
            setUploadStatus('error');
            setUploadError('Error de red al subir el archivo');
          };

          xhr.send(arrayBuffer);
        } catch (err: any) {
          setUploadStatus('error');
          setUploadError(err.message || 'Error al iniciar la subida');
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setUploadStatus('error');
      setUploadError('Error al leer el archivo local');
    }
  };

  // Server-Side Audio File Upload Handler
  const handleAudioUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setAudioUploadStatus('uploading');
    setAudioUploadProgress(0);
    setAudioUploadError('');

    try {
      const reader = new FileReader();

      reader.onload = async (event) => {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        
        try {
          const xhr = new XMLHttpRequest();
          xhr.open('POST', getApiUrl('/api/upload-audio'), true);
          xhr.setRequestHeader('Content-Type', 'application/octet-stream');

          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable) {
              const percentComplete = Math.round((evt.loaded / evt.total) * 100);
              setAudioUploadProgress(percentComplete);
            }
          };

          xhr.onload = () => {
            if (xhr.status === 200) {
              try {
                const response = JSON.parse(xhr.responseText);
                setAudioUploadStatus('success');
                setLocalAudioActive(true);
                // Call parent callback to instantly switch to the server-hosted audio url!
                onMusicUploaded?.(response.url);
              } catch (err) {
                setAudioUploadStatus('error');
                setAudioUploadError('Error parsing server response');
              }
            } else {
              setAudioUploadStatus('error');
              setAudioUploadError(`Error del servidor: ${xhr.status} ${xhr.statusText}`);
            }
          };

          xhr.onerror = () => {
            setAudioUploadStatus('error');
            setAudioUploadError('Error de red al subir el archivo');
          };

          xhr.send(arrayBuffer);
        } catch (err: any) {
          setAudioUploadStatus('error');
          setAudioUploadError(err.message || 'Error al iniciar la subida');
        }
      };

      reader.readAsArrayBuffer(file);
    } catch (err: any) {
      setAudioUploadStatus('error');
      setAudioUploadError('Error al leer el archivo local');
    }
  };

  return (
    <>
      {/* Discreet floating admin access button in the bottom right corner (only visible if secret URL param ?admin=true is active) */}
      {isAdminUrl && (
        <div className="fixed bottom-6 right-6 z-40">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-xs uppercase tracking-widest rounded-full bg-white/10 hover:bg-white/20 text-stone-300 border border-stone-200/10 hover:border-stone-200/20 backdrop-blur-md shadow-lg transition-all duration-300 cursor-pointer"
          >
            <Icons.SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Panel Organizador</span>
          </motion.button>
        </div>
      )}

      {/* Admin Panel Modal Overlay */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="relative w-full max-w-4xl bg-stone-900 border border-stone-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col max-h-[90vh]"
            >
              {/* Header */}
              <div className="p-6 border-b border-stone-800 flex items-center justify-between bg-stone-950/40">
                <div className="flex items-center gap-2 text-stone-200">
                  <Icons.Settings className="w-5 h-5 text-amber-600" />
                  <h3 className="font-medium tracking-wide uppercase text-sm md:text-base">
                    Panel de Control - Alejandro & Alejandra
                  </h3>
                </div>
                <button
                  onClick={() => {
                    setIsOpen(false);
                    setErrorMsg('');
                  }}
                  className="p-1.5 rounded-full hover:bg-stone-800 text-stone-400 hover:text-stone-100 transition-colors cursor-pointer"
                >
                  <Icons.X className="w-5 h-5" />
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-8">
                {!isAuthenticated ? (
                  /* Authentication Form */
                  <form onSubmit={handleLogin} className="max-w-md mx-auto py-12 space-y-6 text-center">
                    <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-2xl flex flex-col items-center">
                      <Icons.Lock className="w-8 h-8 text-amber-600 mb-2" />
                      <p className="text-xs text-stone-400 leading-relaxed">
                        Este panel es exclusivo para los novios para ver la base de datos de invitados y subir su propio video de fondo.
                      </p>
                    </div>

                    <div className="space-y-2 text-left">
                      <label className="text-xs uppercase tracking-widest text-stone-400">
                        Código de Acceso
                      </label>
                      <input
                        type="password"
                        required
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Prueba con 'boda' o '1234'"
                        className="w-full px-4 py-3 rounded-xl border border-stone-800 bg-stone-950/50 text-stone-200 focus:outline-none focus:border-amber-600 text-sm tracking-wider"
                      />
                      {errorMsg && (
                        <p className="text-xs text-red-400 mt-1">{errorMsg}</p>
                      )}
                    </div>

                    <button
                      type="submit"
                      className="w-full py-3 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-xl font-medium text-sm uppercase tracking-widest transition-colors cursor-pointer"
                    >
                      Ingresar al Panel
                    </button>
                  </form>
                ) : (
                  /* Authenticated View */
                  <div className="space-y-6">
                    {/* Navigation Tabs */}
                    <div className="flex border-b border-stone-800 gap-1 overflow-x-auto pb-px">
                      <button
                        type="button"
                        onClick={() => setActiveTab('guests')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                          activeTab === 'guests'
                            ? 'border-amber-600 text-stone-100 bg-stone-900/40'
                            : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/10'
                        }`}
                      >
                        <Icons.UserCheck className="w-4 h-4 text-amber-500" />
                        <span>Lista de Invitados</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('rsvps')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                          activeTab === 'rsvps'
                            ? 'border-amber-600 text-stone-100 bg-stone-900/40'
                            : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/10'
                        }`}
                      >
                        <Icons.Users className="w-4 h-4 text-amber-500" />
                        <span>Respuestas (RSVPs)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('video')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                          activeTab === 'video'
                            ? 'border-amber-600 text-stone-100 bg-stone-900/40'
                            : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/10'
                        }`}
                      >
                        <Icons.Video className="w-4 h-4 text-amber-500" />
                        <span>Video de Fondo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('audio')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                          activeTab === 'audio'
                            ? 'border-amber-600 text-stone-100 bg-stone-900/40'
                            : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/10'
                        }`}
                      >
                        <Icons.Music className="w-4 h-4 text-amber-500" />
                        <span>Música de Fondo</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setActiveTab('design')}
                        className={`flex items-center gap-2 px-4 py-2.5 text-xs font-semibold uppercase tracking-wider border-b-2 cursor-pointer transition-all whitespace-nowrap ${
                          activeTab === 'design'
                            ? 'border-amber-600 text-stone-100 bg-stone-900/40'
                            : 'border-transparent text-stone-400 hover:text-stone-200 hover:bg-stone-900/10'
                        }`}
                      >
                        <Icons.Palette className="w-4 h-4 text-amber-500" />
                        <span>Diseño y Contenido</span>
                      </button>
                    </div>

                    {/* Tab 1: GUESTS LIST MANAGER */}
                    {activeTab === 'guests' && (
                      <div className="space-y-6">
                        {/* Control header & Add form */}
                        <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-6 space-y-4">
                          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-stone-800 pb-4">
                            <div>
                              <h4 className="text-sm font-semibold text-stone-200 flex items-center gap-1.5">
                                <Icons.UserPlus className="w-4 h-4 text-amber-500" />
                                <span>Gestor de Pases e Invitados</span>
                              </h4>
                              <p className="text-xs text-stone-400 mt-0.5">
                                Registra quiénes son tus invitados oficiales y cuántos cupos o pases tienen permitidos para evitar sobre-registros.
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={loadGuests}
                                className="p-2 rounded-xl border border-stone-800 hover:border-stone-700 bg-stone-900 text-stone-300 hover:text-stone-100 transition-all cursor-pointer"
                                title="Recargar lista"
                              >
                                <Icons.RefreshCw className={`w-4 h-4 ${isLoadingGuests ? 'animate-spin' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={() => setIsBulkImportOpen(!isBulkImportOpen)}
                                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-stone-800 hover:border-stone-700 bg-stone-900 hover:bg-stone-800 text-stone-300 hover:text-stone-100 rounded-xl transition-all cursor-pointer"
                              >
                                <Icons.Sparkles className="w-3.5 h-3.5 text-amber-500" />
                                <span>Importación Masiva</span>
                              </button>
                            </div>
                          </div>

                          {/* Bulk Import Collapsible Section */}
                          {isBulkImportOpen && (
                            <div className="p-4 bg-stone-900/60 border border-stone-800 rounded-xl space-y-3">
                              <h5 className="text-xs font-semibold text-stone-200 flex items-center gap-1">
                                <Icons.Copy className="w-3.5 h-3.5 text-amber-500" />
                                <span>Importador Rápido (Copia y Pega)</span>
                              </h5>
                              <p className="text-[11px] text-stone-400 leading-relaxed">
                                Escribe o pega tus invitados, uno por línea. Puedes incluir el número de pases separados por una coma o un espacio al final.
                                <br />
                                <strong>Ejemplo:</strong>
                                <br />
                                <span className="text-amber-500/80 font-mono text-[10px]">
                                  Juan Pérez, 2
                                  <br />
                                  María Gómez, 1
                                  <br />
                                  Familia Díaz Martínez, 4
                                </span>
                              </p>
                              <textarea
                                value={bulkImportText}
                                onChange={(e) => setBulkImportText(e.target.value)}
                                placeholder="Ingresa tus invitados aquí..."
                                rows={5}
                                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-800 bg-stone-950 text-stone-200 focus:outline-none focus:border-amber-600 font-mono"
                              />
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={handleBulkImport}
                                  className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg text-xs font-semibold uppercase tracking-wider transition-colors cursor-pointer"
                                >
                                  Procesar e Importar
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setIsBulkImportOpen(false)}
                                  className="px-3 py-1.5 border border-stone-800 hover:border-stone-700 text-stone-400 hover:text-stone-200 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                                >
                                  Cancelar
                                </button>
                              </div>
                            </div>
                          )}

                          {/* Individual Add Form */}
                          <form onSubmit={handleCreateGuest} className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div className="space-y-1 sm:col-span-2 text-left">
                              <label className="text-[10px] uppercase tracking-wider text-stone-400">
                                Nombre del Invitado o Grupo (Ej: Sr. y Sra. Gómez / Juan Pérez)
                              </label>
                              <input
                                type="text"
                                required
                                value={newGuestName}
                                onChange={(e) => setNewGuestName(e.target.value)}
                                placeholder="Escribe el nombre tal como irá en la invitación..."
                                className="w-full px-3 py-2 text-xs rounded-lg border border-stone-800 bg-stone-950 text-stone-200 focus:outline-none focus:border-amber-600"
                              />
                            </div>
                            <div className="flex gap-2 items-end">
                              <div className="space-y-1 flex-1 text-left">
                                <label className="text-[10px] uppercase tracking-wider text-stone-400">
                                  Pases/Cupos
                                </label>
                                <input
                                  type="number"
                                  min={1}
                                  max={20}
                                  required
                                  value={newGuestMax}
                                  onChange={(e) => setNewGuestMax(Number(e.target.value))}
                                  className="w-full px-3 py-2 text-xs rounded-lg border border-stone-800 bg-stone-950 text-stone-200 focus:outline-none focus:border-amber-600 text-center font-mono"
                                />
                              </div>
                              <button
                                type="submit"
                                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-stone-950 rounded-lg text-xs font-semibold uppercase tracking-widest transition-colors cursor-pointer whitespace-nowrap"
                              >
                                Agregar
                              </button>
                            </div>
                          </form>
                        </div>

                        {/* Guest list summary cards */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                          <div className="p-4 bg-stone-950/30 border border-stone-800 rounded-2xl text-center">
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">Grupos Invitados</p>
                            <p className="text-xl font-bold text-stone-100 mt-1">{guests.length}</p>
                          </div>
                          <div className="p-4 bg-stone-950/30 border border-stone-800 rounded-2xl text-center">
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">Total Pases Asignados</p>
                            <p className="text-xl font-bold text-amber-500 mt-1">
                              {guests.reduce((acc, g) => acc + g.maxGuests, 0)}
                            </p>
                          </div>
                          <div className="p-4 bg-stone-950/30 border border-stone-800 rounded-2xl text-center">
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">Confirmados (Asistirá)</p>
                            <p className="text-xl font-bold text-emerald-500 mt-1">
                              {guests.filter(g => g.confirmed && g.attending === 'yes').length}
                            </p>
                          </div>
                          <div className="p-4 bg-stone-950/30 border border-stone-800 rounded-2xl text-center">
                            <p className="text-[10px] text-stone-400 uppercase tracking-wider font-medium">Pendientes</p>
                            <p className="text-xl font-bold text-stone-400 mt-1">
                              {guests.filter(g => !g.confirmed).length}
                            </p>
                          </div>
                        </div>

                        {/* Guest List table/list */}
                        {isLoadingGuests ? (
                          <div className="py-12 text-center text-stone-500 text-xs">
                            Cargando lista de invitados oficiales...
                          </div>
                        ) : guests.length === 0 ? (
                          <div className="py-12 text-center text-stone-500 text-xs border border-stone-800 border-dashed rounded-xl">
                            Aún no has registrado ningún invitado en la lista de pases oficiales.
                          </div>
                        ) : (
                          <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-950/20">
                            <div className="overflow-x-auto">
                              <table className="w-full text-left border-collapse text-xs">
                                <thead>
                                  <tr className="bg-stone-900 text-stone-400 border-b border-stone-800 uppercase tracking-wider">
                                    <th className="p-3 font-semibold">Invitado</th>
                                    <th className="p-3 font-semibold text-center">Pases Autorizados</th>
                                    <th className="p-3 font-semibold text-center">Estado</th>
                                    <th className="p-3 font-semibold">Enlace de Invitación (WhatsApp)</th>
                                    <th className="p-3 text-center">Acción</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-stone-800/50 text-stone-300">
                                  {guests.map((g) => {
                                    const shareUrl = `${window.location.origin}${window.location.pathname}?g=${g.code}`;
                                    const whatsappText = `¡Hola ${g.name}! Nos encantaría que nos acompañes en el día más feliz de nuestras vidas. Te compartimos nuestra invitación en el siguiente enlace: ${shareUrl}`;
                                    const whatsappUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(whatsappText)}`;

                                    return (
                                      <tr key={g.id} className="hover:bg-stone-900/30 transition-colors">
                                        <td className="p-3">
                                          <div className="font-semibold text-stone-100">{g.name}</div>
                                          <div className="text-[10px] text-stone-500 font-mono mt-0.5">slug: {g.code}</div>
                                        </td>
                                        <td className="p-3 text-center font-mono font-bold text-amber-500">
                                          {g.maxGuests} {g.maxGuests === 1 ? 'pase' : 'pases'}
                                        </td>
                                        <td className="p-3 text-center">
                                          {g.confirmed ? (
                                            g.attending === 'yes' ? (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                                                Confirmó ({g.guestsCount || g.maxGuests} pers)
                                              </span>
                                            ) : (
                                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20">
                                                No asistirá
                                              </span>
                                            )
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-stone-500/10 text-stone-400 text-[10px] font-semibold border border-stone-800">
                                              Pendiente
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-3">
                                          <div className="flex items-center gap-2">
                                            <button
                                              type="button"
                                              onClick={() => handleCopyLink(g)}
                                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 hover:border-stone-600 transition-colors cursor-pointer whitespace-nowrap"
                                            >
                                              {copiedGuestId === g.id ? (
                                                <>
                                                  <Icons.Check className="w-3 h-3 text-emerald-400" />
                                                  <span className="text-emerald-400">¡Copiado!</span>
                                                </>
                                              ) : (
                                                <>
                                                  <Icons.Copy className="w-3 h-3" />
                                                  <span>Copiar Enlace</span>
                                                </>
                                              )}
                                            </button>
                                            <a
                                              href={whatsappUrl}
                                              target="_blank"
                                              rel="noopener noreferrer"
                                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] rounded bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-600/30 hover:border-emerald-600/50 transition-colors cursor-pointer whitespace-nowrap"
                                            >
                                              <Icons.MessageCircle className="w-3 h-3" />
                                              <span>Enviar WhatsApp</span>
                                            </a>
                                          </div>
                                        </td>
                                        <td className="p-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteGuest(g.id)}
                                            className="p-1 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-red-400 transition-colors cursor-pointer"
                                            title="Eliminar de la lista"
                                          >
                                            <Icons.Trash2 className="w-4 h-4" />
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
                    )}

                    {/* Tab 2: RSVPs DATABASE */}
                    {activeTab === 'rsvps' && (
                      <div className="space-y-6">
                        <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-6 space-y-4">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-800 pb-3">
                            <div className="flex items-center gap-2">
                              <Icons.Users className="w-5 h-5 text-amber-500" />
                              <div className="text-left">
                                <h4 className="text-sm font-semibold text-stone-200">
                                  Base de Datos de Respuestas (RSVPs)
                                </h4>
                                <p className="text-xs text-stone-400">
                                  Aquí puedes ver las confirmaciones de asistencia enviadas por tus invitados en tiempo real.
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-2 self-start sm:self-auto">
                              <button
                                type="button"
                                onClick={loadRsvps}
                                className="p-2 rounded-xl border border-stone-800 hover:border-stone-700 bg-stone-900 text-stone-300 hover:text-stone-100 transition-all cursor-pointer"
                                title="Recargar base de datos"
                              >
                                <Icons.RefreshCw className={`w-4 h-4 ${isLoadingRsvps ? 'animate-spin' : ''}`} />
                              </button>
                              <button
                                type="button"
                                onClick={handleExportCSV}
                                className="flex items-center gap-1.5 px-4 py-2 text-xs uppercase tracking-wider bg-emerald-600 hover:bg-emerald-500 text-stone-950 rounded-xl font-semibold transition-colors cursor-pointer"
                              >
                                <Icons.Download className="w-3.5 h-3.5" />
                                <span>Exportar Excel/CSV</span>
                              </button>
                            </div>
                          </div>

                          {/* Summary cards */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                            <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl text-center">
                              <p className="text-xs text-stone-400 uppercase tracking-wider">Total Formularios</p>
                              <p className="text-2xl font-semibold text-stone-100 mt-1">{rsvps.length}</p>
                            </div>
                            <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl text-center">
                              <p className="text-xs text-stone-400 uppercase tracking-wider">Asistirán (Sí)</p>
                              <p className="text-2xl font-semibold text-emerald-500 mt-1">
                                {rsvps.filter(r => r.attending === 'yes').length}
                              </p>
                            </div>
                            <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl text-center">
                              <p className="text-xs text-stone-400 uppercase tracking-wider">No Asistirán (No)</p>
                              <p className="text-2xl font-semibold text-red-400 mt-1">
                                {rsvps.filter(r => r.attending === 'no').length}
                              </p>
                            </div>
                            <div className="p-4 bg-stone-900 border border-stone-800 rounded-xl text-center">
                              <p className="text-xs text-stone-400 uppercase tracking-wider font-medium">Total Personas</p>
                              <p className="text-2xl font-semibold text-amber-500 mt-1">
                                {rsvps.filter(r => r.attending === 'yes').reduce((acc, r) => acc + (r.guestsCount ?? (r as any).guests ?? 1), 0)}
                              </p>
                            </div>
                          </div>

                          {/* RSVP table/list */}
                          {isLoadingRsvps ? (
                            <div className="py-12 text-center text-stone-500 text-xs">
                              Cargando invitados...
                            </div>
                          ) : rsvps.length === 0 ? (
                            <div className="py-12 text-center text-stone-500 text-xs">
                              Aún no hay respuestas registradas.
                            </div>
                          ) : (
                            <div className="border border-stone-800 rounded-xl overflow-hidden bg-stone-950/20">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left border-collapse text-xs">
                                  <thead>
                                    <tr className="bg-stone-900 text-stone-400 border-b border-stone-800 uppercase tracking-wider">
                                      <th className="p-3 font-semibold">Invitado</th>
                                      <th className="p-3 font-semibold">Asistencia</th>
                                      <th className="p-3 font-semibold text-center">Acompañantes</th>
                                      <th className="p-3 font-semibold">Notas / Restricciones</th>
                                      <th className="p-3 font-semibold text-right">Fecha</th>
                                      <th className="p-3 text-center"></th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-stone-800/50 text-stone-300">
                                    {rsvps.map((item) => (
                                      <tr key={item.id} className="hover:bg-stone-900/30 transition-colors">
                                        <td className="p-3">
                                          <div className="font-medium text-stone-100">{item.fullName || (item as any).name || 'Invitado'}</div>
                                          <div className="text-[10px] text-stone-500 mt-0.5">{item.phone || (item as any).email || 'Sin teléfono'}</div>
                                        </td>
                                        <td className="p-3">
                                          {item.attending === 'yes' ? (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold border border-emerald-500/20">
                                              <Icons.Check className="w-3 h-3" />
                                              Asistirá
                                            </span>
                                          ) : (
                                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-red-500/10 text-red-400 text-[10px] font-semibold border border-red-500/20">
                                              <Icons.X className="w-3 h-3" />
                                              No asistirá
                                            </span>
                                          )}
                                        </td>
                                        <td className="p-3 text-center font-mono font-semibold text-stone-200">
                                          {item.attending === 'yes' ? (item.guestsCount ?? (item as any).guests ?? 1) : '-'}
                                        </td>
                                        <td className="p-3 max-w-[220px] truncate text-stone-400" title={item.notes || ''}>
                                          {item.notes || <span className="text-stone-600 italic">Ninguna</span>}
                                        </td>
                                        <td className="p-3 text-right text-[10px] text-stone-500 whitespace-nowrap">
                                          {item.submittedAt ? new Date(item.submittedAt).toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                                        </td>
                                        <td className="p-3 text-center">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteRsvp(item.id)}
                                            className="p-1 rounded-lg hover:bg-stone-800 text-stone-500 hover:text-red-400 transition-colors cursor-pointer"
                                            title="Eliminar registro"
                                          >
                                            <Icons.Trash2 className="w-4 h-4" />
                                          </button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Tab 3: VIDEO UPLOADER */}
                    {activeTab === 'video' && (
                      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-2 border-b border-stone-800 pb-3 text-left">
                          <Icons.Video className="w-5 h-5 text-amber-500" />
                          <div>
                            <h4 className="text-sm font-semibold text-stone-200">
                              Subir Video de Fondo Oficial (Servidor Propio)
                            </h4>
                            <p className="text-xs text-stone-400 mt-0.5">
                              Sube un archivo .mp4 vertical (9:16) para guardarlo directamente en tu servidor. Se reproducirá de forma nativa e instantánea en iPhones y Androids.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          {/* File selector input */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2.5 h-2.5 rounded-full ${localVideoActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <span className="text-xs text-stone-300">
                                Estado: {localVideoActive ? 'Video de fondo cargado en el servidor' : 'Usando video por defecto (sin subir)'}
                              </span>
                            </div>

                            <div className="relative border-2 border-dashed border-stone-800 hover:border-amber-600/50 rounded-xl p-6 text-center transition-all cursor-pointer bg-stone-950/30">
                              <input
                                type="file"
                                accept="video/mp4"
                                onChange={handleFileUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                              <Icons.UploadCloud className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                              <p className="text-xs text-stone-300 font-medium">
                                Haz clic para seleccionar o arrastra tu video (.mp4)
                              </p>
                              <p className="text-[10px] text-stone-500 mt-1">
                                Soporta archivos de hasta 150 MB (se recomienda comprimir para carga rápida)
                              </p>
                            </div>
                          </div>

                          {/* Upload Status / Progress */}
                          <div className="p-4 bg-stone-950/30 rounded-xl border border-stone-800 space-y-3 text-left">
                            <h5 className="text-xs text-stone-400 uppercase tracking-wider font-medium">
                              Estado de la subida
                            </h5>

                            {uploadStatus === 'idle' && (
                              <p className="text-xs text-stone-500">
                                Ninguna subida en curso. Esperando archivo.
                              </p>
                            )}

                            {uploadStatus === 'uploading' && (
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs text-amber-500 font-mono">
                                  <span>Subiendo video...</span>
                                  <span>{uploadProgress}%</span>
                                </div>
                                <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-amber-600 h-full transition-all duration-300"
                                    style={{ width: `${uploadProgress || 0}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-stone-400 italic">
                                  Guardando video directamente en el servidor. No cierres esta ventana.
                                </p>
                              </div>
                            )}

                            {uploadStatus === 'success' && (
                              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                                  <Icons.CheckCircle2 className="w-4 h-4" />
                                  <span>¡Video subido con éxito!</span>
                                </div>
                                <p className="text-[10px] text-stone-400">
                                  Tu video de fondo oficial ahora está guardado en el servidor y se reproducirá perfectamente para todos tus invitados.
                                </p>
                              </div>
                            )}

                            {uploadStatus === 'error' && (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1">
                                <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold">
                                  <Icons.AlertTriangle className="w-4 h-4" />
                                  <span>Error al subir</span>
                                </div>
                                <p className="text-[10px] text-red-300">
                                  {uploadError || 'Error desconocido al subir el archivo.'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 3.5: AUDIO UPLOADER */}
                    {activeTab === 'audio' && (
                      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-6 space-y-4">
                        <div className="flex items-center gap-2 border-b border-stone-800 pb-3 text-left">
                          <Icons.Music className="w-5 h-5 text-amber-500" />
                          <div>
                            <h4 className="text-sm font-semibold text-stone-200">
                              Subir Música de Fondo Oficial (Servidor Propio)
                            </h4>
                            <p className="text-xs text-stone-400 mt-0.5">
                              Sube un archivo .mp3 para guardarlo directamente en tu servidor. Se reproducirá de fondo automáticamente en la invitación para todos los invitados.
                            </p>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                          {/* File selector input */}
                          <div className="space-y-3">
                            <div className="flex items-center gap-2">
                              <span className={`inline-block w-2.5 h-2.5 rounded-full ${localAudioActive ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                              <span className="text-xs text-stone-300">
                                Estado: {localAudioActive ? 'Música de fondo cargada en el servidor' : 'Usando música por defecto o externa (sin subir)'}
                              </span>
                            </div>

                            <div className="relative border-2 border-dashed border-stone-800 hover:border-amber-600/50 rounded-xl p-6 text-center transition-all cursor-pointer bg-stone-950/30">
                              <input
                                type="file"
                                accept="audio/mp3,audio/*"
                                onChange={handleAudioUpload}
                                className="absolute inset-0 opacity-0 cursor-pointer"
                              />
                              <Icons.UploadCloud className="w-8 h-8 text-stone-400 mx-auto mb-2" />
                              <p className="text-xs text-stone-300 font-medium">
                                Haz clic para seleccionar o arrastra tu música (.mp3)
                              </p>
                              <p className="text-[10px] text-stone-500 mt-1">
                                Soporta archivos de audio de alta calidad (se recomiendan formatos comprimidos como MP3 para carga rápida)
                              </p>
                            </div>
                          </div>

                          {/* Upload Status / Progress */}
                          <div className="p-4 bg-stone-950/30 rounded-xl border border-stone-800 space-y-3 text-left">
                            <h5 className="text-xs text-stone-400 uppercase tracking-wider font-medium">
                              Estado de la subida
                            </h5>

                            {audioUploadStatus === 'idle' && (
                              <p className="text-xs text-stone-500">
                                Ninguna subida en curso. Esperando archivo.
                              </p>
                            )}

                            {audioUploadStatus === 'uploading' && (
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs text-amber-500 font-mono">
                                  <span>Subiendo música...</span>
                                  <span>{audioUploadProgress}%</span>
                                </div>
                                <div className="w-full bg-stone-800 h-2 rounded-full overflow-hidden">
                                  <div 
                                    className="bg-amber-600 h-full transition-all duration-300"
                                    style={{ width: `${audioUploadProgress || 0}%` }}
                                  />
                                </div>
                                <p className="text-[10px] text-stone-400 italic">
                                  Guardando audio directamente en el servidor. No cierres esta ventana.
                                </p>
                              </div>
                            )}

                            {audioUploadStatus === 'success' && (
                              <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl space-y-1">
                                <div className="flex items-center gap-1.5 text-emerald-400 text-xs font-semibold">
                                  <Icons.CheckCircle2 className="w-4 h-4" />
                                  <span>¡Música subida con éxito!</span>
                                </div>
                                <p className="text-[10px] text-stone-400">
                                  Tu canción oficial ahora está guardada en el servidor y se reproducirá perfectamente para todos tus invitados de manera elegante.
                                </p>
                              </div>
                            )}

                            {audioUploadStatus === 'error' && (
                              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl space-y-1">
                                <div className="flex items-center gap-1.5 text-red-400 text-xs font-semibold">
                                  <Icons.AlertTriangle className="w-4 h-4" />
                                  <span>Error al subir</span>
                                </div>
                                <p className="text-[10px] text-red-300">
                                  {audioUploadError || 'Error desconocido al subir el archivo.'}
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Tab 4: LIVE CONFIGURATION EDITOR */}
                    {activeTab === 'design' && (
                      <div className="bg-stone-950/40 border border-stone-800/80 rounded-2xl p-4 md:p-6 space-y-4 text-left">
                        <div className="flex items-center gap-2 border-b border-stone-800 pb-3">
                          <Icons.Palette className="w-5 h-5 text-amber-500" />
                          <div>
                            <h4 className="text-sm font-semibold text-stone-200">
                              Editor de Invitación en Vivo
                            </h4>
                            <p className="text-xs text-stone-400 mt-0.5">
                              Personaliza los nombres, colores, tipografías, eventos de la boda e imágenes de tu invitación. Los cambios se guardan instantáneamente.
                            </p>
                          </div>
                        </div>
                        <div className="bg-stone-900 border border-stone-800 rounded-xl overflow-hidden max-h-[60vh] flex flex-col">
                          <div className="flex-1 overflow-y-auto">
                            <EditorPanel
                              config={config}
                              onChangeConfig={onConfigChange}
                              rsvps={rsvps}
                              onClearRsvps={() => {}}
                              onResetToDefault={() => {}}
                              isFirebaseActive={isFirebaseActive}
                              onTriggerFirebaseSetup={() => {}}
                              localVideoUrl={null}
                              onVideoUpload={() => {}}
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}
