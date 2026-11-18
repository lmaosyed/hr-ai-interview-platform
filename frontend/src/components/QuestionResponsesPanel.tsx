import { Fragment, useMemo, useState } from "react";

import type { QuestionResponse, TypedResponse } from "../types/api";

type Props = {
  questions: QuestionResponse[];
  typedResponses?: TypedResponse[];
};

function highlightText(text: string, query: string) {
  if (!query.trim()) {
    return text;
  }
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const parts = text.split(new RegExp(`(${escaped})`, "gi"));
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? <mark key={`${part}-${index}`}>{part}</mark> : <Fragment key={`${part}-${index}`}>{part}</Fragment>,
  );
}

export function QuestionResponsesPanel({ questions, typedResponses = [] }: Props) {
  const hasAiResponses = questions.length > 0;
  const [searchQuery, setSearchQuery] = useState("");

  const filteredQuestions = useMemo(() => {
    if (!searchQuery.trim()) {
      return questions;
    }
    const lowered = searchQuery.toLowerCase();
    return questions.filter((question) =>
      [
        question.question_text,
        question.transcript,
        question.ai_summary,
        ...(question.highlight_moments ?? []).map((item) => item.evidence),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(lowered)),
    );
  }, [questions, searchQuery]);

  return (
    <div className="chart-card">
      <div className="section-heading compact">
        <span className="eyebrow">Per question</span>
        <h3>{hasAiResponses ? "Answer scoring and transcript review" : "Submitted responses"}</h3>
      </div>
      {hasAiResponses ? (
        <label className="note-input">
          <span>Search transcript and highlights</span>
          <input
            value={searchQuery}
            placeholder="Search by phrase, summary, or evidence..."
            onChange={(event) => setSearchQuery(event.target.value)}
          />
        </label>
      ) : null}
      <div className="accordion-stack">
        {hasAiResponses
          ? filteredQuestions.map((question) => (
              <details className="question-accordion" key={question.id}>
                <summary>
                  <div>
                    <strong>{question.question_text}</strong>
                    <p>{question.ai_summary ?? "Awaiting generated summary."}</p>
                    <p className="muted-copy">
                      {question.transcript_start_seconds != null && question.transcript_end_seconds != null
                        ? `${Math.round(question.transcript_start_seconds)}s to ${Math.round(question.transcript_end_seconds)}s`
                        : "Timestamp range unavailable"}
                    </p>
                  </div>
                  <div className="tag-row">
                    <span className="mini-tag">Rel {Math.round(question.relevance_score)}</span>
                    <span className="mini-tag">Depth {Math.round(question.depth_score)}</span>
                    <span className="mini-tag">Comm {Math.round(question.communication_score ?? 0)}</span>
                    <span className="mini-tag">Conf {Math.round(question.confidence_score)}</span>
                  </div>
                </summary>
                {question.score_rationale ? (
                  <div className="notes-stack">
                    <div className="note-card">
                      <strong>Why this question scored this way</strong>
                      <p>{question.score_rationale.overall}</p>
                      <p className="muted-copy">{question.score_rationale.relevance}</p>
                      <p className="muted-copy">{question.score_rationale.depth}</p>
                      <p className="muted-copy">{question.score_rationale.communication}</p>
                    </div>
                  </div>
                ) : null}
                {question.highlight_moments?.length ? (
                  <div className="notes-stack">
                    {question.highlight_moments.map((moment, index) => (
                      <div className="note-card" key={`${question.id}-highlight-${index}`}>
                        <strong>Highlight {moment.label}</strong>
                        <p>{moment.evidence}</p>
                      </div>
                    ))}
                  </div>
                ) : null}
                {question.transcript_timestamps?.length ? (
                  <div className="notes-stack">
                    {question.transcript_timestamps.map((timestamp, index) => (
                      <div className="note-card" key={`${question.id}-ts-${index}`}>
                        <strong>{timestamp.label}</strong>
                        <p>{highlightText(timestamp.text, searchQuery)}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="transcript-block">{highlightText(question.transcript, searchQuery)}</p>
                )}
              </details>
            ))
          : typedResponses.map((response) => (
              <details className="question-accordion" key={`${response.question_index}-${response.question_text}`}>
                <summary>
                  <div>
                    <strong>{response.question_text}</strong>
                    <p>{response.response_type === "code" ? "Coding response" : "Typed response"}</p>
                  </div>
                  <div className="tag-row">
                    <span className="mini-tag">{response.response_type}</span>
                  </div>
                </summary>
                {response.helper_text ? <p className="transcript-block">{response.helper_text}</p> : null}
                {response.starter_code ? <pre className="transcript-block"><code>{response.starter_code}</code></pre> : null}
                <pre className="transcript-block"><code>{response.answer_text}</code></pre>
              </details>
            ))}
        {hasAiResponses && !filteredQuestions.length ? (
          <div className="note-card">
            <strong>No transcript matches</strong>
            <p className="muted-copy">Try another keyword or clear the search to see all question responses.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
