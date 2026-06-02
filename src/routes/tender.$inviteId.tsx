import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { fetchTenderDetail } from "@/server/tenders";
import {
  predictTenderWinners,
  type TenderPredictionResult,
} from "@/server/ai-predictions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DetailLoading } from "@/components/detail-loading";

export const Route = createFileRoute("/tender/$inviteId")({
  component: TenderDetailPage,
  loader: async ({ params }) => {
    return await fetchTenderDetail({ data: { inviteId: params.inviteId } });
  },
  pendingComponent: DetailLoading,
});

function TenderDetailPage() {
  const detail = Route.useLoaderData();
  const { inviteId } = Route.useParams();
  const [aiLoading, setAiLoading] = useState(false);
  const [predictions, setPredictions] = useState<TenderPredictionResult[]>([]);
  const [aiError, setAiError] = useState("");

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setPredictions([]);
    setAiError("");
    try {
      const result = await predictTenderWinners({ data: { inviteId } });
      if (!result.ok) {
        setAiError(result.error || "AI prediction failed");
        return;
      }
      if (!result.predictions.length) {
        setAiError("沒有找到足夠相似的歷史標案可供預測。");
        return;
      }
      setPredictions(result.predictions);
    } catch (error) {
      setAiError(
        error instanceof Error ? error.message : "AI prediction failed",
      );
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center gap-4 mb-6">
        <Link to="/" search={{ invStatus: "2", invKind: "" }}>
          <Button variant="outline">← 返回列表</Button>
        </Link>
        <h1 className="text-2xl font-bold">標案詳細資料</h1>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>AI 得標廠商預測</CardTitle>
          <p className="text-black/60 text-sm">資料為 AI 生成的資訊</p>
        </CardHeader>
        <CardContent>
          <Button onClick={runAiAnalysis} disabled={aiLoading}>
            {aiLoading ? "分析中..." : "用歷史資料預測可能得標廠商"}
          </Button>
          {aiError && (
            <div className="mt-4 rounded-md border border-destructive/40 bg-destructive/10 p-4 text-sm text-destructive">
              {aiError}
            </div>
          )}
          {predictions.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-md border">
              <Table>
                <TableBody>
                  <TableRow className="bg-muted hover:bg-muted">
                    <TableCell className="w-16 font-semibold">機率</TableCell>
                    <TableCell className="font-semibold">廠商名稱</TableCell>
                    <TableCell className="w-32 text-right font-semibold">
                      預測原因
                    </TableCell>
                    <TableCell className="w-32 text-right font-mono font-semibold">
                      歷史得標金額
                    </TableCell>
                  </TableRow>
                  {predictions.map((prediction, index) => (
                    <TableRow key={`${prediction.company}-${index}`}>
                      <TableCell className="w-16 font-semibold">
                        {prediction.percent}%
                      </TableCell>
                      <TableCell className="font-medium">
                        {prediction.company}
                      </TableCell>
                      <TableCell className="w-32 text-right">
                        {prediction.why}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-mono">
                        {prediction.amount}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>案號: {detail["標案案號"] || inviteId}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableBody>
                {Object.entries(detail).map(([key, value]) => (
                  <TableRow key={key}>
                    <TableCell className="font-medium w-1/3 whitespace-nowrap">
                      {key}
                    </TableCell>
                    <TableCell className="break-all">{value}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
