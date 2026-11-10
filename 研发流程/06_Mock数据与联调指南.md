# Mock 数据与联调指南 — admin-dashboard（代号 houtai）

| 项 | 内容 |
| --- | --- |
| 文档版本 | v2.1（2026-11-10 商品 / 设置已后端化，Mock 同步补齐） |
| 更新日期 | 2026-11-10 |
| 读者 | 前端开发、联调与提测 |
| Mock 文件 | [`../mock/mock-server.js`](../mock/mock-server.js)（零依赖，单文件，30 个接口） |

> v1.0 的 Mock 复刻的是旧契约（`/api/login`、`msg` 字段、会员用户），**与本仓库后端不同构**。
> v2.0 起 Mock 与 `backend/` **接口形状、状态码、错误文案逐条一致**：只改 proxy 端口就能切换。
> v2.1（2026-11-10）商品与系统设置**已补真实后端**，原来的「前端内存 Mock / localStorage」模式作废，见 §4 的 FE-5、FE-9。

---

## 1. 三种开发模式

| 模式 | 适用 | 做法 | 数据 |
| --- | --- | --- | --- |
| A 真实后端 | 联调、验收、**商品/设置已可用** | 启 `backend`（3000）→ 前端 proxy 指向 3000 | MySQL 真库 |
| B Mock 服务（本文重点） | 不想装 MySQL、造边界数据、演示 | 启 `mock/mock-server.js`（3001）→ proxy 指向 3001 | 内存，重启即复位 |
| C 页面内存 Mock | **已无模块使用**（商品、设置均已后端化） | — | — |

> A 与 B **不要同时占同一个端口**。C 模式保留仅为历史说明：现在所有业务接口都有后端，**不要在 `src/api` 里再留假数据文件**。

---

## 2. 启动 Mock

```powershell
# 仓库根目录，任意 Node，无需 npm install
node mock/mock-server.js

# 端口被占 / 想并行跑真实后端时
$env:MOCK_PORT=3002; node mock/mock-server.js

# 全局模拟慢网络（毫秒），测 loading
$env:MOCK_LATENCY=800; node mock/mock-server.js
```

启动后自检：

```powershell
Invoke-RestMethod http://localhost:3001/api/health
# → code=0，data.time 为 ISO 时间
```

前端切换（`vite.config.js`）：

```js
server: { port: 5173, proxy: { '/api': { target: 'http://localhost:3001', changeOrigin: true } } }
```

**内置账号**：`admin / 123456`（超级管理员）、`operator / 123456`（运营，只有 2 个菜单）。
Mock 的 token 形如 `mock.<base64url>`，同样走 `Authorization: Bearer`，同样会 401 —— 前端的鉴权分支能真实验证。

---

## 3. 场景模拟（造边界数据）

Query 或 Header 二选一：

| 方式 | 效果 | 用于 |
| --- | --- | --- |
| `?__scenario=empty` | 列表类返回空集（users 列表、roles 列表、dashboard 全 0、`me` 的 menus/permissions 为空） | 空态、无权限态 |
| `?__scenario=error` | HTTP 200 + `{code:1,message:'模拟服务异常'}` | 业务错误提示（验证"HTTP 200 也是失败"） |
| `?__scenario=unauthorized` | HTTP 401 + `{code:401}` | 登录过期跳转 |
| `?__scenario=notfound` | HTTP 404 + `{code:404}` | 不存在分支 |
| `?__scenario=server-error` | HTTP 500 | 服务异常兜底 |
| `?__scenario=slow` | 延迟 1200ms | 按钮 loading / 骨架屏 |
| Header `X-Mock-Scenario: empty` | 同上 | 不想改 URL 时 |

示例：

```
GET /api/users?page=1&pageSize=10&__scenario=empty
GET /api/dashboard/trend?days=30&__scenario=slow
GET /api/auth/me?__scenario=empty        # 验证 operator 之外"零菜单"的降级表现
```

> `/api/health` 不受场景影响，永远正常返回——前端探活不会被"故障演练"干扰。

---

## 4. Mock 种子数据（对照速查）

### 4.1 账号与角色

| id | username | password | nickname | role_id | role_name | status |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | admin | 123456 | 管理员 | 1 | 超级管理员 | 1 |
| 2 | operator | 123456 | 运营小李 | 2 | 运营 | 1 |

