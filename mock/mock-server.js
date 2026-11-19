/**
 * 零依赖 Mock API 服务 —— 对齐 backend/ 真实契约（v2.1，30 接口含商品/设置）
 *
 * 用途：前端在没有 MySQL / 不想动真库时开发页面，接口形状与 backend/ 完全一致，
 *      切换真实后端只需改 proxy 端口，前端代码零改动。
 *
 * 启动（任意 Node，无需 npm install）：
 *   node mock/mock-server.js
 *   MOCK_PORT=3002 node mock/mock-server.js        # 换端口
 *   MOCK_LATENCY=800 node mock/mock-server.js      # 全局模拟慢网络（毫秒）
 *
 * 场景模拟（Query 或 Header 二选一）：
 *   ?__scenario=empty         列表类接口返回空数据集（测空态）
 *   ?__scenario=error         返回 {code:1,message:'模拟服务异常'}（测业务错误提示）
 *   ?__scenario=unauthorized  返回 401（测登录过期）
 *   ?__scenario=notfound      返回 404
 *   ?__scenario=server-error  返回 500
 *   ?__scenario=slow          延迟 1200ms（测 loading）
 *   等价 Header：X-Mock-Scenario: empty
 *
 * 内置账号（密码均 123456）：
 *   admin    / 123456   超级管理员（role_id=1，13 条菜单/按钮权限）
 *   operator / 123456   运营（role_id=2，仅 dashboard:view、sales:view）
 *
 * 与真实后端刻意保持一致的「怪癖」（前端要提前适配）：
 *   1. 业务错误一律 HTTP 200 + code=1；只有 401/404 用真实状态码。
 *   2. GET /api/roles 返回裸数组，不是 {list,total}。
 *   3. GET /api/auth/me 的 menus 是扁平数组（type=1），不含按钮。
 *   4. GET /api/roles/:id/menus 不校验角色是否存在，不存在返回 200 + []。
 *   5. PUT /api/roles/:id/menus 的 body 未被解析成 JSON 时，menu_ids 默认为 []，
 *      仍返回「权限分配成功」（先删后插、一条不插），即静默假成功。
 *   6. 编辑角色时不校验 name，只传 description 会把 name 写成 undefined（真实后端会报错）。
 *
 * 依赖：仅 Node 内置模块。
 */
const http = require('http');

const PORT = Number(process.env.MOCK_PORT) || 3001;
const GLOBAL_LATENCY = Number(process.env.MOCK_LATENCY) || 0;

// ---------------------------------------------------------------- 工具

const pad2 = (n) => String(n).padStart(2, '0');

/** 本地日期 YYYY-MM-DD（真实后端用 UTC，这里用本地，方便验证"今日"数据） */
function localDate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function localDateTime(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ` +
    `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}

const ok = (data = null, message = 'ok') => ({ code: 0, message, data });
const fail = (message = '请求失败', code = 1) => ({ code, message, data: null });

