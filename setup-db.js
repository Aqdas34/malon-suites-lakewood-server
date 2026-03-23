const fs = require('fs');
const path = require('path');
const db = require('./db');

const setup = async () => {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');

  console.log("Initializing Malon Luxury Suites Database...");
  
  try {
    // We execute the schema.sql content
    // Note: This requires the database itself to already exist (e.g. malon_suites)
    await db.query(schema);
    console.log("✅ Database schema applied successfully!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Setup failed:", err.message);
    if (err.message.includes('does not exist')) {
      console.log("\nTIP: Please create the database manually first:");
      console.log("psql -U postgres -c 'CREATE DATABASE malon_suites;'");
    }
    process.exit(1);
  }
};

setup();