角色：`1 超级管理员 / admin`（user_count=1）、`2 运营 / operator`（user_count=1）。

### 4.2 菜单（13 条，与 `sql/init.js` 一致）

`1 数据看板 /dashboard`、`2 销售统计 /sales`、`3 系统管理 /system`、`4 用户管理 /system/users`、`5 角色管理 /system/roles`，
按钮：`6 新增用户`、`7 编辑用户`、`8 删除用户`、`9 新增角色`、`10 编辑角色`、`11 删除角色`。

授权：role 1 → 全部 13 条；role 2 → 仅 1、2。

### 4.3 分类与销售

分类 5 个：电子产品、服饰鞋包、家居生活、美妆个护、食品生鲜。
`sales`：近 30 天 × 5 分类 = 150 条，金额 500–8500、销量 5–84。用固定随机种子生成，**每次启动数据一致**，方便截图对比与断言复现。

### 4.4 关键响应样例

**登录成功**

```json
{ "code":0,"message":"登录成功",
  "data": {
    "token":"mock.eyJpZCI6MSwidXNlcm5hbWUiOiJhZG1pbiIs...",
    "user": { "id":1,"username":"admin","nickname":"管理员","email":"admin@example.com",
              "avatar":null,"role_id":1,"role_name":"超级管理员" } } }
```

**登录失败**（HTTP 200）

```json
{ "code":1,"message":"用户名或密码错误","data":null }
```

**`GET /api/auth/me`（admin）**

```json
{ "code":0,"message":"ok",
  "data": { "id":1,"username":"admin","nickname":"管理员","email":"admin@example.com",
            "avatar":null,"role_id":1,"status":1,"role_name":"超级管理员",
            "menus":[ {"id":1,"parent_id":0,"name":"数据看板","path":"/dashboard","icon":"dashboard",
                       "type":1,"permission":"dashboard:view","sort":1}, ... 共 5 条 ],
            "permissions":["dashboard:view","sales:view","user:list","role:list",
                           "user:create","user:update","user:delete",
                           "role:create","role:update","role:delete"] } }
```

（`系统管理` 的 permission 为 `null`，所以 permissions 是 10 条。）

**`GET /api/users`**

```json
{ "code":0,"message":"ok",
  "data": { "list":[
      { "id":2,"username":"operator","nickname":"运营小李","email":"operator@example.com",
        "avatar":null,"role_id":2,"role_name":"运营","status":1,"created_at":"2026-11-10 10:12:03" } ],
    "total":2,"page":1,"pageSize":10 } }
```

**`GET /api/roles`（裸数组）**

```json
{ "code":0,"message":"ok","data":[
  { "id":1,"name":"超级管理员","code":"admin","description":"拥有全部权限",
    "created_at":"2026-11-10 10:12:03","user_count":1 },
  { "id":2,"name":"运营","code":"operator","description":"可查看数据看板与销售统计",
    "created_at":"2026-11-10 10:12:03","user_count":1 } ] }
```

**`GET /api/roles/1/menus`**

```json
{ "code":0,"message":"ok","data":[1,2,3,4,5,6,7,8,9,10,11] }
```

**`GET /api/dashboard/overview`**

```json
{ "code":0,"message":"ok",
  "data": { "today_amount":15950.81,"today_amount_change":-24.97,"today_qty":213,
            "total_amount":1286940.22,"total_qty":28471,"user_count":2,"record_count":150 } }
```

**`GET /api/dashboard/trend?days=7`**

```json
{ "code":0,"message":"ok",
  "data":[ { "date":"2026-11-04","amount":9120.5,"qty":78 }, ..., { "date":"2026-11-10","amount":15950.81,"qty":213 } ] }
```

---

### 4.5 商品与系统设置种子（2026-11-10 新增，Mock 与后端逐条一致）

**12 条商品**（`stock=0` 的那条同时 `status=0`，专门用来验证「售罄 ≠ 下架」）

