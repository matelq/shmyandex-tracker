import { FormEvent, useState } from "react";
import { useAuth } from "../context/AuthContext";

export default function AuthPage() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await login(email, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-full flex items-center justify-center bg-1c-bg p-4 font-1c">
      {/* Window frame */}
      <div className="w-full max-w-sm shadow-1c-raised bg-1c-bg">
        {/* Title bar */}
        <div className="titlebar-1c flex items-center gap-2">
          <span className="text-sm">&#128274;</span>
          <span>Шмяндекс трекер — Авторизация</span>
        </div>

        {/* Form body */}
        <div className="p-4 bg-1c-surface">
          <form onSubmit={handleSubmit}>
            <table className="w-full text-1c-base">
              <tbody>
                <tr>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-1c-text-secondary">
                    Пользователь:
                  </td>
                  <td className="py-1.5">
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="input-1c w-full"
                      placeholder="user@enterprise.ru"
                    />
                  </td>
                </tr>
                <tr>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap text-1c-text-secondary">
                    Пароль:
                  </td>
                  <td className="py-1.5">
                    <input
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="input-1c w-full"
                      placeholder=""
                    />
                  </td>
                </tr>
              </tbody>
            </table>

            {error && (
              <div className="mt-2 p-1.5 bg-[#FFF0F0] border border-1c-danger text-1c-danger text-1c-sm">
                {error}
              </div>
            )}

            <div className="flex items-center justify-end mt-4 pt-3 border-t border-1c-border-light">
              <button type="submit" disabled={busy} className="btn-1c-primary">
                {busy ? "Подождите..." : "Войти"}
              </button>
            </div>
          </form>
        </div>

        {/* Status bar */}
        <div className="bg-1c-status-bar border-t border-1c-border-light px-2 py-0.5 text-1c-xs text-1c-text-muted flex justify-between">
          <span>Информационная база: Shmyandex Tracker</span>
          <span>Вход в систему</span>
        </div>
      </div>
    </div>
  );
}
