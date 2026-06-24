import { FormEvent, useEffect, useState } from 'react';
import { api, Card, CardComment, CardHistoryEntry, CardPayload, Status, User } from '../api';

const FIELD_LABELS: Record<string, string> = {
  title: 'Наименование',
  description: 'Описание',
  assignee: 'Ответственный',
  status: 'Состояние',
};

function fmtDate(iso: string): string {
  // На бэкенде даты в UTC ('YYYY-MM-DD HH:MM:SS')
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('ru-RU');
}

interface Props {
  card: Card | null;
  defaultStatus?: string;
  statuses: Status[];
  onClose: () => void;
  onSave: (values: CardPayload) => void;
  onDelete: (card: Card) => void;
}

export default function CardModal({
  card,
  defaultStatus = 'todo',
  statuses,
  onClose,
  onSave,
  onDelete,
}: Props) {
  const statusLabels = Object.fromEntries(statuses.map((s) => [s.key, s.name]));

  function fmtValue(field: string | null, value: string | null): string {
    if (value == null || value === '') return '(пусто)';
    if (field === 'status') return statusLabels[value] ?? value;
    return value;
  }

  function describeHistory(entry: CardHistoryEntry): string {
    if (entry.action === 'created') return 'создал(а) задачу';
    const field = entry.field ? FIELD_LABELS[entry.field] ?? entry.field : 'поле';
    return `изменил(а) «${field}»: ${fmtValue(entry.field, entry.oldValue)} → ${fmtValue(
      entry.field,
      entry.newValue
    )}`;
  }

  const isEdit = card !== null;
  const [title, setTitle] = useState(card?.title ?? '');
  const [description, setDescription] = useState(card?.description ?? '');
  const [assignee, setAssignee] = useState(card?.assignee ?? '');
  const [status, setStatus] = useState(card?.status ?? defaultStatus);
  const [error, setError] = useState('');

  const [history, setHistory] = useState<CardHistoryEntry[]>([]);
  const [comments, setComments] = useState<CardComment[]>([]);
  const [commentBody, setCommentBody] = useState('');
  const [activityError, setActivityError] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);

  const [users, setUsers] = useState<User[]>([]);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const filteredUsers = users.filter((u) => {
    const q = assignee.trim().toLowerCase();
    if (!q) return true;
    return u.name.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  useEffect(() => {
    let cancelled = false;
    api
      .listUsers()
      .then((u) => {
        if (!cancelled) setUsers(u);
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Загружаем историю и комментарии для существующей задачи.
  useEffect(() => {
    if (card === null) return;
    let cancelled = false;
    Promise.all([api.listHistory(card.id), api.listComments(card.id)])
      .then(([h, c]) => {
        if (cancelled) return;
        setHistory(h);
        setComments(c);
      })
      .catch((e: Error) => {
        if (!cancelled) setActivityError(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [card]);

  async function handleAddComment(e: FormEvent) {
    e.preventDefault();
    if (!card || !commentBody.trim()) return;
    setSubmittingComment(true);
    setActivityError('');
    try {
      const created = await api.addComment(card.id, commentBody.trim());
      setComments((prev) => [...prev, created]);
      setCommentBody('');
    } catch (err) {
      setActivityError((err as Error).message);
    } finally {
      setSubmittingComment(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setError('Поле "Наименование" обязательно для заполнения');
      return;
    }
    if (assignee.trim() && !users.some((u) => u.name === assignee.trim())) {
      setError('Выберите ответственного из списка существующих пользователей');
      return;
    }
    onSave({ title: title.trim(), description, assignee: assignee.trim(), status });
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 font-1c"
      onMouseDown={onClose}
    >
      <div
        className={`w-full ${isEdit ? 'max-w-2xl' : 'max-w-lg'} max-h-[90vh] flex flex-col bg-1c-bg shadow-1c-raised`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Title bar */}
        <div className="titlebar-1c flex items-center justify-between">
          <span>{isEdit ? `Задача №${card.id} — Редактирование` : 'Задача (создание)'}</span>
          <button
            aria-label="Закрыть"
            onClick={onClose}
            className="text-white/80 hover:text-white text-sm leading-none"
          >
            &#10005;
          </button>
        </div>

        {/* Toolbar */}
        <div className="bg-1c-toolbar-bg border-b border-1c-border-light px-1 py-1 flex items-center gap-0.5">
          <button type="button" onClick={handleSubmit as any} className="btn-1c flex items-center gap-1">
            &#128190; Записать
          </button>
          <button
            type="button"
            onClick={() => { handleSubmit({ preventDefault: () => {} } as any); }}
            className="btn-1c flex items-center gap-1"
          >
            &#9989; Записать и закрыть
          </button>
          {isEdit && (
            <>
              <div className="toolbar-separator" />
              <button
                type="button"
                onClick={() => onDelete(card)}
                className="btn-1c flex items-center gap-1 text-1c-danger"
              >
                &#128465; Пометить на удаление
              </button>
            </>
          )}
        </div>

        {/* Form body */}
        <div className="p-3 bg-1c-surface overflow-y-auto flex-1">
          <form onSubmit={handleSubmit}>
            <table className="w-full text-1c-base">
              <tbody>
                <tr>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-1c-text-secondary align-top w-[130px]">
                    Наименование:
                  </td>
                  <td className="py-1.5">
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      autoFocus
                      className="input-1c w-full"
                      placeholder="Введите наименование задачи"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-1c-text-secondary align-top">
                    Описание:
                  </td>
                  <td className="py-1.5">
                    <textarea
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                      rows={5}
                      className="input-1c w-full resize-none"
                      placeholder="Подробное описание задачи"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-1c-text-secondary">
                    Ответственный:
                  </td>
                  <td className="py-1.5">
                    <div className="relative">
                      <input
                        type="text"
                        value={assignee}
                        autoComplete="off"
                        onChange={(e) => {
                          setAssignee(e.target.value);
                          setAssigneeOpen(true);
                        }}
                        onFocus={() => setAssigneeOpen(true)}
                        onBlur={() => setTimeout(() => setAssigneeOpen(false), 150)}
                        className="input-1c w-full pr-6"
                        placeholder="Начните вводить имя или email..."
                        role="combobox"
                        aria-expanded={assigneeOpen}
                      />
                      {assignee && (
                        <button
                          type="button"
                          aria-label="Очистить ответственного"
                          onClick={() => setAssignee('')}
                          className="absolute right-1 top-1/2 -translate-y-1/2 text-1c-text-muted hover:text-1c-danger text-1c-xs"
                        >
                          &#10005;
                        </button>
                      )}
                      {assigneeOpen && (
                        <ul className="absolute left-0 right-0 mt-0.5 z-20 max-h-40 overflow-y-auto bg-1c-input-bg border border-1c-border shadow-1c-raised">
                          {filteredUsers.length === 0 ? (
                            <li className="px-2 py-1 text-1c-xs text-1c-text-muted">
                              Пользователи не найдены
                            </li>
                          ) : (
                            filteredUsers.map((u) => (
                              <li key={u.id}>
                                <button
                                  type="button"
                                  onMouseDown={(e) => {
                                    e.preventDefault();
                                    setAssignee(u.name);
                                    setAssigneeOpen(false);
                                  }}
                                  className="w-full text-left px-2 py-1 text-1c-sm hover:bg-[#E8E8FF] flex justify-between gap-2"
                                >
                                  <span className="text-1c-text">{u.name}</span>
                                  <span className="text-1c-xs text-1c-text-muted truncate">
                                    {u.email}
                                  </span>
                                </button>
                              </li>
                            ))
                          )}
                        </ul>
                      )}
                    </div>
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-1c-text-secondary">
                    Состояние:
                  </td>
                  <td className="py-1.5">
                    <select
                      value={status}
                      onChange={(e) => setStatus(e.target.value)}
                      className="input-1c"
                    >
                      {statuses.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.name}
                          {s.isArchive ? ' (архив)' : ''}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              </tbody>
            </table>

            {error && (
              <div className="mt-2 p-1.5 bg-[#FFF0F0] border border-1c-danger text-1c-danger text-1c-sm">
                &#9888; {error}
              </div>
            )}

            <div className="flex items-center justify-end gap-1 mt-3 pt-3 border-t border-1c-border-light">
              <button type="submit" className="btn-1c-primary">
                Записать
              </button>
              <button type="button" onClick={onClose} className="btn-1c">
                Закрыть
              </button>
            </div>
          </form>

          {isEdit && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* История изменений */}
              <section className="panel-1c p-2">
                <h3 className="font-bold text-1c-sm text-1c-text mb-2 flex items-center gap-1">
                  &#128220; История изменений
                </h3>
                {history.length === 0 ? (
                  <p className="text-1c-xs text-1c-text-muted">Изменений пока нет.</p>
                ) : (
                  <ul className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                    {history.map((h) => (
                      <li key={h.id} className="text-1c-xs text-1c-text-secondary leading-snug">
                        <span className="font-semibold text-1c-text">{h.userName}</span>{' '}
                        {describeHistory(h)}
                        <div className="text-1c-text-muted">{fmtDate(h.createdAt)}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {/* Комментарии */}
              <section className="panel-1c p-2 flex flex-col">
                <h3 className="font-bold text-1c-sm text-1c-text mb-2 flex items-center gap-1">
                  &#128172; Комментарии ({comments.length})
                </h3>
                {comments.length === 0 ? (
                  <p className="text-1c-xs text-1c-text-muted mb-2">
                    Комментариев пока нет. Будьте первым!
                  </p>
                ) : (
                  <ul className="space-y-2 max-h-40 overflow-y-auto pr-1 mb-2">
                    {comments.map((c) => (
                      <li key={c.id} className="text-1c-xs leading-snug">
                        <div className="flex items-baseline justify-between gap-2">
                          <span className="font-semibold text-1c-text">{c.userName}</span>
                          <span className="text-1c-text-muted whitespace-nowrap">
                            {fmtDate(c.createdAt)}
                          </span>
                        </div>
                        <div className="text-1c-text-secondary whitespace-pre-wrap break-words">
                          {c.body}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}

                <form onSubmit={handleAddComment} className="mt-auto flex flex-col gap-1">
                  <textarea
                    value={commentBody}
                    onChange={(e) => setCommentBody(e.target.value)}
                    rows={2}
                    className="input-1c w-full resize-none"
                    placeholder="Добавить комментарий..."
                  />
                  <button
                    type="submit"
                    disabled={submittingComment || !commentBody.trim()}
                    className="btn-1c self-end disabled:opacity-50"
                  >
                    Отправить
                  </button>
                </form>
              </section>

              {activityError && (
                <div className="md:col-span-2 p-1.5 bg-[#FFF0F0] border border-1c-danger text-1c-danger text-1c-sm">
                  &#9888; {activityError}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div className="bg-1c-status-bar border-t border-1c-border px-2 py-0.5 text-1c-xs text-1c-text-muted">
          {isEdit ? `Объект: Задача №${card.id}` : 'Новый объект'}
        </div>
      </div>
    </div>
  );
}
