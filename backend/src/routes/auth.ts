import bcrypt from 'bcryptjs';
import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

interface CreateUserBody {
  email?: string;
  name?: string;
  password?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

// Единственный администратор — первый созданный пользователь (id = 1).
const ADMIN_ID = 1;

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
  blocked: number;
}

export default async function authRoutes(
  fastify: FastifyInstance,
  opts: { db: Database.Database }
) {
  const { db } = opts;

  fastify.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Укажите email и пароль' });
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as UserRow | undefined;
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }
    if (row.blocked) {
      return reply.code(403).send({ error: 'Учётная запись заблокирована. Обратитесь к администратору' });
    }

    const user = { id: row.id, email: row.email, name: row.name };
    const token = fastify.jwt.sign({ id: user.id, email: user.email, name: user.name });
    return { token, user };
  });

  fastify.get('/api/auth/me', { onRequest: [fastify.authenticate] }, async (request) => {
    return { user: request.user };
  });

  // Список пользователей — для выбора ответственного и администрирования.
  fastify.get('/api/users', { onRequest: [fastify.authenticate] }, async () => {
    const rows = db
      .prepare('SELECT id, email, name, blocked FROM users ORDER BY name COLLATE NOCASE')
      .all() as { id: number; email: string; name: string; blocked: number }[];
    return rows.map((r) => ({ id: r.id, email: r.email, name: r.name, blocked: !!r.blocked }));
  });

  // Создание пользователя — доступно только администратору (id = 1).
  fastify.post<{ Body: CreateUserBody }>(
    '/api/users',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.id !== ADMIN_ID) {
        return reply.code(403).send({ error: 'Создавать пользователей может только администратор' });
      }

      const { email, name, password } = request.body;
      if (!email || !name || !password) {
        return reply.code(400).send({ error: 'Укажите email, имя и пароль' });
      }
      if (password.length < 4) {
        return reply.code(400).send({ error: 'Пароль должен быть не короче 4 символов' });
      }

      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase());
      if (exists) {
        return reply.code(409).send({ error: 'Пользователь с таким email уже существует' });
      }

      const password_hash = bcrypt.hashSync(password, 10);
      const info = db
        .prepare('INSERT INTO users (email, name, password_hash) VALUES (?, ?, ?)')
        .run(email.toLowerCase(), name, password_hash);

      return reply
        .code(201)
        .send({ id: Number(info.lastInsertRowid), email: email.toLowerCase(), name, blocked: false });
    }
  );

  // Блокировка/разблокировка пользователя — только администратор (id = 1).
  fastify.post<{ Params: { id: string }; Body: { blocked?: boolean } }>(
    '/api/users/:id/block',
    { onRequest: [fastify.authenticate] },
    async (request, reply) => {
      if (request.user.id !== ADMIN_ID) {
        return reply.code(403).send({ error: 'Блокировать пользователей может только администратор' });
      }
      const id = Number(request.params.id);
      if (id === ADMIN_ID) {
        return reply.code(400).send({ error: 'Администратора нельзя заблокировать' });
      }
      const existing = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
      if (!existing) {
        return reply.code(404).send({ error: 'Пользователь не найден' });
      }
      const blocked = request.body.blocked ? 1 : 0;
      db.prepare('UPDATE users SET blocked = ? WHERE id = ?').run(blocked, id);
      const row = db
        .prepare('SELECT id, email, name, blocked FROM users WHERE id = ?')
        .get(id) as { id: number; email: string; name: string; blocked: number };
      return { id: row.id, email: row.email, name: row.name, blocked: !!row.blocked };
    }
  );
}
