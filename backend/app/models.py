from pydantic import BaseModel
from typing import Optional, List, Dict

class PresignRequest(BaseModel):
    files: List[Dict]

class EnqueueRequest(BaseModel):
    job_id: str
    input_key: str
    height_cm: Optional[float] = None
