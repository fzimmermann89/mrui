import { useFormContext } from "react-hook-form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AlgorithmParams } from "@/types";
import type { AlgorithmUI, AlgorithmParamRow } from "./types";
import { MrproCommonParamsFields, describeMrproCommonParams } from "./MrproCommonParams";

// eslint-disable-next-line react-refresh/only-export-components
function SenseForm() {
  const { register } = useFormContext();

  return (
    <div className="space-y-4 p-4 border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-card)]">
      <MrproCommonParamsFields />

      {/* <div className="space-y-1.5">
        <Label htmlFor="regularization">Regularization</Label>
        <Input
          id="regularization"
          type="number"
          step="0.0001"
          {...register("params.regularization", { valueAsNumber: true })}
          placeholder="e.g. 0.01"
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Tikhonov regularization parameter (lambda)
        </p>
      </div> */}

      <div className="space-y-1.5">
        <Label htmlFor="iterations">Iterations</Label>
        <Input
          id="iterations"
          type="number"
          min={1}
          step={1}
          {...register("params.iterations", { valueAsNumber: true })}
          placeholder="e.g. 10"
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Number of reconstruction iterations
        </p>
      </div>
    </div>
  );
}

function describeSenseParams(params: AlgorithmParams): AlgorithmParamRow[] {
  if (params.algorithm !== "sense") return [];
  return [
    ...describeMrproCommonParams(params),
    // { label: "Regularization", value: `${params.regularization}` },
    { label: "Iterations", value: `${params.iterations}` },
  ];
}

export const senseUI: AlgorithmUI = {
  Form: SenseForm,
  describeParams: describeSenseParams,
};
