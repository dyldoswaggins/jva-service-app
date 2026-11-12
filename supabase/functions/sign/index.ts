// Supabase Edge Function "sign": the client signs their estimate online (Dylan, 2026-11-12).
// Public (no sign-in) for the client, who holds a private link token; Admin-only for sending the email.
//   { action: "get",    token }                                   → what the signing page shows
//   { action: "submit", token, refused, optional: {key: bool}, name, signature: "data:image/png;base64,…" }
//        → signed estimate PDF filed on the job (original estimate + signed decision page), decision recorded
//   { action: "email",  request_id, origin }  (Admin)             → emails the client the estimate PDF + "Review and sign" link
// Secrets: GMAIL_USER, GMAIL_APP_PASSWORD (same Gmail as send-doc). Database: migration 021.
import nodemailer from "npm:nodemailer@6";
import { createClient } from "npm:@supabase/supabase-js@2";
import { PDFDocument, StandardFonts, rgb } from "npm:pdf-lib@1.17.1";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const svc = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const STORE = "J. Vair Anderson · 409 – 3rd Street SW, Calgary AB T2P 4Z2 · (403) 266-1669";

type Line = { key: string; id?: string; source: string; label: string; price: number | null; parts?: string[]; subs?: string[] };
const money = (n: number) => "$" + n.toLocaleString("en-CA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const sum = (ls: Line[]) => Math.round(ls.reduce((s, l) => s + (Number(l.price) || 0), 0) * 100) / 100;
const watchLine = (j: any) => {
  const ref = String(j.watch_ref || "").trim().toUpperCase();
  const name = String(j.watch_name || "").trim().replace(/^rolex\s+/i, "");
  return [ref && (ref.startsWith("M") ? ref : "M" + ref), "Rolex", name].filter(Boolean).join(" ");
};
const mtTime = (d: Date) => d.toLocaleString("en-CA", { timeZone: "America/Edmonton", dateStyle: "long", timeStyle: "short" });

async function loadByToken(token: string) {
  if (!/^[0-9a-f]{48}$/.test(token || "")) return null;
  const { data: r } = await svc.from("sign_requests").select("*").eq("token", token).maybeSingle();
  if (!r) return null;
  const [{ data: job }, { data: doc }, { data: client }] = await Promise.all([
    svc.from("jobs").select("*").eq("id", r.job_id).single(),
    svc.from("job_docs").select("*").eq("id", r.doc_id).single(),
    svc.from("job_clients").select("*").eq("job_id", r.job_id).maybeSingle(),
  ]);
  return { r, job, doc, client };
}
const statusOf = (r: any) => (r.signed_at ? "signed" : r.cancelled_at ? "cancelled" : new Date(r.expires_at) < new Date() ? "expired" : "open");

// Same as src/docs/stamp.js — fills the client's decision into the estimate's own spots (template unchanged)
async function stampEstimate(original: Uint8Array, fields: any, { refused, chosen, name, sigPng, remarks, when = new Date(), dateText, audit }: any) {
  const pdf = await PDFDocument.load(original)
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold)
  const pages = pdf.getPages()
  const at = (k: string): any => fields?.[k] && { ...fields[k], page: pages[fields[k].page] }
  const black = rgb(0, 0, 0), white = rgb(1, 1, 1), grey = rgb(0.35, 0.35, 0.35)
  const tick = (k: string) => { const f = at(k); if (f) f.page.drawText('X', { x: f.x, y: f.y + 0.2, size: 7.5, font: bold, color: black }) }
  if (refused) tick('refuse')
  else { tick('decision:necessary'); for (const k of chosen || []) tick(`decision:${k}`) }
  const u = at('undersigned')
  if (u) {
    u.page.drawRectangle({ x: u.x - 1, y: u.y - 2.5, width: u.w + 2, height: 11, color: white })
    u.page.drawText(name, { x: u.x + 2, y: u.y, size: 9, font: reg, color: black })
    u.page.drawLine({ start: { x: u.x, y: u.y - 2 }, end: { x: u.x + u.w, y: u.y - 2 }, thickness: 0.5, color: black })
  }
  const dd = (n: number) => String(n).padStart(2, '0')
  const d = at('date'); if (d) d.page.drawText(dateText || `${dd(when.getDate())}/${dd(when.getMonth() + 1)}/${when.getFullYear()}`, { x: d.x, y: d.y, size: 9, font: reg, color: black })
  const s = at('signature')
  if (s && sigPng) {
    const img = await pdf.embedPng(sigPng)
    const h = Math.min(s.h || 36, ((s.w || 180) * img.height) / img.width)
    s.page.drawImage(img, { x: s.x, y: s.y, width: (img.width / img.height) * h, height: h })
  }
  const r = at('remarks'); if (r && remarks) r.page.drawText(String(remarks).slice(0, 110), { x: r.x + 2, y: r.y + 1, size: 8.5, font: reg, color: black })
  if (audit && (d || s)) (d || s).page.drawText(audit, { x: 55, y: 28, size: 6, font: reg, color: grey })
  return await pdf.save()
}

