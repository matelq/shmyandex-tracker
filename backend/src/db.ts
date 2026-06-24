import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export function createSchema(db: Database.Database): void {
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT NOT NULL UNIQUE,
      name          TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      blocked       INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS boards (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      name       TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS cards (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id    INTEGER REFERENCES boards(id) ON DELETE CASCADE,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title       TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      assignee    TEXT NOT NULL DEFAULT '',
      status      TEXT NOT NULL DEFAULT 'todo',
      position    REAL NOT NULL DEFAULT 0,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_cards_user ON cards(user_id);

    CREATE TABLE IF NOT EXISTS card_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name  TEXT NOT NULL,
      action     TEXT NOT NULL,            -- 'created' | 'updated'
      field      TEXT,                     -- какое поле изменилось (для 'updated')
      old_value  TEXT,
      new_value  TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_history_card ON card_history(card_id);

    CREATE TABLE IF NOT EXISTS card_comments (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      card_id    INTEGER NOT NULL REFERENCES cards(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      user_name  TEXT NOT NULL,
      body       TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_comments_card ON card_comments(card_id);

    CREATE TABLE IF NOT EXISTS statuses (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      board_id   INTEGER REFERENCES boards(id) ON DELETE CASCADE,
      key        TEXT NOT NULL UNIQUE,
      name       TEXT NOT NULL,
      position   INTEGER NOT NULL DEFAULT 0,
      is_archive INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  migrate(db);
  ensureDefaults(db);
}

const DEFAULT_BOARD_ID = 1;

// Идемпотентные миграции для уже существующих БД.
function migrate(db: Database.Database): void {
  const userCols = db.prepare('PRAGMA table_info(users)').all() as { name: string }[];
  if (!userCols.some((c) => c.name === 'blocked')) {
    db.exec('ALTER TABLE users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0');
  }

  // Доска по умолчанию должна существовать до бэкфилла board_id.
  const boardCount = db.prepare('SELECT COUNT(*) AS c FROM boards').get() as { c: number };
  if (boardCount.c === 0) {
    db.prepare('INSERT INTO boards (name, position) VALUES (?, ?)').run('Основная', 1);
  }

  const cardCols = db.prepare('PRAGMA table_info(cards)').all() as { name: string }[];
  if (!cardCols.some((c) => c.name === 'board_id')) {
    db.exec('ALTER TABLE cards ADD COLUMN board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE');
  }
  db.prepare('UPDATE cards SET board_id = ? WHERE board_id IS NULL').run(DEFAULT_BOARD_ID);

  const statusCols = db.prepare('PRAGMA table_info(statuses)').all() as { name: string }[];
  if (statusCols.length > 0 && !statusCols.some((c) => c.name === 'board_id')) {
    db.exec('ALTER TABLE statuses ADD COLUMN board_id INTEGER REFERENCES boards(id) ON DELETE CASCADE');
  }
  db.prepare('UPDATE statuses SET board_id = ? WHERE board_id IS NULL').run(DEFAULT_BOARD_ID);

  // Индексы по board_id создаём после того, как колонки гарантированно есть.
  db.exec('CREATE INDEX IF NOT EXISTS idx_cards_board ON cards(board_id)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_statuses_board ON statuses(board_id)');
}

// Спецстатус «Архив» всегда существует и неизменяем (определяется по is_archive).
export const ARCHIVE_KEY = 'archive';

// Создаёт стартовый набор статусов для доски.
// canonical=true — ключи без префикса (todo/in_progress/done/archive) для доски
// по умолчанию; иначе ключи с префиксом доски, чтобы оставаться уникальными.
export function seedBoardStatuses(
  db: Database.Database,
  boardId: number,
  canonical = false
): void {
  const k = (s: string) => (canonical ? s : `b${boardId}_${s}`);
  const insert = db.prepare(
    'INSERT INTO statuses (board_id, key, name, position, is_archive) VALUES (?, ?, ?, ?, ?)'
  );
  insert.run(boardId, k('todo'), 'К выполнению', 1, 0);
  insert.run(boardId, k('in_progress'), 'В работе', 2, 0);
  insert.run(boardId, k('done'), 'Выполнено', 3, 0);
  insert.run(boardId, k(ARCHIVE_KEY), 'Архив', 1000, 1);
}

// Сидинг статусов доски по умолчанию (только на свежей БД).
function ensureDefaults(db: Database.Database): void {
  const count = db.prepare('SELECT COUNT(*) AS c FROM statuses').get() as { c: number };
  if (count.c === 0) {
    seedBoardStatuses(db, DEFAULT_BOARD_ID, true);
  }
}

export function seed(db: Database.Database): void {
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get('demo@tracker.local');
  if (existing) return;

  const hash = bcrypt.hashSync('demo1234', 10);
  const { lastInsertRowid } = db
    .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
    .run('demo@tracker.local', 'Demo User', hash);

  const userId = Number(lastInsertRowid);

  const insert = db.prepare(
    'INSERT INTO cards (board_id, user_id, title, description, status, position) VALUES (1, ?, ?, ?, ?, ?)'
  );

  insert.run(userId, 'Изучить документацию', 'Прочитать README и ознакомиться с API', 'todo', 1);
  insert.run(userId, 'Настроить окружение', 'Установить зависимости и запустить dev-сервер', 'todo', 2);
  insert.run(userId, 'Реализовать авторизацию', 'Добавить JWT и формы логина/регистрации', 'in_progress', 1);
  insert.run(userId, 'Сверстать канбан-доску', 'Три колонки: To Do, In Progress, Done', 'in_progress', 2);
  insert.run(userId, 'Создать репозиторий', 'Инициализировать Git и сделать первый коммит', 'done', 1);
}

export function openDb(filename: string): Database.Database {
  const db = new Database(filename);
  createSchema(db);
  return db;
}

// Синглтон для production-сервера
let _instance: Database.Database | null = null;

export function getDb(): Database.Database {
  if (!_instance) {
    const dataDir = join(__dirname, '..', 'data');
    mkdirSync(dataDir, { recursive: true });
    _instance = openDb(join(dataDir, 'tracker.db'));
    seed(_instance);
  }
  return _instance;
}
