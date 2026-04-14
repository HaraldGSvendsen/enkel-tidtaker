// --- CONFIGURATION ---
const PARTICIPANTS_TAB = "Skjemasvar 1";
const TRACKS_TAB = "Klasser";
const FINISHES_TAB = "Målgang";
const RESULTS_TAB_NAME = "Resultat";


function doGet(e) {
  var page = e.parameter.page;

  // If ?page=finish is in the URL, show finish entry
  if (page === 'finish') {
    // Default (or no parameter): Show the Entry Form (index.html)
    const output = HtmlService.createHtmlOutputFromFile('finish');
    output.addMetaTag('viewport', 'width=device-width, initial-scale=1');
    output.setTitle('Målgang');
    output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
    return output;
  }  
  else if (page === 'results') {
    const data = getResultsDataCached();
    return ContentService
      .createTextOutput(JSON.stringify(data))
      .setMimeType(ContentService.MimeType.JSON);
  }
  else if (page === 'admin') {
    return HtmlService.createHtmlOutputFromFile('admin')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  // Default fallback (ALSO JSON)
  return ContentService
      .createTextOutput(JSON.stringify({
        status: "error",
        message: "Invalid endpoint"
      }))
      .setMimeType(ContentService.MimeType.JSON);
}

// Crosses finish line
function submitBibWithId(bib, entryId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FINISHES_TAB);
  sheet.appendRow([new Date(), bib, entryId]);
  CacheService.getScriptCache().remove("results_json"); // 🔥 invalidate
  generateTrackResults();  // update results tab
}

function undoLastEntryById(entryId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(FINISHES_TAB);
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][2] === entryId) {
      sheet.deleteRow(i + 1);
      CacheService.getScriptCache().remove("results_json"); // 🔥 invalidate
      generateTrackResults();  // update results tab
      return true;
    }
  }
  return false;
}


// For getting track names (1 runde, 2 runder,...)
function getFirstTwoWords(text) {
  var words = text.trim().split(/\s+/);
  return words.slice(0, 2).join(" ");
}

function getResultsDataCached() {
  const cache = CacheService.getScriptCache();
  const cacheKey = "results_json";

  // Try cache first
  const cached = cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  // Not cached → compute
  const data = getResultsData();
  cache.put(cacheKey, JSON.stringify(data), 10);  // Store for 10 seconds
  return data;
}

function getResultsData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  const sheetPart = ss.getSheetByName(PARTICIPANTS_TAB);
  const sheetTracks = ss.getSheetByName(TRACKS_TAB);
  const sheetFin = ss.getSheetByName(FINISHES_TAB);

  if (!sheetPart || !sheetTracks || !sheetFin) {
    return { error: "Missing required sheets" };
  }

  const partData = sheetPart.getDataRange().getValues();
  const trackData = sheetTracks.getDataRange().getValues();
  const finishData = sheetFin.getDataRange().getValues();

  // TrackID -> start time
  const trackStartMap = {};
  for (let i = 1; i < trackData.length; i++) {
    const id = trackData[i][0];
    const start = trackData[i][1];
    if (id) trackStartMap[id] = new Date(start);
  }

  // Bib -> {name, trackId}
  const bibMap = {};
  for (let i = 1; i < partData.length; i++) {
    const bib = partData[i][4];
    const name = partData[i][3];
    const trackId = getFirstTwoWords(partData[i][2]);

    if (bib) {
      bibMap[bib] = { name, trackId };
    }
  }

  // Bib -> finish time
  const finishMap = {};
  for (let i = 1; i < finishData.length; i++) {
    const time = finishData[i][0];
    const bib = finishData[i][1];

    if (bib && time && !finishMap[bib]) {
      finishMap[bib] = new Date(time);
    }
  }

  // Group per track
  const trackGroups = {};
  for (const [bib, info] of Object.entries(bibMap)) {
    //if (!finishMap[bib]) continue;  // don't include unfinished participants
    
    const tId = info.trackId;
    const start = trackStartMap[tId];
    const finish = finishMap[bib] || null;

    if (!trackGroups[tId]) {
      trackGroups[tId] = [];
    }

    // Only compute duration if both exist
    let durationMs = null;

    if (start && finish) {
      durationMs = finish - start;
    }

    trackGroups[tId].push({
      bib: Number(bib),
      name: info.name,
      startTime: start ? start.toISOString() : null,
      finishTime: finish ? finish.toISOString() : null,
      durationMs: durationMs
    });
  }

  // Build final response
  const tracks = [];

  // 1. Get and sort track IDs
  const sortedTrackIds = Object.keys(trackGroups).sort();

  // 2. Process each track
  for (const trackId of sortedTrackIds) {   
    const runners = trackGroups[trackId];
    // 3. Sort runners by time or bib number
    // runners.sort((a, b) => a.durationMs - b.durationMs);
    //runners.sort((a, b) => {
    //  if (a.durationMs == null) return 1;
    //  if (b.durationMs == null) return -1;
    //  return a.durationMs - b.durationMs;
    //});
    runners.sort((a, b) => a.bib - b.bib);
    // 4. Add ranking
    const sortedRunners = [];
    for (let i = 0; i < runners.length; i++) {
      sortedRunners.push({
        rank: "", //i + 1,
        ...runners[i]
      });
    }
    // 5. Add track to result
    tracks.push({
      track: trackId,
      runners: sortedRunners
    });
  }
  // 6. Return final object
  return {
    updated: new Date().toISOString(),
    tracks: tracks
  };
}

