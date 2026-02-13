from typing import Literal

from mr2.algorithms.reconstruction import RegularizedIterativeSENSEReconstruction
from mr2.data import IData, KData

from mrui.algorithms.base import (
    AlgorithmId,
    AlgorithmParamsBase,
    ReconstructionAlgorithm,
    ReconstructionTask,
)

class SenseParams(AlgorithmParamsBase):
    algorithm: Literal[AlgorithmId.SENSE] = AlgorithmId.SENSE
    regularization: float = 0.01
    iterations: int = 10


class SenseAlgorithm(ReconstructionAlgorithm[SenseParams]):
    id = AlgorithmId.SENSE
    name = "Iterative SENSE"
    description = "MRpro iterative SENSE reconstruction"
    params_model = SenseParams

    def run(self, task: ReconstructionTask, kdata: KData, params: SenseParams) -> IData:
        reconstruction = RegularizedIterativeSENSEReconstruction(
            kdata,
            csm=params.csm_algorithm.resolve(),
            n_iterations=params.iterations,
            regularization_weight=params.regularization,
        )
        return reconstruction(kdata)
