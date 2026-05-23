const FEET_PER_METER = 3.28084;
const METERS_PER_MILE = 1609.344;
const FEET_THRESHOLD_METERS = 161;

export function formatDistanceImperial(meters: number): string {
  if (meters < FEET_THRESHOLD_METERS) {
    const feet = Math.round((meters * FEET_PER_METER) / 10) * 10;
    return `${feet} ft`;
  }
  const miles = meters / METERS_PER_MILE;
  return `${miles.toFixed(1)} mi`;
}
