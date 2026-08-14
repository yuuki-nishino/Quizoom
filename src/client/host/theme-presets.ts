import type { ThemeSettings } from "../../shared/domain-types";

// server/catalog/repository.ts の THEME_PRESETS と同じ配色を保つ（値のみの重複であり、業務ロジックの重複ではない）
export const THEME_PRESETS: readonly ThemeSettings[] = [
  { primaryColor: "#be123c", accentColor: "#fbbf24", backgroundColor: "#fff1f2", textColor: "#1f2937", logoAssetId: null, backgroundAssetId: null },
  { primaryColor: "#065f46", accentColor: "#d97706", backgroundColor: "#ecfdf5", textColor: "#111827", logoAssetId: null, backgroundAssetId: null },
  { primaryColor: "#1e3a8a", accentColor: "#38bdf8", backgroundColor: "#eff6ff", textColor: "#0f172a", logoAssetId: null, backgroundAssetId: null },
];
