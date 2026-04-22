require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  port: process.env.DB_PORT,
});

const SETTINGS = {
  check_in_time: '5:00 PM',
  check_out_time: '11:00 AM',
  early_checkin_1h_price: '50',
  early_checkin_2h_price: '75',
  late_checkout_1h_price: '50',
  late_checkout_2h_price: '75',

  breakfast_basic_price: '60',
  breakfast_deluxe_price: '100',
  shabbos_catering_price: '250',

  shevaluxe_basic_addon_price: '750',
  shevaluxe_signature_addon_price: '925',
  shevaluxe_premium_addon_price: '1075',

  shevaluxe_notes:
    'The ShevaLuxe Package includes a full week stay plus an upgraded hospitality package featuring floral arrangements, meat boards, and salads prepared in the suite. A full week booking is required. Guests may use only part of the week for Sheva Brachos and retain remaining nights as a credit for a future stay.',

  general_information:
    'Malon Luxury Suites currently offers three locations, each featuring a private suite designed for couples.\nThe Bellinger location includes two suites, which may be booked together with a connecting door.\nEach suite includes two full-size (54-inch) beds.\nA pack and play is available upon request.',

  bellinger_booking_guidelines:
    "When booking both suites, please ask for the children's ages.\nIf children are between ages 2-5, advise that confirmation will be provided after review.\nMaximum capacity: up to three children (one per bed plus one in a pack and play). Larger groups require approval.",

  suite_amenities:
    'Complimentary drinks and snacks\nCoffee machine/Keurig with supplies\nDisposable cutlery, plates, cups, and bowls',

  shabbos_amenities:
    'Urn and hot plate\nCandles\nDisposable becher\nHavdalah set\nTablecloth',

  breakfast_details:
    'Breakfast (via Green Bowl), delivered fresh between 8:00-9:00 AM and left at the door.\nBasic ($60): 2 bagels, spreads (cream cheese & tuna), 2 muffins, 2 iced coffees.\nDeluxe ($100): Includes all basic items plus scrambled eggs and pancakes.',

  shabbos_catering_details:
    'Provided by Satmar Meats. Includes all three meals, challah, and grape juice. Delivered to the suite. Cost: $250.',

  suite_features_miller:
    'Upscale design with spa-style shower (bench, rain head, jets, handheld spray), private fenced yard with outdoor furniture, and premium coffee brewer.',
  suite_features_laurel:
    'Centrally located near the yeshiva area and Ridge, within walking distance to multiple chassidishe shuls (Clover Street area). Newly built with upscale finishes.',
  suite_features_bellinger_a:
    'Large windows and abundant natural light. Small kitchenette (mini fridge, no oven), standard bathtub.',
  suite_features_bellinger_b:
    'Large windows and abundant natural light. Full kitchenette (oven, large fridge), couch, walk-in shower with bench.',

  faq_1:
    'Is this a hotel? No. Malon Luxury Suites offers hotel-style suites in a home setting. Guests enjoy hotel-level amenities and design, combined with privacy and a location within the local community.',
  faq_2:
    'Is the suite in a shared home? Yes, each suite is attached to a home. However, suites have a private side entrance, dedicated parking spot, and soundproofing with minimal interaction with residents.',
  faq_3:
    'Is Wi-Fi available? Wi-Fi is available only at the Bellinger location. If internet access is needed elsewhere, guests may rent a hotspot (e.g., via Cellular Israel).',
};

