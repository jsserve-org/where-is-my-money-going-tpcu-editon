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

function extractTenderKeywords(name: string) {
  const normalized = name
    .replace(/[()（）【】\[\]「」『』,，.。:：;；/\\-]/g, ' ')
    .replace(/[0-9０-９]+/g, ' ')
    .replace(/第[一二三四五六七八九十]+階段/g, ' ')
    .replace(/一式|委外服務案|委託服務案|採購案|服務案|財物案|工程案/g, ' ')

  const dictionary = [
    '資通安全',
    '資訊安全',
    'ISMS',
    'ISO27001',
    '管理系統',
    '資訊系統',
    '網路',
    '資安',
    '安全',
    '維護',
    '建築',
    '建築師',
    '設計',
    '監造',
    '工程',
    '營繕',
    '保全',
    '清潔',
    '餐飲',
    '印刷',
    '設備',
    '軟體',
    '硬體',
  ]

  const keywordSet = new Set<string>()
  const upperName = name.toUpperCase()
  for (const word of dictionary) {
    if (upperName.includes(word.toUpperCase())) keywordSet.add(word.toUpperCase())
  }

  for (const token of normalized.split(/\s+/)) {
    const cleaned = token.trim()
    if (cleaned.length >= 2 && cleaned.length <= 12) keywordSet.add(cleaned.toUpperCase())
  }

  return keywordSet
}

function scoreSimilarity(target: ReturnType<typeof compactDetail>, item: ReturnType<typeof compactDetail>) {
  let score = 0
  let topicalMatches = 0
  const targetKeywords = extractTenderKeywords(target.name)
  const itemKeywords = extractTenderKeywords(item.name)

  for (const word of targetKeywords) {
    if (itemKeywords.has(word) || item.name.toUpperCase().includes(word)) {
      score += 6
      topicalMatches += 1
    }
  }

  if (target.category && target.category === item.category) score += 2
  if (target.biddingMethod && target.biddingMethod === item.biddingMethod) score += 1
  if (target.agencyUnit && item.agencyUnit && target.agencyUnit === item.agencyUnit) score += 1

  // A tender with no topical/name overlap is not a useful precedent even if method/category matches.
  if (topicalMatches === 0) return 0
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
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 30)

  const winnerCounts = examples.reduce<Record<string, number>>((acc, item) => {
    acc[item.winner] = (acc[item.winner] || 0) + 1
    return acc
  }, {})

  return `You analyze tender procurement records and provide cautious predictive analysis using historical data only.

你是政府採購資料分析助理。請根據歷史標案資料，分析目前標案可能的得標廠商。

分析要求：
- 預測最多 5 家可能得標廠商。
- 每筆都要有 percent、company、amount、why。
- percent 請用 0 到 100 的整數。
- amount 請用新台幣格式，例如：NT$1,234,567。
- amount 請根據目前標案預算/採購金額、底價、以及相似歷史標案決標金額推估。
- why 請用簡短繁體中文說明依據。
- 只能根據「相似歷史標案」中的得標廠商預測，不要使用無關產業廠商。
- 廠商必須與目前標案名稱/標的內容有明確關聯；例如資通安全/ISMS 標案不可預測建築師事務所、工程、營繕等不相關廠商。

目前標案：
${JSON.stringify(target, null, 2)}

相似歷史標案（最多30筆）：
${JSON.stringify(examples, null, 2)}

歷史得標廠商次數統計：
${JSON.stringify(winnerCounts, null, 2)}`
}

export type TenderPrediction = {
  percent: number
  company: string
  amount: string
  why: string
}

function normalizePredictions(value: unknown): TenderPrediction[] {
  const list = Array.isArray(value)
    ? value
    : Array.isArray((value as { predictions?: unknown })?.predictions)
      ? (value as { predictions: unknown[] }).predictions
      : []

  return list
    .map((item) => {
      const record = item as Record<string, unknown>
      return {
        percent: Number(record.percent ?? record.probability ?? 0),
        company: String(record.company ?? record.companyName ?? ''),
        amount: String(record.amount ?? record.estimatedAmount ?? ''),
        why: String(record.why ?? record.reason ?? ''),
      }
    })
    .filter((item) => item.company && item.amount)
    .slice(0, 5)
}

function missingKeyResponse() {
  return new Response('Missing OPENAI_API_KEY. Add OPENAI_API_KEY, and optionally OPENAI_BASE_URL / OPENAI_MODEL, then restart the app.', {
    status: 500,
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}

export async function predictTenderWinnersJson(inviteId: string): Promise<{
  ok: boolean
  predictions: TenderPrediction[]
  error?: string
}> {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      predictions: [],
      error: 'Missing OPENAI_API_KEY. Add OPENAI_API_KEY, and optionally OPENAI_BASE_URL / OPENAI_MODEL, then restart the app.',
    }
  }

  const prompt = `${await buildAnalysisPrompt(inviteId)}

請呼叫 submit_predictions 工具回傳結果。不要在 content 中輸出文字。`

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
      tools: [
        {
          type: 'function',
          function: {
            name: 'submit_predictions',
            description: 'Return likely tender winning companies as structured JSON.',
            parameters: {
              type: 'object',
              additionalProperties: false,
              properties: {
                predictions: {
                  type: 'array',
                  maxItems: 5,
                  items: {
                    type: 'object',
                    additionalProperties: false,
                    properties: {
                      percent: { type: 'integer', minimum: 0, maximum: 100 },
                      company: { type: 'string' },
                      amount: { type: 'string', description: 'Estimated award amount, e.g. NT$1,234,567' },
                      why: { type: 'string', description: 'Short Traditional Chinese reason for this prediction.' },
                    },
                    required: ['percent', 'company', 'amount', 'why'],
                  },
                },
              },
              required: ['predictions'],
            },
          },
        },
      ],
      tool_choice: { type: 'function', function: { name: 'submit_predictions' } },
    }),
  })

  if (!response.ok) {
    const text = await response.text()
    return { ok: false, predictions: [], error: `OpenAI-compatible API error (${response.status}): ${text}` }
  }

  const json = await response.json()
  const message = json?.choices?.[0]?.message
  const args = message?.tool_calls?.[0]?.function?.arguments
  try {
    if (args) {
      return { ok: true, predictions: normalizePredictions(JSON.parse(args)) }
    }
    if (message?.content) {
      return { ok: true, predictions: normalizePredictions(JSON.parse(message.content)) }
    }
  } catch (error) {
    return {
      ok: false,
      predictions: [],
      error: error instanceof Error ? error.message : 'Could not parse AI JSON response.',
    }
  }

  return { ok: false, predictions: [], error: 'No predictions returned.' }
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
