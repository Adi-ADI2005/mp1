import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { refreshAccessToken, setAccessToken } from "./services/api";

const AuthContext = createContext(null);
const ToastContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();
  const toast = useContext(ToastContext);

  useEffect(() => {
    let active = true;
    const expire = () => {
      setAccessToken(null);
      setUser(null);
      setReady(true);
      toast?.warning("Your session expired. Please sign in again.");
    };
    window.addEventListener("fishcheck:auth-expired", expire);
    const initialize = async () => {
      // Exchange a previous access token once so existing sessions can acquire a
      // revocable HttpOnly refresh cookie without keeping tokens in localStorage.
      const legacyToken = localStorage.getItem("fishcheck_token");
      if (legacyToken) {
        setAccessToken(legacyToken);
        localStorage.removeItem("fishcheck_token");
      }
      try {
        const accessToken = await refreshAccessToken();
        if (!accessToken) return;
        const { data } = await api.get("/auth/me");
        if (!active) return;
        setUser(data);
      } catch {
        if (!active) return;
        setAccessToken(null);
        setUser(null);
      } finally {
        if (active) setReady(true);
      }
    };
    initialize();
    return () => {
      active = false;
      window.removeEventListener("fishcheck:auth-expired", expire);
    };
  }, []);

  const acceptSession = (data) => {
    setAccessToken(data.access_token);
    setUser(data.user);
    setReady(true);
    return data.user;
  };

  const value = useMemo(() => ({
    user,
    ready,
    isAuthenticated: Boolean(user),
    login: async (email, password) => {
      const { data } = await api.post("/auth/login", { email, password });
      return acceptSession(data);
    },
    register: async (name, email, password, confirmPassword) => {
      const { data } = await api.post("/auth/register", {
        name,
        email,
        password,
        confirm_password: confirmPassword,
      });
      return data.user;
    },
    demoLogin: async () => {
      const { data } = await api.post("/auth/demo", {});
      return acceptSession(data);
    },
    refreshUser: async () => {
      const { data } = await api.get("/auth/me");
      setUser(data);
      return data;
    },
    logout: async () => {
      let revoked = false;
      try {
        await api.post("/auth/logout", {});
        revoked = true;
      } catch {
        // A failed network request cannot revoke an HttpOnly cookie server-side.
      } finally {
        setAccessToken(null);
        setUser(null);
        setReady(true);
        navigate("/login", { replace: true });
        if (revoked) toast?.success("Logged out successfully.");
        else toast?.warning("Signed out here, but the server could not confirm session revocation.");
      }
    },
  }), [user, ready, navigate, toast]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const notify = (type, message) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((current) => [...current, { id, type, message }]);
    window.setTimeout(() => setToasts((current) => current.filter((toast) => toast.id !== id)), 4600);
  };
  const value = useMemo(() => ({
    notify,
    success: (message) => notify("success", message),
    info: (message) => notify("info", message),
    warning: (message) => notify("warning", message),
    error: (message) => notify("error", message),
  }), []);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <div className={`app-toast toast-${toast.type}`} key={toast.id} role="status">
            <span className="toast-symbol">
              <i className={`bi ${toast.type === "success" ? "bi-check-circle-fill" : toast.type === "warning" ? "bi-exclamation-triangle-fill" : toast.type === "error" ? "bi-x-circle-fill" : "bi-info-circle-fill"}`} />
            </span>
            <span className="toast-message">{toast.message}</span>
            <button className="toast-close" onClick={() => setToasts((items) => items.filter((item) => item.id !== toast.id))} aria-label="Dismiss notification">×</button>
            <span className="toast-progress" />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}