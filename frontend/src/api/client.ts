import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import type {
  Job,
  JobsListResponse,
  AlgorithmsResponse,
  CreateJobResponse,
  VolumeMetadata,
  DownloadFormat,
} from "@/types";

export interface SliceMetadata {
  shape: [number, number];
  dtype: "float32";
  order: string;
  batchIndex: number[];
  orientation: "yx" | "zx" | "zy";
  sliceIndex: number;
}

const API_BASE = "/api";

// Fetch all jobs
async function fetchJobs(): Promise<JobsListResponse> {
  const res = await fetch(`${API_BASE}/jobs`);
  if (!res.ok) throw new Error("Failed to fetch jobs");
  return res.json();
}

// Fetch single job details
async function fetchJob(jobId: string): Promise<Job> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`);
  if (!res.ok) throw new Error("Failed to fetch job");
  return res.json();
}

// Fetch available algorithms
async function fetchAlgorithms(): Promise<AlgorithmsResponse> {
  const res = await fetch(`${API_BASE}/algorithms`);
  if (!res.ok) throw new Error("Failed to fetch algorithms");
  return res.json();
}

// Create a new job
async function createJob(formData: FormData): Promise<CreateJobResponse> {
  const res = await fetch(`${API_BASE}/jobs`, {
    method: "POST",
    body: formData,
  });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to create job");
  }
  return res.json();
}

async function abortJob(jobId: string): Promise<Job> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}/abort`, { method: "POST" });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to abort job");
  }
  return res.json();
}

async function deleteJob(jobId: string): Promise<void> {
  const res = await fetch(`${API_BASE}/jobs/${jobId}`, { method: "DELETE" });
  if (!res.ok) {
    const error = await res.text();
    throw new Error(error || "Failed to delete job");
  }
}

// Fetch 3D volume as Float32Array
export async function fetchVolume(
  jobId: string,
  batchIndices: number[]
): Promise<{ data: Float32Array; metadata: VolumeMetadata }> {
  const batchParam = batchIndices.length > 0 ? batchIndices.join(",") : "";
  const url = `${API_BASE}/jobs/${jobId}/volume${batchParam ? `?batch=${batchParam}` : ""}`;

  const res = await fetch(url);
  if (!res.ok) {
    if (res.status === 409) throw new Error("Job not finished");
    throw new Error("Failed to fetch volume");
  }

  const shapeHeader = res.headers.get("X-Volume-Shape") || "";
  const order = res.headers.get("X-Order") || "C";
  const batchIndexHeader = res.headers.get("X-Batch-Index") || "";

  const buffer = await res.arrayBuffer();
  const data = new Float32Array(buffer);

  const metadata: VolumeMetadata = {
    shape: shapeHeader.split(",").map(Number).filter((n) => !isNaN(n)),
    dtype: "float32",
    order,
    batchIndex: batchIndexHeader
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n)),
  };

  return { data, metadata };
}

export async function fetchSlice(
  jobId: string,
  orientation: "yx" | "zx" | "zy",
  index: number,
  batchIndices: number[],
  signal?: AbortSignal
): Promise<{ data: Float32Array; metadata: SliceMetadata }> {
  const params = new URLSearchParams();
  params.set("orientation", orientation);
  params.set("index", String(index));
  if (batchIndices.length > 0) {
    params.set("batch", batchIndices.join(","));
  }
  const url = `${API_BASE}/jobs/${jobId}/slice?${params.toString()}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    if (res.status === 409) throw new Error("Job not finished");
    throw new Error("Failed to fetch slice");
  }

  const shapeHeader = res.headers.get("X-Slice-Shape") || "";
  const order = res.headers.get("X-Order") || "C";
  const batchIndexHeader = res.headers.get("X-Batch-Index") || "";
  const orientationHeader = (res.headers.get("X-Orientation") || "yx") as
    | "yx"
    | "zx"
    | "zy";
  const sliceIndexHeader = parseInt(res.headers.get("X-Slice-Index") || "0", 10);

  const shape = shapeHeader.split(",").map(Number).filter((n) => !isNaN(n));
  if (shape.length !== 2) {
    throw new Error("Invalid slice shape header");
  }

  const buffer = await res.arrayBuffer();
  const data = new Float32Array(buffer);

  const metadata: SliceMetadata = {
    shape: [shape[0], shape[1]],
    dtype: "float32",
    order,
    batchIndex: batchIndexHeader
      .split(",")
      .map(Number)
      .filter((n) => !isNaN(n)),
    orientation: orientationHeader,
    sliceIndex: Number.isFinite(sliceIndexHeader) ? sliceIndexHeader : index,
  };

  return { data, metadata };
}

export interface WindowStats {
  p01: number;
  p99: number;
}

export async function fetchWindowStats(
  jobId: string,
  batchIndices: number[],
  signal?: AbortSignal
): Promise<WindowStats> {
  const params = new URLSearchParams();
  if (batchIndices.length > 0) {
    params.set("batch", batchIndices.join(","));
  }
  const qs = params.toString();
  const url = `${API_BASE}/jobs/${jobId}/window-stats${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { signal });
  if (!res.ok) {
    throw new Error("Failed to fetch window stats");
  }
  return res.json();
}

// Download result file
export function getDownloadUrl(jobId: string, format: DownloadFormat): string {
  return `${API_BASE}/jobs/${jobId}/download?format=${format}`;
}

// Download original input file
export function getInputDownloadUrl(jobId: string): string {
  return `${API_BASE}/jobs/${jobId}/input`;
}

// React Query hooks

export function useJobs() {
  return useQuery({
    queryKey: ["jobs"],
    queryFn: fetchJobs,
    refetchInterval: 3000, // Poll every 3 seconds
    staleTime: 1000,
  });
}

export function useJob(jobId: string | undefined) {
  return useQuery({
    queryKey: ["job", jobId],
    queryFn: () => fetchJob(jobId!),
    enabled: !!jobId,
    refetchInterval: (query) => {
      // Stop polling when job is in a terminal state
      const status = query.state.data?.status;
      if (status === "finished" || status === "failed" || status === "canceled" || status === "stopped") {
        return false;
      }
      return 2000;
    },
    staleTime: 500,
  });
}

export function useAlgorithms() {
  return useQuery({
    queryKey: ["algorithms"],
    queryFn: fetchAlgorithms,
    staleTime: 60000, // Algorithms don't change often
  });
}

export function useCreateJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createJob,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
    },
  });
}

export function useAbortJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: abortJob,
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });
}

export function useDeleteJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteJob,
    onSuccess: (_data, jobId) => {
      queryClient.invalidateQueries({ queryKey: ["jobs"] });
      queryClient.invalidateQueries({ queryKey: ["job", jobId] });
    },
  });
}
