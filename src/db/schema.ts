import { pgTable, text, varchar, timestamp, serial, jsonb } from 'drizzle-orm/pg-core'

export const tendersTable = pgTable('tenders', {
  id: serial('id').primaryKey(),
  caseNo: varchar('case_no', { length: 50 }).notNull(),
  year: varchar('year', { length: 10 }).notNull(),
  name: text('name').notNull(),
  announcementCount: varchar('announcement_count', { length: 20 }).notNull(),
  biddingMethod: varchar('bidding_method', { length: 100 }).notNull(),
  category: varchar('category', { length: 50 }).notNull(),
  announcementDate: varchar('announcement_date', { length: 30 }).notNull(),
  inviteId: varchar('invite_id', { length: 50 }).notNull(),
  amount: varchar('amount', { length: 50 }),
  invStatus: varchar('inv_status', { length: 10 }).notNull(),
  invKind: varchar('inv_kind', { length: 10 }).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})

export const tenderDetailsTable = pgTable('tender_details', {
  id: serial('id').primaryKey(),
  inviteId: varchar('invite_id', { length: 50 }).notNull().unique(),
  caseNo: varchar('case_no', { length: 50 }).notNull(),
  detailJson: jsonb('detail_json').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
})
