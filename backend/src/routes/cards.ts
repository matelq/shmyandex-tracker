import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

interface CardRow {
  id: number;
  user_id: number;
  title: string;
  description: string;
  assignee: string;
  status: string;
  position: number;
  created_at: string;
  updated_at: string;
}

interface CreateCardBody {
  title?: string;
  description?: string;
  assignee?: string;
  status?: string;
}

interface UpdateCardBody extends CreateCardBody {
  position?: number;
}

interface HistoryRow {
  id: number;
  action: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  user_name: string;
  created_at: string;
}

interface CommentRow {
  id: number;
  body: string;
  user_name: string;
  created_at: string;
}

function serialize(row: CardRow) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    assignee: row.assignee,
    status: row.status,
    position: row.position,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function serializeHistory(row: HistoryRow) {
  return {
    id: row.id,
    action: row.action,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    userName: row.user_name,
    createdAt: row.created_at,
  };
}

function serializeComment(row: CommentRow) {
  return {
    id: row.id,
    body: row.body,
    userName: row.user_name,
    createdAt: row.created_at,
  };
}

// Поля, изменения которых попадают в историю (position намеренно исключён,
// чтобы перетаскивание карточек не засоряло лог).
const TRACKED_FIELDS: { key: keyof CardRow; label: string }[] = [
  { key: 'title', label: 'Наименование' },
  { key: 'description', label: 'Описание' },
  { key: 'assignee', label: 'Ответственный' },
  { key: 'status', label: 'Состояние' },
];

