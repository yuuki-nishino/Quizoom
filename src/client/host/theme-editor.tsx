import { useState } from "react";
import type { EventId } from "../../shared/domain-types";
import type { ThemeSettings } from "../../shared/domain-types";
import type { EventDetail, HostApiClient } from "./api-client";
import { ThemeProvider, isLowContrast } from "../shared/theme";
import { THEME_PRESETS } from "./theme-presets";

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

  return (
    <section aria-label="外観エディタ">
      <h2>外観</h2>
      {error && <p role="alert">保存に失敗しました（{error}）。</p>}

      <fieldset>
        <legend>プリセットテーマ</legend>
        {THEME_PRESETS.map((preset, index) => (
          <button key={index} type="button" onClick={() => applyPreset(preset)} style={{ background: preset.primaryColor }}>
            プリセット{index + 1}
          </button>
        ))}
      </fieldset>

      <label>
        基調色
        <input type="color" value={theme.primaryColor} onChange={(e) => updateColor("primaryColor", e.target.value)} />
      </label>
      <label>
        アクセント色
        <input type="color" value={theme.accentColor} onChange={(e) => updateColor("accentColor", e.target.value)} />
      </label>
      <label>
        背景色
        <input type="color" value={theme.backgroundColor} onChange={(e) => updateColor("backgroundColor", e.target.value)} />
      </label>
      <label>
        文字色
        <input type="color" value={theme.textColor} onChange={(e) => updateColor("textColor", e.target.value)} />
      </label>

      {lowContrast && <p role="alert">文字色と背景色のコントラストが低く、視認性が低い可能性があります。</p>}

      <label>
        ロゴ画像
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleUpload("logo", e.target.files?.[0])} />
      </label>
      {uploadingLogo && <p>アップロード中…</p>}

      <label>
        背景画像
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(e) => handleUpload("background", e.target.files?.[0])} />
      </label>
      {uploadingBackground && <p>アップロード中…</p>}

      <button type="button" disabled={saving} onClick={handleSave}>
        保存する
      </button>

      <div aria-label="プレビュー">
        <ThemeProvider theme={theme}>
          <div data-preview="stage">投影用プレビュー: {event.title}</div>
        </ThemeProvider>
        <ThemeProvider theme={theme}>
          <div data-preview="player">回答用プレビュー: {event.title}</div>
        </ThemeProvider>
      </div>
    </section>
  );
}
