import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import h5py
import numpy as np
from fastapi import APIRouter, Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, Response
from huey import SqliteHuey
from pydantic import BaseModel
from starlette.middleware.gzip import GZipMiddleware

from pydantic import TypeAdapter

from mrui.algorithms import list_algorithms as list_algorithm_specs
from mrui.algorithms.base import AlgorithmId, AlgorithmParamsBase, DownloadFormat, TrajectoryCalculator
from mrui.deps import get_huey, get_settings
from mrui.job_status import JobStatus
from mrui.jobs import run_reconstruction_job_task
from mrui.models import AlgorithmInfo, AlgorithmParams, AlgorithmsResponse, CreateJobResponse, Job, JobsListResponse
from mrui.settings import Settings
from mrui.storage import (
    delete_job,
    ensure_io_directories,
    list_jobs_from_disk,
    load_job,
    save_job,
)


class HealthResponse(BaseModel):
    status: str




api_router = APIRouter(prefix="/api")


def _annotate_availability(job: Job, settings: Settings) -> Job:
    inputs_dir = Path(settings.inputs_dir)
    results_dir = Path(settings.results_dir)
    input_path = inputs_dir / f"{job.id}_{job.input_filename}"
    result_path = results_dir / f"{job.id}.h5"
    return job.model_copy(
        update={
            "input_available": input_path.exists(),
            "result_available": result_path.exists(),
        }
    )


@api_router.get("/health", response_model=HealthResponse, operation_id="health")
def health() -> HealthResponse:
    return HealthResponse(status="ok")


@api_router.get(
    "/algorithms",
    response_model=AlgorithmsResponse,
    operation_id="list_algorithms",
)
def list_algorithms() -> AlgorithmsResponse:
    algorithms: list[AlgorithmInfo] = []
    for algorithm in list_algorithm_specs():
        default_params: AlgorithmParams = TypeAdapter(AlgorithmParams).validate_python(
            algorithm.params_model().model_dump()
        )
        algorithms.append(
            AlgorithmInfo(
                id=algorithm.id,
                name=algorithm.name,
                description=algorithm.description,
                default_params=default_params,
            )
        )
    return AlgorithmsResponse(algorithms=algorithms)


@api_router.post("/jobs", response_model=CreateJobResponse, operation_id="create_job")
def create_job(
    file: UploadFile = File(...),
    pulseq_file: UploadFile | None = File(None),
    name: str | None = Form(None),
    algorithm: AlgorithmId = Form(AlgorithmId.DIRECT_RECONSTRUCTION),
    params: str | None = Form(None),
    settings: Settings = Depends(get_settings),
) -> CreateJobResponse:
    job_id = str(uuid.uuid4())
    inputs_dir = Path(settings.inputs_dir)
    results_dir = Path(settings.results_dir)
    ensure_io_directories(inputs_dir, results_dir)

    input_filename = Path(file.filename or "upload.bin").name
    job_name = name.strip() if name and name.strip() else Path(input_filename).stem

    input_path = inputs_dir / f"{job_id}_{input_filename}"
    output_path = results_dir / f"{job_id}.h5"

    parsed_params: dict[str, object] = {}
    if params:
        try:
            parsed = json.loads(params)
        except json.JSONDecodeError as exc:
            raise HTTPException(status_code=400, detail="invalid params") from exc
        if not isinstance(parsed, dict):
            raise HTTPException(status_code=400, detail="params must be an object")
        parsed_params = parsed

    parsed_params.setdefault("algorithm", algorithm)
    pulseq_filename: str | None = None
    if pulseq_file is not None:
        pulseq_filename = Path(pulseq_file.filename or "trajectory.seq").name
        parsed_params["pulseq_filename"] = pulseq_filename

    params_model: AlgorithmParams = TypeAdapter(AlgorithmParams).validate_python(
        parsed_params
    )
    if params_model.algorithm != algorithm:
        raise HTTPException(status_code=400, detail="algorithm mismatch")
    if pulseq_file is not None and not isinstance(params_model, AlgorithmParamsBase):
        raise HTTPException(status_code=400, detail="pulseq_file is not supported for this algorithm")
    if (
        isinstance(params_model, AlgorithmParamsBase)
        and params_model.trajectory_calculator == TrajectoryCalculator.PYPULSEQ
        and pulseq_file is None
    ):
        raise HTTPException(status_code=400, detail="pulseq_file is required for pypulseq trajectory")
    if (
        isinstance(params_model, AlgorithmParamsBase)
        and params_model.trajectory_calculator != TrajectoryCalculator.PYPULSEQ
        and pulseq_file is not None
    ):
        raise HTTPException(status_code=400, detail="pulseq_file can only be set with pypulseq trajectory")

    try:
        with input_path.open("wb") as output_handle:
            while chunk := file.file.read(1024 * 1024):
                output_handle.write(chunk)
    finally:
        file.file.close()

    if pulseq_file is not None and pulseq_filename is not None:
        pulseq_path = inputs_dir / f"{job_id}_{pulseq_filename}"
        try:
            with pulseq_path.open("wb") as output_handle:
                while chunk := pulseq_file.file.read(1024 * 1024):
                    output_handle.write(chunk)
        finally:
            pulseq_file.file.close()

    job = Job(
        id=job_id,
        name=job_name,
        status=JobStatus.QUEUED,
        algorithm=algorithm,
        params=params_model,
        result_shape=None,
        available_formats=[
            DownloadFormat.NPY,
            DownloadFormat.NII,
            DownloadFormat.H5,
        ],
        created_at=datetime.now(tz=timezone.utc),
        input_filename=input_filename,
        result_dataset="data",
        input_available=True,
        result_available=False,
        log_messages=[],
    )
    save_job(job, results_dir)

    task = run_reconstruction_job_task(
        job_id=job_id,
        algorithm_id=algorithm.value,
        input_path=str(input_path),
        output_path=str(output_path),
        params_payload=TypeAdapter(AlgorithmParams).dump_python(params_model, mode="json"),
    )
    job = job.model_copy(update={"queue_task_id": task.id})
    save_job(job, results_dir)

    return CreateJobResponse(job=job)


