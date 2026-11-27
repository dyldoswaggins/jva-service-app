// Intake email to the service manager and the sales advisor (Richard, 2026-11-27), used by send-doc and sign.
// Subject: Signed Rolex Repair Intake, <job #>, <client first + last name>, <M ref + model name>, <date>
// Body: the same details + which forms were signed; signature: J.VAIR logo | J. Vair Timepiece Service Department,
// phone, address, website (logo attached inline as cid:jvalogo, from the live site's /email-logo.png).
const LOGO_URL = "https://watchservicejva.netlify.app/email-logo.png";
const esc = (s: string) => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));

export const modelLine = (j: any) => {
  const ref = String(j.watch_ref || "").trim().toUpperCase();
  const name = String(j.watch_name || "").trim().replace(/^rolex\s+/i, "");
  return [ref && (ref.startsWith("M") ? ref : "M" + ref), name].filter(Boolean).join(" ");
};
export const longDate = (d: string | Date | null | undefined) =>
  new Date(d || Date.now()).toLocaleDateString("en-CA", { timeZone: "America/Edmonton", month: "long", day: "numeric", year: "numeric" });

const SIG_LINES = ["J. Vair Timepiece Service Department", "403-266-1669", "409 3 St SW, Calgary, AB T2P 4Z2", "jvairanderson.com"];

let logo: Uint8Array | null | undefined;
async function logoBytes() {
  if (logo !== undefined) return logo;
  try { const r = await fetch(LOGO_URL); logo = r.ok ? new Uint8Array(await r.arrayBuffer()) : null } catch { logo = null }
  return logo;
}

