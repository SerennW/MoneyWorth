# MoneyWorth — Technical Documentation

---

## Table of Contents

1. [Tech Stack](#tech-stack)
2. [Architecture](#architecture)
3. [Rationale for Technology Choices](#rationale-for-technology-choices)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML5, CSS3, JavaScript (ES2020+) |
| Backend | Node.js 24, Express 4 |
| Auth | JSON Web Tokens (`jsonwebtoken`), `bcryptjs` |
| File Handling | Multer (in-memory multipart uploads) |
| Database | PostgreSQL (managed via Supabase, `pg` driver) |
| Asset Storage | Supabase Storage (`posts` bucket) |
| Hosting | Vercel (serverless functions) |

---

## Architecture

MoneyWorth follows a **client-server** pattern. The Express server serves the static frontend and exposes a REST API from the same process and origin, eliminating CORS entirely. It runs as a Vercel serverless function in production, persisting structured data to a managed PostgreSQL database (Supabase) and image files to Supabase Storage.

```
┌─────────────────────────────────────────────────────────┐
│                        Browser                          │
│                                                         │
│  HTML / CSS / app.js (Vanilla SPA)                      │
│  ┌───────────┐  ┌────────────┐  ┌──────────────────┐   │
│  │  Feed UI  │  │  Modals    │  │  Auth State      │   │
│  │  render() │  │  Post/Vote │  │  localStorage /  │   │
│  │  sorted() │  │  Login     │  │  sessionStorage  │   │
│  └─────┬─────┘  └─────┬──────┘  └────────┬─────────┘   │
│        └──────────────┴──── fetch() ──────┘             │
└──────────────────────────────┬──────────────────────────┘
                     HTTP/REST (same origin)
┌──────────────────────────────┴──────────────────────────┐
│            Express Server (Vercel serverless)           │
│                                                         │
│  express.static ──► serves index.html, app.js, CSS      │
│                                                         │
│  REST API                                               │
│  POST /api/auth/register   POST /api/auth/login         │
│  GET  /api/posts           POST /api/posts              │
│  POST /api/posts/:id/vote  DELETE /api/posts/:id        │
│                                                         │
│  requireAuth middleware (JWT verify)                    │
│                                                         │
└──────┬─────────────────────────────┬────────────────────┘
       │ pg (pooled)                 │ @supabase/supabase-js
┌──────▼───────────────┐     ┌───────▼──────────────────┐
│  PostgreSQL (Supabase)│     │  Supabase Storage        │
│                       │     │  (`posts` bucket)        │
│  users   posts        │     │                          │
│  votes   post_tags    │     │  <timestamp>-<rand>      │
│  post_images          │     │  .jpg / .png / ...       │
│  (bcrypt hashes,      │     │                          │
│   PK(user_id,post_id))│     │  public URL per file     │
└───────────────────────┘     └──────────────────────────┘
```

### API Endpoints

| Method | Endpoint | Auth Required | Description |
|---|---|---|---|
| `POST` | `/api/auth/register` | No | Create a new account |
| `POST` | `/api/auth/login` | No | Log in, receive JWT |
| `GET` | `/api/auth/me` | Yes | Validate token, return user info |
| `GET` | `/api/posts` | Optional | List all posts; includes `myVote` when authenticated |
| `POST` | `/api/posts` | Yes | Create a post (multipart, up to 10 images) |
| `POST` | `/api/posts/:id/vote` | Yes | Cast or retract a vote |
| `DELETE` | `/api/posts/:id` | Yes | Delete own post |

---

## Rationale for Technology Choices

### Vanilla JS instead of React or Vue

The UI is a single page with a feed, three modals, and a detail panel — a framework would add a build step, a virtual DOM, and a dependency tree for what amounts to roughly 700 lines of DOM manipulation. Vanilla JS keeps the project self-contained: no `node_modules` on the client, no bundler, and the browser can load the page directly from disk during development.

### Express over a heavier framework

Express was chosen for its minimal surface area. The API has six endpoints. Frameworks like NestJS or Fastify impose decorators, modules, and boilerplate that provide no value at this scale. Express lets each route be readable in one glance and requires no knowledge beyond standard HTTP concepts.

### PostgreSQL (via Supabase) instead of flat-file JSON

An early version of the app used flat-file JSON, but that approach has no concurrent-write safety and cannot run on a serverless host with an ephemeral filesystem. PostgreSQL was chosen because the data is inherently relational (users, posts, tags, images, and votes) and benefits from foreign keys, indexing, and transactional writes — for example, creating a post and its tags/images atomically. Supabase provides a managed PostgreSQL instance plus object storage, so no database server has to be self-hosted. In production the server connects through Supabase's **Transaction pooler**, which is required for short-lived serverless connections.

### JWT over server-side sessions

Sessions require server-side state storage such as memory or a session store like Redis. JWT keeps the server stateless: the token is self-contained and verified with a secret key. This also makes the **Remember Me** feature straightforward — the same token is stored in either `localStorage` (persistent across sessions) or `sessionStorage` (cleared when the tab closes), with no server-side change required.

### bcryptjs for passwords

bcrypt is the standard choice for password hashing because its work factor is intentionally slow and configurable, making brute-force and dictionary attacks computationally expensive. The pure-JS `bcryptjs` variant was used specifically to avoid native compilation via `node-gyp`, which can break across machines and Node.js versions.

### Dedicated `votes` table with a composite primary key

Votes live in their own table keyed by `(user_id, post_id)`. The composite primary key enforces, at the database level, that each user can hold at most one vote per post — making the "one user, one vote" rule a structural guarantee rather than application logic that could be bypassed under concurrency. Aggregate up/down counts are computed with SQL, and the requesting user's own vote (`myVote`) is resolved per post via a correlated subquery in the `GET /api/posts` query. Casting a vote uses an `INSERT ... ON CONFLICT DO UPDATE` upsert, and retracting one is a simple `DELETE`.

### Supabase Storage instead of local disk for images

Vercel's serverless filesystem is ephemeral, so uploaded files written to disk would not persist between invocations. Multer is therefore configured with in-memory storage, and each image buffer is uploaded to a Supabase Storage bucket; the database stores only the filename, and a public URL is constructed on read. Deleting a post or account also removes its associated objects from the bucket.
