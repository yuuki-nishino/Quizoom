import { useState } from "react";
import type { AssetId, EventId, QuestionId } from "../../shared/domain-types";
import type { EventDetail, HostApiClient, Question } from "./api-client";
import { validateQuestionForm, resizeOptions, optionCountForFormat } from "./question-validation";
import type { QuestionFormat, QuestionFormOption, QuestionValidationField } from "./question-validation";
import { ConfirmDialog } from "./confirm-dialog";

const FIELD_LABELS: Record<QuestionValidationField, string> = {
  body: "問題文を入力してください",
  options: "選択肢は2〜4個で指定してください",
  correctOption: "正解をちょうど1つ選択してください",
  timeLimitSec: "制限時間は5〜300秒で指定してください",
};

interface FormState {
  readonly body: string;
  readonly explanation: string;
  readonly timeLimitSec: number;
  readonly format: QuestionFormat;
  readonly options: readonly QuestionFormOption[];
  readonly imageAssetId: AssetId | null;
}

function emptyForm(): FormState {
  return {
    body: "",
    explanation: "",
    timeLimitSec: 30,
    format: "two",
    options: [
      { label: "", isCorrect: false },
      { label: "", isCorrect: false },
    ],
    imageAssetId: null,
  };
}

function formFromQuestion(question: Question): FormState {
  const format: QuestionFormat = question.options.length > 2 ? "four" : "two";
  return {
    body: question.body,
    explanation: question.explanation,
    timeLimitSec: question.timeLimitSec,
    format,
    options: question.options.map((o) => ({ label: o.label, isCorrect: o.isCorrect })),
    imageAssetId: question.imageAssetId,
  };
}

export interface QuestionEditorProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  readonly event: EventDetail;
  readonly onEventChange: (event: EventDetail) => void;
}

