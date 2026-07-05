export interface DetailCardData {
  id: string;
  title: string;
  description: string;
  icon: string; // Lucide icon name, e.g., 'Clock', 'GlassWater', 'Shirt', 'MapPin'
}

export interface WeddingTheme {
  bg: string;
  text: string;
  textDark: string;
  border: string;
  accent: string;
  fontTitle: string; // 'playfair' | 'cormorant' | 'cinzel' | 'great-vibes'
  fontBody: string;  // 'montserrat' | 'inter' | 'lato'
  cardBorderRadius: string; // '0px' | '12px' | '24px' | '40px' | '9999px'
  cardBorderWidth: string;  // '1px' | '2px' | '4px'
  paddingMultiplier: number; // 0.8, 1.0, 1.2
}

export interface WeddingSections {
  showOverlay: boolean;
  showCountdown: boolean;
  showDetails: boolean;
  showRsvp: boolean;
  showVideo: boolean;
}

export interface WeddingConfig {
  coupleName1: string;
  coupleName2: string;
  subtitle: string;
  dateText: string;
  dateIso: string; // e.g. "2025-08-15T16:00:00"
  locationText: string;
  locationName: string;
  overlayOpenText: string;
  musicUrl: string;
  videoUrl: string; // URL or local path to video file
  videoAspectRatio: '9:16' | '16:9' | '1:1';
  theme: WeddingTheme;
  sections: WeddingSections;
  details: DetailCardData[];
  countdownPosition?: { x: number; y: number };
  countdownScale?: number;
  countdownFormat?: 'full' | 'short' | 'days-hours' | 'days';
  locationButtonPosition?: { x: number; y: number };
  locationButtonScale?: number;
  imageOrder?: number[];
  hotelLocationUrl?: string;
  lockCronograma?: boolean;
  images: {
    portrait: string;
    overlayLeft: string;
    overlayRight: string;
    overlayTop: string;
    overlayBottom: string;
    overlayCenter: string;
    countdownHeader?: string;
    detailsHeader?: string;
    rsvpHeader?: string;
    floralDivider?: string;
  };
  polaroids?: { id: string; url: string; caption?: string; posX?: number; posY?: number; zoom?: number }[];
  blurredPhotoUrl?: string;
  bottomLogoUrl?: string;
  weddingWebsiteUrl?: string;
  videoTextOverlayY?: number;
  videoTextOverlayX?: number;
  videoTextOverlayScale?: number;
  videoTextPhrase?: string;
  videoTextNames?: string;
  showVideoTextOverlay?: boolean;
}

export interface RsvpResponse {
  id: string;
  fullName: string;
  phone: string;
  attending: 'yes' | 'no';
  guestsCount: number;
  notes: string;
  submittedAt: string; // ISO string
}

export interface Guest {
  id: string;
  name: string;
  maxGuests: number;
  code: string; // personalized slug / unique code
  confirmed: boolean;
  attending?: 'yes' | 'no' | null;
  guestsCount?: number;
  notes?: string;
  submittedAt?: string;
}

