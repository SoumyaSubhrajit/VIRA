fetch('http://localhost:3000/api/gym').then(r => r.json()).then(d => console.log(JSON.stringify(d).substring(0, 500))).catch(e => console.error(e));
