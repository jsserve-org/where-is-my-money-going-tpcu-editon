import { createServerFn } from '@tanstack/react-start'
import { get } from 'node:https'
import { eq, and } from 'drizzle-orm'
import { db, tendersTable, tenderDetailsTable } from '@/db'

const BASE_URL = 'https://tnd.tpcu.edu.tw/tsint/pay_pro'

function fetchHtml(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    get(url, { rejectUnauthorized: false }, (res) => {
      let data = ''
      res.on('data', (chunk) => {
        data += chunk
      })
      res.on('end', () => resolve(data))
    }).on('error', (err) => reject(err))
  })
}

/* ---------- in-memory TTL cache on top of DB ---------- */
const CACHE_TTL_MS = 60 * 60_000 // 1 hour
const cache = new Map<string, { ts: number; data: unknown }>()

function getFromCache<T>(key: string): T | undefined {
  const entry = cache.get(key)
  if (entry && Date.now() - entry.ts < CACHE_TTL_MS) {
    return entry.data as T
  }
}

function setCache<T>(key: string, data: T) {
  cache.set(key, { ts: Date.now(), data })
}

function cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const entry = getFromCache<T>(key)
  if (entry !== undefined) return Promise.resolve(entry)
  return fn().then((data) => {
    setCache(key, data)
    return data
  })
}
/* ----------------------------------------------------- */

export interface TenderListItem {
  caseNo: string
  year: string
  name: string
  announcementCount: string
  biddingMethod: string
  category: string
  announcementDate: string
  inviteId: string
  amount?: string
}

export interface TenderDetail {
  [key: string]: string
}

async function scrapeTenders(invStatus: string, invKind: string): Promise<TenderListItem[]> {
  const url = `${BASE_URL}/pay001_list.jsp?inv_kind=${encodeURIComponent(invKind)}&inv_status=${encodeURIComponent(invStatus)}`
  const html = await fetchHtml(url)

  const cheerio = await import('cheerio')
  const $ = cheerio.load(html)
  const table = $('table').first()
  const rows = table.find('tr')
  const items: TenderListItem[] = []

  rows.each((_i: number, row: any) => {
    if (_i === 0) return
    const cells = $(row).find('td')
    if (cells.length < 6) return

    const caseNo = $(cells[0]).text().trim()
    const year = caseNo.split('-')[0] || ''
    const nameCell = $(cells[1])
    const name = nameCell.text().trim()
    const link = nameCell.find('a').attr('href') || ''
    const inviteIdMatch = link.match(/invite_id=([^&]+)/)
    const inviteId = inviteIdMatch ? inviteIdMatch[1] : ''

    items.push({
      caseNo,
      year,
      name,
      announcementCount: $(cells[2]).text().trim(),
      biddingMethod: $(cells[3]).text().trim(),
      category: $(cells[4]).text().trim(),
      announcementDate: $(cells[5]).text().trim(),
      inviteId,
    })
  })

  return items
}

async function saveTendersToDb(items: TenderListItem[], invStatus: string, invKind: string) {
  if (items.length === 0) return
  // Delete old entries for this status+kind then insert fresh data
  await db
    .delete(tendersTable)
    .where(
      and(
        eq(tendersTable.invStatus, invStatus),
        eq(tendersTable.invKind, invKind),
      ),
    )

  await db.insert(tendersTable).values(
    items.map((item) => ({
      caseNo: item.caseNo,
      year: item.year,
      name: item.name,
      announcementCount: item.announcementCount,
      biddingMethod: item.biddingMethod,
      category: item.category,
      announcementDate: item.announcementDate,
      inviteId: item.inviteId,
      amount: item.amount ?? null,
      invStatus,
      invKind,
    })),
  )
}

async function loadTendersFromDb(invStatus: string, invKind: string): Promise<TenderListItem[] | undefined> {
  const rows = await db
    .select()
    .from(tendersTable)
    .where(
      and(
        eq(tendersTable.invStatus, invStatus),
        eq(tendersTable.invKind, invKind),
      ),
    )

  if (rows.length === 0) return undefined

  return rows.map((r) => ({
    caseNo: r.caseNo,
    year: r.year,
    name: r.name,
    announcementCount: r.announcementCount,
    biddingMethod: r.biddingMethod,
    category: r.category,
    announcementDate: r.announcementDate,
    inviteId: r.inviteId,
    amount: r.amount ?? undefined,
  }))
}

export const fetchTenders = createServerFn({ method: 'GET' })
  .inputValidator((input: { invStatus: string; invKind: string }) => input)
  .handler(async (ctx) => {
    const { invStatus, invKind } = ctx.data as { invStatus: string; invKind: string }
    const cacheKey = `list-${invStatus}-${invKind}`

    return cached(cacheKey, async () => {
      // 1. Try DB first
      const dbItems = await loadTendersFromDb(invStatus, invKind)
      if (dbItems !== undefined && dbItems.length > 0) {
        return dbItems
      }

      // 2. Fall back to scraping
      const items = await scrapeTenders(invStatus, invKind)

      // 3. Save to DB for next time
      await saveTendersToDb(items, invStatus, invKind)

      return items
    })
  })