// generate results tab in the spreadsheet document
function generateTrackResults() {
  const data = getResultsDataCached();

  if (!data || !data.tracks) {
    Logger.log("No data to write");
    return;
  }

  const outputRows = [];

  // Header
  outputRows.push(["Startnr", "Navn", "Starttid", "Måltid", "Tid"]);

  for (const track of data.tracks) {

    // Track header row
    outputRows.push([track.track, "", "", "", ""]);

    for (const runner of track.runners) {

      const start = new Date(runner.startTime);
      const finish = new Date(runner.finishTime);

      const durationMs = runner.durationMs;

      outputRows.push([
        runner.bib,
        runner.name,
        start,
        finish,
        durationMs / (24 * 60 * 60 * 1000) // Sheets duration format
      ]);
    }

    // spacer row
    outputRows.push(["", "", "", "", ""]);
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheetRes = ss.getSheetByName(RESULTS_TAB_NAME);

  if (!sheetRes) {
    sheetRes = ss.insertSheet(RESULTS_TAB_NAME);
  } else {
    sheetRes.clearContents();
  }

  sheetRes.getRange(1, 1, outputRows.length, outputRows[0].length)
    .setValues(outputRows);

  // Formatting
  sheetRes.getRange(1, 1, 1, 5)
    .setFontWeight("bold")
    .setBackground("#f3f3f3");

  sheetRes.setFrozenRows(1);
  sheetRes.autoResizeColumns(1, 5);
  sheetRes.getRange(2, 3, outputRows.length, 3).setNumberFormat("HH:mm:ss");
}

// Trigger on edit in Finishes tab
function onEditParticipants(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() === PARTICIPANTS_TAB && e.range.getRow() > 1) {
    Utilities.sleep(200); 
    generateTrackResults();
  }
}

// Trigger on google form submission (new or edited participant)
function onFormSubmit(e) {
  const sheet = e.range.getSheet();
  const row = e.range.getRow();

  const existingId = sheet.getRange(row, 1).getValue();

  // Only set ID if empty
  if (!existingId) {
    const id = Utilities.getUuid();
    sheet.getRange(row, 1).setValue(id);
  }
}

// Admin function
function getParticipants() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PARTICIPANTS_TAB);
  const data = sheet.getDataRange().getValues();
  const result = [];

  for (let i = 1; i < data.length; i++) {
    result.push({
      id: data[i][0],
      track: getFirstTwoWords(data[i][2]),
      name: data[i][3],
      bib: data[i][4]
    });
  }
  // sort by bib (numeric if possible)
  result.sort((a, b) => Number(a.bib) - Number(b.bib));
  return result;
}


function updateParticipant(id, name, bib, track) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PARTICIPANTS_TAB);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      const row = i + 1;

      sheet.getRange(row, 3).setValue(track); // C
      sheet.getRange(row, 4).setValue(name);  // D
      sheet.getRange(row, 5).setValue(bib);   // E

      return;
    }
  }
}

function deleteParticipant(id) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(PARTICIPANTS_TAB);
  const data = sheet.getDataRange().getValues();
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === id) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }

  return false;
}

function getTracks1() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKS_TAB);
  const data = sheet.getDataRange().getValues();
  const tracks = [];
  for (let i = 1; i < data.length; i++) {
    if (data[i][0]) {
      tracks.push(data[i][0]);
    }
  }
  return tracks;
}

function getTracks() {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKS_TAB);
  const data = sheet.getDataRange().getValues();

  const result = [];

  for (let i = 1; i < data.length; i++) {
    result.push({
      id: data[i][0],
      start: data[i][1] ? new Date(data[i][1]).toISOString() : ""
    });
  }

  return result;
}

function updateTrackStart(trackId, startTime) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TRACKS_TAB);
  const data = sheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === trackId) {
      const row = i + 1;
      sheet.getRange(row, 2).setValue(new Date(startTime));
      return;
    }
  }
}




