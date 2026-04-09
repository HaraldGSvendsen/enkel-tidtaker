const SHEET_NAME = "Målgang";
const ACCESS_DOMAINS = "*"


// Handle POST requests (submit bib)
function doPost(e) {
  return handleRequest(e);
}

// Handle GET requests (undo)
function doGet(e) {
  return handleRequest(e);
}

// Universal handler for CORS
function handleRequest(e) {
  // Handle preflight OPTIONS request
  if (e && e.method === "OPTIONS") {
    return ContentService.createTextOutput("")
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader("Access-Control-Allow-Origin", ACCESS_DOMAINS)
      .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
      .setHeader("Access-Control-Allow-Headers", "Content-Type");
  }

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  let result = {status: "invalid"};

  if (e.postData) {
    // POST → submit bib
    const params = JSON.parse(e.postData.contents);
    const bib = params.bib;
    const entryId = params.entryId;
    sheet.appendRow([new Date(), bib, entryId]);
    result = {status: "ok"};
  } else if (e.parameter && e.parameter.undo && e.parameter.entryId) {
    // GET → undo
    const entryId = e.parameter.entryId;
    const data = sheet.getDataRange().getValues();
    for (let i = data.length - 1; i > 0; i--) {
      if (data[i][2] === entryId) {
        sheet.deleteRow(i + 1);
        result = {status: "ok"};
        break;
      }
    }
    if (result.status !== "ok") result = {status: "not found"};
  }

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", ACCESS_DOMAINS)
    .setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    .setHeader("Access-Control-Allow-Headers", "Content-Type");
}