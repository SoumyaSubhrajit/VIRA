import XLSX from 'xlsx';
const wb = XLSX.readFile('D:/My_Proj/VERA/Data/GYM/gym_calendar.xlsx');
console.log('Sheets:', wb.SheetNames);
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const data = XLSX.utils.sheet_to_json(ws, { header: 1 });
  console.log(`\n=== Sheet: ${name} (${data.length} rows) ===`);
  data.slice(0, 15).forEach((r, i) => console.log(i, JSON.stringify(r)));
}
