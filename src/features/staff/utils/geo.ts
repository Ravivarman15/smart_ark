// Geo validation utility — currently client-side only.
//
// WARNING: this is informational, not authoritative. A malicious user can
// trivially spoof navigator.geolocation. The architecture is set up so
// the same `isNearCampus` function can be called from a Supabase Edge
// Function (validating a server-recorded GPS payload) without changing
// callers here. Don't trust this value for financial / disciplinary decisions
// until that backend swap lands.

import { APP_CONFIG } from "@/core/constants/config";

/** Haversine distance in metres between two lat/lng pairs. */
export const haversineMeters = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number => {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

export interface GeoCheckResult {
  valid: boolean;
  campus?: string;
  /** Distance to the closest campus, useful for diagnostics. */
  closestDistanceMeters?: number;
}

/** Returns { valid, campus } if the coords are within radius of any campus. */
export const isNearCampus = (lat: number, lng: number): GeoCheckResult => {
  let closestDistanceMeters = Number.POSITIVE_INFINITY;
  let closestName: string | undefined;

  for (const loc of APP_CONFIG.campuses) {
    const d = haversineMeters(lat, lng, loc.lat, loc.lng);
    if (d < closestDistanceMeters) {
      closestDistanceMeters = d;
      closestName = loc.name;
    }
    if (d <= APP_CONFIG.geoRadiusMeters) {
      return { valid: true, campus: loc.name, closestDistanceMeters: d };
    }
  }
  return { valid: false, campus: closestName, closestDistanceMeters };
};
