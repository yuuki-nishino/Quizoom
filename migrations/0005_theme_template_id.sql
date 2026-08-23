-- Migration number: 0005 	 2026-08-24T03:20:00.000Z

-- デザインテンプレート(配色+装飾モチーフ)の選択状態を保持する列。NULL は未選択(既定表示にフォールバック)を表す。
ALTER TABLE theme ADD COLUMN template_id TEXT;
