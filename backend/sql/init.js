/**
 * 数据库初始化脚本
 * 运行：npm run init-db
 *
 * 功能：
 *   1. 连接 MySQL（无需先建库）
 *   2. 执行 sql/init.sql 建库、建表
 *   3. 写入演示数据：角色、用户、菜单、分类、近 30 天销售记录
 *
 * 内置账号（密码均为 123456）：
 *   admin   / 123456   超级管理员
 *   operator / 123456  运营（仅数据看板、销售统计相关权限）
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    multipleStatements: true,
  });

  // 1) 执行 schema
  const schema = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await conn.query(schema);
  console.log('[init] 数据库与表结构已就绪');

  // 2) 基础字典
  const menus = [
    { parent_id: 0, name: '数据看板', path: '/dashboard', icon: 'dashboard', type: 1, permission: 'dashboard:view', sort: 1 },
    { parent_id: 0, name: '销售统计', path: '/sales', icon: 'bar-chart', type: 1, permission: 'sales:view', sort: 2 },
    { parent_id: 0, name: '系统管理', path: '/system', icon: 'setting', type: 1, permission: null, sort: 3 },
    { parent_id: 3, name: '用户管理', path: '/system/users', icon: 'user', type: 1, permission: 'user:list', sort: 1 },
    { parent_id: 3, name: '角色管理', path: '/system/roles', icon: 'team', type: 1, permission: 'role:list', sort: 2 },
    // 按钮级权限
    { parent_id: 4, name: '新增用户', path: null, icon: null, type: 2, permission: 'user:create', sort: 1 },
    { parent_id: 4, name: '编辑用户', path: null, icon: null, type: 2, permission: 'user:update', sort: 2 },
    { parent_id: 4, name: '删除用户', path: null, icon: null, type: 2, permission: 'user:delete', sort: 3 },
    { parent_id: 5, name: '新增角色', path: null, icon: null, type: 2, permission: 'role:create', sort: 1 },
    { parent_id: 5, name: '编辑角色', path: null, icon: null, type: 2, permission: 'role:update', sort: 2 },
    { parent_id: 5, name: '删除角色', path: null, icon: null, type: 2, permission: 'role:delete', sort: 3 },
    // 商品 / 设置（后端已补，仅菜单级可见性，不做接口级权限）
    { parent_id: 0, name: '商品管理', path: '/goods', icon: 'shopping', type: 1, permission: 'goods:view', sort: 4 },
    { parent_id: 3, name: '系统设置', path: '/settings', icon: 'setting', type: 1, permission: 'settings:view', sort: 3 },
  ];

  // 3) 写入角色
  await conn.query("INSERT INTO roles (name, code, description) VALUES (?, ?, ?)", ['超级管理员', 'admin', '拥有全部权限']);
  const adminRoleId = (await conn.query("SELECT id FROM roles WHERE code='admin'"))[0][0].id;
  await conn.query("INSERT INTO roles (name, code, description) VALUES (?, ?, ?)", ['运营', 'operator', '可查看数据看板与销售统计']);
  const operatorRoleId = (await conn.query("SELECT id FROM roles WHERE code='operator'"))[0][0].id;

  // 4) 写入菜单并记录 id 供授权
  const menuIds = {};
  for (const m of menus) {
    const r = await conn.query(
      'INSERT INTO menus (parent_id, name, path, icon, type, permission, sort) VALUES (?,?,?,?,?,?,?)',
      [m.parent_id, m.name, m.path, m.icon, m.type, m.permission, m.sort]
    );
    menuIds[m.permission || m.name] = r[0].insertId;
  }

  // 5) 授权：admin 拥有全部菜单；operator 拥有看板、销售统计及查看类权限
  const allMenuIds = Object.values(menuIds);
  for (const mid of allMenuIds) {
    await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [adminRoleId, mid]);
  }
  const operatorPerms = ['dashboard:view', 'sales:view'];
  for (const p of operatorPerms) {
    await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [operatorRoleId, menuIds[p]]);
  }

  // 6) 写入用户（密码统一 123456）
  const hash = await bcrypt.hash('123456', 10);
  await conn.query(
    "INSERT INTO users (username, password, nickname, email, role_id, status) VALUES (?,?,?,?,?,?)",
    ['admin', hash, '管理员', 'admin@example.com', adminRoleId, 1]
  );
  await conn.query(
    "INSERT INTO users (username, password, nickname, email, role_id, status) VALUES (?,?,?,?,?,?)",
    ['operator', hash, '运营小李', 'operator@example.com', operatorRoleId, 1]
  );

  // 7) 销售分类
  const categories = ['电子产品', '服饰鞋包', '家居生活', '美妆个护', '食品生鲜'];
  const catIds = [];
  for (let i = 0; i < categories.length; i++) {
    const r = await conn.query('INSERT INTO categories (name, sort) VALUES (?,?)', [categories[i], i + 1]);
    catIds.push(r[0].insertId);
  }

  // 8) 近 30 天销售记录（每天每个分类一条，随机金额与销量）
  const now = new Date();
  for (let d = 29; d >= 0; d--) {
    const date = new Date(now.getTime() - d * 86400000);
    const dateStr = date.toISOString().slice(0, 10);
    for (const cid of catIds) {
      const amount = (Math.random() * 8000 + 500).toFixed(2);
      const qty = Math.floor(Math.random() * 80 + 5);
      await conn.query(
        'INSERT INTO sales (category_id, amount, qty, sale_date) VALUES (?,?,?,?)',
        [cid, amount, qty, dateStr]
      );
    }
  }

  // 9) 商品演示数据（12 条，分类与看板 categories 同名，便于前端筛选一致）
  const goods = [
    ['无线蓝牙耳机 Pro', 'SKU-EAR-001', '电子产品', 899.0, 120, 320],
    ['144Hz 电竞显示器', 'SKU-MON-002', '电子产品', 1599.0, 45, 210],
    ['机械键盘 87 键', 'SKU-KBD-003', '电子产品', 329.0, 260, 980],
    ['纯棉圆领 T 恤', 'SKU-TSH-004', '服饰鞋包', 89.0, 800, 1560],
    ['轻量跑步鞋', 'SKU-SHO-005', '服饰鞋包', 469.0, 320, 640],
    ['北欧风棉麻抱枕', 'SKU-HOM-006', '家居生活', 79.0, 500, 430],
    ['可折叠收纳箱', 'SKU-HOM-007', '家居生活', 59.0, 900, 1120],
    ['氨基酸洁面乳', 'SKU-BEA-008', '美妆个护', 119.0, 300, 760],
    ['修护精华水 200ml', 'SKU-BEA-009', '美妆个护', 259.0, 150, 380],
    ['冷萃咖啡液 10 条装', 'SKU-FOD-010', '食品生鲜', 99.0, 2000, 3400],
    ['每日坚果 30 包', 'SKU-FOD-011', '食品生鲜', 139.0, 1200, 2100],
    ['智能手环 5 代', 'SKU-EAR-012', '电子产品', 299.0, 0, 520],
  ];
  for (const [name, sku, category, price, stock, sales] of goods) {
    // 最后一条库存为 0 且下架，方便前端验证「售罄 / 已下架」两种状态
    const status = stock === 0 ? 0 : 1;
    await conn.query(
      'INSERT INTO goods (name, sku, category, price, stock, sales, status, description) VALUES (?,?,?,?,?,?,?,?)',
      [name, sku, category, price, stock, sales, status, `${name} —— 演示数据`]
    );
  }

  // 10) 系统设置默认值
  const settings = {
    systemName: '电商后台管理系统',
    slogan: '用数据驱动每一次增长',
    notice: '',
    themeColor: '#F5611D',
    siderCollapsed: '0',
  };
  for (const [key, value] of Object.entries(settings)) {
    await conn.query('INSERT INTO settings (`key`, `value`) VALUES (?,?)', [key, value]);
  }

  console.log('[init] 演示数据写入完成');
  console.log('[init] 登录账号: admin / 123456  或  operator / 123456');
  await conn.end();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[init] 初始化失败:', err.message);
    process.exit(1);
  });
