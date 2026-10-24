/**
 * FeedbackModal — the player's word to the grower (Adam,
 * 2026-10-24: Mass Rattle gets its own feedback page, like
 * BioForge's, on his 'Ok, proceed please').
 *
 * THE SHAPE (BioForge's proven one, carried over): the modal
 * composes ONE note — subject + body — and every door reads
 * that same composed note. The direct send is a plain fetch
 * POST to EmailJS's public API (no SDK); it never hangs (10
 * seconds, then it gives up) and never throws (a refusal lands
 * in 'failed' with the words intact and the reason on screen).
 * COPY MY NOTE carries the full composed note out, so a failed
 * send traps nothing.
 *
 * THE DESTINATION, PARAMETERIZED (Adam, 2026-10-24: 'I'll make
 * another email for Mass Rattle'): BioForge's EmailJS account
 * is NOT reused. These constants stay null until Adam's new
 * Mass Rattle mailbox exists, and the wiring commit fills them
 * — the same public-config pattern BioForge used:
 *   FEEDBACK_EMAIL  — the new mailbox address (mailto door)
 *   EMAILJS_SERVICE_ID — Email Services → the Gmail service
 *   EMAILJS_TEMPLATE_ID — Email Templates → the template,
 *     declaring {{subject}} / {{message}} / Reply-To {{reply_to}}
 *   EMAILJS_PUBLIC_KEY — Account → API Keys → Public Key
 * The private key is NEVER collected (BioForge's strict-mode
 * rule): the game sends with the public key only, and the
 * account's Allowed Domains list must include Mass Rattle's
 * live address, or the service refuses the send.
 * Until then the direct door stays dark, honestly: SEND NOTE
 * is disabled with the reason on screen, and COPY MY NOTE —
 * which needs no account at all — carries the note out today.
 */

import * as React from 'react';
import { copyTextToClipboard } from './lobby/LobbyScreen';

/** The new Mass Rattle mailbox — null until Adam makes it. */
export const FEEDBACK_EMAIL: string | null = null;
/** EmailJS public config — null until Adam's new account is wired. */
export const EMAILJS_SERVICE_ID: string | null = null;
export const EMAILJS_TEMPLATE_ID: string | null = null;
export const EMAILJS_PUBLIC_KEY: string | null = null;

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

/** Ten seconds: a feedback send must never hold the modal hostage. */
const SEND_TIMEOUT_MS = 10_000;

export type FeedbackSendFailure = 'unconfigured' | 'network' | 'rejected';

/** Never throws — read the reason, never a stack.
 *  FLAT, NOT A DISCRIMINATED UNION, ON PURPOSE: this project's
 *  tsconfig runs without strictNullChecks, and under it tsc
 *  will not narrow a { ok: true } | { ok: false, ... } union
 *  on .ok (verified 2026-10-24: the union form errors here
 *  while the flat form passes). Do not re-discriminate this
 *  without turning strictNullChecks on project-wide. */
export type FeedbackSendResult = {
  ok: boolean;
  reason?: FeedbackSendFailure;
  status?: number;
};

/** Is the direct-send door lit? All three constants must be addressed. */
export function feedbackSendConfigured(): boolean {
  return !!EMAILJS_SERVICE_ID && !!EMAILJS_TEMPLATE_ID && !!EMAILJS_PUBLIC_KEY;
}

async function sendFeedback(input: {
  subject: string;
  message: string;
  fromEmail?: string;
}): Promise<FeedbackSendResult> {
  if (!feedbackSendConfigured()) return { ok: false, reason: 'unconfigured' };
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const templateParams: Record<string, string> = {
      subject: input.subject,
      message: input.message,
    };
    if (input.fromEmail) {
      templateParams.from_email = input.fromEmail;
      templateParams.reply_to = input.fromEmail;
    }
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams,
      }),
      signal: controller.signal,
    });
    if (!res.ok) return { ok: false, reason: 'rejected', status: res.status };
    return { ok: true };
  } catch {
    return { ok: false, reason: 'network' };
  } finally {
    window.clearTimeout(timer);
  }
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
    if (result.ok) {
      setPhase('sent');
    } else {
      setFailInfo({ reason: result.reason ?? 'network', status: result.status });
      setPhase('failed');
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
              <button
                type="button"
                disabled={!directSend || !message.trim() || phase === 'sending'}
                onClick={handleDirectSend}
                className="w-full px-3 py-2 rounded border border-zinc-700 text-zinc-200 font-mono text-[10px] sm:text-[11px] font-bold tracking-widest touch-manipulation disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {phase === 'sending' ? 'SENDING…' : '📨 SEND NOTE'}
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
