// 引入浏览器历史路由工厂：使用真实 URL 路径（需服务端把未知路径回落到 index.html）
import { createBrowserRouter } from 'react-router-dom'
// 引入集中式路由配置（数组形式，含嵌套 children）
import { routes } from './routes.jsx'

// 创建并导出路由实例，供 AppRoot 挂载 / 也可在守卫中读取路由状态
export default createBrowserRouter(routes)
