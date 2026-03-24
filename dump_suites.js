const db = require('./db');
async function dump() {
  try {
    const { rows } = await db.query('SELECT id, title FROM suites');
    console.log('Suites in DB:', JSON.stringify(rows, null, 2));
    process.exit(0);
  } catch (err) {
    console.error('DB Error:', err);
    process.exit(1);
  }
}
dump();
