from enum import Enum


class CandidateStatus(str, Enum):
    pending = "pending"
    completed = "completed"
    reviewed = "reviewed"
    shortlisted = "shortlisted"
    rejected = "rejected"


class ProcessingStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    done = "done"
    failed = "failed"


class HireSignal(str, Enum):
    strong = "strong"
    likely = "likely"
    weak = "weak"
    not_recommended = "not_recommended"


class IntegrityEventType(str, Enum):
    tab_switch = "tab_switch"
    gaze_deviation = "gaze_deviation"
    copy_paste = "copy_paste"
    off_screen = "off_screen"
    audio_anomaly = "audio_anomaly"
    long_pause = "long_pause"
    screen_inactive = "screen_inactive"


class SeverityLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class RiskLevel(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class QuestionDifficulty(str, Enum):
    easy = "easy"
    medium = "medium"
    hard = "hard"


class QuestionResponseType(str, Enum):
    spoken = "spoken"
    text = "text"
    code = "code"


class PipelineRunStatus(str, Enum):
    queued = "queued"
    running = "running"
    done = "done"
    failed = "failed"


class InterviewTimeMode(str, Enum):
    fixed = "fixed"
    free = "free"
