"use client";
import { useEffect } from "react";

// Back and Forward should return to where the visitor was reading. The
// browser does this on its own for pages that are complete when they open,
// but most pages here fetch their content after opening: at the moment the
// browser tries to restore, the page is one screen tall and the attempt
// lands at the top.
//
// This remembers the scroll position per address for the visit and, on a
// Back or Forward, re-applies it as soon as the page has grown tall enough,
// giving up after a few seconds or the moment the visitor scrolls themselves.
const KEY = "scroll_memory_v1";
const MAX_ENTRIES = 40;

type Store = Record<string, number>;
const read = (): Store => {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? "{}") as Store; } catch { return {}; }
};
const write = (s: Store) => {
  try {
    const keys = Object.keys(s);
    for (const k of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) delete s[k];
    sessionStorage.setItem(KEY, JSON.stringify(s));
  } catch { /* private mode */ }
};
const here = () => location.pathname + location.search;

export default function ScrollMemory() {
  useEffect(() => {
    let restoring = false;
    let frame = 0;
    let timer: ReturnType<typeof setInterval> | null = null;

    const save = () => {
      if (restoring || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (restoring) return;
        const s = read();
        const key = here();
        delete s[key]; // re-insert so the newest address is last
        s[key] = Math.round(window.scrollY);
        write(s);
      });
    };

    const stop = () => {
      restoring = false;
      if (timer) { clearInterval(timer); timer = null; }
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };

    const onPop = () => {
      stop();
      // Read the target before anything can overwrite it, then wait for the
      // new address and its content.
      const store = read();
      restoring = true;
      window.addEventListener("wheel", stop, { passive: true });
      window.addEventListener("touchstart", stop, { passive: true });
      window.addEventListener("keydown", stop);
      const started = performance.now();
      timer = setInterval(() => {
        const target = store[here()] ?? 0;
        const reachable = document.documentElement.scrollHeight - window.innerHeight;
        if (target <= 0 || performance.now() - started > 5000) { stop(); return; }
        if (reachable >= target - 2) {
          window.scrollTo({ top: target, behavior: "instant" });
          stop();
        }
      }, 80);
    };

    window.addEventListener("scroll", save, { passive: true });
    window.addEventListener("popstate", onPop);
    return () => {
      stop();
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", save);
      window.removeEventListener("popstate", onPop);
    };
  }, []);
  return null;
}
