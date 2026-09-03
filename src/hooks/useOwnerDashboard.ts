"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CreateSessionResult,
  OwnerNotificationsResult,
  OwnerSessionSummary,
} from "@/lib/remote-scan/session-service";
import type { AllowedExpiryHours } from "@/types/remote-scan";

export function useOwnerDashboard() {
  const [sessions, setSessions] = useState<readonly OwnerSessionSummary[]>([]);
  const [notificationsData, setNotificationsData] = useState<OwnerNotificationsResult>({
    notifications: [],
    unreadCount: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const isPollingRef = useRef(false);

  // Authoritative server fetch (async callback without synchronous setState in effect)
  const fetchData = useCallback(async () => {
    try {
      const [sessionsRes, notifsRes] = await Promise.all([
        fetch("/api/owner/sessions"),
        fetch("/api/owner/notifications"),
      ]);

      if (!sessionsRes.ok) {
        throw new Error("Failed to load sessions");
      }

      const sessionsJson = (await sessionsRes.json()) as { sessions: OwnerSessionSummary[] };
      setSessions(sessionsJson.sessions || []);

      if (notifsRes.ok) {
        const notifsJson = (await notifsRes.json()) as OwnerNotificationsResult;
        setNotificationsData(notifsJson);
      }

      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error loading dashboard data");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load and visibility-aware periodic polling (every 6 seconds) with overlap prevention
  useEffect(() => {
    let isCancelled = false;

    async function initialLoadAndPoll() {
      if (isPollingRef.current) return;
      isPollingRef.current = true;

      try {
        const [sessionsRes, notifsRes] = await Promise.all([
          fetch("/api/owner/sessions"),
          fetch("/api/owner/notifications"),
        ]);

        if (isCancelled) return;

        if (!sessionsRes.ok) {
          throw new Error("Failed to load sessions");
        }

        const sessionsJson = (await sessionsRes.json()) as { sessions: OwnerSessionSummary[] };
        setSessions(sessionsJson.sessions || []);

        if (notifsRes.ok) {
          const notifsJson = (await notifsRes.json()) as OwnerNotificationsResult;
          setNotificationsData(notifsJson);
        }

        setError(null);
      } catch (err) {
        if (!isCancelled) {
          setError(err instanceof Error ? err.message : "Error loading dashboard data");
        }
      } finally {
        isPollingRef.current = false;
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void initialLoadAndPoll();

    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        void initialLoadAndPoll();
      }
    }, 6000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Create new scan request
  const createSession = useCallback(
    async (title: string, expiryHours: AllowedExpiryHours): Promise<CreateSessionResult> => {
      const res = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || undefined,
          expiryHours,
        }),
      });

      if (!res.ok) {
        throw new Error("Failed to create scan session");
      }

      const created = (await res.json()) as CreateSessionResult;
      // Immediately refetch list to synchronize server state
      await fetchData();
      return created;
    },
    [fetchData],
  );

  // Mark single notification read with rollback on error
  const markNotificationRead = useCallback(
    async (notificationId: string) => {
      let previousState: OwnerNotificationsResult | null = null;
      setNotificationsData((prev) => {
        previousState = prev;
        return {
          notifications: prev.notifications.map((n) =>
            n.id === notificationId ? { ...n, isRead: true } : n,
          ),
          unreadCount: Math.max(0, prev.unreadCount - 1),
        };
      });

      try {
        const res = await fetch(`/api/owner/notifications/${encodeURIComponent(notificationId)}`, {
          method: "PATCH",
        });
        if (!res.ok) {
          throw new Error("Failed to mark notification as read");
        }
      } catch {
        if (previousState) {
          setNotificationsData(previousState);
        }
      }
    },
    [],
  );

  // Mark all notifications read with rollback on error
  const markAllNotificationsRead = useCallback(async () => {
    let previousState: OwnerNotificationsResult | null = null;
    setNotificationsData((prev) => {
      previousState = prev;
      return {
        notifications: prev.notifications.map((n) => ({ ...n, isRead: true })),
        unreadCount: 0,
      };
    });

    try {
      const res = await fetch("/api/owner/notifications", {
        method: "PATCH",
      });
      if (!res.ok) {
        throw new Error("Failed to mark all notifications as read");
      }
    } catch {
      if (previousState) {
        setNotificationsData(previousState);
      }
    }
  }, []);

  return {
    sessions,
    notifications: notificationsData.notifications,
    unreadCount: notificationsData.unreadCount,
    isLoading,
    error,
    refetch: fetchData,
    createSession,
    markNotificationRead,
    markAllNotificationsRead,
  };
}
