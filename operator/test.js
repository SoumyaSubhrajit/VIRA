const fs = require('fs');
try {
  const buf = fs.readFileSync('D:/My_Proj/VERA/operator/data/gym.xlsx');
  console.log('Read successful, size:', buf.length);
} catch (e) {
  console.error('Read failed:', e.message);
}