| id | name | sku | category | price(字符串) | stock | sales | status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 无线蓝牙耳机 Pro | SKU-EAR-001 | 电子产品 | "899.00" | 120 | 320 | 1 |
| 2 | 144Hz 电竞显示器 | SKU-MON-002 | 电子产品 | "1599.00" | 45 | 210 | 1 |
| 3 | 机械键盘 87 键 | SKU-KBD-003 | 电子产品 | "329.00" | 260 | 980 | 1 |
| 4 | 纯棉圆领 T 恤 | SKU-TSH-004 | 服饰鞋包 | "89.00" | 800 | 1560 | 1 |
| 5 | 轻量跑步鞋 | SKU-SHO-005 | 服饰鞋包 | "469.00" | 320 | 640 | 1 |
| 6 | 北欧风棉麻抱枕 | SKU-HOM-006 | 家居生活 | "79.00" | 500 | 430 | 1 |
| 7 | 可折叠收纳箱 | SKU-HOM-007 | 家居生活 | "59.00" | 900 | 1120 | 1 |
| 8 | 氨基酸洁面乳 | SKU-BEA-008 | 美妆个护 | "119.00" | 300 | 760 | 1 |
| 9 | 修护精华水 200ml | SKU-BEA-009 | 美妆个护 | "259.00" | 150 | 380 | 1 |
| 10 | 冷萃咖啡液 10 条装 | SKU-FOD-010 | 食品生鲜 | "99.00" | 2000 | 3400 | 1 |
| 11 | 每日坚果 30 包 | SKU-FOD-011 | 食品生鲜 | "139.00" | 1200 | 2100 | 1 |
| 12 | 智能手环 5 代 | SKU-EAR-012 | 电子产品 | "299.00" | **0** | 520 | **0** |

- `categories` 接口返回去重后的 5 个分类：`电子产品 / 服饰鞋包 / 家居生活 / 美妆个护 / 食品生鲜`；
- 新增商品返回 `{id}`，Mock 里是自增 id（种子 12 条 → 下一条 13），重启复位；
- `description` 统一为「`名称` —— 演示数据」，`image` 全为 `null`。

**系统设置默认值**（5 个键）

| key | 默认值 |
| --- | --- |
| systemName | 电商后台管理系统 |
| slogan | 用数据驱动每一次增长 |
| notice | （空串） |
| themeColor | #F5611D |
| siderCollapsed | 0（字符串存库，接口返回 **Number** 0） |

---

## 5. 分页面联调注意事项

### FE-1 登录页 `/login`

- 本地先校验非空；提交中按钮 `loading` 且禁用。
- 成功后：`setAuth({token,user})` → **立刻再调 `GET /api/auth/me`** 取 `menus`/`permissions`（登录接口不返回这两项）。
- 失败：捕获 `Error.message`，弹「用户名或密码错误」「账号已被禁用，请联系管理员」。
- 未登录访问受保护路由 → 跳 `/login`；`token` 存在但 `me` 返回 401 → 清 store 再跳。

### FE-2 主框架 Layout

- 侧栏用 `me.menus` 建树（`buildMenuTree`），**不要**写死菜单。
- ⚠️ `menus` 是**按 `sort` 全表排序的扁平数组**，父子会混排（`用户管理` 可能排在 `系统管理` 前），建树必须按 `parent_id` 分组，**不能靠数组顺序拼层级**。
- 用户信息用 `me`；角色标签用 `role_name`。
- `operator` 登录后侧栏只有「数据看板」「销售统计」两项 —— 每次改权限都回来验一遍。

### FE-3 数据看板 `/dashboard`

- 4 个接口并发拉：`overview` / `trend?days=30` / `category-ratio` / `rank?top=5`。
- 图表必须 `ResizeObserver → chart.resize()`，卸载 `chart.dispose()`。
- 环比为正绿、为负红；今日金额为 0 时不要显示 `-100%`（后端昨日为 0 返回 0）。
- 空态：`category-ratio` 返回 `[]` 时展示占位插画。

### FE-4 销售统计 `/sales`

- 后端**没有明细列表接口**，只有 `rank` / `category-ratio` 聚合。
- 页面按「分类排行 + 占比 + 时间区间切换」做；需要明细时先提示"待后端补 `/api/sales`"，不要伪造接口。

### FE-5 商品管理 `/goods`（后端已提供 `2026-11-10`）

