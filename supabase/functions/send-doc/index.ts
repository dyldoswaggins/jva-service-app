// Supabase Edge Function "send-doc": email a job document (receipt, estimate, invoice…) from the parts
// Gmail account to the watch service manager. Admin + Sales only (documents can hold client details).
// Also { doc_ids, to: "signed_copies" }: the intake paperwork to the client, the associate who took the watch in and the service
// manager (Richard, 2026-11-27). pending: true = forms waiting for the client's online signature: associate + service manager only.
// Secrets: GMAIL_USER (the Gmail address), GMAIL_APP_PASSWORD (16-char app password),
//          SERVICE_MANAGER_EMAIL (where documents go).
import nodemailer from "npm:nodemailer@6";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const svc = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-role" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const KIND = { vintage_fee: "Vintage Analysis Fee form", immediate_proceed: "Rolex Immediate Proceed", receipt: "Receipt", estimate: "Estimate", confirmation: "Confirmation", invoice: "Invoice", other: "Document" } as Record<string, string>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { doc_id, doc_ids, to: target, pending } = await req.json().catch(() => ({}));
    const toClient = target === "client"; // the client's own copy (email given at intake), else the service manager

    // Act as the signed-in person: RLS decides whether they may see this document
    const auth = req.headers.get("Authorization") || "";
    const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { ...(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(auth) ? { Authorization: auth } : {}), "x-app-role": req.headers.get("x-app-role") || "" } } });
    const { data: role } = await user.rpc("app_role");
    if (!["admin", "sales"].includes(role)) return json({ error: "Only Admin or Sales can email documents" }, 403);

    // { to: "check" } (Admin): which email settings are filled in — yes/no only, never the values; sends nothing (Richard, 2026-11-27)
    if (target === "check") {
      if (role !== "admin") return json({ error: "Admin only" }, 403);
      const has = (k: string) => !!(Deno.env.get(k) || "").trim();
      const mgr = Deno.env.get("SERVICE_MANAGER_EMAIL") || "";
      return json({ GMAIL_USER: has("GMAIL_USER"), GMAIL_APP_PASSWORD: has("GMAIL_APP_PASSWORD"), SERVICE_MANAGER_EMAIL: has("SERVICE_MANAGER_EMAIL"),
        manager_looks_valid: /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mgr) });
    }

    // ---- signed intake paperwork: one email with every form, to the client and to the associate who took the watch in
    //      (Richard, 2026-11-25). { doc_ids: [...], to: "signed_copies" }. The associate's address is always @jvairanderson.com (migration 035).
    if (target === "signed_copies") {
      if (!Array.isArray(doc_ids) || !doc_ids.length || doc_ids.length > 6) return json({ error: "Missing documents" }, 400);
      const { data: docs } = await user.from("job_docs").select("*").in("id", doc_ids);
      if (!docs?.length || docs.length !== doc_ids.length || new Set(docs.map((d: any) => d.job_id)).size !== 1) return json({ error: "Documents not found" }, 404);
      const jobId = docs[0].job_id;
      const [{ data: job }, { data: c }] = await Promise.all([
        svc.from("jobs").select("edge_no, watch_ref, watch_name, intake_staff_name, intake_staff_email").eq("id", jobId).single(),
        svc.from("job_clients").select("name, email").eq("job_id", jobId).maybeSingle(),
      ]);
      const gmail = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
      if (!gmail || !pass) return json({ error: "email isn't connected yet" }, 400);
      const attachments = [];
      for (const d of docs) {
        const { data: file } = await svc.storage.from("job-docs").download(d.file_path);
        if (!file) return json({ error: "A file could not be opened" }, 500);
        attachments.push({ filename: d.file_name, content: new Uint8Array(await file.arrayBuffer()), contentType: "application/pdf" });
      }
      const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gmail, pass } });
      const watch = [job.watch_ref && `M${String(job.watch_ref).replace(/^M/i, "")}`, "Rolex", String(job.watch_name || "").replace(/^rolex\s+/i, "")].filter(Boolean).join(" ");
      const list = docs.map((d: any) => KIND[d.kind] || "Document").join(", ");
      const out: Record<string, string | null> = { client: null, staff: null, manager: null };
      const errors: string[] = [];
      const ok = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e || "");
      if (!pending && ok(c?.email)) {
        try {
          await transport.sendMail({ from: `"J. Vair Anderson Watch Service" <${gmail}>`, to: c!.email,
            subject: `Your signed Rolex service documents · J. Vair Anderson job ${job.edge_no}`,
            text: `Dear ${c?.name || ""},\n\nThank you for entrusting your ${watch} to J. Vair Anderson. Your signed documents (${list}) are attached for your records. ` +
              `Please bring your receipt, with photo ID, when you collect your watch.\n\nJ. Vair Anderson · 409 – 3rd Street SW, Calgary · (403) 266-1669`, attachments });
          out.client = c!.email;
        } catch (e) { errors.push(`client: ${(e as Error).message}`) }
      }
      if (/^[^@\s]+@jvairanderson\.com$/i.test(job.intake_staff_email || "")) {
        try {
          await transport.sendMail({ from: `"J. Vair Anderson Watch Service" <${gmail}>`, to: job.intake_staff_email,
            subject: `${pending ? "Intake (waiting for client signature)" : "Signed intake"} ${job.edge_no} ${watch}`.trim(),
            text: pending ? `Intake paperwork for job ${job.edge_no} (${list}) is attached. ${c?.name || "The client"} has been emailed a link to sign; signed copies follow once they sign.\n\nSent from the Watch Service app.`
              : `Signed paperwork for job ${job.edge_no} (${list}) is attached: ${c?.name || "client"} and ${job.intake_staff_name || "you"} have signed.\n\nSent from the Watch Service app.`, attachments });
          out.staff = job.intake_staff_email;
        } catch (e) { errors.push(`associate: ${(e as Error).message}`) }
      }
      // ...and to the service manager (Richard, 2026-11-27)
      const manager = Deno.env.get("SERVICE_MANAGER_EMAIL") || "";
      if (ok(manager)) {
        try {
          await transport.sendMail({ from: `"J. Vair Anderson Watch Service" <${gmail}>`, to: manager,
            subject: `${pending ? "Intake (waiting for client signature)" : "Signed intake"} ${job.edge_no} ${watch}`.trim(),
            text: `Intake paperwork for job ${job.edge_no} (${list}) is attached. Taken in by ${job.intake_staff_name || "the associate"}.` +
              (pending ? ` ${c?.name || "The client"} has been emailed a link to sign; signed copies follow once they sign.` : ` Signed by ${c?.name || "the client"}.`) + `\n\nSent from the Watch Service app.`, attachments });
          out.manager = manager;
        } catch (e) { errors.push(`service manager: ${(e as Error).message}`) }
      }
      const { data: who } = await user.auth.getUser();
      if (out.client) for (const d of docs) await svc.from("job_docs").update({ emailed_at: new Date().toISOString(), emailed_to: out.client, emailed_by: who?.user?.id ?? null }).eq("id", d.id);
      return json({ ok: true, ...out, errors });
    }
    if (!doc_id) return json({ error: "Missing document" }, 400);
    const { data: doc, error } = await user.from("job_docs").select("*, jobs(edge_no, watch_ref, watch_name)").eq("id", doc_id).single();
    if (error || !doc) return json({ error: "Document not found" }, 404);
    const { data: who } = await user.auth.getUser();

    const gmail = Deno.env.get("GMAIL_USER"), pass = Deno.env.get("GMAIL_APP_PASSWORD");
    let to = Deno.env.get("SERVICE_MANAGER_EMAIL") || "";
    if (toClient) {
      const { data: c } = await svc.from("job_clients").select("email").eq("job_id", doc.job_id).maybeSingle();
      to = c?.email || "";
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return json({ error: "No client email on this job" }, 400);
    }
    if (!gmail || !pass || !to) return json({ error: "email isn't connected yet" }, 400);

    const { data: file, error: dlErr } = await svc.storage.from("job-docs").download(doc.file_path);
    if (dlErr || !file) return json({ error: "The file could not be opened" }, 500);

    const kind = KIND[doc.kind] || "Document";
    const job = doc.jobs || {};
    const transport = nodemailer.createTransport({ host: "smtp.gmail.com", port: 465, secure: true, auth: { user: gmail, pass } });
    await transport.sendMail({
      from: `"J. Vair Anderson Watch Service" <${gmail}>`,
      to,
      subject: toClient ? `Your Rolex service ${kind.toLowerCase()} · J. Vair Anderson` : `${kind} ${job.edge_no || ""} ${[job.watch_ref, job.watch_name].filter(Boolean).join(" ")}`.trim(),
      text: toClient
        ? `Thank you for entrusting your Rolex to J. Vair Anderson.\n\nYour signed ${kind.toLowerCase()} is attached. Please bring it, with photo ID, when you collect your watch.\n\nJ. Vair Anderson · 409 – 3rd Street SW, Calgary · (403) 266-1669`
        : `${kind} for job ${job.edge_no} is attached.\n\nSent from the Watch Service app.`,
      attachments: [{ filename: doc.file_name, content: new Uint8Array(await file.arrayBuffer()), contentType: "application/pdf" }],
    });
    await svc.from("job_docs").update({ emailed_at: new Date().toISOString(), emailed_to: to, emailed_by: who?.user?.id ?? null }).eq("id", doc_id);
    return json({ ok: true, to });
  } catch (e) {
    const m = (e as Error).message || "";
    return json({ error: /auth|credential|535/i.test(m) ? "Gmail refused the sign-in. Check GMAIL_USER and the app password." : m }, 500);
  }
});
