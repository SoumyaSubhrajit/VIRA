const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

function testUpdate() {
  const filePath = path.join(process.cwd(), 'data', 'gym.xlsx');
  const buf = fs.readFileSync(filePath);
  const workbook = XLSX.read(buf, { type: 'buffer' });
  const ws = workbook.Sheets['6-Month Calendar'];
  
  // Update cell G5 (0-indexed row 4, col 6)
  const completedCell = XLSX.utils.encode_cell({ r: 4, c: 5 });
  const notesCell = XLSX.utils.encode_cell({ r: 4, c: 6 });
  
  ws[completedCell] = { v: 'Yes', t: 's' };
  ws[notesCell] = { v: 'Test Note', t: 's' };
  
  // Expand ref if needed
  if (ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref']);
    if (range.e.c < 6) {
      range.e.c = 6;
      ws['!ref'] = XLSX.utils.encode_range(range);
    }
  }

  const outBuf = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
  
  try {
    fs.writeFileSync(filePath, outBuf);
    console.log('Successfully wrote to', filePath);
  } catch (err) {
    console.error('Write failed:', err.message);
  }
}

testUpdate();
