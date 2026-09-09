import { reverseGeocodeToCity } from '../src/shared/utils/reverseGeocode';

async function main() {
  console.log('Testing reverse geocoding...');
  // Kolkata coordinates
  const city = await reverseGeocodeToCity(22.5726, 88.3639);
  console.log('Resolved city:', city);
}

main().catch(console.error);
