/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import * as Icons from 'lucide-react';
import { WeddingConfig, RsvpResponse } from './types';
import { DEFAULT_WEDDING_CONFIG } from './defaultConfig';
import InvitationPreview from './components/InvitationPreview';
import AdminPanel from './components/AdminPanel';
import { getVideoFromIndexedDB } from './utils/indexedDB';
import { getApiUrl } from './utils/apiUrl';
import {
  db,
  isFirebaseActive,
  OperationType,
  handleFirestoreError
} from './firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  updateDoc,
  doc,
  getDoc,
  setDoc
} from 'firebase/firestore';
import { Guest } from './types';

export default function App() {
  const [config, setConfig] = useState<WeddingConfig>(DEFAULT_WEDDING_CONFIG);
  const [localVideoUrl, setLocalVideoUrl] = useState<string | null>(null);
  const [localMusicUrl, setLocalMusicUrl] = useState<string | null>(null);
  const [isLoadingConfig, setIsLoadingConfig] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  // Load config on mount from Firestore or localStorage
  useEffect(() => {
    const loadConfig = async () => {
      setIsLoadingConfig(true);
      
      // 1. Try loading from Firestore if active
      if (isFirebaseActive && db) {
        try {
          const docRef = doc(db, 'wedding_config', 'default_config');
          const docSnap = await getDoc(docRef);
          if (docSnap.exists()) {
            let loadedConfig = docSnap.data() as WeddingConfig;
            if (!loadedConfig.videoUrl || loadedConfig.videoUrl.includes('drive.google.com')) {
              loadedConfig = {
                ...loadedConfig,
                videoUrl: 'https://pub-4dc8201144ca418fb604349c73e8c724.r2.dev/Italian_villa_terrace_202604231419%20(1).MP4'
              };
              try {
                await setDoc(docRef, loadedConfig);
              } catch (saveErr) {
                console.error('Error migrating videoUrl in Firestore:', saveErr);
              }
            }
            setConfig(loadedConfig);
            setIsLoadingConfig(false);
            return;
          }
        } catch (err) {
          console.error('Error loading config from Firestore:', err);
        }
      }

      // 2. Fallback to localStorage
      const saved = localStorage.getItem('wedding_config_v1');
      if (saved) {
        try {
          let loadedConfig = JSON.parse(saved) as WeddingConfig;
          if (!loadedConfig.videoUrl || loadedConfig.videoUrl.includes('drive.google.com')) {
            loadedConfig = {
              ...loadedConfig,
              videoUrl: 'https://pub-4dc8201144ca418fb604349c73e8c724.r2.dev/Italian_villa_terrace_202604231419%20(1).MP4'
            };
            localStorage.setItem('wedding_config_v1', JSON.stringify(loadedConfig));
          }
          setConfig(loadedConfig);
        } catch (e) {
          console.error('Error parsing localStorage config:', e);
        }
      }
      setIsLoadingConfig(false);
    };

    loadConfig();
  }, []);

  // Save config changes dynamically
  const handleConfigChange = async (newConfig: WeddingConfig) => {
    setConfig(newConfig);

    // Save to localStorage
    localStorage.setItem('wedding_config_v1', JSON.stringify(newConfig));

    // Save to Firestore if active
    if (isFirebaseActive && db) {
      try {
        const docRef = doc(db, 'wedding_config', 'default_config');
        await setDoc(docRef, newConfig);
      } catch (err) {
        console.error('Error saving config to Firestore:', err);
        try {
          handleFirestoreError(err, OperationType.UPDATE, 'wedding_config/default_config');
        } catch (e) {
          // Handled
        }
      }
    }
  };

  // Load local/server video and audio on mount
  useEffect(() => {
    // 1. First check if the server-side wedding video exists
    fetch(getApiUrl('/api/video-status'))
      .then((res) => res.json())
      .then((data) => {
        if (data.exists) {
          // If the server video exists, use the server URL (using absolute path for Safari compat)
          setLocalVideoUrl(getApiUrl('/video/wedding.mp4'));
        } else {
          // 2. Otherwise fallback to client-side IndexedDB
          getVideoFromIndexedDB().then((blob) => {
            if (blob) {
              const url = URL.createObjectURL(blob);
              setLocalVideoUrl(url);
            }
          }).catch((err) => {
            console.error('Error loading video from IndexedDB:', err);
          });
        }
      })
      .catch((err) => {
        console.error('Error checking server-side video status:', err);
        // Fallback to IndexedDB on server check error
        getVideoFromIndexedDB().then((blob) => {
          if (blob) {
            const url = URL.createObjectURL(blob);
            setLocalVideoUrl(url);
          }
        });
      });

    // 2. Check if the server-side wedding audio exists
    fetch(getApiUrl('/api/audio-status'))
      .then((res) => res.json())
      .then((data) => {
        if (data.exists) {
          setLocalMusicUrl(getApiUrl('/audio/wedding.mp3'));
        }
      })
      .catch((err) => {
        console.error('Error checking server-side audio status:', err);
      });

    return () => {
      if (localVideoUrl && localVideoUrl.startsWith('blob:')) {
        URL.revokeObjectURL(localVideoUrl);
      }
    };
  }, []);

  // 2. HANDLE NEW RSVP SUBMISSION
  const handleRsvpSubmit = async (rsvpData: Omit<RsvpResponse, 'id' | 'submittedAt'>) => {
    const newRsvp: Omit<RsvpResponse, 'id'> = {
      ...rsvpData,
      submittedAt: new Date().toISOString(),
    };

    if (isFirebaseActive && db) {
      try {
        await addDoc(collection(db, 'rsvps'), newRsvp);

        // Update guest confirmation in Firestore if guest code exists in URL
        const params = new URLSearchParams(window.location.search);
        const guestCode = params.get('g')?.trim();
        if (guestCode) {
          const q = query(collection(db, 'guests'), where('code', '==', guestCode));
          const querySnapshot = await getDocs(q);
          if (!querySnapshot.empty) {
            const guestDoc = querySnapshot.docs[0];
            await updateDoc(doc(db, 'guests', guestDoc.id), {
              confirmed: true,
              attending: newRsvp.attending,
              guestsCount: newRsvp.guestsCount,
            });
          }
        }
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, 'rsvps');
      }
    } else {
      // Local Fallback
      const fullRsvp: RsvpResponse = {
        id: `rsvp-${Date.now()}`,
        ...newRsvp,
      };
      const savedRsvps = localStorage.getItem('wedding_rsvps_v1');
      let rsvpsList: RsvpResponse[] = [];
      if (savedRsvps) {
        try {
          rsvpsList = JSON.parse(savedRsvps);
        } catch (e) {
          console.error('Error parsing rsvps:', e);
        }
      }
      const updatedRsvps = [fullRsvp, ...rsvpsList];
      localStorage.setItem('wedding_rsvps_v1', JSON.stringify(updatedRsvps));

      // Local Guest Fallback: Update confirmation status
      const params = new URLSearchParams(window.location.search);
      const guestCode = params.get('g')?.trim();
      if (guestCode) {
        const savedGuests = localStorage.getItem('wedding_guests_v1');
        if (savedGuests) {
          try {
            const guestsList = JSON.parse(savedGuests) as Guest[];
            const updatedGuests = guestsList.map(g => {
              if (g.code === guestCode) {
                return {
                  ...g,
                  confirmed: true,
                  attending: newRsvp.attending,
                  guestsCount: newRsvp.guestsCount
                };
              }
              return g;
            });
            localStorage.setItem('wedding_guests_v1', JSON.stringify(updatedGuests));
          } catch (e) {
            console.error('Error updating local guest confirmation:', e);
          }
        }
      }
    }
  };

  const activeConfig = {
    ...config,
    videoUrl: localVideoUrl || config.videoUrl,
    musicUrl: localMusicUrl || config.musicUrl
  };

  if (isLoadingConfig) {
    return (
      <div className="w-full min-h-screen bg-stone-950 flex flex-col items-center justify-center text-stone-300">
        <Icons.Loader2 className="w-8 h-8 text-amber-500 animate-spin mb-3" />
        <p className="text-xs uppercase tracking-widest font-light">Cargando invitación...</p>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-stone-950 flex flex-col font-sans select-none overflow-x-clip">
      <InvitationPreview
        config={activeConfig}
        onSubmitRsvp={handleRsvpSubmit}
        isEditorOpen={isAdmin}
        onConfigChange={handleConfigChange}
      />
      
      {/* Sleek organizer dashboard for video upload, guest list & full live content editor */}
      <AdminPanel 
        config={activeConfig}
        onVideoUploaded={(newUrl) => setLocalVideoUrl(newUrl)}
        onMusicUploaded={(newUrl) => setLocalMusicUrl(newUrl)}
        onConfigChange={handleConfigChange}
        onAdminStatusChange={setIsAdmin}
      />
    </div>
  );
}
