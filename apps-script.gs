/**
 * MovieDrop — stats backend
 *
 * Paste this into a Google Apps Script project bound to a NEW, PRIVATE
 * spreadsheet (not the one holding your films). It does two jobs:
 *
 *   doPost  the site appends an event here. Open to anyone, because the
 *           site has to be able to write without a login.
 *   doGet   the dashboard reads aggregates here, and only if the passphrase
 *           matches. That check happens on this server, so the numbers are
 *           never exposed by reading the page source.
 *
 * Because the events live in a private sheet and this script is the only
 * door, nobody can read your traffic without the passphrase.
 *
 * SETUP — see README → Stats for the click-by-click version.
 *   1. Change PASSPHRASE below.
 *   2. Deploy → New deployment → Web app
 *        Execute as:      Me
 *        Who has access:  Anyone
 *   3. Copy the /exec URL into assets/config.js.
 */

var PASSPHRASE = 'change-me-before-deploying';
var SHEET = 'Events';

function sheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(SHEET);
  if (!sh) {
    sh = ss.insertSheet(SHEET);
    sh.appendRow(['when', 'event', 'detail', 'session', 'device', 'surface', 'source']);
    sh.setFrozenRows(1);
  }
  return sh;
}

function doPost(e) {
  try {
    var d = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    var ok = ['view', 'follow', 'unlock', 'watch'];
    if (ok.indexOf(d.event) === -1) return ContentService.createTextOutput('');

    sheet_().appendRow([
      new Date(),
      String(d.event),
      String(d.detail || '').slice(0, 80),
      String(d.sid || '').slice(0, 32),
      String(d.device || '').slice(0, 16),
      String(d.surface || '').slice(0, 16),
      String(d.source || '').slice(0, 40)
    ]);
  } catch (err) { /* never fail loudly at a visitor */ }
  return ContentService.createTextOutput('');
}

function doGet(e) {
  var p = (e && e.parameter) || {};
  var cb = String(p.callback || 'cb').replace(/[^A-Za-z0-9_$.]/g, '');

  if (p.key !== PASSPHRASE) return reply_(cb, { error: 'unauthorised' });

  var days = Math.min(365, Math.max(1, parseInt(p.days, 10) || 30));
  var since = new Date();
  since.setDate(since.getDate() - days + 1);
  since.setHours(0, 0, 0, 0);

  var rows = sheet_().getDataRange().getValues();
  rows.shift();

  var sessions = {};            // one visit counted once, whatever it did
  var totals = { view: 0, follow: 0, unlock: 0, watch: 0 };
  var byDay = {}, films = {}, devices = {}, surfaces = {}, sources = {};
  var recent = [];

  rows.forEach(function (r) {
    var when = r[0] instanceof Date ? r[0] : new Date(r[0]);
    if (isNaN(when) || when < since) return;

    var ev = String(r[1]), detail = String(r[2]), sid = String(r[3]);
    var day = Utilities.formatDate(when, Session.getScriptTimeZone(), 'yyyy-MM-dd');

    if (totals[ev] === undefined) return;

    if (!sessions[sid]) sessions[sid] = {};
    if (!sessions[sid][ev]) {
      sessions[sid][ev] = 1;
      totals[ev]++;
      byDay[day] = byDay[day] || { view: 0, follow: 0, unlock: 0, watch: 0 };
      byDay[day][ev]++;
      if (ev === 'view') {
        devices[r[4] || '?'] = (devices[r[4] || '?'] || 0) + 1;
        surfaces[r[5] || '?'] = (surfaces[r[5] || '?'] || 0) + 1;
        sources[r[6] || '?'] = (sources[r[6] || '?'] || 0) + 1;
      }
    }
    // Films count every tap — one person opening three films is three opens.
    if (ev === 'watch' && detail) films[detail] = (films[detail] || 0) + 1;

    recent.push([Utilities.formatDate(when, Session.getScriptTimeZone(), 'dd MMM HH:mm'),
                 ev, detail, r[4] || '', r[5] || '', r[6] || '']);
  });

  return reply_(cb, {
    days: days,
    totals: totals,
    byDay: byDay,
    films: films,
    devices: devices,
    surfaces: surfaces,
    sources: sources,
    recent: recent.slice(-120).reverse(),
    generated: Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'dd MMM yyyy HH:mm')
  });
}

function reply_(cb, obj) {
  return ContentService
    .createTextOutput(cb + '(' + JSON.stringify(obj) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}
