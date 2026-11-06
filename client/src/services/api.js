import axios from "axios";

const configuredApiUrl = import.meta.env.DEV
  ? ""
  : import.meta.env.VITE_API_URL?.trim().replace(/\/+$/, "");
const apiBaseUrl = configuredApiUrl
  ? `${configuredApiUrl.replace(/\/api$/i, "")}/api`
  : "/api";

let accessToken = null;
let refreshPromise = null;
let expiryEventSent = false;

const api = axios.create({
  baseURL: apiBaseUrl,
  timeout: 60000,
  withCredentials: true,
});

export function setAccessToken(token) {
  accessToken = token || null;
  if (accessToken) expiryEventSent = false;
}

function announceExpiredSession() {
  if (expiryEventSent) return;
  expiryEventSent = true;
  window.dispatchEvent(new Event("fishcheck:auth-expired"));
}

export function refreshAccessToken() {
  if (!refreshPromise) {
    refreshPromise = api.post("/auth/refresh", {}, { skipAuthRefresh: true, timeout: 5000 })
      .then(({ data }) => {
        if (data?.authenticated === false) {
          setAccessToken(null);
          return null;
        }
        if (!data?.access_token) {
          throw new Error("The session refresh response did not include an access token.");
        }
        setAccessToken(data.access_token);
        return data.access_token;
      })
      .finally(() => {
        refreshPromise = null;
      });
  }
  return refreshPromise;
}

api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const request = error.config;
    const endpoint = request?.url || "";
    const isAuthEndpoint = /\/auth\/(login|register|refresh|demo|logout)(?:$|[?#])/.test(endpoint);

    if (error.response?.status === 401 && request && !isAuthEndpoint && accessToken) {
      if (request._authRetry) {
        setAccessToken(null);
        announceExpiredSession();
        return Promise.reject(error);
      }
      request._authRetry = true;
      try {
        const refreshedToken = await refreshAccessToken();
        if (!refreshedToken) throw new Error("The session is no longer valid.");
        return api(request);
      } catch (refreshError) {
        setAccessToken(null);
        announceExpiredSession();
        return Promise.reject(refreshError);
      }
    }
    return Promise.reject(error);
  },
);

export function getErrorMessage(error, fallback = "Something went wrong. Please try again.") {
  const data = error?.response?.data;
  if (typeof data?.message === "string" && data.message.trim()) return data.message;
  const detail = data?.detail;
  if (typeof detail === "string" && detail.trim()) return detail;
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => typeof item === "string" ? item : item?.msg)
      .filter((message) => typeof message === "string" && message.trim());
    if (messages.length) return messages.join(" ");
  }
  if (typeof data?.error === "string" && data.error.trim()) return data.error;
  if (!error?.response) return "Unable to connect to the server.";
  if (error.response.status === 403) return "You do not have permission to do that.";
  if (error.response.status === 422) return "Please check the submitted details.";
  if (error.response.status >= 500) return "The server is currently unavailable.";
  return error?.message || fallback;
}

export default api;