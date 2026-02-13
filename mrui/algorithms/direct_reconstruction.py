from typing import Literal

from mr2.algorithms.reconstruction import DirectReconstruction
from mr2.data import IData, KData

from mrui.algorithms.base import (
    AlgorithmId,
    AlgorithmParamsBase,
    ReconstructionAlgorithm,
    ReconstructionTask,
)

class DirectReconstructionParams(AlgorithmParamsBase):
    algorithm: Literal[AlgorithmId.DIRECT_RECONSTRUCTION] = (
        AlgorithmId.DIRECT_RECONSTRUCTION
    )


class DirectReconstructionAlgorithm(ReconstructionAlgorithm[DirectReconstructionParams]):
    id = AlgorithmId.DIRECT_RECONSTRUCTION
    name = "Direct Reconstruction"
    description = "MRpro direct reconstruction"
    params_model = DirectReconstructionParams

    def run(
        self,
        task: ReconstructionTask,
        kdata: KData,
        params: DirectReconstructionParams,
    ) -> IData:
        reconstruction = DirectReconstruction(kdata, csm=params.csm_algorithm.resolve())
        return reconstruction(kdata)
