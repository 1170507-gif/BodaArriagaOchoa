import { WeddingConfig } from './types';

export const DEFAULT_WEDDING_CONFIG: WeddingConfig = {
  coupleName1: "Alejandro",
  coupleName2: "Alejandra",
  subtitle: "El honor de amarnos, la alegría de compartirlo!",
  dateText: "Friday, the Fifteenth of August\nTwo Thousand and Twenty-Five",
  dateIso: "2025-08-15T16:00:00",
  locationText: "Villa Cora\nTuscany, Italy",
  locationName: "Tuscany, Italy",
  overlayOpenText: "Click to open",
  musicUrl: "https://dl.dropboxusercontent.com/scl/fi/83qce827iqibxa7c4bybm/Ryan-Mack-Forever-and-Ever-and-Always-Lyrics.mp3?rlkey=5fno9awvj874qmn4s7f2k0by7&st=0ldyovx5",
  videoUrl: "https://pub-4dc8201144ca418fb604349c73e8c724.r2.dev/Italian_villa_terrace_202604231419%20(1).MP4",
  videoAspectRatio: "9:16",
  countdownScale: 1.0,
  countdownFormat: "full",
  locationButtonScale: 1.0,
  hotelLocationUrl: "https://www.google.com/maps/search/?api=1&query=Villa+Cora+Florence+Italy",
  lockCronograma: true,
  theme: {
    bg: "#fcf8f5",      // Elegant warm soft nude beige background
    text: "#6e5751",    // Delicate earthy clay warm brown for readable body text
    textDark: "#9e4733",// Rich signature terracotta/burnt orange for names and headings
    border: "#ebdcd5",  // Soft pale warm nude for borders and separators
    accent: "#b85c46",  // Bright, elegant terracotta accent
    fontTitle: "playfair",
    fontBody: "montserrat",
    cardBorderRadius: "40px",
    cardBorderWidth: "2px",
    paddingMultiplier: 1.0,
  },
  sections: {
    showOverlay: true,
    showCountdown: true,
    showDetails: true,
    showRsvp: true,
    showVideo: true,
  },
  details: [
    {
      id: "ceremony",
      title: "Ceremonia",
      description: "16:00 horas\nVilla Cora Gardens\nAtuendo formal",
      icon: "Clock",
    },
    {
      id: "reception",
      title: "Recepción",
      description: "18:30 horas\nTerraza Principal\nCena y baile",
      icon: "GlassWater",
    },
    {
      id: "dress-code",
      title: "Código de vestimenta",
      description: "Black tie optional\nTonos tierra y pasteles\nEvitar blanco",
      icon: "Shirt",
    },
    {
      id: "location",
      title: "Ubicación",
      description: "Villa Cora\nVia del Torchione, 16\n53100 Siena SI",
      icon: "MapPin",
    }
  ],
  images: {
    portrait: "https://static.tildacdn.net/tild3435-3731-4464-a537-636664626563/ChatGPT_Image_Aug_3_.png",
    overlayLeft: "https://static.tildacdn.net/tild6338-3733-4431-a363-306634383864/Polygon_4.png",
    overlayRight: "https://static.tildacdn.net/tild3636-6566-4132-b665-343766326335/Polygon_3.png",
    overlayTop: "https://static.tildacdn.net/tild3762-3738-4361-b134-333538333135/Polygon_1_3.png",
    overlayBottom: "https://static.tildacdn.net/tild6262-6339-4933-b833-343039643037/Polygon_2_1.png",
    overlayCenter: "https://static.tildacdn.net/tild3435-3731-4464-a537-636664626563/ChatGPT_Image_Aug_3_.png",
    countdownHeader: "",
    detailsHeader: "",
    rsvpHeader: "",
    floralDivider: "",
  },
  polaroids: [
    { id: "p1", url: "/images/invitacion_1.webp", caption: "Nuestro primer viaje" },
    { id: "p2", url: "/images/invitacion_2.webp", caption: "El día del Sí" },
    { id: "p3", url: "/images/invitacion_3.webp", caption: "Compartiendo risas" }
  ],
  blurredPhotoUrl: "",
  bottomLogoUrl: "",
  weddingWebsiteUrl: "www.nuestra-boda.com",
  videoTextOverlayY: 25,
  videoTextOverlayX: 50,
  videoTextOverlayScale: 1.0,
  videoTextPhrase: "“ ¡El honor de amarnos,\nla alegría de compartirlo! ”",
  videoTextNames: "Alejandro & Alejandra",
  showVideoTextOverlay: true,
};
