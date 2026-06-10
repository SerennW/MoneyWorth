# MoneyWorth

A social posting app where users share food and dining experiences, with upvote/downvote voting.

The website can be accessed through this link: 
https://moneyworth.vercel.app

## Features

- Create posts with title, description, location, tags, and up to 10 images
- Upvote / downvote posts (per-user, one vote per post)
- Sort by newest, most voted, top upvoted, top downvoted
- Search by title, location, or tags
- User accounts — register, login, remember me
- Delete your own posts and account
- Light / dark mode

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Vanilla HTML, CSS, JavaScript |
| Backend | Node.js, Express 4 |
| Database | PostgreSQL (Supabase in production) |
| Auth | JWT + bcryptjs |
| Image Storage | Supabase Storage |
| Deployment | Vercel (serverless) |

## Getting Started

### Prerequisites

- Node.js 18+
- PostgreSQL 14+ (local) or a [Supabase](https://supabase.com) project
- A [Supabase](https://supabase.com) Storage bucket (public) named `posts` for image uploads

### Setup

1. Clone the repo and install dependencies:

```bash
git clone <repo-url>
cd moneyworth
npm install
```

2. Copy the env template and fill in your values:

```bash
cp .env.example .env
```

```env
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/moneyworth
JWT_SECRET=a_long_random_secret_string
NODE_ENV=development
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=your-service-role-key-here
SUPABASE_BUCKET=posts
```

3. Create the local database:

```sql
CREATE DATABASE moneyworth;
```

4. Start the dev server:

```bash
npm run dev
```

The app will be available at `http://localhost:3000`. Tables are created automatically on first run.

## Scripts

| Command | Description |
|---|---|
| `npm start` | Start production server |
| `npm run dev` | Start dev server with auto-restart (nodemon) |
| `npm run reset` | Clear all database data and Supabase Storage images |

## Deployment (Vercel + Supabase)

1. Push this repo to GitHub.
2. Import the repo on [Vercel](https://vercel.com).
3. Set these environment variables in Vercel project settings:

| Variable | Description |
|---|---|
| `DATABASE_URL` | Supabase PostgreSQL connection string (Transaction pooler) |
| `JWT_SECRET` | Long random string — generate with `openssl rand -hex 32` |
| `NODE_ENV` | `production` |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` key (keep secret) |
| `SUPABASE_BUCKET` | Storage bucket name (default: `posts`) |

Tables are created automatically on first request. No manual migration needed.

## Project Structure

```
├── public/          # Frontend (HTML, CSS, JS, SVG)
├── docs/            # Technical documentation
├── scripts/         # Utility scripts (reset)
├── server.js        # Express server + API
├── vercel.json      # Vercel deployment config
├── .env.example     # Environment variable template
└── package.json
```