function send(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Mock-Scenario',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

/** 只解析 application/json，其它类型返回 {} —— 复刻 express.json() 的行为。
 *  JSON 语法错误时抛 400（真实后端由 express.json 抛 SyntaxError，errorHandler 返回 HTTP 400 + code 400）。 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const type = String(req.headers['content-type'] || '').toLowerCase();
      if (!type.includes('application/json')) return resolve({});
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        const err = new Error(e.message);
        err.status = 400;
        reject(err);
      }
    });
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- 种子数据

/** 菜单（与 sql/init.js 完全一致，13 条：7 菜单 + 6 按钮） */
const menus = [
  { id: 1, parent_id: 0, name: '数据看板', path: '/dashboard', icon: 'dashboard', type: 1, permission: 'dashboard:view', sort: 1 },
  { id: 2, parent_id: 0, name: '销售统计', path: '/sales', icon: 'bar-chart', type: 1, permission: 'sales:view', sort: 2 },
  { id: 3, parent_id: 0, name: '系统管理', path: '/system', icon: 'setting', type: 1, permission: null, sort: 3 },
  { id: 4, parent_id: 3, name: '用户管理', path: '/system/users', icon: 'user', type: 1, permission: 'user:list', sort: 1 },
  { id: 5, parent_id: 3, name: '角色管理', path: '/system/roles', icon: 'team', type: 1, permission: 'role:list', sort: 2 },
  { id: 6, parent_id: 4, name: '新增用户', path: null, icon: null, type: 2, permission: 'user:create', sort: 1 },
  { id: 7, parent_id: 4, name: '编辑用户', path: null, icon: null, type: 2, permission: 'user:update', sort: 2 },
  { id: 8, parent_id: 4, name: '删除用户', path: null, icon: null, type: 2, permission: 'user:delete', sort: 3 },
  { id: 9, parent_id: 5, name: '新增角色', path: null, icon: null, type: 2, permission: 'role:create', sort: 1 },
  { id: 10, parent_id: 5, name: '编辑角色', path: null, icon: null, type: 2, permission: 'role:update', sort: 2 },
  { id: 11, parent_id: 5, name: '删除角色', path: null, icon: null, type: 2, permission: 'role:delete', sort: 3 },
  { id: 12, parent_id: 0, name: '商品管理', path: '/goods', icon: 'shopping', type: 1, permission: 'goods:view', sort: 4 },
  { id: 13, parent_id: 3, name: '系统设置', path: '/settings', icon: 'setting', type: 1, permission: 'settings:view', sort: 3 },
  { id: 14, parent_id: 12, name: '商品上下架', path: null, icon: null, type: 2, permission: 'goods:status', sort: 4 },
  { id: 15, parent_id: 12, name: '库存调整', path: null, icon: null, type: 2, permission: 'goods:stock', sort: 5 },
  { id: 16, parent_id: 0, name: '个人中心', path: '/profile', icon: 'user', type: 1, permission: 'profile:view', sort: 5 },
];

/**
 * 新增记录的自增 id：取当前最大 id + 1
 * 不能用写死的计数器，否则会和演示数据撞号（撞号会导致详情 / 登录取到别人的行）
 */
const nextId = (list) => (list.length ? Math.max(...list.map((i) => i.id)) + 1 : 1);

const roles = [
  { id: 1, name: '超级管理员', code: 'admin', description: '拥有全部权限', status: 1, icon: 'Safety', color: '#F5611D', created_at: localDateTime(-30) },
  { id: 2, name: '运营', code: 'operator', description: '可查看数据看板与销售统计', status: 1, icon: 'BarChart', color: '#2F8F86', created_at: localDateTime(-30) },
  { id: 3, name: '商品编辑', code: 'goods-editor', description: '商品与库存维护', status: 1, icon: 'Shop', color: '#C77A28', created_at: localDateTime(-30) },
  { id: 4, name: '访客', code: 'guest', description: '只读演示账号', status: 0, icon: 'Eye', color: '#A8A29C', created_at: localDateTime(-30) },
];

/** role_menu：admin 全量；operator 看板+销售；商品编辑 看板+商品+商品按钮+个人中心；访客 仅个人中心 */
const roleMenu = {
  1: menus.map((m) => m.id),
  2: [1, 2],
  3: [1, 12, 14, 15, 16],
  4: [16],
};

/** 用户演示数据：密码均为 123456；last_login_at 供「最近登录」列与排序使用 */
const users = [
  {
    id: 1, username: 'admin', password: '123456', nickname: '管理员', email: 'admin@example.com',
    avatar: null, role_id: 1, status: 1, created_at: localDateTime(-60), updated_at: localDateTime(-60),
    last_login_at: localDateTime(0),
  },
  {
    id: 2, username: 'operator', password: '123456', nickname: '运营小李', email: 'operator@example.com',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-60), updated_at: localDateTime(-60),
    last_login_at: localDateTime(0),
  },
  {
    id: 3, username: 'chenjh', password: '123456', nickname: '陈嘉禾', email: 'chenjh@houtai.cn',
    avatar: null, role_id: 1, status: 1, created_at: localDateTime(-48), updated_at: localDateTime(-48),
    last_login_at: localDateTime(0),
  },
  {
    id: 4, username: 'linqy', password: '123456', nickname: '林清越', email: 'linqy@houtai.cn',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-40), updated_at: localDateTime(-40),
    last_login_at: localDateTime(0),
  },
  {
    id: 5, username: 'zhoumz', password: '123456', nickname: '周牧之', email: 'zhoumz@houtai.cn',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-33), updated_at: localDateTime(-33),
    last_login_at: localDateTime(-1),
  },
  {
    id: 6, username: 'sunian', password: '123456', nickname: '苏念', email: 'sunian@houtai.cn',
    avatar: null, role_id: 2, status: 0, created_at: localDateTime(-26), updated_at: localDateTime(-26),
    last_login_at: localDateTime(-8),
  },
  {
    id: 7, username: 'hezy', password: '123456', nickname: '何知远', email: 'hezy@houtai.cn',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-18), updated_at: localDateTime(-18),
    last_login_at: localDateTime(-12),
  },
  {
    id: 8, username: 'shenar', password: '123456', nickname: '沈安然', email: 'shenar@houtai.cn',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-12), updated_at: localDateTime(-12),
    last_login_at: localDateTime(-13),
  },
  {
    id: 9, username: 'guyan', password: '123456', nickname: '顾言', email: 'guyan@houtai.cn',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-6), updated_at: localDateTime(-6),
    last_login_at: localDateTime(-14),
  },
  {
    id: 10, username: 'bailu', password: '123456', nickname: '白露', email: 'bailu@houtai.cn',
    avatar: null, role_id: 2, status: 0, created_at: localDateTime(-2), updated_at: localDateTime(-2),
    last_login_at: null,
  },
];

const categories = [
  { id: 1, name: '电子产品', sort: 1 },
  { id: 2, name: '服饰鞋包', sort: 2 },
  { id: 3, name: '家居生活', sort: 3 },
  { id: 4, name: '美妆个护', sort: 4 },
  { id: 5, name: '食品生鲜', sort: 5 },
];

/** 商品（与 backend 迁移脚本写入的 12 条演示数据一致） */
const goods = [
  { id: 1, name: '无线蓝牙耳机 Pro', sku: 'SKU-EAR-001', category: '电子产品', price: 899, stock: 120, sales: 320, status: 1 },
  { id: 2, name: '144Hz 电竞显示器', sku: 'SKU-MON-002', category: '电子产品', price: 1599, stock: 45, sales: 210, status: 1 },
  { id: 3, name: '机械键盘 87 键', sku: 'SKU-KBD-003', category: '电子产品', price: 329, stock: 260, sales: 980, status: 1 },
  { id: 4, name: '纯棉圆领 T 恤', sku: 'SKU-TSH-004', category: '服饰鞋包', price: 89, stock: 800, sales: 1560, status: 1 },
  { id: 5, name: '轻量跑步鞋', sku: 'SKU-SHO-005', category: '服饰鞋包', price: 469, stock: 320, sales: 640, status: 1 },
  { id: 6, name: '北欧风棉麻抱枕', sku: 'SKU-HOM-006', category: '家居生活', price: 79, stock: 500, sales: 430, status: 1 },
  { id: 7, name: '可折叠收纳箱', sku: 'SKU-HOM-007', category: '家居生活', price: 59, stock: 900, sales: 1120, status: 1 },
  { id: 8, name: '氨基酸洁面乳', sku: 'SKU-BEA-008', category: '美妆个护', price: 119, stock: 300, sales: 760, status: 1 },
  { id: 9, name: '修护精华水 200ml', sku: 'SKU-BEA-009', category: '美妆个护', price: 259, stock: 150, sales: 380, status: 1 },
  { id: 10, name: '冷萃咖啡液 10 条装', sku: 'SKU-FOD-010', category: '食品生鲜', price: 99, stock: 2000, sales: 3400, status: 1 },
  { id: 11, name: '每日坚果 30 包', sku: 'SKU-FOD-011', category: '食品生鲜', price: 139, stock: 1200, sales: 2100, status: 1 },
  { id: 12, name: '智能手环 5 代', sku: 'SKU-EAR-012', category: '电子产品', price: 299, stock: 0, sales: 520, status: 0 },
].map((g) => ({
  ...g,
  image: null,
  description: `${g.name} —— 演示数据`,
  created_at: localDateTime(-20),
  updated_at: localDateTime(-20),
}));

