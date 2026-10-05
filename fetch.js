fetch('https://vpdt.dongthap.gov.vn/vi/main.9aab9b145501a9d30864.js').then(r=>r.text()).then(t => { 
  const m = t.match(/clientId['"]?\s*:\s*['"]([^'"]+)['"]/g); 
  console.log('vi/', m); 
}).catch(console.error);

fetch('https://vpdt.dongthap.gov.vn/main.9aab9b145501a9d30864.js').then(r=>r.text()).then(t => { 
  const m = t.match(/clientId['"]?\s*:\s*['"]([^'"]+)['"]/g); 
  console.log('/', m); 
}).catch(console.error);