@api_router.get("/jobs", response_model=JobsListResponse, operation_id="list_jobs")
def list_jobs(
    settings: Settings = Depends(get_settings),
    huey: SqliteHuey = Depends(get_huey),
) -> JobsListResponse:
    jobs = list_jobs_from_disk(Path(settings.results_dir))
    updated_jobs: list[Job] = []
    for job in jobs:
        if job.status == JobStatus.QUEUED and job.queue_task_id and huey.is_revoked(job.queue_task_id):
            job = job.model_copy(update={"status": JobStatus.CANCELED, "error": "Aborted by user"})
            save_job(job, Path(settings.results_dir))
        updated_jobs.append(_annotate_availability(job, settings))
    return JobsListResponse(jobs=updated_jobs)


@api_router.get(
    "/jobs/{job_id}",
    response_model=Job,
    operation_id="get_job_detail",
)
def get_job_detail(
    job_id: str,
    settings: Settings = Depends(get_settings),
    huey: SqliteHuey = Depends(get_huey),
) -> Job:
    results_dir = Path(settings.results_dir)
    metadata_path = results_dir / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")

    job = load_job(metadata_path)

    if job.status == JobStatus.QUEUED and job.queue_task_id and huey.is_revoked(job.queue_task_id):
        job = job.model_copy(update={"status": JobStatus.CANCELED, "error": "Aborted by user"})
        save_job(job, results_dir)

    return _annotate_availability(job, settings)


@api_router.get(
    "/jobs/{job_id}/volume",
    response_class=Response,
    operation_id="get_job_volume",
)
def get_job_volume(
    job_id: str,
    batch: str | None = None,
    settings: Settings = Depends(get_settings),
) -> Response:
    metadata_path = Path(settings.results_dir) / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")
    job = load_job(metadata_path)
    if job.status != JobStatus.FINISHED:
        raise HTTPException(status_code=409, detail="job not finished")
    if not job.result_shape:
        raise HTTPException(status_code=404, detail="result metadata missing")

    results_dir = Path(settings.results_dir)
    result_file = results_dir / f"{job_id}.h5"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="result missing")

    batch_dims = job.result_shape[:-3]
    if batch_dims:
        if batch is None:
            batch_indices = [0] * len(batch_dims)
        else:
            parts = [part.strip() for part in batch.split(",") if part.strip()]
            if len(parts) != len(batch_dims):
                raise HTTPException(status_code=400, detail="invalid batch length")
            try:
                batch_indices = [int(part) for part in parts]
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid batch indices") from exc
        for idx, dim in zip(batch_indices, batch_dims, strict=True):
            if idx < 0 or idx >= dim:
                raise HTTPException(status_code=400, detail="batch index out of range")
    else:
        batch_indices = []

    with h5py.File(result_file, "r") as handle:
        dataset = handle[job.result_dataset]
        if not isinstance(dataset, h5py.Dataset):
            raise HTTPException(status_code=404, detail="result dataset missing")
        selection = tuple(batch_indices) + (slice(None), slice(None), slice(None))
        volume = np.asarray(dataset[selection])

    volume = np.ascontiguousarray(volume, dtype=np.float32)

    headers = {
        "X-Volume-Shape": ",".join(str(dim) for dim in volume.shape),
        "X-Dtype": "float32",
        "X-Order": "C",
        "X-Batch-Index": ",".join(str(idx) for idx in batch_indices),
    }
    return Response(
        content=volume.tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )


@api_router.get(
    "/jobs/{job_id}/slice",
    response_class=Response,
    operation_id="get_job_slice",
)
def get_job_slice(
    job_id: str,
    orientation: str,
    index: int,
    batch: str | None = None,
    settings: Settings = Depends(get_settings),
) -> Response:
    metadata_path = Path(settings.results_dir) / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")
    job = load_job(metadata_path)
    if job.status != JobStatus.FINISHED:
        raise HTTPException(status_code=409, detail="job not finished")
    if not job.result_shape:
        raise HTTPException(status_code=404, detail="result metadata missing")

    valid_orientations = {"yx", "zx", "zy"}
    if orientation not in valid_orientations:
        raise HTTPException(status_code=400, detail="invalid orientation")

    batch_dims = job.result_shape[:-3]
    if batch_dims:
        if batch is None:
            batch_indices = [0] * len(batch_dims)
        else:
            parts = [part.strip() for part in batch.split(",") if part.strip()]
            if len(parts) != len(batch_dims):
                raise HTTPException(status_code=400, detail="invalid batch length")
            try:
                batch_indices = [int(part) for part in parts]
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid batch indices") from exc
        for idx, dim in zip(batch_indices, batch_dims, strict=True):
            if idx < 0 or idx >= dim:
                raise HTTPException(status_code=400, detail="batch index out of range")
    else:
        batch_indices = []

    z_size, y_size, x_size = job.result_shape[-3:]
    if orientation == "yx":
        max_index = z_size
    elif orientation == "zx":
        max_index = y_size
    else:
        max_index = x_size

    if index < 0 or index >= max_index:
        raise HTTPException(status_code=400, detail="slice index out of range")

    result_file = Path(settings.results_dir) / f"{job_id}.h5"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="result missing")

    with h5py.File(result_file, "r") as handle:
        dataset = handle[job.result_dataset]
        if not isinstance(dataset, h5py.Dataset):
            raise HTTPException(status_code=404, detail="result dataset missing")

        prefix = tuple(batch_indices)
        if orientation == "yx":
            selection = prefix + (index, slice(None), slice(None))
        elif orientation == "zx":
            selection = prefix + (slice(None), index, slice(None))
        else:
            selection = prefix + (slice(None), slice(None), index)

        slice_data = np.asarray(dataset[selection])

    if slice_data.ndim != 2:
        raise HTTPException(status_code=500, detail="slice extraction failed")

    payload = np.ascontiguousarray(slice_data, dtype=np.float32)

    headers = {
        "X-Slice-Shape": ",".join(str(dim) for dim in payload.shape),
        "X-Dtype": "float32",
        "X-Order": "C",
        "X-Batch-Index": ",".join(str(idx) for idx in batch_indices),
        "X-Orientation": orientation,
        "X-Slice-Index": str(index),
    }

    return Response(
        content=payload.tobytes(order="C"),
        media_type="application/octet-stream",
        headers=headers,
    )


class WindowStatsResponse(BaseModel):
    p01: float
    p99: float


