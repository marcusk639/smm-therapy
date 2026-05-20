import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle } from "lucide-react";

type Violation = {
  ruleId: string;
  offendingExcerpt: string;
  explanation: string;
  severity: "critical" | "warning";
  sourceCitation: string;
};

export function ComplianceBadge({
  violations,
  approved,
}: {
  violations: Violation[];
  approved: boolean;
}) {
  if (approved) {
    return (
      <Badge
        variant="outline"
        className="gap-1 border-green-500 text-green-700"
      >
        <CheckCircle className="h-3 w-3" />
        Compliant
      </Badge>
    );
  }

  const hasCritical = violations.some((v) => v.severity === "critical");

  return (
    <Badge variant={hasCritical ? "destructive" : "outline"} className="gap-1">
      <AlertTriangle className="h-3 w-3" />
      {violations.length} violation{violations.length > 1 ? "s" : ""}
    </Badge>
  );
}
