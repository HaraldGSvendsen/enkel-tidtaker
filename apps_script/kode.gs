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
  else {
    return ContentService
      .createTextOutput("OK");
  }
}

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

  // Store for 10 seconds
  cache.put(cacheKey, JSON.stringify(data), 10);

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
    const bib = partData[i][3];
    const name = partData[i][2];
    const trackId = getFirstTwoWords(partData[i][1]);

    if (bib) {
      bibMap[bib] = { name, trackId };
    }
  }

  // Bib -> finish time (FIRST finish wins)
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
    if (!finishMap[bib]) continue;

    const start = trackStartMap[info.trackId];
    const finish = finishMap[bib];

    if (!start || !finish) continue;

    const durationMs = finish - start;

    if (durationMs < 0) continue;

    if (!trackGroups[info.trackId]) {
      trackGroups[info.trackId] = [];
    }

    trackGroups[info.trackId].push({
      bib: Number(bib),
      name: info.name,
      startTime: start.toISOString(),
      finishTime: finish.toISOString(),
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
    runners.sort((a, b) => a.bib - b.bib);

    // 4. Add ranking
    const sortedRunners = [];
    for (let i = 0; i < runners.length; i++) {
      sortedRunners.push({
        rank: i + 1,
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


function getResultsDataArray() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  // Get sheets
  const sheetPart = ss.getSheetByName(PARTICIPANTS_TAB);
  const sheetTracks = ss.getSheetByName(TRACKS_TAB);
  const sheetFin = ss.getSheetByName(FINISHES_TAB);
  
  if (!sheetPart || !sheetTracks || !sheetFin) {
    Logger.log("Error: Missing required tabs.");
    return;
  }

  Logger.log("Updating results tab.");

  // 1. Load Data
  const partData = sheetPart.getDataRange().getValues();
  const trackData = sheetTracks.getDataRange().getValues();
  const finishData = sheetFin.getDataRange().getValues();

  // 2. Build Lookup Maps
  // Map: TrackID -> StartTime
  const trackStartMap = {};
  for (let i = 1; i < trackData.length; i++) {
    const tId = trackData[i][0];
    const tStart = trackData[i][1];
    if (tId) trackStartMap[tId] = tStart;
  }

  // Map: Bib -> {Name, TrackID}
  const bibMap = {};
  for (let i = 1; i < partData.length; i++) {
    // timestamp, løype, navn, startnr, skjul
    const bib = partData[i][3];
    const name = partData[i][2];
    const tId = getFirstTwoWords(partData[i][1]);
    if (bib) bibMap[bib] = { name: name, trackId: tId };
  }

  // Map: Bib -> FinishTime
  const finishMap = {};
  for (let i = 1; i < finishData.length; i++) {
    const fTime = finishData[i][0];
    const bib = finishData[i][1];
    if (bib && fTime) finishMap[bib] = fTime;
  }

  // 3. Group by Track
  const trackGroups = {};
  
  // Iterate through all participants who have finished
  for (const [bib, info] of Object.entries(bibMap)) {
    if (finishMap[bib]) {
      const tId = info.trackId;
      if (!trackGroups[tId]) {
        trackGroups[tId] = [];
      }
      
      //const startTime = trackStartMap[tId];
      //const finishTime = finishMap[bib];
      const startTimeRaw = trackStartMap[tId];
      const finishTimeRaw = finishMap[bib];

      // 1. Normalize to Date Objects
      const startDate = new Date(startTimeRaw);
      const finishDate = new Date(finishTimeRaw);      

      // 2. Validate
      if (isNaN(startDate.getTime()) || isNaN(finishDate.getTime())) {
        Logger.log("Invalid Date detected for Bib " + bib + ". Start: " + startTimeRaw + ", Finish: " + finishTimeRaw);
        // Handle error (skip or mark as error)
        continue; 
      }

      // 3. Calculate Duration (in milliseconds)
      const durationMs = finishDate.getTime() - startDate.getTime();

      // 4. Convert to Days (Google Sheets stores dates as days)
      // 1 day = 24 * 60 * 60 * 1000 ms
      const durationDays = durationMs / (24 * 60 * 60 * 1000);

      // Now use 'durationDays' for sorting and formatting
      trackGroups[tId].push({
        bib: bib,
        name: info.name,
        startTime: startDate, // Store as Date object for consistency
        finishTime: finishDate,
        duration: durationDays, // Store as number (fraction of a day)
      });
    }
  }

  Logger.log("trackGroups: "+JSON.stringify(trackGroups));

  // 4. Prepare Output Rows
  let outputRows = [];
  
  const header = ["Startnr", "Navn", "Starttid", "Måltid", "Tid"];
  outputRows.push(header);

  // Sort Track IDs alphabetically or numerically for consistent order
  const sortedTrackIds = Object.keys(trackGroups).sort();

  sortedTrackIds.forEach(tId => {
    const runners = trackGroups[tId];
    
    // Sort runners by duration (ascending)
    //runners.sort((a, b) => a.duration - b.duration);
    runners.sort((a, b) => a.bib - b.bib);

    // Add a separator row (optional, but looks nice)
    // We'll just add a bold header row for the track
    //outputRows.push(["", tId.toUpperCase(), "", "", "", "", ""]); // Empty cells except Track ID
    outputRows.push([tId.toUpperCase(), "", "", "", ""]); // Empty cells except the first
    
    // Add runners
    runners.forEach((r, index) => {
      outputRows.push([
        r.bib,
        r.name,
        r.startTime,
        r.finishTime,
        r.duration
      ]);
    });
    
    // Add a blank row after each track for readability
    outputRows.push(["", "", "", "", ""]);
  });
  Logger.log("Returning data with length: " + outputRows.length);
  return outputRows;
}


// Write updated results to results tab in spreadsheet
function generateTrackResults() {

  //TODO: Use the JSON data instead of duplicating code
  outputRows = getResultsDataArray();
  Logger.log(outputRows);

  // 5. Write to Results Tab
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  let sheetRes = ss.getSheetByName(RESULTS_TAB_NAME);
  if (!sheetRes) {
    sheetRes = ss.insertSheet(RESULTS_TAB_NAME);
  } else {
    sheetRes.clearContents();
  }

  if (outputRows.length > 0) {
    sheetRes.getRange(1, 1, outputRows.length, outputRows[0].length).setValues(outputRows);
    
    // Formatting
    sheetRes.getRange(1, 1, 1, 5).setFontWeight("bold").setBackground("#f3f3f3"); // Header
    sheetRes.getRange(2, 2, outputRows.length, 1).setFontWeight("bold"); // Track IDs bold

    // Apply date format to Start Time column (Column 5) and to Finish time (column 6)
    var timeFormat = "HH:mm:ss"; 
    sheetRes.getRange(2, 3, outputRows.length, 1).setNumberFormat(timeFormat);
    sheetRes.getRange(2, 4, outputRows.length, 1).setNumberFormat(timeFormat);
    sheetRes.getRange(2, 5, outputRows.length, 1).setNumberFormat(timeFormat);

    // Auto-resize columns
    sheetRes.autoResizeColumns(1, 5);
    
    // Freeze header row
    sheetRes.setFrozenRows(1);
  }
}

// Trigger on edit in Finishes tab
function onEditParticipants(e) {
  const sheet = e.source.getActiveSheet();
  if (sheet.getName() === PARTICIPANTS_TAB && e.range.getRow() > 1) {
    Utilities.sleep(200); 
    generateTrackResults();
  }
}
