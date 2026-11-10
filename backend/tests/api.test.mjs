/**
 * API 自动化测试套件
 * 运行：node tests/api.test.mjs   （需先启动后端服务）
 *
 * 覆盖：健康检查 / 认证(注册、登录、me) / 用户管理 CRUD / 角色管理 CRUD / 菜单权限 / 数据看板
 * 说明：会创建带 t_api_ 前缀的临时用户与角色，用例结束前自动清理，不影响演示数据
 */
const BASE = process.env.API_BASE || 'http://localhost:3000';

// ---------- 轻量断言 ----------
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
function eq(actual, expected, label) {
  assert(
    actual === expected,
    `${label}: 期望 ${JSON.stringify(expected)}, 实际 ${JSON.stringify(actual)}`
  );
}

// ---------- HTTP 帮助函数 ----------
async function api(method, path, { body, token, rawBody } = {}) {
  const headers = {};
  if (body !== undefined && !rawBody) headers['Content-Type'] = 'application/json';
  if (rawBody) headers['Content-Type'] = 'application/json';
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(BASE + path, {
    method,
    headers,
    body: rawBody ?? (body !== undefined ? JSON.stringify(body) : undefined),
    signal: AbortSignal.timeout(10000),
  });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应（如 400 HTML） */
  }
  return { status: res.status, json, text };
}

// ---------- 测试运行器 ----------
const results = [];
let passed = 0;
let failed = 0;
async function test(name, fn) {
  const start = Date.now();
  try {
    await fn();
    passed++;
    results.push({ name, ok: true, ms: Date.now() - start });
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    results.push({ name, ok: false, ms: Date.now() - start, error: err.message });
    console.log(`  ✗ ${name}\n      └─ ${err.message}`);
  }
}

// ---------- 测试数据 ----------
const ts = Date.now().toString().slice(-8);
const regUser = `t_api_reg_${ts}`; // 注册用例
const tmpUser = `t_api_user_${ts}`; // 用户管理 CRUD 用例
const tmpRole = `t_api_role_${ts}`; // 角色管理 CRUD 用例
const regPwd = 'reg123456';
let adminToken = '';
let adminId = 0;
let adminRoleId = 0;
let operatorRoleId = 0;
let newUserId = 0;
let newRoleId = 0;
let regUserId = 0;

console.log(`\n开始测试: ${BASE}\n` + '='.repeat(60));

// ==================== 0. 健康检查 ====================
console.log('\n[0] 健康检查');
await test('GET /api/health 返回 200 且 code=0', async () => {
  const { status, json } = await api('GET', '/api/health');
  eq(status, 200, 'HTTP 状态码');
  eq(json?.code, 0, '业务码');
  assert(json?.data?.time, '缺少 data.time');
});

