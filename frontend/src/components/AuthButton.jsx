// 引入 antd 按钮与文字提示气泡
import { Button, Tooltip } from 'antd';
// 引入权限判断 Hook
import { usePermission } from '../utils/permissions';

/**
 * 带权限判断的按钮
 * 用法：把普通 <Button> 换成 <AuthButton permission={PERM.GOODS_CREATE}>，无权限时自动降级
 * @param {string|string[]} permission - 所需权限点；数组表示「任一满足」
 * @param {'disable'|'hide'} mode - 无权限时的表现：
 *        disable（默认）禁用按钮并给出提示原因；hide 直接不渲染
 * @param {ReactNode} children - 按钮内容
 * @param {...object} rest - 其余 antd Button 属性（type/onClick/icon 等原样透传）
 */
export default function AuthButton({ permission, mode = 'disable', children, ...rest }) {
  // 取出权限判断函数（内部基于 store 中缓存的权限点，不发请求）
  const { can } = usePermission();

  // 有权限：按正常按钮渲染，属性全部透传
  if (can(permission)) return <Button {...rest}>{children}</Button>;
  // 无权限且要求隐藏：不渲染任何内容
  if (mode === 'hide') return null;

  // 无权限且要求禁用：包一层 Tooltip 解释原因
  return (
    <Tooltip title="当前角色无此操作权限">
      {/* disabled 的 Button 收不到 hover 事件，必须包一层 span 才能触发 Tooltip */}
      <span style={{ display: 'inline-block' }}>
        {/* 禁用态按钮，视觉上仍占位，避免布局跳动 */}
        <Button {...rest} disabled>
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
