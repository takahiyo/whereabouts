-- schema.sql
-- Cloudflare D1 用のテーブル定義

-- 事業所テーブル
CREATE TABLE IF NOT EXISTS offices (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    password TEXT,
    admin_password TEXT,
    is_public BOOLEAN DEFAULT 1, -- SQLite には真偽値がないため 0 or 1
    created_at INTEGER,
    updated_at INTEGER
);

-- メンバーテーブル
CREATE TABLE IF NOT EXISTS members (
    id TEXT NOT NULL,
    office_id TEXT NOT NULL,
    name TEXT NOT NULL,
    group_name TEXT,
    display_order INTEGER DEFAULT 0,
    status TEXT,
    time TEXT,
    note TEXT,
    work_hours TEXT,
    ext TEXT,
    mobile TEXT,
    email TEXT,
    updated INTEGER, -- 同期用のタイムスタンプ (ms)
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- ツール設定テーブル
CREATE TABLE IF NOT EXISTS tools_config (
    office_id TEXT PRIMARY KEY,
    tools_json TEXT DEFAULT '[]',
    updated_at INTEGER,
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- お知らせテーブル
CREATE TABLE IF NOT EXISTS notices (
    id TEXT NOT NULL,
    office_id TEXT NOT NULL,
    title TEXT,
    content TEXT,
    visible INTEGER DEFAULT 1,
    updated INTEGER,
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- 休暇・行事テーブル
CREATE TABLE IF NOT EXISTS vacations (
    id TEXT NOT NULL,
    office_id TEXT NOT NULL,
    title TEXT,
    start_date TEXT,
    end_date TEXT,
    color TEXT,
    visible INTEGER DEFAULT 1,
    members_bits TEXT,
    is_vacation INTEGER DEFAULT 1,
    note TEXT,
    notice_id TEXT,
    notice_title TEXT,
    display_order INTEGER DEFAULT 0,
    vacancy_office TEXT,
    updated INTEGER,
    PRIMARY KEY (office_id, id),
    FOREIGN KEY (office_id) REFERENCES offices(id) ON DELETE CASCADE
);

-- 高速化のためのインデックス
CREATE INDEX IF NOT EXISTS idx_members_updated ON members(office_id, updated);
CREATE INDEX IF NOT EXISTS idx_notices_updated ON notices(office_id, updated);
CREATE INDEX IF NOT EXISTS idx_vacations_start ON vacations(office_id, start_date);
