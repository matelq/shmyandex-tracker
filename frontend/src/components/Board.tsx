import { useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { api, Card } from "../api";
import { useAuth } from "../context/AuthContext";
import CardItem from "./Card";
import CardModal from "./CardModal";

const COLUMNS = [
  { status: "todo", title: "К выполнению", icon: "📋" },
  { status: "in_progress", title: "В работе", icon: "⚙️" },
  { status: "done", title: "Выполнено", icon: "✅" },
] as const;

type ModalState =
  | { type: "edit"; card: Card }
  | { type: "create"; defaultStatus: string }
  | null;

export default function Board() {
  const { user, logout } = useAuth();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [modal, setModal] = useState<ModalState>(null);

  useEffect(() => {
    api
      .listCards()
      .then(setCards)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const byStatus = useMemo(() => {
    const map: Record<string, Card[]> = { todo: [], in_progress: [], done: [] };
    for (const c of cards) (map[c.status] ??= []).push(c);
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return map;
  }, [cards]);

  async function handleDragEnd(result: DropResult) {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    const id = Number(draggableId);
    const fromStatus = source.droppableId;
    const toStatus = destination.droppableId;
    const snapshot = cards;

    const cols: Record<string, Card[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };
    for (const c of cards) cols[c.status].push({ ...c });
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
          onClick={() => setModal({ type: "create", defaultStatus: "todo" })}
          className="btn-1c flex items-center gap-1"
        >
          <span className="text-1c-success font-bold">+</span> Создать
        </button>
        <div className="toolbar-separator" />
        <button
          onClick={() => {
            api
              .listCards()
              .then(setCards)
              .catch((e: Error) => setError(e.message));
          }}
          className="btn-1c flex items-center gap-1"
        >
          &#8635; Обновить
        </button>
        <div className="flex-1" />

        <span className="text-1c-sm text-1c-text-secondary px-2">
          {user?.name}
        </span>
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
              {COLUMNS.map((col) => (
                <div
                  key={col.status}
                  className="w-80 bg-1c-surface shadow-1c-etched flex flex-col"
                >
                  {/* Column header */}
                  <div className="bg-1c-toolbar-bg shadow-1c-raised px-3 py-1.5 flex items-center gap-2">
                    <span className="text-sm">{col.icon}</span>
                    <span className="font-bold text-1c-sm text-1c-text">
                      {col.title}
                    </span>
                    <span className="text-1c-xs text-1c-text-muted ml-auto panel-1c px-1.5">
                      {byStatus[col.status]?.length ?? 0}
                    </span>
                  </div>

                  <Droppable droppableId={col.status}>
                    {(provided, snapshot) => (
                      <div
                        ref={provided.innerRef}
                        {...provided.droppableProps}
                        className={`px-1.5 py-1 min-h-[60px] transition-colors ${
                          snapshot.isDraggingOver ? "bg-[#E8E8FF]" : ""
                        }`}
                      >
                        {byStatus[col.status]?.map((card, index) => (
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

                  <button
                    onClick={() =>
                      setModal({ type: "create", defaultStatus: col.status })
                    }
                    className="text-left text-1c-sm text-1c-link hover:underline px-3 py-1.5 border-t border-1c-border-light bg-transparent cursor-pointer"
                  >
                    + Добавить задачу
                  </button>
                </div>
              ))}
            </div>
          </div>
        </DragDropContext>
      )}

      {/* Status bar */}
      <div className="bg-1c-status-bar border-t border-1c-border px-1 flex text-1c-xs text-1c-text-muted">
        <div className="panel-1c flex-1 px-2 py-0.5">
          Задач: {cards.length} | К выполнению: {byStatus.todo?.length ?? 0} | В
          работе: {byStatus.in_progress?.length ?? 0} | Выполнено:{" "}
          {byStatus.done?.length ?? 0}
        </div>
        <div className="panel-1c px-2 py-0.5">Пользователь: {user?.name}</div>
      </div>

      {modal && (
        <CardModal
          card={modal.type === "edit" ? modal.card : null}
          defaultStatus={
            modal.type === "create" ? modal.defaultStatus : undefined
          }
          onClose={() => setModal(null)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
