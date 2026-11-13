// Supabase Edge Function "inbox"
//  action "read": read one inbox document (Admin, from the app).
//     Text PDFs (Rolex invoices) are left for the app's layout reader (no AI).
//     Scans / photos are read by Claude into lines (part #, MRWS #, qty, price).
//  action "check": Admin pressed "Check email": run the Gmail script (GMAIL_SCRIPT_URL) or fetch the M365 mailbox.
//  action "ingest": the Gmail script drops off one attachment (secret INGEST_SECRET).
//  action "mail": fetch the M365 mailbox (for an optional schedule; secret CRON_SECRET).
// Email is only checked when asked: no timer.
// Nothing is applied to stock here: documents wait in the Inbox for Admin to press Apply.
//
// Secrets (Supabase → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY                      for reading scans
//   CRON_SECRET                            shared with the schedule that calls action "mail"
//   MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET, INBOX_MAILBOX   for a Microsoft 365 mailbox (set up by IT)
//   INGEST_SECRET, GMAIL_SCRIPT_URL        for the Gmail option (scripts/gmail-inbox.gs, deployed as a web app)
import Anthropic from "npm:@anthropic-ai/sdk";
import { createClient } from "npm:@supabase/supabase-js@2";
import { encodeBase64 } from "jsr:@std/encoding@1/base64";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const svc = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-role, x-cron-secret, x-ingest-secret",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ACCEPT = ["application/pdf", ...IMAGE_TYPES];

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["doc_type", "doc_no", "date", "lines"],
  properties: {
    doc_type: { type: "string", enum: ["invoice", "packing_list", "other"] },
    doc_no: { type: "string" },
    date: { type: "string" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["mrws_ref", "ref", "desc", "qty", "unit_price"],
        properties: {
          mrws_ref: { type: "string" },
          ref: { type: "string" },
          desc: { type: "string" },
          qty: { type: "number" },
          unit_price: { type: "number" },
        },
      },
    },
  },
};

const PROMPT = `You read delivery documents from Rolex Canada for a watch service workshop in Calgary: sales invoices and packing lists, often scanned or photographed.

Copy exactly what is printed; the workshop checks every line before anything is applied, so a blank is better than a guess.
- doc_type: "invoice" for a sales invoice (prices and totals), "packing_list" for a packing list, delivery note or bordereau, otherwise "other".
- doc_no: the invoice number, or the packing list / delivery number. Not the customer number (3000000023) and not the sales order number.
- date: the document date as YYYY-MM-DD.
- lines: one entry per item line in the table, in printed order, across all pages. Never add lines that are not printed.
  - ref: the item number exactly as printed, including any leading B or V and the pack suffix (for example B3135-5110-Y5 or V14-601).
  - mrws_ref: the customer reference printed on that line, or "" if there is none.
  - qty: the quantity shipped on that line.
  - unit_price: the unit price if printed, otherwise 0.
  - desc: the description as printed, leaving out serial numbers.
If a value can't be read, use "" (or 0 for numbers).`;

async function readDoc(id: string, force = false) {
  const { data: row, error } = await svc.from("inbox").select("*").eq("id", id).single();
  if (error || !row) throw new Error("Inbox item not found");
  await svc.from("inbox").update({ status: "reading", error: null, updated_at: new Date().toISOString() }).eq("id", id);
  try {
    const { data: file, error: dlErr } = await svc.storage.from("inbox").download(row.file_path);
    if (dlErr || !file) throw new Error("The file could not be opened");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const mime = row.mime || file.type || "";
    const isPdf = mime === "application/pdf" || /\.pdf$/i.test(row.file_name);

    // Text PDFs (Rolex's own PDFs) are read in the app by layout, no AI needed
    if (isPdf && !force && new TextDecoder("latin1").decode(bytes).includes("/Font")) {
      await svc.from("inbox").update({ status: "ready", read_by: "layout", updated_at: new Date().toISOString() }).eq("id", id);
      return { read_by: "layout" };
    }
    if (!isPdf && !IMAGE_TYPES.includes(mime)) throw new Error("Send a PDF, JPG or PNG");
    if (!Deno.env.get("ANTHROPIC_API_KEY")) throw new Error("Scan reading isn't switched on yet (no Anthropic API key)");

    const data = encodeBase64(bytes);
    const doc = isPdf
      ? { type: "document" as const, source: { type: "base64" as const, media_type: "application/pdf" as const, data } }
      : { type: "image" as const, source: { type: "base64" as const, media_type: mime as "image/jpeg", data } };

    const client = new Anthropic();
    const res = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
      system: PROMPT,
      messages: [{ role: "user", content: [doc, { type: "text", text: "Read this delivery document." }] }],
    });
    if (res.stop_reason === "refusal") throw new Error("The document could not be read automatically. Enter it by hand.");
    if (res.stop_reason === "max_tokens") throw new Error("The document is too long to read in one go. Split it into smaller files.");
    const text = res.content.find((b) => b.type === "text");
    if (!text || text.type !== "text") throw new Error("Nothing was read from the document");
    const out = JSON.parse(text.text);

    const parsed = {
      invoiceNo: out.doc_no || "",
      date: /^\d{4}-\d{2}-\d{2}$/.test(out.date) ? out.date : null,
      dateText: out.date || "",
      lines: (out.lines || []).map((l: Record<string, unknown>) => ({
        custRef: String(l.mrws_ref || ""), ref: String(l.ref || "").replace(/\s+/g, ""), desc: String(l.desc || ""),
        qty: Number(l.qty) || 0, uom: "PCE", unitPrice: Number(l.unit_price) || 0, amount: 0,
      })),
    };
    await svc.from("inbox").update({
      status: "ready", read_by: "claude", parsed,
      doc_type: out.doc_type === "other" ? null : out.doc_type, doc_no: parsed.invoiceNo || null, doc_date: parsed.date,
      updated_at: new Date().toISOString(),
    }).eq("id", id);
    return { read_by: "claude", lines: parsed.lines.length };
  } catch (e) {
    const msg = e instanceof Anthropic.APIError ? `Reading service error (${e.status})` : (e as Error).message;
    await svc.from("inbox").update({ status: "error", error: msg, updated_at: new Date().toISOString() }).eq("id", id);
    throw new Error(msg);
  }
}

