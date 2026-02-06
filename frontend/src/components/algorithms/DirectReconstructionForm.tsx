import type { AlgorithmParams } from "@/types";
import type { AlgorithmUI, AlgorithmParamRow } from "./types";
import {
  MrproCommonParamsFields,
  describeMrproCommonParams,
} from "./MrproCommonParams";

// eslint-disable-next-line react-refresh/only-export-components
function DirectReconstructionForm() {
  return (
    <div className="space-y-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-card)]">
      <MrproCommonParamsFields />
    </div>
  );
}

function describeDirectReconstructionParams(
  params: AlgorithmParams
): AlgorithmParamRow[] {
  if (params.algorithm !== "direct_reconstruction") return [];
  return describeMrproCommonParams(params);
}

export const directReconstructionUI: AlgorithmUI = {
  Form: DirectReconstructionForm,
  describeParams: describeDirectReconstructionParams,
};