/* Fetch price data from list2_2 endpoint for specific years */
export const fetchPricesForYears = createServerFn({ method: 'GET' })
  .inputValidator((input: { years: string[]; invKind: string }) => input)
  .handler(async (ctx) => {
    const { years, invKind } = ctx.data as { years: string[]; invKind: string }
    const result: Record<string, string> = {}

    await Promise.all(
      years.map(async (year) => {
        const cacheKey = `price-${year}-${invKind}`
        const entry = getFromCache<Map<string, string>>(cacheKey)
        if (entry) {
          for (const [k, v] of entry) result[k] = v
          return
        }

        const url = `${BASE_URL}/pay001_list2_2.jsp?pay_year=${encodeURIComponent(year)}&inv_kind=${encodeURIComponent(invKind)}`
        const html = await fetchHtml(url)
        const cheerio = await import('cheerio')
        const $ = cheerio.load(html)
        const table = $('table').first()
        const priceMap = new Map<string, string>()

        table.find('tr').each((_i: number, row: any) => {
          if (_i === 0) return
          const cells = $(row).find('td')
          if (cells.length < 8) return
          const caseNo = $(cells[0]).text().trim()
          const amount = $(cells[7]).text().trim()
          if (caseNo && amount) {
            priceMap.set(caseNo, amount)
            result[caseNo] = amount
          }
        })

        setCache(cacheKey, priceMap)
      }),
    )

    // Update amounts in DB
    for (const [caseNo, amount] of Object.entries(result)) {
      await db
        .update(tendersTable)
        .set({ amount })
        .where(eq(tendersTable.caseNo, caseNo))
    }

    return result
  })

async function scrapeTenderDetail(inviteId: string): Promise<TenderDetail> {
  const url = `${BASE_URL}/pay001_qry3.jsp?invite_id=${inviteId}`
  const html = await fetchHtml(url)

  const cheerio = await import('cheerio')
  const $ = cheerio.load(html)
  const table = $('table').first()
  const result: Record<string, string> = {}

  table.find('tr').each((_i: number, row: any) => {
    const cells = $(row).find('td, th')
    if (cells.length >= 2) {
      const key = $(cells[0]).text().trim()
      const value = $(cells[1]).text().trim()
      if (key && value && key !== value) {
        result[key] = value
      }
    }
  })

  return result
}

async function loadDetailFromDb(inviteId: string): Promise<TenderDetail | undefined> {
  const rows = await db
    .select()
    .from(tenderDetailsTable)
    .where(eq(tenderDetailsTable.inviteId, inviteId))
    .limit(1)

  if (rows.length === 0) return undefined
  return rows[0].detailJson as Record<string, string>
}

async function saveDetailToDb(inviteId: string, caseNo: string, detail: TenderDetail) {
  await db
    .insert(tenderDetailsTable)
    .values({
      inviteId,
      caseNo,
      detailJson: detail,
    })
    .onConflictDoUpdate({
      target: tenderDetailsTable.inviteId,
      set: { detailJson: detail, updatedAt: new Date() },
    })
}

export const fetchTenderDetail = createServerFn({ method: 'GET' })
  .inputValidator((input: { inviteId: string }) => input)
  .handler(async (ctx) => {
    const { inviteId } = ctx.data as { inviteId: string }
    const cacheKey = `detail-${inviteId}`

    return cached(cacheKey, async () => {
      // 1. Try DB first
      const dbDetail = await loadDetailFromDb(inviteId)
      if (dbDetail !== undefined) {
        return dbDetail
      }

      // 2. Fall back to scraping
      const detail = await scrapeTenderDetail(inviteId)

      // 3. Save to DB
      const caseNo = detail['標案案號'] || ''
      await saveDetailToDb(inviteId, caseNo, detail)

      return detail
    })
  })

export const fetchTenderDetailsBatch = createServerFn({ method: 'GET' })
  .inputValidator((input: { inviteIds: string[] }) => input)
  .handler(async (ctx) => {
    const { inviteIds } = ctx.data as { inviteIds: string[] }
    const results: Record<string, TenderDetail> = {}
    const toFetch: string[] = []

    // Check DB + cache first
    for (const inviteId of inviteIds) {
      const cacheKey = `detail-${inviteId}`
      const cachedEntry = getFromCache<TenderDetail>(cacheKey)
      if (cachedEntry) {
        results[inviteId] = cachedEntry
        continue
      }

      const dbDetail = await loadDetailFromDb(inviteId)
      if (dbDetail !== undefined) {
        setCache(cacheKey, dbDetail)
        results[inviteId] = dbDetail
        continue
      }

      toFetch.push(inviteId)
    }

    // Fetch missing ones
    for (const inviteId of toFetch) {
      const detail = await scrapeTenderDetail(inviteId)
      const cacheKey = `detail-${inviteId}`
      setCache(cacheKey, detail)
      results[inviteId] = detail

      const caseNo = detail['標案案號'] || ''
      await saveDetailToDb(inviteId, caseNo, detail)
    }

    return results
  })
