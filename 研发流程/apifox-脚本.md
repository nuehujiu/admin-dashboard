# Apifox 后置脚本（断言 + 变量提取）

> 用法：接口 → 调试 → 后置操作 → 「脚本」→ 粘贴对应代码。
> 脚本用 Apifox 内置 chai（`pm.test` / `pm.expect`），与 Postman 语法兼容。
> 「校验响应（契约测试）」可关掉，本文件已覆盖它的作用。

---

## 0. 通用模板（每个接口至少这一条）

```js
const json = pm.response.json()
pm.test('code=0', () => pm.expect(json.code).to.eql(0))
```

---

## 1. 登录 `POST /api/auth/login`

```js
const json = pm.response.json()

pm.test('HTTP 200',       () => pm.response.to.have.status(200))
pm.test('code=0 登录成功', () => pm.expect(json.code).to.eql(0))
pm.test('token 是 JWT',    () => pm.expect(json.data.token).to.match(/^eyJ/))
pm.test('返回角色名',      () => pm.expect(json.data.user.role_name).to.be.a('string'))

pm.environment.set('token', json.data.token)
pm.environment.set('roleName', json.data.user.role_name)
```

登录失败用例（错误密码 / 禁用账号）单独一条，断言改：

```js
const json = pm.response.json()
pm.test('HTTP 200（业务错误不占用状态码）', () => pm.response.to.have.status(200))
pm.test('code=1',  () => pm.expect(json.code).to.eql(1))
pm.test('有错误文案', () => pm.expect(json.message).to.match(/用户名或密码错误|账号已被禁用/))
```

---

## 2. 注册 `POST /api/auth/register`

```js
const json = pm.response.json()

pm.test('code=0',      () => pm.expect(json.code).to.eql(0))
pm.test('返回新用户 id', () => pm.expect(json.data.id).to.be.a('number'))

pm.environment.set('newUserId', json.data.id)
```

重复用户名用例：

```js
const json = pm.response.json()
pm.test('code=1',    () => pm.expect(json.code).to.eql(1))
pm.test('文案正确',  () => pm.expect(json.message).to.include('已被占用'))
```

---

## 3. 当前用户 `GET /api/auth/me`

```js
const json = pm.response.json()

pm.test('code=0',            () => pm.expect(json.code).to.eql(0))
pm.test('menus 是数组',       () => pm.expect(json.data.menus).to.be.an('array'))
pm.test('permissions 是数组', () => pm.expect(json.data.permissions).to.be.an('array'))
pm.test('menus 都是 type=1',  () => json.data.menus.forEach(m => pm.expect(m.type).to.eql(1)))
pm.test('permissions 无空值', () => json.data.permissions.forEach(p => pm.expect(p).to.be.a('string')))

pm.environment.set('selfId', json.data.id)   // 供「删除自己/禁用自己」负向用例使用

// admin 专属：应拥有全部关键权限
pm.test('admin 有 user:list', () => pm.expect(json.data.permissions).to.include('user:list'))
```

用 `operator` 的 token 跑时，上面最后一条**应失败**，这才是正确结果。

---

## 4. 用户列表 `GET /api/users`

```js
const json = pm.response.json()
const d = json.data

pm.test('code=0',              () => pm.expect(json.code).to.eql(0))
pm.test('list 是数组',          () => pm.expect(d.list).to.be.an('array'))
pm.test('pageSize ≤ 100',       () => pm.expect(d.pageSize).to.be.at.most(100))
pm.test('total 与 list 匹配',    () => pm.expect(d.total).to.be.a('number'))
pm.test('字段齐全',              () => {
  if (d.list.length) {
    ;['id', 'username', 'role_id', 'role_name', 'status'].forEach(k =>
      pm.expect(d.list[0], k).to.have.property(k))
  }
})

if (d.list.length) pm.environment.set('userId', d.list[0].id)
```

`pageSize=200` 的越界用例，断言 `pageSize` 被 clamp：

```js
const d = pm.response.json().data
pm.test('pageSize 被 clamp 到 100', () => pm.expect(d.pageSize).to.eql(100))
```

---

## 5. 用户详情 `GET /api/users/{id}`

```js
const json = pm.response.json()

pm.test('code=0',        () => pm.expect(json.code).to.eql(0))
pm.test('id 与请求一致',   () => pm.expect(String(json.data.id)).to.eql(pm.environment.get('userId')))
pm.test('有 created_at', () => pm.expect(json.data.created_at).to.be.a('string'))
```

---

## 6. 新增用户 `POST /api/users`

```js
const json = pm.response.json()

pm.test('code=0',   () => pm.expect(json.code).to.eql(0))
pm.test('返回 id',   () => pm.expect(json.data.id).to.be.a('number'))

pm.environment.set('createdUserId', json.data.id)
```

