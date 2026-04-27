/**
 * Destroys all existing suite rows and related blocked dates, clears suite_id on
 * bookings (so FK does not block deletes), re-inserts exactly 4 suites from the
 * Information Guide, and upserts global_settings (same content as seed_information_guide_data.js).
 *
 * WARNING: Orphans booking records from former suite IDs. Run on staging first.
 *
 * Usage: node seed_suites_rebuild.js
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  port: process.env.DB_PORT,
});

const AMENITIES_ALL = [
  'Complimentary drinks and snacks',
  'Coffee machine/Keurig with supplies',
  'Disposable cutlery, plates, cups, and bowls',
  'Urn and hot plate',
  'Candles',
  'Disposable becher',
  'Havdalah set',
  'Tablecloth',
];

const AMENITIES_BELLINGER_EXTRA = 'Wi-Fi (Bellinger location only)';

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
    'Both suites feature large windows and abundant natural light. Suite A: Small kitchenette (mini fridge, no oven), standard bathtub.',
  suite_features_bellinger_b:
    'Both suites feature large windows and abundant natural light. Suite B: Full kitchenette (oven, large fridge), couch, walk-in shower with bench.',
  faq_1:
    'Is this a hotel? No. Malon Luxury Suites offers hotel-style suites in a home setting. Guests enjoy hotel-level amenities and design, combined with privacy and a location within the local community.',
  faq_2:
    'Is the suite in a shared home? Yes, each suite is attached to a home. However, suites have a private side entrance, dedicated parking spot, and soundproofing with minimal interaction with residents.',
  faq_3:
    'Is Wi-Fi available? Wi-Fi is available only at the Bellinger location. If internet access is needed elsewhere, guests may rent a hotspot (e.g., via Cellular Israel).',
  checkin_special_timing:
    'Earliest check-in: 3:00 PM. Late check-out: latest 1:00 PM (subject to availability). For Chosson & Kallah on the night of the wedding: 12:00 PM check-out (no extra charge for that case).',
};

const SUITES = [
  {
    id: 'miller-rd-suite',
    title: 'Miller Road Suite',
    base_price: 375,
    description:
      'Upscale design with spa-style shower (bench, rain head, jets, handheld spray), private fenced yard with outdoor furniture, and premium coffee brewer.',
    images: JSON.stringify(['https://malonluxurysuites.com/wp-content/uploads/2023/10/Miller-1-1.jpg']),
    amenities: JSON.stringify(AMENITIES_ALL),
    address: '129 Miller Road, Lakewood, NJ 08701',
    location_info: JSON.stringify({
      nearbyShuls: '• Beis Efraim Tzvi (Rav Shemano): Nusach Sefard, heimish, includes men’s mikvah. (1-minute walk, 141 Miller Rd)\n• Beis Elazar (Rav Kahanow): Nusach Ashkenaz. (4-minute walk, 185 Miller Rd)',
      nearbyShopping: 'Etz Chaim Judaica',
      nearbyAttractions: 'South Lake Park',
      nearbyGroceries: 'Kosher West, Minzers'
    }),
    check_in_info:
      'Standard check-in: 5:00 PM. Early check-in: 1 hour for $50, 2 hours for $75 (earliest 3:00 PM).',
    check_out_info:
      'Standard check-out: 11:00 AM. Late check-out: up to 1:00 PM (subject to availability) per add-on pricing.',
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
  {
    id: 'laurel-ave-suite',
    title: 'Laurel Avenue Suite',
    base_price: 295,
    description:
      'Centrally located near the yeshiva area and Ridge, within walking distance to multiple chassidishe shuls (Clover Street area). Newly built with upscale finishes.',
    images: JSON.stringify(['https://malonluxurysuites.com/wp-content/uploads/2023/10/Laurel-1-1.jpg']),
    amenities: JSON.stringify(AMENITIES_ALL),
    address: '269 Laurel Ave, Lakewood, NJ 08701',
    location_info: JSON.stringify({
      nearbyShuls: '• Tefila L’Moshe (Rabbi Flamm): 308 Ocean Ave\n• Bais Medrash Tiferes Pinchos (Rabbi Spiegel): Includes mikvah. (187 E4th St)\n• Bais Hamedrash D’Chasidei Sadi Gur: Includes mikvah. (53 Holly St)\n• Emunas Yisroel: Includes mikvah. (23 Clover St)\n• Or Elimelech (Gutfreund): Approximately 7-minute walk.',
      nearbyShopping: 'Gourmet Glatt area, Breadberry',
      nearbyAttractions: 'Pine Park',
      nearbyGroceries: 'Gourmet Glatt, Breadberry, Evergreen'
    }),
    check_in_info:
      'Standard check-in: 5:00 PM. Early check-in: 1 hour for $50, 2 hours for $75 (earliest 3:00 PM).',
    check_out_info:
      'Standard check-out: 11:00 AM. Late check-out: up to 1:00 PM (subject to availability) per add-on pricing.',
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
  {
    id: 'bellinger-suite-a',
    title: 'Bellinger Suite A',
    base_price: 325,
    description:
      'Bellinger location — large windows and abundant natural light. Suite A: Small kitchenette (mini fridge, no oven), standard bathtub.',
    images: JSON.stringify(['https://malonluxurysuites.com/wp-content/uploads/2023/10/Bellinger-1-1.jpg']),
    amenities: JSON.stringify([...AMENITIES_ALL, AMENITIES_BELLINGER_EXTRA]),
    address: '100 Bellinger St, Lakewood, NJ 08701',
    location_info: JSON.stringify({
      nearbyShuls: '• Albert Shul: 10-minute walk.\n• N’eemas Hachaim Hall: Located on Bellinger St.\n• Darchei Avoseinu (Rav Avrohom Yehoshua Heschel): 1373 Pine St.',
      nearbyShopping: 'Pine Street Area Shopping, A.I. Stone',
      nearbyAttractions: 'Ocean County Park',
      nearbyGroceries: 'Pine Street Area Groceries (e.g., NPGS nearby)'
    }),
    check_in_info:
      'Standard check-in: 5:00 PM. Early check-in: 1 hour for $50, 2 hours for $75 (earliest 3:00 PM).',
    check_out_info:
      'Standard check-out: 11:00 AM. Late check-out: up to 1:00 PM (subject to availability) per add-on pricing.',
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
    price_weekly: 2150,
    price_monthly: 7600,
    price_peak_weekly: 2150,
    price_peak_monthly: 7600,
    shevaluxe_basic_total: null,
    shevaluxe_signature_total: null,
    shevaluxe_premium_total: null,
  },
  {
    id: 'bellinger-suite-b',
    title: 'Bellinger Suite B',
    base_price: 350,
    description:
      'Bellinger location — large windows and abundant natural light. Suite B: Full kitchenette (oven, large fridge), couch, walk-in shower with bench. ShevaLuxe packages available for this suite.',
    images: JSON.stringify(['https://malonluxurysuites.com/wp-content/uploads/2023/10/Bellinger-1-1.jpg']),
    amenities: JSON.stringify([...AMENITIES_ALL, AMENITIES_BELLINGER_EXTRA]),
    address: '100 Bellinger St, Lakewood, NJ 08701',
    location_info: JSON.stringify({
      nearbyShuls: '• Albert Shul: 10-minute walk.\n• N’eemas Hachaim Hall: Located on Bellinger St.\n• Darchei Avoseinu (Rav Avrohom Yehoshua Heschel): 1373 Pine St.',
      nearbyShopping: 'Pine Street Area Shopping, A.I. Stone',
      nearbyAttractions: 'Ocean County Park',
      nearbyGroceries: 'Pine Street Area Groceries (e.g., NPGS nearby)'
    }),
    check_in_info:
      'Standard check-in: 5:00 PM. Early check-in: 1 hour for $50, 2 hours for $75 (earliest 3:00 PM).',
    check_out_info:
      'Standard check-out: 11:00 AM. Late check-out: up to 1:00 PM (subject to availability) per add-on pricing.',
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
    price_weekly: 2150,
    price_monthly: 7600,
    price_peak_weekly: 2150,
    price_peak_monthly: 7600,
    shevaluxe_basic_total: 2685,
    shevaluxe_signature_total: 2860,
    shevaluxe_premium_total: 3000,
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

async function run() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await upsertSettings(client);

    const detached = await client.query(
      'UPDATE bookings SET suite_id = NULL WHERE suite_id IS NOT NULL'
    );
    console.log(`Detached suite_id on ${detached.rowCount} booking(s).`);

    const blocked = await client.query('DELETE FROM blocked_dates');
    console.log(`Deleted ${blocked.rowCount} blocked date row(s).`);

    const deletedSuites = await client.query('DELETE FROM suites');
    console.log(`Deleted ${deletedSuites.rowCount} suite(s).`);

    const insertSql = `
      INSERT INTO suites (
        id, title, description, base_price, amenities, images,
        address, location_info, map_embed,
        price_weekday_one, price_weekday_multiple, price_shabbos, price_motzei_shabbos, price_weekly, price_monthly,
        price_peak_weekday_one, price_peak_weekday_multiple, price_peak_shabbos, price_peak_motzei_shabbos, price_peak_weekly, price_peak_monthly,
        shevaluxe_basic_total, shevaluxe_signature_total, shevaluxe_premium_total,
        check_in_info, check_out_info, house_rules, cancellation_policy
      ) VALUES (
        $1, $2, $3, $4, $5::jsonb, $6::jsonb,
        $7, $8, $9,
        $10, $11, $12, $13, $14, $15,
        $16, $17, $18, $19, $20, $21,
        $22, $23, $24,
        $25, $26, $27, $28
      )
    `;

    for (const s of SUITES) {
      await client.query(insertSql, [
        s.id,
        s.title,
        s.description,
        s.base_price,
        s.amenities,
        s.images,
        s.address,
        s.location_info,
        null,
        s.price_weekday_one,
        s.price_weekday_multiple,
        s.price_shabbos,
        s.price_motzei_shabbos,
        s.price_weekly,
        s.price_monthly,
        s.price_peak_weekday_one,
        s.price_peak_weekday_multiple,
        s.price_peak_shabbos,
        s.price_peak_motzei_shabbos,
        s.price_peak_weekly,
        s.price_peak_monthly,
        s.shevaluxe_basic_total,
        s.shevaluxe_signature_total,
        s.shevaluxe_premium_total,
        s.check_in_info,
        s.check_out_info,
        SETTINGS.bellinger_booking_guidelines,
        null,
      ]);
      console.log(`Inserted suite: ${s.id}`);
    }

    await client.query('COMMIT');
    console.log('Done: 4 suites + global settings applied.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('seed_suites_rebuild failed:', err.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

run();
