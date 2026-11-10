# Apifox 自动化测试 — 本项目落地方案

> 目标：一条可重复执行的场景，覆盖「服务存活 → 登录 → 权限 → 用户增改启停删 → 看板」，改完后端代码跑一次就知道有没有破坏功能。
> 配套：断言脚本见 `apifox-脚本.md`；接口定义见 `api-openapi.json`。

---

## 一、前置准备（3 件事，缺一跑不通）

1. **环境**：环境管理 → 新建「本地」→ 服务(前置 URL) `http://localhost:3000`；再建「测试」指向部署地址。
2. **后端已启动**：`cd backend && npm run dev`，浏览器访问 `http://localhost:3000/api/health` 能看到 `{"code":0,...}`。
3. **Access Token（只给 CI 用，手工跑不需要）**：头像 → 账号设置 → API 访问令牌 → 新建。

---

## 二、建场景

左侧「自动化测试」→「测试场景」→ 新建，命名 `admin-dashboard 全链路`。
右上角**环境下拉选中「本地」**——不选，脚本里的 `pm.environment.set` 全部写入失败。

然后「添加步骤」→「从接口导入」，按下面顺序加 12 步（顺序即执行顺序，不能乱）。

---

## 三、步骤清单与每步要点

| # | 步骤 | 请求 | 关键动作 | 断言要点 |
| --- | --- | --- | --- | --- |
| 1 | 服务健康 | `GET /api/health` | 无鉴权 | `code=0` |
| 2 | 登录 | `POST /api/auth/login` | body `admin/123456` | `code=0`、`token` 匹配 `^eyJ`；`set token` |
| 3 | 当前用户 | `GET /api/auth/me` | 带 `Bearer {{token}}` | `code=0`、`permissions` 含 `user:list`；`set selfId` |
| 4 | 角色列表 | `GET /api/roles` | 同上 | `data` 是数组；`set roleId`（取第一个） |
| 5 | 用户列表 | `GET /api/users?page=1&pageSize=10` | 同上 | `pageSize≤100`；`set userId`（取第一条） |
| 6 | 新增用户 | `POST /api/users` | 前置脚本生成唯一用户名 | `code=0`、返回 `id`；`set createdUserId` |
| 7 | 用户详情 | `GET /api/users/{{createdUserId}}` | 路径参数用变量 | id 与变量一致 |
| 8 | 编辑用户 | `PUT /api/users/{{createdUserId}}` | 只改 nickname | `code=0` |
| 9 | 禁用用户 | `PUT /api/users/{{createdUserId}}/status` | body `{"status":0}` | `code=0`；回查 `status=0` |
| 10 | 被禁用后登录 | `POST /api/auth/login` | 用新建的账号 | `code=1`、`账号已被禁用` |
| 11 | 启用用户 | `PUT /api/users/{{createdUserId}}/status` | body `{"status":1}` | `code=0`；回查 `status=1` |
| 12 | 删除用户 | `DELETE /api/users/{{createdUserId}}` | — | `code=0`；`pm.sendRequest` 回查 404 |
| 13 | 看板概览 | `GET /api/dashboard/overview` | — | 7 字段齐全且为数字 |
| 14 | 趋势 | `GET /api/dashboard/trend?days=7` | — | 长度 7、日期连续 |
| 15 | 未登录被拒 | `GET /api/users` | 步骤设置里 Auth 选 `No Auth` | HTTP 401 + `code=401` |

> 15 步是“负向”验证里最便宜的一条：能在同一场景里证明鉴权没被绕过。注意必须在**该步骤**的 Auth 里选 `No Auth` 覆盖继承，否则会带着上一步的 token。

---

## 四、关键脚本（其余见 `apifox-脚本.md`）

### 第 2 步 登录（后置）

```js
const json = pm.response.json()
pm.test('code=0 登录成功', () => pm.expect(json.code).to.eql(0))
pm.test('token 是 JWT',    () => pm.expect(json.data.token).to.match(/^eyJ/))
pm.environment.set('token', json.data.token)
```

### 第 3 步 me（后置）

```js
const json = pm.response.json()
pm.test('code=0',            () => pm.expect(json.code).to.eql(0))
pm.test('有 user:list 权限',  () => pm.expect(json.data.permissions).to.include('user:list'))
pm.environment.set('selfId', json.data.id)
```

### 第 4 步 角色列表（后置）

```js
const json = pm.response.json()
pm.test('data 是数组', () => pm.expect(json.data).to.be.an('array'))
pm.environment.set('roleId', json.data[0].id)
```

### 第 6 步 新增用户（前置 + 后置）

前置脚本（每次生成不同用户名，避免重复跑时撞“用户名已被占用”）：

```js
const u = 'qa_' + Date.now()
pm.variables.set('newUsername', u)
pm.environment.set('newUsername', u)
```

Body：

```json
{
  "username": "{{newUsername}}",
  "password": "123456",
  "nickname": "自动化测试账号",
  "email": "{{newUsername}}@test.local",
  "role_id": {{roleId}}
}
```

> `role_id` 是数字，**不要加引号**，否则会变成字符串 `"3"` 触发类型错误。

