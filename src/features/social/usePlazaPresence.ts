"use client";

import { useEffect, useRef, useState } from "react";
import { SOCIAL_IDLE_HEARTBEAT_MS, SOCIAL_MOVE_THROTTLE_MS, SOCIAL_POLL_MS, type SocialPlayer, type SocialPresence, type SocialError, type SocialSpace } from "@/lib/social/model";

const REQUEST_TIMEOUT_MS = 10_000;
type PendingTick = { cancelled: boolean; controller?: AbortController };

export function usePlazaPresence(space: SocialSpace, enabled: boolean, position: {x:number;y:number}) {
  const [players, setPlayers] = useState<SocialPlayer[]>([]);
  const [status, setStatus] = useState<"connecting"|"online"|"offline">("connecting");
  const [denied, setDenied] = useState(false);
  const [snapshotScope, setSnapshotScope] = useState(() => ({ space, enabled }));
  const latest = useRef(position);
  latest.current = position;

  useEffect(() => {
    setSnapshotScope({ space, enabled });
    setPlayers([]);
    setDenied(false);
    if (!enabled) return;
    let disposed = false;
    let stopped = false;
    let pending: PendingTick | null = null;
    let interval: number | undefined;
    let lastRead = 0;
    let lastWrite = 0;
    let retryAt = 0;
    let failures = 0;
    let sent = "";
    setStatus("connecting");

    const canRun = () => !disposed && !stopped && !document.hidden && navigator.onLine;
    const isCurrent = (run: PendingTick) => pending === run && !run.cancelled && canRun();
    const stopTimer = () => {
      if (interval !== undefined) window.clearInterval(interval);
      interval = undefined;
    };
    const cancelPending = () => {
      const run = pending;
      pending = null;
      if (run) { run.cancelled = true; run.controller?.abort(); }
    };

    async function request(run: PendingTick, url: string, init: RequestInit, readJson = false) {
      const controller = new AbortController();
      run.controller = controller;
      let onAbort: (() => void) | undefined;
      const cancelled = new Promise<never>((_, reject) => {
        onAbort = () => reject(new Error("presence request cancelled"));
        controller.signal.addEventListener("abort", onAbort, { once: true });
      });
      const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      try {
        // Release the tick even if an old WebView ignores abort. An eventual
        // response from the cancelled tick can never update the current room.
        return await Promise.race([
          (async () => {
            const response = await fetch(url, { ...init, signal: controller.signal });
            const data = readJson && response.ok ? await response.json() as SocialPresence | SocialError : undefined;
            return { response, data };
          })(),
          cancelled,
        ]);
      } finally {
        window.clearTimeout(timeout);
        if (onAbort) controller.signal.removeEventListener("abort", onAbort);
        if (run.controller === controller) run.controller = undefined;
      }
    }

    function checkResponse(response: Response) {
      if (response.ok) return;
      if ([401, 403, 404].includes(response.status)) {
        stopped = true;
        stopTimer();
        if (response.status !== 401) setDenied(true);
      }
      throw new Error("presence unavailable");
    }

    async function tick() {
      if (pending || !canRun() || Date.now() < retryAt) return;
      const run: PendingTick = { cancelled: false };
      pending = run;
      try {
        const now = Date.now();
        const key = `${latest.current.x}:${latest.current.y}`;
        if (now-lastWrite >= SOCIAL_IDLE_HEARTBEAT_MS || (key!==sent && now-lastWrite>=SOCIAL_MOVE_THROTTLE_MS)) {
          const { response } = await request(run, "/tree/api/social/presence", {
            method:"POST", credentials:"same-origin", headers:{"Content-Type":"application/json"},
            body:JSON.stringify({space,...latest.current}),
          });
          if (!isCurrent(run)) return;
          checkResponse(response);
          lastWrite=Date.now(); sent=key;
        }
        // Visibility or room may change while the heartbeat is in flight.
        if (!isCurrent(run)) return;
        if (Date.now()-lastRead>=SOCIAL_POLL_MS) {
          const { response, data } = await request(run,
            `/tree/api/social/presence?space=${encodeURIComponent(space)}`, {cache:"no-store"}, true);
          if (!isCurrent(run)) return;
          checkResponse(response);
          if (!data?.ok) throw new Error("presence unavailable");
          setPlayers(data.players); lastRead=Date.now();
        }
        if (!isCurrent(run)) return;
        failures=0; retryAt=0;
        setStatus("online");
      } catch {
        if (disposed || run.cancelled || pending !== run) return;
        setStatus("offline"); setPlayers([]);
        failures += 1;
        retryAt=Date.now()+Math.min(30_000, SOCIAL_MOVE_THROTTLE_MS * 2 ** Math.min(failures, 5));
      } finally {
        if (pending === run) pending=null;
      }
    }

    const resume = () => {
      cancelPending();
      stopTimer();
      if (disposed || stopped) return;
      if (document.hidden || !navigator.onLine) {
        setPlayers([]);
        if (!navigator.onLine) setStatus("offline");
        return;
      }
      lastRead=0; lastWrite=0; retryAt=0; failures=0;
      setStatus("connecting");
      interval=window.setInterval(()=>void tick(), SOCIAL_MOVE_THROTTLE_MS);
      void tick();
    };
    resume();
    document.addEventListener("visibilitychange",resume);
    window.addEventListener("online",resume);
    window.addEventListener("offline",resume);
    return ()=>{
      disposed=true; stopTimer(); cancelPending();
      document.removeEventListener("visibilitychange",resume);
      window.removeEventListener("online",resume);
      window.removeEventListener("offline",resume);
    };
  },[space,enabled]);
  // Effect resets happen after rendering. Never let the parent react to an old
  // room's denial or players during the first commit of a new room/session.
  const current = enabled && snapshotScope.enabled && snapshotScope.space === space;
  return current ? {players,status,denied} : {players:[],status:"connecting" as const,denied:false};
}
