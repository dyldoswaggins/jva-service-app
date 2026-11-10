/**
 * JVA Watch Service: send emailed invoices / packing lists from Gmail to the app's Inbox.
 * Runs only when someone presses "Check email" in the app's Inbox (no timer).
 *
 * Setup (once, signed in as the parts Gmail account):
 *  1. script.google.com > New project. Name it "JVA parts inbox". Paste this whole file. Save.
 *  2. Project Settings (gear) > Script properties > Add: INGEST_SECRET = the same long password
 *     you saved in Supabase > Edge Functions > Secrets as INGEST_SECRET.
 *  3. In the editor choose the function "setup" and press Run. Allow the permissions asked for.
 *  4. Deploy > New deployment > type "Web app". Execute as: Me. Who has access: Anyone. Deploy.
 *     Copy the Web app URL and save it in Supabase > Edge Functions > Secrets as GMAIL_SCRIPT_URL.
 *     ("Anyone" can reach the URL, but it does nothing without the INGEST_SECRET password.)
 * Handled messages get the Gmail label "Sent to JVA app". Nothing is deleted.
 * Nothing changes stock: documents wait in the Inbox until Admin checks them and presses Apply.
 */
const ENDPOINT = 'https://lexvtfypmutjirluuwwn.supabase.co/functions/v1/inbox';
const PUBLIC_KEY = 'sb_publishable_iUMeB8amdk-ALMVB-m2VCg_wu4opCIx'; // public by design
const LABEL = 'Sent to JVA app';
const TYPES = /^(application\/pdf|image\/(jpeg|png|webp|gif))$/i;

function checkInbox() {
  const props = PropertiesService.getScriptProperties();
  const secret = props.getProperty('INGEST_SECRET');
  if (!secret) throw new Error('Add INGEST_SECRET in Project Settings > Script properties');
  const done = new Set(JSON.parse(props.getProperty('DONE_IDS') || '[]'));
  const label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  let sent = 0, failed = 0;

  const threads = GmailApp.search('in:inbox has:attachment newer_than:30d', 0, 30);
  for (const thread of threads) {
    let allOk = true;
    for (const msg of thread.getMessages()) {
      if (done.has(msg.getId())) continue;
      let ok = true;
      for (const att of msg.getAttachments({ includeInlineImages: false })) {
        const type = att.getContentType();
        if (!TYPES.test(type) && !/\.pdf$/i.test(att.getName())) continue;
        const res = UrlFetchApp.fetch(ENDPOINT, {
          method: 'post',
          contentType: 'application/json',
          headers: { apikey: PUBLIC_KEY, 'x-ingest-secret': secret },
          muteHttpExceptions: true,
          payload: JSON.stringify({
            action: 'ingest', filename: att.getName(), mime: type,
            data: Utilities.base64Encode(att.getBytes()), sender: msg.getFrom(), subject: msg.getSubject(),
          }),
        });
        if (res.getResponseCode() === 200) sent++;
        else { ok = false; failed++; console.log('Not sent: ' + att.getName() + ' ' + res.getResponseCode() + ' ' + res.getContentText()); }
      }
      if (ok) done.add(msg.getId()); else allOk = false;
    }
    if (allOk) thread.addLabel(label);
  }
  props.setProperty('DONE_IDS', JSON.stringify([...done].slice(-800)));
  return { sent, failed };
}

// Called by the app's "Check email" button (through the server, with the password)
function doPost(e) {
  const secret = PropertiesService.getScriptProperties().getProperty('INGEST_SECRET');
  let body = {};
  try { body = JSON.parse(e.postData.contents); } catch (err) {}
  if (!secret || body.secret !== secret) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Not allowed' })).setMimeType(ContentService.MimeType.JSON);
  }
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'Already checking, try again in a minute' })).setMimeType(ContentService.MimeType.JSON);
  }
  try {
    return ContentService.createTextOutput(JSON.stringify(checkInbox())).setMimeType(ContentService.MimeType.JSON);
  } finally { lock.releaseLock(); }
}

// Run once to allow permissions (also removes any old timers)
function setup() {
  ScriptApp.getProjectTriggers().forEach(t => ScriptApp.deleteTrigger(t));
  console.log(JSON.stringify(checkInbox()));
}
