import { Draggable } from '@hello-pangea/dnd';
import { Card as CardType } from '../api';

function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
}

function fmtDate(iso: string): string {
  // Даты с бэкенда в UTC ('YYYY-MM-DD HH:MM:SS')
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('ru-RU');
}

interface Props {
  card: CardType;
  index: number;
  onClick: (card: CardType) => void;
}

export default function Card({ card, index, onClick }: Props) {
  return (
    <Draggable draggableId={String(card.id)} index={index}>
      {(provided, snapshot) => (
        <div
          ref={provided.innerRef}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          onClick={() => onClick(card)}
          data-testid={`card-${card.id}`}
          className={`bg-1c-surface border border-1c-border-light rounded-md p-2.5 mb-2 cursor-pointer text-1c-sm transition-shadow hover:border-1c-border ${
            snapshot.isDragging ? 'shadow-1c-raised' : 'shadow-1c-etched'
          }`}
        >
          <div className="flex items-center justify-between mb-1.5">
            <span className="mono text-1c-xs text-1c-text-muted">#{card.id}</span>
          </div>

          <p className="font-semibold text-1c-text break-words leading-snug">{card.title}</p>

          {card.description && (
            <p className="text-1c-xs text-1c-text-secondary mt-1.5 line-clamp-2 whitespace-pre-wrap break-words">
              {card.description}
            </p>
          )}

          {card.assignee && (
            <div className="flex items-center gap-1.5 mt-2.5">
              <span
                aria-label={`Исполнитель: ${card.assignee}`}
                className="inline-flex items-center justify-center w-5 h-5 rounded bg-1c-text-secondary text-white text-[9px] font-semibold flex-shrink-0"
              >
                {initials(card.assignee)}
              </span>
              <span className="text-1c-xs text-1c-text-secondary truncate">{card.assignee}</span>
            </div>
          )}

          <div className="mono mt-2.5 pt-2 border-t border-1c-border-light text-[10px] text-1c-text-muted flex flex-wrap gap-x-2 gap-y-0.5">
            {card.author && <span>Автор: {card.author}</span>}
            <span title="Дата создания">Создано: {fmtDate(card.createdAt)}</span>
            {card.updatedAt !== card.createdAt && (
              <span title="Дата изменения">Изменено: {fmtDate(card.updatedAt)}</span>
            )}
          </div>
        </div>
      )}
    </Draggable>
  );
}
