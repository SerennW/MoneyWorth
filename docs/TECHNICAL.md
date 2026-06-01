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
| File Handling | Multer (multipart uploads) |
| Database | Flat-file JSON (`moneyworth.json`, `users.json`) |
| Asset Storage | Local filesystem (`uploads/`) |

---

## Architecture

MoneyWorth follows a **single-tier client-server** pattern. The Express server serves the static frontend and exposes a REST API from the same process and origin, eliminating CORS entirely.

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
│                    Express Server                       │
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
       │                             │
┌──────▼──────┐               ┌──────▼──────────────┐
│  JSON Files │               │  uploads/ directory  │
│             │               │                      │
│ users.json  │               │  <timestamp>-<rand>  │
│ posts.json  │               │  .jpg / .png / ...   │
│  (bcrypt    │               │                      │
│   hashes,   │               │  served at           │
│  vote maps) │               │  /uploads/:filename  │
└─────────────┘               └──────────────────────┘
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

### Flat-file JSON instead of SQLite or PostgreSQL

This is a project running on a single machine with a small number of users. A database server would require a separate process, a connection pool, and schema migrations for every structural change. JSON files are zero-dependency, human-readable, and can be reset with a single `npm run reset`. The trade-off — no concurrent write safety, no indexing — is acceptable because the load is effectively single-user development traffic.

### JWT over server-side sessions

Sessions require server-side state storage such as memory or a session store like Redis. JWT keeps the server stateless: the token is self-contained and verified with a secret key. This also makes the **Remember Me** feature straightforward — the same token is stored in either `localStorage` (persistent across sessions) or `sessionStorage` (cleared when the tab closes), with no server-side change required.

### bcryptjs for passwords

bcrypt is the standard choice for password hashing because its work factor is intentionally slow and configurable, making brute-force and dictionary attacks computationally expensive. The pure-JS `bcryptjs` variant was used specifically to avoid native compilation via `node-gyp`, which can break across machines and Node.js versions.

### Per-user vote tracking inside the post document

Rather than a separate votes collection, each post stores a `votes` map of the form `{ userId: 'up' | 'down' }`. This keeps vote data co-located with the post it belongs to, avoids a second read on every vote request, and allows the `GET /api/posts` endpoint to inject the requesting user's `myVote` field in a single pass over the data. The trade-off is that the post document grows with each voter, which is acceptable at this scale.
