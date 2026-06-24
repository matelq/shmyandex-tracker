import { MouseEvent as ReactMouseEvent, useEffect, useMemo, useState } from "react";
import { DragDropContext, Droppable, DropResult } from "@hello-pangea/dnd";
import { api, Board as BoardType, Card, SearchCard, Status, User } from "../api";
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
  const [panelWidth, setPanelWidth] = useState(360);

  // Доски
  const [boards, setBoards] = useState<BoardType[]>([]);
  const [boardId, setBoardId] = useState<number | null>(null);
  const [pendingOpenCardId, setPendingOpenCardId] = useState<number | null>(null);

  // Поиск (по всем доскам)
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchCard[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);

  // Фильтры на доске
  const [filterAuthor, setFilterAuthor] = useState("");
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  // Управление статусами
  const [addingStatus, setAddingStatus] = useState(false);
  const [newStatusName, setNewStatusName] = useState("");
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [deleting, setDeleting] = useState<Status | null>(null);
  const [reassignTo, setReassignTo] = useState<string>("");

  // Администрирование пользователей (только для администратора, id = 1)
  const isAdmin = user?.id === 1;
  const [createUserOpen, setCreateUserOpen] = useState(false);
  const [usersListOpen, setUsersListOpen] = useState(false);
  const [newUser, setNewUser] = useState({ email: "", name: "", password: "" });
  const [userMsg, setUserMsg] = useState("");
  const [usersList, setUsersList] = useState<User[]>([]);

  function loadUsers() {
    api
      .listUsers()
      .then(setUsersList)
      .catch((e: Error) => setUserMsg(e.message));
  }

  function reload(bid = boardId) {
    if (!bid) return Promise.resolve();
    return Promise.all([api.listCards(bid), api.listStatuses(bid)])
      .then(([c, s]) => {
        setCards(c);
        setStatuses(s);
      })
      .catch((e: Error) => setError(e.message));
  }

  // Первичная загрузка: список досок + выбор первой.
  useEffect(() => {
    api
      .listBoards()
      .then((bs) => {
        setBoards(bs);
        setBoardId((cur) => cur ?? bs[0]?.id ?? null);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  // Перезагрузка карточек и статусов при смене текущей доски.
  useEffect(() => {
    if (boardId) void reload(boardId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardId]);

  // Поиск по названию по всем доскам.
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    api
      .searchCards(q)
      .then((r) => {
        if (!cancelled) setSearchResults(r);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [searchQuery]);

  // Отложенное открытие карточки после перехода на её доску (из поиска).
  useEffect(() => {
    if (pendingOpenCardId == null) return;
    const card = cards.find((c) => c.id === pendingOpenCardId);
    if (card) {
      setModal({ type: "edit", card });
      setPendingOpenCardId(null);
    }
  }, [cards, pendingOpenCardId]);

  // Группировка результатов: сначала текущая доска (без архива), затем архив
  // текущей доски, затем другие доски. Внутри групп — совпадения с начала выше.
  const searchGroups = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const byRank = (a: SearchCard, b: SearchCard) => {
      const aStart = a.title.toLowerCase().startsWith(q) ? 0 : 1;
      const bStart = b.title.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStart !== bStart) return aStart - bStart;
      return a.title.localeCompare(b.title);
    };
    const current = searchResults
      .filter((c) => c.boardId === boardId && !c.archived)
      .sort(byRank);
    const archived = searchResults
      .filter((c) => c.boardId === boardId && c.archived)
      .sort(byRank);
    const other = searchResults.filter((c) => c.boardId !== boardId).sort(byRank);
    return { current, archived, other };
  }, [searchResults, searchQuery, boardId]);

  const hasResults =
    searchGroups.current.length + searchGroups.archived.length + searchGroups.other.length > 0;

  function openSearchResult(card: Card) {
    setSearchOpen(false);
    setSearchQuery("");
    if (card.boardId === boardId) {
      setModal({ type: "edit", card });
    } else {
      setPendingOpenCardId(card.id);
      setBoardId(card.boardId);
    }
  }

  const boardName = boards.find((b) => b.id === boardId)?.name ?? "";

  // Открыть задачу в отдельной вкладке браузера (standalone-страница).
  function openTaskInNewTab(card: Card) {
    const url = `${window.location.pathname}?task=${card.id}&board=${card.boardId}`;
    window.open(url, "_blank", "noopener");
  }

  // Изменение ширины правой панели перетягиванием её левой границы.
  function startPanelResize(e: ReactMouseEvent) {
    e.preventDefault();
    const move = (ev: globalThis.MouseEvent) => {
      const w = window.innerWidth - ev.clientX;
      setPanelWidth(Math.min(720, Math.max(280, w)));
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.userSelect = "";
    };
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  function renderSearchResult(c: SearchCard, showBoard: boolean) {
    return (
      <li key={c.id}>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            openSearchResult(c);
          }}
          className="w-full text-left px-2 py-1 text-1c-sm hover:bg-[#E8E8FF] flex items-center gap-2"
        >
          <span className="text-1c-text flex-1 truncate">{c.title}</span>
          <span className="text-1c-xs text-1c-text-secondary panel-1c px-1 whitespace-nowrap">
            {c.statusName}
          </span>
          {showBoard && (
            <span className="text-1c-xs text-1c-text-muted whitespace-nowrap">{c.boardName}</span>
          )}
        </button>
      </li>
    );
  }

  async function handleAddBoard() {
    const name = window.prompt("Название новой доски:")?.trim();
    if (!name) return;
    try {
      const created = await api.createBoard(name);
      setBoards((prev) => [...prev, created]);
      setBoardId(created.id);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleRenameBoard() {
    if (!boardId) return;
    const name = window.prompt("Новое название доски:", boardName)?.trim();
    if (!name) return;
    try {
      const updated = await api.updateBoard(boardId, name);
      setBoards((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleDeleteBoard() {
    if (!boardId) return;
    if (boards.length <= 1) {
      setError("Нельзя удалить единственную доску");
      return;
    }
    if (!window.confirm(`Удалить доску «${boardName}» со всеми её задачами и статусами?`)) return;
    try {
      await api.deleteBoard(boardId);
      const rest = boards.filter((b) => b.id !== boardId);
      setBoards(rest);
      setBoardId(rest[0]?.id ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  function clearFilters() {
    setFilterAuthor("");
    setFilterAssignee("");
    setFilterFrom("");
    setFilterTo("");
  }

  const archive = useMemo(() => statuses.find((s) => s.isArchive) ?? null, [statuses]);
  const columns = useMemo(
    () => statuses.filter((s) => !s.isArchive).sort((a, b) => a.position - b.position),
    [statuses],
  );

  // Колонки, отображаемые на доске (с учётом переключателя архива).
  // Архив показывается слева от обычных колонок.
  const visibleColumns = useMemo(
    () => (showArchive && archive ? [archive, ...columns] : columns),
    [columns, archive, showArchive],
  );

  // Уникальные авторы и исполнители (для выпадающих списков фильтра).
  const authors = useMemo(
    () => [...new Set(cards.map((c) => c.author).filter(Boolean))].sort(),
    [cards],
  );
  const assignees = useMemo(
    () => [...new Set(cards.map((c) => c.assignee).filter(Boolean))].sort(),
    [cards],
  );
  const filtersActive = !!(filterAuthor || filterAssignee || filterFrom || filterTo);

  // Фильтрация по автору, исполнителю и дате создания (на доске).
  const filteredCards = useMemo(() => {
    return cards.filter((c) => {
      if (filterAuthor && c.author !== filterAuthor) return false;
      if (filterAssignee && c.assignee !== filterAssignee) return false;
      const date = c.createdAt.slice(0, 10); // YYYY-MM-DD (UTC)
      if (filterFrom && date < filterFrom) return false;
      if (filterTo && date > filterTo) return false;
      return true;
    });
  }, [cards, filterAuthor, filterAssignee, filterFrom, filterTo]);

  const byStatus = useMemo(() => {
    const map: Record<string, Card[]> = {};
    for (const s of statuses) map[s.key] = [];
    for (const c of filteredCards) (map[c.status] ??= []).push(c);
    for (const key of Object.keys(map)) {
      map[key].sort((a, b) => a.position - b.position || a.id - b.id);
    }
    return map;
  }, [filteredCards, statuses]);

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
    const movedId = Number(draggableId);
    const snapshot = cards;

    // Полные колонки (по всем карточкам доски, не только отфильтрованным).
    const cols: Record<string, Card[]> = {};
    for (const s of statuses) cols[s.key] = [];
    for (const c of cards) (cols[c.status] ??= []).push({ ...c });
    for (const key of Object.keys(cols))
      cols[key].sort((a, b) => a.position - b.position || a.id - b.id);

    const moved = cols[fromStatus].find((c) => c.id === movedId);
    if (!moved) return;
    cols[fromStatus] = cols[fromStatus].filter((c) => c.id !== movedId);
    moved.status = toStatus;

    // Позицию вставки определяем относительно отображаемого (отфильтрованного)
    // списка целевой колонки, чтобы перетаскивание работало и при фильтрах.
    const destVisible = (byStatus[toStatus] ?? []).filter((c) => c.id !== movedId);
    const anchor = destVisible[destination.index];
    const insertAt = anchor
      ? cols[toStatus].findIndex((c) => c.id === anchor.id)
      : cols[toStatus].length;
    cols[toStatus].splice(insertAt < 0 ? cols[toStatus].length : insertAt, 0, moved);

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
        const created = await api.createCard({ ...values, boardId: boardId ?? undefined });
        setCards((prev) => [...prev, created]);
      }
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  // --- Управление статусами ---

  async function handleAddStatus() {
    const name = newStatusName.trim();
    if (!name || !boardId) return;
    try {
      const created = await api.createStatus(name, boardId);
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

  // Переместить статус влево/вправо среди обычных колонок.
  async function moveStatus(col: Status, dir: -1 | 1) {
    const idx = columns.findIndex((c) => c.id === col.id);
    const target = idx + dir;
    if (target < 0 || target >= columns.length) return;
    if (!boardId) return;
    const reordered = [...columns];
    [reordered[idx], reordered[target]] = [reordered[target], reordered[idx]];
    try {
      const updated = await api.reorderStatuses(boardId, reordered.map((c) => c.id));
      setStatuses(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleCreateUser() {
    const { email, name, password } = newUser;
    if (!email.trim() || !name.trim() || !password) {
      setUserMsg("Заполните все поля");
      return;
    }
    try {
      const created = await api.createUser({
        email: email.trim(),
        name: name.trim(),
        password,
      });
      setUserMsg(`Пользователь «${created.name}» создан`);
      setNewUser({ email: "", name: "", password: "" });
      loadUsers();
    } catch (e) {
      setUserMsg((e as Error).message);
    }
  }

  async function handleToggleBlock(u: User) {
    try {
      const updated = await api.blockUser(u.id, !u.blocked);
      setUsersList((prev) => prev.map((x) => (x.id === updated.id ? updated : x)));
      setUserMsg(
        updated.blocked
          ? `Пользователь «${updated.name}» заблокирован`
          : `Пользователь «${updated.name}» разблокирован`,
      );
    } catch (e) {
      setUserMsg((e as Error).message);
    }
  }

  return (
    <div className="min-h-full flex flex-col bg-1c-bg font-1c">
      {/* Dark compact header — бренд + основные действия + управление + выход */}
      <div className="bg-1c-header-bg text-white flex items-center gap-2 px-3 h-12 flex-shrink-0">
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="w-6 h-6 rounded-md bg-1c-accent flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="#fff">
              <rect x="2" y="3" width="3" height="10" rx="1" />
              <rect x="6.5" y="3" width="3" height="6" rx="1" />
              <rect x="11" y="3" width="3" height="8" rx="1" />
            </svg>
          </span>
          <span className="font-bold text-[15px] tracking-tight">Tracker</span>
        </div>

        <div className="w-px h-5 bg-white/15 mx-1 flex-shrink-0" />

        {/* Основные действия */}
        <button
          onClick={() => setModal({ type: "create", defaultStatus: columns[0]?.key ?? "" })}
          className="btn-1c-primary flex items-center gap-1 flex-shrink-0"
        >
          <span className="font-bold">+</span> Создать
        </button>
        <button
          onClick={() => void reload()}
          className="text-white/80 hover:text-white hover:bg-white/10 rounded px-2 py-1 text-1c-sm flex items-center gap-1 flex-shrink-0"
        >
          &#8635; Обновить
        </button>
        <button
          onClick={() => setShowArchive((v) => !v)}
          className="text-white/80 hover:text-white hover:bg-white/10 rounded px-2 py-1 text-1c-sm flex items-center gap-1 flex-shrink-0"
        >
          &#128451; {showArchive ? "Скрыть архив" : "Показать архив"}
          {archive ? ` (${countInStatus(archive.key)})` : ""}
        </button>

        {/* Поиск по всем доскам */}
        <div className="relative flex-shrink-0">
          <input
            value={searchQuery}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onBlur={() => setTimeout(() => setSearchOpen(false), 150)}
            placeholder="🔍 Поиск задач..."
            className="w-56 h-8 px-2.5 text-1c-sm rounded-md bg-white/10 border border-white/20 text-white placeholder-white/50 outline-none focus:bg-white/15 focus:border-white/40"
            aria-label="Поиск задач по названию"
          />
          {searchOpen && searchQuery.trim() && (
            <div className="absolute left-0 mt-1 z-30 w-96 max-h-80 overflow-y-auto bg-1c-surface border border-1c-border rounded-md shadow-1c-raised text-1c-text">
              {!hasResults ? (
                <div className="px-2 py-1 text-1c-xs text-1c-text-muted">Ничего не найдено</div>
              ) : (
                <>
                  {searchGroups.current.length > 0 && (
                    <ul>{searchGroups.current.map((c) => renderSearchResult(c, false))}</ul>
                  )}
                  {searchGroups.archived.length > 0 && (
                    <>
                      <div className="bg-1c-panel text-1c-xs font-semibold text-1c-text-secondary px-2 py-0.5 border-y border-1c-border-light sticky top-0">
                        &#128451; Архив
                      </div>
                      <ul>{searchGroups.archived.map((c) => renderSearchResult(c, false))}</ul>
                    </>
                  )}
                  {searchGroups.other.length > 0 && (
                    <>
                      <div className="bg-1c-panel text-1c-xs font-semibold text-1c-text-secondary px-2 py-0.5 border-y border-1c-border-light sticky top-0">
                        Другие доски
                      </div>
                      <ul>{searchGroups.other.map((c) => renderSearchResult(c, true))}</ul>
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        <div className="flex-1" />

        {isAdmin && (
          <>
            <button
              onClick={() => {
                setUserMsg("");
                setNewUser({ email: "", name: "", password: "" });
                setCreateUserOpen(true);
              }}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded px-2 py-1 text-1c-sm flex items-center gap-1 flex-shrink-0"
            >
              <span className="text-1c-accent-light font-bold">+</span> Пользователь
            </button>
            <button
              onClick={() => {
                setUserMsg("");
                loadUsers();
                setUsersListOpen(true);
              }}
              className="text-white/80 hover:text-white hover:bg-white/10 rounded px-2 py-1 text-1c-sm flex items-center gap-1 flex-shrink-0"
            >
              &#128100; Пользователи
            </button>
            <div className="w-px h-4 bg-white/15 mx-1 flex-shrink-0" />
          </>
        )}
        <span className="text-1c-sm text-white/70 px-1 whitespace-nowrap">
          {user?.name}
          {isAdmin ? " · админ" : ""}
        </span>
        <button
          onClick={logout}
          className="text-white/80 hover:text-white hover:bg-white/10 rounded px-2 py-1 text-1c-sm flex items-center gap-1 flex-shrink-0"
        >
          &#128682; Выход
        </button>
      </div>

      {/* Boards bar — вкладки досок */}
      <div className="bg-1c-surface border-b border-1c-border-light px-1 py-1 flex items-center gap-1 overflow-x-auto">
        <span className="text-1c-xs text-1c-text-muted px-1 whitespace-nowrap">Доски:</span>
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => setBoardId(b.id)}
            className={`text-1c-sm px-2.5 py-1 rounded-md whitespace-nowrap border ${
              b.id === boardId
                ? "bg-1c-selected border-transparent text-1c-selected-text font-semibold"
                : "border-transparent text-1c-text-secondary hover:bg-1c-panel"
            }`}
          >
            {b.name}
          </button>
        ))}
        <div className="toolbar-separator" />
        <button onClick={() => void handleAddBoard()} className="btn-1c text-1c-xs whitespace-nowrap">
          <span className="text-1c-success font-bold">+</span> Доска
        </button>
        <button
          onClick={() => void handleRenameBoard()}
          disabled={!boardId}
          className="btn-1c text-1c-xs"
          title="Переименовать доску"
        >
          &#9998;
        </button>
        <button
          onClick={() => void handleDeleteBoard()}
          disabled={boards.length <= 1}
          className="btn-1c text-1c-xs text-1c-danger disabled:opacity-30"
          title="Удалить доску"
        >
          &#10005;
        </button>
      </div>

      {/* Filter bar — фильтры на доске */}
      <div className="bg-1c-toolbar-bg border-b border-1c-border-light px-2 py-1 flex items-center gap-2 flex-wrap text-1c-sm">
        <span className="text-1c-xs text-1c-text-muted">Фильтр:</span>
        <label className="flex items-center gap-1">
          Автор
          <select
            value={filterAuthor}
            onChange={(e) => setFilterAuthor(e.target.value)}
            className="input-1c"
          >
            <option value="">все</option>
            {authors.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Исполнитель
          <select
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
            className="input-1c"
          >
            <option value="">все</option>
            {assignees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-1">
          Создано с
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            className="input-1c"
          />
        </label>
        <label className="flex items-center gap-1">
          по
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            className="input-1c"
          />
        </label>
        {filtersActive && (
          <button onClick={clearFilters} className="btn-1c text-1c-xs">
            Сбросить
          </button>
        )}
        {filtersActive && (
          <span className="text-1c-xs text-1c-text-muted">
            Показано: {filteredCards.length} из {cards.length}
          </span>
        )}
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
      <div className="flex-1 flex min-h-0">
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-1c-text-muted text-1c-base">
          Получение данных... Пожалуйста, подождите.
        </div>
      ) : (
        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex-1 overflow-x-auto p-2 min-w-0">
            <div className="flex gap-1.5 items-start h-full">
              {visibleColumns.map((col) => (
                <div
                  key={col.key}
                  className="flex-1 min-w-[200px] bg-1c-surface border border-1c-border-light rounded-lg shadow-1c-etched flex flex-col"
                >
                  {/* Column header */}
                  <div className="px-3 py-2 flex items-center gap-2 border-b border-1c-border-light">
                    <span
                      className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                      style={{ background: col.isArchive ? "#8b8f98" : "#4f5bd5" }}
                    />
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
                      <span className="mono font-semibold text-1c-xs text-1c-text uppercase tracking-wide truncate">
                        {col.name}
                      </span>
                    )}
                    <span className="mono text-1c-xs text-1c-text-muted ml-auto">
                      {String(byStatus[col.key]?.length ?? 0).padStart(2, "0")}
                    </span>
                    {!col.isArchive && renamingId !== col.id && (
                      <span className="flex gap-0.5">
                        <button
                          aria-label={`Переместить статус ${col.name} влево`}
                          title="Переместить влево"
                          disabled={columns.findIndex((c) => c.id === col.id) === 0}
                          onClick={() => void moveStatus(col, -1)}
                          className="text-1c-xs text-1c-text-muted hover:text-1c-text disabled:opacity-30"
                        >
                          &#9664;
                        </button>
                        <button
                          aria-label={`Переместить статус ${col.name} вправо`}
                          title="Переместить вправо"
                          disabled={
                            columns.findIndex((c) => c.id === col.id) === columns.length - 1
                          }
                          onClick={() => void moveStatus(col, 1)}
                          className="text-1c-xs text-1c-text-muted hover:text-1c-text disabled:opacity-30"
                        >
                          &#9654;
                        </button>
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
                        className={`px-1.5 py-1.5 min-h-[60px] flex-1 overflow-y-auto transition-colors ${
                          snapshot.isDraggingOver ? "bg-[#ececfb]" : ""
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
              <div className="w-44 shrink-0">
                {addingStatus ? (
                  <div className="bg-1c-surface border border-1c-border-light rounded-lg p-2 flex flex-col gap-1">
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
                    className="w-full text-left text-1c-sm text-1c-link hover:bg-1c-panel rounded-lg px-3 py-2 border border-dashed border-1c-border-light cursor-pointer"
                  >
                    + Добавить статус
                  </button>
                )}
              </div>
            </div>
          </div>
        </DragDropContext>
      )}

      {/* Правая панель текущей задачи */}
      {modal?.type === "edit" && (
        <CardModal
          card={modal.card}
          statuses={statuses}
          variant="panel"
          panelWidth={panelWidth}
          onResizeStart={startPanelResize}
          onOpenInNewTab={() => openTaskInNewTab(modal.card)}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}
      </div>

      {/* Status bar */}
      <div className="bg-1c-status-bar border-t border-1c-border px-1 flex text-1c-xs text-1c-text-muted">
        <div className="panel-1c flex-1 px-2 py-0.5">
          Задач: {cards.length}
          {columns.map((c) => ` | ${c.name}: ${byStatus[c.key]?.length ?? 0}`).join("")}
        </div>
        <div className="panel-1c px-2 py-0.5">Пользователь: {user?.name}</div>
      </div>

      {modal?.type === "create" && (
        <CardModal
          card={null}
          defaultStatus={modal.defaultStatus}
          statuses={statuses}
          onClose={() => setModal(null)}
          onSave={handleSave}
        />
      )}

      {/* Админ: создание пользователя */}
      {createUserOpen && isAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 font-1c"
          onMouseDown={() => setCreateUserOpen(false)}
        >
          <div
            className="w-full max-w-md bg-1c-bg shadow-1c-raised"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="titlebar-1c flex items-center justify-between">
              <span>&#128100; Создание пользователя</span>
              <button
                aria-label="Закрыть"
                onClick={() => setCreateUserOpen(false)}
                className="text-white/80 hover:text-white text-sm leading-none"
              >
                &#10005;
              </button>
            </div>
            <div className="p-3 bg-1c-surface text-1c-base">
              <p className="text-1c-xs text-1c-text-muted mb-2">
                Новые пользователи создаются только администратором. Самостоятельная
                регистрация отключена.
              </p>
              <table className="w-full">
                <tbody>
                  <tr>
                    <td className="py-1 pr-2 text-right text-1c-text-secondary w-[110px]">Имя:</td>
                    <td className="py-1">
                      <input
                        value={newUser.name}
                        onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                        className="input-1c w-full"
                        placeholder="Иванов И.И."
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 text-right text-1c-text-secondary">Email:</td>
                    <td className="py-1">
                      <input
                        type="email"
                        value={newUser.email}
                        onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                        className="input-1c w-full"
                        placeholder="user@enterprise.ru"
                      />
                    </td>
                  </tr>
                  <tr>
                    <td className="py-1 pr-2 text-right text-1c-text-secondary">Пароль:</td>
                    <td className="py-1">
                      <input
                        type="password"
                        value={newUser.password}
                        onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                        className="input-1c w-full"
                        placeholder="не короче 4 символов"
                      />
                    </td>
                  </tr>
                </tbody>
              </table>
              {userMsg && (
                <div className="mt-2 p-1.5 bg-1c-input-bg border border-1c-border-light text-1c-sm">
                  {userMsg}
                </div>
              )}
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-1c-border-light">
                <button onClick={() => void handleCreateUser()} className="btn-1c-primary">
                  Создать
                </button>
                <button onClick={() => setCreateUserOpen(false)} className="btn-1c">
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Админ: список пользователей и управление доступом */}
      {usersListOpen && isAdmin && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50 font-1c"
          onMouseDown={() => setUsersListOpen(false)}
        >
          <div
            className="w-full max-w-md bg-1c-bg shadow-1c-raised"
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="titlebar-1c flex items-center justify-between">
              <span>&#128100; Пользователи</span>
              <button
                aria-label="Закрыть"
                onClick={() => setUsersListOpen(false)}
                className="text-white/80 hover:text-white text-sm leading-none"
              >
                &#10005;
              </button>
            </div>
            <div className="p-3 bg-1c-surface text-1c-base">
              <ul className="max-h-72 overflow-y-auto divide-y divide-1c-border-light">
                {usersList.map((u) => (
                  <li key={u.id} className="flex items-center gap-2 py-1 text-1c-sm">
                    <span className="flex-1 min-w-0">
                      <span className={u.blocked ? "line-through text-1c-text-muted" : "text-1c-text"}>
                        {u.name}
                      </span>
                      <span className="text-1c-xs text-1c-text-muted ml-1 truncate">
                        {u.email}
                      </span>
                      {u.id === 1 && (
                        <span className="text-1c-xs text-1c-accent ml-1">(админ)</span>
                      )}
                      {u.blocked && (
                        <span className="text-1c-xs text-1c-danger ml-1">заблокирован</span>
                      )}
                    </span>
                    {u.id !== 1 && (
                      <button
                        onClick={() => void handleToggleBlock(u)}
                        className={`btn-1c text-1c-xs ${u.blocked ? "" : "text-1c-danger"}`}
                      >
                        {u.blocked ? "Разблокировать" : "Заблокировать"}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {userMsg && (
                <div className="mt-2 p-1.5 bg-1c-input-bg border border-1c-border-light text-1c-sm">
                  {userMsg}
                </div>
              )}
              <div className="flex justify-end gap-1 mt-3 pt-3 border-t border-1c-border-light">
                <button onClick={() => setUsersListOpen(false)} className="btn-1c">
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
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