后置脚本：

```js
const json = pm.response.json()
pm.test('code=0',   () => pm.expect(json.code).to.eql(0))
pm.test('返回 id',   () => pm.expect(json.data.id).to.be.a('number'))
pm.environment.set('createdUserId', json.data.id)
```

### 第 9 / 11 步 启停（后置，回查确认落库）

```js
const json = pm.response.json()
pm.test('code=0', () => pm.expect(json.code).to.eql(0))

const id = pm.environment.get('createdUserId')
const want = JSON.parse(pm.request.body.raw || '{}').status
pm.sendRequest({
  url: pm.environment.get('baseUrl') + '/api/users/' + id,
  method: 'GET',
  header: { Authorization: 'Bearer ' + pm.environment.get('token') }
}, (err, res) => {
  pm.test('状态已更新为 ' + want, () => pm.expect(res.json().data.status).to.eql(want))
})
```

### 第 10 步 被禁用后登录（后置）

```js
const json = pm.response.json()
pm.test('code=1',      () => pm.expect(json.code).to.eql(1))
pm.test('提示已禁用',   () => pm.expect(json.message).to.include('账号已被禁用'))
```

Body：

```json
{ "username": "{{newUsername}}", "password": "123456" }
```

### 第 12 步 删除（后置，含二次回查）

```js
const json = pm.response.json()
pm.test('code=0 删除成功', () => pm.expect(json.code).to.eql(0))

const id = pm.environment.get('createdUserId')
pm.sendRequest({
  url: pm.environment.get('baseUrl') + '/api/users/' + id,
  method: 'GET',
  header: { Authorization: 'Bearer ' + pm.environment.get('token') }
}, (err, res) => {
  pm.test('删除后应 404', () => {
    pm.expect(res.code).to.eql(404)
    pm.expect(res.json().code).to.eql(404)
  })
})
```

### 第 14 步 趋势（后置）

```js
const arr = pm.response.json().data
pm.test('长度 = 7',   () => pm.expect(arr.length).to.eql(7))
pm.test('日期连续',    () => {
  for (let i = 1; i < arr.length; i++) {
    const a = new Date(arr[i-1].date + 'T00:00:00Z')
    const b = new Date(arr[i].date + 'T00:00:00Z')
    pm.expect((b - a) / 86400000, '间隔应为 1 天').to.eql(1)
  }
})
```

---

## 五、变量流转

| 变量 | 谁写 | 谁读 |
| --- | --- | --- |
| `token` | 步 2 | 步 3–14 的 Auth |
| `selfId` | 步 3 | 「禁用自己/删除自己」负向用例 |
| `roleId` | 步 4 | 步 6 body |
| `userId` | 步 5 | 详情类手工调试 |
| `newUsername` | 步 6 前置 | 步 6 body、步 10 body |
| `createdUserId` | 步 6 后置 | 步 7–12 |
| `baseUrl` | 环境手填 | 所有接口、`pm.sendRequest` |

**顺序错一步就断链**：URL 会变成 `/api/users/undefined`，然后你可能收到 404 但以为是接口坏了。

### 5.1 与 35 步场景的变量名对照（两套别混用）

本篇是「先跑通的 15 步精简版」，变量名与 [`apifox-测试场景搭建步骤.md`](./apifox-测试场景搭建步骤.md) 的 35 步完整场景不同，**在同一个环境里混用会互相覆盖**：

| 用途 | 本篇（15 步） | 35 步场景 |
| --- | --- | --- |
| 登录 token | `token` | `token` |
| 当前用户 id | `selfId` | `adminId` |
| 当前用户角色 id | `roleId` | `adminRoleId` |
| 新增角色 id | `roleId`（复用，有风险） | `newRoleId` |
| 新增用户 id | `createdUserId` | `newUserId` |
| 新增用户前置名 | `newUsername` | `tmpUsername` |
| 注册用户名 | — | `regUsername`（+ 清理用 `regUserId`） |

建议：**先按本篇 15 步跑通**，确认后端与断言逻辑没问题；再把步骤扩到 35 步的完整场景，并**统一用 35 步那套变量名**，避免两套 id 互相污染。

---

## 六、运行与看结果

1. 场景右上「运行」→ 选环境「本地」→ 确认 15 个步骤全勾选。
2. 跑完看「测试报告」：
   - 顶部通过率、耗时、请求数；
   - 点某个失败步骤 → 「断言」标签看期望/实际，再点「实际请求」核对 header 与 body；
   - 「控制台」看变量 set 的值。
3. 报告可「导出报告」生成 HTML，便于留档或发给别人。

**判断一次“跑得对”的标准**：全绿 + 通过率 100%，且第 10、12、15 步这三条负向断言是**绿的**（它们断言的是“应该失败”）。

---

## 七、定时与 CI（可选）

- **定时**：场景页「定时任务」→ 每天/每次提交后跑（云端运行需账号有额度）。
- **CI**：场景页「CI/CD」标签 → 复制命令。命令行本质是：

