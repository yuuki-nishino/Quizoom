-- Migration number: 0007 	 2026-10-03T00:00:00.000Z

-- 選択肢ごとの添付画像(0または1枚)の参照(Issue #36)。既存の選択肢はNULL(画像なし)になる。
-- 選択肢のテキスト(label)は画像の有無にかかわらず必須のままなので、labelの制約は変更しない。
ALTER TABLE option ADD COLUMN image_asset_id TEXT;
