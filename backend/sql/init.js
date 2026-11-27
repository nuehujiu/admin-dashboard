/**
 * 数据库初始化脚本
 * 运行：npm run init-db
 *
 * 功能：
 *   1. 连接 MySQL（无需先建库）
 *   2. 执行 sql/init.sql 建库、建表
 *   3. 写入演示数据：角色、用户、菜单、分类、近 30 天销售记录
 *
 * 内置账号（密码取 SEED_PASSWORD，未设置时开发环境回落到 123456）：
 *   admin     超级管理员
 *   operator  运营（仅数据看板、销售统计相关权限）
 * 生产环境（NODE_ENV=production）必须显式设置 SEED_PASSWORD（≥12 位），否则脚本中止。
 */
// 手动指定 .env 路径：脚本可能在任意目录被调用，不能依赖 cwd
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
// 读 schema 文件
const fs = require('fs');
// 拼路径
const path = require('path');
// Promise 版 mysql
const mysql = require('mysql2/promise');
// 密码哈希
const bcrypt = require('bcryptjs');

/** 主流程 */
async function run() {
  // 用单连接而不是连接池：初始化是一次性串行任务，多条语句要顺序执行
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    // 允许一次 query 里包含多条语句（init.sql 是完整脚本）
    multipleStatements: true,
  });

  // 1) 执行 schema（建库 + 建表，含 DROP/CREATE 语句）
  const schema = fs.readFileSync(path.join(__dirname, 'init.sql'), 'utf8');
  await conn.query(schema);
  console.log('[init] 数据库与表结构已就绪');

  // 2) 基础字典
  // 注意：部分 parent_id 用的是「插入顺序序号」（如 3=系统管理、4=用户管理、12=商品管理、13=系统设置），
  //      依赖下面 menus 数组的书写顺序，调整顺序会打乱父子关系与权限归属。
  const menus = [
    // 一级菜单
    { parent_id: 0, name: '数据看板', path: '/dashboard', icon: 'dashboard', type: 1, permission: 'dashboard:view', sort: 1 },
    { parent_id: 0, name: '销售统计', path: '/sales', icon: 'bar-chart', type: 1, permission: 'sales:view', sort: 2 },
    // 系统管理：目录型菜单，自身无权限点
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
    // 角色管理「权限矩阵」需要的商品按钮项与个人中心
    { parent_id: 12, name: '商品上下架', path: null, icon: null, type: 2, permission: 'goods:status', sort: 4 },
    { parent_id: 12, name: '库存调整', path: null, icon: null, type: 2, permission: 'goods:stock', sort: 5 },
    { parent_id: 0, name: '个人中心', path: '/profile', icon: 'user', type: 1, permission: 'profile:view', sort: 5 },
    // 商品的新增 / 编辑 / 删除按钮权限（parent 12 = 商品管理）
    { parent_id: 12, name: '新增商品', path: null, icon: null, type: 2, permission: 'goods:create', sort: 1 },
    { parent_id: 12, name: '编辑商品', path: null, icon: null, type: 2, permission: 'goods:update', sort: 2 },
    { parent_id: 12, name: '删除商品', path: null, icon: null, type: 2, permission: 'goods:delete', sort: 3 },
    // 系统设置写权限：parent 13 = 系统设置菜单（parent_id 用插入序号，请勿调整上面顺序）
    { parent_id: 13, name: '保存系统设置', path: null, icon: null, type: 2, permission: 'settings:update', sort: 1 },
  ];

  // 3) 写入角色
  // 角色种子：icon / color 决定角色卡的图标与配色（可选图标清单见前端 roleIcons.js）
  // 列顺序：[名称, 编码, 描述, 状态, 图标名, 主色]
  const roleSeeds = [
    ['超级管理员', 'admin', '拥有全部权限', 1, 'Safety', '#F5611D'],
    ['运营', 'operator', '可查看数据看板与销售统计', 1, 'BarChart', '#2F8F86'],
    ['商品编辑', 'goods-editor', '商品与库存维护', 1, 'Shop', '#C77A28'],
    ['访客', 'guest', '只读演示账号', 0, 'Eye', '#A8A29C'],
  ];
  // code → 自增 id 的映射，后续授权要用
  const roleIds = {};
  for (const [name, code, description, status, icon, color] of roleSeeds) {
    const r = await conn.query(
      'INSERT INTO roles (name, code, description, status, icon, color) VALUES (?,?,?,?,?,?)',
      [name, code, description, status, icon, color]
    );
    roleIds[code] = r[0].insertId;
  }
  // 解构出常用角色 id，避免后续到处 roleIds['xxx']
  const adminRoleId = roleIds.admin;
  const operatorRoleId = roleIds.operator;
  const goodsEditorRoleId = roleIds['goods-editor'];
  const guestRoleId = roleIds.guest;

  // 4) 写入菜单并记录 id 供授权
  // key 优先用 permission，没有权限点的目录用 name
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
  // 超级管理员：全量授权（含按钮级）
  for (const mid of allMenuIds) {
    await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [adminRoleId, mid]);
  }
  // 运营：看板 + 销售统计 + 个人中心（个人中心是所有角色都该有的）
  const operatorPerms = ['dashboard:view', 'sales:view', 'profile:view'];
  for (const p of operatorPerms) {
    await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [operatorRoleId, menuIds[p]]);
  }
  // 商品编辑：看板 + 商品菜单 + 商品操控按钮（不含删除）+ 个人中心
  const goodsEditorPerms = [
    'dashboard:view', 'goods:view', 'goods:status', 'goods:stock',
    'goods:create', 'goods:update', 'profile:view',
  ];
  for (const p of goodsEditorPerms) {
    await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [goodsEditorRoleId, menuIds[p]]);
  }
  // 访客：只有个人中心
  await conn.query('INSERT INTO role_menu (role_id, menu_id) VALUES (?,?)', [guestRoleId, menuIds['profile:view']]);

  // 6) 写入用户
  //    初始密码由 SEED_PASSWORD 决定；生产环境必须显式提供，杜绝 123456 进生产库
  //    last_login_at 供用户管理列表的「最近登录」列与排序使用
  const isProd = process.env.NODE_ENV === 'production';
  // 生产环境不给默认值：没设就直接空串，触发下面的抛错
  const seedPassword = process.env.SEED_PASSWORD || (isProd ? '' : '123456');
  if (!seedPassword) {
    throw new Error('生产环境初始化必须设置 SEED_PASSWORD（初始管理员密码），已中止');
  }
  // 生产环境额外要求强度（≥12 位）
  if (isProd && seedPassword.length < 12) {
    throw new Error('生产环境 SEED_PASSWORD 至少 12 位，已中止');
  }
  // 所有种子账号共用一个已算好的哈希（省去 10 次 bcrypt 计算）
  const hash = await bcrypt.hash(seedPassword, 10);
  /** 生成「N 天前」的 MySQL DATETIME 字符串（本地时间，格式 YYYY-MM-DD HH:mm:ss） */
  const ts = (daysAgo) => {
    const d = new Date(Date.now() - daysAgo * 86400000);
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} `
      + `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  };
  // [登录名, 昵称, 邮箱, 角色ID, 状态, 注册于N天前, 最近登录于N天前(null=从未登录)]
  // 数据要点：包含 2 个禁用账号（sunian / bailu），1 个从未登录（bailu），便于验证列表与通知。
  const seedUsers = [
    ['admin', '管理员', 'admin@example.com', adminRoleId, 1, 60, 0],
    ['operator', '运营小李', 'operator@example.com', operatorRoleId, 1, 60, 0],
    ['chenjh', '陈嘉禾', 'chenjh@houtai.cn', adminRoleId, 1, 48, 0],
    ['linqy', '林清越', 'linqy@houtai.cn', operatorRoleId, 1, 40, 0],
    ['zhoumz', '周牧之', 'zhoumz@houtai.cn', operatorRoleId, 1, 33, 1],
    ['sunian', '苏念', 'sunian@houtai.cn', operatorRoleId, 0, 26, 8],
    ['hezy', '何知远', 'hezy@houtai.cn', operatorRoleId, 1, 18, 12],
    ['shenar', '沈安然', 'shenar@houtai.cn', operatorRoleId, 1, 12, 13],
    ['guyan', '顾言', 'guyan@houtai.cn', operatorRoleId, 1, 6, 14],
    ['bailu', '白露', 'bailu@houtai.cn', operatorRoleId, 0, 2, null],
  ];
  for (const [username, nickname, email, roleId, status, createdDays, loginDays] of seedUsers) {
    await conn.query(
      `INSERT INTO users (username, password, nickname, email, role_id, status, created_at, last_login_at)
       VALUES (?,?,?,?,?,?,?,?)`,
      [
        username,
        hash,
        nickname,
        email,
        roleId,
        status,
        // 注册时间往前推 createdDays 天
        ts(createdDays),
        // null 表示从未登录
        loginDays === null ? null : ts(loginDays),
      ]
    );
  }

  // 7) 销售分类
  const categories = ['电子产品', '服饰鞋包', '家居生活', '美妆个护', '食品生鲜'];
  // 保存分类 id，供下面生成销售记录使用
  const catIds = [];
  for (let i = 0; i < categories.length; i++) {
    // sort 从 1 开始，决定分类下拉的展示顺序
    const r = await conn.query('INSERT INTO categories (name, sort) VALUES (?,?)', [categories[i], i + 1]);
    catIds.push(r[0].insertId);
  }

  // 8) 近 60 天销售记录（每天每个分类一条，含订单数与退款金额）
  //    60 天是为了让「近 30 天 vs 上 30 天」的环比有上一期数据可比
  const today = new Date();
  // 本地日期字符串（不用 toISOString，避免 UTC 偏一天）
  const localDate = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  for (let d = 59; d >= 0; d--) {
    // 从 59 天前推到今天
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() - d);
    const dateStr = localDate(date);
    // 每个分类每天都写一条
    for (const cid of catIds) {
      // 金额 500~8500
      const amount = Number((Math.random() * 8000 + 500).toFixed(2));
      const orderCount = Math.floor(Math.random() * 45) + 8; // 8 ~ 52 笔
      const qty = orderCount + Math.floor(Math.random() * 40); // 每单至少 1 件
      const refundAmount = Number((amount * Math.random() * 0.035).toFixed(2)); // 0 ~ 3.5%，均值≈1.8%
      await conn.query(
        'INSERT INTO sales (category_id, amount, qty, order_count, refund_amount, sale_date) VALUES (?,?,?,?,?,?)',
        [cid, amount, qty, orderCount, refundAmount, dateStr]
      );
    }
  }

  // 9) 商品演示数据（12 条，分类与看板 categories 同名，便于前端筛选一致）
  // 列顺序：[名称, SKU, 分类, 价格, 库存, 销量]
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
    // 库存 0 的售罄样例
    ['智能手环 5 代', 'SKU-EAR-012', '电子产品', 299.0, 0, 520],
  ];
  for (const [name, sku, category, price, stock, sales] of goods) {
    // 最后一条库存为 0 且下架，方便前端验证「售罄 / 已下架」两种状态
    const status = stock === 0 ? 0 : 1;
    // description 统一加后缀，便于识别是种子数据
    await conn.query(
      'INSERT INTO goods (name, sku, category, price, stock, sales, status, description) VALUES (?,?,?,?,?,?,?,?)',
      [name, sku, category, price, stock, sales, status, `${name} —— 演示数据`]
    );
  }

  // 10) 系统设置默认值
  // 注意：值为字符串（键值表设计），siderCollapsed 存 '0'
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
  // 生产环境不打印密码，只提示来源（避免日志泄露）
  if (isProd) {
    console.log('[init] 登录账号: admin / operator，密码为 SEED_PASSWORD 指定的值');
  } else {
    console.log(`[init] 登录账号: admin / operator，密码 ${seedPassword}`);
  }
  // 关闭连接，脚本才能退出
  await conn.end();
}

// 执行并按结果设置退出码，便于 CI / npm script 判断成败
run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[init] 初始化失败:', err.message);
    process.exit(1);
  });