// Older estimates without fill-in spots: signed decision page appended to the original estimate (Rolex: client's decision, date + signature)
async function signedPdf(original: Uint8Array, o: { job: any; client: any; lines: { necessary: Line[]; optional: Line[] }; refused: boolean;
  chosen: Set<string>; name: string; sigPng: Uint8Array; when: Date; ip: string; channel: string; email?: string }) {
  const pdf = await PDFDocument.load(original);
  const reg = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const sig = await pdf.embedPng(o.sigPng);
  const page = pdf.addPage([612, 792]);
  const L = 50, R = 562, black = rgb(0, 0, 0), grey = rgb(0.35, 0.35, 0.35);
  let y = 742;
  const text = (s: string, x: number, size = 9, font = reg, color = black) => page.drawText(s, { x, y, size, font, color });
  const wrap = (s: string, size: number, width: number, font = reg) => {
    const out: string[] = []; let cur = "";
    for (const w of s.split(" ")) { const t = cur ? cur + " " + w : w; if (font.widthOfTextAtSize(t, size) > width && cur) { out.push(cur); cur = w } else cur = t }
    out.push(cur); return out;
  };
  const para = (s: string, size = 9, font = reg) => { for (const ln of wrap(s, size, R - L, font)) { text(ln, L, size, font); y -= size * 1.35 } };
  const rule = () => { page.drawLine({ start: { x: L, y }, end: { x: R, y }, thickness: 1, color: black }); y -= 14 };
  const box = (label: string, on: boolean, price?: number | null) => {
    page.drawRectangle({ x: L, y: y - 1.5, width: 9, height: 9, borderWidth: 0.8, borderColor: black });
    if (on) text("X", L + 1.8, 8, bold);
    for (const [i, ln] of wrap(label, 9, 380).entries()) { page.drawText(ln, { x: L + 16, y: y - i * 11, size: 9, font: reg }); }
    if (price != null) { const s = money(price); page.drawText(s, { x: R - reg.widthOfTextAtSize(s, 9), y, size: 9, font: reg }) }
    y -= 11 * Math.max(1, wrap(label, 9, 380).length) + 5;
  };

  text("ESTIMATE · CLIENT'S DECISION", L, 13); y -= 18;
  text(`Our ref # ${o.job.edge_no}   ·   ${watchLine(o.job)}   ·   Serial # ${o.job.serial || ""}`, L, 9); y -= 13;
  text(`Client: ${o.client?.name || o.name}`, L, 9); y -= 18;
  rule();
  const nec = o.lines.necessary, opt = o.lines.optional;
  box(`I accept the necessary work`, !o.refused, sum(nec));
  if (opt.length) {
    text("Optional work (accepted options ticked)", L + 16, 8.5, bold); y -= 13;
    for (const l of opt) box(l.label + (l.parts?.length ? ` (${l.parts.join(", ")})` : ""), !o.refused && o.chosen.has(l.key), l.price);
  }
  box("I refuse the estimate", o.refused);
  y -= 4; rule();
  if (!o.refused) {
    const sub = sum(nec) + sum(opt.filter(l => o.chosen.has(l.key))), tax = Math.round(sub * 5) / 100;
    for (const [k, v, f] of [["Accepted work (tax excl.)", sub, reg], ["GST 5%", tax, reg], ["TOTAL CAD", sub + tax, bold]] as const) {
      text(k, L, 9, f); const s = money(v); page.drawText(s, { x: R - f.widthOfTextAtSize(s, 9), y, size: 9, font: f }); y -= 13;
    }
    y -= 6;
  }
  para(`I, the undersigned ${o.name}, certify that I have read and understood the estimate as well as the legal notices attached and confirm my decision for the above-mentioned watch.`);
  y -= 10;
  const h = Math.min(60, (sig.height / sig.width) * 220);
  page.drawImage(sig, { x: L + 70, y: y - h + 10, width: (sig.width / sig.height) * h, height: h });
  y -= h + 4;
  page.drawLine({ start: { x: L + 70, y }, end: { x: L + 320, y }, thickness: 0.6, color: black });
  text("Signature:", L, 9, bold); y -= 16;
  text(`Date: ${mtTime(o.when)} (Mountain time)`, L, 9); y -= 22;
  para(`Signed electronically ${o.channel === "in_store" ? "in store on the J. Vair Anderson iPad" : `through a private link emailed to ${o.email || "the client"}`}` +
    ` · IP ${o.ip || "unknown"}. The estimate pages before this one are the estimate the client reviewed.`, 7.5, reg);
  y = 40; text(STORE, L, 7, reg, grey);
  return await pdf.save();
}

