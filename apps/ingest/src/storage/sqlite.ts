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
      conversation_id TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      tool_name TEXT,
      tool_call_id TEXT,
      tool_arguments TEXT,
      peer_service TEXT,
      attributes_json TEXT NOT NULL,
      resource_attributes_json TEXT NOT NULL
    );
  `);

  ensureColumn(database, "spans", "conversation_id", "TEXT");
  ensureColumn(database, "spans", "input_tokens", "INTEGER");
  ensureColumn(database, "spans", "output_tokens", "INTEGER");
  ensureColumn(database, "spans", "tool_call_id", "TEXT");
  ensureColumn(database, "spans", "tool_arguments", "TEXT");

  database.exec(`
    CREATE INDEX IF NOT EXISTS spans_start_time_idx ON spans(start_time_ms);
    CREATE INDEX IF NOT EXISTS spans_trace_idx ON spans(trace_id);
    CREATE INDEX IF NOT EXISTS spans_service_idx ON spans(service_name);
    CREATE INDEX IF NOT EXISTS spans_session_idx ON spans(session_id);
    CREATE INDEX IF NOT EXISTS spans_conversation_idx ON spans(conversation_id);
    CREATE INDEX IF NOT EXISTS spans_category_idx ON spans(category);
    CREATE INDEX IF NOT EXISTS spans_tool_name_idx ON spans(tool_name);
  `);

  database.exec(`
    CREATE TABLE IF NOT EXISTS agent_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_id TEXT NOT NULL UNIQUE,
      timestamp_ms INTEGER NOT NULL,
      service_name TEXT NOT NULL,
      event_type TEXT NOT NULL,
      session_id TEXT,
      model TEXT,
      input_tokens INTEGER DEFAULT 0,
      output_tokens INTEGER DEFAULT 0,
      cache_read_tokens INTEGER DEFAULT 0,
      cache_creation_tokens INTEGER DEFAULT 0,
      cost_usd REAL,
      duration_ms REAL,
      tool_name TEXT,
      tool_success INTEGER,
      attributes_json TEXT NOT NULL DEFAULT '{}'
    );
    CREATE INDEX IF NOT EXISTS agent_events_timestamp_idx ON agent_events(timestamp_ms);
    CREATE INDEX IF NOT EXISTS agent_events_service_idx ON agent_events(service_name);
    CREATE INDEX IF NOT EXISTS agent_events_event_type_idx ON agent_events(event_type);
    CREATE INDEX IF NOT EXISTS agent_events_session_idx ON agent_events(session_id);
  `);

  pruneCodexNoise(database);

  return database;
}

function ensureColumn(
  database: SqliteDatabase,
  tableName: string,
  columnName: string,
  columnDefinition: string
) {
  const columns = database
    .prepare(`PRAGMA table_info(${tableName})`)
    .all() as Array<{ name: string }>;

  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  database.exec(
    `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`
  );
}

function pruneCodexNoise(database: SqliteDatabase) {
  const removedRows = database
    .prepare(
      `
        DELETE FROM spans
        WHERE service_name = 'codex-app-server'
          AND (
            category = 'app'
            OR (
              category = 'tool_call'
              AND tool_name IS NULL
              AND tool_call_id IS NULL
              AND tool_arguments IS NULL
            )
            OR (
              category = 'tool_call'
              AND span_name = 'handle_responses'
              AND tool_arguments IS NULL
              AND tool_call_id IS NULL
            )
          )
      `
    )
    .run().changes;

  if (removedRows > 0) {
    database.pragma("wal_checkpoint(TRUNCATE)");
  }
}