@api_router.get(
    "/jobs/{job_id}/window-stats",
    response_model=WindowStatsResponse,
    operation_id="get_window_stats",
)
def get_window_stats(
    job_id: str,
    batch: str | None = None,
    settings: Settings = Depends(get_settings),
) -> WindowStatsResponse:
    metadata_path = Path(settings.results_dir) / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")
    job = load_job(metadata_path)
    if job.status != JobStatus.FINISHED:
        raise HTTPException(status_code=409, detail="job not finished")
    if not job.result_shape:
        raise HTTPException(status_code=404, detail="result metadata missing")

    batch_dims = job.result_shape[:-3]
    if batch_dims:
        if batch is None:
            batch_indices = [0] * len(batch_dims)
        else:
            parts = [part.strip() for part in batch.split(",") if part.strip()]
            if len(parts) != len(batch_dims):
                raise HTTPException(status_code=400, detail="invalid batch length")
            try:
                batch_indices = [int(part) for part in parts]
            except ValueError as exc:
                raise HTTPException(status_code=400, detail="invalid batch indices") from exc
        for idx, dim in zip(batch_indices, batch_dims, strict=True):
            if idx < 0 or idx >= dim:
                raise HTTPException(status_code=400, detail="batch index out of range")
    else:
        batch_indices = []

    result_file = Path(settings.results_dir) / f"{job_id}.h5"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="result missing")

    with h5py.File(result_file, "r") as handle:
        dataset = handle[job.result_dataset]
        if not isinstance(dataset, h5py.Dataset):
            raise HTTPException(status_code=404, detail="result dataset missing")
        selection = tuple(batch_indices) + (slice(None), slice(None), slice(None))
        volume = np.asarray(dataset[selection], dtype=np.float32)

    p01, p99 = float(np.percentile(volume, 1)), float(np.percentile(volume, 99))
    return WindowStatsResponse(p01=p01, p99=p99)


@api_router.post(
    "/jobs/{job_id}/abort",
    response_model=Job,
    operation_id="abort_job",
)
def abort_job(
    job_id: str,
    settings: Settings = Depends(get_settings),
    huey: SqliteHuey = Depends(get_huey),
) -> Job:
    results_dir = Path(settings.results_dir)
    metadata_path = results_dir / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")

    job = load_job(metadata_path)
    if job.status in {
        JobStatus.FINISHED,
        JobStatus.FAILED,
        JobStatus.CANCELED,
        JobStatus.STOPPED,
    }:
        raise HTTPException(status_code=409, detail="job is not abortable")

    if job.queue_task_id:
        huey.revoke_by_id(job.queue_task_id, revoke_once=True)

    next_status = JobStatus.CANCELED if job.status == JobStatus.QUEUED else job.status
    job = job.model_copy(update={"status": next_status, "error": "Aborted by user", "cancel_requested": True})
    save_job(job, results_dir)
    return job


@api_router.get(
    "/jobs/{job_id}/download",
    response_class=FileResponse,
    operation_id="download_job_result",
)
def download_job_result(
    job_id: str,
    format: DownloadFormat = DownloadFormat.H5,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    metadata_path = Path(settings.results_dir) / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")
    job = load_job(metadata_path)
    if job.status != JobStatus.FINISHED:
        raise HTTPException(status_code=409, detail="job not finished")

    results_dir = Path(settings.results_dir)
    result_file = results_dir / f"{job_id}.h5"
    if not result_file.exists():
        raise HTTPException(status_code=404, detail="result missing")

    filename = f"{job.name}.{format.value}"
    return FileResponse(
        result_file,
        filename=filename,
        media_type="application/octet-stream",
    )


@api_router.get(
    "/jobs/{job_id}/input",
    response_class=FileResponse,
    operation_id="download_job_input",
)
def download_job_input(
    job_id: str,
    settings: Settings = Depends(get_settings),
) -> FileResponse:
    metadata_path = Path(settings.results_dir) / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")
    job = load_job(metadata_path)
    input_path = Path(settings.inputs_dir) / f"{job_id}_{job.input_filename}"
    if not input_path.exists():
        raise HTTPException(status_code=404, detail="input missing")
    return FileResponse(
        input_path,
        filename=job.input_filename,
        media_type="application/octet-stream",
    )


@api_router.delete(
    "/jobs/{job_id}",
    status_code=204,
    operation_id="delete_job",
)
def delete_job_endpoint(
    job_id: str,
    settings: Settings = Depends(get_settings),
    huey: SqliteHuey = Depends(get_huey),
) -> Response:
    results_dir = Path(settings.results_dir)
    metadata_path = results_dir / f"{job_id}.json"
    if not metadata_path.exists():
        raise HTTPException(status_code=404, detail="job not found")

    job = load_job(metadata_path)
    effective_status = job.status
    if effective_status == JobStatus.QUEUED and job.queue_task_id and huey.is_revoked(job.queue_task_id):
        effective_status = JobStatus.CANCELED
    if effective_status not in {
        JobStatus.FINISHED,
        JobStatus.FAILED,
        JobStatus.CANCELED,
        JobStatus.STOPPED,
    }:
        raise HTTPException(status_code=409, detail="job not deletable")

    delete_job(
        results_dir=results_dir,
        inputs_dir=Path(settings.inputs_dir),
        job_id=job_id,
    )
    return Response(status_code=204)


app = FastAPI(title="mrui")
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.include_router(api_router)
