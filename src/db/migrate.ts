import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('DATABASE_URL environment variable is required')
}

const pool = new Pool({ connectionString })
const db = drizzle(pool, { schema })

async function main() {
  console.log('Creating tables...')

  await db.execute(/* sql */ `
    CREATE TABLE IF NOT EXISTS tenders (
      id SERIAL PRIMARY KEY,
      case_no VARCHAR(50) NOT NULL,
      year VARCHAR(10) NOT NULL,
      name TEXT NOT NULL,
      announcement_count VARCHAR(20) NOT NULL,
      bidding_method VARCHAR(100) NOT NULL,
      category VARCHAR(50) NOT NULL,
      announcement_date VARCHAR(30) NOT NULL,
      invite_id VARCHAR(50) NOT NULL,
      amount VARCHAR(50),
      inv_status VARCHAR(10) NOT NULL,
      inv_kind VARCHAR(10) NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tenders_status_kind ON tenders(inv_status, inv_kind);
    CREATE INDEX IF NOT EXISTS idx_tenders_case_no ON tenders(case_no);
    CREATE INDEX IF NOT EXISTS idx_tenders_invite_id ON tenders(invite_id);
  `)

  await db.execute(/* sql */ `
    CREATE TABLE IF NOT EXISTS tender_details (
      id SERIAL PRIMARY KEY,
      invite_id VARCHAR(50) NOT NULL UNIQUE,
      case_no VARCHAR(50) NOT NULL,
      detail_json JSONB NOT NULL,
      created_at TIMESTAMP DEFAULT NOW() NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW() NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tender_details_invite_id ON tender_details(invite_id);
    CREATE INDEX IF NOT EXISTS idx_tender_details_case_no ON tender_details(case_no);
  `)

  console.log('Done!')
  await pool.end()
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
