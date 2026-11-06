import { useEffect, useState } from "react";
import api from "../services/api";

const HEALTH_TIMEOUT_MS = 5000;
const HEALTH_POLL_INTERVAL_MS = 30000;
const INITIAL_RETRY_INTERVAL_MS = 10000;
const MAX_RETRY_INTERVAL_MS = 60000;

export default function useBackendHealth() {
  const [health, setHealth] = useState(null);
  const [status, setStatus] = useState("checking");

  useEffect(() => {
    let active = true;
    let timer;
    let consecutiveFailures = 0;

    const scheduleCheck = (delay) => {
      timer = window.setTimeout(checkHealth, delay);
    };

    const checkHealth = async () => {
      try {
        const { data } = await api.get("/health", { timeout: HEALTH_TIMEOUT_MS });
        if (!active) return;

        consecutiveFailures = 0;
        setHealth(data);
        setStatus("online");
        scheduleCheck(HEALTH_POLL_INTERVAL_MS);
      } catch {
        if (!active) return;

        consecutiveFailures += 1;
        setHealth(null);
        setStatus("offline");
        const retryDelay = Math.min(
          INITIAL_RETRY_INTERVAL_MS * 2 ** (consecutiveFailures - 1),
          MAX_RETRY_INTERVAL_MS,
        );
        scheduleCheck(retryDelay);
      }
    };

    void checkHealth();
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, []);

  return { health, status };
}
