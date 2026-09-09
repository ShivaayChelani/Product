import { Client } from 'pg';
import * as dotenv from 'dotenv';
dotenv.config();

async function testConnection() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('Successfully connected to Postgres!');
    const res = await client.query('SELECT NOW()');
    console.log(res.rows[0]);
  } catch (err: any) {
    console.error('Connection error:', err.message);
  } finally {
    await client.end();
  }
}

testConnection();

import { reverseGeocodeToCity } from '../src/shared/utils/reverseGeocode';

async function main() {
  console.log('Testing reverse geocoding...');
  // Kolkata coordinates
  const city = await reverseGeocodeToCity(22.5726, 88.3639);
  console.log('Resolved city:', city);
}

main().catch(console.error);

