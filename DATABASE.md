# Docker Compose App + PostgreSQL

## Local development

Runs the app from your local source tree with hot reload.

```bash
npm run docker:build
npm run docker:up
```

App: http://localhost:3000
Adminer: http://localhost:8080

## Production / GHCR image deployment

Use `docker-compose.prod.yml`. **Do not mount `.:/app` when using the built GHCR image** — that overwrites the files baked into the image and causes:

```txt
Could not read package.json: ENOENT: no such file or directory, open '/app/package.json'
```

Run:

```bash
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
```

App: http://localhost:31000

## Adminer login for local dev compose

- System: PostgreSQL
- Server: postgres
- Username: tpcu
- Password: tpcu_password
- Database: tpcu_tenders

## Stop services

```bash
npm run docker:down
# or for prod
docker compose -f docker-compose.prod.yml down
```

## AI analysis

Set OpenAI-compatible API variables in `.env` or in your deployment environment:

```bash
OPENAI_API_KEY=...
OPENAI_BASE_URL=https://api.openai.com/v1
OPENAI_MODEL=gpt-4o-mini
```

The AI prediction button appears on each tender detail page. It uses historical `tender_details` rows from Postgres to rank likely winning companies. If the DB has little historical detail data, load detail pages or use the advanced detail loader first.

## Notes

- The app container automatically runs `npm run db:setup` before starting.
- Tender list and detail pages are read from Postgres first.
- If the DB has no matching rows, the server scrapes TPCU, then saves the results to Postgres.