/** 設問エディタ（要件2.1-2.9）。event.status === "live" の間は全操作を読み取り専用にする */
export function QuestionEditor({ apiClient, eventId, event, onEventChange }: QuestionEditorProps) {
  const readOnly = event.status === "live";
  const [editingId, setEditingId] = useState<QuestionId | "new" | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [errors, setErrors] = useState<readonly QuestionValidationField[]>([]);
  const [serverError, setServerError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Question | null>(null);
  const [uploading, setUploading] = useState(false);

  const questions = [...event.questions].sort((a, b) => a.orderIndex - b.orderIndex);

  function startNew() {
    setForm(emptyForm());
    setErrors([]);
    setServerError(null);
    setEditingId("new");
  }

  function startEdit(question: Question) {
    setForm(formFromQuestion(question));
    setErrors([]);
    setServerError(null);
    setEditingId(question.id);
  }

  function changeFormat(format: QuestionFormat) {
    setForm((prev) => ({ ...prev, format, options: resizeOptions(prev.options, format) }));
  }

  function changeOptionLabel(index: number, label: string) {
    setForm((prev) => ({ ...prev, options: prev.options.map((o, i) => (i === index ? { ...o, label } : o)) }));
  }

  function selectCorrectOption(index: number) {
    setForm((prev) => ({ ...prev, options: prev.options.map((o, i) => ({ ...o, isCorrect: i === index })) }));
  }

  async function handleImageChange(file: File | undefined) {
    if (!file) return;
    setUploading(true);
    const result = await apiClient.uploadMedia(eventId, file);
    setUploading(false);
    if (result.ok) {
      setForm((prev) => ({ ...prev, imageAssetId: result.value.assetId }));
    } else {
      setServerError(result.code);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fields = validateQuestionForm(form);
    setErrors(fields);
    if (fields.length > 0) return;

    const input = {
      body: form.body,
      explanation: form.explanation,
      timeLimitSec: form.timeLimitSec,
      imageAssetId: form.imageAssetId,
      options: form.options,
    };
    const questionId = editingId !== "new" && editingId !== null ? editingId : undefined;
    const result = await apiClient.upsertQuestion(eventId, input, questionId);
    if (!result.ok) {
      if (result.code === "VALIDATION" && result.fields) setErrors(result.fields as QuestionValidationField[]);
      else setServerError(result.code);
      return;
    }

    const nextQuestions = questionId
      ? event.questions.map((q) => (q.id === questionId ? result.value : q))
      : [...event.questions, result.value];
    onEventChange({ ...event, questions: nextQuestions });
    setEditingId(null);
  }

  async function handleDeleteConfirmed() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);
    const result = await apiClient.deleteQuestion(eventId, target.id);
    if (result.ok) {
      onEventChange({ ...event, questions: event.questions.filter((q) => q.id !== target.id) });
    } else {
      setServerError(result.code);
    }
  }

  async function move(question: Question, direction: -1 | 1) {
    const ordered = questions;
    const index = ordered.findIndex((q) => q.id === question.id);
    const swapWith = ordered[index + direction];
    if (!swapWith) return;
    const reordered = [...ordered];
    reordered[index] = swapWith;
    reordered[index + direction] = question;
    const result = await apiClient.reorderQuestions(eventId, reordered.map((q) => q.id));
    if (result.ok) onEventChange({ ...event, questions: result.value });
    else setServerError(result.code);
  }

  return (
    <section aria-label="設問エディタ">
      <h2>設問</h2>
      {readOnly && <p role="status">開催中のため設問は編集できません。外観の変更のみ可能です。</p>}
      {serverError && <p role="alert">エラーが発生しました（{serverError}）。</p>}

      <ol>
        {questions.map((question, index) => (
          <li key={question.id}>
            <span>{question.body}</span>
            <span> ({question.timeLimitSec}秒)</span>
            <button type="button" disabled={readOnly} onClick={() => startEdit(question)}>
              編集
            </button>
            <button type="button" disabled={readOnly || index === 0} onClick={() => move(question, -1)}>
              上へ
            </button>
            <button type="button" disabled={readOnly || index === questions.length - 1} onClick={() => move(question, 1)}>
              下へ
            </button>
            <button type="button" disabled={readOnly} onClick={() => setPendingDelete(question)}>
              削除
            </button>
          </li>
        ))}
      </ol>

      <button type="button" disabled={readOnly} onClick={startNew}>
        設問を追加
      </button>

      {editingId !== null && (
        <form onSubmit={handleSubmit} aria-label="設問フォーム">
          <label>
            問題文
            <textarea value={form.body} onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))} />
          </label>
          {errors.includes("body") && <p role="alert">{FIELD_LABELS.body}</p>}

          <label>
            制限時間（秒）
            <input
              type="number"
              min={5}
              max={300}
              value={form.timeLimitSec}
              onChange={(e) => setForm((prev) => ({ ...prev, timeLimitSec: Number(e.target.value) }))}
            />
          </label>
          {errors.includes("timeLimitSec") && <p role="alert">{FIELD_LABELS.timeLimitSec}</p>}

          <fieldset>
            <legend>選択肢の形式</legend>
            <label>
              <input type="radio" checked={form.format === "two"} onChange={() => changeFormat("two")} />
              二択
            </label>
            <label>
              <input type="radio" checked={form.format === "four"} onChange={() => changeFormat("four")} />
              四択
            </label>
          </fieldset>

          <fieldset>
            <legend>選択肢（正解を1つ選択）</legend>
            {form.options.slice(0, optionCountForFormat(form.format)).map((option, index) => (
              <div key={index}>
                <input type="radio" name="correct-option" checked={option.isCorrect} onChange={() => selectCorrectOption(index)} />
                <input
                  type="text"
                  value={option.label}
                  onChange={(e) => changeOptionLabel(index, e.target.value)}
                  placeholder={`選択肢${index + 1}`}
                />
              </div>
            ))}
          </fieldset>
          {errors.includes("options") && <p role="alert">{FIELD_LABELS.options}</p>}
          {errors.includes("correctOption") && <p role="alert">{FIELD_LABELS.correctOption}</p>}

          <label>
            解説文
            <textarea value={form.explanation} onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))} />
          </label>

          <label>
            画像添付
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleImageChange(e.target.files?.[0])} />
          </label>
          {uploading && <p>アップロード中…</p>}
          {form.imageAssetId && <p>画像を添付しました</p>}

          <button type="submit">保存する</button>
          <button type="button" onClick={() => setEditingId(null)}>
            キャンセル
          </button>
        </form>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="設問を削除しますか？"
          message={`「${pendingDelete.body}」を削除します。この操作は取り消せません。`}
          confirmLabel="削除する"
          onCancel={() => setPendingDelete(null)}
          onConfirm={handleDeleteConfirmed}
        />
      )}
    </section>
  );
}