// Save one emailed attachment to the inbox and read it
async function storeDoc(bin: Uint8Array, name: string, type: string, sender: string | null, subject: string | null) {
  type = String(type || "").toLowerCase();
  const isPdf = type === "application/pdf" || /\.pdf$/i.test(name);
  if (!isPdf && !ACCEPT.includes(type)) return null;
  const path = `email/${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID()}-${String(name).replace(/[^\w.\-]+/g, "_")}`;
  const up = await svc.storage.from("inbox").upload(path, bin, { contentType: isPdf ? "application/pdf" : type });
  if (up.error) throw new Error("Could not save the file");
  const { data: row } = await svc.from("inbox").insert({
    source: "email", sender, subject, file_path: path, file_name: name, mime: isPdf ? "application/pdf" : type,
  }).select("id").single();
  // Read in the background so the caller isn't kept waiting on slow scans
  if (row) background(readDoc(row.id).catch(() => {}));
  return row?.id ?? null;
}

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;
function background(p: Promise<unknown>) {
  if (typeof EdgeRuntime !== "undefined" && EdgeRuntime?.waitUntil) EdgeRuntime.waitUntil(p);
}

async function checkEmail() {
  const url = Deno.env.get("GMAIL_SCRIPT_URL");
  const secret = Deno.env.get("INGEST_SECRET");
  if (url && secret) {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ secret }), redirect: "follow" });
    const out = await res.json().catch(() => ({ error: "The Gmail script didn't answer. Check its deployment." }));
    if (out.error) throw new Error(out.error);
    return { source: "gmail", documents: out.sent ?? 0, failed: out.failed ?? 0 };
  }
  const m = await fetchMail();
  if ("skipped" in m) throw new Error("No email inbox is connected yet");
  return { source: "microsoft", documents: m.documents, failed: 0 };
}

async function fetchMail() {
  const env = (k: string) => Deno.env.get(k) || "";
  const [tenant, clientId, secret, mailbox] = ["MS_TENANT_ID", "MS_CLIENT_ID", "MS_CLIENT_SECRET", "INBOX_MAILBOX"].map(env);
  if (!tenant || !clientId || !secret || !mailbox) return { skipped: "Mailbox not set up yet" };

  const tok = await fetch(`https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`, {
    method: "POST",
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, grant_type: "client_credentials", scope: "https://graph.microsoft.com/.default" }),
  }).then((r) => r.json());
  if (!tok.access_token) throw new Error("Mailbox sign-in failed");
  const g = (path: string, init: RequestInit = {}) =>
    fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(mailbox)}${path}`, {
      ...init, headers: { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json", ...(init.headers || {}) },
    });

  const list = await g(`/mailFolders/inbox/messages?$filter=isRead eq false&$top=20&$select=id,subject,from,receivedDateTime`).then((r) => r.json());
  let docs = 0;
  for (const m of list.value || []) {
    const atts = await g(`/messages/${m.id}/attachments`).then((r) => r.json());
    for (const a of atts.value || []) {
      if (a["@odata.type"] !== "#microsoft.graph.fileAttachment" || a.isInline) continue;
      const bin = Uint8Array.from(atob(a.contentBytes), (c) => c.charCodeAt(0));
      const id = await storeDoc(bin, a.name, a.contentType, m.from?.emailAddress?.address || null, m.subject || null).catch(() => null);
      // (reading happens in the background inside storeDoc)
      if (id) docs++;
    }
    await g(`/messages/${m.id}`, { method: "PATCH", body: JSON.stringify({ isRead: true }) });
  }
  return { messages: (list.value || []).length, documents: docs };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "mail") {
      const secret = Deno.env.get("CRON_SECRET");
      if (!secret || req.headers.get("x-cron-secret") !== secret) return json({ error: "Not allowed" }, 401);
      return json(await fetchMail());
    }
    // Drop-off from the Gmail Apps Script (or any mail forwarder): one attachment per call
    if (body.action === "ingest") {
      const secret = Deno.env.get("INGEST_SECRET");
      if (!secret || secret.length < 24 || req.headers.get("x-ingest-secret") !== secret) return json({ error: "Not allowed" }, 401);
      if (!body.data || !body.filename) return json({ error: "Missing file" }, 400);
      const bin = Uint8Array.from(atob(body.data), (c) => c.charCodeAt(0));
      if (bin.length > 25 * 1024 * 1024) return json({ error: "File too large" }, 413);
      const id = await storeDoc(bin, String(body.filename), String(body.mime || ""), body.sender || null, body.subject || null);
      return json(id ? { ok: true, id } : { ok: false, skipped: "Not a PDF or image" });
    }
    if ((body.action === "read" && body.id) || body.action === "check") {
      const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, {
        global: { headers: { ...(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test((req.headers.get("Authorization") || "")) ? { Authorization: (req.headers.get("Authorization") || "") } : {}), "x-app-role": req.headers.get("x-app-role") || "" } },
      });
      const { data: role } = await user.rpc("app_role");
      if (role !== "admin") return json({ error: "Only Admin can use the inbox" }, 403);
      if (body.action === "check") return json(await checkEmail());
      return json(await readDoc(body.id, !!body.force));
    }
    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
