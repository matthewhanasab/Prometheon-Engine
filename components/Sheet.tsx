"use client";
import { useEffect, useRef } from "react";
import Icon from "@/components/Icon";

// A panel that slides in from the right for detail that should not cost the
// visitor their place in a list.
//
// Built on a native <dialog>: focus is trapped inside while it is open,
// Escape closes it, the page behind is inert and focus returns to the element
// that opened it. On touch it follows the finger and closes on a rightward
// flick or once dragged a third of the way out.
export default function Sheet({ open, onClose, label, children }: {
  open: boolean;
  onClose: () => void;
  /** Accessible name for the panel. */
  label: string;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const drag = useRef<{ x: number; y: number; t: number; dx: number; active: boolean } | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === "mouse" || drag.current) return;
    drag.current = { x: e.clientX, y: e.clientY, t: performance.now(), dx: 0, active: false };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const g = drag.current, el = ref.current;
    if (!g || !el) return;
    const dx = e.clientX - g.x, dy = e.clientY - g.y;
    if (!g.active) {
      if (Math.abs(dx) < 10 || Math.abs(dx) < Math.abs(dy) * 1.2) return;
      g.active = true;
      el.style.transition = "none";
    }
    g.dx = Math.max(0, dx);
    el.style.transform = `translateX(${g.dx}px)`;
  };
  const onPointerEnd = () => {
    const g = drag.current, el = ref.current;
    drag.current = null;
    if (!g || !el || !g.active) return;
    const velocity = g.dx / Math.max(1, performance.now() - g.t);
    el.style.transition = "";
    el.style.transform = "";
    if (g.dx > el.offsetWidth * 0.33 || velocity > 0.45) onClose();
  };

  return (
    <dialog ref={ref} className="sheet" aria-label={label}
      onClose={onClose}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerEnd} onPointerCancel={onPointerEnd}>
      {open && (
        <div className="sheet-body">
          <button type="button" onClick={onClose} aria-label="Close" className="sheet-close">
            <Icon name="x" size={18} />
          </button>
          {children}
        </div>
      )}
    </dialog>
  );
}
