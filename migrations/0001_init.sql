-- Migration number: 0001 	 2026-08-11T19:09:11.966Z

CREATE TABLE event (
  id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  title TEXT NOT NULL,
  subtitle TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'live', 'finished')),
  join_code TEXT UNIQUE,
  stage_token TEXT UNIQUE,
  capacity INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_event_owner_status ON event(owner_id, status);
CREATE INDEX idx_event_join_code ON event(join_code);

CREATE TABLE question (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL,
  body TEXT NOT NULL,
  image_asset_id TEXT,
  time_limit_sec INTEGER NOT NULL CHECK (time_limit_sec BETWEEN 5 AND 300),
  explanation TEXT NOT NULL DEFAULT '',
  UNIQUE (event_id, order_index)
);

CREATE TABLE option (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES question(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0 CHECK (is_correct IN (0, 1)),
  order_index INTEGER NOT NULL,
  UNIQUE (question_id, order_index)
);

-- 1設問につき正解はちょうど1件。「2件以上」は部分UNIQUEインデックスで拒否する。
-- 「1件以上」は行単体の制約では表現できないため、リポジトリ層（3.2）の保存時検証で担保する。
CREATE UNIQUE INDEX idx_option_single_correct ON option(question_id) WHERE is_correct = 1;

CREATE TABLE theme (
  event_id TEXT PRIMARY KEY REFERENCES event(id) ON DELETE CASCADE,
  primary_color TEXT NOT NULL,
  accent_color TEXT NOT NULL,
  background_color TEXT NOT NULL,
  text_color TEXT NOT NULL,
  logo_asset_id TEXT,
  background_asset_id TEXT
);

CREATE TABLE result (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL UNIQUE REFERENCES event(id) ON DELETE CASCADE,
  finalized_at INTEGER NOT NULL,
  share_code TEXT UNIQUE
);

CREATE TABLE result_entry (
  id TEXT PRIMARY KEY,
  result_id TEXT NOT NULL REFERENCES result(id) ON DELETE CASCADE,
  nickname TEXT NOT NULL,
  rank INTEGER NOT NULL,
  correct_count INTEGER NOT NULL,
  total_elapsed_ms INTEGER NOT NULL,
  joined_seq INTEGER NOT NULL,
  UNIQUE (result_id, rank)
);

CREATE TABLE result_answer (
  result_entry_id TEXT NOT NULL REFERENCES result_entry(id) ON DELETE CASCADE,
  question_id TEXT NOT NULL,
  is_correct INTEGER NOT NULL CHECK (is_correct IN (0, 1)),
  elapsed_ms INTEGER NOT NULL,
  PRIMARY KEY (result_entry_id, question_id)
);
