import type { ComponentType } from "react";
import type { AlgorithmParams } from "@/types";

export type AlgorithmParamRow = {
  label: string;
  value: string;
};

export type AlgorithmUI = {
  Form: ComponentType;
  describeParams?: (params: AlgorithmParams) => AlgorithmParamRow[];
};
