"""Algorithm registry and implementations."""

from __future__ import annotations

from typing import Any

from mrui.algorithms.base import AlgorithmId, ReconstructionAlgorithm
from mrui.algorithms.direct_reconstruction import DirectReconstructionAlgorithm
from mrui.algorithms.sense import SenseAlgorithm

ALGORITHMS: tuple[ReconstructionAlgorithm[Any], ...] = (
    DirectReconstructionAlgorithm(),
    SenseAlgorithm(),
)

_ALGORITHMS_BY_ID: dict[AlgorithmId, ReconstructionAlgorithm[Any]] = {
    algorithm.id: algorithm for algorithm in ALGORITHMS
}


def list_algorithms() -> tuple[ReconstructionAlgorithm[Any], ...]:
    return ALGORITHMS


def get_algorithm(algorithm_id: AlgorithmId) -> ReconstructionAlgorithm[Any]:
    return _ALGORITHMS_BY_ID[algorithm_id]


__all__ = ["ALGORITHMS", "get_algorithm", "list_algorithms"]
