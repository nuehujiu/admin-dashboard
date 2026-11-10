const mysql = require('mysql2/promise');

(async () => {
  const c = await mysql.createConnection({
    host: '127.0.0.1',
    port: 3306,
    user: 'root',
    password: 'lrx6222262000',
    database: 'admin_dashboard',
  });

  const [roles] = await c.execute('SELECT id, name, code, description FROM roles ORDER BY id');
  console.log('== roles ==', roles.length);
  console.table(roles);

  const [menus] = await c.execute('SELECT id, parent_id, name, path FROM menus ORDER BY id');
  console.log('== menus ==', menus.length);
  console.table(menus);

  const [rm] = await c.execute('SELECT role_id, menu_id FROM role_menu ORDER BY role_id, menu_id');
  console.log('== role_menu 关联行 ==', rm.length);
  console.table(rm);

  const [users] = await c.execute('SELECT id, username, role_id FROM users ORDER BY id');
  console.log('== users ==', users.length);
  console.table(users);

  await c.end();
})().catch((e) => {
  console.error('查询失败:', e.message);
  process.exit(1);
});
