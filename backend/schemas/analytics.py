from backend.core.enums import HireSignal
from backend.schemas.common import ORMModel


class AnalyticsMetric(ORMModel):
    label: str
    value: float


class HistogramBucket(ORMModel):
    range_label: str
    count: int


class IntegrityFrequency(ORMModel):
    event_type: str
    count: int


class HireSignalBreakdown(ORMModel):
    signal: HireSignal
    count: int


class JobAnalyticsResponse(ORMModel):
    average_scores: list[AnalyticsMetric]
    score_distribution: list[HistogramBucket]
    integrity_flag_frequency: list[IntegrityFrequency]
    hire_signal_breakdown: list[HireSignalBreakdown]
