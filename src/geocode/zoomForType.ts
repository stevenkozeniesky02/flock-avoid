import type { GeocodeResultType } from './geocodeTypes';

export function zoomForType(type: GeocodeResultType): number {
  switch (type) {
    case 'country': return 4;
    case 'state':   return 6;
    case 'city':    return 11;
    case 'street':  return 15;
    case 'address': return 16;
    case 'poi':     return 16;
    case 'other':   return 13;
  }
}
