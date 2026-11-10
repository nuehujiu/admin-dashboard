# Apifox 测试场景搭建步骤

> 依据：`backend/tests/apifox/postman_collection.json`（35 个请求 / 5 个分组）
> 目标：在 Apifox「自动化测试 → 测试场景」里把这 35 个请求按依赖顺序串成一条可回归的全链路。

---

## 一、开工前的三件事

### 1. 环境变量（必须，否则脚本写进去的值读不出来）

「环境管理」→ 环境 `本地`（或 `admin-dashboard`）→ 变量表里逐个建好，初始值留空即可：

| 变量名 | 初始值 | 说明 |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | 唯一前置地址，**不要带反引号、不要带引号** |
| `token` | 空 | 登录步骤写入 |
| `adminId` | 空 | 登录步骤写入（admin 自己的 id） |
| `adminRoleId` | 空 | 登录步骤写入（超级管理员角色 id） |
| `newUserId` | 空 | 新增用户步骤写入 |
| `newRoleId` | 空 | 新增角色步骤写入 |
| `regUsername` | 空 | 注册步骤的前置脚本写入 |
| `regUserId` | 空 | 注册步骤的后置脚本写入（**仅供第八节末尾的自动清理使用**；注册接口成功时直接返回 `data.id`，不需要再查一次详情） |
| `tmpUsername` | 空 | 新增用户的前置脚本写入 |
| `tmpRoleCode` | 空 | 新增角色的前置脚本写入 |

### 2. 鉴权（根目录设一次，全局生效）

左侧目录树**根节点**（项目名）→ 右侧「Auth / 鉴权」→ 类型 `Bearer Token` → 值填 `{{token}}`。

- **只填 `{{token}}`，前面不要手写 `Bearer`**，否则会变成 `Bearer Bearer eyJ...`。
- 唯一的例外是「未登录访问 /me」和「注册/登录」这类公开接口：前者必须改成 `No Auth`，否则继承到 token 就永远测不到 401。

### 3. 集合变量兼容

导入的脚本用的是 `pm.collectionVariables.set(...)`。如果跑完发现环境变量面板里没有值、后续步骤仍是 401/404，把这些脚本里的
`pm.collectionVariables` **全部替换成 `pm.environment`**，然后重新保存。这是最常见的一处迁移坑。

---

## 二、在 Apifox 里怎么搭场景

1. 左侧「自动化测试」→「测试场景」→ 新建场景，命名 `admin-dashboard 全链路 v2`。
2. 场景编辑页点「**+ 添加步骤**」→「**从接口导入**」→ 按分组勾选接口 → 确定。
   - 也可以直接在左侧接口树里把接口拖进步骤列表。
3. 按下面第四节的顺序排列；**顺序错一步就会断链**（变量还没写就被读，URL 变成 `/api/users/` 直接 404）。
4. 右侧面板设置：
   - 运行环境 = `本地`
   - 测试数据 = 不使用测试数据
   - 循环次数 = 1
   - 勾选「**运行前重置环境变量**」（否则上一轮的 id 残留会污染下一轮）
5. 保存 → 点「运行」→ 跑完看「测试报告」。

---

## 三、变量依赖链（先理解这个，顺序就不会错）

```
注册      → 写 regUsername
登录admin → 写 token / adminId / adminRoleId     ← 后面所有鉴权接口都靠 token
新增用户  → 写 tmpUsername（前置）、newUserId（后置）
新增角色  → 写 tmpRoleCode（前置）、newRoleId（后置）
```

`newUserId` / `newRoleId` 是一切带 `:id` 接口的前提；`token` 是一切鉴权接口的前提。

---

## 四、35 步执行顺序（照这个排）

### 分组 0：健康检查（1 步）

| # | 步骤名 | 请求 | 关键断言 |
| --- | --- | --- | --- |
| 1 | 健康检查 | `GET /api/health` | HTTP 200、`code=0`、`data.time` 是字符串 |

### 分组 1：认证（6 步）

