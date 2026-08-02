import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

/**
 * Keep a screen's data fresh without the user restarting the app.
 *
 * Three triggers, because they cover different ways of "coming back":
 *
 *   · screen focus   — navigating back from another screen
 *   · app foreground — switching back from another app, or unlocking
 *   · an interval    — someone else creates a meeting while you sit there
 *
 * Deliberately not WebSockets. Real push would mean running gunicorn under an
 * eventlet/gevent worker instead of threads, and on a free Render instance the
 * service sleeps when idle, so the socket would drop and reconnect constantly.
 * Polling costs one small request per interval and cannot get into that state.
 *
 * The interval only runs while the screen is focused *and* the app is in the
 * foreground, so a backgrounded app makes no requests at all — otherwise this
 * would drain battery and keep a free instance awake for nothing.
 */
export default function useAutoRefresh(
  loader,
  { intervalMs = 20000, enabled = true, skipFirstFocus = false } = {},
) {
  // Kept in a ref so a caller passing an inline function does not restart the
  // timer on every render.
  const loaderRef = useRef(loader);
  useEffect(() => { loaderRef.current = loader; }, [loader]);

  const focused = useRef(false);
  const timer = useRef(null);

  const run = useCallback(() => {
    if (!enabled) return;
    const result = loaderRef.current?.();
    // Swallow rejections: a failed background refresh should leave whatever is
    // on screen alone, not surface an error over content the user is reading.
    if (result && typeof result.catch === "function") result.catch(() => {});
  }, [enabled]);

  const stopTimer = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    stopTimer();
    if (!enabled || intervalMs <= 0) return;
    timer.current = setInterval(() => {
      if (focused.current && AppState.currentState === "active") run();
    }, intervalMs);
  }, [enabled, intervalMs, run, stopTimer]);

  // Focus: fetch immediately, then keep the timer running while we stay here.
  //
  // skipFirstFocus is for screens that already fetch on mount for their own
  // reasons — Explore fetches whenever its filters change, and mounting counts
  // as a change — so the very first focus would otherwise fire a duplicate
  // request. Every later focus still refetches.
  const hadFirstFocus = useRef(false);
  useFocusEffect(
    useCallback(() => {
      focused.current = true;
      if (skipFirstFocus && !hadFirstFocus.current) hadFirstFocus.current = true;
      else run();
      startTimer();
      return () => {
        focused.current = false;
        stopTimer();
      };
    }, [run, startTimer, stopTimer, skipFirstFocus])
  );

  // Foreground: the interval cannot have fired while suspended, so whatever is
  // on screen is as stale as the time spent away.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active" && focused.current) run();
    });
    return () => sub.remove();
  }, [run]);
}
