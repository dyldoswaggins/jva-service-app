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
