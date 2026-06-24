export interface User {
  id: number;
  email: string;
  name: string;
  blocked?: boolean;
}

export interface Card {
  id: number;
  boardId: number;
  title: string;
  description: string;
  assignee: string;
  author: string;
  status: string;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CardPayload {
  title: string;
  description?: string;
  assignee?: string;
  status?: string;
  position?: number;
  boardId?: number;
}

export interface Board {
  id: number;
  name: string;
  position: number;
}

export interface SearchCard extends Card {
  statusName: string;
  archived: boolean;
  boardName: string;
}

export interface CardHistoryEntry {
  id: number;
  action: 'created' | 'updated';
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  userName: string;
  createdAt: string;
}

export interface CardComment {
  id: number;
  body: string;
  userName: string;
  createdAt: string;
}

export interface Status {
  id: number;
  key: string;
  name: string;
  position: number;
  isArchive: boolean;
  cardCount: number;
}

let token: string | null = localStorage.getItem('token');

export function setToken(value: string | null): void {
  token = value;
  if (value) localStorage.setItem('token', value);
  else localStorage.removeItem('token');
}

export function getToken(): string | null {
  return token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (options.body) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(path, { ...options, headers });

  if (res.status === 204) return null as unknown as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const message =
      (data && typeof data === 'object' && 'error' in data && (data as any).error) ||
      `Ошибка запроса (${res.status})`;
    throw new Error(message as string);
  }
  return data as T;
}

export const api = {
  login: (payload: { email: string; password: string }) =>
    request<{ token: string; user: User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  me: () => request<{ user: User }>('/api/auth/me'),
  listUsers: () => request<User[]>('/api/users'),
  createUser: (payload: { email: string; name: string; password: string }) =>
    request<User>('/api/users', { method: 'POST', body: JSON.stringify(payload) }),
  blockUser: (id: number, blocked: boolean) =>
    request<User>(`/api/users/${id}/block`, {
      method: 'POST',
      body: JSON.stringify({ blocked }),
    }),

  listCards: (boardId: number) => request<Card[]>(`/api/cards?boardId=${boardId}`),
  searchCards: (q: string) =>
    request<SearchCard[]>(`/api/cards/search?q=${encodeURIComponent(q)}`),
  createCard: (payload: CardPayload) =>
    request<Card>('/api/cards', { method: 'POST', body: JSON.stringify(payload) }),
  updateCard: (id: number, payload: CardPayload) =>
    request<Card>(`/api/cards/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
  deleteCard: (id: number) => request<null>(`/api/cards/${id}`, { method: 'DELETE' }),

  listBoards: () => request<Board[]>('/api/boards'),
  createBoard: (name: string) =>
    request<Board>('/api/boards', { method: 'POST', body: JSON.stringify({ name }) }),
  updateBoard: (id: number, name: string) =>
    request<Board>(`/api/boards/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteBoard: (id: number) => request<null>(`/api/boards/${id}`, { method: 'DELETE' }),

  listStatuses: (boardId: number) => request<Status[]>(`/api/statuses?boardId=${boardId}`),
  createStatus: (name: string, boardId: number) =>
    request<Status>('/api/statuses', { method: 'POST', body: JSON.stringify({ name, boardId }) }),
  updateStatus: (id: number, name: string) =>
    request<Status>(`/api/statuses/${id}`, { method: 'PUT', body: JSON.stringify({ name }) }),
  deleteStatus: (id: number, reassignTo?: string) =>
    request<null>(
      `/api/statuses/${id}${reassignTo ? `?reassignTo=${encodeURIComponent(reassignTo)}` : ''}`,
      { method: 'DELETE' }
    ),
  reorderStatuses: (boardId: number, orderedIds: number[]) =>
    request<Status[]>('/api/statuses/reorder', {
      method: 'POST',
      body: JSON.stringify({ boardId, orderedIds }),
    }),

  listHistory: (id: number) => request<CardHistoryEntry[]>(`/api/cards/${id}/history`),
  listComments: (id: number) => request<CardComment[]>(`/api/cards/${id}/comments`),
  addComment: (id: number, body: string) =>
    request<CardComment>(`/api/cards/${id}/comments`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
};
