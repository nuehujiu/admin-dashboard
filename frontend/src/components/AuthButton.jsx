import { Button, Tooltip } from 'antd';
import { usePermission } from '../utils/permissions';

/**
 * 带权限判断的按钮
 * permission: 权限点（字符串）或数组（任一即可）
 * mode: 'disable'（默认，禁用+提示）| 'hide'（直接不渲染）
 */
export default function AuthButton({ permission, mode = 'disable', children, ...rest }) {
  const { can } = usePermission();

  if (can(permission)) return <Button {...rest}>{children}</Button>;
  if (mode === 'hide') return null;

  return (
    <Tooltip title="当前角色无此操作权限">
      {/* disabled 的 Button 收不到 hover 事件，必须包一层 span */}
      <span style={{ display: 'inline-block' }}>
        <Button {...rest} disabled>
          {children}
        </Button>
      </span>
    </Tooltip>
  );
}
