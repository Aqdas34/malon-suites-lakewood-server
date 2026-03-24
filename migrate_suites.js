const db = require('./db');
async function migrate() {
  try {
    await db.query('ALTER TABLE suites ADD COLUMN IF NOT EXISTS address TEXT');
    await db.query('ALTER TABLE suites ADD COLUMN IF NOT EXISTS location_info TEXT'); // Store JSON or Rich Text
    console.log('Migration successful: Added address and location_info to suites table.');
    process.exit(0);
  } catch (err) {
    console.error('Migration failed:', err);
    process.exit(1);
  }
}
migrate();
