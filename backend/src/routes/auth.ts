import bcrypt from 'bcryptjs';
import { FastifyInstance } from 'fastify';
import Database from 'better-sqlite3';

interface RegisterBody {
  email?: string;
  name?: string;
  password?: string;
}

interface LoginBody {
  email?: string;
  password?: string;
}

interface UserRow {
  id: number;
  email: string;
  name: string;
  password_hash: string;
}

export default async function authRoutes(
  fastify: FastifyInstance,
  opts: { db: Database.Database }
) {
  const { db } = opts;

  fastify.post<{ Body: RegisterBody }>('/api/auth/register', async (request, reply) => {
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

    const user = { id: Number(info.lastInsertRowid), email: email.toLowerCase(), name };
    const token = fastify.jwt.sign({ id: user.id, email: user.email, name: user.name });
    return reply.code(201).send({ token, user });
  });

  fastify.post<{ Body: LoginBody }>('/api/auth/login', async (request, reply) => {
    const { email, password } = request.body;
    if (!email || !password) {
      return reply.code(400).send({ error: 'Укажите email и пароль' });
    }

    const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as UserRow | undefined;
    if (!row || !bcrypt.compareSync(password, row.password_hash)) {
      return reply.code(401).send({ error: 'Неверный email или пароль' });
    }

    const user = { id: row.id, email: row.email, name: row.name };
    const token = fastify.jwt.sign({ id: user.id, email: user.email, name: user.name });
    return { token, user };
  });

  fastify.get('/api/auth/me', { onRequest: [fastify.authenticate] }, async (request) => {
    return { user: request.user };
  });

  // Список пользователей — для выбора ответственного в задаче.
  fastify.get('/api/users', { onRequest: [fastify.authenticate] }, async () => {
    const rows = db
      .prepare('SELECT id, email, name FROM users ORDER BY name COLLATE NOCASE')
      .all() as { id: number; email: string; name: string }[];
    return rows;
  });
}
