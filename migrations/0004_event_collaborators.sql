-- Migration number: 0004 	 2026-08-19T00:00:00.000Z

-- 招待(pending)と受諾済み共同運営者(accepted)を単一テーブルの状態遷移として表現する。
-- 招待中は user_id が定まらない(招待先メールアドレスの利用者が Quizoom に未登録の場合があるため)。
CREATE TABLE event_collaborator (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invite_token TEXT UNIQUE,
  user_id TEXT REFERENCES user(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted')),
  created_at INTEGER NOT NULL,
  accepted_at INTEGER,
  UNIQUE (event_id, invited_email)
);

CREATE INDEX idx_event_collaborator_event ON event_collaborator(event_id);
CREATE INDEX idx_event_collaborator_token ON event_collaborator(invite_token);
CREATE INDEX idx_event_collaborator_user ON event_collaborator(status, user_id);
