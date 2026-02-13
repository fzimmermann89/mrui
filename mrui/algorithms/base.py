from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Callable, Generic, Self, TypeVar

from abc import ABC, abstractmethod

from mr2.data import CsmData, IData, KData
from mr2.data.traj_calculators import (
    KTrajectoryCalculator,
    KTrajectoryCartesian,
    KTrajectoryIsmrmrd,
    KTrajectoryPulseq,
)
from pydantic import BaseModel, ConfigDict
from pydantic import model_validator


class AlgorithmId(str, Enum):
    """Supported reconstruction algorithms."""

    DIRECT_RECONSTRUCTION = "direct_reconstruction"
    SENSE = "sense"


class DownloadFormat(str, Enum):
    """Available download formats."""

    NPY = "npy"
    NII = "nii"
    H5 = "h5"
    DICOM = "dicom"


class TrajectoryCalculator(str, Enum):
    ISMRMRD = "ismrmrd"
    CARTESIAN = "cartesian"
    PYPULSEQ = "pypulseq"

    def resolve(
        self, *, task: "ReconstructionTask", pulseq_filename: str | None
    ) -> KTrajectoryCalculator | KTrajectoryIsmrmrd:
        match self:
            case TrajectoryCalculator.ISMRMRD:
                return KTrajectoryIsmrmrd()
            case TrajectoryCalculator.CARTESIAN:
                return KTrajectoryCartesian()
            case TrajectoryCalculator.PYPULSEQ:
                if not pulseq_filename:
                    raise ValueError(
                        "pulseq_filename must be provided for pypulseq trajectory"
                    )
                pulseq_path = (
                    task.input_path.parent
                    / f"{task.job_id}_{Path(pulseq_filename).name}"
                )
                return KTrajectoryPulseq(pulseq_path)


class CsmAlgorithm(str, Enum):
    WALSH = "walsh"
    INATI = "inati"
    NONE = "none"

    def resolve(self) -> Callable | None:
        match self:
            case CsmAlgorithm.WALSH:
                return CsmData.from_idata_walsh
            case CsmAlgorithm.INATI:
                return CsmData.from_idata_inati
            case CsmAlgorithm.NONE:
                return None


class AlgorithmParamsBase(BaseModel):
    """Base class for algorithm parameter models."""

    model_config = ConfigDict(extra="forbid", frozen=True)
    trajectory_calculator: TrajectoryCalculator = TrajectoryCalculator.ISMRMRD
    pulseq_filename: str | None = None
    csm_algorithm: CsmAlgorithm = CsmAlgorithm.WALSH

    @model_validator(mode="after")
    def validate_pulseq_requirements(self) -> Self:
        if (
            self.trajectory_calculator == TrajectoryCalculator.PYPULSEQ
            and not self.pulseq_filename
        ):
            raise ValueError(
                "pulseq_filename is required when trajectory_calculator is pypulseq"
            )
        if (
            self.trajectory_calculator != TrajectoryCalculator.PYPULSEQ
            and self.pulseq_filename
        ):
            raise ValueError(
                "pulseq_filename is only allowed when trajectory_calculator is pypulseq"
            )
        return self


@dataclass(frozen=True, slots=True)
class ReconstructionTask:
    """Inputs required to run a reconstruction algorithm."""

    job_id: str
    input_path: Path
    output_path: Path


@dataclass(frozen=True, slots=True)
class ReconstructionResult:
    """Result metadata from a reconstruction run."""

    result_shape: tuple[int, ...]
    output_path: Path


ParamsT = TypeVar("ParamsT", bound=AlgorithmParamsBase)


class ReconstructionAlgorithm(ABC, Generic[ParamsT]):
    id: AlgorithmId
    name: str
    description: str
    params_model: type[ParamsT]

    def __call__(
        self,
        task: ReconstructionTask,
        params: AlgorithmParamsBase,
    ) -> ReconstructionResult:
        if not isinstance(params, self.params_model):
            expected_name = self.params_model.__name__
            raise TypeError(
                f"invalid params type for {self.id}: expected {expected_name}"
            )
        trajectory_calculator = params.trajectory_calculator.resolve(
            task=task,
            pulseq_filename=params.pulseq_filename,
        )
        kdata = KData.from_file(task.input_path, trajectory_calculator)
        idata = self.run(task, kdata, params)
        task.output_path.parent.mkdir(parents=True, exist_ok=True)
        idata.save_as_mr2(task.output_path)
        return ReconstructionResult(
            result_shape=tuple(idata.shape),
            output_path=task.output_path,
        )

    @abstractmethod
    def run(self, task: ReconstructionTask, kdata: KData, params: ParamsT) -> IData:
        pass
