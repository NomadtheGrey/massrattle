/**
 * FeedbackModal — the player's word to the grower (Adam,
 * 2026-10-24: Mass Rattle gets its own feedback page, like
 * BioForge's, on his 'Ok, proceed please').
 *
 * THE SHAPE (BioForge's proven one, carried over): the modal
 * composes ONE note — subject + body — and every door reads
 * that same composed note. The send arm lives in BG's module
 * (src/feedbackSend.ts: plain fetch POST to EmailJS's public
 * API, no SDK, 10-second timeout, never throws); this modal
 * only owns the form, the failure display, and the escapes.
 * COPY MY NOTE carries the full composed note out, so a failed
 * send traps nothing. A sent note resets on reopen.
 *
 * THE DESTINATION, PARAMETERIZED (Adam, 2026-10-24: 'I'll make
 * another email for Mass Rattle'): BioForge's EmailJS account
 * is NOT reused. The module's wiring point (its EMAILJS_*
 * constants + FEEDBACK_EMAIL) stays null until Adam's new
 * Mass Rattle mailbox exists; the wiring commit fills them —
 * public config only, the private key never collected.
 * Until then the direct door stays dark, honestly: SEND NOTE
 * is disabled with the reason on screen, COPY MY NOTE (which
 * needs no account) carries the note out today, and the mailto
 * door appears the moment the address exists.
 *
 * THE UNION GUARD (2026-10-24): the module's result is a
 * discriminated union, and this project's tsconfig runs
 * without strictNullChecks — under it tsc will NOT narrow
 * that union on .ok (verified three ways). So this modal
 * reads failures through the isSendFailure predicate below,
 * which narrows fine. Do not replace the guard with a bare
 * .ok check without turning strictNullChecks on project-wide.
 */

import * as React from 'react';
import { copyTextToClipboard } from './lobby/LobbyScreen';

import { sendFeedback, feedbackSendConfigured, FEEDBACK_EMAIL } from '../feedbackSend';
import type { FeedbackSendResult, FeedbackSendFailure } from '../feedbackSend';

/** Narrow the module's union result to its failure member.
 *  A bare .ok check does NOT narrow under this tsconfig (see
 *  the header); an explicit predicate does. */
function isSendFailure(r: FeedbackSendResult): r is { ok: false; reason: FeedbackSendFailure; status?: number } {
  return !r.ok;
}

type SendPhase = 'compose' | 'sending' | 'sent' | 'failed';

