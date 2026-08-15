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

  const inputClass =
    "mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-base text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200";
  const fieldErrorClass = "mt-1 text-sm text-red-700";
  const secondaryButtonClass = "rounded-md border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <section aria-label="設問エディタ">
      <h2 className="text-lg font-semibold text-slate-900">設問</h2>
      {readOnly && (
        <p role="status" className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          開催中のため設問は編集できません。外観の変更のみ可能です。
        </p>
      )}
      {serverError && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          エラーが発生しました（{serverError}）。
        </p>
      )}

      <ol className="mt-4 space-y-2">
        {questions.map((question, index) => (
          <li
            key={question.id}
            className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <span className="font-medium text-slate-900">{question.body}</span>
            <span className="text-sm text-slate-500">({question.timeLimitSec}秒)</span>
            <div className="ml-auto flex gap-2">
              <button type="button" disabled={readOnly} onClick={() => startEdit(question)} className={secondaryButtonClass}>
                編集
              </button>
              <button type="button" disabled={readOnly || index === 0} onClick={() => move(question, -1)} className={secondaryButtonClass}>
                上へ
              </button>
              <button
                type="button"
                disabled={readOnly || index === questions.length - 1}
                onClick={() => move(question, 1)}
                className={secondaryButtonClass}
              >
                下へ
              </button>
              <button
                type="button"
                disabled={readOnly}
                onClick={() => setPendingDelete(question)}
                className="rounded-md border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                削除
              </button>
            </div>
          </li>
        ))}
      </ol>

      <button
        type="button"
        disabled={readOnly}
        onClick={startNew}
        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        設問を追加
      </button>

      {editingId !== null && (
        <form onSubmit={handleSubmit} aria-label="設問フォーム" className="mt-4 space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <label className="block text-sm font-medium text-slate-700">
            問題文
            <textarea
              value={form.body}
              onChange={(e) => setForm((prev) => ({ ...prev, body: e.target.value }))}
              className={`${inputClass} min-h-20`}
            />
          </label>
          {errors.includes("body") && <p role="alert" className={fieldErrorClass}>{FIELD_LABELS.body}</p>}

          <label className="block text-sm font-medium text-slate-700">
            制限時間（秒）
            <input
              type="number"
              min={5}
              max={300}
              value={form.timeLimitSec}
              onChange={(e) => setForm((prev) => ({ ...prev, timeLimitSec: Number(e.target.value) }))}
              className={`${inputClass} w-32`}
            />
          </label>
          {errors.includes("timeLimitSec") && <p role="alert" className={fieldErrorClass}>{FIELD_LABELS.timeLimitSec}</p>}

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">選択肢の形式</legend>
            <div className="mt-1 flex gap-4">
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" checked={form.format === "two"} onChange={() => changeFormat("two")} />
                二択
              </label>
              <label className="flex items-center gap-1.5 text-sm text-slate-700">
                <input type="radio" checked={form.format === "four"} onChange={() => changeFormat("four")} />
                四択
              </label>
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-slate-700">選択肢（正解を1つ選択）</legend>
            <div className="mt-1 space-y-2">
              {form.options.slice(0, optionCountForFormat(form.format)).map((option, index) => (
                <div key={index} className="flex items-center gap-2">
                  <input type="radio" name="correct-option" checked={option.isCorrect} onChange={() => selectCorrectOption(index)} />
                  <input
                    type="text"
                    value={option.label}
                    onChange={(e) => changeOptionLabel(index, e.target.value)}
                    placeholder={`選択肢${index + 1}`}
                    className={`${inputClass} mt-0 flex-1`}
                  />
                </div>
              ))}
            </div>
          </fieldset>
          {errors.includes("options") && <p role="alert" className={fieldErrorClass}>{FIELD_LABELS.options}</p>}
          {errors.includes("correctOption") && <p role="alert" className={fieldErrorClass}>{FIELD_LABELS.correctOption}</p>}

          <label className="block text-sm font-medium text-slate-700">
            解説文
            <textarea
              value={form.explanation}
              onChange={(e) => setForm((prev) => ({ ...prev, explanation: e.target.value }))}
              className={`${inputClass} min-h-16`}
            />
          </label>

          <label className="block text-sm font-medium text-slate-700">
            画像添付
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => handleImageChange(e.target.files?.[0])}
              className="mt-1 block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
          </label>
          {uploading && <p className="text-sm text-slate-500">アップロード中…</p>}
          {form.imageAssetId && <p className="text-sm text-emerald-700">画像を添付しました</p>}

          <div className="flex gap-3 pt-2">
            <button type="submit" className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700">
              保存する
            </button>
            <button type="button" onClick={() => setEditingId(null)} className={secondaryButtonClass}>
              キャンセル
            </button>
          </div>
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
