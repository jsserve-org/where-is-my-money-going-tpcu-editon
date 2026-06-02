import { createFileRoute, Link } from '@tanstack/react-router'
import { useState } from 'react'
import { fetchTenderDetail } from '@/server/tenders'
import { analyzeTenderWithAI } from '@/server/ai'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { Button } from '@/components/ui/button'
import { DetailLoading } from '@/components/detail-loading'

export const Route = createFileRoute('/tender/$inviteId')({
  component: TenderDetailPage,
  loader: async ({ params }) => {
    return await fetchTenderDetail({ data: { inviteId: params.inviteId } })
  },
  pendingComponent: DetailLoading,
})

function TenderDetailPage() {
  const detail = Route.useLoaderData()
  const { inviteId } = Route.useParams()
  const [aiLoading, setAiLoading] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState('')

  const runAiAnalysis = async () => {
    setAiLoading(true)
    setAiAnalysis('')
    try {
      const result = await analyzeTenderWithAI({ data: { inviteId } })
      setAiAnalysis(result.analysis)
    } catch (error) {
      setAiAnalysis(error instanceof Error ? error.message : 'AI analysis failed')
    } finally {
      setAiLoading(false)
    }
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" search={{ invStatus: '2', invKind: '' }}>
          <Button variant="outline">← 返回列表</Button>
        </Link>
        <h1 className="text-2xl font-bold">標案詳細資料</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>AI 得標廠商預測</CardTitle>
        </CardHeader>
        <CardContent>
          <Button onClick={runAiAnalysis} disabled={aiLoading}>
            {aiLoading ? '分析中...' : '用歷史資料預測可能得標廠商'}
          </Button>
          {aiAnalysis && (
            <pre className="mt-4 whitespace-pre-wrap rounded-md border bg-muted p-4 text-sm leading-6">
              {aiAnalysis}
            </pre>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            使用 OpenAI-compatible Chat Completions API；請設定 OPENAI_API_KEY。預測僅供參考，不代表實際結果。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>案號: {detail['標案案號'] || inviteId}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableBody>
                {Object.entries(detail).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium w-1/3 whitespace-nowrap">{key}</TableCell>
                    <TableCell className="break-all">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
