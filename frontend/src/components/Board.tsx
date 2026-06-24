import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { api, Card, Status } from "../api";
import { useAuth } from "../context/AuthContext";
import CardItem from "./Card";
import CardModal from "./CardModal";

type ModalState =
  | { type: "edit"; card: Card }
  | { type: "create"; defaultStatus: string }
  | null;

export default function Board() {
  const { user, logout } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>(null);
  const [showArchive, setShowArchive] = useState(false);

  // Управление статусами
  const [addingStatus, setAddingStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");

  function reload() {
    return Promise.all([api.listCards(), api.listStatuses()])
      .then(([c, s]) => {
        setCards(c);
        setStatuses(s);
      })
      .catch((e: Error) => setError(e.message));
  }

  useEffect(() => {
    reload().finally(() => setLoading(false));
  }, []);

  const archive = useMemo(() => statuses.find((s) => s.isArchive) ?? null, [statuses]);
  const columns = useMemo(
    () => statuses.filter((s) => !s.isArchive).sort((a, b) => a.position - b.position),
    [statuses],
  );

  // Колонки, отображаемые на доске (с учётом переключателя архива)
  const visibleColumns = useMemo(
    () => (showArchive && archive ? [...columns, archive] : columns),
    [columns, archive, showArchive],
  );

  const byStatus = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const s of statuses) map[s.key] = [];
    for (const c of cards) (map[c.status] ??= []).push(c);
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return map;
  }, [cards, statuses]);

  function countInStatus(key: string): number {
    return cards.filter((c) => c.status === key).length;
  }

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const fromStatus = source.droppableId;
    const toStatus = destination.droppableId;
    const snapshot = cards;

    const cols: Record<string, Card[]> = {};
    for (const s of statuses) cols[s.key] = [];
    for (const c of cards) (cols[c.status] ??= []).push({ ...c });
    for (const key of Object.keys(cols))
      cols[key].sort((a, b) => a.position - b.position || a.id - b.id);

    const [moved] = cols[fromStatus].splice(source.index, 1);
    moved.status = toStatus;
    cols[toStatus].splice(destination.index, 0, moved);

    const affected = new Set([fromStatus, toStatus]);
    for (const status of affected)
      cols[status].forEach((c, i) => {
        c.position = i + 1;
      });

    const updated = Object.values(cols).flat();
    setCards(updated);

    try {
      const toPersist: Card[] = [];
      for (const status of affected) {
        for (const c of cols[status]) {
          const orig = snapshot.find((o) => o.id === c.id);
          if (!orig || orig.status !== c.status || orig.position !== c.position)
            toPersist.push(c);
        }
      }
      await Promise.all(
        toPersist.map((c) =>
          api.updateCard(c.id, {
            title: c.title,
            description: c.description,
            assignee: c.assignee,
            status: c.status,
            position: c.position,
          }),
        ),
      );
    } catch (e) {
      setError((e as Error).message);
      setCards(snapshot);
    }
  }

  async function handleSave(values: Parameters<typeof api.createCard>[0]) {
    try {
      if (modal?.type === "edit") {
        const updated = await api.updateCard(modal.card.id, values);
        setCards((prev) =>
          prev.map((c) => (c.id === updated.id ? updated : c)),
        );
      } else {
        const created = await api.createCard(values);
        setCards((prev) => [...prev, created]);
      }
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDelete(card: Card) {
    try {
      await api.deleteCard(card.id);
      setCards((prev) => prev.filter((c) => c.id !== card.id));
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // --- Управление статусами ---

  async function handleAddStatus() {
    const name = newStatusName.trim();
    if (!name) return;
    try {
      const created = await api.createStatus(name);
      setStatuses((prev) => [...prev, created]);
      setNewStatusName("");
      setAddingStatus(false);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRename(id: number) {
    const name = renameValue.trim();
    if (!name) {
      setRenamingId(null);
      return;
    }
    try {
      const updated = await api.updateStatus(id, name);
      setStatuses((prev) => prev.map((s) => (s.id === id ? updated : s)));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRenamingId(null);
    }
  }

  function requestDelete(status: Status) {
    if (countInStatus(status.key) > 0) {
      setReassignTo(archive?.key ?? "");
      setDeleting(status);
    } else if (window.confirm(`Удалить статус «${status.name}»?`)) {
      void doDeleteStatus(status, undefined);
    }
  }

  async function doDeleteStatus(status: Status, target?: string) {
    try {
      await api.deleteStatus(status.id, target);
      setDeleting(null);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-1c-bg font-1c">
      {/* Title bar */}
      <div className="titlebar-1c flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>&#128203;</span>
          <span>Шмяндекс трекер — Управление задачами</span>
        </div>
        <div className="flex gap-1" />
      </div>

      {/* Menu bar */}
      <div className="bg-1c-surface border-b border-1c-border-light px-1 py-0.5 flex gap-0.5 text-1c-sm">
        <span className="px-2 py-0.5 cursor-default">Файл</span>
        <span className="px-2 py-0.5 cursor-default">Правка</span>
        <span className="px-2 py-0.5 cursor-default">Операции</span>
        <span className="px-2 py-0.5 cursor-default">Сервис</span>
        <span className="px-2 py-0.5 cursor-default">Окна</span>
        <span className="px-2 py-0.5 cursor-default">Справка</span>
      </div>

      {/* Toolbar */}
      <div className="bg-1c-toolbar-bg border-b border-1c-border-light px-1 py-1 flex items-center gap-0.5">
        <button
          onClick={() =>
            setModal({ type: "create", defaultStatus: columns[0]?.key ?? "" })
          }
          className="btn-1c flex items-center gap-1"
        >
          <span className="text-1c-success font-bold">+</span> Создать
        </button>
        <div className="toolbar-separator" />
        <button onClick={() => void reload()} className="btn-1c flex items-center gap-1">
          &#8635; Обновить
        </button>
        <div className="toolbar-separator" />
        <button
          onClick={() => setShowArchive((v) => !v)}
          className="btn-1c flex items-center gap-1"
        >
          &#128451; {showArchive ? "Скрыть архив" : "Показать архив"}
          {archive ? ` (${countInStatus(archive.key)})` : ""}
        </button>
        <div className="flex-1" />

        <span className="text-1c-sm text-1c-text-secondary px-2">{user?.name}</span>
        <div className="toolbar-separator" />
        <button onClick={logout} className="btn-1c flex items-center gap-1">
          &#128682; Завершить работу
        </button>
      </div>

      {/* Error bar */}
      {error && (
        <div className="bg-[#FFF0F0] border-b border-1c-danger text-1c-danger text-1c-sm px-3 py-1 flex justify-between items-center">
          <span>&#9888; {error}</span>
          <button onClick={() => setError("")} className="btn-1c text-1c-xs">
            Закрыть
          </button>
        </div>
      )}

      {/* Main content */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-1c-text-muted text-1c-base">
          Получение данных... Пожалуйста, подождите.
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto p-2">
            <div className="flex gap-2 items-start min-w-max">
              {visibleColumns.map((col) => (
                <div
                  key={col.key}
                  className="w-80 bg-1c-surface shadow-1c-etched flex flex-col"
                >
                  {/* Column header */}
                  <div className="bg-1c-toolbar-bg shadow-1c-raised px-3 py-1.5 flex items-center gap-2">
                    {col.isArchive && <span className="text-sm">&#128451;</span>}
                    {renamingId === col.id ? (
                      <input
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onBlur={() => void handleRename(col.id)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename(col.id);
                          if (e.key === "Escape") setRenamingId(null);
                        }}
                        className="input-1c flex-1 text-1c-sm py-0"
                      />
                    ) : (
                      <span className="font-bold text-1c-sm text-1c-text">
                        {col.name}
                      </span>
                    )}
                    <span className="text-1c-xs text-1c-text-muted ml-auto panel-1c px-1.5">
                      {byStatus[col.key]?.length ?? 0}
                    </span>
                    {!col.isArchive && renamingId !== col.id && (
                      <span className="flex gap-0.5">
                        <button
                          aria-label={`Переименовать статус ${col.name}`}
                          title="Переименовать"
                          onClick={() => {
                            setRenameValue(col.name);
                            setRenamingId(col.id);
                          }}
                          className="text-1c-xs text-1c-text-muted hover:text-1c-text"
                        >
                          &#9998;
                        </button>
                        <button
                          aria-label={`Удалить статус ${col.name}`}
                          title="Удалить статус"
                          onClick={() => requestDelete(col)}
                          className="text-1c-xs text-1c-text-muted hover:text-1c-danger"
                        >
                          &#10005;
                        </button>
                      </span>
                    )}
                  </div>

                  <Droppable droppableId={col.key}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`px-1.5 py-1 min-h-[60px] transition-colors ${
                          snapshot.isDraggingOver ? "bg-[#E8E8FF]" : ""
                        }`}
                      >
                        {byStatus[col.key]?.map((card, index) => (
                          <CardItem
                            key={card.id}
                            card={card}
                            index={index}
                            onClick={(c) => setModal({ type: "edit", card: c })}
                          />
                        ))}
                        {provided.placeholder}
                      </div>
                    )}
                  </Droppable>

                  {!col.isArchive && (
                    <button
                      onClick={() =>
                        setModal({ type: "create", defaultStatus: col.key })
                      }
                      className="text-left text-1c-sm text-1c-link hover:underline px-3 py-1.5 border-t border-1c-border-light bg-transparent cursor-pointer"
                    >
                      + Добавить задачу
                    </button>
                  )}
                </div>
              ))}

              {/* Колонка добавления нового статуса */}
              <div className="w-64 shrink-0">
                {addingStatus ? (
                  <div className="bg-1c-surface shadow-1c-etched p-2 flex flex-col gap-1">
                    <input
                      autoFocus
                      value={newStatusName}
                      onChange={(e) => setNewStatusName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") void handleAddStatus();
                        if (e.key === "Escape") {
                          setAddingStatus(false);
                          setNewStatusName("");
                        }
                      }}
                      placeholder="Название статуса"
                      className="input-1c w-full"
                    />
                    <div className="flex gap-1 justify-end">
                      <button onClick={() => void handleAddStatus()} className="btn-1c-primary">
                        Добавить
                      </button>
                      <button
                        onClick={() => {
                          setAddingStatus(false);
                          setNewStatusName("");
                        }}
                        className="btn-1c"
                      >
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingStatus(true)}
                    className="w-full text-left text-1c-sm text-1c-link hover:underline px-3 py-2 bg-1c-surface shadow-1c-etched cursor-pointer"
                  >
                    + Добавить статус
                  </button>
                )}
              </div>
            </div>
          </div>
        </DragDropContext>
      )}

      {/* Status bar */}
      <div className="bg-1c-status-bar border-t border-1c-border px-1 flex text-1c-xs text-1c-text-muted">
        <div className="panel-1c flex-1 px-2 py-0.5">
          Задач: {cards.length}
          {columns.map((c) => ` | ${c.name}: ${byStatus[c.key]?.length ?? 0}`).join("")}
        </div>
        <div className="panel-1c px-2 py-0.5">Пользователь: {user?.name}</div>
      </div>

      {modal && (
        <CardModal
          card={modal.type === "edit" ? modal.card : null}
          defaultStatus={
            modal.type === "create" ? modal.defaultStatus : undefined
          }
          statuses={statuses}
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}

      {/* Диалог удаления статуса с задачами */}
      {deleting && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 font-1c"
          onMouseDown={() => setDeleting(null)}
        >
          <div
            className="w-full max-w-md bg-1c-bg shadow-1c-raised"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="titlebar-1c flex items-center justify-between">
              <span>Удаление статуса «{deleting.name}»</span>
              <button
                aria-label="Закрыть"
                onClick={() => setDeleting(null)}
                className="text-white/80 hover:text-white text-sm leading-none"
              >
                &#10005;
              </button>
            </div>
            <div className="p-3 bg-1c-surface text-1c-base">
              <p className="mb-3">
                В статусе{" "}
                <b>{countInStatus(deleting.key)}</b> задач(и). Куда их переместить?
              </p>
              <label className="block mb-2 text-1c-text-secondary">
                Переместить задачи в:
                <select
                  value={reassignTo}
                  onChange={(e) => setReassignTo(e.target.value)}
                  className="input-1c w-full mt-1"
                >
                  {statuses
                    .filter((s) => s.key !== deleting.key)
                    .sort((a, b) => Number(a.isArchive) - Number(b.isArchive) || a.position - b.position)
                    .map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.name}
                        {s.isArchive ? " (архив)" : ""}
                      </option>
                    ))}
                </select>
              </label>
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-1c-border-light">
                <button
                  onClick={() => void doDeleteStatus(deleting, reassignTo)}
                  disabled={!reassignTo}
                  className="btn-1c-primary disabled:opacity-50"
                >
                  Переместить и удалить
                </button>
                <button onClick={() => setDeleting(null)} className="btn-1c">
                  Отмена
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