- 接口：`GET /api/goods`（`page/pageSize/keyword/category/status`）、`GET /api/goods/categories`、`GET /api/goods/:id`、`POST/PUT/DELETE`、`PUT /api/goods/:id/status`。
- 字段：`id/name/sku/category/price/stock/sales/status/image/description`。
- ⚠️ `price` 是**字符串**（`"899.00"`），排序、合计、`>` 比较前必须 `Number(g.price)`；展示再 `.toFixed(2)`。
- `status` 用数字 1/0（上架/下架），`PUT /:id/status` 的 message 是「已上架 / 已下架」。
- `stock=0` 与 `status=0` 是两种不同状态（售罄 ≠ 下架），表格里分别标。
- `image` 恒 `null`（无上传接口），用占位色块，别渲染空 `<img>`。
- **删掉 `src/api/goods.mock.js` 的假数据**，改走 `src/api/goods.js`；Mock 服务已同构实现，切端口即切换。

### FE-6 用户管理 `/system/users`

- 参数 `{ page, pageSize, keyword, role_id, status }`；`keyword` **只匹配 username/nickname**，邮箱搜不到（属后端限制，UI 上别承诺）。
- 新增：`username/password/role_id` 必填；密码 ≥6、用户名 ≥3（后端只在校验注册时管长度，新增用户不校验长度，前端自己补）。
- 启停：`PUT /api/users/:id/status`，body `{status: 1|0}`（数字）。
- **禁用自己 / 删除自己**后端会拦，前端要提前置灰并给解释，避免弹错。
- 批量操作：目前只能逐条调用，别做成"一次请求批量删"。

### FE-7 角色管理 `/system/roles`

- 列表是**裸数组**：`data.map(...)`。
- 新增：`name`、`code` 必填，`code` 唯一（`角色编码已存在`）。
- 编辑：**必须同时传 `name` + `description`**，只传 description 会把名称写成 `undefined` 导致 500。
- 权限树：`GET /api/roles/:id/menus` 拿数字数组 → Tree 的 `checkedKeys`。
- 保存：`PUT /api/roles/:id/menus`，body 必须是 **JSON**：
  ```json
  { "menu_ids": [1, 3, 4, 6, 7, 8] }
  ```
  - **勾父带子**：勾「用户管理」要带上 6/7/8，否则子按钮权限丢失；
  - 空数组 = 清空全部权限，属正常业务（清空按钮就是这么用的）；
  - 保存成功后要重新登录或重调 `me`，侧栏才会变。
- 删除角色：角色下有用户 → `该角色下仍有用户，无法删除`；先删/迁用户。

### FE-8 个人中心 `/profile`

- 读：`GET /api/auth/me`；写：`PUT /api/users/:id`（`id` 取自 `me`）。
- 可改字段只有 `nickname / email / password`；**没有 phone 字段、没有头像上传接口**（设计稿里的手机号要置灰或去掉）。
- 改密码走同一个 `PUT`，成功后旧 token 仍然有效 2 小时 → 提示「请重新登录」并主动 `logout()`。

### FE-9 系统设置 `/settings`（后端已提供 `2026-11-10`）

- `GET /api/settings` → 扁平对象 `{systemName,slogan,notice,themeColor,siderCollapsed}`；`PUT` 支持部分字段并回传完整对象；`POST /api/settings/reset` 恢复默认。
- 校验都在后端：`systemName` 非空 ≤30、`slogan` ≤50、`notice` ≤200、`themeColor` 必须 `#RRGGBB`（返回大写）。
- 主题色写入后实时改 `ConfigProvider` token，别去改 CSS 文件。
- `siderCollapsed` 虽是全局字段，**多用户场景更适合放本地**（`zustand persist`），别把它当强制全局状态。

---

## 6. 通用联调检查清单

- [ ] 所有请求走 `src/api/*`，组件内不裸写 URL
- [ ] 成功判断用 `code === 0`，不是 HTTP status（业务错误是 200）
- [ ] 分页读 `data.list / total / page / pageSize`，`roles` 读裸数组
- [ ] 401 有统一跳登录；其它错误都有 `message.error`
- [ ] 列表 loading / 空态 / 错误态齐全
- [ ] 提交按钮 loading 且防重复点击
- [ ] 删除、禁用、清空权限都有二次确认
- [ ] 筛选变更后 `page` 重置为 1
- [ ] 金额千分位 + 两位小数；空值显示 `-`
- [ ] 权限：改完 `role_menu` 重新拉 `me`（或重登录）再验侧栏与按钮

---

## 7. 排错对照表

