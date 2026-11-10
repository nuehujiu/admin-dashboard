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
];

let seq = {
  role: 3,
  user: 3,
  goods: 13,
};

const roles = [
  { id: 1, name: '超级管理员', code: 'admin', description: '拥有全部权限', created_at: localDateTime(-30) },
  { id: 2, name: '运营', code: 'operator', description: '可查看数据看板与销售统计', created_at: localDateTime(-30) },
];

/** role_menu：admin 全量，operator 仅 1、2 */
const roleMenu = {
  1: menus.map((m) => m.id),
  2: [1, 2],
};

const users = [
  {
    id: 1, username: 'admin', password: '123456', nickname: '管理员', email: 'admin@example.com',
    avatar: null, role_id: 1, status: 1, created_at: localDateTime(-30), updated_at: localDateTime(-30),
  },
  {
    id: 2, username: 'operator', password: '123456', nickname: '运营小李', email: 'operator@example.com',
    avatar: null, role_id: 2, status: 1, created_at: localDateTime(-30), updated_at: localDateTime(-30),
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

/** 近 30 天 × 5 分类的销售记录（LCG 保证每次启动数据一致，便于截图/断言复现） */
const sales = (() => {
  let seed = 20261109;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) % 2147483648;
    return seed / 2147483648;
  };
  const list = [];
  let id = 1;
  for (let dayOffset = -29; dayOffset <= 0; dayOffset++) {
    const date = localDate(dayOffset);
    for (const c of categories) {
      const amount = Number((500 + rnd() * 8000).toFixed(2));
      const qty = 5 + Math.floor(rnd() * 80);
      list.push({ id: id++, category_id: c.id, amount, qty, sale_date: date });
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
        id: seq.user++, username, password, nickname, email,
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

    // ============================================== 用户 /api/users
    if (path === '/api/users') {
      if (method === 'GET') {
        const page = Math.max(1, Number(query.get('page')) || 1);
        const pageSize = Math.min(100, Math.max(1, Number(query.get('pageSize')) || 10));
        const keyword = query.get('keyword') || '';
        const roleId = query.get('role_id');
        const status = query.get('status');

        let list = users.filter((u) => {
          const hitKeyword = !keyword ||
            u.username.includes(keyword) ||
            (u.nickname || '').includes(keyword);
          const hitRole = !roleId || String(u.role_id) === String(roleId);
          const hitStatus = status === null || status === '' || String(u.status) === String(status);
          return hitKeyword && hitRole && hitStatus;
        });

        if (scenario === 'empty') list = [];

        list = list.slice().sort((a, b) => b.id - a.id);
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
          id: seq.user++, username, password, nickname, email,
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
    if (path === '/api/roles') {
      if (method === 'GET') {
        let list = roles.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          description: r.description,
          created_at: r.created_at,
          user_count: countUsersOfRole(r.id),
        }));
        if (scenario === 'empty') list = [];
        // 注意：真实后端这里返回裸数组，不是 {list,total}
        return send(res, 200, ok(list));
      }

      if (method === 'POST') {
        const body = await readBody(req);
        const { name, code, description = '' } = body;
        if (!name || !code) return send(res, 200, fail('角色名称和编码为必填项'));
        if (roles.some((r) => r.code === code)) return send(res, 200, fail('角色编码已存在'));

        const item = { id: seq.role++, name, code, description, created_at: localDateTime() };
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
        const { name, description } = body;
        // 真实后端不校验 name，这里保持同样行为
        role.name = name;
        role.description = description;
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
          id: seq.goods++,
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
