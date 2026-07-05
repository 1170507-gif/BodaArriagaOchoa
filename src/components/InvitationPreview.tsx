import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import * as Icons from 'lucide-react';
import { WeddingConfig, RsvpResponse, Guest } from '../types';
import { db, isFirebaseActive } from '../firebase';
import { getApiUrl } from '../utils/apiUrl';
import { collection, query, where, getDocs } from 'firebase/firestore';


// Helper to convert Google Drive share link into streamable content
const getStreamableVideoUrl = (url: string) => {
  if (!url) return '';
  if (url.includes('drive.google.com')) {
    const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
    if (fileDMatch && fileDMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${fileDMatch[1]}`;
    }
    const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
    if (idMatch && idMatch[1]) {
      return `https://drive.google.com/uc?export=download&id=${idMatch[1]}`;
    }
  }
  return url;
};

// Helper to extract the unique Google Drive file ID
const getGoogleDriveFileId = (url: string) => {
  if (!url) return '';
  const fileDMatch = url.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (fileDMatch && fileDMatch[1]) {
    return fileDMatch[1];
  }
  const idMatch = url.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (idMatch && idMatch[1]) {
    return idMatch[1];
  }
  return '';
};

// Helper to calculate a color matrix for SVG filter based on theme accent color
const getSvgColorMatrix = (hex: string) => {
  let r = 1, g = 1, b = 1;
  const cleanHex = (hex || '#b85c46').replace('#', '');
  if (cleanHex.length === 6) {
    r = parseInt(cleanHex.substring(0, 2), 16) / 255;
    g = parseInt(cleanHex.substring(2, 4), 16) / 255;
    b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  } else if (cleanHex.length === 3) {
    r = parseInt(cleanHex.charAt(0) + cleanHex.charAt(0), 16) / 255;
    g = parseInt(cleanHex.charAt(1) + cleanHex.charAt(1), 16) / 255;
    b = parseInt(cleanHex.charAt(2) + cleanHex.charAt(2), 16) / 255;
  }

  // We want to preserve contrast and luminosity, while applying the color.
  // Standard grayscale values: R: 0.2126, G: 0.7152, B: 0.0722.
  // Boost the values slightly to make the tinted envelope vibrant and elegant.
  const boost = 1.15;
  const nr = Math.min(r * boost, 1);
  const ng = Math.min(g * boost, 1);
  const nb = Math.min(b * boost, 1);

  return `${0.2126 * nr} ${0.7152 * nr} ${0.0722 * nr} 0 0
          ${0.2126 * ng} ${0.7152 * ng} ${0.0722 * ng} 0 0
          ${0.2126 * nb} ${0.7152 * nb} ${0.0722 * nb} 0 0
          0 0 0 1 0`;
};

interface InvitationPreviewProps {
  config: WeddingConfig;
  onSubmitRsvp: (rsvp: Omit<RsvpResponse, 'id' | 'submittedAt'>) => void;
  isEditorOpen?: boolean;
  onConfigChange?: (newConfig: WeddingConfig) => void;
}

export default function InvitationPreview({
  config,
  onSubmitRsvp,
  isEditorOpen = false,
  onConfigChange,
}: InvitationPreviewProps) {
  const [overlayOpened, setOverlayOpened] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioError, setAudioError] = useState(false);

  useEffect(() => {
    setAudioError(false);
    setIsPlaying(false);
  }, [config.musicUrl]);

  const [timeRemaining, setTimeRemaining] = useState({
    days: 0,
    hours: 0,
    mins: 0,
    secs: 0,
  });
  const [showTimerSettings, setShowTimerSettings] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const [imageExists, setImageExists] = useState({
    invitacion_1: false,
    invitacion_2: false,
    invitacion_3: false,
    invitacion_4: false,
  });
  const [serverVideoExists, setServerVideoExists] = useState(false);

  const countdownContainerRef = useRef<HTMLDivElement>(null);
  const countdownPosRef = useRef({ x: 50, y: 80 });
  const [countdownPos, setCountdownPos] = useState({ x: 50, y: 80 });

  const [locationButtonPos, setLocationButtonPos] = useState({ x: 50, y: 90 });
  const locationButtonPosRef = useRef({ x: 50, y: 90 });

  useEffect(() => {
    if (config.countdownPosition) {
      setCountdownPos(config.countdownPosition);
      countdownPosRef.current = config.countdownPosition;
    }
  }, [config.countdownPosition]);

  useEffect(() => {
    if (config.locationButtonPosition) {
      setLocationButtonPos(config.locationButtonPosition);
      locationButtonPosRef.current = config.locationButtonPosition;
    }
  }, [config.locationButtonPosition]);

  const videoHeroRef = useRef<HTMLDivElement>(null);
const [videoTextOverlayPos, setVideoTextOverlayPos] = useState({ x: 50, y: 25 });
const videoTextOverlayPosRef = useRef({ x: 50, y: 25 });

// Draggable / resizable couple photo layer on top of the opening video
const [coupleOverlayPos, setCoupleOverlayPos] = useState({ x: 50, y: 65 });
const coupleOverlayPosRef = useRef({ x: 50, y: 65 });
const [coupleOverlayScale, setCoupleOverlayScale] = useState(1);
const coupleOverlayScaleRef = useRef(1);

useEffect(() => {
  const x = config.coupleOverlayX !== undefined ? config.coupleOverlayX : 50;
  const y = config.coupleOverlayY !== undefined ? config.coupleOverlayY : 65;
  const scale = config.coupleOverlayScale !== undefined ? config.coupleOverlayScale : 1;
  setCoupleOverlayPos({ x, y });
  coupleOverlayPosRef.current = { x, y };
  setCoupleOverlayScale(scale);
  coupleOverlayScaleRef.current = scale;
}, [config.coupleOverlayX, config.coupleOverlayY, config.coupleOverlayScale]);

const startDraggingCoupleOverlay = (e: React.MouseEvent | React.TouchEvent) => {
  if (!isEditorOpen) return;

  const target = e.target as HTMLElement;
  if (
    target.closest('button') ||
    target.closest('input') ||
    target.closest('select') ||
    target.closest('.pointer-events-auto')
  ) {
    return;
  }

  e.preventDefault();
  e.stopPropagation();

  if (!videoHeroRef.current) return;
  const rect = videoHeroRef.current.getBoundingClientRect();

  const handleCoupleDragMove = (clientX: number, clientY: number) => {
    let x = ((clientX - rect.left) / rect.width) * 100;
    let y = ((clientY - rect.top) / rect.height) * 100;
    x = Math.max(5, Math.min(95, x));
    y = Math.max(5, Math.min(95, y));

    const newPos = { x, y };
    setCoupleOverlayPos(newPos);
    coupleOverlayPosRef.current = newPos;
  };

  const onMouseMove = (ev: MouseEvent) => {
    handleCoupleDragMove(ev.clientX, ev.clientY);
  };

  const onTouchMove = (ev: TouchEvent) => {
    if (ev.cancelable) ev.preventDefault();
    if (ev.touches.length > 0) {
      handleCoupleDragMove(ev.touches[0].clientX, ev.touches[0].clientY);
    }
  };

  const commitPosition = () => {
    if (onConfigChange) {
      onConfigChange({
        ...config,
        coupleOverlayX: Math.round(coupleOverlayPosRef.current.x),
        coupleOverlayY: Math.round(coupleOverlayPosRef.current.y),
      });
    }
  };

  const onMouseUp = () => {
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    commitPosition();
  };

  const onTouchEnd = () => {
    document.removeEventListener('touchmove', onTouchMove);
    document.removeEventListener('touchend', onTouchEnd);
    commitPosition();
  };

  if ('touches' in e) {
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd);
  } else {
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  }
};

