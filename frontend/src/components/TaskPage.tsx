import { useEffect, useState } from "react";
import { api, Card, CardPayload, Status } from "../api";
import CardModal from "./CardModal";

interface Props {
  taskId: number;
  boardId: number;
}

// Полностраничный просмотр задачи в отдельной вкладке браузера.
export default function TaskPage({ taskId, boardId }: Props) {
  const [card, setCard] = useState<Card | null>(null);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  function load() {
    return Promise.all([api.listCards(boardId), api.listStatuses(boardId)])
      .then(([cards, s]) => {
        const found = cards.find((c) => c.id === taskId) ?? null;
        setCard(found);
        setStatuses(s);
        if (!found) setError("Задача не найдена");
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [taskId, boardId]);

  useEffect(() => {
    if (card) document.title = `${card.title} · Tracker`;
  }, [card]);

  async function handleSave(values: CardPayload) {
    if (!card) return;
    try {
      const updated = await api.updateCard(card.id, values);
      setCard(updated);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-1c-bg text-1c-text-muted font-1c text-1c-base">
        Загрузка задачи...
      </div>
    );
  }

  if (error || !card) {
    return (
      <div className="min-h-full flex items-center justify-center bg-1c-bg text-1c-danger font-1c text-1c-base">
        {error || "Задача не найдена"}
      </div>
    );
  }

  return (
    <CardModal
      card={card}
      statuses={statuses}
      variant="page"
      onClose={() => window.close()}
      onSave={handleSave}
    />
  );
}