/** 系统设置默认值（与 backend settingsController DEFAULTS 一致） */
const DEFAULT_SETTINGS = {
  systemName: '电商后台管理系统',
  slogan: '用数据驱动每一次增长',
  notice: '',
  themeColor: '#F5611D',
  siderCollapsed: 0,
};
let settings = { ...DEFAULT_SETTINGS };

/** 近 60 天 × 5 分类的销售记录（LCG 保证每次启动数据一致，便于截图/断言复现）
 *  60 天是为了让「近 30 天 vs 上 30 天」的环比有上一期数据可比
 */
const sales = (() => {
  let seed = 20261109;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const list = [];
  let id = 1;
  for (let dayOffset = -59; dayOffset <= 0; dayOffset++) {
    const date = localDate(dayOffset);
    for (const c of categories) {
      const amount = Number((500 + rnd() * 8000).toFixed(2));
      const orderCount = 8 + Math.floor(rnd() * 45);
      const qty = orderCount + Math.floor(rnd() * 40);
      const refundAmount = Number((amount * rnd() * 0.035).toFixed(2));
      list.push({
        id: id++,
        category_id: c.id,
        amount,
        qty,
        order_count: orderCount,
        refund_amount: refundAmount,
        sale_date: date,
      });
    }
  }
  return list;
})();

// ---------------------------------------------------------------- 鉴权

const PUBLIC_PATHS = new Set([
  '/api/health',
  '/api/auth/register',
  '/api/auth/login',
]);

