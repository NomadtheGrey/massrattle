/**
 * DonateModal — the doors of support (Adam, 2026-10-24:
 * 'Let's get started on the donate button'; BioForge's shape,
 * carried over).
 *
 * THE DOORS, as a list, so a second door slots in without
 * restructuring: Ko-fi is live today (the maker's tip jar,
 * creator-level, not game-specific — reusable as-is). Mass
 * Rattle has NO itch page, so there is no capped second door
 * yet: BioForge's capped door worked because its destination
 * was known (the page at launch); here the destination is
 * still Adam's call, and a door to nowhere would be a dead
 * promise. When he names the second destination, it becomes
 * one more entry in DOORS and lights with no edit elsewhere.
 *
 * The modal owns its own Escape listener (BioForge's house
 * pattern): the cabinet closes when the door opens (the
 * tutorial door's precedent), so the chain sits idle while
 * this modal stands and one ESC closes exactly this modal.
 * Backdrop and X close too.
 */

import * as React from 'react';

/** The maker's tip jar — creator-level, shared across his games. */
export const KOFI_URL = 'https://ko-fi.com/nomadthegrey';

type DonateDoor = {
  key: string;
  label: string;
  blurb: string;
  url: string;
  accent: string;
};

/** The doors of support. A second door slots in here. */
const DOORS: DonateDoor[] = [
  {
    key: 'kofi',
    label: 'KO-FI',
    blurb: 'Tip the maker — one coffee keeps the salvage running.',
    url: KOFI_URL,
    accent: 'border-rose-800 bg-rose-950/40 hover:bg-rose-900/50 text-rose-100',
  },
];

export function DonateModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="hud-panel hud-panel-deep rounded border border-rose-900/60 w-full max-w-sm"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
          <div className="font-mono text-[11px] sm:text-xs font-bold tracking-widest text-zinc-100">❤️ SUPPORT MASS RATTLE</div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close support"
            className="ml-auto px-2.5 py-1 rounded border border-zinc-700 text-zinc-400 font-mono text-[11px] font-bold touch-manipulation"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          <p className="font-mono text-[10px] sm:text-[11px] text-zinc-400 leading-snug">
            Everything is free — support keeps it growing.
          </p>
          {DOORS.map(door => (
            <button
              key={door.key}
              type="button"
              onClick={() => window.open(door.url, '_blank', 'noopener')}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded border text-left touch-manipulation ${door.accent}`}
            >
              <span className="text-lg shrink-0">☕</span>
              <span className="flex flex-col min-w-0">
                <span className="font-mono text-[11px] sm:text-xs font-bold tracking-widest">{door.label}</span>
                <span className="font-mono text-[9px] sm:text-[10px] text-zinc-400 leading-snug">{door.blurb}</span>
              </span>
            </button>
          ))}
          <p className="pt-1 text-center font-mono text-[9px] sm:text-[10px] text-zinc-500">
            One door today, or neither — the game stays free.
          </p>
        </div>
      </div>
    </div>
  );
}