---

## 7. 编辑用户 `PUT /api/users/{id}`

```js
const json = pm.response.json()
pm.test('code=0', () => pm.expect(json.code).to.eql(0))
```

---

## 8. 启停用户 `PUT /api/users/{id}/status`

```js
const json = pm.response.json()
pm.test('code=0', () => pm.expect(json.code).to.eql(0))

// 回查确认状态真的落库（body 里的 status 与返回的 status 对比）
const id = pm.environment.get('createdUserId')
const want = JSON.parse(pm.request.body.raw || '{}').status
if (id && (want === 0 || want === 1)) {
  pm.sendRequest({
    url: pm.environment.get('baseUrl') + '/api/users/' + id,
    method: 'GET',
    header: { Authorization: 'Bearer ' + pm.environment.get('token') }
  }, (err, res) => {
    pm.test('状态已更新为 ' + want, () => pm.expect(res.json().data.status).to.eql(want))
  })
}
```

非法值用例（`status:2`）：

```js
const json = pm.response.json()
pm.test('code=1',   () => pm.expect(json.code).to.eql(1))
pm.test('文案正确', () => pm.expect(json.message).to.include('0 或 1'))
```

禁用自己用例：

```js
const json = pm.response.json()
pm.test('code=1',   () => pm.expect(json.code).to.eql(1))
pm.test('文案正确', () => pm.expect(json.message).to.include('不能禁用当前登录账号'))
```

---

## 9. 删除用户 `DELETE /api/users/{id}`

```js
const json = pm.response.json()

pm.test('code=0 删除成功', () => pm.expect(json.code).to.eql(0))

// 删完立刻回查一次（pm.sendRequest 异步，回调里的 pm.test 会一并计入结果）
const id = pm.environment.get('createdUserId')
if (id) {
  pm.sendRequest({
    url: pm.environment.get('baseUrl') + '/api/users/' + id,
    method: 'GET',
    header: { Authorization: 'Bearer ' + pm.environment.get('token') }
  }, (err, res) => {
    pm.test('删除后详情应 404', () => {
      pm.expect(res.code).to.eql(404)
      pm.expect(res.json().code).to.eql(404)
    })
  })
}
```

删除自己：**另建一个请求**（id 填当前账号 id，来自环境变量 `selfId`），脚本只两条：

```js
const json = pm.response.json()
pm.test('code=1',   () => pm.expect(json.code).to.eql(1))
pm.test('文案正确', () => pm.expect(json.message).to.include('不能删除当前登录账号'))
```

---

## 10. 角色列表 `GET /api/roles`

```js
const json = pm.response.json()

pm.test('code=0',          () => pm.expect(json.code).to.eql(0))
pm.test('data 是数组（不是 paged）', () => pm.expect(json.data).to.be.an('array'))
pm.test('每项有 user_count', () => json.data.forEach(r => pm.expect(r.user_count).to.be.a('number')))

if (json.data.length) pm.environment.set('roleId', json.data[0].id)
```

---

## 11. 新增角色 `POST /api/roles`

```js
const json = pm.response.json()

pm.test('code=0', () => pm.expect(json.code).to.eql(0))
if (json.data && json.data.id) pm.environment.set('newRoleId', json.data.id)
```

code 重复用例：

```js
const json = pm.response.json()
pm.test('code=1', () => pm.expect(json.code).to.eql(1))
```

---

## 12. 编辑角色 `PUT /api/roles/{id}`

```js
const json = pm.response.json()
pm.test('code=0', () => pm.expect(json.code).to.eql(0))
```

> 请求体必须同时带 `name` 和 `description`，只传 description 会把 name 写成 undefined。

---

## 13. 删除角色 `DELETE /api/roles/{id}`

```js
const json = pm.response.json()
pm.test('code=0', () => pm.expect(json.code).to.eql(0))
```

角色下有用户用例：

```js
const json = pm.response.json()
pm.test('code=1',   () => pm.expect(json.code).to.eql(1))
pm.test('文案正确', () => pm.expect(json.message).to.include('仍有用户'))
```

---

## 14. 角色菜单 `GET /api/roles/{id}/menus`

```js
const json = pm.response.json()

pm.test('code=0',           () => pm.expect(json.code).to.eql(0))
pm.test('data 是数字数组',   () => json.data.forEach(id => pm.expect(id).to.be.a('number')))

pm.environment.set('menuIds', JSON.stringify(json.data))
```

---

## 15. 分配权限 `PUT /api/roles/{id}/menus`

```js
const json = pm.response.json()

pm.test('code=0', () => pm.expect(json.code).to.eql(0))
```

> 全量覆盖：传 `[]` 会清空该角色全部权限。做负向用例时先记下 `menuIds` 再还原。

---

## 16. 看板概览 `GET /api/dashboard/overview`

