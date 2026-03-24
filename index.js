const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Auto-migration for missing columns
const runMigration = async () => {
  try {
    console.log("Checking for missing columns...");
    await pool.query(`
      ALTER TABLE suites 
      ADD COLUMN IF NOT EXISTS address TEXT,
      ADD COLUMN IF NOT EXISTS location_info TEXT,
      ADD COLUMN IF NOT EXISTS map_embed TEXT,
      ADD COLUMN IF NOT EXISTS price_weekday_one DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_weekday_multiple DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_shabbos DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_motzei_shabbos DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_weekly DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS price_monthly DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS check_in_info TEXT,
      ADD COLUMN IF NOT EXISTS check_out_info TEXT,
      ADD COLUMN IF NOT EXISTS house_rules TEXT,
      ADD COLUMN IF NOT EXISTS cancellation_policy TEXT;

      CREATE TABLE IF NOT EXISTS contacts (
          id SERIAL PRIMARY KEY,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          email TEXT NOT NULL,
          mobile TEXT NOT NULL,
          message TEXT NOT NULL,
          status TEXT DEFAULT 'pending',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS global_settings (
          key TEXT PRIMARY KEY,
          value TEXT
      );
    `);
    
    // Seed default settings if they don't exist
    const defaults = [
      ['check_in_time', '5:00 PM'],
      ['check_out_time', '11:00 AM'],
      ['house_rules', 'No smoking, no pets, quiet hours after 10 PM.'],
      ['refund_policy', 'Full refund 72h before, 50% within 48-72h, no refund after.']
    ];
    for (const [key, val] of defaults) {
      await pool.query('INSERT INTO global_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [key, val]);
    }

    console.log("Database schema is up to date.");
    
    // Ensure initial suites exist
    const { rowCount } = await pool.query('SELECT * FROM suites');
    if (rowCount === 0) {
      console.log("Seeding initial suites...");
      await pool.query(`
        INSERT INTO suites (id, title, description, base_price, amenities, images) VALUES
        ('bellinger-st-suites', 'Bellinger Street Suites', 'A hotel suite experience in a home setting.', 325.00, '["Kitchenette", "Wi-Fi", "Free Parking"]', '["assets/images/SEV05322.jpg"]'),
        ('laurel-ave-suite', 'Laurel Avenue Suite', 'A luxuriously maintained suite for families.', 350.00, '["Full Kitchen", "Wi-Fi", "Garden View"]', '["assets/images/SEV05327.jpg"]'),
        ('miller-rd-suite', 'Miller Road Suite', 'A premier hospitality suite for individuals.', 400.00, '["Luxury Bath", "Office Space", "Wi-Fi"]', '["assets/images/SEV05330.jpg"]');
      `);
      console.log("Initial suites seeded.");
    }
  } catch (err) {
    console.error("Migration check failed:", err.message);
  }
};
runMigration();

// Multer Storage Configuration
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/');
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ storage: storage });

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// --- HEALTH CHECK API ---
app.get(['/health', '/api/health'], (req, res) => {
  res.status(200).json({ status: 'ok', message: 'Malon API Server is powerfully running and ready to handle bookings!' });
});

