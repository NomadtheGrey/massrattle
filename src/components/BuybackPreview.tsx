import React from 'react';
import type { previewBuyback } from '../sim/deathEconomy';

/** AUTO-BUYBACK PREVIEW LEDGER (dev pin, 2026-10-25): the
 * Continue / repurchase offer forms show what the automatic
 * kit restores and what it can't afford, prices transparent —
 * the bought/skipped ledger BG's previewBuyback computes (pure;
 * null on free floor / no snapshot / consumed snapshot, so the
 * block simply doesn't render there). Shared by ResultsOverlay
 * (solo Continue) and RepurchaseOverlay (MP repurchase) so the
 * two forms never drift apart. Rendered only in the offer
 * state — the wait state has its own copy (PAYMENT TAKEN). */
export type BuybackPreview = NonNullable<ReturnType<typeof previewBuyback>>;

export const BuybackPreviewLedger: React.FC<{ preview: BuybackPreview | null }> = ({ preview }) => {
  if (!preview) return null;
  return (
    <div className="bg-zinc-900/50 p-4 border border-zinc-800 font-mono text-[10px] leading-snug">
      <div className="text-[10px] text-zinc-500 uppercase mb-2">Auto-buyback — what returns</div>
      {preview.bought.map((l, i) => (
        <div key={`${l.label}-${i}`} className="text-[#33ff33]">✓ {l.label} — {l.price}U</div>
      ))}
      {preview.skipped.map((l, i) => (
        <div key={`${l.label}-${i}`} className="text-zinc-400">
          ✗ {l.label} — {l.price}U · {l.reason === 'cap' ? 'AT CAP' : 'NOT ENOUGH SCRAP'}
        </div>
      ))}
      <div className="text-zinc-300 mt-2">
        AFTER THE {preview.price}U CONTINUE: {preview.budget}U TO SPEND · {preview.spent}U RESTORES · {preview.remaining}U LEFT
      </div>
    </div>
  );
};
