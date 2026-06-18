const m = require('D:/text/icarus-models/dqdl/dqdl-server/node_modules/mysql2/promise');
(async () => {
  const c = await m.createConnection({host:'localhost',user:'root',password:'',database:'dqdl'});
  const [r] = await c.query('SELECT mob_id FROM mob ORDER BY mob_id');
  console.log('Count:', r.length);
  r.forEach(x => console.log(x.mob_id));
  await c.end();
})();
