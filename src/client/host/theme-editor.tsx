import { useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { ThemeSettings } from "../../shared/domain-types";
import type { EventDetail, HostApiClient } from "./api-client";
import { isLowContrast } from "../shared/theme";
import { DESIGN_TEMPLATES } from "../../shared/design-templates";
import { applyDesignTemplate, updateThemeColor } from "./theme-editor-state";
import { hostRoutePath } from "./route";

export interface ThemeEditorProps {
  readonly apiClient: HostApiClient;
  readonly eventId: EventId;
  readonly event: EventDetail;
  readonly onEventChange: (event: EventDetail) => void;
}

/** 外観エディタとプレビュー（要件3.1-3.6）。開催中でも変更操作は許可される */
export function ThemeEditor({ apiClient, eventId, event, onEventChange }: ThemeEditorProps) {
  const [theme, setTheme] = useState<ThemeSettings>(event.theme);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [uploadingBackground, setUploadingBackground] = useState(false);

  function updateColor(key: keyof Pick<ThemeSettings, "primaryColor" | "accentColor" | "backgroundColor" | "textColor">, value: string) {
    setTheme((prev) => updateThemeColor(prev, key, value));
  }

  function applyTemplate(template: (typeof DESIGN_TEMPLATES)[number]) {
    setTheme((prev) => applyDesignTemplate(prev, template));
  }

  async function handleUpload(kind: "logo" | "background", file: File | undefined) {
    if (!file) return;
    const setUploading = kind === "logo" ? setUploadingLogo : setUploadingBackground;
    setUploading(true);
    const result = await apiClient.uploadMedia(eventId, file);
    setUploading(false);
    if (result.ok) {
      setTheme((prev) => (kind === "logo" ? { ...prev, logoAssetId: result.value.assetId } : { ...prev, backgroundAssetId: result.value.assetId }));
    } else {
      setError(result.code);
    }
  }

  async function handleSave() {
    setSaving(true);
    const result = await apiClient.putTheme(eventId, theme);
    setSaving(false);
    if (result.ok) {
      onEventChange({ ...event, theme: result.value });
      setError(null);
    } else {
      setError(result.code);
    }
  }

  const lowContrast = isLowContrast(theme);

  const colorFieldClass = "flex flex-col gap-1 text-sm font-medium text-slate-700";
  const colorInputClass = "h-10 w-16 cursor-pointer rounded border border-slate-300";

  return (
    <section aria-label="外観エディタ" className="max-w-2xl">
      <h2 className="text-lg font-semibold text-slate-900">外観</h2>
      {error && (
        <p role="alert" className="mt-2 rounded-md border border-red-300 bg-red-50 px-4 py-2 text-sm text-red-800">
          保存に失敗しました（{error}）。
        </p>
      )}

      <fieldset className="mt-4">
        <legend className="text-sm font-medium text-slate-700">デザインテンプレート</legend>
        <p className="mt-1 text-xs text-slate-500">配色と装飾モチーフを1セットで切り替えます。選択後に下の配色を個別調整しても、テンプレートの装飾は維持されます。</p>
        <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
          {DESIGN_TEMPLATES.map((template) => {
            const selected = theme.templateId === template.id;
            return (
              <button
                key={template.id}
                type="button"
                aria-pressed={selected}
                onClick={() => applyTemplate(template)}
                className={`rounded-lg border-2 p-3 text-left shadow-sm transition-colors ${
                  selected ? "border-indigo-500 ring-2 ring-indigo-200" : "border-slate-200 hover:border-slate-300"
                }`}
              >
                <span
                  aria-hidden="true"
                  className="block h-10 w-full rounded-md"
                  style={{ background: `linear-gradient(135deg, ${template.colors.primaryColor}, ${template.colors.accentColor})` }}
                />
                <span className="mt-2 block text-sm font-semibold text-slate-900">{template.name}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{template.targetScene}</span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-4 flex flex-wrap gap-4">
        <label className={colorFieldClass}>
          基調色
          <input type="color" value={theme.primaryColor} onChange={(e) => updateColor("primaryColor", e.target.value)} className={colorInputClass} />
        </label>
        <label className={colorFieldClass}>
          アクセント色
          <input type="color" value={theme.accentColor} onChange={(e) => updateColor("accentColor", e.target.value)} className={colorInputClass} />
        </label>
        <label className={colorFieldClass}>
          背景色
          <input type="color" value={theme.backgroundColor} onChange={(e) => updateColor("backgroundColor", e.target.value)} className={colorInputClass} />
        </label>
        <label className={colorFieldClass}>
          文字色
          <input type="color" value={theme.textColor} onChange={(e) => updateColor("textColor", e.target.value)} className={colorInputClass} />
        </label>
      </div>

      {lowContrast && (
        <p role="alert" className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          文字色と背景色のコントラストが低く、視認性が低い可能性があります。
        </p>
      )}

      <div className="mt-4 space-y-3">
        <label className="block text-sm font-medium text-slate-700">
          ロゴ画像
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleUpload("logo", e.target.files?.[0])}
            className="mt-1 block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </label>
        {uploadingLogo && <p className="text-sm text-slate-500">アップロード中…</p>}

        <label className="block text-sm font-medium text-slate-700">
          背景画像
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleUpload("background", e.target.files?.[0])}
            className="mt-1 block text-sm text-slate-600 file:mr-3 file:rounded-md file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
        </label>
        {uploadingBackground && <p className="text-sm text-slate-500">アップロード中…</p>}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={saving}
          onClick={handleSave}
          className="rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
        >
          保存する
        </button>
        <a
          href={hostRoutePath({ view: "theme-preview", eventId })}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-slate-300 px-4 py-2 font-medium text-slate-700 hover:bg-slate-50"
        >
          プレビューを開く（別タブ）
        </a>
      </div>
      <p className="mt-2 text-xs text-slate-500">プレビューには保存済みの内容が表示されます。変更後は「保存する」を押してから開いてください。</p>
    </section>
  );
}
