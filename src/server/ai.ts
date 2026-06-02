import { createServerFn } from '@tanstack/react-start'
import { desc } from 'drizzle-orm'
import { db, tenderDetailsTable } from '@/db'
import { fetchTenderDetail } from './tenders'

const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'

function compactDetail(detail: Record<string, string>) {
  return {
    caseNo: detail['標案案號'] || detail['契約編號'] || '',
    name: detail['標案名稱'] || '',
    biddingMethod: detail['招標方式'] || '',
    category: detail['標的分類'] || '',
    budget: detail['預算金額'] || detail['採購金額'] || '',
    basePrice: detail['底價金額'] || '',
    awardAmount: detail['總決標金額'] || detail['決標金額'] || '',
    awardDate: detail['決標公告日期'] || detail['決標日期'] || '',
    winner: detail['得標廠商'] || detail['廠商名稱'] || '',
    agencyUnit: detail['單位名稱'] || '',
  }
}

function scoreSimilarity(target: ReturnType<typeof compactDetail>, item: ReturnType<typeof compactDetail>) {
  let score = 0
  if (target.category && target.category === item.category) score += 3
  if (target.biddingMethod && target.biddingMethod === item.biddingMethod) score += 3
  if (target.agencyUnit && item.agencyUnit && target.agencyUnit === item.agencyUnit) score += 2
  const targetWords = new Set(target.name.split(/\s|、|等|一式|[0-9]+/).filter((w) => w.length >= 2))
  for (const word of targetWords) {
    if (item.name.includes(word)) score += 1
  }
  return score
}

export const analyzeTenderWithAI = createServerFn({ method: 'POST' })
  .inputValidator((input: { inviteId: string }) => input)
  .handler(async (ctx) => {
    const { inviteId } = ctx.data as { inviteId: string }

    if (!process.env.OPENAI_API_KEY) {
      return {
        ok: false,
        analysis: 'Missing OPENAI_API_KEY. Add OPENAI_API_KEY, and optionally OPENAI_BASE_URL / OPENAI_MODEL, then restart the app.',
      }
    }

    const targetDetail = await fetchTenderDetail({ data: { inviteId } })
    const target = compactDetail(targetDetail as Record<string, string>)

    const rows = await db
      .select()
      .from(tenderDetailsTable)
      .orderBy(desc(tenderDetailsTable.updatedAt))
      .limit(500)

    const examples = rows
      .map((row) => compactDetail(row.detailJson as Record<string, string>))
      .filter((item) => item.winner && item.caseNo !== target.caseNo)
      .map((item) => ({ ...item, score: scoreSimilarity(target, item) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 30)

    const winnerCounts = examples.reduce<Record<string, number>>((acc, item) => {
      acc[item.winner] = (acc[item.winner] || 0) + 1
      return acc
    }, {})

    const prompt = `你是政府採購資料分析助理。請根據歷史標案資料，分析目前標案可能的得標廠商。\n\n限制：\n- 不要保證結果，只能給機率/信心與理由。\n- 如果資料不足，明確說資料不足。\n- 請用繁體中文。\n- 請輸出：1) 最可能得標廠商排名 2) 依據 3) 風險/不確定性 4) 建議補充資料。\n\n目前標案：\n${JSON.stringify(target, null, 2)}\n\n相似歷史標案（最多30筆）：\n${JSON.stringify(examples, null, 2)}\n\n歷史得標廠商次數統計：\n${JSON.stringify(winnerCounts, null, 2)}`

    const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          {
            role: 'user',
            content: `You analyze tender procurement records and provide cautious predictive analysis using historical data only.\n\n${prompt}`,
          },
        ],
        temperature: 0.2,
      }),
    })

    if (!response.ok) {
      const text = await response.text()
      return { ok: false, analysis: `OpenAI-compatible API error (${response.status}): ${text}` }
    }

    const json = await response.json()
    const analysis = json?.choices?.[0]?.message?.content || 'No analysis returned.'
    return { ok: true, analysis }
  })
