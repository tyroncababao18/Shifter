from __future__ import annotations
from dataclasses import dataclass, field
from datetime import date


@dataclass
class MemberState:
    member_id: int
    name: str
    past_count: int
    past_weekend: int
    past_thursday: int
    available_days: int
    weight: float
    monthly_normal: int = 0
    monthly_thursday: int = 0
    monthly_weekend: int = 0
    last_assigned: date | None = None

    @property
    def monthly_sum(self) -> int:
        return self.monthly_normal + self.monthly_thursday + self.monthly_weekend


@dataclass
class ScheduleConfig:
    max_normal: int
    max_thursday: int
    max_weekend: int
    min_gap: int
    lookback_months: int
    fairness_mode: str
    min_shifts: int
    enable_rebalancing: bool
    active_days: set[int] = field(default_factory=lambda: {0, 1, 2, 3, 4, 5, 6})
