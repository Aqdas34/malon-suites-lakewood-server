const db = require('./db');
async function check() {
  try {
    const { rows } = await db.query('SELECT id, title FROM suites');
    console.log('Current Suites in DB:');
    console.table(rows);
    process.exit(0);
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}
check();
