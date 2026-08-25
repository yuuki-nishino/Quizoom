-- Migration number: 0006 	 2026-08-25T00:00:00.000Z

-- テスト問題モードの有効/無効(要件1)。既定は無効。開催中は変更を禁止する。
ALTER TABLE event ADD COLUMN practice_mode_enabled INTEGER NOT NULL DEFAULT 0;
