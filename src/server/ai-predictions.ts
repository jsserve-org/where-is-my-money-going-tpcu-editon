import { createServerFn } from '@tanstack/react-start'

export type TenderPredictionResult = {
  percent: number
  company: string
  amount: string
  why: string
}

export const predictTenderWinners = createServerFn({ method: 'POST', strict: false })
  .inputValidator((input: { inviteId: string }) => input)
  .handler(async (ctx) => {
    const { inviteId } = ctx.data as { inviteId: string }
    const { predictTenderWinnersJson } = await import('./ai')
    return predictTenderWinnersJson(inviteId)
  })