| # | 步骤名 | 请求 | 关键动作 / 断言 |
| --- | --- | --- | --- |
| 2 | 注册（动态用户名） | `POST /api/auth/register` | 前置脚本写 `regUsername = 'apifox_' + Date.now()`；断言 `code=0`、`data.id > 0` |
| 3 | 重复注册（**负向**） | `POST /api/auth/register` | 同上用户名；断言 `code=1`、message 含「占用」 |
| 4 | 登录 admin（提取 token） | `POST /api/auth/login` | 断言 `code=0`、`role_name = 超级管理员`；**写入 `token` / `adminId` / `adminRoleId`** |
| 5 | 登录失败-错误密码（**负向**） | `POST /api/auth/login` | 断言 `code=1`、message 含「用户名或密码错误」 |
| 6 | 获取当前用户 /me | `GET /api/auth/me` | 断言 `username=admin`、`menus` 非空、`permissions` 含 `user:create` |
| 7 | 未登录访问 /me（**负向**） | `GET /api/auth/me` | **Auth 必须改成 No Auth**；断言 HTTP **401**、`code=401` |

### 分组 2：用户管理（13 步）

| # | 步骤名 | 请求 | 关键动作 / 断言 |
| --- | --- | --- | --- |
| 8 | 用户列表-默认分页 | `GET /api/users?page=1&pageSize=10` | `code=0`、`data.list` 是数组、`page=1`、`pageSize=10` |
| 9 | keyword 筛选 | `GET /api/users?keyword=admin` | 命中 ≥1 条、每条 username+nickname 含关键词 |
| 10 | 新增用户（提取 id） | `POST /api/users` | 前置写 `tmpUsername`；Body 里 `role_id: {{adminRoleId}}` **不带引号**；断言 `code=0`，**写入 `newUserId`** |
| 11 | 新增重复用户名（**负向**） | `POST /api/users` | 复用 `tmpUsername`；断言 `code=1`、含「占用」 |
| 12 | 用户详情 | `GET /api/users/{{newUserId}}` | `code=0`、username 与 `tmpUsername` 一致、含 `role_name`/`status` |
| 13 | 编辑用户 | `PUT /api/users/{{newUserId}}` | Body：`{"nickname":"改名了","email":"changed@test.com"}`；断言 `code=0` |
| 14 | 禁用用户 | `PUT /api/users/{{newUserId}}/status` | Body：`{"status":0}`；断言 `code=0` |
| 15 | 被禁用账号登录（**负向**） | `POST /api/auth/login` | 用 `tmpUsername` 登录；断言 `code=1`、含「禁用」 |
| 16 | 恢复启用用户 | `PUT /api/users/{{newUserId}}/status` | Body：`{"status":1}`；断言 `code=0` |
| 17 | 不能禁用自己（**负向**） | `PUT /api/users/{{adminId}}/status` | Body：`{"status":0}`；断言 `code=1`、含「不能禁用」 |
| 18 | status 非法值（**负向**） | `PUT /api/users/{{newUserId}}/status` | Body：`{"status":2}`；断言 `code=1`、含「0 或 1」 |
| 19 | 不能删除自己（**负向**） | `DELETE /api/users/{{adminId}}` | 断言 `code=1`、含「不能删除」 |
| 20 | 删除临时用户 | `DELETE /api/users/{{newUserId}}` | 断言 `code=0` |

> 第 15 步必须夹在 14 和 16 之间：先禁用才能测「禁用后登录被拒」，再恢复启用，否则临时账号一直是死的。

### 分组 3：角色管理（8 步）

| # | 步骤名 | 请求 | 关键动作 / 断言 |
| --- | --- | --- | --- |
| 21 | 角色列表 | `GET /api/roles` | `code=0`、`data` 里含 `admin` 和 `operator` |
| 22 | 新增角色（提取 id） | `POST /api/roles` | 前置写 `tmpRoleCode`；Body：`{"name":"临时角色","code":"{{tmpRoleCode}}","description":"Apifox 自动化测试"}`；断言 `code=0`，**写入 `newRoleId`** |
| 23 | 编辑角色 | `PUT /api/roles/{{newRoleId}}` | Body：`{"name":"临时角色改名","description":"改名了"}`；断言 `code=0` |
| 24 | 分配菜单权限 | `PUT /api/roles/{{newRoleId}}/menus` | Body：`{"menu_ids":[1,2,3]}`；断言 `code=0` |
| 25 | 读回菜单权限 | `GET /api/roles/{{newRoleId}}/menus` | 断言长度为 3、id 集合为 `1,2,3` |
| 26 | 清空菜单权限 | `PUT /api/roles/{{newRoleId}}/menus` | Body：`{"menu_ids":[]}`；断言 `code=0` |
| 27 | 删除仍有用户的角色（**负向**） | `DELETE /api/roles/{{adminRoleId}}` | 断言 `code=1`、含「仍有用户」 |
| 28 | 删除临时角色 | `DELETE /api/roles/{{newRoleId}}` | 断言 `code=0` |

