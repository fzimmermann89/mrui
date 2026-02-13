from __future__ import annotations

import json
from pathlib import Path

from mrui.job_status import JobStatus
from mrui.models import Job


def job_metadata_path(results_dir: Path, job_id: str) -> Path:
    """Return the JSON metadata path for a job."""

    return results_dir / f"{job_id}.json"


def ensure_io_directories(inputs_dir: Path, results_dir: Path) -> None:
    """Ensure inputs and results directories exist."""

    inputs_dir.mkdir(parents=True, exist_ok=True)
    results_dir.mkdir(parents=True, exist_ok=True)


def save_job(job: Job, results_dir: Path) -> None:
    """Persist job metadata to a JSON file.

    Parameters
    ----------
    job
        Job metadata to store.
    results_dir
        Directory for result files.
    """

    results_dir.mkdir(parents=True, exist_ok=True)
    payload = job.model_dump(mode="json")
    job_metadata_path(results_dir, job.id).write_text(
        json.dumps(payload, ensure_ascii=True, indent=2),
        encoding="utf-8",
    )


def load_job(metadata_path: Path) -> Job:
    """Load a job metadata JSON file.

    Parameters
    ----------
    metadata_path
        Path to a job metadata JSON file.

    Returns
    -------
    Parsed job record.
    """

    payload = json.loads(metadata_path.read_text(encoding="utf-8"))
    return Job.model_validate(payload)


def list_jobs_from_disk(results_dir: Path) -> list[Job]:
    """Load all job metadata records from the results directory."""

    if not results_dir.exists():
        return []
    jobs: list[Job] = []
    for metadata_path in results_dir.glob("*.json"):
        try:
            jobs.append(load_job(metadata_path))
        except (ValueError, json.JSONDecodeError, KeyError):
            continue
    return jobs


def update_job(
    *,
    results_dir: Path,
    job_id: str,
    status: JobStatus | None = None,
    result_shape: tuple[int, ...] | None = None,
    error: str | None = None,
    log_messages: list[str] | None = None,
    queue_task_id: str | None = None,
    cancel_requested: bool | None = None,
) -> None:
    """Update stored job metadata fields.

    Parameters
    ----------
    results_dir
        Directory where metadata is stored.
    job_id
        Job identifier.
    status
        Optional status update.
    result_shape
        Optional result shape update.
    """

    metadata_path = job_metadata_path(results_dir, job_id)
    if not metadata_path.exists():
        return
    job = load_job(metadata_path)
    updated = job.model_copy(
        update={
            "status": status or job.status,
            "result_shape": list(result_shape) if result_shape is not None else job.result_shape,
            "error": error if error is not None else job.error,
            "log_messages": log_messages if log_messages is not None else job.log_messages,
            "queue_task_id": queue_task_id if queue_task_id is not None else job.queue_task_id,
            "cancel_requested": cancel_requested
            if cancel_requested is not None
            else job.cancel_requested,
        }
    )
    save_job(updated, results_dir)


def delete_job(
    *,
    results_dir: Path,
    inputs_dir: Path,
    job_id: str,
) -> None:
    """Delete job metadata and associated files."""

    metadata_path = job_metadata_path(results_dir, job_id)
    result_path = results_dir / f"{job_id}.h5"
    metadata_path.unlink(missing_ok=True)
    result_path.unlink(missing_ok=True)
    for input_path in inputs_dir.glob(f"{job_id}_*"):
        input_path.unlink(missing_ok=True)
