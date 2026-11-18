def check_provider_response(response) -> None:
    if response.status_code in {400, 401, 403}:
        raise ValueError("Gemini rejected the API key or request. Update GEMINI_API_KEY in your local .env and recreate the API and worker containers.")
    if response.status_code == 429:
        raise ValueError("Gemini's free quota is exhausted or rate limited. Wait before retrying this recording.")
    if response.status_code == 404:
        raise ValueError("The configured Gemini model is unavailable. Update GEMINI_MODEL in your local .env.")
    response.raise_for_status()
