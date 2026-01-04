import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { useForm, FormProvider } from "react-hook-form";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAlgorithms, useCreateJob } from "@/api/client";
import { cn } from "@/lib/utils";
import { ALGORITHM_UI } from "@/components/algorithms/registry";
import type {
  AlgorithmId,
  AlgorithmInfo,
  AlgorithmParams,
} from "@/types";

interface FormValues {
  name: string;
  algorithm: AlgorithmId;
  params?: AlgorithmParams;
}

interface NewJobFormProps {
  onSuccess: (jobId: string) => void;
}

function isPulseqSelected(params: AlgorithmParams | undefined): boolean {
  if (!params || !("trajectory_calculator" in params)) return false;
  return params.trajectory_calculator === "pypulseq";
}

function cloneParams(params: AlgorithmParams): AlgorithmParams {
  return structuredClone(params);
}

export function NewJobForm({ onSuccess }: NewJobFormProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pulseqFile, setPulseqFile] = useState<File | null>(null);
  const pulseqFileInputRef = useRef<HTMLInputElement>(null);

  const { data: algorithmsData, isLoading: algorithmsLoading } = useAlgorithms();
  const createJob = useCreateJob();

  const methods = useForm<FormValues>({
    defaultValues: {
      name: "",
      algorithm: "direct_reconstruction",
    },
  });

  const { register, handleSubmit, setValue, getValues, watch } = methods;

  const algorithms: AlgorithmInfo[] = algorithmsData?.algorithms ?? [];
  const algorithmsById = useMemo(
    () => new Map(algorithms.map((alg) => [alg.id, alg])),
    [algorithms]
  );

  const selectedAlgorithm = watch("algorithm");
  const selectedParams = watch("params");
  const algorithmInfo = algorithmsById.get(selectedAlgorithm);
  const algorithmUI = selectedAlgorithm ? ALGORITHM_UI[selectedAlgorithm] : undefined;
  const AlgorithmComponent = algorithmUI?.Form;

  useEffect(() => {
    if (!algorithms.length) return;
    const current = getValues();
    const fallbackAlgorithm = algorithms[0]?.id;
    const desiredAlgorithm = algorithmsById.has(current.algorithm)
      ? current.algorithm
      : fallbackAlgorithm;
    if (!desiredAlgorithm) return;
    const defaultParams = algorithmsById.get(desiredAlgorithm)?.default_params;
    if (!defaultParams) return;
    if (!current.params || current.algorithm !== desiredAlgorithm) {
      setValue("algorithm", desiredAlgorithm, { shouldDirty: false });
      setValue("params", cloneParams(defaultParams), { shouldDirty: false });
    }
  }, [algorithms, algorithmsById, getValues, setValue]);

  useEffect(() => {
    if (isPulseqSelected(selectedParams)) return;
    if (pulseqFile) {
      setPulseqFile(null);
    }
    if (selectedParams && "pulseq_filename" in selectedParams && selectedParams.pulseq_filename) {
      setValue("params.pulseq_filename", null, { shouldDirty: true });
    }
  }, [pulseqFile, selectedParams, setValue]);

  const handleFileChange = useCallback(
    (selectedFile: File | null) => {
      setFile(selectedFile);
      if (selectedFile) {
        const nameWithoutExt = selectedFile.name.replace(/\.[^/.]+$/, "");
        const currentName = watch("name");
        if (!currentName) {
          setValue("name", nameWithoutExt);
        }
      }
    },
    [setValue, watch]
  );

  const handleAlgorithmChange = useCallback(
    (value: AlgorithmId) => {
      setValue("algorithm", value, { shouldDirty: true });
      const defaultParams = algorithmsById.get(value)?.default_params;
      if (defaultParams) {
        setValue("params", cloneParams(defaultParams), { shouldDirty: true });
      }
      setPulseqFile(null);
    },
    [algorithmsById, setValue]
  );

  const handlePulseqFileChange = useCallback(
    (selectedFile: File | null) => {
      setPulseqFile(selectedFile);
      if (selectedFile) {
        setValue("params.pulseq_filename", selectedFile.name, {
          shouldDirty: true,
        });
      } else {
        setValue("params.pulseq_filename", null, { shouldDirty: true });
      }
    },
    [setValue]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile) {
        handleFileChange(droppedFile);
      }
    },
    [handleFileChange]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const onSubmit = async (data: FormValues) => {
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);
    formData.append("algorithm", data.algorithm);
    if (data.name.trim()) {
      formData.append("name", data.name.trim());
    }

    if (
      pulseqFile &&
      isPulseqSelected(data.params)
    ) {
      formData.append("pulseq_file", pulseqFile);
    }

    const fallbackParams = algorithmsById.get(data.algorithm)?.default_params;
    const params = data.params ?? fallbackParams;
    if (!params) return;

    formData.append("params", JSON.stringify(params));

    try {
      const result = await createJob.mutateAsync(formData);
      onSuccess(result.job.id);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="max-w-lg mx-auto p-6">
      <h2 className="text-lg font-semibold mb-6">New Reconstruction Job</h2>

      <FormProvider {...methods}>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          <div className="space-y-1.5">
            <Label htmlFor="name">Name (optional)</Label>
            <Input
              id="name"
              {...register("name")}
              placeholder="Leave empty to use filename"
            />
            <p className="text-xs text-[var(--color-muted-foreground)]">
              Defaults to the uploaded filename
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>ISMRMRD File</Label>
            <div
              onClick={() => fileInputRef.current?.click()}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              className={cn(
                "border-2 border-dashed rounded-[var(--radius-md)] p-6 text-center cursor-pointer transition-colors",
                isDragging
                  ? "border-[var(--color-primary)] bg-[var(--color-muted)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                file && "border-[var(--color-status-finished)]"
              )}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".h5,.ismrmrd"
                onChange={(e) => handleFileChange(e.target.files?.[0] || null)}
                className="hidden"
              />
              <Upload className="h-6 w-6 mx-auto mb-2 text-[var(--color-muted-foreground)]" />
              {file ? (
                <p className="text-sm font-medium">{file.name}</p>
              ) : (
                <p className="text-sm text-[var(--color-muted-foreground)]">
                  Click to upload or drag and drop
                </p>
              )}
              <p className="text-xs text-[var(--color-muted-foreground)] mt-1">
                .h5 or .ismrmrd files
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Algorithm</Label>
            <Select
              value={selectedAlgorithm ?? ""}
              onValueChange={(value) => handleAlgorithmChange(value as AlgorithmId)}
              disabled={algorithmsLoading || algorithms.length === 0}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select algorithm" />
              </SelectTrigger>
              <SelectContent>
                {algorithms.map((alg) => (
                  <SelectItem key={alg.id} value={alg.id}>
                    {alg.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {algorithms.length === 0 && !algorithmsLoading && (
              <p className="text-xs text-[var(--color-muted-foreground)]">
                No algorithms available
              </p>
            )}
          </div>

          <div className="animate-in fade-in slide-in-from-top-2 duration-300">
            {AlgorithmComponent ? (
              <AlgorithmComponent />
            ) : (
              <div className="p-4 bg-[var(--color-muted)] rounded-[var(--radius-md)] text-sm text-[var(--color-muted-foreground)] text-center border border-[var(--color-border)]">
                No UI available for this algorithm.
              </div>
            )}
          </div>

          {isPulseqSelected(selectedParams) && (
              <div className="space-y-1.5 animate-in fade-in slide-in-from-top-2 duration-300">
                <Label>Pulseq Sequence File (.seq)</Label>
                <div
                  onClick={() => pulseqFileInputRef.current?.click()}
                  className={cn(
                    "border-2 border-dashed rounded-[var(--radius-md)] p-6 text-center cursor-pointer transition-colors",
                    "border-[var(--color-border)] hover:border-[var(--color-muted-foreground)]",
                    pulseqFile && "border-[var(--color-status-finished)]"
                  )}
                >
                  <input
                    ref={pulseqFileInputRef}
                    type="file"
                    accept=".seq"
                    onChange={(e) =>
                      handlePulseqFileChange(e.target.files?.[0] || null)
                    }
                    className="hidden"
                  />
                  <Upload className="h-6 w-6 mx-auto mb-2 text-[var(--color-muted-foreground)]" />
                  {pulseqFile ? (
                    <p className="text-sm font-medium">{pulseqFile.name}</p>
                  ) : (
                    <p className="text-sm text-[var(--color-muted-foreground)]">
                      Click to upload .seq file
                    </p>
                  )}
                </div>
              </div>
            )}

          <Button
            type="submit"
            disabled={
              !file ||
              !selectedParams ||
              !algorithmInfo ||
              createJob.isPending ||
              (isPulseqSelected(selectedParams) && !pulseqFile)
            }
            className="w-full"
          >
            {createJob.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Submitting...
              </>
            ) : (
              "Submit Job"
            )}
          </Button>

          {createJob.isError && (
            <p className="text-sm text-[var(--color-destructive)] text-center">
              {createJob.error?.message || "Failed to create job"}
            </p>
          )}
        </form>
      </FormProvider>
    </div>
  );
}
