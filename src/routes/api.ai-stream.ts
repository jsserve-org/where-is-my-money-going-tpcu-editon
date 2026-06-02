import { createAPIFileRoute } from '@tanstack/start-api-routes'
import { streamTenderAnalysisResponse } from '@/server/ai'

export const APIRoute = createAPIFileRoute('/api/ai-stream')({
  POST: async ({ request }: { request: Request }) => {
    const body = await request.json().catch(() => ({}))
    const inviteId = String(body.inviteId || '')

    if (!inviteId) {
      return new Response('inviteId is required', { status: 400 })
    }

    return streamTenderAnalysisResponse(inviteId)
  },
})
