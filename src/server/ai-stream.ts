import { createServerFn } from '@tanstack/react-start'

export const streamTenderAnalysisWithAI = createServerFn({ method: 'POST', strict: false })
  .inputValidator((input: { inviteId: string }) => input)
  .handler(async (ctx) => {
    const { inviteId } = ctx.data as { inviteId: string }
    const { streamTenderAnalysisResponse } = await import('./ai')
    return streamTenderAnalysisResponse(inviteId)
  })
