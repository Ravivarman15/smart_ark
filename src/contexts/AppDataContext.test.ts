import { describe, it, expect } from 'vitest';
import { haversineDistance, isNearCampus } from './AppDataContext';

describe('haversineDistance', () => {
  it('calculates the distance between two same points as 0', () => {
    expect(haversineDistance(13.0059109, 80.1961798, 13.0059109, 80.1961798)).toBe(0);
  });

  it('calculates the distance between two different points correctly', () => {
    // Distance between Junior Campus and Senior Campus
    // lat1: 13.0059109, lon1: 80.1961798
    // lat2: 13.0059625, lon2: 80.1994691
    const distance = haversineDistance(13.0059109, 80.1961798, 13.0059625, 80.1994691);
    
    // The distance should be roughly 356 meters
    expect(distance).toBeGreaterThan(350);
    expect(distance).toBeLessThan(365);
  });
});

describe('isNearCampus', () => {
  it('returns valid: true for coordinates exactly at the Junior Campus', () => {
    const result = isNearCampus(13.0059109, 80.1961798);
    expect(result.valid).toBe(true);
    expect(result.campus).toBe("ARK Junior Campus");
  });

  it('returns valid: true for coordinates very close to the Junior Campus', () => {
    // Slightly offset the longitude
    const result = isNearCampus(13.0059109, 80.1961798 + 0.0001); // Roughly 11 meters away
    expect(result.valid).toBe(true);
    expect(result.campus).toBe("ARK Junior Campus");
  });

  it('returns valid: false for coordinates far away', () => {
    // completely different coordinate
    const result = isNearCampus(14.0, 80.0);
    expect(result.valid).toBe(false);
    expect(result.campus).toBeUndefined();
  });
});
