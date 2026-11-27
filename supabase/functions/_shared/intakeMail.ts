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
// This mailbox is not read (Richard, 2026-11-27): every subject starts with DO NOT REPLY and the signature ends with this note
const NO_REPLY = "DO NOT REPLY";
const NOT_MONITORED = "This email was sent from an unmonitored mailbox. Please do not reply to this email; for any questions, contact us at 403-266-1669.";

let logo: Uint8Array | null | undefined;
async function logoBytes() {
  if (logo !== undefined) return logo;
  try { const r = await fetch(LOGO_URL); logo = r.ok ? new Uint8Array(await r.arrayBuffer()) : null } catch { logo = null }
  return logo;
}
// Logo shown at its true proportions, fitted in 160 x 70 px (read from the PNG header, so a new logo file needs no code change)
function logoSize(b: Uint8Array | null) {
  if (!b || b.length < 24) return null;
  const W = (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, H = (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0;
  if (!W || !H) return null;
  const k = Math.min(160 / W, 70 / H);
  return { w: Math.round(W * k), h: Math.round(H * k) };
}

// Signature (Richard, 2026-11-27): logo at its true proportions (160x43), each line its own fixed-height row and the divider its own
// 1 px column (Outlook on Windows ignores line-height on <br> lines and stretched them); same block on staff and client emails
const SIG_HTML = (img: { w: number; h: number } | null) => `<table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse;margin-top:8px"><tr>
${img ? `<td width="${img.w}" valign="middle" style="width:${img.w}px;padding:0 16px 0 0;vertical-align:middle"><img src="cid:jvalogo" alt="J. Vair Jewellers" width="${img.w}" height="${img.h}" style="display:block;width:${img.w}px;height:${img.h}px;border:0;outline:none"></td>` : ""}
<td width="1" bgcolor="#14232b" style="width:1px;background:#14232b;font-size:0;line-height:0">&nbsp;</td>
<td valign="middle" style="padding:0 0 0 16px;vertical-align:middle"><table cellpadding="0" cellspacing="0" border="0" role="presentation" style="border-collapse:collapse">
<tr><td height="22" style="height:22px;line-height:22px;mso-line-height-rule:exactly;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#1f3864;white-space:nowrap">${esc(SIG_LINES[0])}</td></tr>
<tr><td height="18" style="height:18px;line-height:18px;mso-line-height-rule:exactly;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f3864;white-space:nowrap"><a href="tel:4032661669" style="color:#1f3864;text-decoration:none">${esc(SIG_LINES[1])}</a></td></tr>
<tr><td height="18" style="height:18px;line-height:18px;mso-line-height-rule:exactly;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f3864;white-space:nowrap">${esc(SIG_LINES[2])}</td></tr>
<tr><td height="18" style="height:18px;line-height:18px;mso-line-height-rule:exactly;font-family:Arial,Helvetica,sans-serif;font-size:13px;color:#1f3864;white-space:nowrap"><a href="https://jvairanderson.com" style="color:#1f3864;text-decoration:none">${esc(SIG_LINES[3])}</a></td></tr>
</table></td></tr></table>
<p style="margin:14px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:15px;color:#5f6b70">${esc(NOT_MONITORED)}</p>`;

// pending: the client signs later by emailed link (forms filled, not yet signed)
export async function intakeStaffMail({ job, clientName, forms, pending = false, takenBy, extra }: {
  job: any; clientName: string; forms: string[]; pending?: boolean; takenBy?: string; extra?: string;
}) {
  const title = pending ? "Rolex Repair Intake (waiting for client signature)" : "Signed Rolex Repair Intake";
  const date = longDate(job.intake_at);
  const model = modelLine(job);
  const subject = `${NO_REPLY} – ` + [title, job.edge_no, clientName || "Client", model, date].filter(Boolean).join(", ");
  const rows: [string, string][] = [
    ["Job Number", job.edge_no], ["Client", clientName || "—"], ["Rolex", model || "—"], ["Date", date],
    [pending ? "Forms (waiting for client signature)" : "Forms signed", forms.join(", ")],
    ...(takenBy ? [["Taken in by", takenBy] as [string, string]] : []),
  ];
  const text = `${title}\n\n` + rows.map(([k, v]) => `${k}: ${v}`).join("\n") + (extra ? `\n\n${extra}` : "") +
    `\n\nThe forms are attached.\n\n--\n${SIG_LINES.join("\n")}\n\n${NOT_MONITORED}`;
  const img = await logoBytes();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#14232b">
<p style="font-size:16px;font-weight:bold;margin:0 0 12px">${esc(title)}</p>
<table style="border-collapse:collapse;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;color:#5f6b70;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>
${extra ? `<p style="margin:12px 0 0">${esc(extra)}</p>` : ""}
<p style="margin:12px 0 24px">The forms are attached.</p>
${SIG_HTML(logoSize(img))}</div>`;
  return { subject, text, html, inline: img ? [{ filename: "jva-logo.png", content: img, contentType: "image/png", cid: "jvalogo" }] : [] };
}

// ---- Client emails (Richard approved the drafts, 2026-11-27): formal, details block, same signature as the staff emails ----
// kind "signed": the client's signed documents (after signing on the iPad or by the link)
// kind "sign":   please review and sign by the secure link (link + expires required)

export async function intakeClientMail({ job, clientName, forms, kind, link, expires }: {
  job: any; clientName: string; forms: string[]; kind: "signed" | "sign"; link?: string; expires?: string | Date;
}) {
  const model = modelLine(job), date = longDate(job.intake_at), name = String(clientName || "").trim() || "Valued Client";
  const subject = kind === "signed"
    ? `${NO_REPLY} – Your Rolex Service Documents – J. Vair Jewellers, Job ${job.edge_no}`
    : `${NO_REPLY} – Action Required: Please Review and Sign Your Rolex Service Documents – Job ${job.edge_no}`;
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
    `\n\nWith kind regards,\n\n${SIG_LINES.join("\n")}\n\n${NOT_MONITORED}`;
  const img = await logoBytes();
  const html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14232b;max-width:600px">
<p style="margin:0 0 14px">Dear ${esc(name)},</p>
${paras.map(p => p === "__ROWS__"
    ? `<table style="border-collapse:collapse;margin:0 0 14px">${rows.map(([k, v]) => `<tr><td style="padding:2px 16px 2px 0;color:#5f6b70;white-space:nowrap">${esc(k)}</td><td style="padding:2px 0"><b>${esc(v)}</b></td></tr>`).join("")}</table>`
    : p === "__BUTTON__"
      ? `<p style="margin:22px 0"><a href="${esc(link || "")}" style="background:#14232b;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:4px;font-weight:bold">Review and Sign Your Documents</a></p>`
      : `<p style="margin:0 0 14px">${esc(p)}</p>`).join("\n")}
<p style="margin:18px 0 10px">With kind regards,</p>
${SIG_HTML(logoSize(img))}</div>`;
  return { subject, text, html, inline: img ? [{ filename: "jva-logo.png", content: img, contentType: "image/png", cid: "jvalogo" }] : [] };
}