```bash
npm i -g apifox-cli
export APIFOX_ACCESS_TOKEN=xxx
apifox run --access-token $APIFOX_ACCESS_TOKEN -t <场景ID> -e <环境ID> -r cli,junit,html
```

`-t` 场景 ID、`-e` 环境 ID，都能在对应页面 URL 里看到。`-r` 指定报告格式，`junit` 能被 Jenkins/GitLab 直接解析。

---

## 八、常见失败与原因

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 步 1 就失败，连接被拒 | 后端没起 / 前置 URL 有反引号 | 起服务、清掉 URL 里的反引号 |
| 步 3 起全部 401 | `token` 没提取成功或环境没选 | 看步 2 的「控制台」里有没有 token |
| 步 6 报“用户名已被占用” | 用户名写死了 | 用前置脚本 `qa_ + Date.now()` |
| 步 6 报参数错误 | `role_id` 加了引号 | 改成数字 `{{roleId}}` 不带引号 |
| 步 10 期望 code=1 却拿到 0 | 步 9 没真正禁用 | 看步 9 是否断言通过、回查状态是否为 0 |
| 步 12 回查不是 404 | 删除没生效，或 id 用错（用了 `userId` 而不是 `createdUserId`） | 核对变量名 |
| 第 2 次跑就失败 | 上轮 `createdUserId` 残留 | 场景设置里勾「运行前重置环境变量」 |
| 日期相关断言差一天 | 后端按 UTC 算 | 北京时间 0–8 点属正常，不是 bug |

---

## 九、实测排错记录（2026-11-09，18 步场景）

这一节是真实跑出来的两条失败链，症状和原因都不是猜的，照这个顺序查能一次定位。

### 9.1 请求头 `Authorization: Bearer (BearerToken)`

**症状**：健康检查、登录、`/auth/me` 三步 200 通过，其余全部 401；响应体是
`{"code":401,"message":"Token 无效或已过期"}`。

注意：**它不是"未提供 token"，而是"token 无效"**，说明 header 确实带了东西，只是值不对。

**定位**：失败步骤点开 →「实际请求」标签 → 看 Header 里的 Authorization，原样是
`Bearer (BearerToken)`。`(BearerToken)` 是 Apifox 在 Auth 值为空时贴进去的占位符文本，不是变量。

**修复**：根目录（项目节点）→ Auth/鉴权 → 类型 Bearer Token → 值填 `{{token}}`。
**只填变量名，不要手写 `Bearer`**，否则变成 `Bearer Bearer eyJ...`。

### 9.2 后置接口 404 `/api/roles/`、`/api/users/`（id 为空）

**症状**：编辑/删除/详情/启停这些带 id 的步骤全部 404，响应体
`{"code":404,"message":"接口不存在: PUT /api/roles/","data":null}` —— 注意 URL 末尾是空的。

**根因不是路径参数写错，而是上游"新增"没产出 id**：

1. 「新增角色」Body 为空 → 后端返回 `{"code":1,"message":"角色名称和编码为必填项"}`（HTTP 200）；
2. 没有 `data.id`，后置脚本里的 `pm.environment.set('roleId', j.data.id)` 存进去的是 `undefined`；
3. 后续 `{{roleId}}` 解析为空 → URL 变成 `/api/roles/` → 404。

**修复三件套（缺一不可）**：

```json
// 新增角色 Body
{"name":"QA角色","code":"qa_role"}
```

```javascript
// 新增角色 后置脚本
const j = pm.response.json();
pm.test('新增角色成功 code=0', () => pm.expect(j.code).to.eql(0));
if (j.code === 0) pm.environment.set('roleId', j.data.id);
```

```json
// 新增用户 Body（role_id 用变量，不带引号）
{
  "username": "qa_test_user",
  "password": "123456",
  "nickname": "QA测试用户",
  "email": "qa@test.com",
  "role_id": {{roleId}}
}
```

```javascript
// 新增用户 后置脚本
const j = pm.response.json();
pm.test('新增用户成功 code=0', () => pm.expect(j.code).to.eql(0));
if (j.code === 0) pm.environment.set('createdUserId', j.data.id);
```

### 9.3 新增接口返回 400（JSON 语法被变量撑坏）

**症状**：上一轮「新增用户」是 200（业务失败），改完 Body 后变成 **400**。

**原因**：`"role_id": {{roleId}}` 里 `roleId` 为空时，body 拼接结果变成 `{"role_id": }`，
JSON 语法非法，Express 的 `express.json()` 直接 400，请求根本没进控制器。

**判读口诀**：**400 = 请求体语法坏了；200 + code=1 = 进了控制器但业务校验没过；404 且 URL 尾部为空 = 上一级没产出 id。**
三种症状指向三个不同环节，不要混着改。

### 9.4 建议的验证顺序

不要改完一次性整链跑，按依赖逐段验证，失败点会立刻收敛：

1. 只跑「登录」→ 控制台确认 `token` 有值；
2. 只跑「新增角色」→ 确认 `code:0` 且环境里 `roleId` 有值；
3. 只跑「新增用户」→ 确认 `createdUserId` 有值；
4. 再整链跑，此时只剩业务断言可能红。
