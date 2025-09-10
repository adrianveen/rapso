import os
from dotenv import load_dotenv

load_dotenv()

APP_ORIGIN = os.getenv("APP_ORIGIN", os.getenv("SHOPIFY_APP_URL", "http://localhost:3000"))
USE_S3 = os.getenv("USE_S3", "false").lower() in ("1", "true", "yes")
S3_BUCKET = os.getenv("S3_BUCKET")
S3_ENDPOINT = os.getenv("S3_ENDPOINT")
S3_ACCESS_KEY = os.getenv("S3_ACCESS_KEY")
S3_SECRET_KEY = os.getenv("S3_SECRET_KEY")
S3_REGION = os.getenv("S3_REGION", "auto")
WORKER_URL = os.getenv("WORKER_URL")
BACKEND_INTERNAL_URL = os.getenv("BACKEND_INTERNAL_URL", "http://backend:8000")
APP_CALLBACK_URL = os.getenv("APP_CALLBACK_URL")
MODEL_CALLBACK_SECRET = os.getenv("MODEL_CALLBACK_SECRET")
MODEL_PROVIDER = os.getenv("MODEL_PROVIDER", "smplx_icon")
STATIC_DIR = os.getenv("STATIC_DIR") or os.path.join(os.getcwd(), "data")
