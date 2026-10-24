/**
 * feedbackSend — the feedback form's sending arm (Mass Rattle,
 * Adam, 2026-10-24: built like BioForge's, whose modal this
 * copies in shape and in failure pins).
 *
 * THE SETUP CONTRACT — this module sends template_params named
 * exactly: { subject, message, from_email, reply_to }. Whichever
 * EmailJS template Adam's pick lands on must declare those same
 * variables, so a mis-matched template is a setup bug, not a
 * code bug:
 *   template subject:  {{subject}}
 *   template body:     {{message}}
 *   Reply To:          {{reply_to}}
 *
 * WHY REST, NOT THE SDK: the send is one plain POST to EmailJS's
 * public API — a fetch is all of it. A library would buy
 * nothing the endpoint doesn't give directly.
 *
 * THE NEVER-THROW LAW: sendFeedback resolves every failure as a
 * value ({ ok: false, reason }) — a form showing a sending
 * spinner must never owe its player a stack trace. The form
 * owns the fallback door (mailto); this module only reports.
 *
 * THE DARK-UNTIL-LIT LAW: EMAILJS_* are all null until Adam's
 * own Mass Rattle email is connected as an EmailJS service
 * (his call, 2026-10-24, clarified the same day: EmailJS is a
 * relay — it sends THROUGH the connected Mass Rattle Gmail,
 * so the note lands in the Mass Rattle address; BioForge's
 * service and template are NOT reused) and the wiring lands on
 * his word; feedbackSendConfigured() is false then, and the
 * form keeps its mailto door. A half-addressed service never
 * half-sends.
 *
 * ANTI-ABUSE (named honestly): the public key is DESIGNED to
 * ship in client code — its safety is not secrecy. What stops
 * a stranger from spending the quota is EmailJS's Allowed
 * Domains restriction, which Adam sets to the game's own
 * addresses in the dashboard. There is no origin allowlist in
 * this file — the browser would have to send the key with the
 * request anyway, so a client-side check would be theater,
 * not protection.
 */

// WIRING POINT (Adam's word required): these fill in only from
// Adam's Mass Rattle email connected as an EmailJS service
// (his call 2026-10-24 — never BioForge's service or template).
// Until then they stay null and the form stays on its mailto
// door. The private key is never collected.
const EMAILJS_SERVICE_ID: string | null = null;
const EMAILJS_TEMPLATE_ID: string | null = null;
const EMAILJS_PUBLIC_KEY: string | null = null;

/**
 * The address the form's mailto fallback door writes to — also
 * Adam's new Mass Rattle address, null until it exists. The
 * form shows the mailto door only when this is set.
 */
export const FEEDBACK_EMAIL: string | null = null;

const EMAILJS_ENDPOINT = 'https://api.emailjs.com/api/v1.0/email/send';

/** Ten seconds: a feedback send must never hold the form hostage. */
const SEND_TIMEOUT_MS = 10_000;

/** What the form passes: the composed note, already worded. */
export interface FeedbackSendInput {
  /** The composed subject ("Mass Rattle — issue: …"), built by the form. */
  subject: string;
  /** The composed body, with whatever footer the form attached. */
  message: string;
  /**
   * The player's own address, when they want a reply —
   * optional by design. Sent as from_email AND reply_to so
   * the game's inbox can answer the player directly.
   * Empty string when they keep it to themselves.
   */
  fromEmail?: string;
}

export type FeedbackSendFailure = 'unconfigured' | 'network' | 'rejected';

/** Never throws — read the reason, never a stack. */
export type FeedbackSendResult =
  | { ok: true }
  | { ok: false; reason: FeedbackSendFailure; status?: number };

/**
 * Is the direct-send door lit? All three constants must be
 * addressed — they stay dark until Adam's pick lands.
 */
export function feedbackSendConfigured(): boolean {
  return (
    EMAILJS_SERVICE_ID !== null &&
    EMAILJS_TEMPLATE_ID !== null &&
    EMAILJS_PUBLIC_KEY !== null
  );
}

/**
 * Send the note through EmailJS. Resolves { ok: true } on a 200,
 * { ok: false, reason } for everything else — including the
 * unconfigured state, which never touches the network.
 */
export async function sendFeedback(
  input: FeedbackSendInput,
): Promise<FeedbackSendResult> {
  if (!feedbackSendConfigured()) {
    return { ok: false, reason: 'unconfigured' };
  }
  const fromEmail = input.fromEmail ?? '';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch(EMAILJS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: {
          subject: input.subject,
          message: input.message,
          from_email: fromEmail,
          reply_to: fromEmail,
        },
      }),
    });
    if (res.ok) return { ok: true };
    // Rejected at the service: bad IDs, disabled service, spent
    // quota — the status names the class; the form shows the
    // fallback door, never the raw number.
    return { ok: false, reason: 'rejected', status: res.status };
  } catch {
    // Abort (timeout), DNS, offline — one honest word for all of
    // the ways the wire can fail silently.
    return { ok: false, reason: 'network' };
  } finally {
    clearTimeout(timer);
  }
}