```js
const json = pm.response.json()
const d = json.data
const keys = ['today_amount', 'today_amount_change', 'today_qty', 'total_amount', 'total_qty', 'user_count', 'record_count']

pm.test('code=0',      () => pm.expect(json.code).to.eql(0))
pm.test('字段齐全',     () => keys.forEach(k => pm.expect(d, k).to.have.property(k)))
pm.test('全部是数字',    () => keys.forEach(k => pm.expect(d[k], k).to.be.a('number')))
pm.test('累计 ≥ 今日',   () => pm.expect(d.total_amount).to.be.at.least(d.today_amount))
pm.test('记录数 > 0',   () => pm.expect(d.record_count).to.be.above(0))
```

---

## 17. 趋势 `GET /api/dashboard/trend?days=30`

```js
const json = pm.response.json()
const arr = json.data

pm.test('code=0',        () => pm.expect(json.code).to.eql(0))
pm.test('是数组',         () => pm.expect(arr).to.be.an('array'))
pm.test('每个点字段齐全',  () => arr.forEach(p => {
  pm.expect(p.date).to.be.a('string')
  pm.expect(p.amount).to.be.a('number')
  pm.expect(p.qty).to.be.a('number')
}))
pm.test('日期连续无断点',  () => {
  for (let i = 1; i < arr.length; i++) {
    const prev = new Date(arr[i - 1].date + 'T00:00:00Z')
    const cur = new Date(arr[i].date + 'T00:00:00Z')
    pm.expect((cur - prev) / 86400000, '间隔应为 1 天').to.eql(1)
  }
})
```

越界用例 `days=91`：

```js
const arr = pm.response.json().data
pm.test('clamp 到 90 天', () => pm.expect(arr.length).to.eql(90))
```

---

## 18. 分类占比 `GET /api/dashboard/category-ratio`

```js
const json = pm.response.json()
const arr = json.data

pm.test('code=0',       () => pm.expect(json.code).to.eql(0))
pm.test('是数组',        () => pm.expect(arr).to.be.an('array'))
pm.test('value 是数字',  () => arr.forEach(i => pm.expect(i.value).to.be.a('number')))
pm.test('按金额降序',    () => {
  for (let i = 1; i < arr.length; i++) pm.expect(arr[i - 1].value).to.be.at.least(arr[i].value)
})
```

---

## 19. 排行 `GET /api/dashboard/rank?top=5`

```js
const json = pm.response.json()
const arr = json.data

pm.test('code=0',        () => pm.expect(json.code).to.eql(0))
pm.test('条数 ≤ top',     () => pm.expect(arr.length).to.be.at.most(5))
pm.test('按金额降序',     () => {
  for (let i = 1; i < arr.length; i++) pm.expect(arr[i - 1].amount).to.be.at.least(arr[i].amount)
})
pm.test('字段齐全',       () => arr.forEach(r => {
  ;['id', 'name', 'amount', 'qty'].forEach(k => pm.expect(r, k).to.have.property(k))
}))
```

---

## 20. 未登录 `GET /api/users`（无 token）

```js
pm.test('HTTP 401', () => pm.response.to.have.status(401))
pm.test('code=401', () => pm.expect(pm.response.json().code).to.eql(401))
pm.test('文案正确', () => pm.expect(pm.response.json().message).to.include('未登录'))
```

---

## 21. 失效 token `GET /api/users`（token 改一个字符）

```js
pm.test('HTTP 401', () => pm.response.to.have.status(401))
pm.test('code=401', () => pm.expect(pm.response.json().code).to.eql(401))
pm.test('文案正确', () => pm.expect(pm.response.json().message).to.include('无效或已过期'))
```

---

## 附：环境变量约定

| 变量 | 来源 | 用途 |
| --- | --- | --- |
| `baseUrl` | 环境管理手填 | 所有接口前置 URL |
| `token` | 登录脚本 | Auth → Bearer Token |
| `roleName` | 登录脚本 | 断言展示 |
| `userId` | 用户列表脚本 | 详情/编辑/启停/删除 |
| `selfId` | `/auth/me` 脚本 | 删除自己/禁用自己负向用例 |
| `createdUserId` | 新增用户脚本 | 编辑/删除新建用户 |
| `roleId` | 角色列表脚本 | 角色相关接口 |
| `menuIds` | 角色菜单脚本 | 权限还原 |

## 附：常见断言失败的原因

| 现象 | 原因 |
| --- | --- |
| `code` 期望 0 实际 1 | 参数不合规，看同响应的 `message` |
| HTTP 401 | `token` 未提取 / 环境未选中 / token 超过 2h |
| 分页 total 对不上 | `keyword` 只匹配 username、nickname，不含 email |
| 日期少一天 | 后端按 UTC 算，北京时间 0–8 点属前一天 |
