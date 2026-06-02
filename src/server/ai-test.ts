const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1'
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini'
const OPENAI_API_KEY = process.env.OPENAI_API_KEY

if (!OPENAI_API_KEY) {
  throw new Error('OPENAI_API_KEY is required')
}

async function main() {
  const response = await fetch(`${OPENAI_BASE_URL.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [
        { role: 'system', content: 'You are a concise API smoke test.' },
        { role: 'user', content: 'Reply with OK if this OpenAI-compatible API works.' },
      ],
      temperature: 0,
    }),
  })

  const text = await response.text()

  if (!response.ok) {
    console.error(`API test failed: ${response.status}`)
    console.error(text)
    process.exit(1)
  }

  const json = JSON.parse(text)
  console.log(json?.choices?.[0]?.message?.content || json)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
