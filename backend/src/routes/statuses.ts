import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

interface StatusRow {
  id: number;
  key: string;
  name: string;
  position: number;
  is_archive: number;
  card_count: number;
}

function serialize(row: StatusRow) {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    position: row.position,
    isArchive: !!row.is_archive,
    cardCount: row.card_count,
  };
}

export default async function statusRoutes(
  fastify: FastifyInstance,
  opts: { db: Database.Database }
) {
  const { db } = opts;
  fastify.addHook('onRequest', fastify.authenticate);

  const listQuery = db.prepare(
    `SELECT s.*, (SELECT COUNT(*) FROM cards c WHERE c.status = s.key) AS card_count
       FROM statuses s
      ORDER BY s.is_archive, s.position, s.id`
  );

  const getById = (id: number) =>
    db.prepare('SELECT * FROM statuses WHERE id = ?').get(id) as
      | (StatusRow & { is_archive: number })
      | undefined;

  fastify.get('/api/statuses', async () => {
    return (listQuery.all() as StatusRow[]).map(serialize);
  });

  fastify.post<{ Body: { name?: string } }>('/api/statuses', async (request, reply) => {
    const name = request.body.name?.trim();
    if (!name) {
      return reply.code(400).send({ error: 'Название статуса обязательно' });
    }

    // Новый статус встаёт после последнего обычного, перед «Архивом».
    const maxPos = db
      .prepare('SELECT COALESCE(MAX(position), 0) AS m FROM statuses WHERE is_archive = 0')
      .get() as { m: number };

    const create = db.transaction((statusName: string) => {
      const info = db
        .prepare('INSERT INTO statuses (key, name, position, is_archive) VALUES (?, ?, ?, 0)')
        .run('', statusName, maxPos.m + 1);
      const id = Number(info.lastInsertRowid);
      const key = `st${id}`;
      db.prepare('UPDATE statuses SET key = ? WHERE id = ?').run(key, id);
      return id;
    });

    const id = create(name);
    const row = listQuery.all().find((r: any) => r.id === id) as StatusRow;
    return reply.code(201).send(serialize(row));
  });

  fastify.put<{ Params: { id: string }; Body: { name?: string } }>(
    '/api/statuses/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = getById(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Статус не найден' });
      }
      if (existing.is_archive) {
        return reply.code(403).send({ error: 'Статус «Архив» нельзя изменять' });
      }
      const name = request.body.name?.trim();
      if (!name) {
        return reply.code(400).send({ error: 'Название статуса обязательно' });
      }
      db.prepare('UPDATE statuses SET name = ? WHERE id = ?').run(name, id);
      const row = listQuery.all().find((r: any) => r.id === id) as StatusRow;
      return serialize(row);
    }
  );

  fastify.delete<{ Params: { id: string }; Querystring: { reassignTo?: string } }>(
    '/api/statuses/:id',
    async (request, reply) => {
      const id = Number(request.params.id);
      const existing = getById(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Статус не найден' });
      }
      if (existing.is_archive) {
        return reply.code(403).send({ error: 'Статус «Архив» нельзя удалять' });
      }

      const cardCount = (
        db.prepare('SELECT COUNT(*) AS c FROM cards WHERE status = ?').get(existing.key) as {
          c: number;
        }
      ).c;

      if (cardCount > 0) {
        const reassignTo = request.query.reassignTo;
        if (!reassignTo) {
          return reply.code(400).send({
            error: 'В статусе есть задачи — укажите, куда их переместить (reassignTo)',
            cardCount,
          });
        }
        if (reassignTo === existing.key) {
          return reply.code(400).send({ error: 'Нельзя переместить задачи в удаляемый статус' });
        }
        const target = db.prepare('SELECT key FROM statuses WHERE key = ?').get(reassignTo) as
          | { key: string }
          | undefined;
        if (!target) {
          return reply.code(400).send({ error: 'Целевой статус не найден' });
        }

        const move = db.transaction(() => {
          const maxPos = (
            db
              .prepare('SELECT COALESCE(MAX(position), 0) AS m FROM cards WHERE status = ?')
              .get(reassignTo) as { m: number }
          ).m;
          const cards = db
            .prepare('SELECT id FROM cards WHERE status = ? ORDER BY position, id')
            .all(existing.key) as { id: number }[];
          const upd = db.prepare(
            "UPDATE cards SET status = ?, position = ?, updated_at = datetime('now') WHERE id = ?"
          );
          cards.forEach((c, i) => upd.run(reassignTo, maxPos + i + 1, c.id));
          db.prepare('DELETE FROM statuses WHERE id = ?').run(id);
        });
        move();
      } else {
        db.prepare('DELETE FROM statuses WHERE id = ?').run(id);
      }

      return reply.code(204).send();
    }
  );
}
