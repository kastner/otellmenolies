import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";

export type SqliteDatabase = Database.Database;

export function createSqliteDatabase(filePath: string): SqliteDatabase {
  fs.mkdirSync(path.dirname(filePath), {
    recursive: true
  });

  const database = new Database(filePath);

  database.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS spans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trace_id TEXT NOT NULL,
      span_id TEXT NOT NULL UNIQUE,
      parent_span_id TEXT,
      service_name TEXT NOT NULL,
      span_name TEXT NOT NULL,
      kind TEXT NOT NULL,
      category TEXT NOT NULL,
      start_time_ms INTEGER NOT NULL,
      duration_ms REAL NOT NULL,
      status_code TEXT NOT NULL,
      session_id TEXT,
      tool_name TEXT,
      peer_service TEXT,
      attributes_json TEXT NOT NULL,
      resource_attributes_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS spans_start_time_idx ON spans(start_time_ms);
    CREATE INDEX IF NOT EXISTS spans_trace_idx ON spans(trace_id);
    CREATE INDEX IF NOT EXISTS spans_service_idx ON spans(service_name);
    CREATE INDEX IF NOT EXISTS spans_session_idx ON spans(session_id);
    CREATE INDEX IF NOT EXISTS spans_category_idx ON spans(category);
  `);

  return database;
}