export default async function cardRoutes(
  fastify: FastifyInstance,
  opts: { db: Database.Database }
) {
  const { db } = opts;
  fastify.addHook('onRequest', fastify.authenticate);

  const statusExists = (key: string): boolean =>
    !!db.prepare('SELECT 1 FROM statuses WHERE key = ?').get(key);

  // Ответственный — либо не назначен (пусто), либо имя существующего пользователя.
  const assigneeValid = (name: string): boolean =>
    name.trim() === '' ||
    !!db.prepare('SELECT 1 FROM users WHERE name = ?').get(name.trim());

  const insertHistory = db.prepare(
    `INSERT INTO card_history (card_id, user_id, user_name, action, field, old_value, new_value)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );

  function logCreated(cardId: number, user: { id: number; name: string }) {
    insertHistory.run(cardId, user.id, user.name, 'created', null, null, null);
  }

  // Сравнивает старую и новую версии карточки и пишет по строке истории
  // на каждое изменившееся отслеживаемое поле.
  function logChanges(
    cardId: number,
    user: { id: number; name: string },
    before: CardRow,
    after: Record<string, unknown>
  ) {
    for (const { key } of TRACKED_FIELDS) {
      const oldVal = String(before[key] ?? '');
      const newVal = String(after[key] ?? '');
      if (oldVal !== newVal) {
        insertHistory.run(cardId, user.id, user.name, 'updated', key, oldVal, newVal);
      }
    }
  }

  // Доска общая: любой авторизованный пользователь видит все карточки.
  fastify.get('/api/cards', async () => {
    const rows = db
      .prepare('SELECT * FROM cards ORDER BY status, position, id')
      .all() as CardRow[];
    return rows.map(serialize);
  });

  fastify.post<{ Body: CreateCardBody }>('/api/cards', async (request, reply) => {
    const { title, description = '', assignee = '', status = 'todo' } = request.body;
    if (!title?.trim()) {
      return reply.code(400).send({ error: 'Заголовок карточки обязателен' });
    }
    if (!statusExists(status)) {
      return reply.code(400).send({ error: 'Недопустимый статус' });
    }
    if (!assigneeValid(assignee)) {
      return reply.code(400).send({ error: 'Ответственный должен быть существующим пользователем' });
    }

    const max = db
      .prepare('SELECT COALESCE(MAX(position), 0) AS m FROM cards WHERE status = ?')
      .get(status) as { m: number };

    // user_id сохраняем как автора карточки, но доступ к ней есть у всех.
    const info = db
      .prepare(
        'INSERT INTO cards (user_id, title, description, assignee, status, position) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(request.user.id, title.trim(), description, assignee, status, max.m + 1);

    logCreated(Number(info.lastInsertRowid), request.user);

    const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(info.lastInsertRowid) as CardRow;
    return reply.code(201).send(serialize(row));
  });

  fastify.put<{ Params: { id: string }; Body: UpdateCardBody }>(
    '/api/cards/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = db
        .prepare('SELECT * FROM cards WHERE id = ?')
        .get(id) as CardRow | undefined;
      if (!existing) {
        return reply.code(404).send({ error: 'Карточка не найдена' });
      }

      const {
        title = existing.title,
        description = existing.description,
        assignee = existing.assignee,
        status = existing.status,
        position = existing.position,
      } = request.body;

      if (!statusExists(status)) {
        return reply.code(400).send({ error: 'Недопустимый статус' });
      }
      if (!title?.trim()) {
        return reply.code(400).send({ error: 'Заголовок карточки обязателен' });
      }
      if (!assigneeValid(assignee)) {
        return reply.code(400).send({ error: 'Ответственный должен быть существующим пользователем' });
      }

      const nextValues = { title: title.trim(), description, assignee, status, position };
      logChanges(id, request.user, existing, nextValues);

      db.prepare(
        `UPDATE cards
           SET title = ?, description = ?, assignee = ?, status = ?, position = ?,
               updated_at = datetime('now')
         WHERE id = ?`
      ).run(title.trim(), description, assignee, status, position, id);

      const row = db.prepare('SELECT * FROM cards WHERE id = ?').get(id) as CardRow;
      return serialize(row);
    }
  );

  fastify.delete<{ Params: { id: string } }>('/api/cards/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const info = db
      .prepare('DELETE FROM cards WHERE id = ?')
      .run(id);
    if (info.changes === 0) {
      return reply.code(404).send({ error: 'Карточка не найдена' });
    }
    return reply.code(204).send();
  });

  // --- История изменений ---
  fastify.get<{ Params: { id: string } }>(
    '/api/cards/:id/history',
    async (request, reply) => {
      const id = Number(request.params.id);
      const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id);
      if (!card) {
        return reply.code(404).send({ error: 'Карточка не найдена' });
      }
      const rows = db
        .prepare('SELECT * FROM card_history WHERE card_id = ? ORDER BY id DESC')
        .all(id) as HistoryRow[];
      return rows.map(serializeHistory);
    }
  );

  // --- Комментарии ---
  fastify.get<{ Params: { id: string } }>(
    '/api/cards/:id/comments',
    async (request, reply) => {
      const id = Number(request.params.id);
      const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id);
      if (!card) {
        return reply.code(404).send({ error: 'Карточка не найдена' });
      }
      const rows = db
        .prepare('SELECT * FROM card_comments WHERE card_id = ? ORDER BY id ASC')
        .all(id) as CommentRow[];
      return rows.map(serializeComment);
    }
  );

  fastify.post<{ Params: { id: string }; Body: { body?: string } }>(
    '/api/cards/:id/comments',
    async (request, reply) => {
      const id = Number(request.params.id);
      const card = db.prepare('SELECT id FROM cards WHERE id = ?').get(id);
      if (!card) {
        return reply.code(404).send({ error: 'Карточка не найдена' });
      }
      const body = request.body.body?.trim();
      if (!body) {
        return reply.code(400).send({ error: 'Комментарий не может быть пустым' });
      }
      const info = db
        .prepare(
          'INSERT INTO card_comments (card_id, user_id, user_name, body) VALUES (?, ?, ?, ?)'
        )
        .run(id, request.user.id, request.user.name, body);
      const row = db
        .prepare('SELECT * FROM card_comments WHERE id = ?')
        .get(info.lastInsertRowid) as CommentRow;
      return reply.code(201).send(serializeComment(row));
    }
  );
}
