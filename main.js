try {
  var e = require('electron');
  console.log('electron typeof:', typeof e);
  console.log('electron keys:', Object.keys(e).slice(0, 15));
  process.exit(0);
} catch(err) {
  console.log('require error:', err.message);
  process.exit(1);
}
