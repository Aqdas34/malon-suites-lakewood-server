require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  port: process.env.DB_PORT,
});

const updateSuiteDetails = async () => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Add missing columns first
    await client.query(`
      ALTER TABLE suites 
      ADD COLUMN IF NOT EXISTS features JSONB DEFAULT '[]',
      ADD COLUMN IF NOT EXISTS price_peak_weekday_one DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_peak_weekday_multiple DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_peak_shabbos DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_peak_motzei_shabbos DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_peak_weekly DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_peak_monthly DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS shevaluxe_basic_total DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS shevaluxe_signature_total DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS shevaluxe_premium_total DECIMAL(10, 2)
    `);

    // All Suites General Amenities
    const commonAmenities = JSON.stringify([
      "Complimentary drinks and snacks",
      "Coffee machine/Keurig with supplies",
      "Disposable cutlery, plates, cups, and bowls",
      "Two full-size (54-inch) beds",
      "Pack and play (available upon request)",
      "Shabbos Urn and hot plate",
      "Shabbos Candles & Disposable becher",
      "Havdalah set & Tablecloth"
    ]);

    // Update Miller
    await client.query(`
      UPDATE suites SET
        description = 'Upscale design with a spa-style shower featuring a bench, rain head, jets, and handheld spray. Includes a private fenced yard with outdoor furniture and a premium coffee brewer.',
        amenities = $1,
        features = '["Spa-style shower", "Private fenced yard", "Outdoor furniture", "Premium coffee brewer", "100% Private entrance", "Soundproofed"]'
      WHERE LOWER(id) LIKE '%miller%' OR LOWER(title) LIKE '%miller%'
    `, [commonAmenities]);

    // Update Laurel
    await client.query(`
      UPDATE suites SET
        description = 'Centrally located near the yeshiva area and Ridge, within walking distance to multiple chassidishe shuls. Newly built with upscale finishes and modern design.',
        amenities = $1,
        features = '["Centrally located", "Near Yeshiva area", "Newly built", "Upscale finishes", "Private entrance", "Walking distance to shuls"]'
      WHERE LOWER(id) LIKE '%laurel%' OR LOWER(title) LIKE '%laurel%'
    `, [commonAmenities]);

    // Update Bellinger A
    await client.query(`
      UPDATE suites SET
        description = 'Features large windows and abundant natural light. Includes a small kitchenette with a mini fridge and a standard bathtub.',
        amenities = $1,
        features = '["Large windows", "Abundant natural light", "Small kitchenette", "Standard bathtub", "Private entrance", "Wi-Fi available"]'
      WHERE LOWER(id) LIKE '%bellinger-a%' OR LOWER(title) LIKE '%suite a%'
    `, [commonAmenities]);

    // Update Bellinger B
    await client.query(`
      UPDATE suites SET
        description = 'Features large windows and abundant natural light. Includes a full kitchenette with an oven and large fridge, a comfortable couch, and a walk-in shower with a bench.',
        amenities = $1,
        features = '["Large windows", "Full kitchenette", "Oven & Large fridge", "Couch", "Walk-in shower with bench", "Wi-Fi available"]'
      WHERE LOWER(id) LIKE '%bellinger-b%' OR LOWER(title) LIKE '%suite b%'
    `, [commonAmenities]);

    await client.query('COMMIT');
    console.log('Suite details updated successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Update failed:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
};

updateSuiteDetails();