const SUITE_PRICING = [
  {
    name: 'Miller',
    matcher: "(LOWER(id) LIKE '%miller%' OR LOWER(title) LIKE '%miller%')",
    pricing: {
      price_weekday_one: 375,
      price_weekday_multiple: 325,
      price_shabbos: 425,
      price_motzei_shabbos: 275,
      price_weekly: 2095,
      price_monthly: 7440,
      price_peak_weekday_one: 415,
      price_peak_weekday_multiple: 360,
      price_peak_shabbos: 470,
      price_peak_motzei_shabbos: 305,
      price_peak_weekly: 2300,
      price_peak_monthly: 8200,
      shevaluxe_basic_total: 2845,
      shevaluxe_signature_total: 3020,
      shevaluxe_premium_total: 3170,
    },
    description:
      'Upscale design with spa-style shower (bench, rain head, jets, handheld spray), private fenced yard with outdoor furniture, and premium coffee brewer.',
  },
  {
    name: 'Laurel',
    matcher: "(LOWER(id) LIKE '%laurel%' OR LOWER(title) LIKE '%laurel%')",
    pricing: {
      price_weekday_one: 295,
      price_weekday_multiple: 275,
      price_shabbos: 375,
      price_motzei_shabbos: 175,
      price_weekly: 1735,
      price_monthly: 6160,
      price_peak_weekday_one: 325,
      price_peak_weekday_multiple: 305,
      price_peak_shabbos: 415,
      price_peak_motzei_shabbos: 195,
      price_peak_weekly: 1925,
      price_peak_monthly: 6800,
      shevaluxe_basic_total: 2485,
      shevaluxe_signature_total: 2660,
      shevaluxe_premium_total: 2810,
    },
    description:
      'Centrally located near the yeshiva area and Ridge, within walking distance to multiple chassidishe shuls (Clover Street area). Newly built with upscale finishes.',
  },
  {
    name: 'Bellinger A',
    matcher: "(LOWER(id) LIKE '%bellinger-a%' OR LOWER(title) LIKE '%suite a%')",
    pricing: {
      price_weekday_one: 325,
      price_weekday_multiple: 300,
      price_shabbos: 400,
      price_motzei_shabbos: 250,
      price_weekly: 1935,
      price_monthly: 6880,
      price_peak_weekday_one: 360,
      price_peak_weekday_multiple: 330,
      price_peak_shabbos: 440,
      price_peak_motzei_shabbos: 275,
      price_peak_weekly: 2150,
      price_peak_monthly: 7600,
    },
    description:
      'Both suites feature large windows and abundant natural light. Suite A has a small kitchenette (mini fridge, no oven) and a standard bathtub.',
  },
  {
    name: 'Bellinger B',
    matcher:
      "(LOWER(id) LIKE '%bellinger-b%' OR LOWER(title) LIKE '%suite b%' OR LOWER(title) LIKE '%bellinger suite b%')",
    pricing: {
      price_weekday_one: 350,
      price_weekday_multiple: 300,
      price_shabbos: 400,
      price_motzei_shabbos: 250,
      price_weekly: 1935,
      price_monthly: 6880,
      price_peak_weekday_one: 385,
      price_peak_weekday_multiple: 330,
      price_peak_shabbos: 440,
      price_peak_motzei_shabbos: 275,
      price_peak_weekly: 2150,
      price_peak_monthly: 7600,
      shevaluxe_basic_total: 2685,
      shevaluxe_signature_total: 2860,
      shevaluxe_premium_total: 3000,
    },
    description:
      'Both suites feature large windows and abundant natural light. Suite B has a full kitchenette (oven, large fridge), couch, and walk-in shower with bench.',
  },
];

async function upsertSettings(client) {
  for (const [key, value] of Object.entries(SETTINGS)) {
    await client.query(
      `INSERT INTO global_settings (key, value)
       VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, value]
    );
  }
}

function buildSuiteUpdateQuery(pricing) {
  const keys = Object.keys(pricing);
  const setSql = keys.map((k, i) => `${k} = $${i + 1}`).join(',\n      ');
  const values = keys.map((k) => pricing[k]);
  return { setSql, values };
}

async function updateSuites(client) {
  for (const suite of SUITE_PRICING) {
    const { setSql, values } = buildSuiteUpdateQuery(suite.pricing);

    const updateSql = `
      UPDATE suites
      SET
        ${setSql},
        description = COALESCE(NULLIF(description, ''), $${values.length + 1})
      WHERE ${suite.matcher}
    `;

    const res = await client.query(updateSql, [...values, suite.description]);
    console.log(`Updated ${suite.name}: ${res.rowCount} row(s)`);
  }
}

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertSettings(client);
    await updateSuites(client);
    await client.query('COMMIT');
    console.log('Information guide data seeded successfully.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
