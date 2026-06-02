import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { fetchTenderDetail } from "@/server/tenders";
import { streamTenderAnalysisWithAI } from "@/server/ai-stream";
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

function parseOpenAIStreamChunk(chunk: string) {
  let text = "";
  for (const line of chunk.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5).trim();
    if (!payload || payload === "[DONE]") continue;
    try {
      const json = JSON.parse(payload);
      text += json?.choices?.[0]?.delta?.content || "";
    } catch {
      // Some OpenAI-compatible providers may stream plain text or partial chunks.
    }
  }
  return text;
}

function TenderDetailPage() {
  const detail = Route.useLoaderData();
  const { inviteId } = Route.useParams();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState("");

  const runAiAnalysis = async () => {
    setAiLoading(true);
    setAiAnalysis("");
    try {
      const response = await streamTenderAnalysisWithAI({ data: { inviteId } });
      if (!response.ok || !response.body) {
        setAiAnalysis(await response.text());
        return;
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const result = await reader.read();
        done = result.done;
        if (result.value) {
          const chunk = decoder.decode(result.value, { stream: !done });
          const content = parseOpenAIStreamChunk(chunk);
          if (content) {
            setAiAnalysis((prev) => prev + content);
          }
        }
      }
    } catch (error) {
      setAiAnalysis(
        error instanceof Error ? error.message : "AI analysis failed",
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
        </CardHeader>
        <CardContent>
          <Button onClick={runAiAnalysis} disabled={aiLoading}>
            {aiLoading ? "分析中（串流輸出）..." : "用歷史資料預測可能得標廠商"}
          </Button>
          {aiAnalysis && (
            <div className="prose prose-sm mt-4 max-w-none rounded-md border bg-muted p-4 leading-6 dark:prose-invert">
              <ReactMarkdown>{aiAnalysis}</ReactMarkdown>
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
