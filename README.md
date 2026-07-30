# Jaffer Brothers Group IT

Portfolio command dashboard for IT projects, milestones, and delivery status.

## Local

```bash
cp .env.example .env
# set MYSQL_PASSWORD in .env
npm install
npm start
```

Open http://localhost:3850

## MySQL

Creates only these tables (never drops existing data):

- `it_projects`
- `it_milestones`

## Deploy (Vercel)

1. Push this repo to GitHub
2. Import in Vercel
3. Set env vars: `MYSQL_HOST`, `MYSQL_PORT`, `MYSQL_DATABASE`, `MYSQL_USER`, `MYSQL_PASSWORD`
4. Deploy
