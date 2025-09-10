import os
import boto3
from botocore.client import Config
from .config import USE_S3, S3_BUCKET, S3_ACCESS_KEY, S3_SECRET_KEY, S3_ENDPOINT, S3_REGION, STATIC_DIR

os.makedirs(STATIC_DIR, exist_ok=True)

_s3 = None
if USE_S3 and S3_BUCKET and S3_ACCESS_KEY and S3_SECRET_KEY and S3_ENDPOINT:
    _s3 = boto3.client(
        "s3",
        endpoint_url=S3_ENDPOINT,
        aws_access_key_id=S3_ACCESS_KEY,
        aws_secret_access_key=S3_SECRET_KEY,
        region_name=S3_REGION,
        config=Config(signature_version="s3v4"),
    )

def make_key(*parts: str) -> str:
    return "/".join([p.strip("/") for p in parts])

def put_object(key: str, data: bytes, content_type: str) -> str:
    if _s3:
        _s3.put_object(Bucket=S3_BUCKET, Key=key, Body=data, ContentType=content_type)
        return f"s3://{S3_BUCKET}/{key}"
    path = os.path.join(STATIC_DIR, key)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
    return f"local://{path}"

def presign_url(key: str, expires: int = 3600):
    if _s3:
        return _s3.generate_presigned_url(
            ClientMethod="get_object",
            Params={"Bucket": S3_BUCKET, "Key": key},
            ExpiresIn=expires,
        )
    path = os.path.join(STATIC_DIR, key)
    return f"/assets/{key}" if os.path.exists(path) else None
