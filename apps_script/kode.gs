const SHEET_NAME = "Målgang";

function doGet() {
  const output = HtmlService.createHtmlOutputFromFile('index');
  output.addMetaTag('viewport', 'width=device-width, initial-scale=1');  
  output.setTitle('Målgang');
  output.setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  return output;
}


function submitBib(bib) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  sheet.appendRow([new Date(), bib]);
  return "OK";
}

function submitBibWithId(bib, entryId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  sheet.appendRow([new Date(), bib, entryId]);
}

function undoLastEntryById(entryId) {
  const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();

  for (let i = data.length - 1; i > 0; i--) {
    if (data[i][2] === entryId) {
      sheet.deleteRow(i + 1);
      return true;
    }
  }
  return false;
}
