## 改了什么

<!-- 一句话说明这次变更的核心内容 -->

## 为什么

<!-- 对应 Issue / 需求的背景，写 Closes #12 -->

Closes #

## 分支与目标

- [ ] `feature/*` → `develop`（合并方式：**Squash and merge**）
- [ ] `release/*` → `main`（合并方式：**Create a merge commit**）
- [ ] `hotfix/*` → `main`（合并方式：**Create a merge commit**）

## 怎么验证

- [ ] 后端可跑：`node backend/app.js`（3000，`GET /api/health` 通）
- [ ] 或 Mock 可跑：`node mock/mock-server.js`（3001，契约同构）
- [ ] 前端相关：`npm run build` 通过 / 页面自测项已勾
- [ ] 接口有变化时已同步：`研发流程/03`、`研发流程/api-openapi.json`、`开发文档.md` 第 7 章
- [ ] 无 `.env`、无调试 `console.log`、无 `node_modules`/`dist`

## 自测结论（单人项目必填，替代非作者 Review）

<!-- 例：用户列表 keyword+role_id 组合筛选已回归；商品 price 字符串换算正确；未登录访问 /me 返回 401 -->

## 自审清单（合并前逐条确认）

- [ ] 已逐行走过 Files changed
- [ ] CI 绿
- [ ] 上面「自测结论」已填
