import Database from "better-sqlite3";
import { logger } from "./logger";

const DB_PATH = "data/campaign.db";

let db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (!db) {
		db = new Database(DB_PATH);
		db.pragma("journal_mode = WAL");
		db.pragma("foreign_keys = ON");
		initSchema(db);
		logger.info(`SQLite connected: ${DB_PATH}`);
	}
	return db;
}

function initSchema(db: Database.Database) {
	db.exec(`
		CREATE TABLE IF NOT EXISTS campaigns (
			id            TEXT PRIMARY KEY,
			name          TEXT NOT NULL,
			message       TEXT NOT NULL,
			status        TEXT NOT NULL DEFAULT 'draft',
			total         INTEGER NOT NULL DEFAULT 0,
			sent          INTEGER NOT NULL DEFAULT 0,
			delivered     INTEGER NOT NULL DEFAULT 0,
			read          INTEGER NOT NULL DEFAULT 0,
			failed        INTEGER NOT NULL DEFAULT 0,
			created_at    TEXT DEFAULT (datetime('now')),
			updated_at    TEXT DEFAULT (datetime('now')),
			paused_reason TEXT
		);

		CREATE TABLE IF NOT EXISTS campaign_recipients (
			id            TEXT PRIMARY KEY,
			campaign_id   TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
			phone         TEXT NOT NULL,
			status        TEXT NOT NULL DEFAULT 'pending',
			message_id    TEXT,
			error         TEXT,
			sent_at       TEXT,
			delivered_at  TEXT,
			read_at       TEXT,
			created_at    TEXT DEFAULT (datetime('now'))
		);

		CREATE INDEX IF NOT EXISTS idx_recipients_campaign
			ON campaign_recipients(campaign_id);

		CREATE INDEX IF NOT EXISTS idx_recipients_status
			ON campaign_recipients(status);

		CREATE INDEX IF NOT EXISTS idx_recipients_message_id
			ON campaign_recipients(message_id);
	`);
}
