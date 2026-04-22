const express = require('express');
const cors = require('cors');
const db = require('./db');
const multer = require('multer');
const path = require('path');
require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');

// Ensure the uploads directory exists before accepting images
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const app = express();
const PORT = process.env.PORT || 5000;

const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD || process.env.DB_PASS,
  port: process.env.DB_PORT,
});

// Auto-migration for missing columns
const runMigration = async () => {
  try {
    console.log("Checking and generating missing tables...");

    // 1. Create all base tables safely
    await pool.query(`
      CREATE TABLE IF NOT EXISTS suites (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          description TEXT,
          base_price DECIMAL(10, 2) NOT NULL,
          amenities JSONB,
          images JSONB
      );

      CREATE TABLE IF NOT EXISTS bookings (
          id SERIAL PRIMARY KEY,
          first_name TEXT NOT NULL,
          last_name TEXT NOT NULL,
          email TEXT NOT NULL,
          mobile TEXT NOT NULL,
          suite_id TEXT REFERENCES suites(id),
          check_in DATE NOT NULL,
          check_out DATE NOT NULL,
          breakfast_dates JSONB,
          total_cost DECIMAL(10, 2) NOT NULL,
          status TEXT DEFAULT 'pending',
          extras JSONB,
          notes TEXT,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS blocked_dates (
          id SERIAL PRIMARY KEY,
          suite_id TEXT REFERENCES suites(id) ON DELETE CASCADE,
          blocked_date DATE NOT NULL,
          reason TEXT,
          UNIQUE(suite_id, blocked_date)
      );

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

      CREATE TABLE IF NOT EXISTS discounts (
          id SERIAL PRIMARY KEY,
          type TEXT NOT NULL,
          threshold DECIMAL(10, 2),
          percentage DECIMAL(5,2) NOT NULL,
          is_active BOOLEAN DEFAULT true
      );

      CREATE TABLE IF NOT EXISTS global_settings (
          key TEXT PRIMARY KEY,
          value TEXT
      );
    `);

    // 2. Perform Alters on Suites if needed
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

      ALTER TABLE bookings
      ADD COLUMN IF NOT EXISTS extras JSONB,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS payment_intent_id TEXT;
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

// --- GLOBAL NODEMAILER INITIALIZATION ---
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.hostinger.com',
  port: parseInt(process.env.SMTP_PORT) || 465,
  secure: true, // Use SSL
  auth: {
    user: process.env.ADMIN_EMAIL,
    pass: process.env.ADMIN_EMAIL_PASS
  }
});

// Verification of transporter
transporter.verify((error, success) => {
  if (error) {
    console.log('❌ Mail Server Connection Error:', error);
  } else {
    console.log('✅ Mail Server is ready to send notifications');
  }
});