> 第 24–26 步是「写入 → 读回 → 清空」三段，验证的是同一份数据；如果 25 读回不为 3，说明 24 没真正落库。
> 第 27 步用的 `adminRoleId` 是**内置角色**，只读不写，不会破坏数据。

### 分组 4：数据看板（6 步）

| # | 步骤名 | 请求 | 关键断言 |
| --- | --- | --- | --- |
| 29 | 概览 overview | `GET /api/dashboard/overview` | `code=0`；7 个字段均为数值且 ≥0 |
| 30 | 趋势 trend 默认 30 天 | `GET /api/dashboard/trend` | `data.length = 30`、日期升序连续 |
| 31 | 趋势 days=0 回退默认 | `GET /api/dashboard/trend?days=0` | 仍返回 30 天 |
| 32 | 分类占比 category-ratio | `GET /api/dashboard/category-ratio` | 每项含 `name`/`value`，`value ≥ 0` |
| 33 | 排行 rank 默认 TOP5 | `GET /api/dashboard/rank` | 条数 ≤ 5、按 `amount` 降序 |
| 34 | 排行 top=999 钳制为 20 | `GET /api/dashboard/rank?top=999` | 条数 ≤ 20 |

### 分组 5：通用错误（1 步）

| # | 步骤名 | 请求 | 关键断言 |
| --- | --- | --- | --- |
| 35 | 访问不存在接口（**负向**） | `GET /api/not/exist` | HTTP **404**、message 含「接口不存在」 |

---

## 五、必须人工核对脚本的五处

其他脚本集合里自带，不用动；下面五处最容易在导入后失效：

**① 登录admin — 后置脚本**
```javascript
const json = pm.response.json();
pm.test('登录成功 code=0', () => pm.expect(json.code).to.eql(0));
pm.test('角色为超级管理员', () => pm.expect(json.data.user.role_name).to.eql('超级管理员'));
pm.environment.set('token', json.data.token);
pm.environment.set('adminId', String(json.data.user.id));
pm.environment.set('adminRoleId', String(json.data.user.role_id));
```

**② 新增用户 — 前置脚本**
```javascript
pm.environment.set('tmpUsername', 'apifox_user_' + Date.now());
```

**③ 新增用户 — 后置脚本**
```javascript
const json = pm.response.json();
pm.test('新增成功 code=0', () => pm.expect(json.code).to.eql(0));
pm.environment.set('newUserId', String(json.data.id));
```

**④ 新增角色 — 前置 + 后置**
```javascript
// 前置
pm.environment.set('tmpRoleCode', 'apifox_role_' + Date.now());
// 后置
const json = pm.response.json();
pm.test('新增成功 code=0', () => pm.expect(json.code).to.eql(0));
pm.environment.set('newRoleId', String(json.data.id));
```

**⑤ 未登录访问 /me — Auth 改成 No Auth**
断言保持：`HTTP 401` + `code=401`。这一步不改 Auth 就一定红。

---

## 六、跑完怎么验收

1. **35 步全绿**，通过率 100%，耗时通常在 2–4 秒。
2. 10 条负向用例**也必须绿**（它们断言的是"应该失败"）：
   重复注册、登录失败、未登录 /me、新增重复用户名、被禁用后登录、不能禁用自己、status 非法值、不能删除自己、删除仍有用户的角色、404 接口。
3. 连跑第二次仍然全绿 —— 能连跑才是可回归。跑不绿说明有残留数据（用户名/角色编码写死了，或没勾「运行前重置环境变量」）。

