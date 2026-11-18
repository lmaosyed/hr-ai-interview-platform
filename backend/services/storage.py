import json
from pathlib import Path

import aiofiles
from fastapi import UploadFile

from backend.core.config import get_settings


settings = get_settings()


def ensure_storage_dirs() -> None:
    settings.raw_storage_dir.mkdir(parents=True, exist_ok=True)
    settings.processed_storage_dir.mkdir(parents=True, exist_ok=True)


async def save_upload_file(file: UploadFile, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(destination, "wb") as out_file:
        while chunk := await file.read(1024 * 1024):
            await out_file.write(chunk)
    await file.close()
    return str(destination)


async def save_json(payload: object, destination: Path) -> str:
    destination.parent.mkdir(parents=True, exist_ok=True)
    async with aiofiles.open(destination, "w", encoding="utf-8") as out_file:
        await out_file.write(json.dumps(payload, indent=2))
    return str(destination)


def load_json(path: str | Path) -> object:
    with Path(path).open("r", encoding="utf-8") as file_handle:
        return json.load(file_handle)
