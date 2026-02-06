import { Controller, useFormContext } from "react-hook-form";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AlgorithmParamRow } from "./types";
import type { AlgorithmParams, CsmAlgorithm, TrajectoryCalculator } from "@/types";

export function MrproCommonParamsFields() {
  const { control } = useFormContext();

  return (
    <>
      <div className="space-y-1.5">
        <Label>Trajectory Calculator</Label>
        <Controller
          control={control}
          name="params.trajectory_calculator"
          render={({ field }) => (
            <Select
              onValueChange={field.onChange}
              value={(field.value as TrajectoryCalculator | undefined) ?? "ismrmrd"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select trajectory calculator" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ismrmrd">ISMRMRD</SelectItem>
                <SelectItem value="cartesian">Cartesian</SelectItem>
                <SelectItem value="pypulseq">PyPulseq</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Method to calculate k-space trajectory
        </p>
      </div>

      <div className="space-y-1.5">
        <Label>CSM Algorithm</Label>
        <Controller
          control={control}
          name="params.csm_algorithm"
          render={({ field }) => (
            <Select
              onValueChange={field.onChange}
              value={(field.value as CsmAlgorithm | undefined) ?? "walsh"}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select CSM algorithm" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="walsh">Walsh</SelectItem>
                <SelectItem value="inati">Inati</SelectItem>
                <SelectItem value="none">None</SelectItem>
              </SelectContent>
            </Select>
          )}
        />
        <p className="text-xs text-[var(--color-muted-foreground)]">
          Coil Sensitivity Map estimation algorithm
        </p>
      </div>
    </>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function describeMrproCommonParams(params: AlgorithmParams): AlgorithmParamRow[] {
  if (!("trajectory_calculator" in params) || !("csm_algorithm" in params)) {
    return [];
  }
  const rows: AlgorithmParamRow[] = [
    { label: "Trajectory", value: params.trajectory_calculator },
    { label: "CSM Algo", value: params.csm_algorithm },
  ];
  if (params.pulseq_filename) {
    rows.push({ label: "Pulseq File", value: params.pulseq_filename });
  }
  return rows;
}