export function FeedbackModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [kind, setKind] = React.useState<'issue' | 'recommendation'>('issue');
  const [message, setMessage] = React.useState('');
  const [replyEmail, setReplyEmail] = React.useState('');
  const [phase, setPhase] = React.useState<SendPhase>('compose');
  const [failInfo, setFailInfo] = React.useState<{ reason: string; status?: number } | null>(null);
  const [noteCopied, setNoteCopied] = React.useState(false);
  const noteCopiedTimer = React.useRef<number | null>(null);

  // A sent note is spent: reopening after a send starts fresh.
  React.useEffect(() => {
    if (isOpen && phase === 'sent') {
      setPhase('compose');
      setMessage('');
      setReplyEmail('');
      setFailInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  if (!isOpen) return null;

  const directSend = feedbackSendConfigured();
  const kindWord = kind === 'issue' ? 'Issue' : 'Recommendation';
  const firstLine = message.trim().split('\n')[0]?.slice(0, 48) ?? '';
  const subject = `Mass Rattle — ${kindWord}${firstLine ? `: ${firstLine}` : ''}`;
  const composedBody = message.trim();

  const handleCopyNote = async () => {
    if (await copyTextToClipboard(`${subject}\n\n${composedBody}`)) {
      setNoteCopied(true);
      if (noteCopiedTimer.current) window.clearTimeout(noteCopiedTimer.current);
      noteCopiedTimer.current = window.setTimeout(() => setNoteCopied(false), 2000);
    }
  };

  const handleDirectSend = async () => {
    if (!message.trim() || phase === 'sending' || !directSend) return;
    setPhase('sending');
    setFailInfo(null);
    const result = await sendFeedback({
      subject,
      message: composedBody,
      fromEmail: replyEmail.trim() || undefined,
    });
    if (isSendFailure(result)) {
      setFailInfo({ reason: result.reason, status: result.status });
      setPhase('failed');
    } else {
      setPhase('sent');
    }
  };

  const failWords =
    failInfo?.reason === 'network'
      ? 'Why: the note never reached the mail service — the connection failed, or took too long (it gives up after 10 seconds).'
      : failInfo?.reason === 'rejected'
        ? `Why: the mail service answered but refused the note${failInfo.status ? ` (status ${failInfo.status})` : ''}.`
        : 'Why: the direct send is not configured.';

  return (
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md pointer-events-auto"
      onClick={onClose}
    >
      <div
        className="hud-panel hud-panel-deep rounded border border-zinc-700 w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-4 py-3 flex items-center gap-3 border-b border-zinc-800">
          <div className="font-mono text-[11px] sm:text-xs font-bold tracking-widest text-zinc-100">💬 FEEDBACK — MASS RATTLE</div>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto px-2.5 py-1 rounded border border-zinc-700 text-zinc-400 font-mono text-[11px] font-bold touch-manipulation"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-3 flex flex-col gap-3">
          {phase === 'sent' ? (
            <>
              <p className="font-mono text-[11px] sm:text-xs text-emerald-300 leading-snug">
                ✓ SENT — thanks. Your note is on its way to the grower.
              </p>
              <button
                type="button"
                onClick={onClose}
                className="w-full px-3 py-2 rounded border border-zinc-700 text-zinc-200 font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation"
              >
                CLOSE
              </button>
            </>
          ) : (
            <>
              <p className="font-mono text-[10px] sm:text-[11px] text-zinc-400 leading-snug">
                Report an issue or suggest something — it goes straight to the grower.
              </p>
              <div className="flex gap-2">
                {(['issue', 'recommendation'] as const).map(k => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setKind(k)}
                    className={`flex-1 px-3 py-2 rounded border font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation ${kind === k ? 'bg-emerald-950/60 text-[#33ff33] border-emerald-800' : 'bg-zinc-900 text-zinc-400 border-zinc-700'}`}
                  >
                    {k === 'issue' ? '🐛 ISSUE' : '💡 RECOMMENDATION'}
                  </button>
                ))}
              </div>
              <textarea
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="What happened, or what would make it better?"
                rows={6}
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-[11px] sm:text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500 resize-y"
              />
              <input
                value={replyEmail}
                onChange={e => setReplyEmail(e.target.value)}
                placeholder="Your email, only if you want a reply (optional)"
                type="email"
                autoComplete="email"
                className="w-full rounded border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-[11px] sm:text-xs text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:border-zinc-500"
              />
              {!directSend && (
                <p className="font-mono text-[9px] sm:text-[10px] text-amber-300 border border-amber-800/60 bg-amber-950/30 rounded px-2.5 py-1.5 leading-snug">
                  Direct send is not wired yet — the Mass Rattle mailbox is still being made. Your note stays here, and COPY MY NOTE below carries it out — paste it anywhere.
                </p>
              )}
              {phase === 'failed' && failInfo && (
                <div className="flex flex-col gap-2 border border-red-900/60 bg-red-950/30 rounded px-3 py-2">
                  <p className="font-mono text-[10px] sm:text-[11px] text-red-200 leading-snug">
                    ✕ SEND FAILED — your note is still here, nothing was lost.
                  </p>
                  <p className="font-mono text-[9px] sm:text-[10px] text-zinc-400 leading-snug">{failWords}</p>
                </div>
              )}
              {FEEDBACK_EMAIL && (phase === 'failed' || !directSend) && (
                <div className="flex flex-col gap-2 border border-zinc-800 rounded px-3 py-2">
                  <p className="font-mono text-[9px] sm:text-[10px] text-zinc-400 leading-snug">
                    Or send it through your own email app — same note, same address:
                  </p>
                  <span className="font-mono text-[11px] text-zinc-200 select-all">{FEEDBACK_EMAIL}</span>
                  <a
                    href={`mailto:${FEEDBACK_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(composedBody)}`}
                    className="w-full text-center px-3 py-2 rounded border border-zinc-700 text-zinc-200 font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation"
                  >
                    ✉️ OPEN IN EMAIL APP
                  </a>
                </div>
              )}
              <button
                type="button"
                disabled={!directSend || !message.trim() || phase === 'sending'}
                onClick={handleDirectSend}
                className="w-full px-3 py-2 rounded border border-zinc-700 text-zinc-200 font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'sending' ? 'SENDING…' : phase === 'failed' ? '↻ TRY SENDING AGAIN' : '📨 SEND NOTE'}
              </button>
              <button
                type="button"
                disabled={!message.trim()}
                onClick={handleCopyNote}
                className="w-full px-3 py-2 rounded border border-zinc-700 text-zinc-200 font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {noteCopied ? '✓ COPIED — PASTE IT ANYWHERE' : '📋 COPY MY NOTE'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
