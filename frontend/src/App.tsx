import { useAuth } from "./context/AuthContext";
import AuthPage from "./components/AuthPage";
import Board from "./components/Board";
import TaskPage from "./components/TaskPage";

export default function App() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-full flex items-center justify-center bg-1c-bg text-1c-text-muted font-1c text-1c-base">
        Загрузка. Пожалуйста, подождите...
      </div>
    );
  }

  if (!user) return <AuthPage />;

  // Отдельная вкладка задачи: /?task=<id>&board=<boardId>
  const params = new URLSearchParams(window.location.search);
  const taskId = Number(params.get("task"));
  const taskBoard = Number(params.get("board"));
  if (taskId && taskBoard) {
    return <TaskPage taskId={taskId} boardId={taskBoard} />;
  }

  return <Board />;
}
