require('dotenv').config();

const express               = require('express');
const multer                = require('multer');
const path                  = require('path');
const bcrypt                = require('bcryptjs');
const jwt                   = require('jsonwebtoken');
const { Pool }              = require('pg');
const { createClient }      = require('@supabase/supabase-js');

if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.error('ERROR: JWT_SECRET must be set in production');
  process.exit(1);
}

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'mw_dev_secret_change_in_prod';
const BUCKET     = process.env.SUPABASE_BUCKET || 'posts';

/* ── PostgreSQL pool ── */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

/* ── Supabase client (storage only) ── */
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

/* ── Storage helpers ── */
function imageUrl(filename) {
  return `${process.env.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${filename}`;
}

async function uploadImages(files) {
  return Promise.all(files.map(async file => {
    const ext      = path.extname(file.originalname).toLowerCase();
    const filename = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(filename, file.buffer, { contentType: file.mimetype, upsert: false });
    if (error) throw new Error(error.message);
    return filename;
  }));
}

async function deleteImages(filenames) {
  if (!filenames.length) return;
  await supabase.storage.from(BUCKET).remove(filenames);
}

/* ── Auto-create tables ── */
async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id            SERIAL      PRIMARY KEY,
      email         TEXT        UNIQUE NOT NULL,
      username      TEXT        UNIQUE NOT NULL,
      password_hash TEXT        NOT NULL,
      created_at    TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS posts (
      id              SERIAL      PRIMARY KEY,
      title           TEXT        NOT NULL,
      description     TEXT        NOT NULL,
      location        TEXT        NOT NULL,
      author_id       INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_username TEXT        NOT NULL,
      created_at      TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS post_tags (
      post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      tag     TEXT    NOT NULL
    );

    CREATE TABLE IF NOT EXISTS post_images (
      id       SERIAL  PRIMARY KEY,
      post_id  INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
      filename TEXT    NOT NULL,
      position INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS votes (
      user_id   INTEGER NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
      post_id   INTEGER NOT NULL REFERENCES posts(id)  ON DELETE CASCADE,
      vote_type TEXT    NOT NULL CHECK (vote_type IN ('up', 'down')),
      PRIMARY KEY (user_id, post_id)
    );
  `);
}

/* ── Multer — memory storage (no local disk writes) ── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits:     { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype.startsWith('image/')),
});

/* ── Auth middleware ── */
function requireAuth(req, res, next) {
  const h = req.headers['authorization'] || '';
  if (!h.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(h.slice(7), JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/* ── Middleware ── */
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

/* ── POST /api/auth/register ── */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email = '', username = '', password = '', confirm = '' } = req.body;

    if (!email || !username || !password || !confirm)
      return res.status(400).json({ error: 'All fields are required' });
    if (password !== confirm)
      return res.status(400).json({ error: 'Passwords do not match' });
    if (password.length < 8)
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (!/^[a-zA-Z0-9_]{3,20}$/.test(username))
      return res.status(400).json({ error: 'Username must be 3–20 characters (letters, numbers, underscore only)' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      return res.status(400).json({ error: 'Invalid email address' });

    const passwordHash = await bcrypt.hash(password, 10);
    const { rows: [user] } = await pool.query(
      `INSERT INTO users (email, username, password_hash)
       VALUES ($1, $2, $3) RETURNING id, username, email`,
      [email.toLowerCase(), username, passwordHash]
    );
    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    if (err.code === '23505') {
      if (err.constraint.includes('email')) return res.status(409).json({ error: 'Email already registered' });
      return res.status(409).json({ error: 'Username already taken' });
    }
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── POST /api/auth/login ── */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { identifier = '', password = '' } = req.body;
    if (!identifier || !password)
      return res.status(400).json({ error: 'Username/email and password are required' });

    const { rows: [user] } = await pool.query(
      `SELECT * FROM users WHERE lower(email) = $1 OR lower(username) = $1`,
      [identifier.toLowerCase()]
    );
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token, user: { id: user.id, username: user.username, email: user.email } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── GET /api/auth/me ── */
app.get('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT id, username, email FROM users WHERE id = $1`, [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── DELETE /api/auth/me ── */
app.delete('/api/auth/me', requireAuth, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password is required' });

    const { rows: [user] } = await pool.query(
      `SELECT * FROM users WHERE id = $1`, [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect password' });

    const { rows: images } = await pool.query(
      `SELECT pi.filename FROM post_images pi
       JOIN posts p ON pi.post_id = p.id WHERE p.author_id = $1`,
      [req.user.id]
    );

    await pool.query(`DELETE FROM users WHERE id = $1`, [req.user.id]);
    await deleteImages(images.map(r => r.filename));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── GET /api/posts ── */
app.get('/api/posts', async (req, res) => {
  try {
    let userId = null;
    const h = req.headers['authorization'] || '';
    if (h.startsWith('Bearer ')) {
      try { userId = jwt.verify(h.slice(7), JWT_SECRET).id; } catch {}
    }

    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.title,
        p.description                                      AS desc,
        p.location,
        p.author_id                                        AS "authorId",
        p.author_username                                  AS "authorUsername",
        (EXTRACT(EPOCH FROM p.created_at) * 1000)::float8  AS ts,
        COUNT(CASE WHEN v.vote_type = 'up'   THEN 1 END)::int AS up,
        COUNT(CASE WHEN v.vote_type = 'down' THEN 1 END)::int AS down,
        (SELECT vote_type FROM votes
         WHERE post_id = p.id AND user_id = $1)           AS "myVote",
        COALESCE((
          SELECT json_agg(tag ORDER BY tag)
          FROM post_tags WHERE post_id = p.id
        ), '[]'::json)                                     AS tags,
        COALESCE((
          SELECT json_agg(filename ORDER BY position)
          FROM post_images WHERE post_id = p.id
        ), '[]'::json)                                     AS images
      FROM posts p
      LEFT JOIN votes v ON v.post_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `, [userId]);

    res.json(rows.map(row => ({
      ...row,
      ts:     Number(row.ts),
      images: (row.images || []).map(imageUrl),
      myVote: row.myVote || null,
    })));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── POST /api/posts ── */
app.post('/api/posts', requireAuth, upload.array('images', 10), async (req, res) => {
  const client = await pool.connect();
  let filenames = [];
  try {
    const title    = (req.body.title    || '').trim();
    const desc     = (req.body.desc     || '').trim();
    const location = (req.body.location || '').trim();
    let   tags     = [];
    try { tags = JSON.parse(req.body.tags || '[]'); } catch {}
    tags = tags.map(t => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10);

    if (!title)              return res.status(400).json({ error: 'Title is required' });
    if (!desc)               return res.status(400).json({ error: 'Description is required' });
    if (!location)           return res.status(400).json({ error: 'Location is required' });
    if (!req.files?.length)  return res.status(400).json({ error: 'At least one image is required' });

    filenames = await uploadImages(req.files);

    await client.query('BEGIN');

    const { rows: [post] } = await client.query(
      `INSERT INTO posts (title, description, location, author_id, author_username)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, created_at`,
      [title, desc, location, req.user.id, req.user.username]
    );

    if (tags.length) {
      await client.query(
        `INSERT INTO post_tags (post_id, tag) SELECT $1, unnest($2::text[])`,
        [post.id, tags]
      );
    }

    await client.query(
      `INSERT INTO post_images (post_id, filename, position)
       SELECT $1, u.val, (u.pos - 1)::int
       FROM unnest($2::text[]) WITH ORDINALITY AS u(val, pos)`,
      [post.id, filenames]
    );

    await client.query('COMMIT');

    res.status(201).json({
      id:             post.id,
      title, desc, location,
      authorId:       req.user.id,
      authorUsername: req.user.username,
      up: 0, down: 0,
      ts:             new Date(post.created_at).getTime(),
      tags,
      images:         filenames.map(imageUrl),
      myVote:         null,
    });
  } catch (err) {
    await client.query('ROLLBACK');
    await deleteImages(filenames);
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  } finally {
    client.release();
  }
});

/* ── POST /api/posts/:id/vote ── */
app.post('/api/posts/:id/vote', requireAuth, async (req, res) => {
  try {
    const postId = Number(req.params.id);
    const { next } = req.body;
    const userId = req.user.id;

    const { rows: [post] } = await pool.query(
      `SELECT id FROM posts WHERE id = $1`, [postId]
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (next) {
      await pool.query(
        `INSERT INTO votes (user_id, post_id, vote_type) VALUES ($1, $2, $3)
         ON CONFLICT (user_id, post_id) DO UPDATE SET vote_type = EXCLUDED.vote_type`,
        [userId, postId, next]
      );
    } else {
      await pool.query(
        `DELETE FROM votes WHERE user_id = $1 AND post_id = $2`, [userId, postId]
      );
    }

    const { rows: [counts] } = await pool.query(`
      SELECT
        COUNT(CASE WHEN vote_type = 'up'   THEN 1 END)::int AS up,
        COUNT(CASE WHEN vote_type = 'down' THEN 1 END)::int AS down
      FROM votes WHERE post_id = $1
    `, [postId]);

    res.json({ up: counts.up, down: counts.down, myVote: next || null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── DELETE /api/posts/:id ── */
app.delete('/api/posts/:id', requireAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);

    const { rows: [post] } = await pool.query(
      `SELECT id, author_id FROM posts WHERE id = $1`, [id]
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });
    if (post.author_id !== req.user.id)
      return res.status(403).json({ error: 'You can only delete your own posts' });

    const { rows: images } = await pool.query(
      `SELECT filename FROM post_images WHERE post_id = $1`, [id]
    );

    await pool.query(`DELETE FROM posts WHERE id = $1`, [id]);
    await deleteImages(images.map(r => r.filename));

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/* ── Ensure tables exist on every cold start (local + Vercel) ── */
const dbReady = initDB().catch(err => {
  console.error('Failed to initialise database:', err.message);
  process.exit(1);
});

/* ── Export for Vercel (serverless) ── */
module.exports = app;

/* ── Start local dev server ── */
if (require.main === module) {
  dbReady.then(() => app.listen(PORT, () => console.log(`MoneyWorth running → http://localhost:${PORT}`)));
}
