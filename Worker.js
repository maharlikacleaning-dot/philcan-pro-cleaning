/**
 * PhilCan Pro Cleaning Services — email relay for Resend
 * =========================================================================
 * Why this file exists:
 * Resend's API needs a SECRET API key, sent in an Authorization header.
 * That key can never live in the website's HTML/JS — anyone could open
 * dev tools, copy it, and send email through your Resend account.
 *
 * This Worker sits in between: the website calls THIS Worker (which has
 * no secrets exposed to visitors), and the Worker calls Resend using a
 * key stored privately as a Cloudflare secret (env.RESEND_API_KEY below).
 *
 * DEPLOY STEPS (Cloudflare's free tier is enough for this)
 * -------------------------------------------------------------------------
 * Option A — Cloudflare dashboard (no install required):
 *   1. Go to https://dash.cloudflare.com -> Workers & Pages -> Create ->
 *      "Create Worker".
 *   2. Give it a name (e.g. "philcanpro-email-relay"), click Deploy.
 *   3. Click "Edit code", delete the sample code, and paste in this
 *      entire file. Click "Deploy".
 *   4. Go to Settings -> Variables -> Secrets -> "Add secret":
 *        Name:  RESEND_API_KEY
 *        Value: (your real Resend API key, starts with "re_")
 *   5. Copy the Worker's URL shown at the top (something like
 *      https://philcanpro-email-relay.YOUR-SUBDOMAIN.workers.dev)
 *      and add "/send" to the end of it.
 *   6. Paste that full URL into EMAIL_API_ENDPOINT in index.html's
 *      <script> section (there are two places it's used from — just one
 *      constant to edit).
 *
 * Option B — Wrangler CLI (if you're comfortable with the terminal):
 *   npm install -g wrangler
 *   wrangler login
 *   wrangler init philcanpro-email-relay        (choose "Hello World" Worker)
 *   # replace the generated src/index.js with this file's contents
 *   wrangler secret put RESEND_API_KEY           (paste your Resend key)
 *   wrangler deploy
 *
 * BEFORE GOING LIVE
 * -------------------------------------------------------------------------
 * - Update RECIPIENT_EMAIL and SENDER_EMAIL below.
 * - SENDER_EMAIL must be on a domain you've verified in Resend
 *   (Resend -> Domains). Until you verify a domain, Resend's shared
 *   "onboarding@resend.dev" sender only delivers to your own account
 *   email — fine for testing, not for real customer submissions.
 * - Tighten ALLOWED_ORIGIN below to your real website domain instead of
 *   "*", so only your site can call this Worker.
 * =========================================================================
 */

const RECIPIENT_EMAIL = "info@philcanpro.ca";                       // where submissions land
const SENDER_EMAIL = "PhilCan Pro Website <onboarding@resend.dev>"; // update once your domain is verified in Resend
const ALLOWED_ORIGIN = "*"; // replace with "https://your-real-domain.com" once deployed

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders() });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    let data;
    try {
      data = await request.json();
    } catch (err) {
      return jsonResponse({ ok: false, error: "Invalid JSON body" }, 400);
    }

    const subject = `New ${data.formType || "Website"} Submission — PhilCan Pro`;
    const html = buildEmailHTML(data);

    try {
      const resendRes = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: SENDER_EMAIL,
          to: [RECIPIENT_EMAIL],
          reply_to: data.Email || undefined,
          subject,
          html,
        }),
      });

      if (!resendRes.ok) {
        const errText = await resendRes.text();
        return jsonResponse({ ok: false, error: errText }, 502);
      }

      return jsonResponse({ ok: true });
    } catch (err) {
      return jsonResponse({ ok: false, error: err.message }, 500);
    }
  },
};

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function jsonResponse(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...corsHeaders(), "Content-Type": "application/json" },
  });
}

function buildEmailHTML(data) {
  const rows = Object.entries(data)
    .filter(([key]) => key !== "formType")
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 10px;font-weight:600;vertical-align:top;">${escapeHtml(key)}</td>` +
        `<td style="padding:6px 10px;white-space:pre-wrap;">${escapeHtml(String(value ?? ""))}</td></tr>`
    )
    .join("");

  return `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1F2937;">
      <h2 style="color:#0B3D66;">${escapeHtml(data.formType || "Website Submission")}</h2>
      <table style="border-collapse:collapse;width:100%;max-width:600px;">${rows}</table>
    </div>
  `;
}

function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}