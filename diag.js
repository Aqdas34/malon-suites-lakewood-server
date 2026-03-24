const db = require('./db');
async function check() {
  try {
    const { rows } = await db.query('SELECT * FROM blocked_dates');
    console.log('Blocked Dates in DB:', rows);
    process.exit(0);
  } catch (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
}
check();
