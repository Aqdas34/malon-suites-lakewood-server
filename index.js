const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

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

app.post('/api/suites', async (req, res) => {
  const { id, title, description, base_price, amenities, images } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO suites (id, title, description, base_price, amenities, images) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [id, title, description, base_price, JSON.stringify(amenities), JSON.stringify(images)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/suites/:id', async (req, res) => {
  const { title, description, base_price, amenities, images } = req.body;
  try {
    const { rows } = await db.query(
      'UPDATE suites SET title = $1, description = $2, base_price = $3, amenities = $4, images = $5 WHERE id = $6 RETURNING *',
      [title, description, base_price, JSON.stringify(amenities), JSON.stringify(images), req.params.id]
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
    // Delete related bookings (optional: maybe mark as cancelled instead? For now, simple delete)
    await db.query('DELETE FROM bookings WHERE suite_id = $1', [req.params.id]);

    const { rowCount } = await db.query('DELETE FROM suites WHERE id = $1', [req.params.id]);
    if (rowCount === 0) return res.status(404).json({ error: 'Suite not found' });
    res.json({ message: 'Suite deleted successfully' });
  } catch (err) {
    console.error(`API ERROR [${req.method} ${req.path}]:`, err.message);
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/discounts', async (req, res) => {
  try {
    const { rows } = await db.query('SELECT * FROM discounts');
    res.json(rows);
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
    const { rows } = await db.query('SELECT blocked_date FROM blocked_dates WHERE suite_id = $1', [req.params.suiteId]);
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
    await db.query('DELETE FROM blocked_dates WHERE suite_id = $1 AND blocked_date = $2', [suite_id, blocked_date]);
    res.json({ message: 'Date unblocked' });
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
