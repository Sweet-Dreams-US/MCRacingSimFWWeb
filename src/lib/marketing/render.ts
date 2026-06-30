// Marketing email rendering: merge fields, the branded HTML shell, and a
// plaintext alternative.
//
// DELIVERABILITY NOTES (why this file looks the way it does):
//   - We ALWAYS send a plaintext part alongside HTML. Spam filters penalise
//     HTML-only mail; a real multipart/alternative message looks human.
//   - A visible unsubscribe link in the footer is mandatory (CAN-SPAM) AND
//     helps inbox placement — Gmail/Yahoo reward easy opt-out.
//   - A real physical postal address in the footer is required by CAN-SPAM.
//   - The "preheader" is the snippet shown in the inbox preview; a good one
//     improves open rates and looks legitimate.
//   - Light background + dark text renders consistently across clients and in
//     dark mode, where heavy dark templates often get color-inverted oddly.

export const BUSINESS_NAME = 'MC Racing Sim Fort Wayne'

// Configurable so the owner can correct it without a code change. CAN-SPAM
// requires a valid physical postal address in every marketing email.
export function getPostalAddress(): string {
  return (
    process.env.MARKETING_POSTAL_ADDRESS ||
    '1205 W Main St, Fort Wayne, IN 46808'
  )
}

// Canonical public site URL, used to build absolute links (logo, unsubscribe).
export function getSiteUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL || 'https://www.mcracingfortwayne.com'
  return raw.replace(/\/+$/, '') // strip trailing slash
}

// ---------------------------------------------------------------------------
// Merge fields
// ---------------------------------------------------------------------------

export interface MergeVars {
  firstName: string
  lastName: string
  fullName: string
}

export function mergeVarsFor(customer: {
  first_name: string | null
  last_name: string | null
}): MergeVars {
  const firstName = (customer.first_name || '').trim() || 'racer'
  const lastName = (customer.last_name || '').trim()
  const fullName = `${firstName} ${lastName}`.trim()
  return { firstName, lastName, fullName }
}

// Replace {{firstName}}, {{lastName}}, {{fullName}} (case-insensitive, tolerant
// of inner spaces like {{ firstName }}). Unknown tokens are left as-is so a
// typo is visible in preview rather than silently dropped.
export function applyMergeFields(content: string, vars: MergeVars): string {
  return content
    .replace(/\{\{\s*firstName\s*\}\}/gi, escapeHtml(vars.firstName))
    .replace(/\{\{\s*lastName\s*\}\}/gi, escapeHtml(vars.lastName))
    .replace(/\{\{\s*fullName\s*\}\}/gi, escapeHtml(vars.fullName))
}

// Same as above but for the plaintext part (no HTML escaping).
export function applyMergeFieldsText(content: string, vars: MergeVars): string {
  return content
    .replace(/\{\{\s*firstName\s*\}\}/gi, vars.firstName)
    .replace(/\{\{\s*lastName\s*\}\}/gi, vars.lastName)
    .replace(/\{\{\s*fullName\s*\}\}/gi, vars.fullName)
}

// ---------------------------------------------------------------------------
// Composer text -> HTML
// ---------------------------------------------------------------------------

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

// Turn the owner's plain message (blank line = new paragraph, single newline =
// line break) into safe paragraph HTML. We escape everything first so the
// owner can't accidentally (or maliciously) inject markup; merge-field tokens
// survive because they're plain text.
export function composerTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, '\n').trim()
  if (!normalized) return ''
  const paragraphs = normalized.split(/\n{2,}/)
  return paragraphs
    .map((p) => {
      const inner = escapeHtml(p).replace(/\n/g, '<br />')
      return `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1a1a1a;">${inner}</p>`
    })
    .join('\n')
}

