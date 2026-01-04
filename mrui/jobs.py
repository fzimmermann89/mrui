from __future__ import annotations

from pathlib import Path
import logging
from traceback import format_exception

from pydantic import TypeAdapter

from mrui.job_status import JobStatus
from mrui.models import AlgorithmParams
from mrui.queue import huey

from mrui.algorithms import get_algorithm
from mrui.algorithms.base import AlgorithmId, AlgorithmParamsBase, ReconstructionResult, ReconstructionTask
from mrui.storage import load_job, update_job


class _ListHandler(logging.Handler):
    def __init__(self, messages: list[str]) -> None:
        super().__init__()
        self._messages = messages

    def emit(self, record: logging.LogRecord) -> None:
        self._messages.append(self.format(record))


def run_reconstruction_job(
    *,
    job_id: str | None = None,
    algorithm_id: AlgorithmId,
    input_path: str,
    output_path: str,
    params: AlgorithmParamsBase,
) -> ReconstructionResult:
    """Run a reconstruction algorithm and persist result metadata.

    Parameters
    ----------
    job_id
        Job identifier.
    algorithm_id
        Algorithm identifier.
    input_path
        Input file path.
    output_path
        Output file path.
    params
        Typed algorithm params model.

    Returns
    -------
    Reconstruction result metadata.
    """

    resolved_job_id = job_id or Path(output_path).stem
    algorithm = get_algorithm(algorithm_id)
    task = ReconstructionTask(
        job_id=resolved_job_id,
        input_path=Path(input_path),
        output_path=Path(output_path),
    )
    log_messages: list[str] = []
    handler = _ListHandler(log_messages)
    handler.setFormatter(
        logging.Formatter("%(asctime)s | %(levelname)s | %(name)s | %(message)s")
    )
    logger = logging.getLogger()
    previous_level = logger.level
    logger.addHandler(handler)
    if previous_level > logging.INFO:
        logger.setLevel(logging.INFO)
    try:
        result = algorithm(task=task, params=params)
    except Exception as exc:
        update_job(
            results_dir=Path(output_path).parent,
            job_id=resolved_job_id,
            status=JobStatus.FAILED,
            error="".join(format_exception(exc)),
            log_messages=log_messages,
        )
        raise
    finally:
        logger.removeHandler(handler)
        logger.setLevel(previous_level)

    stored_job = load_job(Path(output_path).parent / f"{resolved_job_id}.json")
    if stored_job.cancel_requested:
        update_job(
            results_dir=Path(output_path).parent,
            job_id=resolved_job_id,
            status=JobStatus.STOPPED,
            error="Aborted by user",
            log_messages=log_messages,
        )
        return result

    update_job(
        results_dir=Path(output_path).parent,
        job_id=resolved_job_id,
        status=JobStatus.FINISHED,
        result_shape=result.result_shape,
        result_dataset=result.result_dataset,
        error=None,
        log_messages=log_messages,
    )
    return result


@huey.task(context=True)
def run_reconstruction_job_task(
    *,
    job_id: str,
    algorithm_id: str,
    input_path: str,
    output_path: str,
    params_payload: dict[str, object],
    task: object | None = None,
) -> None:
    output_parent = Path(output_path).parent
    job = load_job(output_parent / f"{job_id}.json")
    if job.cancel_requested:
        update_job(
            results_dir=output_parent,
            job_id=job_id,
            status=JobStatus.CANCELED,
            error="Aborted by user",
        )
        return

    queue_task_id = getattr(task, "id", None)
    update_job(
        results_dir=output_parent,
        job_id=job_id,
        status=JobStatus.STARTED,
        queue_task_id=queue_task_id,
    )

    params_model = TypeAdapter(AlgorithmParams).validate_python(params_payload)
    if not isinstance(params_model, AlgorithmParamsBase):
        raise TypeError("invalid params payload")

    run_reconstruction_job(
        job_id=job_id,
        algorithm_id=AlgorithmId(algorithm_id),
        input_path=input_path,
        output_path=output_path,
        params=params_model,
    )
