// Supabase Edge Function "send-doc": email a job document (receipt, estimate, invoice…) from the parts
// Gmail account to the watch service manager. Admin + Sales only (documents can hold client details).
// Secrets: GMAIL_USER (the Gmail address), GMAIL_APP_PASSWORD (16-char app password),
//          SERVICE_MANAGER_EMAIL (where documents go).
import nodemailer from "npm:nodemailer@6";
import { createClient } from "npm:@supabase/supabase-js@2";

const URL_ = Deno.env.get("SUPABASE_URL")!;
const svc = createClient(URL_, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-app-role" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });
const KIND = { vintage_fee: "Vintage Analysis Fee form", receipt: "Receipt", estimate: "Estimate", confirmation: "Confirmation", invoice: "Invoice", other: "Document" } as Record<string, string>;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const { doc_id, to: target } = await req.json().catch(() => ({}));
    const toClient = target === "client"; // the client's own copy (email given at intake), else the service manager
    if (!doc_id) return json({ error: "Missing document" }, 400);

    // Act as the signed-in person: RLS decides whether they may see this document
    const auth = req.headers.get("Authorization") || "";
    const user = createClient(URL_, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { ...(/^Bearer [\w-]+\.[\w-]+\.[\w-]+$/.test(auth) ? { Authorization: auth } : {}), "x-app-role": req.headers.get("x-app-role") || "" } } });
    const { data: role } = await user.rpc("app_role");
    if (!["admin", "sales"].includes(role)) return json({ error: "Only Admin or Sales can email documents" }, 403);
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
