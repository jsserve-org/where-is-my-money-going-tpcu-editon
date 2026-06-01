import { createFileRoute, Link } from '@tanstack/react-router'
import { fetchTenderDetail } from '@/server/tenders'
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

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" search={{ invStatus: '2', invKind: '' }}>
          <Button variant="outline">← 返回列表</Button>
        </Link>
        <h1 className="text-2xl font-bold">標案詳細資料</h1>
      </div>

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
