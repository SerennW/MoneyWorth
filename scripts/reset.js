require('dotenv').config();

const { Pool }         = require('pg');
const { createClient } = require('@supabase/supabase-js');

const pool    = new Pool({ connectionString: process.env.DATABASE_URL });
const BUCKET  = process.env.SUPABASE_BUCKET || 'posts';
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

async function reset() {
  await pool.query('TRUNCATE posts, users RESTART IDENTITY CASCADE');
  console.log('Database cleared.');

  const { data: files, error } = await supabase.storage.from(BUCKET).list('', { limit: 1000 });
  if (error) {
    console.warn('Could not list storage files:', error.message);
  } else if (files.length) {
    const names = files.map(f => f.name);
    await supabase.storage.from(BUCKET).remove(names);
    console.log(`Deleted ${names.length} image(s) from Supabase Storage.`);
  } else {
    console.log('No images in storage.');
  }

  await pool.end();
  console.log('Reset complete.');
}

reset().catch(err => { console.error(err.message); process.exit(1); });
