-- Migration number: 0003 	 2026-08-14T00:00:00.000Z

-- share_code は初回発行後も値を保持し続ける（disableSharing で NULL に戻さない）。
-- 無効化後に同一の共有URLへアクセスした際、存在しないコード（404）と無効化済みコード（410）を
-- 区別できるようにするため、有効/無効の状態は share_enabled で別途管理する（要件8.13）。
ALTER TABLE result ADD COLUMN share_enabled INTEGER NOT NULL DEFAULT 0 CHECK (share_enabled IN (0, 1));
