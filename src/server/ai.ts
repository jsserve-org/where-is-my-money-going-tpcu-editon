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

export async function buildAnalysisPrompt(inviteId: string) {
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

  return `You analyze tender procurement records and provide cautious predictive analysis using historical data only.

你是政府採購資料分析助理。請根據歷史標案資料，分析目前標案可能的得標廠商。

限制：
- 不要保證結果，只能給機率/信心與理由。
- 如果資料不足，明確說資料不足。
- 請用繁體中文。
- 請用 Markdown 輸出。
- 請輸出：1) 最可能得標廠商排名 2) 依據 3) 風險/不確定性 4) 建議補充資料。

目前標案：
${JSON.stringify(target, null, 2)}

相似歷史標案（最多30筆）：
${JSON.stringify(examples, null, 2)}

歷史得標廠商次數統計：
${JSON.stringify(winnerCounts, null, 2)}`
}

function missingKeyResponse() {
  return new Response('Missing OPENAI_API_KEY. Add OPENAI_API_KEY, and optionally OPENAI_BASE_URL / OPENAI_MODEL, then restart the app.', {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
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

    const prompt = await buildAnalysisPrompt(inviteId)

    const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [{ role: 'user', content: prompt }],
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

export async function streamTenderAnalysisResponse(inviteId: string) {
  if (!process.env.OPENAI_API_KEY) return missingKeyResponse()

  const prompt = await buildAnalysisPrompt(inviteId)

  const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      stream: true,
    }),
  })

  if (!response.ok || !response.body) {
    const text = await response.text()
    return new Response(`OpenAI-compatible API error (${response.status}): ${text}`, {
      status: response.status,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(response.body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  })
}
