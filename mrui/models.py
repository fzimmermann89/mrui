from __future__ import annotations

from datetime import datetime
from typing import Annotated, Protocol, TYPE_CHECKING, TypeAlias, Union

from pydantic import BaseModel, Field

from mrui.algorithms.base import AlgorithmId, DownloadFormat, AlgorithmParamsBase
from mrui.algorithms import list_algorithms
from mrui.job_status import JobStatus


if TYPE_CHECKING:
    class AlgorithmParamsProtocol(Protocol):
        algorithm: AlgorithmId

    AlgorithmParams: TypeAlias = AlgorithmParamsProtocol
else:
    _params_models: tuple[type[AlgorithmParamsBase], ...] = tuple(
        algorithm.params_model for algorithm in list_algorithms()
    )

    AlgorithmParams: TypeAlias = Annotated[
        Union[_params_models],
        Field(discriminator="algorithm"),
    ]


class AlgorithmInfo(BaseModel):
    """Algorithm metadata for the UI."""

    id: AlgorithmId
    name: str
    description: str
    default_params: AlgorithmParams


class AlgorithmsResponse(BaseModel):
    """Available reconstruction algorithms."""

    algorithms: list[AlgorithmInfo]


class Job(BaseModel):
    """Persistent job metadata used by the API."""

    id: str
    name: str
    status: JobStatus
    algorithm: AlgorithmId
    params: AlgorithmParams
    result_shape: list[int] | None
    available_formats: list[DownloadFormat]
    created_at: datetime
    input_filename: str
    result_dataset: str
    input_available: bool = True
    result_available: bool = True
    log_messages: list[str] = Field(default_factory=list)
    error: str | None = None
    queue_task_id: str | None = None
    cancel_requested: bool = False


class JobsListResponse(BaseModel):
    """Jobs list response."""

    jobs: list[Job]


class CreateJobResponse(BaseModel):
    """Job creation response."""

    job: Job
