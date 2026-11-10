/**
 * 增量迁移：为已有数据库补「商品表 + 系统设置表 + 两个菜单」
 *
 * ⚠️ 与 npm run init-db 不同，本脚本 **不 DROP 任何表**，只做：
 *   1. CREATE TABLE IF NOT EXISTS goods / settings
 *   2. goods 为空时写入 12 条演示商品（已有数据则跳过）
 *   3. settings 默认值按 key upsert（已有值不覆盖）
 *   4. menus 补「商品管理 / 系统设置」两行（按 path 判重），并给超级管理员授权
 *
 * 运行：node sql/migrate-goods-settings.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mysql = require('mysql2/promise');

const DDL_GOODS = `
CREATE TABLE IF NOT EXISTS \`goods\` (
  \`id\`          INT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '商品ID',
  \`name\`        VARCHAR(100) NOT NULL COMMENT '商品名称',
  \`sku\`         VARCHAR(50)  NOT NULL COMMENT 'SKU 编码',
  \`category\`    VARCHAR(50)  NOT NULL DEFAULT '' COMMENT '分类名称（对应看板分类）',
  \`price\`       DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '售价',
  \`stock\`       INT          NOT NULL DEFAULT 0 COMMENT '库存',
  \`sales\`       INT          NOT NULL DEFAULT 0 COMMENT '累计销量',
  \`status\`      TINYINT      NOT NULL DEFAULT 1 COMMENT '状态：1上架 0下架',
  \`image\`       VARCHAR(255) DEFAULT NULL COMMENT '缩略图地址，空则前端占位',
  \`description\` TEXT COMMENT '商品描述',
  \`created_at\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  \`updated_at\`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`id\`),
  UNIQUE KEY \`uk_sku\` (\`sku\`),
  KEY \`idx_category\` (\`category\`),
  KEY \`idx_status\` (\`status\`)
) ENGINE=InnoDB COMMENT='商品表';
`;

const DDL_SETTINGS = `
CREATE TABLE IF NOT EXISTS \`settings\` (
  \`key\`        VARCHAR(50) NOT NULL COMMENT '设置项名，如 systemName / themeColor',
  \`value\`      TEXT COMMENT '设置值（统一按字符串存，数字型读时转换）',
  \`updated_at\` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (\`key\`)
) ENGINE=InnoDB COMMENT='系统设置表';
`;

const DEMO_GOODS = [
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

const SETTINGS = {
  systemName: '电商后台管理系统',
  slogan: '用数据驱动每一次增长',
  notice: '',
  themeColor: '#F5611D',
  siderCollapsed: '0',
};

const NEW_MENUS = [
  { parent_id: 0, name: '商品管理', path: '/goods', icon: 'shopping', type: 1, permission: 'goods:view', sort: 4 },
  { parent_key: '系统管理', name: '系统设置', path: '/settings', icon: 'setting', type: 1, permission: 'settings:view', sort: 3 },
];

async function run() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'admin_dashboard',
  });

  await conn.query(DDL_GOODS);
  await conn.query(DDL_SETTINGS);
  console.log('[migrate] goods / settings 表已就绪');

  const [[{ goodsCount }]] = await conn.query('SELECT COUNT(*) AS goodsCount FROM goods');
  if (goodsCount === 0) {
    for (const [name, sku, category, price, stock, sales] of DEMO_GOODS) {
      await conn.query(
        'INSERT INTO goods (name, sku, category, price, stock, sales, status, description) VALUES (?,?,?,?,?,?,?,?)',
        [name, sku, category, price, stock, sales, stock === 0 ? 0 : 1, `${name} —— 演示数据`]
      );
    }
    console.log(`[migrate] 写入演示商品 ${DEMO_GOODS.length} 条`);
  } else {
    console.log(`[migrate] goods 已有 ${goodsCount} 条，跳过演示数据`);
  }

  for (const [key, value] of Object.entries(SETTINGS)) {
    await conn.query(
      'INSERT INTO settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value` = `value`',
      [key, value]
    );
  }
  console.log('[migrate] settings 默认值已补齐（已有值不覆盖）');

  // 菜单：按 path 判重
  for (const m of NEW_MENUS) {
    const existing = await conn.query('SELECT id FROM menus WHERE path = ?', [m.path]);
    if (existing[0].length) {
      console.log(`[migrate] 菜单已存在，跳过: ${m.path}`);
      continue;
    }
    let parentId = m.parent_id || 0;
    if (m.parent_key) {
      const p = await conn.query('SELECT id FROM menus WHERE name = ? AND parent_id = 0', [m.parent_key]);
      parentId = p[0].length ? p[0][0].id : 0;
    }
    await conn.query(
      'INSERT INTO menus (parent_id, name, path, icon, type, permission, sort) VALUES (?,?,?,?,?,?,?)',
      [parentId, m.name, m.path, m.icon, m.type, m.permission, m.sort]
    );
    console.log(`[migrate] 新增菜单: ${m.name} ${m.path}`);
  }

  // 授权：超级管理员拥有全部菜单；运营只保留原有的看板/销售
  const adminRole = await conn.query("SELECT id FROM roles WHERE code = 'admin'");
  if (adminRole[0].length) {
    const adminRoleId = adminRole[0][0].id;
    const allMenus = await conn.query('SELECT id FROM menus');
    for (const row of allMenus[0]) {
      await conn.query(
        'INSERT IGNORE INTO role_menu (role_id, menu_id) VALUES (?,?)',
        [adminRoleId, row.id]
      );
    }
    console.log('[migrate] 已为超级管理员补齐全部菜单授权');
  }

  const [[stat]] = (await conn.query(
    'SELECT (SELECT COUNT(*) FROM goods) AS goods, (SELECT COUNT(*) FROM settings) AS settings, (SELECT COUNT(*) FROM menus) AS menus'
  ));
  console.log(`[migrate] 当前基线: goods=${stat.goods} settings=${stat.settings} menus=${stat.menus}`);
  await conn.end();
}

run()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[migrate] 迁移失败:', err.message);
    process.exit(1);
  });