const adjustCoupleOverlayScale = (delta: number) => {
  const next = Math.max(0.4, Math.min(2.2, Math.round((coupleOverlayScaleRef.current + delta) * 100) / 100));
  coupleOverlayScaleRef.current = next;
  setCoupleOverlayScale(next);
  if (onConfigChange) {
    onConfigChange({
      ...config,
      coupleOverlayScale: next,
    });
  }
};

  useEffect(() => {
    const x = config.videoTextOverlayX !== undefined ? config.videoTextOverlayX : 50;
    const y = config.videoTextOverlayY !== undefined ? config.videoTextOverlayY : 25;
    setVideoTextOverlayPos({ x, y });
    videoTextOverlayPosRef.current = { x, y };
  }, [config.videoTextOverlayY, config.videoTextOverlayX]);

  const startDraggingVideoText = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditorOpen) return;
    
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('.pointer-events-auto')
    ) {
      return;
    }

    e.preventDefault();
    e.stopPropagation();

    if (!videoHeroRef.current) return;
    const rect = videoHeroRef.current.getBoundingClientRect();

    const handleVideoTextDragMove = (clientX: number, clientY: number) => {
      let x = ((clientX - rect.left) / rect.width) * 100;
      let y = ((clientY - rect.top) / rect.height) * 100;
      x = Math.max(5, Math.min(95, x));
      y = Math.max(5, Math.min(95, y));
      
      const newPos = { x, y };
      setVideoTextOverlayPos(newPos);
      videoTextOverlayPosRef.current = newPos;
    };

    const onMouseMove = (ev: MouseEvent) => {
      handleVideoTextDragMove(ev.clientX, ev.clientY);
    };

    const onTouchMove = (ev: TouchEvent) => {
      if (ev.cancelable) ev.preventDefault();
      if (ev.touches.length > 0) {
        handleVideoTextDragMove(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };

    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (onConfigChange) {
        onConfigChange({
          ...config,
          videoTextOverlayX: Math.round(videoTextOverlayPosRef.current.x),
          videoTextOverlayY: Math.round(videoTextOverlayPosRef.current.y)
        });
      }
    };

    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      if (onConfigChange) {
        onConfigChange({
          ...config,
          videoTextOverlayX: Math.round(videoTextOverlayPosRef.current.x),
          videoTextOverlayY: Math.round(videoTextOverlayPosRef.current.y)
        });
      }
    };

    if ('touches' in e) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  };

  const startDragging = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditorOpen) return;
    
    // Check if user clicked on configuration controls or buttons to prevent drag triggers
    const target = e.target as HTMLElement;
    if (
      target.closest('button') || 
      target.closest('input') || 
      target.closest('select') || 
      target.closest('.pointer-events-auto')
    ) {
      return;
    }
    
    e.preventDefault();

    if (!countdownContainerRef.current) return;
    const rect = countdownContainerRef.current.getBoundingClientRect();

    const handleDragMoveCached = (clientX: number, clientY: number) => {
      let x = ((clientX - rect.left) / rect.width) * 100;
      let y = ((clientY - rect.top) / rect.height) * 100;
      x = Math.max(2, Math.min(98, x));
      y = Math.max(2, Math.min(98, y));
      
      const newPos = { x, y };
      setCountdownPos(newPos);
      countdownPosRef.current = newPos;
    };
    
    const onMouseMove = (ev: MouseEvent) => {
      handleDragMoveCached(ev.clientX, ev.clientY);
    };
    
    const onTouchMove = (ev: TouchEvent) => {
      if (ev.cancelable) {
        ev.preventDefault();
      }
      if (ev.touches.length > 0) {
        handleDragMoveCached(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      if (onConfigChange) {
        onConfigChange({
          ...config,
          countdownPosition: countdownPosRef.current
        });
      }
    };
    
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      if (onConfigChange) {
        onConfigChange({
          ...config,
          countdownPosition: countdownPosRef.current
        });
      }
    };
    
    if ('touches' in e) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  };

  const startDraggingLocation = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isEditorOpen) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    if (!countdownContainerRef.current) return;
    const rect = countdownContainerRef.current.getBoundingClientRect();
    
    let hasMoved = false;

    const handleLocationDragMoveCached = (clientX: number, clientY: number) => {
      let x = ((clientX - rect.left) / rect.width) * 100;
      let y = ((clientY - rect.top) / rect.height) * 100;
      x = Math.max(2, Math.min(98, x));
      y = Math.max(2, Math.min(98, y));
      
      const newPos = { x, y };
      setLocationButtonPos(newPos);
      locationButtonPosRef.current = newPos;
    };
    
    const onMouseMove = (ev: MouseEvent) => {
      hasMoved = true;
      handleLocationDragMoveCached(ev.clientX, ev.clientY);
    };
    
    const onTouchMove = (ev: TouchEvent) => {
      hasMoved = true;
      if (ev.cancelable) {
        ev.preventDefault();
      }
      if (ev.touches.length > 0) {
        handleLocationDragMoveCached(ev.touches[0].clientX, ev.touches[0].clientY);
      }
    };
    
    const onMouseUp = () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      
      if (onConfigChange) {
        onConfigChange({
          ...config,
          locationButtonPosition: locationButtonPosRef.current
        });
      }
      
      if (!hasMoved) {
        window.open(config.hotelLocationUrl || "https://maps.app.goo.gl/mD7wA16KpLD3vWiK9");
      }
    };
    
    const onTouchEnd = () => {
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      
      if (onConfigChange) {
        onConfigChange({
          ...config,
          locationButtonPosition: locationButtonPosRef.current
        });
      }
      
      if (!hasMoved) {
        window.open(config.hotelLocationUrl || "https://maps.app.goo.gl/mD7wA16KpLD3vWiK9");
      }
    };
    
    if ('touches' in e) {
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    } else {
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    }
  };

  const checkImagesStatus = async () => {
    try {
      const res = await fetch(getApiUrl('/api/images-status'));
      if (res.ok) {
        const data = await res.json();
        setImageExists(data);
      }
    } catch (e) {
      console.error('Error checking images status:', e);
    }

    try {
      const res = await fetch(getApiUrl('/api/video-status'));
      if (res.ok) {
        const data = await res.json();
        setServerVideoExists(data.exists);
      }
    } catch (e) {
      console.error('Error checking video status:', e);
    }
  };

  useEffect(() => {
    checkImagesStatus();
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, key: string) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      showToast('Subiendo imagen original .webp...');
      const response = await fetch(getApiUrl(`/api/upload-image?type=${key}`), {
        method: 'POST',
        headers: {
          'Content-Type': 'image/webp',
        },
        body: file,
      });

      if (response.ok) {
        showToast('¡Imagen guardada en el servidor!');
        checkImagesStatus();
      } else {
        showToast('Error al subir la imagen en el servidor.');
      }
    } catch (err) {
      console.error(err);
      showToast('Error de conexión al subir la imagen.');
    }
  };

  const getOrderedSlots = () => {
    const allSlots = Array.from(new Set([
      1, 2, 3, 4,
      ...Object.keys(imageExists)
        .map(k => parseInt(k.replace('invitacion_', ''), 10))
        .filter(n => !isNaN(n))
    ]));
    
    let orderedSlots = [...allSlots].sort((a, b) => a - b);
    if (config.imageOrder && Array.isArray(config.imageOrder)) {
      const validOrdered = config.imageOrder.filter(num => allSlots.includes(num));
      const missingSlots = allSlots.filter(num => !validOrdered.includes(num)).sort((a, b) => a - b);
      orderedSlots = [...validOrdered, ...missingSlots];
    }
    return orderedSlots;
  };

  const moveSlot = (currentIndex: number, direction: 'up' | 'down') => {
    const ordered = getOrderedSlots();
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return;

    // Swap
    const newOrder = [...ordered];
    const temp = newOrder[currentIndex];
    newOrder[currentIndex] = newOrder[targetIndex];
    newOrder[targetIndex] = temp;

    if (onConfigChange) {
      onConfigChange({
        ...config,
        imageOrder: newOrder
      });
    }
  };

  const handleImageDelete = async (num: number) => {
    const key = `invitacion_${num}`;
    try {
      showToast('Eliminando imagen...');
      const response = await fetch(getApiUrl(`/api/delete-image?type=${key}`), {
        method: 'POST',
      });
      if (response.ok) {
        showToast('¡Imagen eliminada!');
        checkImagesStatus();
        
        // Remove from imageOrder
        if (config.imageOrder) {
          const newOrder = config.imageOrder.filter(n => n !== num);
          if (onConfigChange) {
            onConfigChange({
              ...config,
              imageOrder: newOrder
            });
          }
        }
      } else {
        showToast('Error al eliminar la imagen.');
      }
    } catch (err) {
      console.error(err);
      showToast('Error de conexión al eliminar la imagen.');
    }
  };

  const renderImageSlot = (num: number, title: string, index?: number, totalSlots?: number) => {
    const key = `invitacion_${num}`;
    const exists = imageExists[key as keyof typeof imageExists];
    const imagePath = getApiUrl(`/images/invitacion_${num}.webp`);

    return (
      <div 
        key={key}
        ref={num === 1 ? countdownContainerRef : undefined}
        className={`w-full relative flex flex-col items-center justify-center transition-all duration-300 ${
          exists 
            ? 'bg-transparent overflow-hidden' 
            : 'bg-stone-50/20 hover:bg-stone-50/40 min-h-[140px] border-b border-stone-200/40 last:border-b-0'
        }`}
      >
        {exists ? (
          <div className="relative group w-full h-full select-none">
            <img
              src={imagePath}
              alt={title}
              className="w-full h-auto object-contain block mx-auto pointer-events-none"
              referrerPolicy="no-referrer"
            />
            
            {/* If num is 1 (Cuenta regresiva), render an elegant overlaid location button at the bottom (draggable in edit mode) */}
            {num === 1 && (
              isEditorOpen ? (
                <div
                  onMouseDown={startDraggingLocation}
                  onTouchStart={startDraggingLocation}
                  style={{
                    position: 'absolute',
                    left: `${locationButtonPos.x}%`,
                    top: `${locationButtonPos.y}%`,
                    transform: `translate(-50%, -50%) scale(${config.locationButtonScale || 1.0})`,
                    transformOrigin: 'center center',
                    cursor: 'move',
                  }}
                  className="z-25 pointer-events-auto flex items-center gap-1.5 px-4.5 py-2.5 rounded-full bg-transparent text-stone-750 hover:text-stone-900 border border-dashed border-[#753636]/40 shadow-md backdrop-blur-sm transition-all text-[11px] uppercase tracking-widest font-medium select-none touch-none group/btn"
                  title="Arrastra para mover la ubicación"
                >
                  <Icons.MapPin className="w-3.5 h-3.5 text-amber-700 transition-transform group-hover/btn:scale-110" />
                  <span>Ver ubicación</span>
                  <span className="text-[7px] text-stone-400 font-mono ml-0.5">(Arrastrar)</span>
                </div>
              ) : (
                <a
                  href={config.hotelLocationUrl || "https://www.google.com/maps/search/?api=1&query=Villa+Cora+Florence+Italy"}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    position: 'absolute',
                    left: `${locationButtonPos.x}%`,
                    top: `${locationButtonPos.y}%`,
                    transform: `translate(-50%, -50%) scale(${config.locationButtonScale || 1.0})`,
                    transformOrigin: 'center center',
                  }}
className="z-20 pointer-events-auto flex items-center gap-1.5 px-4.5 py-2.5 bg-transparent text-stone-750 hover:text-stone-900 transition-all text-[11px] uppercase tracking-widest font-medium group/btn"                > 
                  <Icons.MapPin className="w-3.5 h-3.5 text-amber-700 transition-transform group-hover/btn:scale-110" />
                  <span>Ver ubicación</span>
                </a>
              )
            )}

            {/* If num is 2 (Cronograma), render a lock overlay with opacity and a minimalist lock icon */}
            {num === 2 && config.lockCronograma && (
              <div className="absolute inset-0 bg-[#fcf8f5]/75 backdrop-blur-[4px] flex flex-col items-center justify-center p-4 text-center z-10 transition-all select-none pointer-events-none">
                <div className="p-3.5 rounded-full bg-white/85 border border-stone-200/30 shadow-sm text-stone-700 mb-3 animate-pulse">
                  <Icons.Lock className="w-5 h-5 stroke-[1.5]" />
                </div>
                <p className="font-serif italic text-base text-stone-800 tracking-wide mb-1 px-4">
                  Muy pronto podrás ver el cronograma
                </p>
                <p className="text-[10px] uppercase tracking-widest text-[#753636]/60 font-semibold">
                  Estamos preparando cada detalle
                </p>
              </div>
            )}
            
            {/* If num is 1 (Cuenta regresiva), render an elegant overlaid countdown on top of the image! */}
            {num === 1 && (
              <div 
                onMouseDown={startDragging}
                onTouchStart={startDragging}
                style={{ 
                  position: 'absolute',
                  left: `${countdownPos.x}%`,
                  top: `${countdownPos.y}%`,
                  transform: `translate(-50%, -50%) scale(${config.countdownScale || 1.0})`,
                  transformOrigin: 'center center',
                  cursor: isEditorOpen ? 'move' : 'default',
                  fontFamily: "'Times New Roman', Times, Baskerville, Georgia, serif"
                }}
                className={`flex gap-3 md:gap-5 text-[#753636] select-none touch-none z-20 whitespace-nowrap px-4 py-2 rounded-2xl transition-all duration-300 ${
                  isEditorOpen ? 'bg-white/70 border border-dashed border-[#753636]/40 shadow-sm' : ''
                }`}
                title={isEditorOpen ? 'Arrastra para mover el contador' : undefined}
              >
                {/* Days */}
                <div className="flex flex-col items-center min-w-[28px] md:min-w-[34px]">
                  <span className="text-xl md:text-2xl font-light leading-none" style={{ color: '#753636' }}>
                    {String(timeRemaining.days).padStart(2, '0')}
                  </span>
                  <span className="text-[7px] md:text-[8px] uppercase tracking-widest text-[#753636]/70 mt-1 font-medium">
                    {config.countdownFormat === 'short' ? 'D' : 'Días'}
                  </span>
                </div>

                {/* Hours */}
                {config.countdownFormat !== 'days' && (
                  <>
                    <div className="text-sm md:text-base font-light text-[#753636]/40 self-center -mt-3 select-none">:</div>
                    <div className="flex flex-col items-center min-w-[28px] md:min-w-[34px]">
                      <span className="text-xl md:text-2xl font-light leading-none" style={{ color: '#753636' }}>
                        {String(timeRemaining.hours).padStart(2, '0')}
                      </span>
                      <span className="text-[7px] md:text-[8px] uppercase tracking-widest text-[#753636]/70 mt-1 font-medium">
                        {config.countdownFormat === 'short' ? 'H' : 'Horas'}
                      </span>
                    </div>
                  </>
                )}

                {/* Minutes */}
                {config.countdownFormat !== 'days' && config.countdownFormat !== 'days-hours' && (
                  <>
                    <div className="text-sm md:text-base font-light text-[#753636]/40 self-center -mt-3 select-none">:</div>
                    <div className="flex flex-col items-center min-w-[28px] md:min-w-[34px]">
                      <span className="text-xl md:text-2xl font-light leading-none" style={{ color: '#753636' }}>
                        {String(timeRemaining.mins).padStart(2, '0')}
                      </span>
                      <span className="text-[7px] md:text-[8px] uppercase tracking-widest text-[#753636]/70 mt-1 font-medium">
                        {config.countdownFormat === 'short' ? 'M' : 'Mins'}
                      </span>
                    </div>
                  </>
                )}

                {/* Seconds */}
                {config.countdownFormat !== 'days' && config.countdownFormat !== 'days-hours' && (
                  <>
                    <div className="text-sm md:text-base font-light text-[#753636]/40 self-center -mt-3 select-none">:</div>
                    <div className="flex flex-col items-center min-w-[28px] md:min-w-[34px]">
                      <span className="text-xl md:text-2xl font-light leading-none" style={{ color: '#753636' }}>
                        {String(timeRemaining.secs).padStart(2, '0')}
                      </span>
                      <span className="text-[7px] md:text-[8px] uppercase tracking-widest text-[#753636]/70 mt-1 font-medium">
                        {config.countdownFormat === 'short' ? 'S' : 'Segs'}
                      </span>
                    </div>
                  </>
                )}

                {/* Settings Toggle Button for Editors */}
                {isEditorOpen && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setShowTimerSettings(!showTimerSettings);
                    }}
                    className="p-1.5 rounded-full bg-[#753636] text-white hover:bg-amber-800 transition-all shadow-md flex items-center justify-center self-center pointer-events-auto ml-2"
                    title="Ajustes de contador"
                  >
                    <Icons.Settings className="w-3.5 h-3.5" />
                  </button>
                )}
                
                {isEditorOpen && (
                  <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-[#753636] text-white text-[8px] uppercase tracking-widest px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap opacity-80 scale-90">
                    Arrastrar
                  </div>
                )}

                {/* Elegant Popover Settings Panel */}
                {isEditorOpen && showTimerSettings && (
                  <div 
                    onClick={(e) => e.stopPropagation()}
                    onMouseDown={(e) => e.stopPropagation()}
                    onTouchStart={(e) => e.stopPropagation()}
                    style={{
                      transform: `translate(-50%, 15px) scale(${1 / (config.countdownScale || 1.0)})`,
                    }}
                    className="absolute top-full left-1/2 bg-white/95 border border-stone-200/80 shadow-xl rounded-2xl p-4 w-[240px] text-left pointer-events-auto z-30 flex flex-col gap-3 backdrop-blur-md"
                  >
                    <div className="flex justify-between items-center border-b border-stone-100 pb-1.5">
                      <span className="text-xs font-semibold uppercase tracking-wider text-stone-700">Ajustes del Contador</span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowTimerSettings(false);
                        }}
                        className="text-stone-400 hover:text-stone-600 p-0.5 rounded"
                      >
                        <Icons.X className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Wedding Date/Time picker */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-1">
                        <Icons.Clock className="w-3 h-3 text-amber-700/70" />
                        Fecha y Hora (ISO)
                      </label>
                      <input
                        type="datetime-local"
                        value={config.dateIso ? config.dateIso.substring(0, 16) : ""}
                        onChange={(e) => {
                          if (onConfigChange) {
                            onConfigChange({
                              ...config,
                              dateIso: e.target.value
                            });
                          }
                        }}
                        className="text-xs px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Scale/Size Slider */}
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                        <span className="flex items-center gap-1">
                          <Icons.Maximize2 className="w-3 h-3 text-amber-700/70" />
                          Tamaño Contador
                        </span>
                        <span className="font-mono text-[9px] text-stone-400">{(config.countdownScale || 1.0).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={config.countdownScale || 1.0}
                        onChange={(e) => {
                          if (onConfigChange) {
                            onConfigChange({
                              ...config,
                              countdownScale: parseFloat(e.target.value)
                            });
                          }
                        }}
                        className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-600 focus:outline-none"
                      />
                    </div>

                    {/* Location Button Scale/Size Slider */}
                    <div className="flex flex-col gap-1 border-t border-stone-100 pt-2">
                      <div className="flex justify-between items-center text-[10px] uppercase tracking-wider text-stone-500 font-semibold">
                        <span className="flex items-center gap-1">
                          <Icons.Maximize className="w-3 h-3 text-amber-700/70" />
                          Tamaño Botón Ubicación
                        </span>
                        <span className="font-mono text-[9px] text-stone-400">{(config.locationButtonScale || 1.0).toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={config.locationButtonScale || 1.0}
                        onChange={(e) => {
                          if (onConfigChange) {
                            onConfigChange({
                              ...config,
                              locationButtonScale: parseFloat(e.target.value)
                            });
                          }
                        }}
                        className="w-full h-1 bg-stone-200 rounded-lg appearance-none cursor-pointer accent-amber-600 focus:outline-none"
                      />
                    </div>

                    {/* Hotel Link Input */}
                    <div className="flex flex-col gap-1 border-t border-stone-100 pt-2">
                      <label className="text-[10px] uppercase tracking-wider text-stone-500 font-semibold flex items-center gap-1">
                        <Icons.MapPin className="w-3 h-3 text-amber-700/70" />
                        Enlace "Ver ubicación"
                      </label>
                      <input
                        type="text"
                        placeholder="https://maps.google.com/..."
                        value={config.hotelLocationUrl || ""}
                        onChange={(e) => {
                          if (onConfigChange) {
                            onConfigChange({
                              ...config,
                              hotelLocationUrl: e.target.value
                            });
                          }
                        }}
                        className="text-[11px] px-2 py-1.5 rounded-lg border border-stone-200 bg-white text-stone-800 focus:outline-none focus:border-amber-500/50"
                      />
                    </div>

                    {/* Reset positions helper */}
                    <button
                      type="button"
                      onClick={() => {
                        if (onConfigChange) {
                          onConfigChange({
                            ...config,
                            countdownPosition: { x: 50, y: 80 },
                            locationButtonPosition: { x: 50, y: 90 },
                            locationButtonScale: 1.0,
                            countdownScale: 1.0
                          });
                        }
                      }}
                      className="mt-1 w-full py-1.5 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-stone-600 hover:text-stone-800 transition-all text-[10px] font-medium uppercase tracking-wider flex items-center justify-center gap-1"
                    >
                      <Icons.RefreshCw className="w-2.5 h-2.5" />
                      Restablecer Posiciones
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Elegant toolbar to move / delete / replace - ONLY if editor is open */}
            {isEditorOpen && (
              <div 
                onClick={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                className="absolute top-3 right-3 z-30 flex items-center gap-1.5 pointer-events-auto bg-stone-900/90 hover:bg-stone-900 text-white backdrop-blur-md p-1.5 rounded-full shadow-lg border border-white/10 transition-all"
              >
                {/* Move Up */}
                {index !== undefined && index > 0 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      moveSlot(index, 'up');
                    }}
                    className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-all flex items-center justify-center"
                    title="Subir orden"
                  >
                    <Icons.ChevronUp className="w-3.5 h-3.5" />
                  </button>
                )}
                
                {/* Move Down */}
                {index !== undefined && totalSlots !== undefined && index < totalSlots - 1 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      moveSlot(index, 'down');
                    }}
                    className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white transition-all flex items-center justify-center"
                    title="Bajar orden"
                  >
                    <Icons.ChevronDown className="w-3.5 h-3.5" />
                  </button>
                )}

                {/* Replace/Upload */}
                <label className="p-1.5 rounded-full hover:bg-white/15 text-white/80 hover:text-white cursor-pointer transition-all flex items-center justify-center m-0" title="Reemplazar imagen (.webp)">
                  <Icons.Upload className="w-3.5 h-3.5" />
                  <input
                    type="file"
                    accept="image/webp"
                    className="hidden"
                    onChange={(e) => handleImageUpload(e, key)}
                  />
                </label>

                {/* Lock/Unlock toggle for Cronograma (num === 2) */}
                {num === 2 && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      if (onConfigChange) {
                        onConfigChange({
                          ...config,
                          lockCronograma: !config.lockCronograma
                        });
                      }
                    }}
                    className={`p-1.5 rounded-full transition-all flex items-center justify-center ${
                      config.lockCronograma 
                        ? 'bg-amber-600/35 text-amber-300 hover:bg-amber-600/50 hover:text-amber-200' 
                        : 'hover:bg-white/15 text-white/80 hover:text-white'
                    }`}
                    title={config.lockCronograma ? "Desbloquear Cronograma" : "Bloquear Cronograma"}
                  >
                    {config.lockCronograma ? (
                      <Icons.Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Icons.Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                )}

                {/* Delete button with double-confirmation */}
                {confirmDeleteId === num ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      handleImageDelete(num);
                      setConfirmDeleteId(null);
                    }}
                    className="px-2.5 py-1 rounded-full bg-red-600 hover:bg-red-700 text-white text-[9px] font-bold uppercase tracking-wider transition-all shadow-sm"
                    title="Confirmar eliminación"
                  >
                    ¿Borrar?
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      e.preventDefault();
                      setConfirmDeleteId(num);
                      // Auto-reset confirmation state after 3 seconds
                      setTimeout(() => {
                        setConfirmDeleteId(curr => curr === num ? null : curr);
                      }, 3000);
                    }}
                    className="p-1.5 rounded-full hover:bg-red-500/20 text-red-400 hover:text-red-500 transition-all flex items-center justify-center"
                    title="Eliminar imagen"
                  >
                    <Icons.Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
          </div>
        ) : isEditorOpen ? (
          <label className="w-full h-full py-16 px-6 flex flex-col items-center justify-center cursor-pointer hover:bg-stone-100/10 transition-colors group">
            <div className="p-4 rounded-full bg-stone-100 border border-stone-200 text-stone-500 group-hover:scale-105 transition-transform duration-300">
              <Icons.ImageUp className="w-8 h-8 text-amber-700" />
            </div>
            <span className="text-sm font-medium text-stone-700 mt-4 text-center">
              Sube la parte {num}: {title}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-stone-400 mt-1">
              Formato original .webp
            </span>
            <input
              type="file"
              accept="image/webp"
              className="hidden"
              onChange={(e) => handleImageUpload(e, key)}
            />
          </label>
        ) : (
          <div className="py-12 px-6 flex flex-col items-center justify-center text-center text-stone-400">
            <Icons.Sparkles className="w-6 h-6 text-amber-600/40 animate-pulse mb-2" />
            <span className="text-xs uppercase tracking-wider font-light">Sección en diseño</span>
          </div>
        )}
      </div>
    );
  };

  // Form states
  const [rsvpName, setRsvpName] = useState('');
  const [rsvpPhone, setRsvpPhone] = useState('');
  const [rsvpAttending, setRsvpAttending] = useState<'yes' | 'no' | ''>('');
  const [rsvpGuests, setRsvpGuests] = useState<number>(1);
  const [companionNames, setCompanionNames] = useState<string[]>([]);
  const [rsvpNotes, setRsvpNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [matchedGuest, setMatchedGuest] = useState<Guest | null>(null);
  const [isLoadingGuest, setIsLoadingGuest] = useState(false);

  // Synchronize companion fields when rsvpGuests changes
  useEffect(() => {
    const neededCompanions = Math.max(0, rsvpGuests - 1);
    setCompanionNames(prev => {
      const next = [...prev];
      if (next.length < neededCompanions) {
        while (next.length < neededCompanions) {
          next.push('');
        }
      } else if (next.length > neededCompanions) {
        next.splice(neededCompanions);
      }
      return next;
    });
  }, [rsvpGuests]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const guestCode = params.get('g')?.trim();
    if (!guestCode) return;

    const findGuest = async () => {
      setIsLoadingGuest(true);
      if (isFirebaseActive && db) {
        try {
          const q = query(collection(db, 'guests'), where('code', '==', guestCode));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const docSnap = querySnapshot.docs[0];
            const data = docSnap.data() as Omit<Guest, 'id'>;
            const loadedGuest = { id: docSnap.id, ...data } as Guest;
            setMatchedGuest(loadedGuest);
            setRsvpName(loadedGuest.name);
            setRsvpGuests(loadedGuest.maxGuests);
          }
        } catch (err) {
          console.error('Error fetching guest from Firestore:', err);
        } finally {
          setIsLoadingGuest(false);
        }
      } else {
        // Local Fallback
        const saved = localStorage.getItem('wedding_guests_v1');
        if (saved) {
          try {
            const list = JSON.parse(saved) as Guest[];
            const found = list.find(g => g.code === guestCode);
            if (found) {
              setMatchedGuest(found);
              setRsvpName(found.name);
              setRsvpGuests(found.maxGuests);
            }
          } catch (e) {
            console.error('Error parsing local guests:', e);
          }
        }
        setIsLoadingGuest(false);
      }
    };

    findGuest();
  }, []);

  // Video player states
  const [isVideoPlaying, setIsVideoPlaying] = useState(true);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [videoError, setVideoError] = useState(false);
  const [scrollY, setScrollY] = useState(0);

  // Determine which video URL to play
  const getActiveVideoUrl = () => {
    if (serverVideoExists) {
      return '/video/wedding.mp4';
    }
    return config.videoUrl ? getStreamableVideoUrl(config.videoUrl) : '';
  };

  const videoSrc = getActiveVideoUrl();

  useEffect(() => {
    setVideoError(false);
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.playbackRate = 0.5;
      videoRef.current.play().then(() => {
        setIsVideoPlaying(true);
      }).catch((err) => {
        console.warn("Muted video autoplay prevented by browser:", err);
      });
    }
  }, [videoSrc]);

  useEffect(() => {
    const handleScroll = () => {
      setScrollY(window.scrollY);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const envelopeSceneRef = useRef<HTMLDivElement | null>(null);
  const envelopeWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handleEnvelopeScroll = () => {
      if (!envelopeSceneRef.current || !envelopeWrapperRef.current) return;
      const rect = envelopeSceneRef.current.getBoundingClientRect();
      const sceneHeight = envelopeSceneRef.current.offsetHeight;
      const total = sceneHeight - window.innerHeight;
      const traveled = -rect.top;

      let progress = 0;
      if (total > 0) {
        progress = Math.min(Math.max(traveled / total, 0), 1);
      }

      // Timeline:
      // 0.00 -> 0.32  la solapa abre de -180deg a 0deg
      // 0.32 -> 0.88  la carta sube y sale del sobre
      // 0.88 -> 1.00  la carta se queda quieta, ya visible, antes de pasar a la siguiente sección
      const FLAP_END = 0.32;
      const LETTER_END = 0.88;

      const flapRaw = Math.min(Math.max(progress / FLAP_END, 0), 1);
      const flapT = flapRaw < 0.5
        ? 4 * flapRaw * flapRaw * flapRaw
        : 1 - Math.pow(-2 * flapRaw + 2, 3) / 2;
      const flapRotation = -180 + (180 * flapT);

      const letterRaw = Math.min(
        Math.max((progress - FLAP_END) / (LETTER_END - FLAP_END), 0),
        1
      );
      const letterT = letterRaw < 0.5
        ? 4 * letterRaw * letterRaw * letterRaw
        : 1 - Math.pow(-2 * letterRaw + 2, 3) / 2;

      // El recorrido es un % de la altura real del sobre (no px fijos),
      // así se ve proporcional en cualquier tamaño de pantalla.
      const wrapperHeight = envelopeWrapperRef.current.offsetHeight;
      const LETTER_RISE_RATIO = 0.62;
      const letterY = -(wrapperHeight * LETTER_RISE_RATIO * letterT);

      const letterScale = 0.985 + (0.015 * Math.max(flapT, letterT * 0.7));
      const letterShadow = 0.06 + (0.10 * letterT);

      // Dynamic z-indices to prevent overlapping issues
      const flapZ = progress < 0.32 ? 8 : 2;
      const letterZ = progress < 0.32 ? 3 : 5;

      const wrapper = envelopeWrapperRef.current;
      wrapper.style.setProperty('--flap-rot', `${flapRotation}deg`);
      wrapper.style.setProperty('--letter-y', `${letterY}px`);
      wrapper.style.setProperty('--letter-scale', letterScale.toFixed(4));
      wrapper.style.setProperty('--letter-shadow', letterShadow.toFixed(3));
      wrapper.style.setProperty('--flap-z', `${flapZ}`);
      wrapper.style.setProperty('--letter-z', `${letterZ}`);
    };

    window.addEventListener('scroll', handleEnvelopeScroll, { passive: true });
    window.addEventListener('resize', handleEnvelopeScroll);

    handleEnvelopeScroll();

    return () => {
      window.removeEventListener('scroll', handleEnvelopeScroll);
      window.removeEventListener('resize', handleEnvelopeScroll);
    };
  }, []);

  // Map font keys to CSS values
  const getFontFamily = (key: string) => {
    switch (key) {
      case 'playfair':
        return "'Playfair Display', Georgia, serif";
      case 'cormorant':
        return "'Cormorant Garamond', Georgia, serif";
      case 'cinzel':
        return "'Cinzel', Georgia, serif";
      case 'great-vibes':
        return "'Great Vibes', cursive";
      case 'montserrat':
        return "'Montserrat', sans-serif";
      case 'inter':
        return "'Inter', sans-serif";
      case 'lato':
        return "'Lato', sans-serif";
      default:
        return 'inherit';
    }
  };

  const titleFont = getFontFamily(config.theme.fontTitle);
  const bodyFont = getFontFamily(config.theme.fontBody);

  // Styles block matching user customization
  const containerStyle: React.CSSProperties = {
    backgroundColor: config.theme.bg,
    color: config.theme.text,
    fontFamily: bodyFont,
  };

  const textDarkStyle: React.CSSProperties = {
    color: config.theme.textDark,
  };

  const cardStyle: React.CSSProperties = {
    borderColor: config.theme.border,
    borderRadius: config.theme.cardBorderRadius,
    borderWidth: config.theme.cardBorderWidth,
    paddingTop: `${24 * config.theme.paddingMultiplier}px`,
    paddingBottom: `${40 * config.theme.paddingMultiplier}px`,
  };

  // Music toggle handler
  const togglePlay = () => {
    if (!audioRef.current || !config.musicUrl) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      setAudioError(false);
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Audio playback failed or was blocked by browser:', e?.message || e);
        setIsPlaying(false);
      });
    }
  };

  // Open overlay handler
  const handleOpenInvitation = () => {
    setOverlayOpened(true);
    // Auto-play audio if possible
    if (audioRef.current && config.musicUrl && !audioError) {
      audioRef.current.muted = false;
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Audio auto-play blocked by browser. User needs to tap the audio button.', e?.message || e);
      });
    }
    // Auto-play video immediately and completely synchronously inside the click gesture stack
    if (videoRef.current) {
      videoRef.current.muted = true;
      videoRef.current.play().then(() => {
        setIsVideoPlaying(true);
      }).catch((e) => {
        console.warn('Synchronous video play blocked or failed:', e?.message || e);
      });
    }
  };

  // Video control handlers
  const handleToggleVideoPlay = () => {
    if (!videoRef.current) return;
    if (isVideoPlaying) {
      videoRef.current.pause();
      setIsVideoPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsVideoPlaying(true);
      }).catch((e) => {
        console.warn('Video playback failed:', e?.message || e);
      });
    }
  };

  const handleToggleVideoMute = () => {
    if (!videoRef.current) return;
    const nextMute = !isVideoMuted;
    videoRef.current.muted = nextMute;
    setIsVideoMuted(nextMute);
  };

  // Countdown timer logic
  useEffect(() => {
    const interval = setInterval(() => {
      const weddingTime = new Date(config.dateIso).getTime();
      const now = new Date().getTime();
      const diff = weddingTime - now;

      if (diff <= 0) {
        setTimeRemaining({ days: 0, hours: 0, mins: 0, secs: 0 });
        clearInterval(interval);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const secs = Math.floor((diff % (1000 * 60)) / 1000);

      setTimeRemaining({ days, hours, mins, secs });
    }, 1000);

    return () => clearInterval(interval);
  }, [config.dateIso]);

  // Handle RSVP Submit
  const handleRsvpSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!rsvpName || !rsvpPhone || !rsvpAttending) {
      showToast('Por favor completa los campos requeridos.');
      return;
    }

    setIsSubmitting(true);
    
    const activeCompanions = companionNames.map(n => n.trim()).filter(Boolean);
    const finalFullName = activeCompanions.length > 0
      ? `${rsvpName.trim()} y ${activeCompanions.join(', ')}`
      : rsvpName.trim();

    setTimeout(() => {
      onSubmitRsvp({
        fullName: finalFullName,
        phone: rsvpPhone,
        attending: rsvpAttending as 'yes' | 'no',
        guestsCount: Number(rsvpGuests),
        notes: rsvpNotes,
      });
      setIsSubmitting(false);
      showToast('¡Gracias! Tu confirmación ha sido recibida.');
      // Reset form
      setRsvpName('');
      setRsvpPhone('');
      setRsvpAttending('');
      setRsvpGuests(1);
      setCompanionNames([]);
      setRsvpNotes('');
    }, 1200);
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 3500);
  };

  // Helper to render dynamic Lucide icons
  const renderIcon = (iconName: string, className = "w-6 h-6") => {
    const IconComp = (Icons as any)[iconName];
    if (IconComp) {
      return <IconComp className={className} style={{ stroke: config.theme.accent }} />;
    }
    return <Icons.HelpCircle className={className} style={{ stroke: config.theme.accent }} />;
  };

  // Render a clean SVG floral divider matching user's original
  const renderFloralDivider = () => {
    if (config.images.floralDivider) {
      return (
        <img
          src={config.images.floralDivider}
          alt=""
          className="w-48 max-w-[70vw] h-auto my-4 object-contain mx-auto pointer-events-none"
          referrerPolicy="no-referrer"
        />
      );
    }
    return (
      <svg className="w-64 max-w-[80vw] h-auto my-4 transition-all duration-300" viewBox="0 0 254 30" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M0 15 Q32 0 64 15 Q96 30 127 15 Q158 0 190 15 Q222 30 254 15" stroke={config.theme.border} strokeWidth="0.8" fill="none"/>
        <circle cx="127" cy="15" r="3" fill={config.theme.border} className="opacity-60" />
        <circle cx="64" cy="15" r="2" fill={config.theme.border} className="opacity-40" />
        <circle cx="190" cy="15" r="2" fill={config.theme.border} className="opacity-40" />
        <path d="M120 15 Q123 8 127 6 Q131 8 134 15" stroke={config.theme.border} strokeWidth="0.6" fill="none" className="opacity-40" />
        <path d="M120 15 Q123 22 127 24 Q131 22 134 15" stroke={config.theme.border} strokeWidth="0.6" fill="none" className="opacity-40" />
      </svg>
    );
  };

  return (
    <div className="relative w-full max-w-md mx-auto min-h-screen overflow-x-clip transition-colors duration-500 pb-16 shadow-2xl border-x border-stone-850/10" style={containerStyle}>
      {/* Elegant Absolute Stucco / Fine Paper Texture Overlay */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-[0.06] z-10 mix-blend-multiply"
        style={{
          backgroundImage: 'url("data:image/svg+xml;base64,PHN2ZyB4bWxucz0naHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmcnIHdpZHRoPScxODAnIGhlaWdodD0nMTgwJz48ZmlsdGVyIGlkPSdwYXBlcic+PGZlVHVyYnVsZW5jZSB0eXBlPSdmcmFjdGFsTm9pc2UnIGJhc2VGcmVxdWVuY3k9JzAuMDQnIG51bU9jdGF2ZXM9JzEnIHJlc3VsdD0nbm9pc2UnLz48ZmVEaWZmdXNlTGlnaHRpbmcgaW49J25vaXNlJyBsaWdodGluZy1jb2xvcj0nI2ZmZicgc3VyZmFjZVNjYWxlPScyJz48ZmVEaXN0YW50TGlnaHQgYXppbXV0aD0nNDUnIGVsZXZhdGlvbj0nNjAnLz48L2ZlRGlmZnVzZUxpZ2h0aW5nPjwvZmlsdGVyPjxyZWN0IHdpZHRoPScxMDAlJyBoZWlnaHQ9JzEwMCUnIGZpbHRlcj0ndXJsKCNwYXBlciknLz48L3N2Zz4=")',
          backgroundRepeat: 'repeat',
        }}
      />

      {/* Audio Element */}
      <audio 
        ref={audioRef} 
        loop 
        src={config.musicUrl} 
        onError={(e) => {
          console.warn('Audio source failed to load or has unsupported format:', config.musicUrl);
          setAudioError(true);
          setIsPlaying(false);
        }}
      />

      {/* Dynamic SVG Filter to tint envelope and ornaments to theme accent color */}
      <svg width="0" height="0" className="absolute pointer-events-none" style={{ position: 'absolute', width: 0, height: 0 }}>
        <defs>
          <filter id="theme-envelope-tint">
            <feColorMatrix
              type="matrix"
              values={getSvgColorMatrix(config.theme.accent || '#b85c46')}
            />
          </filter>
        </defs>
      </svg>

      {/* ------ MUSIC BUTTON ------ */}
      <button
        onClick={togglePlay}
        disabled={audioError}
        className={`fixed bottom-3 md:right-[calc(50%-224px+12px)] right-3 w-10 h-10 rounded-full flex items-center justify-center shadow-lg transition-all z-40 ${
          audioError 
            ? 'bg-stone-600/50 cursor-not-allowed border border-red-500/30' 
            : 'hover:scale-105 active:scale-95 cursor-pointer bg-[#753636]/90 backdrop-blur-sm'
        }`}
        title={audioError ? 'No se pudo cargar el archivo de audio. Verifique la URL de la música.' : 'Reproducir/Pausar música'}
        aria-label="Reproducir/Pausar música"
      >
        {audioError ? (
          <Icons.VolumeX className="w-5 h-5 text-red-300" />
        ) : isPlaying ? (
          <Icons.Volume2 className="w-5 h-5 text-white animate-pulse" />
        ) : (
          <Icons.VolumeX className="w-5 h-5 text-white" />
        )}
      </button>

      {/* ------ RESET OVERLAY BUTTON (Only visible in editor mode to test overlay) ------ */}
      {isEditorOpen && overlayOpened && config.sections.showOverlay && (
        <button
          onClick={() => setOverlayOpened(false)}
          className="fixed top-6 md:right-[calc(50%-224px+24px)] right-6 bg-black/70 hover:bg-black text-white px-3 py-1.5 rounded-full text-xs font-medium z-40 flex items-center gap-1.5 shadow-md border border-white/20 transition-all"
        >
          <Icons.RefreshCw className="w-3.5 h-3.5" /> Reabrir Portada
        </button>
      )}

      {/* ------ OPENING OVERLAY (Polygons) ------ */}
      <AnimatePresence>
        {config.sections.showOverlay && !overlayOpened && (
          <motion.div
            initial={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1, ease: "easeInOut" }}
            className="fixed inset-0 w-full h-full z-50 overflow-hidden bg-stone-900 select-none"
          >
            {/* Top Polygon */}
            <motion.div
              initial={{ y: 0 }}
              exit={{ y: "-100%" }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
              className="absolute top-0 left-0 w-full h-[55%] z-10"
            >
              <img
                src={config.images.overlayTop}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            {/* Left Polygon */}
            <motion.div
              initial={{ x: 0 }}
              exit={{ x: "-100%", opacity: 0 }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
              className="absolute top-0 left-0 w-[55%] h-full z-20"
            >
              <img
                src={config.images.overlayLeft}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            {/* Right Polygon */}
            <motion.div
              initial={{ x: 0 }}
              exit={{ x: "100%", opacity: 0 }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
              className="absolute top-0 right-0 w-[55%] h-full z-20"
            >
              <img
                src={config.images.overlayRight}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            {/* Bottom Polygon */}
            <motion.div
              initial={{ y: 0 }}
              exit={{ y: "100%" }}
              transition={{ duration: 1.8, ease: [0.4, 0, 0.2, 1] }}
              className="absolute bottom-0 left-0 w-full h-[70%] z-10"
            >
              <img
                src={config.images.overlayBottom}
                alt=""
                className="w-full h-full object-cover pointer-events-none"
                referrerPolicy="no-referrer"
              />
            </motion.div>

            {/* Central Opening Button */}
            <div className="absolute top-[50%] left-[50%] -translate-x-[50%] -translate-y-[55%] z-30 text-center">
              <motion.div
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleOpenInvitation}
                className="cursor-pointer flex flex-col items-center group"
              >
                <img
                  src={config.images.overlayCenter}
                  alt="Abrir"
                  className="w-32 h-32 md:w-36 md:h-36 rounded-full object-cover border-4 shadow-xl mb-4 group-hover:border-white transition-all duration-300 pointer-events-none"
                  style={{ 
                    borderColor: config.theme.border,
                    filter: 'sepia(0.6) saturate(1.8) hue-rotate(340deg) brightness(0.8) contrast(1.1)'
                  }}
                  referrerPolicy="no-referrer"
                />
                <div
                  className="px-6 py-2 rounded-full text-sm md:text-base font-semibold uppercase tracking-widest bg-white/95 text-stone-800 shadow-md group-hover:bg-white group-hover:shadow-lg transition-all"
                  style={{ fontFamily: bodyFont }}
                >
                  {config.overlayOpenText}
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------ FULL-SCREEN VIDEO HERO HEADER (ENTRANCE) ------ */}
      {config.sections.showVideo && videoSrc && (
        <div 
          ref={videoHeroRef}
          className="w-full h-screen relative overflow-hidden flex flex-col items-center justify-start select-none z-20"
        >
          <video
            ref={videoRef}
            src={videoSrc}
            loop
            muted={isVideoMuted}
            playsInline
            autoPlay
            className="absolute inset-0 w-full h-full object-cover"
          />

          {/* Transparent elegant text overlay over the sky/video */}
          {config.showVideoTextOverlay !== false && (
            <div
              style={{
                position: 'absolute',
                left: `${videoTextOverlayPos.x}%`,
                top: `${videoTextOverlayPos.y}%`,
                transform: 'translate(-50%, -50%)',
                width: '90%',
                maxWidth: '450px',
                pointerEvents: isEditorOpen ? 'auto' : 'none',
                cursor: isEditorOpen ? 'move' : 'default',
                zIndex: 30,
              }}
              onMouseDown={isEditorOpen ? startDraggingVideoText : undefined}
              onTouchStart={isEditorOpen ? startDraggingVideoText : undefined}
              className={`text-center transition-all duration-200 ${isEditorOpen ? 'hover:outline hover:outline-2 hover:outline-dashed hover:outline-amber-400/80 p-5 rounded bg-black/10 hover:bg-black/20' : ''}`}
            >
              <div 
                style={{ 
                  transform: `scale(${config.videoTextOverlayScale || 1.0})`,
                  transformOrigin: 'center center',
                }}
                className="select-none flex items-center justify-center"
              >
                <img
                  src={getApiUrl('/images/imagen_07.png')}
                  alt="Capa de Imagen Original"
                  className="w-full max-w-[400px] h-auto pointer-events-none select-none transition-all"
                  referrerPolicy="no-referrer"
                />
              </div>

              {isEditorOpen && (
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 bg-amber-500 text-black text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded shadow pointer-events-none whitespace-nowrap">
                  Arrastrar Capa Original (Cielo)
                </div>
              )}
            </div>
          )}

          {/* Foto de la pareja — capa movible y redimensionable sobre el video */}
          {config.showCoupleOverlay !== false && (
            <div
              style={{
                position: 'absolute',
                left: `${coupleOverlayPos.x}%`,
                top: `${coupleOverlayPos.y}%`,
                transform: `translate(-50%, -50%) scale(${coupleOverlayScale})`,
                transformOrigin: 'center center',
                pointerEvents: isEditorOpen ? 'auto' : 'none',
                cursor: isEditorOpen ? 'move' : 'default',
                zIndex: 25,
              }}
              onMouseDown={isEditorOpen ? startDraggingCoupleOverlay : undefined}
              onTouchStart={isEditorOpen ? startDraggingCoupleOverlay : undefined}
              className={`transition-transform duration-150 ${isEditorOpen ? 'hover:outline hover:outline-2 hover:outline-dashed hover:outline-amber-400/80 rounded' : ''}`}
            >
              <img
                src={config.images.coupleOverlay || getApiUrl('/images/pareja_overlay_ivory.png')}
                alt="Los novios"
                className="w-[260px] max-w-[70vw] h-auto pointer-events-none select-none"
                referrerPolicy="no-referrer"
              />

              {isEditorOpen && (
                <div className="pointer-events-auto absolute -bottom-9 left-1/2 -translate-x-1/2 flex items-center gap-1.5 bg-black/75 backdrop-blur-sm rounded-full px-2 py-1 shadow-md whitespace-nowrap">
                  <button
                    type="button"
                    onClick={() => adjustCoupleOverlayScale(-0.1)}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white text-sm leading-none"
                    aria-label="Reducir tamaño"
                  >
                    –
                  </button>
                  <span className="text-white text-[9px] uppercase tracking-widest px-1">Tamaño</span>
                  <button
                    type="button"
                    onClick={() => adjustCoupleOverlayScale(0.1)}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 text-white text-sm leading-none"
                    aria-label="Aumentar tamaño"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
  

      {/* ------ MINIMALIST WEDDING DETAILS / DESIGN ELEMENTS ------ */}
      <div className="w-full py-3 px-4 flex flex-col items-center justify-center text-center relative z-20" style={{ backgroundColor: config.theme.bg }}>
        {/* Design elements removed per user feedback */}
      </div>

    {/* ------ ENVELOPE SCROLL INTERACTIVE SCENE ------ */}
<section 
  ref={envelopeSceneRef} 
  className="scene relative w-full -mt-2"
  style={{ height: '112vh' }}
>
  <div className="sticky top-[8vh] h-[84vh] w-full flex items-center justify-center overflow-hidden z-20">
    <div className="stage w-full h-full flex items-center justify-center p-4">
      
      <div 
        ref={envelopeWrapperRef}
        style={{
          '--env-size': 'min(480px, 92vw)',
          '--letter-y': '0px',
          '--flap-rot': '-180deg',
          '--letter-shadow': '0.06',
          '--letter-scale': '0.985',
          '--flap-z': '8',
          '--letter-z': '3',
        } as React.CSSProperties}
        className="envelope-wrapper relative w-[var(--env-size)] aspect-square isolate transform-style-preserve-3d"
      >
        
        {/* Decorative leaves — posicionadas en % del sobre para que escalen bien */}
        <img
          className="deco deco-left deco-left-resp absolute z-[2] pointer-events-none select-none w-[22%] top-[13%] left-[50%] -translate-x-[14%] animate-floatB will-change-transform"
          src="https://static.tildacdn.net/tild6435-3530-4464-b966-383935316136/Untitled_Project_9_3.png"
          alt=""
          style={{ filter: 'url(#theme-envelope-tint)' }}
        />

        <img
          className="deco deco-right deco-right-resp absolute z-[2] pointer-events-none select-none w-[14%] top-[18%] left-[50%] translate-x-[1%] animate-floatC will-change-transform"
          src="https://static.tildacdn.net/tild3538-6563-4264-b363-393261666238/noroot.png"
          alt=""
          style={{ filter: 'url(#theme-envelope-tint)' }}
        />

        {/* Envelope Back */}
        <img
          className="envelope-back absolute inset-0 z-1 w-full h-full object-contain select-none pointer-events-none drop-shadow-[0_24px_34px_rgba(0,0,0,0.09)]"
          src="https://static.tildacdn.net/tild3935-3461-4137-b866-623466636431/Untitled_Project_9_2.png"
          alt="Envelope back"
          style={{ filter: 'url(#theme-envelope-tint)' }}
        />

        <div className="flap-hinge-shadow absolute left-[14%] right-[14%] top-[56%] h-[3.7%] z-4 bg-[radial-gradient(ellipse_at_center,rgba(0,0,0,0.12),transparent_70%)] blur-[8px] opacity-22 pointer-events-none"></div>

        {/* Letter — top/width/alto ahora en % del sobre, ya no se sale por abajo */}
        <article 
          className="letter letter-resp absolute left-[50%] top-[35.5%] w-[61.8%] min-h-[66%] origin-top rounded-lg overflow-hidden will-change-transform"
          style={{
            transform: 'translate(-50%, var(--letter-y)) scale(var(--letter-scale))',
            boxShadow: '0 18px 42px rgba(0,0,0,var(--letter-shadow))',
            zIndex: 'var(--letter-z, 3)' as any,
            backgroundImage: `url("${getApiUrl('/images/sobre_fondo.jpg')}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            backgroundRepeat: 'no-repeat',
          }}
        >
          {/* Subtle paper finish overlay (semi-transparent to preserve the watercolor and leaf sketches) */}
          <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none z-1" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(0,0,0,0.01),transparent_45%)] pointer-events-none z-1" />
          
          <div className="letter-inner letter-inner-resp relative z-10 px-6 py-8 text-center flex flex-col justify-between min-h-full">
            <div>
              <h2 
                className="letter-title mb-2 md:mb-4 text-[18px] md:text-[24px] font-medium leading-[1.1]"
                style={{ fontFamily: titleFont, color: config.theme.textDark }}
              >
                Queridos amigos y familia,
              </h2>

              <p 
                className="letter-text text-[9.5px] md:text-base leading-relaxed mb-2 md:mb-4"
                style={{ fontFamily: bodyFont, color: config.theme.text }}
              >
                Mientras nos preparamos para decir “Sí, acepto”, nos sentimos profundamente agradecidos por tener personas tan maravillosas en nuestras vidas.
              </p>

              <p 
                className="letter-text text-[9.5px] md:text-base leading-relaxed"
                style={{ fontFamily: bodyFont, color: config.theme.text }}
              >
                Su apoyo significa todo para nosotros, y sería un gran honor que nos acompañen a comenzar esta nueva etapa juntos.
              </p>
            </div>
          </div>
        </article>

        {/* Static lower front pocket */}
        <div className="envelope-front absolute inset-0 z-6 pointer-events-none select-none">
          <img
            src="https://static.tildacdn.net/tild6439-3462-4163-b432-363239323565/Group_63_2.png"
            alt="Envelope front"
            className="absolute inset-0 w-full h-full object-contain block"
            style={{ 
              clipPath: 'polygon(0 53.5%, 100% 53.5%, 100% 100%, 0 100%)',
              filter: 'url(#theme-envelope-tint)'
            }}
          />
        </div>

        {/* Animated flap */}
        <div 
          className="envelope-flap absolute inset-0 pointer-events-none transform-style-preserve-3d origin-[50%_56.2%] will-change-transform"
          style={{ 
            transform: 'rotateX(var(--flap-rot))',
            zIndex: 'var(--flap-z, 8)' as any,
          }}
        >
          <img
            className="flap-front absolute inset-0 w-full h-full object-contain block backface-visibility-hidden"
            src="https://static.tildacdn.net/tild6439-3462-4163-b432-363239323565/Group_63_2.png"
            alt=""
            style={{ 
              clipPath: 'polygon(0 0, 100% 0, 100% 57.2%, 0 57.2%)', 
              transform: 'rotateX(0deg)',
              filter: 'url(#theme-envelope-tint)'
            }}
          />
          <img
            className="flap-back absolute inset-0 w-full h-full object-contain block backface-visibility-hidden"
            src="https://static.tildacdn.net/tild6439-3462-4163-b432-363239323565/Group_63_2.png"
            alt=""
            style={{ 
              clipPath: 'polygon(0 0, 100% 0, 100% 57.2%, 0 57.2%)', 
              transform: 'rotateX(180deg) scaleY(1)',
              filter: 'url(#theme-envelope-tint) brightness(0.85) saturate(0.95)'
            }}
          />
        </div>

      </div>

    </div>
  </div>
</section>

      {/* ------ POLAROID CAROUSEL SECTION ------ */}
      <div className="w-full pt-1 pb-4 flex flex-col items-center justify-center overflow-hidden relative z-10 -mt-10" style={{ backgroundColor: config.theme.bg }}>
        {/* Carousel Container */}
        <div 
          className="w-full flex gap-4 px-6 py-2 overflow-x-auto scrollbar-none snap-x snap-mandatory scroll-smooth"
          style={{
            scrollbarWidth: 'none',
            msOverflowStyle: 'none',
          }}
        >
          {config.polaroids && config.polaroids.length > 0 ? (
            config.polaroids.map((p, idx) => {
              // Alternate tilts for organic feel
              const tilt = idx % 3 === 0 ? '-rotate-2' : idx % 3 === 1 ? 'rotate-1' : 'rotate-2';
              const isPlaceholder = !p.url || p.url.includes('placeholder') || p.url === '' || p.url.startsWith('/images/invitacion_');
              return (
                <div 
                  key={p.id || idx}
                  className={`flex-shrink-0 w-[125px] bg-[#faf9f6] p-2 pb-5 rounded-[1px] shadow-[0_5px_15px_rgba(0,0,0,0.06),0_1.5px_4px_rgba(0,0,0,0.04)] border border-stone-200/40 snap-center transform hover:scale-105 hover:-rotate-1 hover:shadow-[0_12px_24px_rgba(0,0,0,0.09)] transition-all duration-300 ${tilt}`}
                >
                  {/* Photo container (Square inside a portrait polaroid) */}
                  <div className="w-full aspect-square overflow-hidden bg-stone-100/60 rounded-[1px] mb-2 relative shadow-[inset_0_1px_3px_rgba(0,0,0,0.12)] border border-stone-200/40">
                    {isPlaceholder ? (
                      <div className="w-full h-full flex flex-col items-center justify-center bg-stone-50 text-stone-400 p-2 text-center select-none pointer-events-none">
                        <Icons.Camera className="w-5 h-5 mb-1 text-stone-300 stroke-[1.2]" />
                        <span className="text-[8px] uppercase tracking-wider font-light text-stone-400">+ Añadir</span>
                      </div>
                    ) : (
                      <img 
                        src={getApiUrl(p.url)} 
                        alt={p.caption || "Momento"} 
                        className="w-full h-full object-cover select-none pointer-events-none"
                        referrerPolicy="no-referrer"
                      />
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <div className="w-full text-center text-stone-400 text-xs py-8">
              No hay fotos en la galería aún.
            </div>
          )}
        </div>
        
        {/* Scroll indicator */}
        <div className="flex items-center gap-1 mt-1.5 text-[9px] text-stone-400 uppercase tracking-widest animate-pulse">
          <Icons.ChevronRight className="w-2.5 h-2.5 text-stone-400" />
        </div>
      </div>

      {/* ------ BEAUTIFUL IMAGE CARDS VERTICAL FEED ------ */}
      <div className="relative z-10 flex flex-col items-center justify-center pb-4 w-full mx-auto px-4 max-w-[450px] animate-fade-in pt-8">

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, ease: "easeOut" }}
          className="w-full"
        >
          {(() => {
            // Get all active slots dynamically from the server status with custom ordering
            const activeSlots = getOrderedSlots();

            const slotTitles: Record<number, string> = {
              1: "Cuenta Regresiva",
              2: "Dress Code",
              3: "Cronograma",
              4: "Regalos"
            };

            const uploadedSlices = activeSlots.map((num, index) => {
              const key = `invitacion_${num}`;
              return (
                <div 
                  key={key} 
                  className="relative w-full bg-white/40 border border-stone-200/60 rounded-3xl overflow-hidden shadow-md backdrop-blur-[1px]"
                >
                  {renderImageSlot(num, slotTitles[num] || `Sección ${num}`, index, activeSlots.length)}
                </div>
              );
            });

            const maxSlotNum = Math.max(...activeSlots, 4);

            return (
              <div className="w-full flex flex-col gap-3">
                {uploadedSlices}
                
                {/* Dynamic "+" button to add new slots (ONLY in editor mode) */}
                {isEditorOpen && (
                  <div className="w-full bg-white/20 border border-dashed border-stone-300/60 rounded-3xl overflow-hidden shadow-sm backdrop-blur-[1px] mt-6 px-4 mx-auto max-w-[460px] relative min-h-[140px] flex flex-col items-center justify-center transition-all duration-300 hover:bg-stone-100/10 hover:border-amber-500/50 group">
                    <label className="w-full h-full py-10 px-6 flex flex-col items-center justify-center cursor-pointer">
                      <div className="p-3.5 rounded-full bg-stone-50 border border-stone-200 text-stone-500 group-hover:scale-105 group-hover:bg-amber-50 group-hover:border-amber-200 group-hover:text-amber-700 transition-all duration-300">
                        <Icons.Plus className="w-6 h-6 text-stone-600 group-hover:text-amber-700" />
                      </div>
                      <span className="text-xs font-semibold text-stone-600 mt-3 group-hover:text-stone-800 transition-colors">
                        Agregar nueva parte (.webp)
                      </span>
                      <span className="text-[9px] uppercase tracking-wider text-stone-400 mt-0.5">
                        Se guardará como Sección {maxSlotNum + 1}
                      </span>
                      <input
                        type="file"
                        accept="image/webp"
                        className="hidden"
                        onChange={(e) => handleImageUpload(e, `invitacion_${maxSlotNum + 1}`)}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })()}
        </motion.div>
      </div>

      {/* ------ RSVP SECTION ------ */}
      {config.sections.showRsvp && (
        <div className="w-full flex flex-col items-center pt-4 pb-12 px-4">
          <div 
            className="w-full max-w-[450px] h-px my-8" 
            style={{ background: `linear-gradient(to right, transparent, rgba(117, 54, 54, 0.2), transparent)` }}
          />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="w-full max-w-[450px] p-6 md:p-8 bg-white/40 border border-stone-200/60 rounded-3xl shadow-md backdrop-blur-[1px] text-center relative transition-all duration-300"
          >
             {config.images.rsvpHeader && (
               <img
                 src={config.images.rsvpHeader}
                 alt=""
                 className="w-32 h-auto mx-auto mb-4 object-contain max-h-24 pointer-events-none"
                 referrerPolicy="no-referrer"
               />
             )}
             <h2
              className="text-xl md:text-2xl font-light uppercase tracking-widest mb-3"
              style={{ fontFamily: titleFont, color: '#753636' }}
            >
              Confirmar asistencia
            </h2>
            
            {matchedGuest ? (
              <div className="mb-6 p-4 bg-white/60 border border-[#753636]/20 rounded-2xl text-center shadow-sm backdrop-blur-[1px]">
                <Icons.Sparkles className="w-4 h-4 text-[#753636] mx-auto mb-2 animate-pulse" />
                <h3 className="text-sm font-semibold" style={{ fontFamily: titleFont, color: '#753636' }}>
                  ¡Hola, {matchedGuest.name}!
                </h3>
                <p className="text-xs text-[#753636]/80 mt-1.5 leading-relaxed">
                  Nos hace muy felices compartir este momento contigo. Hemos asignado <strong className="text-[#753636] font-semibold">{matchedGuest.maxGuests} {matchedGuest.maxGuests === 1 ? 'pase' : 'pases'}</strong> especialmente para ti.
                </p>
              </div>
            ) : (
              <p className="text-xs md:text-sm italic mb-6 text-[#753636]/60">
                Por favor, confirma tu asistencia antes de la fecha señalada
              </p>
            )}

            <form onSubmit={handleRsvpSubmit} className="flex flex-col gap-4 text-left">
              <div>
                <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-[#753636]/80 font-medium mb-1.5">Nombre completo</label>
                <input
                  type="text"
                  required
                  value={rsvpName}
                  onChange={(e) => setRsvpName(e.target.value)}
                  placeholder="Tu nombre completo"
                  className="w-full px-4 py-3 rounded-xl border bg-white/30 focus:bg-white/85 focus:border-[#753636]/60 outline-none transition-all text-xs md:text-sm placeholder-[#753636]/40"
                  style={{ color: '#753636', borderColor: 'rgba(117, 54, 54, 0.2)' }}
                />
              </div>

              <div>
                <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-[#753636]/80 font-medium mb-1.5">Número telefónico</label>
                <input
                  type="tel"
                  required
                  value={rsvpPhone}
                  onChange={(e) => setRsvpPhone(e.target.value)}
                  placeholder="Tu número telefónico o celular"
                  className="w-full px-4 py-3 rounded-xl border bg-white/30 focus:bg-white/85 focus:border-[#753636]/60 outline-none transition-all text-xs md:text-sm placeholder-[#753636]/40"
                  style={{ color: '#753636', borderColor: 'rgba(117, 54, 54, 0.2)' }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-[#753636]/80 font-medium mb-1.5">¿Asistirás?</label>
                  <select
                    required
                    value={rsvpAttending}
                    onChange={(e) => setRsvpAttending(e.target.value as 'yes' | 'no')}
                    className="w-full px-3 py-3 rounded-xl border bg-white/30 focus:bg-white/85 focus:border-[#753636]/60 outline-none transition-all text-xs md:text-sm cursor-pointer"
                    style={{ color: '#753636', borderColor: 'rgba(117, 54, 54, 0.2)' }}
                  >
                    <option value="" disabled style={{ color: '#753636' }}>Selecciona...</option>
                    <option value="yes" style={{ color: '#753636' }}>Asistiré</option>
                    <option value="no" style={{ color: '#753636' }}>No podré asistir</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-[#753636]/80 font-medium mb-1.5">
                    {matchedGuest ? `Asistentes (Máx. ${matchedGuest.maxGuests})` : 'Nº de invitados'}
                  </label>
                  <select
                    value={rsvpGuests}
                    onChange={(e) => setRsvpGuests(Number(e.target.value))}
                    disabled={rsvpAttending === 'no'}
                    className="w-full px-3 py-3 rounded-xl border bg-white/30 focus:bg-white/85 focus:border-[#753636]/60 outline-none transition-all text-xs md:text-sm cursor-pointer disabled:opacity-40"
                    style={{ color: '#753636', borderColor: 'rgba(117, 54, 54, 0.2)' }}
                  >
                    {Array.from(
                      { length: matchedGuest ? matchedGuest.maxGuests : 5 },
                      (_, idx) => idx + 1
                    ).map((val) => (
                      <option key={val} value={val} style={{ color: '#753636' }}>
                        {val} {val === 1 ? 'persona' : 'personas'}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {rsvpAttending === 'yes' && rsvpGuests > 1 && (
                <div className="space-y-3">
                  <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-[#753636]/80 font-medium mb-1">Nombre completo de acompañantes</label>
                  {companionNames.map((name, idx) => (
                    <input
                      key={idx}
                      type="text"
                      required
                      value={name}
                      onChange={(e) => {
                        const updated = [...companionNames];
                        updated[idx] = e.target.value;
                        setCompanionNames(updated);
                      }}
                      placeholder={`Nombre completo del acompañante ${idx + 2}`}
                      className="w-full px-4 py-3 rounded-xl border bg-white/30 focus:bg-white/85 focus:border-[#753636]/60 outline-none transition-all text-xs md:text-sm placeholder-[#753636]/40"
                      style={{ color: '#753636', borderColor: 'rgba(117, 54, 54, 0.2)' }}
                    />
                  ))}
                </div>
              )}

              <div>
                <label className="block text-[10px] md:text-[11px] uppercase tracking-widest text-[#753636]/80 font-medium mb-1.5">Mensaje (Opcional)</label>
                <textarea
                  value={rsvpNotes}
                  onChange={(e) => setRsvpNotes(e.target.value)}
                  placeholder="Escribe aquí tu mensaje, felicitaciones o si tienes alguna alergia a alimentos..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border bg-white/30 focus:bg-white/85 focus:border-[#753636]/60 outline-none transition-all text-xs md:text-sm resize-none placeholder-[#753636]/40"
                  style={{ color: '#753636', borderColor: 'rgba(117, 54, 54, 0.2)' }}
                />
              </div>

              <motion.button
                whileHover={{ scale: 1.02, opacity: 0.95 }}
                whileTap={{ scale: 0.98 }}
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3.5 mt-2 text-xs md:text-sm uppercase tracking-widest rounded-xl transition-all font-medium disabled:opacity-50 shadow-sm hover:shadow text-white cursor-pointer hover:bg-[#5e2b2b]"
                style={{
                  backgroundColor: '#753636',
                  fontFamily: titleFont,
                }}
              >
                {isSubmitting ? 'Enviando...' : 'Confirmar'}
              </motion.button>
            </form>
          </motion.div>
        </div>
      )}

      {/* ------ BOTTOM PHOTO & LOGO SECTION ------ */}
      <div className="w-full flex flex-col items-center justify-center pb-8 pt-4 px-4 relative z-10" style={{ backgroundColor: config.theme.bg }}>
        {config.blurredPhotoUrl && (
          <div className="w-full max-w-[450px] aspect-[4/3] rounded-[32px] overflow-hidden relative shadow-md border border-stone-200/40 mb-10 group">
            {/* Real blurred background image */}
            <img 
              src={config.blurredPhotoUrl} 
              alt="Cierre romántico" 
              className="w-full h-full object-cover filter blur-[4px] scale-105 transition-all duration-700 group-hover:blur-[2px]"
              referrerPolicy="no-referrer"
            />
            {/* Elegant overlay text */}
            <div className="absolute inset-0 bg-stone-900/10 flex flex-col items-center justify-center p-6 text-center select-none">
              <span className="text-[10px] md:text-xs uppercase tracking-[0.3em] text-white/90 drop-shadow-md font-medium" style={{ fontFamily: bodyFont }}>
                Te esperamos en nuestro gran día
              </span>
              <h4 className="text-xl md:text-2xl font-light text-white drop-shadow-lg uppercase tracking-widest mt-2" style={{ fontFamily: titleFont }}>
                {config.coupleName1} & {config.coupleName2}
              </h4>
            </div>
          </div>
        )}

        {/* ALWAYS show the bottom logo & web details section to guarantee a dedicated space */}
        <div className="flex flex-col items-center justify-center text-center max-w-[320px] mx-auto mt-2 w-full">
          {config.bottomLogoUrl ? (
            <div className="w-36 h-36 md:w-44 md:h-44 flex items-center justify-center transition-all duration-300 hover:scale-105">
              <img 
                src={getApiUrl(config.bottomLogoUrl)} 
                alt="Logo oficial" 
                className="max-w-full max-h-full object-contain pointer-events-none select-none"
                referrerPolicy="no-referrer"
              />
            </div>
          ) : (
            <div className="w-28 h-28 md:w-36 md:h-36 rounded-full border border-dashed border-stone-300/80 flex flex-col items-center justify-center text-stone-400 p-4 hover:border-amber-500/50 transition-colors">
              <Icons.Sparkles className="w-5 h-5 text-stone-300 mb-1" />
              <span className="text-[8px] uppercase tracking-wider text-stone-400 font-light">Espacio de Logo</span>
            </div>
          )}
        </div>
      </div>

      {/* ------ FOOTER ------ */}
      <footer className="w-full text-center py-12 px-6 mt-12 text-xs uppercase tracking-widest opacity-60">
        {config.coupleName1} & {config.coupleName2} — {new Date(config.dateIso).toLocaleDateString('es-ES', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        }).replace(/\//g, ' . ')}
      </footer>

      {/* ------ TOAST NOTIFICATION ------ */}
      <AnimatePresence>
        {toastMessage && (
          <div className="fixed inset-x-0 bottom-24 flex justify-center z-50 pointer-events-none px-4">
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              className="bg-stone-900 text-stone-100 text-sm py-3 px-6 rounded-xl shadow-xl flex items-center gap-2 max-w-md pointer-events-auto border border-stone-800"
              style={{ fontFamily: bodyFont }}
            >
              <Icons.CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{toastMessage}</span>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
