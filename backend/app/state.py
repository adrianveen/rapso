from typing import Dict
from datetime import datetime
from pydantic import BaseModel

class Job(BaseModel):
    id: str
    status: str
    created_at: datetime
    input_key: str | None = None
    output_key: str | None = None
    height_cm: float | None = None
    error: str | None = None

JOBS: Dict[str, Job] = {}