const sendConfirmationEmail = async (data) => {
  const { 
    type, email, firstName, lastName, suiteTitle, totalCost, checkIn, checkOut, 
    giftRecipientEmail, giftRecipientName, giftMessage, extras 
  } = data;

  const isGift = type === 'gift';
  
  // Parse Extras for the email body
  let extrasList = [];
  if (extras) {
    const ex = typeof extras === 'string' ? JSON.parse(extras) : extras;
    if (ex.basic_breakfast) extrasList.push("Basic Breakfast Package");
    if (ex.deluxe_breakfast) extrasList.push("Deluxe Breakfast Package");
    if (ex.shabbos_package) extrasList.push("Shabbos Catering Package");
    if (ex.full_shabbos) extrasList.push("Full Shabbos Package");
    if (ex.late_checkout_1) extrasList.push("Late Checkout (1:00 PM)");
    if (ex.late_checkout_2) extrasList.push("Late Checkout (3:00 PM)");
  }

  const logoUrl = "https://malon-suites.com/assets/images/malon-logo.png"; // Update with actual live logo URL

  // 1. Template for the Buyer
  const buyerTemplate = `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e2e2; padding: 40px; color: #333; line-height: 1.6;">
      <div style="text-align: center; margin-bottom: 40px;">
        <img src="${logoUrl}" alt="Malon Luxury Suites" style="max-width: 150px; margin-bottom: 20px;" />
        <h1 style="color: #9B804E; font-size: 24px; letter-spacing: 2px; text-transform: uppercase; margin: 0;">Malon Luxury Suites</h1>
        <div style="height: 1px; width: 60px; background-color: #9B804E; margin: 20px auto;"></div>
      </div>
      
      <h2 style="font-size: 20px; font-weight: normal; margin-bottom: 20px; color: #1a1a1a;">Confirmation of ${isGift ? 'Gift Purchase' : 'Stay'}</h2>
      <p>Dear ${firstName} ${lastName},</p>
      <p>Thank you for choosing Malon Luxury Suites. We are delighted to confirm your ${isGift ? 'gift purchase' : 'booking'} at <strong>${suiteTitle}</strong>.</p>
      
      <div style="background-color: #fcf9f2; padding: 30px; margin: 30px 0; border-radius: 4px; border: 1px solid #f0e6d2;">
        <h3 style="margin-top: 0; color: #9B804E; font-size: 13px; text-transform: uppercase; letter-spacing: 1px; border-bottom: 1px solid #f0e6d2; padding-bottom: 10px; margin-bottom: 15px;">Reservation Summary</h3>
        
        <table style="width: 100%; font-size: 14px;">
          <tr>
            <td style="padding: 5px 0; color: #666; width: 120px;">Location:</td>
            <td style="padding: 5px 0; font-weight: bold;">${suiteTitle}</td>
          </tr>
          ${!isGift ? `
          <tr>
            <td style="padding: 5px 0; color: #666;">Dates:</td>
            <td style="padding: 5px 0; font-weight: bold;">${checkIn || 'TBD'} — ${checkOut || 'TBD'}</td>
          </tr>
          ` : ''}
          <tr>
            <td style="padding: 5px 0; color: #666;">Total Paid:</td>
            <td style="padding: 5px 0; font-weight: bold; color: #9B804E;">$${totalCost}</td>
          </tr>
          ${extrasList.length > 0 ? `
          <tr>
            <td style="padding: 5px 0; color: #666; vertical-align: top;">Add-ons:</td>
            <td style="padding: 5px 0; font-weight: bold;">
              <ul style="margin: 0; padding-left: 18px;">
                ${extrasList.map(item => `<li>${item}</li>`).join('')}
              </ul>
            </td>
          </tr>
          ` : ''}
          ${isGift ? `
          <tr>
            <td style="padding: 5px 0; color: #666;">Gifted To:</td>
            <td style="padding: 5px 0; font-weight: bold;">${giftRecipientName} (${giftRecipientEmail})</td>
          </tr>
          ` : ''}
        </table>
      </div>

      <div style="margin: 30px 0; font-size: 14px; color: #555;">
        <p><strong>Check-in Info:</strong> Check-in is at 4:00 PM. Access codes will be sent via text on the day of your arrival.</p>
        <p><strong>Address:</strong> You will receive the exact suite address and parking instructions in a follow-up message.</p>
      </div>

      <p style="font-size: 14px;">If you have any questions, please feel free to reply to this email or call us at <strong>908-94-MALON</strong>.</p>
      
      <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center; text-transform: uppercase; letter-spacing: 1px;">
        <p>© 2026 Malon Luxury Suites | Lakewood, NJ</p>
      </div>
    </div>
  `;

  // 2. Recipient Template remains similar but with logo
  const recipientTemplate = isGift ? `
    <div style="font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e2e2; padding: 40px; color: #333;">
      <div style="text-align: center; margin-bottom: 40px;">
        <img src="${logoUrl}" alt="Malon Luxury Suites" style="max-width: 120px; margin-bottom: 20px;" />
        <h1 style="color: #9B804E; font-size: 26px; letter-spacing: 2px; text-transform: uppercase;">A Special Gift</h1>
        <div style="height: 1px; width: 60px; background-color: #9B804E; margin: 20px auto;"></div>
      </div>
      
      <p>Dear ${giftRecipientName},</p>
      <p>We are excited to share that <strong>${firstName} ${lastName}</strong> has gifted you an exclusive experience at Malon Luxury Suites.</p>
      
      <div style="background-color: #fcf9f2; padding: 30px; margin: 30px 0; border-radius: 4px; text-align: center; border: 1px solid #f0e6d2;">
        <h3 style="margin-top: 0; color: #9B804E; font-size: 16px; text-transform: uppercase; letter-spacing: 1px;">${suiteTitle}</h3>
        <div style="font-style: italic; margin-top: 20px; color: #555; border-left: 3px solid #9B804E; padding-left: 20px; text-align: left;">
          "${giftMessage || 'A special gift for a beautiful Sheva Brachos week.'}"
        </div>
      </div>

      <p>To schedule your stay, please contact us at your convenience.</p>
      <p style="text-align: center; margin-top: 40px;">
        <a href="https://malon-suites.com" style="background-color: #9B804E; color: white; padding: 15px 30px; text-decoration: none; border-radius: 2px; font-weight: bold; text-transform: uppercase; font-size: 12px; letter-spacing: 1px;">Explore Malon</a>
      </p>
      
      <div style="margin-top: 60px; padding-top: 20px; border-top: 1px solid #eee; font-size: 11px; color: #999; text-align: center;">
        <p>© 2026 Malon Luxury Suites | Lakewood, NJ</p>
      </div>
    </div>
  ` : null;

  try {
    // FETCH ADMIN EMAIL FROM DATABASE DYNAMICALLY
    const { rows: settingsRows } = await db.query("SELECT value FROM global_settings WHERE key = 'admin_notification_email'");
    const dynamicAdminEmail = settingsRows.length > 0 ? settingsRows[0].value : process.env.ADMIN_EMAIL;

    // Send to Buyer
    await transporter.sendMail({
      from: `"Malon Luxury Suites" <${process.env.ADMIN_EMAIL}>`,
      to: email,
      subject: isGift ? `Receipt: Your Gift to ${giftRecipientName}` : `Confirmation: Your Stay at ${suiteTitle}`,
      html: buyerTemplate
    });

    // Send to Recipient if Gift
    if (isGift && giftRecipientEmail) {
      await transporter.sendMail({
        from: `"Malon Luxury Suites" <${process.env.ADMIN_EMAIL}>`,
        to: giftRecipientEmail,
        subject: `A Luxury Gift from ${firstName} ${lastName}`,
        html: recipientTemplate
      });
    }

    // Admin Notification
    if (dynamicAdminEmail) {
      await transporter.sendMail({
        from: `"Malon System" <${process.env.ADMIN_EMAIL}>`,
        to: dynamicAdminEmail,
        subject: `🎉 New ${isGift ? 'Gift' : 'Booking'} Received: ${suiteTitle}`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee;">
            <h2 style="color: #9B804E;">New Order Received</h2>
            <p><strong>Customer:</strong> ${firstName} ${lastName}</p>
            <p><strong>Location:</strong> ${suiteTitle}</p>
            <p><strong>Total:</strong> $${totalCost}</p>
            ${extrasList.length > 0 ? `<p><strong>Extras:</strong> ${extrasList.join(', ')}</p>` : ''}
            <p>Please check the admin dashboard for full details.</p>
          </div>
        `
      });
    }
    
    console.log(`✉️ Confirmation emails sent successfully! (Admin: ${dynamicAdminEmail})`);
  } catch (err) {
    console.error('❌ Failed to send confirmation email:', err.message);
  }
};

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

// --- STRIPE SECURE WEBHOOK (Must be RAW body, so it stays ABOVE express.json!) ---
app.post('/api/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // This requires the STRIPE_WEBHOOK_SECRET inside your backend .env folder (Starts with "whsec_...")
    event = require('stripe')(process.env.STRIPE_SECRET_KEY).webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error(`⚠️ Webhook signature verification failed.`, err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the incredibly powerful webhook events asynchronously!
  switch (event.type) {
    case 'payment_intent.succeeded':
      const paymentIntent = event.data.object;
      console.log(`💰 Beautiful! Stripe Webhook intercepted! Payment for $${paymentIntent.amount / 100} was fully settled!`);

      const { booking_id, first_name, last_name, email, phone, suite_id, check_in, check_out } = paymentIntent.metadata || {};

      try {
        // --- 1. SECURELY UPDATE THE DATABASE STATUS TO PAID ---
        if (booking_id) {
          await db.query('UPDATE bookings SET status = $1, payment_intent_id = $2 WHERE id = $3', ['paid', paymentIntent.id, booking_id]);
          console.log(`✅ Booking #${booking_id} updated to PAID in Database!`);
        }

        // --- 2. SEND AUTOMATED CONFIRMATION EMAILS ---
        const { 
          type, 
          gift_recipient_email, 
          gift_recipient_name, 
          gift_message,
          total_cost // Passed in metadata usually as string
        } = paymentIntent.metadata || {};

        await sendConfirmationEmail({
          type: type || 'stay',
          email,
          firstName: first_name,
          lastName: last_name,
          suiteTitle: suite_id, // Metadata often stores ID or Title
          totalCost: total_cost || (paymentIntent.amount / 100).toFixed(2),
          checkIn,
          checkOut,
          giftRecipientEmail: gift_recipient_email,
          giftRecipientName: gift_recipient_name,
          giftMessage: gift_message
        });

      } catch (err) {
        console.error("Webhook Processing Error:", err.message);
      }
      break;

    case 'payment_intent.payment_failed':
      console.log(`❌ Payment visually failed! The customer's card was declined.`);
      break;

    default:
      console.log(`Unhandled Stripe Event: ${event.type}`);
  }

  // Return a 200 response to acknowledge receipt to Stripe's mainframe
  res.send();
});

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
  const {
    first_name, last_name, email, mobile, suite_id, check_in, check_out,
    breakfast_dates, total_cost, status, extras, notes
  } = req.body;

  try {
    const { rows } = await db.query(
      `INSERT INTO bookings (
        first_name, last_name, email, mobile, suite_id, check_in, check_out, 
        breakfast_dates, total_cost, status, extras, notes
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        first_name, last_name, email, mobile, suite_id, check_in, check_out,
        JSON.stringify(breakfast_dates), total_cost, status || 'pending',
        extras, notes
      ]
    );

    // --- TRIGGER EMAIL NOTIFICATION FOR MANUAL/CASH BOOKINGS ---
    // Only send immediately if status is 'confirmed' (Cash/Manual)
    // Stripe bookings have status 'pending' and email is sent via Webhook
    if (status === 'confirmed' || !req.body.paymentIntentId) {
      await sendConfirmationEmail({
        type: req.body.type || 'stay',
        email: email,
        firstName: first_name,
        lastName: last_name,
        suiteTitle: suite_id,
        totalCost: total_cost,
        checkIn: check_in,
        checkOut: check_out,
        giftRecipientEmail: req.body.giftRecipientEmail,
        giftRecipientName: req.body.giftRecipientName,
        giftMessage: req.body.giftMessage,
        extras: extras
      });
    }

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
    const upsertQueries = Object.entries(settings).map(([key, value]) =>
      db.query('INSERT INTO global_settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value', [key, value])
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

// --- STRIPE PAYMENTS API ---
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY || 'sk_test_placeholder');

app.post('/api/create-payment-intent', async (req, res) => {
  const { 
    total_cost, suite_id, first_name, last_name, email, phone, check_in, check_out, booking_id,
    type, giftRecipientName, giftRecipientEmail, giftMessage
  } = req.body;

  if (!total_cost || total_cost <= 0) {
    return res.status(400).json({ error: 'Invalid checkout amount' });
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total_cost * 100),
      currency: 'usd',
      metadata: {
        booking_id,
        suite_id,
        first_name,
        last_name,
        email,
        phone,
        check_in,
        check_out,
        total_cost: String(total_cost),
        type: type || 'stay',
        gift_recipient_name: giftRecipientName || '',
        gift_recipient_email: giftRecipientEmail || '',
        gift_message: giftMessage || ''
      },
      automatic_payment_methods: {
        enabled: true,
      },
    });

    // We MUST hand the frontend this exact random client_secret so it natively knows how to unlock the generic card reader box!
    res.send({ clientSecret: paymentIntent.client_secret });
  } catch (err) {
    console.error(`STRIPE ERROR:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Malon API Server running on port ${PORT}`);
});
