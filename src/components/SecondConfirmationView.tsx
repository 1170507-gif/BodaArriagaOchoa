import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { WeddingConfig, Guest, RsvpResponse } from '../types';
import { db, isFirebaseActive, handleFirestoreError, OperationType } from '../firebase';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { getApiUrl } from '../utils/apiUrl';

interface SecondConfirmationViewProps {
  config: WeddingConfig;
  onBackToMain?: () => void;
}

interface IdentifiedGuest {
  id: string;
  name: string;
  phone?: string;
  assignedPasses: number;
  sourceType: 'guest' | 'rsvp';
  secondConfirmation?: 'yes' | 'no' | 'pending';
  code?: string;
}

export default function SecondConfirmationView({
  config,
  onBackToMain,
}: SecondConfirmationViewProps) {
  const [selectedGuest, setSelectedGuest] = useState<IdentifiedGuest | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [hasValidLink, setHasValidLink] = useState(false);

  // Form states
  const [attendingChoice, setAttendingChoice] = useState<'yes' | 'no' | null>(null);
  const [confirmedPasses, setConfirmedPasses] = useState<number>(1);
  const [dietaryNotes, setDietaryNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const titleFont = config.theme?.fontTitle || 'serif';
  const bodyFont = config.theme?.fontBody || 'sans-serif';

  // Normalize string for safe comparison
  const normalize = (str: string) =>
    str.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  // 1. Fetch guest list from Firestore or fallback & identify by dedicated URL code ONLY
  useEffect(() => {
    const loadAndIdentifyGuest = async () => {
      setIsLoading(true);
      const combined: IdentifiedGuest[] = [];

      // Extract code from URL query parameters (strictly dedicated links)
      const params = new URLSearchParams(window.location.search);
      const rawCode = (
        params.get('g') ||
        params.get('codigo') ||
        params.get('code') ||
        params.get('id')
      )?.trim();

      const urlCode = rawCode ? normalize(rawCode) : '';

      if (isFirebaseActive && db) {
        try {
          // Load guests
          const guestsSnap = await getDocs(collection(db, 'guests'));
          guestsSnap.forEach((docSnap) => {
            const data = docSnap.data() as Guest;
            combined.push({
              id: docSnap.id,
              name: data.name,
              phone: data.phone,
              assignedPasses: data.maxGuests || 1,
              sourceType: 'guest',
              secondConfirmation: data.secondConfirmation,
              code: data.code || docSnap.id,
            });
          });

          // Load RSVPs (guests who RSVP'd with 1, 2 or more passes)
          const rsvpsSnap = await getDocs(collection(db, 'rsvps'));
          rsvpsSnap.forEach((docSnap) => {
            const data = docSnap.data() as RsvpResponse;
            const existing = combined.find(
              (g) => normalize(g.name) === normalize(data.fullName || '')
            );
            if (!existing) {
              combined.push({
                id: docSnap.id,
                name: data.fullName || 'Invitado',
                phone: data.phone,
                assignedPasses: data.guestsCount || 1,
                sourceType: 'rsvp',
                secondConfirmation: data.secondConfirmation,
                code: (data as any).code || docSnap.id,
              });
            } else if (data.guestsCount && data.guestsCount > existing.assignedPasses) {
              existing.assignedPasses = data.guestsCount;
              if (data.secondConfirmation) existing.secondConfirmation = data.secondConfirmation;
            }
          });
        } catch (err) {
          console.error('Error fetching guests in SecondConfirmationView:', err);
        }
      }

      // Local storage fallback if list is empty or offline
      if (combined.length === 0) {
        const localGuests = localStorage.getItem('wedding_guests_v1');
        if (localGuests) {
          try {
            const parsed = JSON.parse(localGuests) as Guest[];
            parsed.forEach((g) => {
              combined.push({
                id: g.id || `guest-${g.code}`,
                name: g.name,
                phone: g.phone,
                assignedPasses: g.maxGuests || 1,
                sourceType: 'guest',
                secondConfirmation: g.secondConfirmation,
                code: g.code || g.id,
              });
            });
          } catch (e) {
            console.error('Error parsing local guests:', e);
          }
        }

        const localRsvps = localStorage.getItem('wedding_rsvps_v1');
        if (localRsvps) {
          try {
            const parsed = JSON.parse(localRsvps) as RsvpResponse[];
            parsed.forEach((r) => {
              if (!combined.some((g) => normalize(g.name) === normalize(r.fullName || ''))) {
                combined.push({
                  id: r.id,
                  name: r.fullName || 'Invitado',
                  phone: r.phone,
                  assignedPasses: r.guestsCount || 1,
                  sourceType: 'rsvp',
                  secondConfirmation: r.secondConfirmation,
                  code: (r as any).code || r.id,
                });
              }
            });
          } catch (e) {
            console.error('Error parsing local rsvps:', e);
          }
        }
      }

      // Strictly identify guest via their dedicated code / id in URL
      if (urlCode && combined.length > 0) {
        const matched = combined.find((g) => {
          const normCode = g.code ? normalize(g.code) : '';
          const normId = g.id ? normalize(g.id) : '';
          const cleanPhone = g.phone ? g.phone.replace(/[^0-9]/g, '') : '';
          const cleanUrlCode = urlCode.replace(/[^0-9]/g, '');

          return (
            normCode === urlCode ||
            normId === urlCode ||
            (cleanUrlCode.length >= 7 && cleanPhone === cleanUrlCode)
          );
        });

        if (matched) {
          setSelectedGuest(matched);
          setHasValidLink(true);
          setConfirmedPasses(matched.assignedPasses);
          if (matched.secondConfirmation === 'yes' || matched.secondConfirmation === 'no') {
            setAttendingChoice(matched.secondConfirmation);
            setIsSubmitted(true);
          }
        } else {
          setHasValidLink(false);
          setSelectedGuest(null);
        }
      } else {
        setHasValidLink(false);
        setSelectedGuest(null);
      }

      setIsLoading(false);
    };

    loadAndIdentifyGuest();
  }, []);

  // Handle submit confirmation
  const handleConfirm = async (status: 'yes' | 'no') => {
    if (!selectedGuest) return;

    setAttendingChoice(status);
    setIsSubmitting(true);

    const guestName = selectedGuest.name;
    const passesToConfirm = status === 'yes' ? confirmedPasses : 0;
    const nowIso = new Date().toISOString();

    try {
      // 1. Update in Firestore
      if (isFirebaseActive && db) {
        const collectionName = selectedGuest.sourceType === 'guest' ? 'guests' : 'rsvps';
        const docRef = doc(db, collectionName, selectedGuest.id);
        await updateDoc(docRef, {
          secondConfirmation: status,
          secondConfirmedAt: nowIso,
          guestsCount: passesToConfirm > 0 ? passesToConfirm : selectedGuest.assignedPasses,
          notes: dietaryNotes.trim(),
        });
      }

      // 2. Update in Local Storage fallback
      if (selectedGuest.sourceType === 'guest') {
        const savedGuests = localStorage.getItem('wedding_guests_v1');
        if (savedGuests) {
          try {
            const list = JSON.parse(savedGuests) as Guest[];
            const updated = list.map((g) =>
              g.id === selectedGuest.id || g.code === selectedGuest.code
                ? {
                    ...g,
                    secondConfirmation: status,
                    secondConfirmedAt: nowIso,
                    guestsCount: passesToConfirm > 0 ? passesToConfirm : g.maxGuests,
                  }
                : g
            );
            localStorage.setItem('wedding_guests_v1', JSON.stringify(updated));
          } catch (e) {
            console.error('Error updating local guest:', e);
          }
        }
      } else {
        const savedRsvps = localStorage.getItem('wedding_rsvps_v1');
        if (savedRsvps) {
          try {
            const list = JSON.parse(savedRsvps) as RsvpResponse[];
            const updated = list.map((r) =>
              r.id === selectedGuest.id
                ? {
                    ...r,
                    secondConfirmation: status,
                    secondConfirmedAt: nowIso,
                    guestsCount: passesToConfirm > 0 ? passesToConfirm : r.guestsCount,
                  }
                : r
            );
            localStorage.setItem('wedding_rsvps_v1', JSON.stringify(updated));
          } catch (e) {
            console.error('Error updating local rsvp:', e);
          }
        }
      }

      // Update local state
      setSelectedGuest({
        ...selectedGuest,
        secondConfirmation: status,
      });

      setIsSubmitted(true);
      setToastMessage(
        status === 'yes'
          ? `¡Gracias ${guestName}! Tu asistencia con ${passesToConfirm} ${
              passesToConfirm === 1 ? 'pase' : 'pases'
            } ha sido ratificada.`
          : `Gracias por avisarnos ${guestName}. Lamentamos que no puedas acompañarnos.`
      );
    } catch (err) {
      console.error('Error recording second confirmation:', err);
      if (isFirebaseActive) {
        try {
          handleFirestoreError(err, OperationType.UPDATE, 'second_confirmation');
        } catch (e) {
          // Handled
        }
      }
      setToastMessage('Hubo un inconveniente al guardar. Por favor intenta de nuevo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const deadline = config.secondConfirmationDeadline || '12 de septiembre';

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-between text-stone-800 transition-colors duration-500 selection:bg-amber-200"
      style={{
        backgroundColor: config.theme?.bg || '#f9f6f0',
        fontFamily: bodyFont,
      }}
    >
      {/* TOP NAVIGATION BAR */}
      <header className="w-full max-w-2xl mx-auto pt-6 px-4 flex items-center justify-between z-20">
        {onBackToMain ? (
          <button
            type="button"
            onClick={onBackToMain}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-900/5 hover:bg-stone-900/10 text-stone-700 text-xs font-medium transition-all cursor-pointer"
          >
            <Icons.ArrowLeft className="w-3.5 h-3.5" />
            <span>Volver a la Invitación</span>
          </button>
        ) : (
          <a
            href={window.location.pathname}
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-stone-900/5 hover:bg-stone-900/10 text-stone-700 text-xs font-medium transition-all cursor-pointer"
          >
            <Icons.ArrowLeft className="w-3.5 h-3.5" />
            <span>Invitación Principal</span>
          </a>
        )}

        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-widest text-stone-500 font-medium">
          <Icons.Calendar className="w-3.5 h-3.5 text-amber-600" />
          <span>Límite: {deadline}</span>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="w-full max-w-xl mx-auto px-4 py-8 flex flex-col items-center text-center">
        {/* COUPLE MONOGRAM & TITLES */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="space-y-2 mb-6"
        >
          <span className="text-[10px] md:text-xs uppercase tracking-[0.35em] text-stone-500 font-medium">
            Segunda Confirmación Oficial
          </span>
          <h1
            className="text-3xl md:text-5xl font-light text-stone-900 tracking-wider"
            style={{ fontFamily: titleFont }}
          >
            {config.coupleName1} <span className="text-amber-700 font-serif italic">&</span>{' '}
            {config.coupleName2}
          </h1>
          <p className="text-xs md:text-sm text-stone-600 font-light max-w-md mx-auto pt-1">
            Estamos cerrando la lista final de comensales con el banquete y el salón. Por favor
            confirma tus pases para asegurar tu lugar.
          </p>
        </motion.div>

        {/* GUEST INTERACTIVE CONFIRMATION SECTION */}
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="w-full bg-white/80 backdrop-blur-md border border-stone-200 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6"
        >
          {isLoading ? (
            <div className="py-12 flex flex-col items-center justify-center space-y-3">
              <Icons.Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
              <p className="text-xs text-stone-500 uppercase tracking-wider">
                Verificando enlace de invitación...
              </p>
            </div>
          ) : !selectedGuest ? (
            /* DEDICATED LINK REQUIRED NOTICE (NO SEARCH BAR PERMITTED) */
            <div className="py-8 px-4 text-center space-y-5">
              <div className="w-14 h-14 rounded-full bg-amber-100/70 border border-amber-300/80 mx-auto flex items-center justify-center text-amber-800 shadow-xs">
                <Icons.Lock className="w-6 h-6" />
              </div>

              <div className="space-y-2 max-w-sm mx-auto">
                <h3
                  className="text-lg md:text-xl font-medium text-stone-900"
                  style={{ fontFamily: titleFont }}
                >
                  Acceso con Enlace Dedicado
                </h3>
                <p className="text-xs text-stone-600 leading-relaxed">
                  Esta ratificación oficial de comensales es estrictamente personal. Para confirmar
                  tus pases asignados, por favor accede desde el enlace individual que recibiste por
                  WhatsApp.
                </p>
              </div>

              <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                {onBackToMain ? (
                  <button
                    type="button"
                    onClick={onBackToMain}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-100 text-xs font-medium transition-all cursor-pointer shadow-sm"
                  >
                    Volver a la Invitación Principal
                  </button>
                ) : (
                  <a
                    href={window.location.pathname}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-stone-100 text-xs font-medium transition-all cursor-pointer shadow-sm"
                  >
                    Volver a la Invitación Principal
                  </a>
                )}
              </div>
            </div>
          ) : (
            /* GUEST DEDICATED CONFIRMATION CARD */
            <div className="space-y-6">
              {/* GUEST BADGE */}
              <div className="bg-stone-50/90 border border-stone-200 rounded-2xl p-4 sm:p-5 flex items-center justify-between text-left">
                <div className="space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-stone-400 font-medium block">
                    Invitación Personal
                  </span>
                  <h4
                    className="text-lg sm:text-xl font-semibold text-stone-900"
                    style={{ fontFamily: titleFont }}
                  >
                    {selectedGuest.name}
                  </h4>
                  <div className="flex items-center gap-2 pt-0.5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 border border-amber-300/80 text-amber-950 text-xs font-semibold">
                      <Icons.Ticket className="w-3.5 h-3.5 text-amber-700" />
                      <span>
                        {selectedGuest.assignedPasses}{' '}
                        {selectedGuest.assignedPasses === 1
                          ? 'pase asignado'
                          : 'pases asignados'}
                      </span>
                    </span>
                  </div>
                </div>

                <div className="w-10 h-10 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                  <Icons.UserCheck className="w-5 h-5" />
                </div>
              </div>

              {/* SUCCESS STATE */}
              {isSubmitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`p-6 rounded-2xl border text-center space-y-3 ${
                    attendingChoice === 'yes'
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
                      : 'bg-stone-50 border-stone-200 text-stone-800'
                  }`}
                >
                  <div
                    className={`w-12 h-12 rounded-full mx-auto flex items-center justify-center ${
                      attendingChoice === 'yes'
                        ? 'bg-emerald-600 text-white'
                        : 'bg-stone-700 text-white'
                    }`}
                  >
                    {attendingChoice === 'yes' ? (
                      <Icons.Check className="w-6 h-6" />
                    ) : (
                      <Icons.HeartHandshake className="w-6 h-6" />
                    )}
                  </div>

                  <h4 className="text-lg font-semibold" style={{ fontFamily: titleFont }}>
                    {attendingChoice === 'yes'
                      ? '¡Tu asistencia ha sido ratificada!'
                      : 'Respuesta registrada con éxito'}
                  </h4>

                  <p className="text-xs max-w-sm mx-auto opacity-85 leading-relaxed">
                    {attendingChoice === 'yes'
                      ? `¡Qué gran alegría contar con ustedes! Hemos reservado ${confirmedPasses} ${
                          confirmedPasses === 1 ? 'lugar' : 'lugares'
                        } para ${selectedGuest.name}.`
                      : `Sentiremos mucho tu ausencia en este día tan especial, pero agradecemos profundamente que nos hayas avisado.`}
                  </p>

                  <div className="pt-2 flex items-center justify-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsSubmitted(false)}
                      className="text-xs underline text-stone-500 hover:text-stone-800 cursor-pointer font-medium"
                    >
                      Modificar mi respuesta
                    </button>
                  </div>
                </motion.div>
              ) : (
                /* INTERACTIVE CONFIRMATION FORM */
                <div className="space-y-5">
                  <div className="text-center">
                    <p className="text-xs uppercase tracking-widest text-stone-500 font-medium">
                      ¿Nos acompañarán a celebrar?
                    </p>
                  </div>

                  {/* PASSES SELECTOR (DEDICATED SELECTOR FOR GUESTS WITH 2 OR MORE PASSES) */}
                  {selectedGuest.assignedPasses > 1 && (
                    <div className="p-4 rounded-2xl bg-amber-50/70 border border-amber-200 text-left space-y-2">
                      <label className="text-xs font-semibold text-amber-950 flex items-center justify-between">
                        <span>Selecciona la cantidad de pases que asistirán:</span>
                        <span className="font-mono text-amber-900 bg-white px-2 py-0.5 rounded-md border border-amber-200 text-[11px]">
                          {confirmedPasses} de {selectedGuest.assignedPasses}
                        </span>
                      </label>
                      <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 pt-1">
                        {Array.from(
                          { length: selectedGuest.assignedPasses },
                          (_, i) => i + 1
                        ).map((num) => (
                          <button
                            key={num}
                            type="button"
                            onClick={() => setConfirmedPasses(num)}
                            className={`py-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer border ${
                              confirmedPasses === num
                                ? 'bg-amber-700 text-white border-amber-700 shadow-xs'
                                : 'bg-white text-stone-700 border-stone-200 hover:border-amber-400'
                            }`}
                          >
                            {num} {num === 1 ? 'pase' : 'pases'}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* OPTIONAL DIETARY / SPECIAL NOTES */}
                  <div className="text-left space-y-1">
                    <label className="text-[11px] text-stone-500 uppercase tracking-wider font-medium">
                      Mensaje o requerimiento dietario especial (Opcional)
                    </label>
                    <input
                      type="text"
                      value={dietaryNotes}
                      onChange={(e) => setDietaryNotes(e.target.value)}
                      placeholder="Alergias, sugerencias, saludos..."
                      className="w-full px-4 py-2.5 rounded-xl bg-white border border-stone-200 focus:border-amber-600 text-xs text-stone-800 outline-none placeholder-stone-400 shadow-xs"
                    />
                  </div>

                  {/* MINIMALIST INTERACTIVE BUTTONS: SÍ / NO */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                    {/* YES BUTTON */}
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.97 }}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleConfirm('yes')}
                      className="flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-emerald-700 hover:bg-emerald-600 text-white font-medium text-sm tracking-wider uppercase shadow-md transition-all cursor-pointer disabled:opacity-50 active:scale-95"
                    >
                      <Icons.Check className="w-4 h-4" />
                      <span>
                        {isSubmitting
                          ? 'Confirmando...'
                          : selectedGuest.assignedPasses > 1
                          ? 'Sí, Asistiremos'
                          : 'Sí, Asistiré'}
                      </span>
                    </motion.button>

                    {/* NO BUTTON */}
                    <motion.button
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleConfirm('no')}
                      className="flex items-center justify-center gap-2 py-4 px-6 rounded-2xl bg-stone-100 hover:bg-stone-200/80 text-stone-600 border border-stone-200 font-medium text-xs tracking-wider uppercase transition-all cursor-pointer disabled:opacity-50"
                    >
                      <Icons.X className="w-3.5 h-3.5 text-stone-400" />
                      <span>No podré asistir</span>
                    </motion.button>
                  </div>
                </div>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* ------ BOTTOM PHOTO, LOGO & OFFICIAL FOOTER ------ */}
      <footer className="w-full flex flex-col items-center justify-center pb-12 pt-6 px-4 z-10 border-t border-stone-200/60">
        {/* Romantic blurred couple card */}
        {config.blurredPhotoUrl && (
          <div className="w-full max-w-[420px] aspect-[4/3] rounded-[28px] overflow-hidden relative shadow-md border border-stone-300/40 mb-8 group">
            <img
              src={config.blurredPhotoUrl}
              alt="Cierre romántico"
              className="w-full h-full object-cover filter blur-[3px] scale-105 transition-all duration-700 group-hover:blur-[1px]"
              referrerPolicy="no-referrer"
            />
            <div className="absolute inset-0 bg-stone-900/15 flex flex-col items-center justify-center p-6 text-center select-none">
              <span
                className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-white/95 drop-shadow-md font-medium"
                style={{ fontFamily: bodyFont }}
              >
                Te esperamos en nuestro gran día
              </span>
              <h4
                className="text-xl md:text-2xl font-light text-white drop-shadow-lg uppercase tracking-widest mt-2"
                style={{ fontFamily: titleFont }}
              >
                {config.coupleName1} & {config.coupleName2}
              </h4>
            </div>
          </div>
        )}

        {/* Dedicated Logo Monogram space */}
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
            <div className="w-24 h-24 md:w-32 md:h-32 rounded-full border border-dashed border-stone-300/80 flex flex-col items-center justify-center text-stone-400 p-4">
              <Icons.Sparkles className="w-5 h-5 text-stone-300 mb-1" />
              <span className="text-[8px] uppercase tracking-wider text-stone-400 font-light">
                Espacio de Logo
              </span>
            </div>
          )}
        </div>

        {/* Footer text */}
        <p
          className="w-full text-center pt-6 text-xs uppercase tracking-widest text-stone-500"
          style={{ fontFamily: bodyFont }}
        >
          {config.coupleName1} & {config.coupleName2} —{' '}
          {new Date(config.dateIso).toLocaleDateString('es-ES', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
          }).replace(/\//g, ' . ')}
        </p>
      </footer>

      {/* TOAST MESSAGE */}
      <AnimatePresence>
        {toastMessage && (
          <div className="fixed inset-x-0 bottom-8 flex justify-center z-50 pointer-events-none px-4">
            <motion.div
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 15 }}
              className="bg-stone-900 text-stone-100 text-xs py-3 px-5 rounded-xl shadow-xl flex items-center gap-2 max-w-md pointer-events-auto border border-stone-800"
            >
              <Icons.Info className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{toastMessage}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
