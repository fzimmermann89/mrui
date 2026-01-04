import type { components } from "./generated";

export type AlgorithmId = components["schemas"]["AlgorithmId"];
export type AlgorithmInfo = components["schemas"]["AlgorithmInfo"];
export type AlgorithmsResponse = components["schemas"]["AlgorithmsResponse"];
export type DownloadFormat = components["schemas"]["DownloadFormat"];
export type CsmAlgorithm = components["schemas"]["CsmAlgorithm"];
export type TrajectoryCalculator = components["schemas"]["TrajectoryCalculator"];
export type Job = components["schemas"]["Job"];
export type JobStatus = components["schemas"]["JobStatus"];
export type JobsListResponse = components["schemas"]["JobsListResponse"];
export type CreateJobResponse = components["schemas"]["CreateJobResponse"];

export type DirectReconstructionParams =
  components["schemas"]["DirectReconstructionParams"];
export type SenseParams = components["schemas"]["SenseParams"];

export type AlgorithmParams =
  | DirectReconstructionParams
  | SenseParams;

export type Orientation = "zy" | "zx" | "yx";

export interface VolumeMetadata {
  shape: number[];
  dtype: string;
  order: string;
  endianness: string;
  batchIndex: number[];
}