// pending: the client signs later by emailed link (forms filled, not yet signed)
export async function intakeStaffMail({ job, clientName, forms, pending = false, takenBy, extra }: {
  job: any; clientName: string; forms: string[]; pending?: boolean; takenBy?: string; extra?: string;
}) {
  const title = pending ? "Rolex Repair Intake (waiting for client signature)" : "Signed Rolex Repair Intake";
  const date = longDate(job.intake_at);
  const model = modelLine(job);
  const subject = [title, job.edge_no, clientName || "Client", model, date].filter(Boolean).join(", ");
  const rows: [string, string][] = [
    ["Job Number", job.edge_no], ["Client", clientName || "—"], ["Rolex", model || "—"], ["Date", date],
    [pending ? "Forms (waiting for client signature)" : "Forms signed", forms.join(", ")],
    ...(takenBy ? [["Taken in by", takenBy] as [string, string]] : []),
  ];
  const text = `${title}\n\n` + rows.map(([k, v]) => `${k}: ${v}`).join("\n") + (extra ? `\n\n${extra}` : "") +
    `\n\nThe forms are attached.\n\n--\n${SIG_LINES.join("\n")}`;
  const img = await logoBytes();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#14232b">
<p style="font-size:16px;font-weight:bold;margin:0 0 12px">${esc(title)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#5f6b70;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>
${extra ? `<p style="margin:12px 0 0">${esc(extra)}</p>` : ""}
<p style="margin:12px 0 24px">The forms are attached.</p>
<table style="border-collapse:collapse"><tr>
${img ? `<td style="padding:0 18px 0 0;vertical-align:middle"><img src="cid:jvalogo" alt="J. Vair Jewellers" width="160" style="display:block;width:160px;height:auto"></td>` : ""}
<td style="border-left:1px solid #14232b;padding:2px 0 2px 16px;vertical-align:middle;font-size:13px;line-height:1.5;color:#1f3864">
<div style="font-size:16px;font-weight:bold;color:#1f3864">${esc(SIG_LINES[0])}</div>
<div><a href="tel:4032661669" style="color:#1f3864">${esc(SIG_LINES[1])}</a></div>
<div>${esc(SIG_LINES[2])}</div>
<div><a href="https://jvairanderson.com" style="color:#1f3864">${esc(SIG_LINES[3])}</a></div>
</td></tr></table></div>`;
  return { subject, text, html, inline: img ? [{ filename: "jva-logo.png", content: img, contentType: "image/png", cid: "jvalogo" }] : [] };
}

// ---- Client emails (Richard approved the drafts, 2026-11-27): formal, details block, same signature as the staff emails ----
// kind "signed": the client's signed documents (after signing on the iPad or by the link)
// kind "sign":   please review and sign by the secure link (link + expires required)
const SIG_HTML = (img: boolean) => `<table style="border-collapse:collapse;margin-top:8px"><tr>
${img ? `<td style="padding:0 18px 0 0;vertical-align:middle"><img src="cid:jvalogo" alt="J. Vair Jewellers" width="160" style="display:block;width:160px;height:auto"></td>` : ""}
<td style="border-left:1px solid #14232b;padding:2px 0 2px 16px;vertical-align:middle;font-size:13px;line-height:1.5;color:#1f3864">
<div style="font-size:16px;font-weight:bold;color:#1f3864">${esc(SIG_LINES[0])}</div>
<div><a href="tel:4032661669" style="color:#1f3864">${esc(SIG_LINES[1])}</a></div>
<div>${esc(SIG_LINES[2])}</div>
<div><a href="https://jvairanderson.com" style="color:#1f3864">${esc(SIG_LINES[3])}</a></div>
</td></tr></table>`;

export async function intakeClientMail({ job, clientName, forms, kind, link, expires }: {
  job: any; clientName: string; forms: string[]; kind: "signed" | "sign"; link?: string; expires?: string | Date;
}) {
  const model = modelLine(job), date = longDate(job.intake_at), name = String(clientName || "").trim() || "Valued Client";
  const subject = kind === "signed"
    ? `Your Rolex Service Documents – J. Vair Jewellers, Job ${job.edge_no}`
    : `Action Required: Please Review and Sign Your Rolex Service Documents – Job ${job.edge_no}`;
  const rows: [string, string][] = [["Job Number", job.edge_no], ["Timepiece", model || "Rolex"], ["Date Received", date],
    [kind === "signed" ? "Documents Enclosed" : "Documents for Signature", forms.join(", ")]];
  const next = job.service_type === "Engraving"
    ? "Your timepiece will be sent to Rolex in Toronto for engraving, and we will contact you as soon as it has returned."
    : job.classification === "Vintage"
      ? "Your timepiece will be sent to Rolex in Toronto for a vintage analysis, and we will contact you as soon as the estimate is available."
      : "Our watchmakers will now carry out a thorough analysis of your timepiece, and we will contact you with a detailed estimate and the next steps.";
  const until = expires ? longDate(expires) : "";
  const paras = kind === "signed"
    ? ["Thank you for entrusting your Rolex to J. Vair Jewellers. Please find attached your signed service documents for your records.", "__ROWS__", next,
       "Kindly retain your receipt and present it, together with government-issued photo identification, when collecting your timepiece.",
       "Should you have any questions, please do not hesitate to contact us at 403-266-1669."]
    : ["Thank you for entrusting your Rolex to J. Vair Jewellers.", "__ROWS__",
       "Please review and sign your documents using the secure link below. Copies are also attached for your reference.", "__BUTTON__",
       `This link is personal to your documents${until ? ` and will expire on ${until}` : ""}. If you would prefer, you are also welcome to sign in store.`,
       "Should you have any questions, please do not hesitate to contact us at 403-266-1669."];
  const text = `Dear ${name},\n\n` + paras.map(p => p === "__ROWS__" ? rows.map(([k, v]) => `${k}: ${v}`).join("\n")
    : p === "__BUTTON__" ? `Review and Sign Your Documents: ${link}` : p).join("\n\n") +
    `\n\nWith kind regards,\n\n${SIG_LINES.join("\n")}`;
  const img = await logoBytes();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14232b;max-width:600px">
<p style="margin:0 0 14px">Dear ${esc(name)},</p>
${paras.map(p => p === "__ROWS__"
    ? `<table style="border-collapse:collapse;margin:0 0 14px">${rows.map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;color:#5f6b70;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>`
    : p === "__BUTTON__"
      ? `<p style="margin:22px 0"><a href="${esc(link || "")}" style="background:#14232b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:bold">Review and Sign Your Documents</a></p>`
      : `<p style="margin:0 0 14px">${esc(p)}</p>`).join("\n")}
<p style="margin:18px 0 10px">With kind regards,</p>
${SIG_HTML(!!img)}</div>`;
  return { subject, text, html, inline: img ? [{ filename: "jva-logo.png", content: img, contentType: "image/png", cid: "jvalogo" }] : [] };
}
