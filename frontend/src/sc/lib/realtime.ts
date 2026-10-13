/**
 * Live updates from Frappe (frappe.publish_realtime) over the bench Socket.IO server, proxied by Vite at /socket.io.
 * One shared connection to the site's namespace; screens subscribe to events. If the socket server is not running,
 * screens keep their polling fallback, so nothing breaks.
 */
import { io, type Socket } from "socket.io-client";
import { useEffect, useRef, useState } from "react";

const SITE = (import.meta.env.VITE_FRAPPE_SITE as string | undefined) || "realestate";
let socket: Socket | null = null;

function connect(): Socket {
  if (!socket) {
    socket = io(`${window.location.origin}/${SITE}`, { path: "/socket.io", withCredentials: true, transports: ["websocket", "polling"], reconnectionDelayMax: 30_000 });
  }
  return socket;
}

/** Call `handler` whenever the server publishes `event`; returns whether the live connection is up. */
export function useRealtime<T>(event: string, handler: (data: T) => void): boolean {
  const ref = useRef(handler);
  ref.current = handler;
  const [live, setLive] = useState(false);
  useEffect(() => {
    const s = connect();
    const on = (data: T) => ref.current(data);
    const up = () => setLive(true);
    const down = () => setLive(false);
    s.on(event, on);
    s.on("connect", up);
    s.on("disconnect", down);
    s.on("connect_error", down);
    setLive(s.connected);
    return () => {
      s.off(event, on);
      s.off("connect", up);
      s.off("disconnect", down);
      s.off("connect_error", down);
    };
  }, [event]);
  return live;
}
