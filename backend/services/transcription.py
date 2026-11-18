import base64
import json
from pathlib import Path
from typing import Any

import httpx
from openai import OpenAI

from backend.core.config import get_settings


settings = get_settings()


def _has_real_key(api_key: str | None) -> bool:
    if not api_key:
        return False
    normalized = api_key.strip()
    if not normalized:
        return False
    return not normalized.lower().startswith("your_")


def _guess_audio_mime_type(audio_path: str | Path) -> str:
    suffix = Path(audio_path).suffix.lower()
    if suffix == ".mp3":
        return "audio/mpeg"
    if suffix == ".wav":
        return "audio/wav"
    if suffix == ".ogg":
        return "audio/ogg"
    if suffix == ".m4a":
        return "audio/mp4"
    return "audio/webm"


class TranscriptionService:
    def __init__(self) -> None:
        self.openai_client = OpenAI(api_key=settings.openai_api_key) if _has_real_key(settings.openai_api_key) else None
        self.gemini_api_key = settings.gemini_api_key if _has_real_key(settings.gemini_api_key) else None

    @property
    def provider_name(self) -> str:
        if settings.demo_mode:
            return "demo"

        configured = (settings.transcription_provider or "demo").strip().lower()
        if configured == "openai" and self.openai_client:
            return "openai"
        if configured == "gemini" and self.gemini_api_key:
            return "gemini"
        if configured == "auto":
            if self.openai_client:
                return "openai"
            if self.gemini_api_key:
                return "gemini"
        if configured == "demo" and self.gemini_api_key:
            return "gemini"
        return "demo"

    @property
    def live_transcription_available(self) -> bool:
        return self.provider_name in {"openai", "gemini"}

    def _transcribe_with_openai(self, audio_path: str | Path) -> dict[str, Any]:
        with Path(audio_path).open("rb") as audio_file:
            response = self.openai_client.audio.transcriptions.create(
                model=settings.whisper_model,
                file=audio_file,
                response_format="verbose_json",
            )
        return json.loads(response.model_dump_json())

    def _transcribe_with_gemini(self, audio_path: str | Path) -> dict[str, Any]:
        audio_bytes = Path(audio_path).read_bytes()
        payload = {
            "contents": [
                {
                    "parts": [
                        {
                            "text": (
                                "Generate a verbatim transcript of the speech in this audio. "
                                "Respond only in JSON with the shape "
                                '{"text":"<transcript>"}'
                            )
                        },
                        {
                            "inline_data": {
                                "mime_type": _guess_audio_mime_type(audio_path),
                                "data": base64.b64encode(audio_bytes).decode("utf-8"),
                            }
                        },
                    ]
                }
            ],
            "generationConfig": {
                "temperature": 0,
                "responseMimeType": "application/json",
            },
        }
        endpoint = (
            f"https://generativelanguage.googleapis.com/v1beta/models/"
            f"{settings.gemini_model}:generateContent"
        )
        with httpx.Client(timeout=90.0) as client:
            response = client.post(
                endpoint,
                headers={
                    "x-goog-api-key": self.gemini_api_key or "",
                    "Content-Type": "application/json",
                },
                json=payload,
            )
            from backend.services.provider_errors import check_provider_response
            check_provider_response(response)
            data = response.json()

        candidates = data.get("candidates", [])
        if not candidates:
            return {"text": "", "words": []}
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(str(part.get("text", "")) for part in parts).strip()
        if not text:
            return {"text": "", "words": []}
        try:
            parsed = json.loads(text)
            transcript_text = str(parsed.get("text", "")).strip()
        except json.JSONDecodeError:
            transcript_text = text
        return {
            "text": transcript_text,
            "words": [],
        }

    def transcribe(self, audio_path: str | Path) -> dict[str, Any]:
        import subprocess
        from backend.services.audio import audio_activity
        duration = float(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", str(audio_path),
        ], timeout=30))
        metrics = audio_activity(audio_path, duration)
        if metrics["speech_seconds"] < 0.5 or metrics["silence_ratio"] >= 0.98:
            return {"text": "", "words": [], "audio_metrics": metrics}
        provider = self.provider_name
        if provider == "openai" and self.openai_client:
            return self._transcribe_with_openai(audio_path)
        if provider == "gemini" and self.gemini_api_key:
            return self._transcribe_with_gemini(audio_path)
        raise ValueError("Real transcription is unavailable. Configure Gemini transcription and disable demo mode.")