| 现象 | 原因 | 处理 |
| --- | --- | --- |
| 所有请求 404 | 后端/Mock 没启动，或 proxy target 端口错（应 3000 或 3001） | 先 `GET /api/health` |
| 404 且提示 `接口不存在: GET /api/xxx` | 路径拼错 / 少了 `/api` 前缀 | 对照 03 文档速查表 |
| 401「未登录或 token 缺失」 | header 没带或少了 `Bearer ` 后的空格 | 检查请求拦截器 |
| 401「token 无效或已过期」 | 2 小时到期 / 改过 `JWT_SECRET` / 换了后端 | 重新登录 |
| 请求"成功"但页面提示失败 | HTTP 200 + `code:1` | 判断改成 `code` |
| 列表页报 `.map is not a function` | `GET /api/roles` 是裸数组，被当成分页对象 | `data` 直接用 |
| `keyword` 搜不到邮箱/手机号 | 后端只匹配 username/nickname | UI 文案收敛为"账号/昵称" |
| 分页翻到最后一页变空 | `page` 超过总页数 | 用 `total` 计算后 clamp |
| 角色权限保存后侧栏没变 | 只改了库，没重拉 `me` | 重登录或重调 `me` |
| 分配权限"成功"但读回 `[]` | 请求体不是 JSON（`text/plain`）→ `menu_ids` 默认 `[]` → 删光不插 | Content-Type 必须是 `application/json` |
| 编辑角色后名称变空白/500 | 只传了 `description`，`name` 变 `undefined` | 永远传全量 name |
| 日期差一天 | 后端用 UTC 日期（`toISOString`） | 已知问题，展示层按本地 +1 校正或等后端修 |
| 返回 HTTP 400 + 英文 message（`Expected double-quoted property name...`） | body 不是合法 JSON，通常是 `{{变量}}` 为空把 JSON 撑坏，或数字字段加了引号 | 查该请求体里哪个变量为空；`role_id`/`status` 不要带引号 |
| `LIMIT ?` 报 `Incorrect arguments` | 传了字符串 | 用 `Number()` 转换 |
| 连不上 MySQL | 密码/库名/服务未启动 | 看启动日志「数据库连接失败」 |
| Mock 数据改了没生效 | Mock 是内存态，改的是文件 | 重启 Mock |

---

## 8. 从 Mock 切到真实后端

三步，前端代码零改动：

1. 起后端：`cd backend` → `npm run dev`（3000，需先配 `.env` 与跑过一次 `npm run init-db`）；
2. 改前端 `vite.config.js` 的 proxy target：`3001 → 3000`；
3. 重启 Vite，`GET /api/health` 确认，然后重登录（旧 mock token 会被判无效）。

> 真实后端比 Mock 多的部分：真实 bcrypt 校验、真实外键约束、真实 30 天销售数据。
> 少的部分：Mock 的场景开关（`__scenario`）在真实后端不存在，相关测试代码不要留在生产分支。

---

## 9. Mock 刻意复刻的 6 个「怪癖」

这些不是 bug，是为了让前端提前踩到真实后端的坑：

1. 业务错误 HTTP **200** + `code:1`；只有 401/404 用真实状态码。
2. `GET /api/roles` 返回**裸数组**。
3. `GET /api/auth/me` 的 `menus` 是**扁平**的、只含 `type=1`。
4. `GET /api/roles/:id/menus` **不校验角色存在**，不存在返回 `200 + []`。
5. `PUT /api/roles/:id/menus` 的 body 未按 JSON 解析时，`menu_ids` 默认 `[]`，仍返回 `权限分配成功`（**静默假成功**）。
6. 编辑角色不校验 `name`；只传 description 会把 name 写成 `undefined`。

---

## 10. 变更记录

| 日期 | 版本 | 变更 |
| --- | --- | --- |
| 2026-11（旧） | v1.0 | Mock 复刻旧契约：`/api/login`、`msg`、`/api/goods`、`/api/settings`、会员 users、端口 3001 |
| 2026-11-10 | **v2.1** | 商品 / 系统设置补齐后端并同步 Mock：新增 `goods`、`settings` 两组共 10 个接口、12 条演示商品、13 条菜单；`price` 按字符串返回、`categories` 路由顺序、设置字段校验均与后端一致 |
| 2026-11-09 | **v2.0** | 重写 `mock-server.js`：20 个接口对齐 `backend/`、JWT 形态 token、RBAC 11 菜单（v2.1 增至 13）、6 表种子、`__scenario` 六种场景、复刻 6 个真实怪癖；本指南同步重写 |