function signToken(user) {
  const payload = {
    id: user.id,
    username: user.username,
    role_id: user.role_id,
    role_name: roleNameOf(user.role_id),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 2 * 3600,
  };
  return 'mock.' + Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function verifyToken(token) {
  if (!token || !token.startsWith('mock.')) return null;
  try {
    const payload = JSON.parse(Buffer.from(token.slice(5), 'base64url').toString('utf8'));
    if (!payload || !payload.id) return null;
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch (e) {
    return null;
  }
}

function roleNameOf(roleId) {
  const r = roles.find((x) => x.id === Number(roleId));
  return r ? r.name : null;
}

// ---------------------------------------------------------------- 业务助手

/** 批量 ids 校验：非空数组、正整数、去重、最多 max 条（商品 / 用户共用） */
const normalizeIds = (v, max = 100) => {
  if (!Array.isArray(v) || !v.length) return { ok: false, message: 'ids 必须是非空数组' };
  const set = new Set();
  for (const item of v) {
    const n = Number(item);
    if (!Number.isInteger(n) || n <= 0) return { ok: false, message: 'ids 只能为正整数' };
    set.add(n);
  }
  if (set.size > max) return { ok: false, message: `一次最多操作 ${max} 条记录` };
  return { ok: true, ids: [...set] };
};

function userToListItem(u) {
  return {
    id: u.id,
    username: u.username,
    nickname: u.nickname,
    email: u.email,
    avatar: u.avatar,
    role_id: u.role_id,
    role_name: roleNameOf(u.role_id),
    status: u.status,
    created_at: u.created_at,
    last_login_at: u.last_login_at || null,
  };
}

function userToDetail(u) {
  return { ...userToListItem(u), updated_at: u.updated_at };
}

function menusOfRole(roleId) {
  const ids = roleMenu[Number(roleId)] || [];
  return menus.filter((m) => ids.includes(m.id));
}

function countUsersOfRole(roleId) {
  return users.filter((u) => Number(u.role_id) === Number(roleId)).length;
}

// ---------------------------------------------------------------- 路由

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const path = parsedUrl.pathname.replace(/\/+$/, '') || '/';
  const query = parsedUrl.searchParams;
  const method = req.method;

  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Mock-Scenario',
    });
    return res.end();
  }

  const scenario = query.get('__scenario') || req.headers['x-mock-scenario'] || '';
  if (GLOBAL_LATENCY) await sleep(GLOBAL_LATENCY);
  if (scenario === 'slow') await sleep(1200);

  try {
    // ---- 健康检查（不受场景影响，前端用它探活）
    if (method === 'GET' && path === '/api/health') {
      return send(res, 200, ok({ time: new Date().toISOString() }));
    }

    // ---- 统一异常场景（401/404/500/业务错误）
    if (scenario === 'unauthorized') {
      return send(res, 401, fail('token 无效或已过期', 401));
    }
    if (scenario === 'notfound') {
      return send(res, 404, fail('用户不存在', 404));
    }
    if (scenario === 'server-error') {
      return send(res, 500, fail('服务器内部错误', 500));
    }
    if (scenario === 'error') {
      return send(res, 200, fail('模拟服务异常'));
    }

    // ---- 鉴权
    if (!PUBLIC_PATHS.has(path)) {
      const header = String(req.headers.authorization || '');
      const token = header.startsWith('Bearer ') ? header.slice(7) : '';
      if (!token) {
        return send(res, 401, fail('未登录或 token 缺失', 401));
      }
      const payload = verifyToken(token);
      if (!payload) {
        return send(res, 401, fail('token 无效或已过期', 401));
      }
      req.user = payload;
    }

    // ============================================== 认证 /api/auth
    if (method === 'POST' && path === '/api/auth/register') {
      const body = await readBody(req);
      const { username, password, nickname = '', email = '' } = body;

      if (!username || !password) return send(res, 200, fail('用户名和密码不能为空'));
      if (username.length < 3 || password.length < 6) {
        return send(res, 200, fail('用户名至少 3 位，密码至少 6 位'));
      }
      if (users.some((u) => u.username === username)) {
        return send(res, 200, fail('用户名已被占用'));
      }

      const now = localDateTime();
      const item = {
        id: nextId(users), username, password, nickname, email,
        avatar: null, role_id: 2, status: 1, created_at: now, updated_at: now,
      };
      users.push(item);
      return send(res, 200, ok({ id: item.id }, '注册成功'));
    }

    if (method === 'POST' && path === '/api/auth/login') {
      const body = await readBody(req);
      const { username, password } = body;

      if (!username || !password) return send(res, 200, fail('用户名和密码不能为空'));

      const user = users.find((u) => u.username === username);
      if (!user) return send(res, 200, fail('用户名或密码错误'));
      if (user.status === 0) return send(res, 200, fail('账号已被禁用，请联系管理员'));
      if (user.password !== password) return send(res, 200, fail('用户名或密码错误'));

      return send(res, 200, ok({
        token: signToken(user),
        user: {
          id: user.id,
          username: user.username,
          nickname: user.nickname,
          email: user.email,
          avatar: user.avatar,
          role_id: user.role_id,
          role_name: roleNameOf(user.role_id),
        },
      }, '登录成功'));
    }

    if (method === 'GET' && path === '/api/auth/me') {
      const user = users.find((u) => u.id === req.user.id);
      if (!user) return send(res, 404, fail('用户不存在', 404));

      const menuRows = menusOfRole(user.role_id)
        .filter((m) => m.type === 1)
        // 真实后端是 ORDER BY sort（全表按 sort，父子混排），这里保持一致
        .sort((a, b) => a.sort - b.sort)
        .map((m) => ({
          id: m.id, parent_id: m.parent_id, name: m.name, path: m.path,
          icon: m.icon, type: m.type, permission: m.permission, sort: m.sort,
        }));

      const permissions = menusOfRole(user.role_id).map((m) => m.permission).filter(Boolean);

      const empty = scenario === 'empty';

      return send(res, 200, ok({
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        email: user.email,
        avatar: user.avatar,
        role_id: user.role_id,
        status: user.status,
        role_name: roleNameOf(user.role_id),
        menus: empty ? [] : menuRows,
        permissions: empty ? [] : permissions,
      }));
    }

    // ---------------------------------------------- 用户概览 /api/users/summary
    if (path === '/api/users/summary' && method === 'GET') {
      const toTs = (s) => (s ? new Date(String(s).replace(' ', 'T')).getTime() : 0);
      const weekAgo = Date.now() - 7 * 86400000;
      return send(res, 200, ok({
        total: users.length,
        active: users.filter((u) => u.status === 1).length,
        disabled: users.filter((u) => u.status === 0).length,
        weekNew: users.filter((u) => toTs(u.created_at) >= weekAgo).length,
      }));
    }

    // ---------------------------------------------- 批量启停 /api/users/batch/status
    if (path === '/api/users/batch/status' && method === 'PUT') {
      const body = await readBody(req);
      const status = Number(body.status);
      if (status !== 0 && status !== 1) return send(res, 200, fail('status 只能为 0 或 1'));

      const idsCheck = normalizeIds(body.ids);
      if (!idsCheck.ok) return send(res, 200, fail(idsCheck.message));

      let ids = idsCheck.ids;
      const skipped = [];
      // 不能禁用当前登录账号
      if (status === 0 && ids.includes(Number(req.user.id))) {
        ids = ids.filter((id) => id !== Number(req.user.id));
        skipped.push(Number(req.user.id));
      }
      if (!ids.length) return send(res, 200, fail('当前登录账号不能被禁用'));

      const found = users.filter((u) => ids.includes(u.id));
      const missing = ids.filter((id) => !found.some((u) => u.id === id));
      const now = localDateTime();
      found.forEach((u) => {
        u.status = status;
        u.updated_at = now;
      });

      const verb = status === 1 ? '启用' : '禁用';
      return send(res, 200, ok(
        { affected: found.length, missing, skipped },
        found.length ? `已${verb} ${found.length} 个用户` : '没有可操作的用户'
      ));
    }

    // ============================================== 用户 /api/users
    if (path === '/api/users') {
      if (method === 'GET') {
        const page = Math.max(1, Number(query.get('page')) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 10));
        const keyword = query.get('keyword') || '';
        const roleId = query.get('role_id');
        const status = query.get('status');
        const sort = query.get('sort');

        let list = users.filter((u) => {
          const hitKeyword = !keyword ||
            u.username.includes(keyword) ||
            (u.nickname || '').includes(keyword) ||
            (u.email || '').includes(keyword);
          const hitRole = !roleId || String(u.role_id) === String(roleId);
          const hitStatus = status === null || status === '' || String(u.status) === String(status);
          return hitKeyword && hitRole && hitStatus;
        });

        if (scenario === 'empty') list = [];

        // sort=recent：最近登录倒序，从未登录排最后；同格式时间字符串可直接比较
        list = list.slice().sort((a, b) => {
          if (sort === 'recent') {
            const av = a.last_login_at || '';
            const bv = b.last_login_at || '';
            if (av !== bv) return bv.localeCompare(av);
          }
          return b.id - a.id;
        });
        const total = list.length;
        const offset = (page - 1) * pageSize;

        return send(res, 200, ok({
          list: list.slice(offset, offset + pageSize).map(userToListItem),
          total,
          page,
          pageSize,
        }));
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { username, password, nickname = '', email = '', role_id } = body;

        if (!username || !password || !role_id) {
          return send(res, 200, fail('用户名、密码、角色为必填项'));
        }
        if (users.some((u) => u.username === username)) {
          return send(res, 200, fail('用户名已被占用'));
        }
        if (!roles.some((r) => r.id === Number(role_id))) {
          return send(res, 200, fail('角色不存在'));
        }

        const now = localDateTime();
        const item = {
          id: nextId(users), username, password, nickname, email,
          avatar: null, role_id: Number(role_id), status: 1, created_at: now, updated_at: now,
        };
        users.push(item);
        return send(res, 200, ok({ id: item.id }, '新增成功'));
      }
    }

    const userMatch = path.match(/^\/api\/users\/(\d+)(\/status)?$/);
    if (userMatch) {
      const id = Number(userMatch[1]);
      const withStatus = Boolean(userMatch[2]);
      const user = users.find((u) => u.id === id);

      if (withStatus && method === 'PUT') {
        const body = await readBody(req);
        const status = Number(body.status);
        if (status !== 0 && status !== 1) return send(res, 200, fail('status 只能为 0 或 1'));
        if (id === req.user.id) return send(res, 200, fail('不能禁用当前登录账号'));
        if (!user) return send(res, 404, fail('用户不存在', 404));

        user.status = status;
        user.updated_at = localDateTime();
        return send(res, 200, ok(null, '操作成功'));
      }

      if (method === 'GET') {
        if (!user) return send(res, 404, fail('用户不存在', 404));
        return send(res, 200, ok(userToDetail(user)));
      }

      if (method === 'PUT') {
        if (!user) return send(res, 404, fail('用户不存在', 404));
        const body = await readBody(req);
        const { nickname, email, role_id, password } = body;

        if (role_id !== undefined && role_id !== null) {
          if (!roles.some((r) => r.id === Number(role_id))) {
            return send(res, 200, fail('角色不存在'));
          }
        }

        if (nickname !== undefined) user.nickname = nickname;
        if (email !== undefined) user.email = email;
        if (role_id !== undefined) user.role_id = Number(role_id);
        if (password) user.password = password;
        user.updated_at = localDateTime();

        return send(res, 200, ok(null, '更新成功'));
      }

      if (method === 'DELETE') {
        if (id === req.user.id) return send(res, 200, fail('不能删除当前登录账号'));
        if (!user) return send(res, 404, fail('用户不存在', 404));
        users.splice(users.indexOf(user), 1);
        return send(res, 200, ok(null, '删除成功'));
      }
    }

    // ============================================== 角色 /api/roles
    // ---------------------------------------------- 菜单权限项 /api/menus
    if (path === '/api/menus' && method === 'GET') {
      return send(res, 200, ok(menus));
    }

    if (path === '/api/roles') {
      if (method === 'GET') {
        let list = roles.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          description: r.description,
          status: r.status ?? 1,
          icon: r.icon ?? null,
          color: r.color ?? null,
          created_at: r.created_at,
          user_count: countUsersOfRole(r.id),
          menu_count: (roleMenu[r.id] || []).length,
        }));
        if (scenario === 'empty') list = [];
        // 注意：真实后端这里返回裸数组，不是 {list,total}
        return send(res, 200, ok(list));
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { name, code, description = '', icon = null, color = null } = body;
        if (!name || !code) return send(res, 200, fail('角色名称和编码为必填项'));
        if (roles.some((r) => r.code === code)) return send(res, 200, fail('角色编码已存在'));

        const item = { id: nextId(roles), name, code, description, icon, color, status: 1, created_at: localDateTime() };
        roles.push(item);
        return send(res, 200, ok({ id: item.id }, '新增成功'));
      }
    }

    const roleMatch = path.match(/^\/api\/roles\/(\d+)(\/menus)?$/);
    if (roleMatch) {
      const id = Number(roleMatch[1]);
      const withMenus = Boolean(roleMatch[2]);
      const role = roles.find((r) => r.id === id);

      if (withMenus && method === 'GET') {
        // 真实后端不校验角色存在，不存在也返回 200 + []
        const ids = roleMenu[id] || [];
        return send(res, 200, ok(ids.slice()));
      }

      if (withMenus && method === 'PUT') {
        if (!role) return send(res, 404, fail('角色不存在', 404));
        const body = await readBody(req);
        const raw = body.menu_ids;
        const ids = Array.isArray(raw)
          ? raw.map(Number).filter((n) => Number.isInteger(n))
          : [];
        roleMenu[id] = ids;
        // 注意：ids 为空时同样返回成功（先删后插、一条不插）——与真实后端一致
        return send(res, 200, ok(null, '权限分配成功'));
      }

      if (method === 'PUT' && !withMenus) {
        if (!role) return send(res, 404, fail('角色不存在', 404));
        const body = await readBody(req);
        // 部分更新：传哪个字段改哪个（code 不可改）
        const { name, description, icon, color, status } = body;
        if (name !== undefined) role.name = name;
        if (description !== undefined) role.description = description;
        if (icon !== undefined) role.icon = icon || null;
        if (color !== undefined) role.color = color || null;
        if (status !== undefined) role.status = Number(status) === 0 ? 0 : 1;
        return send(res, 200, ok(null, '更新成功'));
      }

      if (method === 'DELETE' && !withMenus) {
        if (!role) return send(res, 404, fail('角色不存在', 404));
        if (countUsersOfRole(id) > 0) return send(res, 200, fail('该角色下仍有用户，无法删除'));
        roles.splice(roles.indexOf(role), 1);
        delete roleMenu[id];
        return send(res, 200, ok(null, '删除成功'));
      }
    }

    // ============================================== 看板 /api/dashboard
    if (method === 'GET' && path === '/api/dashboard/overview') {
      if (scenario === 'empty') {
        return send(res, 200, ok({
          today_amount: 0, today_amount_change: 0, today_qty: 0,
          total_amount: 0, total_qty: 0, user_count: 0, record_count: 0,
        }));
      }
      const today = localDate(0);
      const yesterday = localDate(-1);
      const sumOf = (date) => sales
        .filter((s) => s.sale_date === date)
        .reduce((acc, s) => ({ amount: acc.amount + s.amount, qty: acc.qty + s.qty }), { amount: 0, qty: 0 });

      const t = sumOf(today);
      const y = sumOf(yesterday);
      const total = sales.reduce((acc, s) => ({ amount: acc.amount + s.amount, qty: acc.qty + s.qty }), { amount: 0, qty: 0 });

      const change = y.amount > 0 ? Number((((t.amount - y.amount) / y.amount) * 100).toFixed(2)) : 0;

      return send(res, 200, ok({
        today_amount: Number(t.amount.toFixed(2)),
        today_amount_change: change,
        today_qty: t.qty,
        total_amount: Number(total.amount.toFixed(2)),
        total_qty: total.qty,
        user_count: users.length,
        record_count: sales.length,
      }));
    }

    if (method === 'GET' && path === '/api/dashboard/trend') {
      const days = Math.min(90, Math.max(1, Number(query.get('days')) || 30));
      const result = [];
      for (let i = days - 1; i >= 0; i--) {
        const date = localDate(-i);
        const rows = sales.filter((s) => s.sale_date === date);
        const amount = rows.reduce((a, s) => a + s.amount, 0);
        const qty = rows.reduce((a, s) => a + s.qty, 0);
        result.push({
          date,
          amount: scenario === 'empty' ? 0 : Number(amount.toFixed(2)),
          qty: scenario === 'empty' ? 0 : qty,
        });
      }
      return send(res, 200, ok(result));
    }

    if (method === 'GET' && path === '/api/dashboard/category-ratio') {
      if (scenario === 'empty') return send(res, 200, ok([]));
      const rows = categories.map((c) => ({
        name: c.name,
        value: Number(sales
          .filter((s) => s.category_id === c.id)
          .reduce((a, s) => a + s.amount, 0)
          .toFixed(2)),
      }));
      return send(res, 200, ok(rows.sort((a, b) => b.value - a.value)));
    }

    if (method === 'GET' && path === '/api/dashboard/rank') {
      if (scenario === 'empty') return send(res, 200, ok([]));
      const top = Math.min(20, Math.max(1, Number(query.get('top')) || 5));
      const rows = categories.map((c) => {
        const items = sales.filter((s) => s.category_id === c.id);
        return {
          id: c.id,
          name: c.name,
          amount: Number(items.reduce((a, s) => a + s.amount, 0).toFixed(2)),
          qty: items.reduce((a, s) => a + s.qty, 0),
        };
      });
      return send(res, 200, ok(rows.sort((a, b) => b.amount - a.amount).slice(0, top)));
    }

    // ============================================== 销售明细 /api/sales
    if (path === '/api/sales' && method === 'GET') {
      if (scenario === 'empty') {
        return send(res, 200, ok({ list: [], total: 0, page: 1, pageSize: 10 }));
      }

      const page = Math.max(1, Number(query.get('page')) || 1);
      const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 10));
      const start = query.get('start') || '';
      const end = query.get('end') || '';
      const categoryId = query.get('category_id') || '';

      let list = sales.slice();
      if (start) list = list.filter((s) => s.sale_date >= start);
      if (end) list = list.filter((s) => s.sale_date <= end);
      if (categoryId) list = list.filter((s) => String(s.category_id) === String(categoryId));

      // 日期倒序；同一天按 id 倒序，保证分页稳定
      list.sort((a, b) => {
        if (a.sale_date !== b.sale_date) return a.sale_date < b.sale_date ? 1 : -1;
        return b.id - a.id;
      });

      const total = list.length;
      const offset = (page - 1) * pageSize;
      const rows = list.slice(offset, offset + pageSize).map((s) => ({
        id: s.id,
        category_id: s.category_id,
        category_name: (categories.find((c) => c.id === s.category_id) || {}).name || '',
        amount: s.amount,
        qty: s.qty,
        order_count: s.order_count,
        refund_amount: s.refund_amount,
        sale_date: s.sale_date,
      }));

      return send(res, 200, ok({ list: rows, total, page, pageSize }));
    }

    // ============================================== 销售统计 /api/sales/stats
    if (path === '/api/sales/stats' && method === 'GET') {
      const days = Math.min(365, Math.max(1, Number(query.get('days')) || 30));
      const start = localDate(-(days - 1));
      const end = localDate(0);
      const prevStart = localDate(-(days * 2 - 1));
      const prevEnd = localDate(-days);

      const sumOf = (rows, key) => rows.reduce((a, r) => a + Number(r[key] || 0), 0);

      const curRows = sales.filter((s) => s.sale_date >= start && s.sale_date <= end);
      const prevRows = sales.filter((s) => s.sale_date >= prevStart && s.sale_date <= prevEnd);

      // 逐日补零，保证柱子连续
      const trend = [];
      for (let i = 0; i < days; i++) {
        const ds = localDate(-(days - 1 - i));
        const rows = curRows.filter((s) => s.sale_date === ds);
        trend.push({
          date: ds,
          amount: Number(sumOf(rows, 'amount').toFixed(2)),
          qty: sumOf(rows, 'qty'),
          order_count: sumOf(rows, 'order_count'),
          refund_amount: Number(sumOf(rows, 'refund_amount').toFixed(2)),
        });
      }

      const cur = {
        amount: sumOf(curRows, 'amount'),
        qty: sumOf(curRows, 'qty'),
        orderCount: sumOf(curRows, 'order_count'),
        refundAmount: sumOf(curRows, 'refund_amount'),
      };
      const prev = {
        amount: sumOf(prevRows, 'amount'),
        orderCount: sumOf(prevRows, 'order_count'),
        refundAmount: sumOf(prevRows, 'refund_amount'),
      };

      const rel = (c, p) => (p ? Number(((c - p) / p).toFixed(4)) : null);
      const aov = cur.orderCount ? cur.amount / cur.orderCount : 0;
      const pAov = prev.orderCount ? prev.amount / prev.orderCount : 0;
      const rate = cur.amount ? cur.refundAmount / cur.amount : 0;
      const pRate = prev.amount ? prev.refundAmount / prev.amount : 0;

      const catRows = categories.map((c) => {
        const rows = curRows.filter((s) => s.category_id === c.id);
        return {
          id: c.id,
          name: c.name,
          amount: sumOf(rows, 'amount'),
          orderCount: sumOf(rows, 'order_count'),
        };
      });
      catRows.sort((a, b) => b.amount - a.amount);
      const catTotal = sumOf(catRows, 'amount');

      return send(res, 200, ok({
        range: { days, start, end, prevStart, prevEnd },
        kpi: {
          amount: Number(cur.amount.toFixed(2)),
          orderCount: cur.orderCount,
          avgOrderValue: Number(aov.toFixed(2)),
          refundRate: Number(rate.toFixed(4)),
          qty: cur.qty,
          compare: {
            amount: rel(cur.amount, prev.amount),
            orderCount: rel(cur.orderCount, prev.orderCount),
            avgOrderValue: rel(aov, pAov),
            refundRate: prev.amount ? Number((rate - pRate).toFixed(4)) : null,
          },
        },
        trend,
        categories: catRows.map((c) => ({
          ...c,
          amount: Number(c.amount.toFixed(2)),
          pct: catTotal ? Number((c.amount / catTotal).toFixed(4)) : 0,
        })),
      }));
    }

    // ============================================== 商品 /api/goods
    const goodsOut = (g) => ({
      id: g.id,
      name: g.name,
      sku: g.sku,
      category: g.category,
      // 真实后端 price 是 DECIMAL → mysql2 返回字符串 "899.00"，这里保持同型
      price: Number(g.price).toFixed(2),
      stock: g.stock,
      sales: g.sales,
      status: g.status,
      image: g.image,
      description: g.description,
      created_at: g.created_at,
      updated_at: g.updated_at,
    });

    if (path === '/api/goods') {
      if (method === 'GET') {
        const page = Math.max(1, Number(query.get('page')) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 10));
        const keyword = query.get('keyword') || '';
        const category = query.get('category') || '';
        const status = query.get('status');

        let list = goods.slice();
        if (keyword) {
          list = list.filter((g) => g.name.includes(keyword) || g.sku.includes(keyword));
        }
        if (category) list = list.filter((g) => g.category === category);
        if (status !== null && status !== '') list = list.filter((g) => String(g.status) === String(status));
        list.sort((a, b) => b.id - a.id);

        const total = list.length;
        const start = (page - 1) * pageSize;
        const rows = list.slice(start, start + pageSize).map(goodsOut);
        if (scenario === 'empty') return send(res, 200, ok({ list: [], total: 0, page, pageSize }));
        return send(res, 200, ok({ list: rows, total, page, pageSize }));
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { name, sku, category = '', price, stock = 0, sales = 0, status = 1, image = null, description = '' } = body;
        if (!name || !sku) return send(res, 200, fail('商品名称和 SKU 为必填项'));
        const priceNum = Number(price);
        if (price === undefined || price === '' || !Number.isFinite(priceNum) || priceNum < 0) {
          return send(res, 200, fail('价格必须为不小于 0 的数字'));
        }
        const statusNum = Number(status);
        if (statusNum !== 0 && statusNum !== 1) return send(res, 200, fail('status 只能为 0 或 1'));
        if (goods.some((g) => g.sku === sku)) return send(res, 200, fail('SKU 已存在'));

        const item = {
          id: nextId(goods),
          name, sku, category,
          price: Math.round(priceNum * 100) / 100,
          stock: Math.max(0, Number(stock) || 0),
          sales: Math.max(0, Number(sales) || 0),
          status: statusNum,
          image,
          description,
          created_at: localDateTime(),
          updated_at: localDateTime(),
        };
        goods.push(item);
        return send(res, 200, ok({ id: item.id }, '新增成功'));
      }
    }

    if (path === '/api/goods/categories' && method === 'GET') {
      const names = [...new Set(goods.map((g) => g.category).filter(Boolean))].sort();
      return send(res, 200, ok(names));
    }

    // 批量上下架
    if (path === '/api/goods/batch/status' && method === 'PUT') {
      const body = await readBody(req);
      const idsCheck = normalizeIds(body.ids);
      if (!idsCheck.ok) return send(res, 200, fail(idsCheck.message));

      const statusNum = Number(body.status);
      if (body.status === undefined || body.status === '' || (statusNum !== 0 && statusNum !== 1)) {
        return send(res, 200, fail('status 只能为 0 或 1'));
      }

      const foundIds = idsCheck.ids.filter((id) => goods.some((g) => g.id === id));
      const missing = idsCheck.ids.filter((id) => !foundIds.includes(id));
      goods.forEach((g) => {
        if (foundIds.includes(g.id)) {
          g.status = statusNum;
          g.updated_at = localDateTime();
        }
      });

      const verb = statusNum === 1 ? '上架' : '下架';
      return send(
        res,
        200,
        ok(
          { affected: foundIds.length, missing },
          foundIds.length ? `已${verb} ${foundIds.length} 件商品` : '没有可操作的商品'
        )
      );
    }

    // 批量删除
    if (path === '/api/goods/batch-delete' && method === 'POST') {
      const body = await readBody(req);
      const idsCheck = normalizeIds(body.ids);
      if (!idsCheck.ok) return send(res, 200, fail(idsCheck.message));

      const foundIds = idsCheck.ids.filter((id) => goods.some((g) => g.id === id));
      const missing = idsCheck.ids.filter((id) => !foundIds.includes(id));
      for (let i = goods.length - 1; i >= 0; i -= 1) {
        if (foundIds.includes(goods[i].id)) goods.splice(i, 1);
      }

      return send(
        res,
        200,
        ok(
          { affected: foundIds.length, missing },
          foundIds.length ? `已删除 ${foundIds.length} 件商品` : '没有可删除的商品'
        )
      );
    }

    const goodsMatch = path.match(/^\/api\/goods\/(\d+)(\/status)?$/);
    if (goodsMatch) {
      const id = Number(goodsMatch[1]);
      const withStatus = Boolean(goodsMatch[2]);
      const item = goods.find((g) => g.id === id);

      if (!withStatus && method === 'GET') {
        if (!item) return send(res, 404, fail('商品不存在', 404));
        if (scenario === 'notfound') return send(res, 404, fail('商品不存在', 404));
        return send(res, 200, ok(goodsOut(item)));
      }

      if (withStatus && method === 'PUT') {
        const body = await readBody(req);
        const statusNum = Number(body.status);
        if (body.status === undefined || body.status === '' || (statusNum !== 0 && statusNum !== 1)) {
          return send(res, 200, fail('status 只能为 0 或 1'));
        }
        if (!item) return send(res, 404, fail('商品不存在', 404));
        item.status = statusNum;
        item.updated_at = localDateTime();
        return send(res, 200, ok(null, statusNum === 1 ? '已上架' : '已下架'));
      }

      if (!withStatus && method === 'PUT') {
        if (!item) return send(res, 404, fail('商品不存在', 404));
        const body = await readBody(req);
        const { name, sku, category, price, stock, sales, status, image, description } = body;

        if (name !== undefined && !name) return send(res, 200, fail('商品名称不能为空'));
        if (sku !== undefined) {
          if (!sku) return send(res, 200, fail('SKU 不能为空'));
          if (goods.some((g) => g.sku === sku && g.id !== id)) return send(res, 200, fail('SKU 已存在'));
        }
        if (price !== undefined) {
          const priceNum = Number(price);
          if (!Number.isFinite(priceNum) || priceNum < 0) return send(res, 200, fail('价格必须为不小于 0 的数字'));
          item.price = Math.round(priceNum * 100) / 100;
        }
        if (stock !== undefined) {
          const n = Number(stock);
          if (!Number.isFinite(n) || n < 0) return send(res, 200, fail('库存必须为不小于 0 的数字'));
          item.stock = Math.floor(n);
        }
        if (sales !== undefined) {
          const n = Number(sales);
          if (!Number.isFinite(n) || n < 0) return send(res, 200, fail('销量必须为不小于 0 的数字'));
          item.sales = Math.floor(n);
        }
        if (status !== undefined) {
          const n = Number(status);
          if (n !== 0 && n !== 1) return send(res, 200, fail('status 只能为 0 或 1'));
          item.status = n;
        }
        if (name !== undefined) item.name = name;
        if (sku !== undefined) item.sku = sku;
        if (category !== undefined) item.category = category;
        if (image !== undefined) item.image = image;
        if (description !== undefined) item.description = description;

        if ([name, sku, category, price, stock, sales, status, image, description].every((v) => v === undefined)) {
          return send(res, 200, fail('没有可更新的字段'));
        }
        item.updated_at = localDateTime();
        return send(res, 200, ok(null, '更新成功'));
      }

      if (!withStatus && method === 'DELETE') {
        if (!item) return send(res, 404, fail('商品不存在', 404));
        goods.splice(goods.indexOf(item), 1);
        return send(res, 200, ok(null, '删除成功'));
      }
    }

    // ============================================== 系统设置 /api/settings
    if (path === '/api/settings') {
      if (method === 'GET') {
        return send(res, 200, ok({ ...settings }));
      }

      if (method === 'PUT') {
        const body = await readBody(req);
        const entries = Object.entries(body).filter(([, v]) => v !== undefined);
        if (!entries.length) return send(res, 200, fail('没有可保存的设置项'));

        const next = { ...settings };
        for (const [key, value] of entries) {
          if (!(key in DEFAULT_SETTINGS)) return send(res, 200, fail(`不支持的设置项: ${key}`));
          if (key === 'systemName') {
            const v = String(value).trim();
            if (!v) return send(res, 200, fail('系统名称不能为空'));
            if (v.length > 30) return send(res, 200, fail('系统名称不能超过 30 个字'));
            next[key] = v;
          } else if (key === 'slogan') {
            const v = String(value);
            if (v.length > 50) return send(res, 200, fail('标语不能超过 50 个字'));
            next[key] = v;
          } else if (key === 'notice') {
            const v = String(value);
            if (v.length > 200) return send(res, 200, fail('公告不能超过 200 个字'));
            next[key] = v;
          } else if (key === 'themeColor') {
            const v = String(value).trim();
            if (!/^#[0-9a-fA-F]{6}$/.test(v)) return send(res, 200, fail('主题色必须是 #RRGGBB 格式'));
            next[key] = v.toUpperCase();
          } else if (key === 'siderCollapsed') {
            const n = Number(value);
            if (n !== 0 && n !== 1) return send(res, 200, fail('siderCollapsed 只能为 0 或 1'));
            next[key] = n;
          }
        }
        settings = next;
        return send(res, 200, ok({ ...settings }, '保存成功'));
      }
    }

    if (path === '/api/settings/reset' && method === 'POST') {
      settings = { ...DEFAULT_SETTINGS };
      return send(res, 200, ok({ ...settings }, '已恢复默认设置'));
    }

    // ---- 兜底 404（与真实后端 errorHandler 文案一致）
    return send(res, 404, fail(`接口不存在: ${method} ${parsedUrl.pathname}`, 404));
  } catch (err) {
    // 请求体 JSON 语法错误 → 与真实后端一致：HTTP 400 + code 400
    if (err && err.status) {
      return send(res, err.status, fail(err.message, err.status));
    }
    console.error('[mock] 未捕获异常:', err);
    return send(res, 500, fail('服务器内部错误', 500));
  }
});

server.listen(PORT, () => {
  console.log(`[mock] Mock API 已启动: http://localhost:${PORT}/api`);
  console.log('[mock] 账号: admin / 123456    operator / 123456');
  console.log('[mock] 场景: ?__scenario=empty|error|unauthorized|notfound|server-error|slow');
});
