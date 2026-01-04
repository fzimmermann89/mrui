import type { AlgorithmId } from "@/types";
import type { AlgorithmUI } from "./types";
import { directReconstructionUI } from "./DirectReconstructionForm";
import { senseUI } from "./SenseForm";

export const ALGORITHM_UI: Record<AlgorithmId, AlgorithmUI> = {
  direct_reconstruction: directReconstructionUI,
  sense: senseUI,
};