function mailer() {
  const user = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
  if (!user || !pass) return null;
  return { user, t: nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user, pass } }) };
}
const firstName = (n: string) => String(n || "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));

    // ---------- client: what to show ----------
    if (body.action === "get") {
      const x = await loadByToken(body.token);
      if (!x) return json({ status: "invalid" });
      const st = statusOf(x.r);
      if (st !== "open") return json({ status: st, edge_no: x.job.edge_no });
      const { data: url } = await svc.storage.from("job-docs").createSignedUrl(x.doc.file_path, 3600);
      return json({
        status: st, edge_no: x.job.edge_no, watch: watchLine(x.job), serial_last4: String(x.job.serial || "").slice(-4),
        client_name: x.client?.name || "", lines: x.r.lines, pdf_url: url?.signedUrl || null, expires_at: x.r.expires_at, channel: x.r.channel,
      });
    }

    // ---------- client: sign ----------
    if (body.action === "submit") {
      const x = await loadByToken(body.token);
      if (!x) return json({ error: "This signing link is not valid." }, 404);
      if (statusOf(x.r) !== "open") return json({ error: "This estimate has already been signed, or the link has expired. Please call us at (403) 266-1669." }, 410);
      const name = String(body.name || "").trim().slice(0, 120);
      if (name.length < 2) return json({ error: "Please type your full name." }, 400);
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.signature || ""));
      if (!m || m[1].length > 700000) return json({ error: "Please sign in the box." }, 400);
      const sigPng = Uint8Array.from(atob(m[1]), c => c.charCodeAt(0));
      const refused = !!body.refused;
      const lines = x.r.lines as { necessary: Line[]; optional: Line[] };
      const chosen = new Set<string>(refused ? [] : (lines.optional || []).filter(l => body.optional?.[l.key]).map(l => l.key));
      const nec = lines.necessary || [], opt = lines.optional || [];
      const partIds = (ls: Line[]) => ls.filter(l => l.source === "part" && l.id).map(l => l.id!);
      const accepted = refused ? [] : [...partIds(nec), ...partIds(opt.filter(l => chosen.has(l.key)))];
      const declined = [...partIds(opt.filter(l => !chosen.has(l.key))), ...(refused ? partIds(nec) : [])];
      const extra = (x.job.extra_lines || []).map((e: any) => ({ ...e,
        decision: e.kind === "optional" ? (chosen.has("extra:" + e.id) ? "accepted" : "declined") : (refused ? "declined" : "accepted") }));
      const when = new Date();
      const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim();

      const { data: orig, error: dlErr } = await svc.storage.from("job-docs").download(x.doc.file_path);
      if (dlErr || !orig) return json({ error: "The estimate could not be opened. Please call us." }, 500);
      const remarks = String(body.remarks || "").trim().slice(0, 300);
      const audit = `Signed electronically by ${name} on ${mtTime(when)} (Mountain time) ${x.r.channel === "in_store" ? "in store on the J. Vair Anderson iPad" : `through a private link emailed to ${x.r.email}`} · IP ${ip || "unknown"}`;
      const original = new Uint8Array(await orig.arrayBuffer());
      const bytes = x.doc.fields
        ? await stampEstimate(original, x.doc.fields, { refused, chosen: [...chosen], name, sigPng, remarks, when, audit, dateText: when.toLocaleDateString("en-GB", { timeZone: "America/Edmonton" }) })
        : await signedPdf(original, { job: x.job, client: x.client, lines: { necessary: nec, optional: opt }, refused, chosen, name, sigPng, when, ip, channel: x.r.channel, email: x.r.email });
      const fileName = `JVA-${x.job.edge_no}-Estimate-signed.pdf`;
      const path = `${x.job.id}/${Date.now()}-${fileName}`;
      const up = await svc.storage.from("job-docs").upload(path, bytes, { contentType: "application/pdf" });
      if (up.error) throw up.error;
      const { data: doc, error: dErr } = await svc.from("job_docs").insert({ job_id: x.job.id, kind: "signed_estimate", file_path: path, file_name: fileName, by_user: x.r.created_by }).select().single();
      if (dErr) throw dErr;
      const decision = { refused, accepted_keys: [...chosen], necessary_total: sum(nec), remarks: remarks || null, signed_at: when.toISOString() };
      const { error: aErr } = await svc.rpc("apply_signed_estimate", { p_request: x.r.id, p_refused: refused, p_accepted: accepted, p_declined: declined,
        p_extra: extra, p_decision: decision, p_name: name, p_ip: ip, p_agent: req.headers.get("user-agent") || "", p_signed_doc: doc.id });
      if (aErr) throw aErr;

      // Copy to the client (best effort; never blocks the signature)
      let copied = false;
      const mail = mailer();
      if (mail && x.r.email) {
        try {
          await mail.t.sendMail({
            from: `"J. Vair Anderson Watch Service" <${mail.user}>`, to: x.r.email,
            subject: `Your signed Rolex service estimate: J. Vair Anderson job ${x.job.edge_no}`,
            text: `Dear ${firstName(x.client?.name || name)},\n\nThank you. Your decision on the estimate for your ${watchLine(x.job)} is attached for your records.\n` +
              `${refused ? "We will contact you to arrange the return of your watch." : "We will confirm the work and timing shortly."}\n\n${STORE}`,
            attachments: [{ filename: fileName, content: bytes, contentType: "application/pdf" }],
          });
          copied = true;
        } catch (_) { /* signature stands */ }
      }
      return json({ ok: true, refused, copied });
    }

    // ---------- Admin: email the estimate + signing link ----------
    if (body.action === "email") {
      const auth = req.headers.get("Authorization") || "";
      const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
      const { data: role } = await user.rpc("app_role");
      if (role !== "admin") return json({ error: "Only Admin sends estimates for signature" }, 403);
      const { data: r } = await user.from("sign_requests").select("*").eq("id", body.request_id).maybeSingle();
      if (!r || statusOf(r) !== "open") return json({ error: "This signing request is no longer open. Create a new one." }, 400);
      if (!r.email) return json({ error: "No client email on this request" }, 400);
      const mail = mailer();
      if (!mail) return json({ error: "Email isn't set up yet (GMAIL_USER and GMAIL_APP_PASSWORD in Supabase)." }, 400);
      const origin = String(body.origin || req.headers.get("origin") || "").replace(/\/$/, "");
      if (!/^https?:\/\//.test(origin)) return json({ error: "Missing site address" }, 400);
      const [{ data: job }, { data: doc }, { data: client }] = await Promise.all([
        svc.from("jobs").select("*").eq("id", r.job_id).single(),
        svc.from("job_docs").select("*").eq("id", r.doc_id).single(),
        svc.from("job_clients").select("*").eq("job_id", r.job_id).maybeSingle(),
      ]);
      const { data: file } = await svc.storage.from("job-docs").download(doc.file_path);
      if (!file) return json({ error: "The estimate file could not be opened" }, 500);
      const link = `${origin}/sign/${r.token}`;
      const watch = watchLine(job), last4 = String(job.serial || "").slice(-4), nm = client?.name || "";
      const html = `<div style="font-family:Georgia,serif;color:#14232b;max-width:560px">
<p style="letter-spacing:.12em;font-size:12px;color:#8a6d3b">J. VAIR ANDERSON · JEWELLERS SINCE 1925</p>
<p>Dear ${nm.replace(/[<>&]/g, "")},</p>
<p>Thank you for entrusting your ${watch}${last4 ? ` (serial ending ${last4})` : ""} to J. Vair Anderson. Our watchmakers have completed their analysis, and your estimate for job <b>${job.edge_no}</b> is attached to this email.</p>
<p style="margin:26px 0"><a href="${link}" style="background:#14232b;color:#fff;text-decoration:none;padding:12px 22px;border-radius:4px;font-family:Arial,sans-serif">Review and sign your estimate</a></p>
<p>You can also sign in store, or call us at (403) 266-1669 with any questions.</p>
<p style="font-size:12px;color:#5f6b70">J. Vair Anderson · 409 – 3rd Street SW, Calgary AB T2P 4Z2 · (403) 266-1669<br>This link is personal to your estimate and expires on ${new Date(r.expires_at).toLocaleDateString("en-CA", { month: "long", day: "numeric", year: "numeric" })}.</p></div>`;
      await mail.t.sendMail({
        from: `"J. Vair Anderson Watch Service" <${mail.user}>`, to: r.email,
        subject: `Your Rolex service estimate: ${String(job.watch_name || "your watch").replace(/^rolex\s+/i, "")}, J. Vair Anderson job ${job.edge_no}`,
        html,
        text: `Dear ${nm},\n\nThank you for entrusting your ${watch}${last4 ? ` (serial ending ${last4})` : ""} to J. Vair Anderson. Your estimate for job ${job.edge_no} is attached.\n\nReview and sign: ${link}\n\nYou can also sign in store, or call us at (403) 266-1669.\n\n${STORE}`,
        attachments: [{ filename: doc.file_name, content: new Uint8Array(await file.arrayBuffer()), contentType: "application/pdf" }],
      });
      const { data: who } = await user.auth.getUser();
      await svc.from("sign_requests").update({ emailed_at: new Date().toISOString() }).eq("id", r.id);
      await svc.from("job_docs").update({ emailed_at: new Date().toISOString(), emailed_to: r.email, emailed_by: who?.user?.id ?? null }).eq("id", doc.id);
      return json({ ok: true, to: r.email });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    const m = (e as Error).message || "";
    return json({ error: /535|credential|auth/i.test(m) ? "Gmail refused the sign-in. Check GMAIL_USER and the app password." : m || "Something went wrong" }, 500);
  }
});
