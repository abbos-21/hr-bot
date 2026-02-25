/**
 * Singleton WebSocket manager.
 *
 * Problem solved: Every call to `useWebSocket()` previously opened its own
 * connection. With ProtectedLayout + CandidatesPage + DetailPanel all mounted,
 * the same server broadcast was received 3 times, causing duplicate messages,
 * duplicate toasts, and duplicate state updates.
 *
 * Solution: One module-level WebSocket connection. All hooks subscribe as
 * listeners via an event-emitter pattern. The connection is created on first
 * subscribe and torn down when the last subscriber leaves.
 */

type WsMessageType =
  | "NEW_APPLICATION"
  | "NEW_MESSAGE"
  | "STATUS_CHANGE"
  | "CANDIDATE_UPDATE"
  | "MESSAGES_READ"
  | "PONG";

type Handler = (payload: any) => void;
type Handlers = Partial<Record<WsMessageType, Handler>>;

// ─── Singleton state ──────────────────────────────────────────────────────────

let socket: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

// Each subscriber gets a unique id; we keep its handler map.
const subscribers = new Map<symbol, Handlers>();

function dispatch(type: WsMessageType, payload: any) {
  subscribers.forEach((handlers) => {
    const fn = handlers[type];
    if (fn) fn(payload);
  });
}

function connect() {
  const token = localStorage.getItem("token");
  if (!token) return;

  if (socket && socket.readyState === WebSocket.OPEN) return;

  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  socket = new WebSocket(`${proto}//${window.location.host}/ws?token=${token}`);

  socket.onopen = () => {
    console.log("[WS] connected");
  };

  socket.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data) as {
        type: WsMessageType;
        payload?: any;
      };
      dispatch(msg.type, msg.payload);
    } catch {}
  };

  socket.onclose = (e) => {
    socket = null;
    if (e.code === 1008) return; // auth failure – don't retry
    if (subscribers.size > 0) {
      reconnectTimer = setTimeout(connect, 3000);
    }
  };

  socket.onerror = () => {};

  heartbeatTimer = setInterval(() => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "PING" }));
    }
  }, 25_000);
}

function teardown() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  reconnectTimer = null;
  heartbeatTimer = null;
  socket?.close(1000, "no subscribers");
  socket = null;
}

// ─── React hook ───────────────────────────────────────────────────────────────

import { useEffect, useRef } from "react";

export function useWebSocket(handlers: Handlers) {
  const id = useRef<symbol>(Symbol());
  const handlersRef = useRef(handlers);
  // Keep handlers ref up-to-date on every render without re-subscribing.
  handlersRef.current = handlers;

  useEffect(() => {
    const key = id.current;

    // Proxy that always reads the latest handler (avoids stale closures)
    const proxy: Handlers = {};
    (
      [
        "NEW_APPLICATION",
        "NEW_MESSAGE",
        "STATUS_CHANGE",
        "CANDIDATE_UPDATE",
        "MESSAGES_READ",
        "PONG",
      ] as WsMessageType[]
    ).forEach((type) => {
      proxy[type] = (payload: any) => handlersRef.current[type]?.(payload);
    });

    subscribers.set(key, proxy);

    if (subscribers.size === 1) {
      // First subscriber – open the connection
      connect();
    }

    return () => {
      subscribers.delete(key);
      if (subscribers.size === 0) {
        teardown();
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}
