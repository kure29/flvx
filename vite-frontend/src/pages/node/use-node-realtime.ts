import { useCallback, useEffect, useRef, useState } from "react";
import axios from "axios";

import { IS_DEMO, startDemoRealtime } from "@/demo";
import { getToken } from "@/utils/session";

interface NodeRealtimeMessage {
  id?: string | number;
  type?: string;
  data?: unknown;
  message?: string;
}

interface UseNodeRealtimeOptions {
  onMessage: (message: NodeRealtimeMessage) => void;
  enabled?: boolean;
}

const MAX_STANDARD_RECONNECT_ATTEMPTS = 5;
const STANDARD_RECONNECT_DELAY_MS = 3000;
const MAX_STANDARD_RECONNECT_DELAY_MS = 15000;
const FALLBACK_RECONNECT_DELAY_MS = 30000;

const getRealtimeWsUrl = (): string => {
  const baseUrl =
    axios.defaults.baseURL ||
    (import.meta.env.VITE_API_BASE
      ? `${import.meta.env.VITE_API_BASE}/api/v1/`
      : "/api/v1/");

  return (
    baseUrl.replace(/^http/, "ws").replace(/\/api\/v1\/$/, "") +
    `/system-info?type=0&secret=${getToken() || ""}`
  );
};

export const useNodeRealtime = ({
  onMessage,
  enabled = true,
}: UseNodeRealtimeOptions) => {
  // The demo shows the nodes as connected (it has no live stream).
  const [wsConnected, setWsConnected] = useState(IS_DEMO);
  const [wsConnecting, setWsConnecting] = useState(false);
  const [usingPollingFallback, setUsingPollingFallback] = useState(false);

  const websocketRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const clearReconnectTimer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }
  }, []);

  const disconnect = useCallback(() => {
    clearReconnectTimer();
    reconnectAttemptsRef.current = 0;
    setWsConnected(false);
    setWsConnecting(false);
    setUsingPollingFallback(false);

    if (!websocketRef.current) {
      return;
    }

    websocketRef.current.onopen = null;
    websocketRef.current.onmessage = null;
    websocketRef.current.onerror = null;
    websocketRef.current.onclose = null;

    if (
      websocketRef.current.readyState === WebSocket.OPEN ||
      websocketRef.current.readyState === WebSocket.CONNECTING
    ) {
      websocketRef.current.close();
    }

    websocketRef.current = null;
  }, [clearReconnectTimer]);

  const connect = useCallback(() => {
    // The online demo has no server to stream from.
    if (!enabled || IS_DEMO) {
      return;
    }

    if (
      websocketRef.current &&
      (websocketRef.current.readyState === WebSocket.OPEN ||
        websocketRef.current.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    if (websocketRef.current) {
      disconnect();
    }

    try {
      setWsConnecting(true);
      websocketRef.current = new WebSocket(getRealtimeWsUrl());

      websocketRef.current.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setWsConnected(true);
        setWsConnecting(false);
        setUsingPollingFallback(false);
      };

      websocketRef.current.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);

          if (parsed && typeof parsed === "object") {
            onMessageRef.current(parsed as NodeRealtimeMessage);
          }
        } catch {}
      };

      websocketRef.current.onerror = () => {};

      websocketRef.current.onclose = () => {
        websocketRef.current = null;
        setWsConnected(false);
        setWsConnecting(false);

        if (!enabled) {
          return;
        }

        reconnectAttemptsRef.current += 1;
        const exhaustedStandardRetries =
          reconnectAttemptsRef.current >= MAX_STANDARD_RECONNECT_ATTEMPTS;

        setUsingPollingFallback(exhaustedStandardRetries);

        const reconnectDelay = exhaustedStandardRetries
          ? FALLBACK_RECONNECT_DELAY_MS
          : Math.min(
              STANDARD_RECONNECT_DELAY_MS * reconnectAttemptsRef.current,
              MAX_STANDARD_RECONNECT_DELAY_MS,
            );

        reconnectTimerRef.current = setTimeout(() => {
          reconnectTimerRef.current = null;
          connect();
        }, reconnectDelay);
      };
    } catch {
      setWsConnected(false);
      setWsConnecting(false);
    }
  }, [disconnect, enabled]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (IS_DEMO) {
      return startDemoRealtime((m) => onMessageRef.current(m));
    }

    connect();

    return () => {
      disconnect();
    };
  }, [connect, disconnect, enabled]);

  return {
    wsConnected,
    wsConnecting,
    usingPollingFallback,
    reconnectRealtime: connect,
    disconnectRealtime: disconnect,
  };
};
