# Docker Compose App + PostgreSQL

This project runs the TanStack Start app and PostgreSQL together with Docker Compose.

## Start everything

```bash
npm run docker:build
npm run docker:up
```

Then open:

- App: http://localhost:3000
- Adminer UI: http://localhost:8080

The app container automatically runs `npm run db:setup` before starting Vite.

## Adminer login

- System: PostgreSQL
- Server: postgres
- Username: tpcu
- Password: tpcu_password
- Database: tpcu_tenders

## Stop services

```bash
npm run docker:down
```

## Useful logs

```bash
npm run docker:logs
```

## Notes

- Inside Docker, the app uses:
  `DATABASE_URL=postgres://tpcu:tpcu_password@postgres:5432/tpcu_tenders`
- Tender list and detail pages are read from Postgres first.
- If the DB has no matching rows, the server scrapes TPCU, then saves the results to Postgres.
- Source is mounted into the app container for development, so edits should hot-reload.
