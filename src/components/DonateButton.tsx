/**
 * DonateButton — the support door (BioForge's shape, Adam,
 * 2026-10-24).
 *
 * One component, many seats: it owns its modal state, so a
 * seat needs no wiring beyond dropping the button in — the
 * modal renders from here. The cabinet seat passes onOpen so
 * the cabinet closes when the door opens (the tutorial door's
 * precedent); a future seat that needs no such step — the
 * lobby room view, for one — drops the button in bare and
 * the modal still stands on its own.
 */

import * as React from 'react';
import { DonateModal } from './DonateModal';

export function DonateButton({ onOpen }: { onOpen?: () => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => { onOpen?.(); setOpen(true); }}
        title="Support Mass Rattle"
        className="w-full mb-4 px-3 py-2 rounded border border-rose-800 bg-rose-950/40 text-rose-200 font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation"
      >
        ❤️ DONATE — SUPPORT THE MAKER
      </button>
      <DonateModal isOpen={open} onClose={() => setOpen(false)} />
    </>
  );
}
