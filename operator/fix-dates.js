const ExcelJS = require('exceljs');
const path = require('path');

async function fixDates() {
  const filePath = 'D:\\My_Proj\\VERA\\Data\\GYM\\gym_calendar.xlsx';
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);
  const ws = workbook.getWorksheet('6-Month Calendar');
  
  if (!ws) {
    console.error('Sheet not found');
    return;
  }

  // Column 1 is Date
  const colA = ws.getColumn(1);
  colA.numFmt = 'dd/mm/yyyy'; // standard excel date format
  
  // To be safe, also explicitly apply it to every cell from row 4 onwards
  ws.eachRow((row, rowNumber) => {
    if (rowNumber >= 3) { // Start from data rows
      const cell = row.getCell(1);
      cell.numFmt = 'dd/mm/yyyy';
    }
  });

  await workbook.xlsx.writeFile(filePath);
  console.log('Fixed dates successfully');
}

fixDates().catch(console.error);
