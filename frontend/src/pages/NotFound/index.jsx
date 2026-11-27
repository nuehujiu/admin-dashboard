/**
 * 404 页面
 * 由路由表的最后一条通配符路由 '*' 兜底渲染；
 * 当前是极简占位实现，生产环境可换成带「返回首页」按钮的完整 404 视图
 */
export default function NotFound() {
  return (
    // 简单文案占位，没有样式依赖
    <div>NotFound</div>
  )
}