// Compose the inner body HTML from the owner's raw composer fields: the message
// text becomes paragraphs, and an optional CTA button is appended. Merge-field
// tokens (e.g. {{firstName}}) pass through untouched for substitution at send
// time. Used by the create route, the live preview, and the send engine.
export function composeInnerHtml(params: {
  bodyText: string
  ctaLabel?: string | null
  ctaUrl?: string | null
}): string {
  const paragraphs = composerTextToHtml(params.bodyText)
  const hasCta =
    params.ctaLabel &&
    params.ctaLabel.trim() &&
    params.ctaUrl &&
    params.ctaUrl.trim()
  const cta = hasCta ? ctaButtonHtml(params.ctaLabel!.trim(), params.ctaUrl!.trim()) : ''
  return `${paragraphs}\n${cta}`.trim()
}

// Optional call-to-action button (bulletproof, table-based for Outlook).
export function ctaButtonHtml(label: string, url: string): string {
  const safeLabel = escapeHtml(label)
  const safeUrl = escapeHtml(url)
  return `
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0;">
    <tr>
      <td align="center" bgcolor="#E62322" style="border-radius:4px;">
        <a href="${safeUrl}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#ffffff;text-decoration:none;letter-spacing:0.5px;text-transform:uppercase;">${safeLabel}</a>
      </td>
    </tr>
  </table>`
}

// ---------------------------------------------------------------------------
// Full HTML shell
// ---------------------------------------------------------------------------

export interface RenderHtmlInput {
  /** Inner body HTML (already merged + composer-rendered). */
  innerHtml: string
  /** Inbox preview snippet. */
  preheader?: string | null
  /** Absolute unsubscribe URL for this recipient. */
  unsubscribeUrl: string
}

export function renderMarketingHtml(input: RenderHtmlInput): string {
  const siteUrl = getSiteUrl()
  const address = getPostalAddress()
  const preheader = (input.preheader || '').trim()

  // Hidden preheader: shows in inbox preview, invisible in the open email.
  const preheaderBlock = preheader
    ? `<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#ffffff;opacity:0;">${escapeHtml(
        preheader
      )}</div>`
    : ''

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>${escapeHtml(BUSINESS_NAME)}</title>
</head>
<body style="margin:0;padding:0;background-color:#f2f2f2;-webkit-text-size-adjust:100%;">
  ${preheaderBlock}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f2f2f2;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border-radius:8px;overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background-color:#0D0D0D;padding:24px 32px;border-bottom:4px solid #E62322;">
              <a href="${siteUrl}" target="_blank" style="text-decoration:none;">
                <span style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;letter-spacing:1px;color:#ffffff;text-transform:uppercase;">MC <span style="color:#E62322;">Racing Sim</span></span>
              </a>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;font-family:Arial,Helvetica,sans-serif;">
              ${input.innerHtml}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding:24px 32px;background-color:#f7f7f7;border-top:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;">
              <p style="margin:0 0 8px;font-size:13px;line-height:1.5;color:#666666;">
                <strong style="color:#1a1a1a;">${escapeHtml(BUSINESS_NAME)}</strong><br />
                ${escapeHtml(address)}
              </p>
              <p style="margin:0;font-size:12px;line-height:1.5;color:#888888;">
                You're receiving this because you've visited or booked with us.
                <a href="${input.unsubscribeUrl}" target="_blank" style="color:#888888;text-decoration:underline;">Unsubscribe</a>
                anytime &mdash; we'll stop immediately.
              </p>
            </td>
          </tr>
        </table>
        <p style="margin:16px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;color:#aaaaaa;">
          &copy; ${escapeHtml(BUSINESS_NAME)}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>`
}

// ---------------------------------------------------------------------------
// Plaintext alternative
// ---------------------------------------------------------------------------

// Very small HTML -> text reducer for the plaintext part. We don't need a full
// parser: collapse block tags to newlines, drop the rest, decode the few
// entities we emit.
export function htmlToPlainText(html: string): string {
  return html
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|h[1-6]|tr|li)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&mdash;/gi, '—')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function renderMarketingText(
  innerText: string,
  unsubscribeUrl: string
): string {
  const address = getPostalAddress()
  return `${innerText.trim()}

—
${BUSINESS_NAME}
${address}

Unsubscribe anytime: ${unsubscribeUrl}`
}
