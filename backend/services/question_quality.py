import re
from typing import Any


ACTION_MARKERS = (
    "describe",
    "explain",
    "walk me through",
    "tell me about",
    "implement",
    "write",
    "design",
    "debug",
    "compare",
)
CODE_MARKERS = ("code", "function", "algorithm", "sql", "query", "class", "bug", "api")


def assess_question_quality(
    *,
    question_text: str,
    response_type: str,
    helper_text: str | None = None,
    evaluation_focus: str | None = None,
    ideal_answer_traits: list[str] | None = None,
    red_flag_points: list[str] | None = None,
) -> dict[str, Any]:
    text = question_text.strip()
    lowered = text.lower()
    words = re.findall(r"[a-zA-Z0-9']+", lowered)
    helper = (helper_text or "").strip()
    focus = (evaluation_focus or "").strip()
    ideal_traits = [item.strip() for item in (ideal_answer_traits or []) if item.strip()]
    red_flags = [item.strip() for item in (red_flag_points or []) if item.strip()]

    score = 72.0
    strengths: list[str] = []
    concerns: list[str] = []

    if 8 <= len(words) <= 26:
        strengths.append("The prompt is compact enough for candidates to understand quickly.")
        score += 8
    elif len(words) < 8:
        concerns.append("The prompt is very short and may be too vague to score consistently.")
        score -= 16
    else:
        concerns.append("The prompt is long and may be harder for candidates to parse under pressure.")
        score -= 8

    if any(marker in lowered for marker in ACTION_MARKERS):
        strengths.append("The prompt uses a clear action verb that tells the candidate what to do.")
        score += 6
    else:
        concerns.append("The prompt could be clearer about the exact action expected from the candidate.")
        score -= 10

    if lowered.count("?") > 1 or (" and " in lowered and "," in lowered):
        concerns.append("The prompt may be combining multiple asks into one answer window.")
        score -= 10
    else:
        strengths.append("The prompt appears focused on a single evaluable objective.")
        score += 4

    if helper:
        strengths.append("Extra instructions help standardize what a strong answer should include.")
        score += 4
    else:
        concerns.append("No extra instructions are set, so candidates may answer in very different styles.")
        score -= 5

    if focus or ideal_traits or red_flags:
        strengths.append("A scoring focus or rubric is present, which improves reviewer consistency.")
        score += 8
    else:
        concerns.append("There is no explicit rubric yet, so scoring will rely on the general fallback system.")
        score -= 8

    if response_type == "code":
        if any(marker in lowered for marker in CODE_MARKERS):
            strengths.append("The question language matches a code-based response format.")
            score += 6
        else:
            concerns.append("This is marked as a code question, but the wording does not clearly ask for code.")
            score -= 14

    if response_type == "spoken" and any(marker in lowered for marker in CODE_MARKERS):
        concerns.append("This looks technical enough that a code or text response may be a better fit than spoken only.")
        score -= 6

    normalized_score = round(max(0, min(100, score)), 2)
    if normalized_score >= 85:
        rating = "strong"
    elif normalized_score >= 65:
        rating = "workable"
    else:
        rating = "needs_work"

    rewrite_focus = focus or "the specific evidence, reasoning, or examples you want the candidate to use"
    suggested_rewrite = (
        f"{text.rstrip('?')}. In your answer, focus on {rewrite_focus}."
        if text
        else None
    )

    return {
        "overall_score": normalized_score,
        "rating": rating,
        "strengths": strengths[:4],
        "concerns": concerns[:4],
        "suggested_rewrite": suggested_rewrite,
    }
