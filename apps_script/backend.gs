const SHEET_NAME = "Målgang";
const ACCESS_DOMAINS = "*"

// Håndter submit via fetch
function doPost(e) {
  const params = JSON.parse(e.postData.contents);
  const bib = params.bib;
  const entryId = params.entryId;

  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("FinishTimes");
  sheet.appendRow([new Date(), bib, entryId]);

  // Add CORS header
  return ContentService
    .createTextOutput(JSON.stringify({status: "ok"}))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", ACCESS_DOMAINS);
}

// Håndter undo via fetch med GET
function doGet(e) {
  if (e.parameter.undo && e.parameter.entryId) {
    const entryId = e.parameter.entryId;
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName("FinishTimes");
    const data = sheet.getDataRange().getValues();

    for (let i = data.length - 1; i > 0; i--) {
      if (data[i][2] === entryId) {
        sheet.deleteRow(i + 1);
        return ContentService.createTextOutput(JSON.stringify({status: "ok"}))
          .setMimeType(ContentService.MimeType.JSON)
          .setHeader("Access-Control-Allow-Origin", ACCESS_DOMAINS);
      }
    }
    return ContentService.createTextOutput(JSON.stringify({status: "not found"}))
      .setMimeType(ContentService.MimeType.JSON)
      .setHeader("Access-Control-Allow-Origin", ACCESS_DOMAINS);
  }

  return ContentService.createTextOutput(JSON.stringify({status: "invalid"}))
    .setMimeType(ContentService.MimeType.JSON)
    .setHeader("Access-Control-Allow-Origin", ACCESS_DOMAINS);
}