// ==================== 1. 认证 - 注册 ====================
console.log('\n[1] 认证 - 注册');
await test('注册成功返回用户 id', async () => {
  const { status, json } = await api('POST', '/api/auth/register', {
    body: { username: regUser, password: regPwd, nickname: '自动化测试', email: 't@t.com' },
  });
  eq(status, 200, 'HTTP 状态码');
  eq(json?.code, 0, '业务码');
  assert(json?.data?.id > 0, `data.id 应为正数, 实际 ${json?.data?.id}`);
  regUserId = json.data.id;
});
await test('重复注册被拒绝(用户名已被占用)', async () => {
  const { json } = await api('POST', '/api/auth/register', {
    body: { username: regUser, password: regPwd },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('占用'), `提示应为「用户名已被占用」, 实际「${json?.message}」`);
});
await test('用户名少于 3 位被拒绝', async () => {
  const { json } = await api('POST', '/api/auth/register', {
    body: { username: 'ab', password: '123456' },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('3 位'), `提示不正确: ${json?.message}`);
});
await test('密码少于 6 位被拒绝', async () => {
  const { json } = await api('POST', '/api/auth/register', {
    body: { username: `t_${ts}`, password: '123' },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('6 位'), `提示不正确: ${json?.message}`);
});
await test('缺少用户名/密码被拒绝', async () => {
  const { json } = await api('POST', '/api/auth/register', { body: { username: 'x_only' } });
  assert(json?.code === 1 && json?.message?.includes('不能为空'), `应拒绝: ${json?.message}`);
});

// ==================== 2. 认证 - 登录 ====================
console.log('\n[2] 认证 - 登录与鉴权');
await test('admin 登录成功返回 token 与角色', async () => {
  const { json } = await api('POST', '/api/auth/login', {
    body: { username: 'admin', password: '123456' },
  });
  eq(json?.code, 0, '业务码');
  assert(json?.data?.token?.length > 20, 'token 缺失或过短');
  eq(json?.data?.user?.role_name, '超级管理员', '角色名');
  adminToken = json.data.token;
  adminId = json.data.user.id;
  adminRoleId = json.data.user.role_id;
});
await test('operator 登录成功', async () => {
  const { json } = await api('POST', '/api/auth/login', {
    body: { username: 'operator', password: '123456' },
  });
  eq(json?.code, 0, '业务码');
  eq(json?.data?.user?.role_name, '运营', '角色名');
});
await test('注册用户可登录且默认分配「运营」角色', async () => {
  const { json } = await api('POST', '/api/auth/login', {
    body: { username: regUser, password: regPwd },
  });
  eq(json?.code, 0, '业务码');
  eq(json?.data?.user?.role_name, '运营', '注册默认角色');
});
await test('密码错误登录失败', async () => {
  const { json } = await api('POST', '/api/auth/login', {
    body: { username: 'admin', password: 'wrong_pass' },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('用户名或密码错误'), `提示不正确: ${json?.message}`);
});
await test('不存在的用户登录失败', async () => {
  const { json } = await api('POST', '/api/auth/login', {
    body: { username: 'no_such_user_x', password: '123456' },
  });
  eq(json?.code, 1, '业务码');
});
await test('缺少参数登录失败', async () => {
  const { json } = await api('POST', '/api/auth/login', { body: { username: 'admin' } });
  assert(json?.code === 1 && json?.message?.includes('不能为空'), `应拒绝: ${json?.message}`);
});
await test('未携带 token 访问 /me 返回 401', async () => {
  const { status, json } = await api('GET', '/api/auth/me');
  eq(status, 401, 'HTTP 状态码');
  eq(json?.code, 401, '业务码');
});
await test('无效 token 访问 /me 返回 401', async () => {
  const { status, json } = await api('GET', '/api/auth/me', { token: 'invalid.token.xxx' });
  eq(status, 401, 'HTTP 状态码');
  eq(json?.code, 401, '业务码');
});
await test('携带有效 token 访问 /me 返回用户+菜单+权限', async () => {
  const { status, json } = await api('GET', '/api/auth/me', { token: adminToken });
  eq(status, 200, 'HTTP 状态码');
  eq(json?.code, 0, '业务码');
  eq(json?.data?.username, 'admin', '用户名');
  assert(Array.isArray(json?.data?.menus) && json.data.menus.length > 0, 'menus 应非空数组');
  assert(
    Array.isArray(json?.data?.permissions) && json.data.permissions.includes('user:create'),
    'permissions 应包含 user:create'
  );
});

// ==================== 3. 用户管理 ====================
console.log('\n[3] 用户管理');
await test('未登录访问用户列表返回 401', async () => {
  const { status, json } = await api('GET', '/api/users');
  eq(status, 401, 'HTTP 状态码');
  eq(json?.code, 401, '业务码');
});
await test('用户列表默认分页结构正确', async () => {
  const { json } = await api('GET', '/api/users?page=1&pageSize=10', { token: adminToken });
  eq(json?.code, 0, '业务码');
  assert(Array.isArray(json?.data?.list), 'data.list 应为数组');
  assert(json?.data?.total >= 3, `total 应 >= 3, 实际 ${json?.data?.total}`);
  eq(json?.data?.page, 1, 'page');
  eq(json?.data?.pageSize, 10, 'pageSize');
});
await test('pageSize=2 分页生效', async () => {
  const { json } = await api('GET', '/api/users?page=1&pageSize=2', { token: adminToken });
  assert(json?.data?.list.length <= 2, `list 长度应 <= 2, 实际 ${json?.data?.list.length}`);
  eq(json?.data?.pageSize, 2, 'pageSize');
});
await test('keyword 筛选生效', async () => {
  const { json } = await api('GET', '/api/users?keyword=admin', { token: adminToken });
  eq(json?.code, 0, '业务码');
  assert(json?.data?.list.length >= 1, 'keyword=admin 应至少命中 admin');
  for (const u of json.data.list) {
    assert(
      u.username.includes('admin') || (u.nickname || '').includes('admin'),
      `结果不含关键词: ${u.username}`
    );
  }
});
await test('新增用户成功', async () => {
  const { json } = await api('POST', '/api/users', {
    token: adminToken,
    body: { username: tmpUser, password: 'tmp123456', nickname: '临时用户', email: 'tmp@t.com', role_id: adminRoleId },
  });
  eq(json?.code, 0, '业务码');
  assert(json?.data?.id > 0, '应返回新用户 id');
  newUserId = json.data.id;
});
await test('新增重复用户名被拒绝', async () => {
  const { json } = await api('POST', '/api/users', {
    token: adminToken,
    body: { username: tmpUser, password: 'x123456', role_id: adminRoleId },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('占用'), `提示不正确: ${json?.message}`);
});
await test('新增缺少必填项被拒绝', async () => {
  const { json } = await api('POST', '/api/users', {
    token: adminToken,
    body: { username: `t_no_role_${ts}`, password: 'x123456' },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('必填'), `提示不正确: ${json?.message}`);
});
await test('用户详情返回完整字段', async () => {
  const { json } = await api('GET', `/api/users/${newUserId}`, { token: adminToken });
  eq(json?.code, 0, '业务码');
  eq(json?.data?.username, tmpUser, 'username');
  assert('role_name' in json.data, '缺少 role_name');
  assert('status' in json.data, '缺少 status');
});
await test('查询不存在用户返回 404', async () => {
  const { status, json } = await api('GET', '/api/users/999999', { token: adminToken });
  eq(status, 404, 'HTTP 状态码');
  eq(json?.code, 404, '业务码');
});
await test('编辑用户昵称与邮箱成功并生效', async () => {
  const { json } = await api('PUT', `/api/users/${newUserId}`, {
    token: adminToken,
    body: { nickname: '改名了', email: 'changed@t.com' },
  });
  eq(json?.code, 0, '业务码');
  const detail = await api('GET', `/api/users/${newUserId}`, { token: adminToken });
  eq(detail.json?.data?.nickname, '改名了', '昵称未生效');
  eq(detail.json?.data?.email, 'changed@t.com', '邮箱未生效');
});
await test('编辑用户密码后可用新密码登录', async () => {
  const { json } = await api('PUT', `/api/users/${newUserId}`, {
    token: adminToken,
    body: { password: 'newpass123' },
  });
  eq(json?.code, 0, '业务码');
  const login = await api('POST', '/api/auth/login', {
    body: { username: tmpUser, password: 'newpass123' },
  });
  eq(login.json?.code, 0, '新密码登录');
});
await test('编辑时指定不存在的角色被拒绝', async () => {
  const { json } = await api('PUT', `/api/users/${newUserId}`, {
    token: adminToken,
    body: { role_id: 999999 },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('角色不存在'), `提示不正确: ${json?.message}`);
});
await test('编辑不存在用户返回 404', async () => {
  const { status, json } = await api('PUT', '/api/users/999999', {
    token: adminToken,
    body: { nickname: 'x' },
  });
  eq(status, 404, 'HTTP 状态码');
});
await test('不能禁用当前登录账号', async () => {
  const { json } = await api('PUT', `/api/users/${adminId}/status`, {
    token: adminToken,
    body: { status: 0 },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('不能禁用'), `提示不正确: ${json?.message}`);
});
await test('status 传非法值被拒绝', async () => {
  const { json } = await api('PUT', `/api/users/${newUserId}/status`, {
    token: adminToken,
    body: { status: 2 },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('0 或 1'), `提示不正确: ${json?.message}`);
});
await test('禁用用户成功，被禁用账号无法登录', async () => {
  const { json } = await api('PUT', `/api/users/${newUserId}/status`, {
    token: adminToken,
    body: { status: 0 },
  });
  eq(json?.code, 0, '禁用操作');
  const login = await api('POST', '/api/auth/login', {
    body: { username: tmpUser, password: 'newpass123' },
  });
  eq(login.json?.code, 1, '禁用后登录业务码');
  assert(login.json?.message?.includes('禁用'), `提示不正确: ${login.json?.message}`);
});
await test('status=0 筛选能查出被禁用用户', async () => {
  const { json } = await api('GET', `/api/users?keyword=${tmpUser}&status=0`, { token: adminToken });
  eq(json?.code, 0, '业务码');
  assert(json?.data?.list.length >= 1, '应至少查到 1 条禁用用户');
  for (const u of json.data.list) eq(u.status, 0, '筛选结果 status');
});
await test('恢复启用后可重新登录', async () => {
  const { json } = await api('PUT', `/api/users/${newUserId}/status`, {
    token: adminToken,
    body: { status: 1 },
  });
  eq(json?.code, 0, '启用操作');
  const login = await api('POST', '/api/auth/login', {
    body: { username: tmpUser, password: 'newpass123' },
  });
  eq(login.json?.code, 0, '重新登录');
});
await test('启停不存在用户返回 404', async () => {
  const { status } = await api('PUT', '/api/users/999999/status', {
    token: adminToken,
    body: { status: 0 },
  });
  eq(status, 404, 'HTTP 状态码');
});
await test('不能删除当前登录账号', async () => {
  const { json } = await api('DELETE', `/api/users/${adminId}`, { token: adminToken });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('不能删除'), `提示不正确: ${json?.message}`);
});
await test('删除不存在用户返回 404', async () => {
  const { status } = await api('DELETE', '/api/users/999999', { token: adminToken });
  eq(status, 404, 'HTTP 状态码');
});
await test('删除临时用户成功，详情变为 404', async () => {
  const { json } = await api('DELETE', `/api/users/${newUserId}`, { token: adminToken });
  eq(json?.code, 0, '删除操作');
  const detail = await api('GET', `/api/users/${newUserId}`, { token: adminToken });
  eq(detail.status, 404, '删除后详情');
});
await test('已删除用户登录失败', async () => {
  const { json } = await api('POST', '/api/auth/login', {
    body: { username: tmpUser, password: 'newpass123' },
  });
  eq(json?.code, 1, '业务码');
});

// ==================== 4. 角色管理 ====================
console.log('\n[4] 角色管理');
await test('角色列表包含内置 admin/operator 角色', async () => {
  const { json } = await api('GET', '/api/roles', { token: adminToken });
  eq(json?.code, 0, '业务码');
  const codes = json?.data?.map((r) => r.code);
  assert(codes.includes('admin') && codes.includes('operator'), `内置角色缺失: ${codes}`);
  const admin = json.data.find((r) => r.code === 'admin');
  assert(typeof admin.user_count === 'number', '缺少 user_count 字段');
});
await test('新增角色成功', async () => {
  const { json } = await api('POST', '/api/roles', {
    token: adminToken,
    body: { name: '临时角色', code: tmpRole, description: '自动化测试用' },
  });
  eq(json?.code, 0, '业务码');
  assert(json?.data?.id > 0, '应返回新角色 id');
  newRoleId = json.data.id;
});
await test('重复角色编码被拒绝', async () => {
  const { json } = await api('POST', '/api/roles', {
    token: adminToken,
    body: { name: '重复角色', code: tmpRole },
  });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('已存在'), `提示不正确: ${json?.message}`);
});
await test('新增缺少必填项被拒绝', async () => {
  const { json } = await api('POST', '/api/roles', {
    token: adminToken,
    body: { name: '只有名字' },
  });
  eq(json?.code, 1, '业务码');
});
await test('编辑角色成功并生效', async () => {
  const { json } = await api('PUT', `/api/roles/${newRoleId}`, {
    token: adminToken,
    body: { name: '临时角色改名', description: '改过了' },
  });
  eq(json?.code, 0, '业务码');
  const list = await api('GET', '/api/roles', { token: adminToken });
  const role = list.json?.data?.find((r) => r.id === newRoleId);
  eq(role?.name, '临时角色改名', '角色名未生效');
});
await test('编辑不存在角色返回 404', async () => {
  const { status } = await api('PUT', '/api/roles/999999', {
    token: adminToken,
    body: { name: 'x' },
  });
  eq(status, 404, 'HTTP 状态码');
});
await test('获取 admin 角色菜单权限列表', async () => {
  const { json } = await api('GET', `/api/roles/${adminRoleId}/menus`, { token: adminToken });
  eq(json?.code, 0, '业务码');
  assert(Array.isArray(json?.data) && json.data.length > 0, 'admin 角色菜单应为非空数组');
});
await test('分配菜单权限后可读回一致', async () => {
  const { json } = await api('PUT', `/api/roles/${newRoleId}/menus`, {
    token: adminToken,
    body: { menu_ids: [1, 2, 3] },
  });
  eq(json?.code, 0, '分配操作');
  const read = await api('GET', `/api/roles/${newRoleId}/menus`, { token: adminToken });
  const got = [...read.json?.data].sort().join(',');
  eq(got, '1,2,3', '读回的菜单 ID');
});
await test('传空数组清空菜单权限', async () => {
  const { json } = await api('PUT', `/api/roles/${newRoleId}/menus`, {
    token: adminToken,
    body: { menu_ids: [] },
  });
  eq(json?.code, 0, '清空操作');
  const read = await api('GET', `/api/roles/${newRoleId}/menus`, { token: adminToken });
  eq(read.json?.data?.length, 0, '清空后菜单数');
});
await test('向不存在角色分配菜单返回 404', async () => {
  const { status } = await api('PUT', '/api/roles/999999/menus', {
    token: adminToken,
    body: { menu_ids: [1] },
  });
  eq(status, 404, 'HTTP 状态码');
});
await test('删除仍有用户的角色被拒绝', async () => {
  const { json } = await api('DELETE', `/api/roles/${adminRoleId}`, { token: adminToken });
  eq(json?.code, 1, '业务码');
  assert(json?.message?.includes('仍有用户'), `提示不正确: ${json?.message}`);
});
await test('删除不存在角色返回 404', async () => {
  const { status } = await api('DELETE', '/api/roles/999999', { token: adminToken });
  eq(status, 404, 'HTTP 状态码');
});
await test('删除空角色成功', async () => {
  const { json } = await api('DELETE', `/api/roles/${newRoleId}`, { token: adminToken });
  eq(json?.code, 0, '业务码');
});
await test('已删除角色的菜单接口返回空数组', async () => {
  const { json } = await api('GET', `/api/roles/${newRoleId}/menus`, { token: adminToken });
  eq(json?.code, 0, '业务码');
  eq(json?.data?.length, 0, '菜单数');
});

// ==================== 5. 数据看板 ====================
console.log('\n[5] 数据看板');
await test('未登录访问看板返回 401', async () => {
  const { status, json } = await api('GET', '/api/dashboard/overview');
  eq(status, 401, 'HTTP 状态码');
  eq(json?.code, 401, '业务码');
});
await test('overview 概览字段完整且为数值', async () => {
  const { json } = await api('GET', '/api/dashboard/overview', { token: adminToken });
  eq(json?.code, 0, '业务码');
  for (const key of [
    'today_amount', 'today_amount_change', 'today_qty',
    'total_amount', 'total_qty', 'user_count', 'record_count',
  ]) {
    assert(typeof json?.data?.[key] === 'number', `字段 ${key} 应为数值`);
    assert(json.data[key] >= 0, `字段 ${key} 不应为负`);
  }
});
await test('trend 默认返回 30 天且日期连续升序', async () => {
  const { json } = await api('GET', '/api/dashboard/trend', { token: adminToken });
  eq(json?.code, 0, '业务码');
  eq(json?.data?.length, 30, '天数');
  const dates = json.data.map((r) => r.date);
  for (let i = 1; i < dates.length; i++) {
    assert(dates[i] > dates[i - 1], `日期应升序: ${dates[i - 1]} -> ${dates[i]}`);
  }
  const first = json.data[0];
  assert(typeof first.amount === 'number' && typeof first.qty === 'number', '字段类型错误');
});
await test('trend days=7 返回 7 天', async () => {
  const { json } = await api('GET', '/api/dashboard/trend?days=7', { token: adminToken });
  eq(json?.data?.length, 7, '天数');
});
await test('trend days=0 回退默认 30 天(0 被视为未传)', async () => {
  const { json } = await api('GET', '/api/dashboard/trend?days=0', { token: adminToken });
  eq(json?.data?.length, 30, '天数');
});
await test('trend days=-5 被钳制为 1 天', async () => {
  const { json } = await api('GET', '/api/dashboard/trend?days=-5', { token: adminToken });
  eq(json?.data?.length, 1, '天数');
});
await test('trend days=500 被钳制为 90 天', async () => {
  const { json } = await api('GET', '/api/dashboard/trend?days=500', { token: adminToken });
  eq(json?.data?.length, 90, '天数');
});
await test('category-ratio 返回 {name,value} 数组', async () => {
  const { json } = await api('GET', '/api/dashboard/category-ratio', { token: adminToken });
  eq(json?.code, 0, '业务码');
  assert(Array.isArray(json?.data), 'data 应为数组');
  for (const item of json.data) {
    assert(typeof item.name === 'string', '缺少 name');
    assert(typeof item.value === 'number' && item.value >= 0, `value 异常: ${item.value}`);
  }
});
await test('rank 默认 TOP5', async () => {
  const { json } = await api('GET', '/api/dashboard/rank', { token: adminToken });
  eq(json?.code, 0, '业务码');
  assert(json?.data?.length <= 5, `默认应 <= 5 条, 实际 ${json?.data?.length}`);
  for (let i = 1; i < json.data.length; i++) {
    assert(json.data[i].amount <= json.data[i - 1].amount, '排行应按金额降序');
  }
});
await test('rank top=3 生效', async () => {
  const { json } = await api('GET', '/api/dashboard/rank?top=3', { token: adminToken });
  assert(json?.data?.length <= 3, `应 <= 3 条, 实际 ${json?.data?.length}`);
});
await test('rank top=999 被钳制为 20', async () => {
  const { json } = await api('GET', '/api/dashboard/rank?top=999', { token: adminToken });
  assert(json?.data?.length <= 20, `应 <= 20 条, 实际 ${json?.data?.length}`);
});
await test('rank top=非法值回退默认 5', async () => {
  const { json } = await api('GET', '/api/dashboard/rank?top=abc', { token: adminToken });
  assert(json?.data?.length <= 5, `应 <= 5 条, 实际 ${json?.data?.length}`);
});

// ==================== 6. 通用错误处理 ====================
console.log('\n[6] 通用错误处理');
await test('访问不存在的接口返回 404', async () => {
  const { status, json } = await api('GET', '/api/not/exist', { token: adminToken });
  eq(status, 404, 'HTTP 状态码');
  assert(json?.message?.includes('接口不存在'), `提示不正确: ${json?.message}`);
});
await test('非法 JSON 请求体返回 400', async () => {
  const { status } = await api('POST', '/api/auth/login', { rawBody: '{bad json' });
  eq(status, 400, 'HTTP 状态码');
});

// ==================== 汇总 ====================
console.log('\n' + '='.repeat(60));
const total = passed + failed;
const rate = total ? ((passed / total) * 100).toFixed(1) : '0.0';
console.log(`测试完成: 共 ${total} 个用例, 通过 ${passed}, 失败 ${failed}, 通过率 ${rate}%`);
const failures = results.filter((r) => !r.ok);
if (failures.length) {
  console.log('\n失败用例:');
  for (const f of failures) console.log(`  ✗ ${f.name}\n      └─ ${f.error}`);
}
console.log('='.repeat(60) + '\n');

// 输出 JSON 报告，供 CI / 归档使用
import { writeFileSync } from 'node:fs';
writeFileSync(
  new URL('./report.json', import.meta.url),
  JSON.stringify(
    {
      base: BASE,
      time: new Date().toISOString(),
      summary: { total, passed, failed, passRate: `${rate}%` },
      results,
    },
    null,
    2
  )
);
console.log('JSON 报告已写入 tests/report.json');
process.exit(failed ? 1 : 0);
