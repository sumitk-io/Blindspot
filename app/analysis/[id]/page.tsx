import AnalysisView from "@/components/analysis-view";
import { demoAnalysis } from "@/lib/demo";

export const instant = false;

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return <AnalysisView data={demoAnalysis} analysisId={id} />;
}
