import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import {
  checkJobQuestionQuality,
  createJob,
  deleteJob,
  duplicateJob,
  fetchHrJob,
  fetchHrJobs,
  updateJob,
} from "../api/client";
import type {
  InterviewTimeMode,
  JobListItem,
  JobQuestion,
  JobQuestionQualityCheckResult,
  QuestionResponseType,
} from "../types/api";
import { getHrSession } from "../utils/session";

type TemplateFormState = {
  title: string;
  category: string;
  description: string;
  timeMode: InterviewTimeMode;
  questions: JobQuestion[];
};

const emptyForm: TemplateFormState = {
  title: "",
  category: "",
  description: "",
  timeMode: "fixed",
  questions: [
    {
      text: "",
      response_type: "spoken",
      helper_text: "",
      evaluation_focus: "",
      ideal_answer_traits: [],
      red_flag_points: [],
      starter_code: "",
      time_limit_seconds: 120,
      difficulty: "medium",
      weight: 1,
    },
  ],
};

function defaultTimeForType(responseType: QuestionResponseType) {
  return responseType === "spoken" ? 120 : 600;
}

function toLineList(value: string) {
  return value
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function HrTemplatesPage() {
  const navigate = useNavigate();
  const [hrSession] = useState(() => getHrSession());
  const [jobs, setJobs] = useState<JobListItem[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [form, setForm] = useState<TemplateFormState>(emptyForm);
  const [error, setError] = useState("");
  const [qualityChecks, setQualityChecks] = useState<Record<number, JobQuestionQualityCheckResult>>({});

  async function loadJobs() {
    if (!hrSession) {
      return;
    }
    const data = await fetchHrJobs(hrSession.hr_user_id);
    setJobs(data);
  }

  useEffect(() => {
    if (!hrSession) {
      navigate("/hr/login");
      return;
    }
    loadJobs().catch((err) => setError(err.message || "Could not load templates."));
  }, [hrSession, navigate]);

  if (!hrSession) {
    return null;
  }

  const hrUserId = hrSession.hr_user_id;

  function resetForm() {
    setSelectedTemplateId(null);
    setForm(emptyForm);
    setQualityChecks({});
  }

  async function editTemplate(jobId: number) {
    const template = await fetchHrJob(jobId);
    setSelectedTemplateId(jobId);
    setQualityChecks({});
    setForm({
      title: template.title,
      category: template.category,
      description: template.description,
      timeMode: template.time_mode,
      questions: template.questions.map((question) => ({
        text: question.text,
        response_type: question.response_type,
        helper_text: question.helper_text ?? "",
        evaluation_focus: question.evaluation_focus ?? "",
        ideal_answer_traits: question.ideal_answer_traits ?? [],
        red_flag_points: question.red_flag_points ?? [],
        starter_code: question.starter_code ?? "",
        time_limit_seconds: question.time_limit_seconds ?? defaultTimeForType(question.response_type),
        difficulty: question.difficulty,
        weight: question.weight,
      })),
    });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const questions: JobQuestion[] = form.questions
      .map((question) => ({
        ...question,
        text: question.text.trim(),
        helper_text: question.helper_text?.trim() || null,
        evaluation_focus: question.evaluation_focus?.trim() || null,
        ideal_answer_traits: question.ideal_answer_traits ?? [],
        red_flag_points: question.red_flag_points ?? [],
        starter_code: question.starter_code?.trim() || null,
        time_limit_seconds:
          form.timeMode === "fixed"
            ? Number(question.time_limit_seconds || defaultTimeForType(question.response_type))
            : null,
      }))
      .filter((question) => question.text);

    if (!questions.length) {
      setError("Add at least one question to save a template.");
      return;
    }

    const payload = {
      hr_user_id: hrUserId,
      title: form.title,
      category: form.category,
      description: form.description,
      questions,
      time_mode: form.timeMode,
      time_limit_per_question:
        form.timeMode === "fixed" ? Number(questions[0]?.time_limit_seconds || defaultTimeForType("spoken")) : null,
    };

    try {
      if (selectedTemplateId) {
        await updateJob(selectedTemplateId, payload);
      } else {
        await createJob(payload);
      }

      await loadJobs();
      resetForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the template.");
    }
  }

  async function handleDelete(jobId: number) {
    try {
      await deleteJob(jobId);
      await loadJobs();
      if (selectedTemplateId === jobId) {
        resetForm();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete the template.");
    }
  }

  async function handleDuplicate(jobId: number) {
    try {
      await duplicateJob(jobId);
      await loadJobs();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not duplicate the template.");
    }
  }

  async function handleQualityCheck(question: JobQuestion, index: number) {
    try {
      const result = await checkJobQuestionQuality({
        question_text: question.text,
        response_type: question.response_type,
        helper_text: question.helper_text ?? null,
        evaluation_focus: question.evaluation_focus ?? null,
        ideal_answer_traits: question.ideal_answer_traits ?? [],
        red_flag_points: question.red_flag_points ?? [],
      });
      setQualityChecks((current) => ({ ...current, [index]: result }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check question quality.");
    }
  }

  return (
    <div className="dashboard-layout">
      <header className="page-header">
        <div>
          <span className="eyebrow">Jobs</span>
          <h1>Manage jobs and interview templates</h1>
        </div>
        <button className="secondary-button" onClick={resetForm}>
          New job
        </button>
      </header>

      {error ? <p className="status-error">{error}</p> : null}

      <div className="portal-layout">
        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">{selectedTemplateId ? "Edit" : "Create"}</span>
            <h2>{selectedTemplateId ? "Update an existing job template" : "Create a job template"}</h2>
          </div>
          <form className="form-grid" onSubmit={handleSubmit}>
            <label>
              Job title
              <input value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} />
            </label>
            <label>
              Category
              <input value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </label>
            <label className="full-width">
              Job description
              <textarea
                value={form.description}
                onChange={(event) => setForm({ ...form, description: event.target.value })}
              />
            </label>
            <label>
              Time mode
              <select
                value={form.timeMode}
                onChange={(event) => setForm({ ...form, timeMode: event.target.value as InterviewTimeMode })}
              >
                <option value="fixed">Fixed</option>
                <option value="free">Free</option>
              </select>
            </label>
            <div className="full-width question-builder">
              <div className="section-heading compact">
                <span className="eyebrow">Questions</span>
                <h3>Build the interview flow</h3>
              </div>
              <div className="accordion-stack">
                {form.questions.map((question, index) => (
                  <div className="question-editor-card" key={`${index}-${question.response_type}`}>
                    <div className="question-editor-header">
                      <strong>Question {index + 1}</strong>
                      <div className="button-row">
                        <button
                          className="secondary-button small"
                          type="button"
                          onClick={() => void handleQualityCheck(question, index)}
                        >
                          Check quality
                        </button>
                        <button
                          className="secondary-button small"
                          type="button"
                          disabled={form.questions.length === 1}
                          onClick={() =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.filter((_, itemIndex) => itemIndex !== index),
                            }))
                          }
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                    <div className="form-grid">
                      <label className="full-width">
                        Prompt
                        <textarea
                          value={question.text}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, text: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Response type
                        <select
                          value={question.response_type}
                          onChange={(event) => {
                            const responseType = event.target.value as QuestionResponseType;
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? {
                                      ...item,
                                      response_type: responseType,
                                      time_limit_seconds: defaultTimeForType(responseType),
                                    }
                                  : item,
                              ),
                            }));
                          }}
                        >
                          <option value="spoken">Spoken answer</option>
                          <option value="text">Text answer</option>
                          <option value="code">Code answer</option>
                        </select>
                      </label>
                      <label>
                        Timer (seconds)
                        <input
                          disabled={form.timeMode === "free"}
                          value={question.time_limit_seconds ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, time_limit_seconds: Number(event.target.value || 0) }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className="full-width">
                        Extra instructions
                        <textarea
                          value={question.helper_text ?? ""}
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, helper_text: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label className="full-width">
                        Evaluation focus
                        <textarea
                          value={question.evaluation_focus ?? ""}
                          placeholder="What should a strong answer prove?"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index ? { ...item, evaluation_focus: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Ideal answer traits
                        <textarea
                          value={(question.ideal_answer_traits ?? []).join("\n")}
                          placeholder="One strong answer signal per line"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, ideal_answer_traits: toLineList(event.target.value) }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      <label>
                        Red flags
                        <textarea
                          value={(question.red_flag_points ?? []).join("\n")}
                          placeholder="One weak-answer warning per line"
                          onChange={(event) =>
                            setForm((current) => ({
                              ...current,
                              questions: current.questions.map((item, itemIndex) =>
                                itemIndex === index
                                  ? { ...item, red_flag_points: toLineList(event.target.value) }
                                  : item,
                              ),
                            }))
                          }
                        />
                      </label>
                      {question.response_type === "code" ? (
                        <label className="full-width">
                          Starter code or snippet
                          <textarea
                            value={question.starter_code ?? ""}
                            onChange={(event) =>
                              setForm((current) => ({
                                ...current,
                                questions: current.questions.map((item, itemIndex) =>
                                  itemIndex === index ? { ...item, starter_code: event.target.value } : item,
                                ),
                              }))
                            }
                          />
                        </label>
                      ) : null}
                    </div>
                    {qualityChecks[index] ? (
                      <div className="note-card">
                        <strong>
                          Quality check · {qualityChecks[index].rating} · {Math.round(qualityChecks[index].overall_score)}/100
                        </strong>
                        {qualityChecks[index].strengths.map((strength) => (
                          <p key={`${index}-strength-${strength}`}>{strength}</p>
                        ))}
                        {qualityChecks[index].concerns.map((concern) => (
                          <p className="muted-copy" key={`${index}-concern-${concern}`}>{concern}</p>
                        ))}
                        {qualityChecks[index].suggested_rewrite ? (
                          <p className="muted-copy">
                            Suggested rewrite: {qualityChecks[index].suggested_rewrite}
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <button
                className="secondary-button small"
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    questions: [
                      ...current.questions,
                      {
                        text: "",
                        response_type: "spoken",
                        helper_text: "",
                        evaluation_focus: "",
                        ideal_answer_traits: [],
                        red_flag_points: [],
                        starter_code: "",
                        time_limit_seconds: 120,
                        difficulty: "medium",
                        weight: 1,
                      },
                    ],
                  }))
                }
              >
                Add question
              </button>
            </div>
            <button className="primary-button" type="submit">
              {selectedTemplateId ? "Save job changes" : "Create job"}
            </button>
          </form>
        </section>

        <section className="chart-card">
          <div className="section-heading compact">
            <span className="eyebrow">Library</span>
            <h2>View, duplicate, and delete job templates</h2>
          </div>
          <div className="job-card-grid">
            {jobs.map((job) => (
              <div className="note-card" key={job.id}>
                <strong>{job.title}</strong>
                <p>{job.category}</p>
                <p>{job.time_mode === "fixed" ? `${job.time_limit_per_question}s per question` : "Free response mode"}</p>
                <div className="button-row">
                  <button className="secondary-button small" onClick={() => void editTemplate(job.id)}>
                    Edit
                  </button>
                  <button className="secondary-button small" onClick={() => void handleDuplicate(job.id)}>
                    Duplicate
                  </button>
                  <button className="secondary-button small danger-button" onClick={() => void handleDelete(job.id)}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
