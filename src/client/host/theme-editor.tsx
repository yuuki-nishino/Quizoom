import { useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { ThemeSettings } from "../../shared/domain-types";
import type { EventDetail, HostApiClient } from "./api-client";
import { isLowContrast } from "../shared/theme";
import { THEME_PRESETS } from "./theme-presets";
import { ThemePreviewWalkthrough } from "./theme-preview-walkthrough";

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
    setTheme((prev) => ({ ...prev, [key]: value }));
  }

  function applyPreset(preset: ThemeSettings) {
    setTheme((prev) => ({
      ...prev,
      primaryColor: preset.primaryColor,
      accentColor: preset.accentColor,
      backgroundColor: preset.backgroundColor,
      textColor: preset.textColor,
    }));
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

  // ホスト自身のセッションCookieで完結するため、投影/回答用のトークン付きURLと異なりトークンは不要
  const logoPreviewUrl = theme.logoAssetId ? `/api/events/${eventId}/media/${theme.logoAssetId}` : null;
  const backgroundPreviewUrl = theme.backgroundAssetId ? `/api/events/${eventId}/media/${theme.backgroundAssetId}` : null;

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
        <legend className="text-sm font-medium text-slate-700">プリセットテーマ</legend>
        <div className="mt-1 flex flex-wrap gap-2">
          {THEME_PRESETS.map((preset, index) => (
            <button
              key={index}
              type="button"
              onClick={() => applyPreset(preset)}
              style={{ background: preset.primaryColor }}
              className="rounded-md px-3 py-1.5 text-sm font-medium text-white shadow-sm"
            >
              プリセット{index + 1}
            </button>
          ))}
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

      <button
        type="button"
        disabled={saving}
        onClick={handleSave}
        className="mt-4 rounded-md bg-indigo-600 px-4 py-2 font-medium text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        保存する
      </button>

      <ThemePreviewWalkthrough
        eventTitle={event.title}
        theme={theme}
        logoImageUrl={logoPreviewUrl}
        backgroundImageUrl={backgroundPreviewUrl}
      />
    </section>
  );
}
