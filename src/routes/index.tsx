import { createFileRoute, Link, useNavigate } from '@tanstack/react-router'
import { useState, useMemo, useEffect } from 'react'
import { fetchTenders, fetchPricesForYears, fetchTenderDetailsBatch } from '@/server/tenders'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { LoadingScreen } from '@/components/loading-screen'

const STATUS_OPTIONS = [
  { value: '1', label: '招標公告' },
  { value: '2', label: '決標公告' },
  { value: '3', label: '無法決標公告' },
]

const KIND_OPTIONS = [
  { value: '', label: '全部招標方式' },
  { value: '1', label: '公開招標' },
  { value: '2', label: '公開取得報價單或企劃書' },
  { value: '3', label: '限制性招標' },
]

function parseAmount(str?: string): number | undefined {
  if (!str) return undefined
  const cleaned = str.replace(/,/g, '').replace(/元/g, '').trim()
  const num = parseFloat(cleaned)
  return isNaN(num) ? undefined : num
}

function parseDate(str?: string): string | undefined {
  if (!str) return undefined
  const cleaned = str.replace(/\//g, '').trim()
  return cleaned.length >= 6 ? cleaned : undefined
}

export const Route = createFileRoute('/')({
  validateSearch: (search: Record<string, unknown>) => ({
    invStatus: String(search.invStatus ?? '2'),
    invKind: String(search.invKind ?? ''),
  }),
  loaderDeps: ({ search }) => ({
    invStatus: search.invStatus,
    invKind: search.invKind,
  }),
  loader: async ({ deps }) => {
    const tenders = await fetchTenders({
      data: {
        invStatus: deps.invStatus,
        invKind: deps.invKind,
      },
    })
    return { tenders, status: deps.invStatus, kind: deps.invKind }
  },
  pendingComponent: LoadingScreen,
  component: Home,
})

function Home() {
  const { tenders, status, kind } = Route.useLoaderData()
  const navigate = useNavigate({ from: '/' })

  // Basic filters
  const [searchText, setSearchText] = useState('')
  const [year, setYear] = useState('')
  const [biddingMethodFilter, setBiddingMethodFilter] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('')

  // Price data (loaded lazily in background)
  const [prices, setPrices] = useState<Record<string, string>>({})
  const [loadingPrices, setLoadingPrices] = useState(false)

  // Price filters (from list data)
  const [minAmount, setMinAmount] = useState('')
  const [maxAmount, setMaxAmount] = useState('')

  // Detail loading
  const [details, setDetails] = useState<Map<string, Record<string, string>>>(new Map())
  const [loadingDetails, setLoadingDetails] = useState(false)
  const [detailProgress, setDetailProgress] = useState(0)

  // Advanced detail filters
  const [minPurchase, setMinPurchase] = useState('')
  const [maxPurchase, setMaxPurchase] = useState('')
  const [minBasePrice, setMinBasePrice] = useState('')
  const [maxBasePrice, setMaxBasePrice] = useState('')
  const [awardDateStart, setAwardDateStart] = useState('')
  const [awardDateEnd, setAwardDateEnd] = useState('')
  const [hasSubsidy, setHasSubsidy] = useState<string>('')

  // Load prices in background after list mounts
  useEffect(() => {
    const years = [...new Set(tenders.map((t: any) => t.year))].filter(Boolean)
    if (years.length === 0) return
    setLoadingPrices(true)
    fetchPricesForYears({ data: { years, invKind: kind } })
      .then((result) => {
        setPrices(result)
      })
      .catch((e) => console.error('Price fetch failed:', e))
      .finally(() => setLoadingPrices(false))
  }, [tenders, kind])

  // Unique values for dropdowns
  const years = useMemo(() => [...new Set(tenders.map((t: any) => t.year))].sort((a: string, b: string) => b.localeCompare(a)), [tenders])
  const biddingMethods = useMemo(() => [...new Set(tenders.map((t: any) => t.biddingMethod))].sort(), [tenders])
  const categories = useMemo(() => [...new Set(tenders.map((t: any) => t.category))].sort(), [tenders])

  const anyDetailFilterActive =
    minPurchase || maxPurchase || minBasePrice || maxBasePrice || awardDateStart || awardDateEnd || hasSubsidy !== ''

  const filtered = useMemo(() => {
    return tenders.filter((t: any) => {
      // Text search
      if (searchText) {
        const q = searchText.toLowerCase()
        const textMatch =
          t.caseNo.toLowerCase().includes(q) ||
          t.name.toLowerCase().includes(q) ||
          t.biddingMethod.includes(q) ||
          t.category.includes(q)
        if (!textMatch) return false
      }

      // Year
      if (year && t.year !== year) return false

      // Bidding method
      if (biddingMethodFilter && t.biddingMethod !== biddingMethodFilter) return false

      // Category
      if (categoryFilter && t.category !== categoryFilter) return false

      // Amount (from list data or lazy prices)
      const amount = parseAmount(prices[t.caseNo] || t.amount)
      if (minAmount && (!amount || amount < parseFloat(minAmount))) return false
      if (maxAmount && (!amount || amount > parseFloat(maxAmount))) return false

      // Detail filters
      const d = details.get(t.inviteId)
      if (!d) {
        if (anyDetailFilterActive) return false
        return true
      }

      const purchase = parseAmount(d['採購金額'])
      if (minPurchase && (!purchase || purchase < parseFloat(minPurchase))) return false
      if (maxPurchase && (!purchase || purchase > parseFloat(maxPurchase))) return false

      const basePrice = parseAmount(d['底價金額'])
      if (minBasePrice && (!basePrice || basePrice < parseFloat(minBasePrice))) return false
      if (maxBasePrice && (!basePrice || basePrice > parseFloat(maxBasePrice))) return false

      const awardDate = parseDate(d['決標公告日期'])
      const startDate = parseDate(awardDateStart)
      const endDate = parseDate(awardDateEnd)
      if (startDate && (!awardDate || awardDate < startDate)) return false
      if (endDate && (!awardDate || awardDate > endDate)) return false

      const subsidy = d['補助機關名稱'] || d['補助金額'] || ''
      const hasSub = subsidy.length > 0
      if (hasSubsidy === 'yes' && !hasSub) return false
      if (hasSubsidy === 'no' && hasSub) return false

      return true
    })
  }, [tenders, searchText, year, biddingMethodFilter, categoryFilter, prices, minAmount, maxAmount, details, minPurchase, maxPurchase, minBasePrice, maxBasePrice, awardDateStart, awardDateEnd, hasSubsidy, anyDetailFilterActive])

  const currentStatusLabel = STATUS_OPTIONS.find((s) => s.value === status)?.label || '決標公告'

  const loadDetails = async () => {
    setLoadingDetails(true)
    setDetailProgress(0)
    const inviteIds = tenders.map((t: any) => t.inviteId).filter(Boolean)
    const newDetails = new Map(details)

    const batchSize = 10
    for (let i = 0; i < inviteIds.length; i += batchSize) {
      const batch = inviteIds.slice(i, i + batchSize)
      try {
        const batchResults = await fetchTenderDetailsBatch({ data: { inviteIds: batch } })
        for (const [id, detail] of Object.entries(batchResults)) {
          newDetails.set(id, detail)
        }
        setDetailProgress(Math.min(100, Math.round(((i + batch.length) / inviteIds.length) * 100)))
      } catch (e) {
        console.error('Batch fetch failed:', e)
      }
    }

    setDetails(newDetails)
    setLoadingDetails(false)
  }

  const formatAmount = (val?: string) => {
    if (!val) return '-'
    const num = parseAmount(val)
    if (num === undefined) return val
    return num.toLocaleString('zh-TW')
  }

  return (
    <div className="container mx-auto py-8 px-4">
      <h1 className="text-3xl font-bold mb-6">臺北城市科技大學 {currentStatusLabel}查詢</h1>

      {/* Report type tabs */}
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_OPTIONS.map((opt) => (
          <Button
            key={opt.value}
            variant={status === opt.value ? 'default' : 'outline'}
            onClick={() =>
              navigate({
                search: (prev: any) => ({ ...prev, invStatus: opt.value }),
                replace: true,
              })
            }
          >
            {opt.label}
          </Button>
        ))}
      </div>

      {/* Bidding method kind */}
      <div className="mb-6">
        <label className="text-sm font-medium mr-2">招標方式</label>
        <select
          className="border rounded-md px-3 py-2 text-sm bg-background"
          value={kind}
          onChange={(e) =>
            navigate({
              search: (prev: any) => ({ ...prev, invKind: e.target.value }),
              replace: true,
            })
          }
        >
          {KIND_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>篩選條件</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div>
              <label className="text-sm font-medium block mb-1">文字搜尋</label>
              <Input
                placeholder="案號、名稱..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">年份</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">全部</option>
                {years.map((y: string) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">招標方式</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={biddingMethodFilter}
                onChange={(e) => setBiddingMethodFilter(e.target.value)}
              >
                <option value="">全部</option>
                {biddingMethods.map((m: string) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">標的分類</label>
              <select
                className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="">全部</option>
                {categories.map((c: string) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">金額 (最低)</label>
              <Input
                placeholder="例: 100000"
                value={minAmount}
                onChange={(e) => setMinAmount(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium block mb-1">金額 (最高)</label>
              <Input
                placeholder="例: 500000"
                value={maxAmount}
                onChange={(e) => setMaxAmount(e.target.value)}
              />
            </div>
          </div>

          {/* Detail filters */}
          {details.size > 0 && (
            <div className="mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="text-sm font-medium block mb-1">採購金額 (最低)</label>
                <Input placeholder="例: 100000" value={minPurchase} onChange={(e) => setMinPurchase(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">採購金額 (最高)</label>
                <Input placeholder="例: 500000" value={maxPurchase} onChange={(e) => setMaxPurchase(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">底價金額 (最低)</label>
                <Input placeholder="例: 100000" value={minBasePrice} onChange={(e) => setMinBasePrice(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">底價金額 (最高)</label>
                <Input placeholder="例: 500000" value={maxBasePrice} onChange={(e) => setMaxBasePrice(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">決標公告日期 (起)</label>
                <Input placeholder="例: 115/01/01" value={awardDateStart} onChange={(e) => setAwardDateStart(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">決標公告日期 (迄)</label>
                <Input placeholder="例: 115/12/31" value={awardDateEnd} onChange={(e) => setAwardDateEnd(e.target.value)} />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1">補助金額</label>
                <select
                  className="w-full border rounded-md px-3 py-2 text-sm bg-background"
                  value={hasSubsidy}
                  onChange={(e) => setHasSubsidy(e.target.value)}
                >
                  <option value="">全部</option>
                  <option value="yes">有補助</option>
                  <option value="no">無補助</option>
                </select>
              </div>
            </div>
          )}

          {/* Load details button */}
          {details.size === 0 && (
            <div className="mt-4">
              <Button onClick={loadDetails} disabled={loadingDetails}>
                {loadingDetails ? '載入中...' : '載入詳細資料以啟用進階篩選'}
              </Button>
              {loadingDetails && (
                <div className="mt-2 flex items-center gap-3">
                  <Skeleton className="h-2 w-48" />
                  <span className="text-sm text-muted-foreground">{detailProgress}%</span>
                </div>
              )}
            </div>
          )}

          <p className="text-sm text-muted-foreground mt-4">
            共 {tenders.length} 筆資料，顯示 {filtered.length} 筆
            {loadingPrices && '（金額資料載入中...）'}
            {details.size > 0 && `（已載入 ${details.size} 筆詳細資料）`}
          </p>
        </CardContent>
      </Card>

      {/* Results table */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>標案案號</TableHead>
                <TableHead>標案名稱</TableHead>
                <TableHead>公告次數</TableHead>
                <TableHead>招標方式</TableHead>
                <TableHead>標的分類</TableHead>
                <TableHead>公告日期</TableHead>
                <TableHead className="text-right">
                  金額 {loadingPrices && <span className="text-xs text-muted-foreground">載入中...</span>}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((tender: any) => (
                <TableRow key={tender.caseNo + tender.inviteId}>
                  <TableCell className="font-medium whitespace-nowrap">{tender.caseNo}</TableCell>
                  <TableCell>
                    <Link
                      to="/tender/$inviteId"
                      params={{ inviteId: tender.inviteId }}
                      className="text-primary hover:underline"
                    >
                      {tender.name}
                    </Link>
                  </TableCell>
                  <TableCell>{tender.announcementCount}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{tender.biddingMethod}</Badge>
                  </TableCell>
                  <TableCell>{tender.category}</TableCell>
                  <TableCell className="whitespace-nowrap">{tender.announcementDate}</TableCell>
                  <TableCell className="text-right whitespace-nowrap">
                    {loadingPrices && !prices[tender.caseNo] ? (
                      <Skeleton className="h-4 w-20 ml-auto" />
                    ) : (
                      formatAmount(prices[tender.caseNo])
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
