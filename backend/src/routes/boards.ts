import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';
import { seedBoardStatuses } from '../db.js';

interface BoardRow {
  id: number;
  name: string;
  position: number;
}

function serialize(row: BoardRow) {
  return { id: row.id, name: row.name, position: row.position };
}

export default async function boardRoutes(
  fastify: FastifyInstance,
  opts: { db: Database.Database }
) {
  const { db } = opts;
  fastify.addHook('onRequest', fastify.authenticate);

  fastify.get('/api/boards', async () => {
    const rows = db
      .prepare('SELECT id, name, position FROM boards ORDER BY position, id')
      .all() as BoardRow[];
    return rows.map(serialize);
  });

  fastify.post<{ Body: { name?: string } }>('/api/boards', async (request, reply) => {
    const name = request.body.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'Название доски обязательно' });
    }
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), 0) AS m FROM boards').get() as {
      m: number;
    };

    const create = db.transaction((boardName: string) => {
      const info = db
        .prepare('INSERT INTO boards (name, position) VALUES (?, ?)')
        .run(boardName, maxPos.m + 1);
      const id = Number(info.lastInsertRowid);
      // У новой доски — свой независимый набор статусов.
      seedBoardStatuses(db, id, false);
      return id;
    });

    const id = create(name);
    const row = db.prepare('SELECT id, name, position FROM boards WHERE id = ?').get(id) as BoardRow;
    return reply.code(201).send(serialize(row));
  });

  fastify.put<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/boards/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = db.prepare('SELECT id FROM boards WHERE id = ?').get(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Доска не найдена' });
      }
      const name = request.body.name?.trim();
      if (!name) {
        return reply.code(400).send({ error: 'Название доски обязательно' });
      }
      db.prepare('UPDATE boards SET name = ? WHERE id = ?').run(name, id);
      const row = db.prepare('SELECT id, name, position FROM boards WHERE id = ?').get(id) as BoardRow;
      return serialize(row);
    }
  );

  fastify.delete<{ Params: { id: string } }>('/api/boards/:id', async (request, reply) => {
    const id = Number(request.params.id);
    const existing = db.prepare('SELECT id FROM boards WHERE id = ?').get(id);
    if (!existing) {
      return reply.code(404).send({ error: 'Доска не найдена' });
    }
    const total = (db.prepare('SELECT COUNT(*) AS c FROM boards').get() as { c: number }).c;
    if (total <= 1) {
      return reply.code(400).send({ error: 'Нельзя удалить единственную доску' });
    }
    // Каскад удалит карточки и статусы доски.
    db.prepare('DELETE FROM boards WHERE id = ?').run(id);
    return reply.code(204).send();
  });
}
