require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  port: process.env.DB_PORT,
});

const upsertSettings = async (client) => {
  const settings = [
    ['check_in_time', '5:00 PM'],
    ['check_out_time', '11:00 AM'],
    ['breakfast_basic_price', '60'],
    ['breakfast_deluxe_price', '100'],
    ['shabbos_catering_price', '250'],
    ['early_checkin_1h_price', '50'],
    ['early_checkin_2h_price', '75'],
    ['late_checkout_1h_price', '50'],
    ['late_checkout_2h_price', '75'],
    ['shevaluxe_basic_addon_price', '750'],
    ['shevaluxe_signature_addon_price', '925'],
    ['shevaluxe_premium_addon_price', '1075'],
  ];

  for (const [key, value] of settings) {
    await client.query(
      `INSERT INTO global_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
};

const applySuitePricing = async (client) => {
  await client.query(`
    UPDATE suites
    SET
      price_weekday_one = 375,
      price_weekday_multiple = 325,
      price_shabbos = 425,
      price_motzei_shabbos = 275,
      price_weekly = 2095,
      price_monthly = 7440,
      price_peak_weekday_one = 415,
      price_peak_weekday_multiple = 360,
      price_peak_shabbos = 470,
      price_peak_motzei_shabbos = 305,
      price_peak_weekly = 2300,
      price_peak_monthly = 8200,
      shevaluxe_basic_total = 2845,
      shevaluxe_signature_total = 3020,
      shevaluxe_premium_total = 3170
    WHERE LOWER(id) LIKE '%miller%' OR LOWER(title) LIKE '%miller%';

    UPDATE suites
    SET
      price_weekday_one = 295,
      price_weekday_multiple = 275,
      price_shabbos = 375,
      price_motzei_shabbos = 175,
      price_weekly = 1735,
      price_monthly = 6160,
      price_peak_weekday_one = 325,
      price_peak_weekday_multiple = 305,
      price_peak_shabbos = 415,
      price_peak_motzei_shabbos = 195,
      price_peak_weekly = 1925,
      price_peak_monthly = 6800,
      shevaluxe_basic_total = 2485,
      shevaluxe_signature_total = 2660,
      shevaluxe_premium_total = 2810
    WHERE LOWER(id) LIKE '%laurel%' OR LOWER(title) LIKE '%laurel%';

    UPDATE suites
    SET
      price_weekday_one = 325,
      price_weekday_multiple = 300,
      price_shabbos = 400,
      price_motzei_shabbos = 250,
      price_weekly = 1935,
      price_monthly = 6880,
      price_peak_weekday_one = 360,
      price_peak_weekday_multiple = 330,
      price_peak_shabbos = 440,
      price_peak_motzei_shabbos = 275,
      price_peak_weekly = 2150,
      price_peak_monthly = 7600
    WHERE LOWER(id) LIKE '%bellinger-a%' OR LOWER(title) LIKE '%suite a%';

    UPDATE suites
    SET
      price_weekday_one = 350,
      price_weekday_multiple = 300,
      price_shabbos = 400,
      price_motzei_shabbos = 250,
      price_weekly = 1935,
      price_monthly = 6880,
      price_peak_weekday_one = 385,
      price_peak_weekday_multiple = 330,
      price_peak_shabbos = 440,
      price_peak_motzei_shabbos = 275,
      price_peak_weekly = 2150,
      price_peak_monthly = 7600,
      shevaluxe_basic_total = 2685,
      shevaluxe_signature_total = 2860,
      shevaluxe_premium_total = 3000
    WHERE LOWER(id) LIKE '%bellinger-b%'
       OR LOWER(id) LIKE '%bellinger-st%'
       OR LOWER(title) LIKE '%suite b%'
       OR LOWER(title) LIKE '%bellinger%';
  `);
};

const run = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertSettings(client);
    await applySuitePricing(client);
    await client.query('COMMIT');
    console.log('Pricing and settings data seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

run();