// --- SUITES API ---
app.get('/api/suites', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM suites ORDER BY title ASC');
    res.json(rows);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

const parseNumeric = (val) => {
  if (val === null || val === undefined) return null;
  const str = String(val).trim();
  return str === '' ? null : Number(str);
};

app.post('/api/suites', async (req, res) => {
  const { 
    id, title, description, base_price, amenities, images, address, location_info, map_embed,
    price_weekday_one, price_weekday_multiple, price_shabbos, price_motzei_shabbos, price_weekly, price_monthly,
    check_in_info, check_out_info, house_rules, cancellation_policy
  } = req.body;
  try {
    const { rows } = await pool.query(
      `INSERT INTO suites (
        id, title, description, base_price, amenities, images, address, location_info, map_embed,
        price_weekday_one, price_weekday_multiple, price_shabbos, price_motzei_shabbos, price_weekly, price_monthly,
        check_in_info, check_out_info, house_rules, cancellation_policy
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
      [
        id, title, description, base_price, JSON.stringify(amenities), JSON.stringify(images), address, location_info, map_embed,
        parseNumeric(price_weekday_one), parseNumeric(price_weekday_multiple), parseNumeric(price_shabbos), parseNumeric(price_motzei_shabbos), parseNumeric(price_weekly), parseNumeric(price_monthly),
        check_in_info, check_out_info, house_rules, cancellation_policy
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suites/:id', async (req, res) => {
  const { 
    title, description, base_price, amenities, images, address, location_info, map_embed,
    price_weekday_one, price_weekday_multiple, price_shabbos, price_motzei_shabbos, price_weekly, price_monthly,
    check_in_info, check_out_info, house_rules, cancellation_policy
  } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE suites SET 
        title = $1, description = $2, base_price = $3, amenities = $4, images = $5, address = $6, location_info = $7, map_embed = $8,
        price_weekday_one = $9, price_weekday_multiple = $10, price_shabbos = $11, price_motzei_shabbos = $12, price_weekly = $13, price_monthly = $14,
        check_in_info = $15, check_out_info = $16, house_rules = $17, cancellation_policy = $18
      WHERE id = $19 RETURNING *`,
      [
        title, description, base_price, JSON.stringify(amenities), JSON.stringify(images), address, location_info, map_embed,
        parseNumeric(price_weekday_one), parseNumeric(price_weekday_multiple), parseNumeric(price_shabbos), parseNumeric(price_motzei_shabbos), parseNumeric(price_weekly), parseNumeric(price_monthly),
        check_in_info, check_out_info, house_rules, cancellation_policy, req.params.id
      ]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Suite not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/suites/:id', async (req, res) => {
  try {
    // Delete related blocked dates first (due to foreign key)
    await db.query('DELETE FROM blocked_dates WHERE suite_id = $1', [req.params.id]);
    // Delete related bookings
    await db.query('DELETE FROM bookings WHERE suite_id = $1', [req.params.id]);

    const { rowCount } = await db.query('DELETE FROM suites WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Suite not found' });
    res.json({ message: 'Suite deleted successfully' });
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- DISCOUNTS API ---
app.get('/api/discounts', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discounts');
    res.json(rows);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/discounts', async (req, res) => {
  const { type, threshold, percentage } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO discounts (type, threshold, percentage) VALUES ($1, $2, $3) RETURNING *',
      [type, threshold, percentage]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/discounts/:id', async (req, res) => {
  const { type, threshold, percentage } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE discounts SET type = $1, threshold = $2, percentage = $3 WHERE id = $4 RETURNING *',
      [type, threshold, percentage, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Discount not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/discounts/:id', async (req, res) => {
  try {
    const { rowCount } = await db.query('DELETE FROM discounts WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Discount not found' });
    res.json({ message: 'Discount deleted successfully' });
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- BOOKINGS API ---
app.get('/api/bookings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM bookings ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/bookings', async (req, res) => {
  const { first_name, last_name, email, mobile, suite_id, check_in, check_out, breakfast_dates, total_cost } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO bookings (first_name, last_name, email, mobile, suite_id, check_in, check_out, breakfast_dates, total_cost) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *',
      [first_name, last_name, email, mobile, suite_id, check_in, check_out, JSON.stringify(breakfast_dates), total_cost]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- BLOCKED DATES API ---
app.get('/api/blocked-dates/:suiteId', async (req, res) => {
  try {
    const { rows } = await db.query("SELECT TO_CHAR(blocked_date, 'YYYY-MM-DD') as blocked_date FROM blocked_dates WHERE suite_id = $1", [req.params.suiteId]);
    res.json(rows.map(r => r.blocked_date));
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/blocked-dates', async (req, res) => {
  const { suite_id, blocked_date, reason } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO blocked_dates (suite_id, blocked_date, reason) VALUES ($1, $2, $3) ON CONFLICT (suite_id, blocked_date) DO NOTHING RETURNING *',
      [suite_id, blocked_date, reason]
    );
    res.status(201).json(rows[0] || { message: 'Date already blocked' });
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/blocked-dates', async (req, res) => {
  const { suite_id, blocked_date } = req.body;
  try {
    const { rowCount } = await db.query('DELETE FROM blocked_dates WHERE suite_id = $1 AND blocked_date = $2', [suite_id, blocked_date]);
    res.json({ message: 'Date unblocked' });
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- CONTACTS API ---
app.get('/api/contacts', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM contacts ORDER BY created_at DESC');
    res.json(rows);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/contacts', async (req, res) => {
  const { first_name, last_name, email, mobile, message } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO contacts (first_name, last_name, email, mobile, message) VALUES ($1, $2, $3, $4, $5) RETURNING *',
      [first_name, last_name, email, mobile, message]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/contacts/:id', async (req, res) => {
  const { status } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE contacts SET status = $1 WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'Inquiry not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- SETTINGS API ---
app.get('/api/settings', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM global_settings');
    const settings = rows.reduce((acc, r) => ({ ...acc, [r.key]: r.value }), {});
    res.json(settings);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/settings', async (req, res) => {
  const settings = req.body;
  try {
    const queries = Object.entries(settings).map(([key, value]) => 
      db.query('INSERT INTO global_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING UPDATE SET value = EXCLUDED.value', [key, value])
    );
    // Wait, ON CONFLICT DO UPDATE needs right syntax
    const upsertQueries = Object.entries(settings).map(([key, value]) => 
      db.query('INSERT INTO global_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2', [key, value])
    );
    await Promise.all(upsertQueries);
    res.json({ message: 'Settings updated successfully' });
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

// --- UPLOAD API ---
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No image uploaded' });
  const imageUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;
  res.json({ url: imageUrl });
});

app.listen(PORT, () => {
  console.log(`Malon API Server running on port ${PORT}`);
});
