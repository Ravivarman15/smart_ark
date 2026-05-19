// Centralised runtime configuration. Hardcoded constants previously
// scattered across AppDataContext / components live here so a future
// move to DB-backed config touches exactly one file.

export const APP_CONFIG = {
  campuses: [
    { name: "ARK Junior Campus", lat: 13.0059109, lng: 80.1961798 },
    { name: "ARK Senior Campus", lat: 13.0059625, lng: 80.1994691 },
  ],
  geoRadiusMeters: 200,
  checkInLateAfter: { hour: 8, minute: 59 },
  management: {
    reportRecipientPhone: "+917639399217",
  },
} as const;

export type CampusLocation = (typeof APP_CONFIG.campuses)[number];