---

## 七、症状 → 原因 对照表

| 症状 | 原因 | 处理 |
| --- | --- | --- |
| 第 1 步起全 401，响应「Token 无效或已过期」 | Auth 值是占位符 `(BearerToken)` 或写成了 `Bearer {{token}}` | 根目录 Auth 值只填 `{{token}}` |
| 第 1 步连接被拒 | 后端没起，或 `baseUrl` 带反引号 | 起 `npm run dev`；清掉 URL 里的 `` ` `` |
| 第 2 步登录都失败 | 数据库是空的 / 密码不对 | 确认 admin/123456 可登录 |
| 带 id 的步骤全 404，URL 尾部为空 | 上游「新增」没产出 id | 看新增步骤是否 `code=0`，后置脚本是否真的 set 了 |
| 新增接口返回 **400** | body 里 `{{变量}}` 为空，JSON 语法被撑坏（如 `"role_id": }`） | 先让上游变量有值；`role_id` 不带引号 |
| 新增返回 **200 但 code=1** | 进了控制器，业务校验没过（重名/缺字段） | 看 message，按提示补字段或用动态名称 |
| 第二次跑就红 | 用户名/角色编码写死 + 环境变量残留 | 用 `Date.now()` 动态名 + 勾「运行前重置环境变量」 |
| 未登录那步一直红 | 该请求继承了根目录 token | 该请求单独设 No Auth |
| 趋势日期差一天 | 后端按 UTC 取日期 | 北京时间 0–8 点属正常，不是 bug |

---

## 八、场景末尾自动清理（不再堆垃圾账号）

### 问题

`POST /api/auth/register` 每跑一次就往 `users` 表插一条 `apifox_时间戳`。场景里的 `newUserId`（新增用户那条）会被第 20 步删掉，但**注册出来的账号没人管**，跑十次就十具僵尸。

### 第一步：注册步骤存 id

「注册（动态用户名）」→ **后置脚本**，在原脚本后面补一行：

```javascript
pm.environment.set('regUserId', String(json.data.id));
```

（`json` 该步骤里已有定义，直接接在现有脚本末尾即可，不要重复 `const json = ...`）

### 第二步：在场景最后一步挂清理脚本（推荐）

选中场景的**最后一步**（第 35 步「访问不存在接口（应 404）」）→ **后置脚本**，粘：

```javascript
const regId = pm.environment.get('regUserId');

if (!regId) {
  console.log('[cleanup] 无 regUserId（本轮注册未成功），跳过清理');
} else {
  pm.sendRequest({
    url: pm.environment.get('baseUrl') + '/api/users/' + regId,
    method: 'DELETE',
    header: { Authorization: 'Bearer ' + pm.environment.get('token') },
  }, (err, res) => {
    if (err) {
      console.log('[cleanup] 请求失败：' + err);
      return;
    }
    const body = res.json();
    pm.test('清理注册用户 code=0', () => pm.expect(body.code).to.eql(0));
    console.log('[cleanup] 已删除注册用户 id=' + regId);
  });
}
```

**为什么挂在最后一步而不是新建步骤**：`pm.sendRequest` 可以在脚本里判断条件后决定发不发；如果做成独立请求，`regUserId` 为空时 URL 会变成 `/api/users/`，直接 404 给场景添一条假红。

### 备选：独立一步「清理-删除注册用户」

如果更想"在报告里看见这一步"，就新建请求 `DELETE {{baseUrl}}/api/users/{{regUserId}}` 放最后，前置脚本兜底：

```javascript
if (!pm.environment.get('regUserId')) {
  console.log('[cleanup] 无 regUserId，本轮跳过');
}
```

但它没法真正跳过请求，id 为空时仍会发一次并失败——所以只适合"注册必然成功"的场景。

### 验收

1. 整链跑一次，控制台出现 `[cleanup] 已删除注册用户 id=...`；
2. 跑完立刻查库：`SELECT id, username FROM users WHERE username LIKE 'apifox%';` → **0 条**；
3. 连跑两次，第二次仍然 0 条且全绿——这才叫自清理。
