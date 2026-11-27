// 引入所需钩子：状态、回调缓存、副作用
import { useState, useCallback, useEffect } from 'react';
// 引入页面样式
import s from './index.module.scss';
// 引入 antd 组件：按钮、气泡、表单、App、表格、复选框、弹窗、输入框、开关
import {
  Button,
  Tooltip,
  Form,
  App,
  Table,
  Checkbox,
  Modal,
  Input,
  Switch,
} from 'antd';
// 引入图标：导出、新增、删除、编辑
import {
  DownloadOutlined,
  PlusOutlined,
  DeleteOutlined,
  EditOutlined,
} from '@ant-design/icons';
// 引入角色相关接口：列表、全量菜单、角色权限、保存权限、增删改
import {
  getRoles,
  getMenus,
  getRoleMenus,
  assignRoleMenus,
  createRole,
  deleteRole,
  updateRole,
} from '../../api/roles';
// 引入角色图标工具：取图标、可选图标集、可选配色、浅色底生成
import { getRoleIcon, ICON_OPTIONS, COLOR_OPTIONS, softBg } from './roleIcons';
// 引入权限按钮组件
import AuthButton from '../../components/AuthButton';
// 引入权限点与判断 Hook
import { PERM, usePermission } from '../../utils/permissions';

/**
 * 权限矩阵的「行」定义：按业务分组呈现
 * 设计要点：每行用 permission 标识（而不是写死菜单 id），
 *          菜单表增删后依然能通过 permToId 映射到最新 id，不会错位
 */
const MATRIX_ROWS = [
  // 一级菜单：各业务模块的查看权限
  { key: 'dashboard', label: '数据看板', perms: ['dashboard:view'] },
  { key: 'sales', label: '销售统计', perms: ['sales:view'] },
  { key: 'goods', label: '商品管理', perms: ['goods:view'] },
  // 系统管理的整体行（含三个子项，便于一眼看出「系统管理」整块的授权情况）
  {
    key: 'system',
    label: '系统管理 · 用户 / 角色 / 设置',
    perms: ['user:list', 'role:list', 'settings:view'],
  },
  // 系统管理下的三个子项：用 indent 标记，渲染时缩进显示
  {
    key: 'sys-user',
    label: '其中：用户管理',
    perms: ['user:list'],
    indent: true,
  },
  {
    key: 'sys-role',
    label: '其中：角色管理',
    perms: ['role:list'],
    indent: true,
  },
  {
    key: 'sys-settings',
    label: '其中：系统设置',
    perms: ['settings:view'],
    indent: true,
  },
  { key: 'profile', label: '个人中心', perms: ['profile:view'] },
  // 按钮级权限：按资源的增删改分组
  {
    key: 'btn-user',
    label: '按钮 · 用户新增 / 编辑 / 删除',
    perms: ['user:create', 'user:update', 'user:delete'],
  },
  {
    key: 'btn-role',
    label: '按钮 · 角色新增 / 编辑 / 删除',
    perms: ['role:create', 'role:update', 'role:delete'],
  },
  {
    key: 'btn-goods-crud',
    label: '按钮 · 商品新增 / 编辑 / 删除',
    perms: ['goods:create', 'goods:update', 'goods:delete'],
  },
  {
    key: 'btn-goods',
    label: '按钮 · 商品上下架 / 库存调整',
    perms: ['goods:status', 'goods:stock'],
  },
];

/**
 * 角色管理页
 * 组成：角色卡片列表（可切换当前列、编辑、删除、启停）+
 *      权限矩阵表格（行=权限项、列=角色，单元格勾选即授权，改动即时保存）+
 *      新增 / 编辑角色弹窗
 */
export default function Roles() {
  // 新增角色表单
  const [form] = Form.useForm();
  // 编辑角色表单（名称 / 描述）
  const [editForm] = Form.useForm();
  // 提示与确认弹窗
  const { message, modal } = App.useApp();
  // 权限判断
  const { can } = usePermission();
  // 新增弹窗开关
  const [creating, setCreating] = useState(false);
  // 角色列表
  const [roles, setRoles] = useState([]);
  // 各角色的权限 id 集合：{ [roleId]: number[] }
  const [rolePerms, setRolePerms] = useState({});
  // 当前选中的角色 id（决定「全选/清空当前列」作用于哪一列，也决定卡片高亮）
  const [current, setCurrent] = useState(null);
  // 全量菜单项（用于 permission → id 的映射）
  const [menus, setMenus] = useState([]);
  // 首屏加载态
  const [loading, setLoading] = useState(true);
  // 正在保存权限的角色 id（用于禁用该列复选框与按钮 loading）
  const [savingId, setSavingId] = useState(null);
  // 新增角色保存中
  const [saving, setSaving] = useState(false);
  // 编辑弹窗当前角色（null 表示关闭）
  const [editing, setEditing] = useState(null);
  // 编辑弹窗内的图标选择
  const [editIcon, setEditIcon] = useState('Safety');
  // 编辑弹窗内的配色选择
  const [editColor, setEditColor] = useState('#F5611D');
  // 编辑弹窗内的启用状态（1 启用 / 0 停用）
  const [editStatus, setEditStatus] = useState(1);
  // 编辑保存中
  const [savingEdit, setSavingEdit] = useState(false);

  /**
   * 全量加载：角色列表 + 菜单 + 每个角色的权限
   * 说明：角色权限需要逐个请求（后端按角色提供接口），用 Promise.all 并行
   */
  const load = useCallback(async () => {
    try {
      // 并行取角色列表与全量菜单
      const [rs, ms] = await Promise.all([getRoles(), getMenus()]);
      // 再并行取每个角色的权限 id 数组，组装成 [id, ids] 键值对
      const pairs = await Promise.all(
        (rs || []).map((r) =>
          getRoleMenus(r.id).then((ids) => [r.id, ids || []]),
        ),
      );
      // 写入三份数据
      setRoles(rs || []);
      setMenus(ms || []);
      // Object.fromEntries 把键值对数组还原成对象
      setRolePerms(Object.fromEntries(pairs));
      // 首次加载时默认选中第一个角色（已选过则保留用户选择）
      setCurrent((prev) => prev ?? rs?.[0]?.id ?? null);
    } catch (e) {
      message.error(e?.message || '加载角色失败');
      // 失败时清空，避免展示半截数据
      setRoles([]);
      setMenus([]);
      setRolePerms({});
    } finally {
      setLoading(false);
    }
  }, [message]);

  // 进入页面时加载一次
  useEffect(() => {
    // load 首屏拉数据并回填多个 state，属于「向外部系统取数」的必要同步起点
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // 已启用角色数
  const enabledCount = roles.filter((item) => item.status === 1).length;

  // 所有角色的成员数之和
  const memberCount = roles.reduce((a, r) => a + (r.user_count || 0), 0);

  /** 当前列全选 / 清空：已是全选则清空，否则全选 */
  const toggleColumn = () => {
    if (!current) return;
    applyPerms(current, currentAll ? [] : allRowIds);
  };

  // permission 字符串 → 菜单 id 的映射表
  // 以下计算与回调交给 React Compiler 自动缓存，手写 useMemo/useCallback 反而会因依赖链变化频繁失效
  const permToId = {};
  menus.forEach((m) => {
    if (m.permission) permToId[m.permission] = m.id;
  });

  /**
   * 把矩阵行的 permission 列表转换成菜单 id 列表
   * filter(Boolean) 过滤掉菜单表里不存在的 permission，避免 undefined
   */
  const rowIds = (row) => row.perms.map((p) => permToId[p]).filter(Boolean);

  /**
   * 保存某角色的权限（乐观更新 + 失败回滚）
   * @param {number|string} roleId - 角色 id
   * @param {number[]} nextIds - 保存后的完整权限 id 列表
   */
  const applyPerms = async (roleId, nextIds) => {
    // 记录回滚基准
    const prev = rolePerms[roleId] || [];
    // 先更新 UI，让勾选立即响应
    setRolePerms((p) => ({ ...p, [roleId]: nextIds }));
    // 标记该列保存中（禁用该列复选框）
    setSavingId(roleId);
    try {
      // 全量覆盖写入
      await assignRoleMenus(roleId, nextIds);
      message.success('权限已保存');
    } catch (e) {
      // 失败回滚到原值，避免 UI 与后端不一致
      setRolePerms((p) => ({ ...p, [roleId]: prev }));
      message.error(e?.message || '权限保存失败');
    } finally {
      setSavingId(null);
    }
  };

  /**
   * 勾选 / 取消某行的权限
   * @param {number|string} roleId - 角色 id
   * @param {number[]} ids - 该行包含的权限 id
   * @param {boolean} checked - 勾选状态
   */
  const toggleCell = (roleId, ids, checked) => {
    const cur = rolePerms[roleId] || [];
    // 勾选：并集去重；取消：过滤掉这一行的 id（保留其它行）
    const nextIds = checked
      ? Array.from(new Set([...cur, ...ids]))
      : cur.filter((id) => !ids.includes(id));
    applyPerms(roleId, nextIds);
  };

  // 矩阵里所有权限 id 的并集（用于「全选当前列」）
  const allRowIds = Array.from(
    new Set(
      MATRIX_ROWS.flatMap((row) => row.perms.map((p) => permToId[p]).filter(Boolean)),
    ),
  );

  // 表格列：第一列是权限项，其余每列对应一个角色
  const columns = [
    {
      title: '权限项',
      dataIndex: 'label',
      width: 300,
      // 子项缩进显示，形成层级
      render: (v, row) => (
        <span className={row.indent ? s.rowIndent : s.rowLabel}>{v}</span>
      ),
    },
    // 每个角色一列，单元格是「本行权限的勾选状态」
    ...roles.map((r) => ({
      title: r.name,
      key: `role-${r.id}`,
      align: 'center',
      render: (_, row) => {
        // 该行对应的权限 id
        const ids = rowIds(row);
        // 该行没有对应权限项（菜单表缺失）时显示破折号
        if (!ids.length) return <span className={s.cellEmpty}>—</span>;
        // 该角色当前拥有的权限
        const cur = rolePerms[r.id] || [];
        // 本行里已被该角色拥有的数量
        const owned = ids.filter((id) => cur.includes(id));
        return (
          <Checkbox
            // 全部拥有才是选中
            checked={owned.length === ids.length}
            // 部分拥有显示半选
            indeterminate={owned.length > 0 && owned.length < ids.length}
            // 保存中或无权限时禁用
            disabled={savingId === r.id || !can(PERM.ROLE_UPDATE)}
            onChange={(e) => toggleCell(r.id, ids, e.target.checked)}
          />
        );
      },
    })),
  ];

  /** 当前列是否已「全选」（决定按钮文案是「清空」还是「全选」） */
  const currentAll =
    Boolean(current) &&
    allRowIds.length > 0 &&
    allRowIds.every((id) => (rolePerms[current] || []).includes(id));

  /** 新增角色 */
  const onCreate = async () => {
    // 校验表单
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      // 只提交需要的字段，描述为空时给空串
      await createRole({
        name: values.name,
        code: values.code,
        description: values.description || '',
      });
      message.success('新增成功');
      // 关闭弹窗、清空表单、重新加载列表
      setCreating(false);
      form.resetFields();
      await load();
    } catch (e) {
      message.error(e?.message || '新增失败');
    } finally {
      setSaving(false);
    }
  };

  /** 删除角色：角色下还有用户时后端会拒绝并返回错误提示 */
  const onDelete = useCallback(
    (role) => {
      modal.confirm({
        title: `删除角色「${role.name}」？`,
        // 说明后果，避免误删
        content: '该角色的权限配置会一并移除，删除后不可恢复。',
        okText: '删除',
        okButtonProps: { danger: true },
        cancelText: '取消',
        onOk: async () => {
          try {
            await deleteRole(role.id);
            message.success('删除成功');
            // 清理本地缓存的该角色权限
            setRolePerms((prev) => {
              const next = { ...prev };
              delete next[role.id];
              return next;
            });
            // 删的正好是当前选中列，则取消选中
            if (current === role.id) setCurrent(null);
            // 重新加载（角色列表与成员统计都会变）
            await load();
          } catch (e) {
            message.error(e?.message || '删除失败');
          }
        },
      });
    },
    [modal, message, current, load],
  );

  /** 打开编辑弹窗：把该角色当前的配置灌进表单与选择器 */
  const onOpenEdit = (role) => {
    editForm.setFieldsValue({
      name: role.name,
      description: role.description || '',
    });
    // 图标与配色回落默认值
    setEditIcon(role.icon || 'Safety');
    setEditColor(role.color || '#F5611D');
    // 状态为空时默认启用
    setEditStatus(role.status ?? 1);
    // 记录正在编辑的角色（同时打开弹窗）
    setEditing(role);
  };

  /** 保存编辑：名称 / 描述 / 图标 / 配色 / 启用状态一起提交 */
  const onSaveEdit = async () => {
    if (!editing) return;
    // 校验表单
    let values;
    try {
      values = await editForm.validateFields();
    } catch {
      return;
    }
    setSavingEdit(true);
    try {
      await updateRole(editing.id, {
        name: values.name,
        description: values.description || '',
        icon: editIcon,
        color: editColor,
        status: editStatus,
      });
      message.success('已保存');
      // 关闭弹窗并重新加载
      setEditing(null);
      await load();
    } catch (e) {
      message.error(e?.message || '保存失败');
    } finally {
      setSavingEdit(false);
    }
  };

  /** 点状态胶囊直接切换启用 / 停用（无需进编辑弹窗） */
  const onToggleStatus = async (role) => {
    // 取反
    const next = role.status === 1 ? 0 : 1;
    try {
      // 只提交 status 字段
      await updateRole(role.id, { status: next });
      message.success(
        next === 1 ? `已启用「${role.name}」` : `已停用「${role.name}」`,
      );
      // 刷新列表（卡片状态与统计要更新）
      await load();
    } catch (e) {
      message.error(e?.message || '切换状态失败');
    }
  };

  return (
    <div className={s.page}>
      {/* 页头：标题 + 统计 + 操作 */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>角色管理</h1>
          <p className={s.meta}>
            共 {roles.length} 个角色 · {enabledCount} 个已启用 · 覆盖{' '}
            {memberCount} 位成员
          </p>
        </div>
        <div className={s.actions}>
          {/* 导出：后端未提供接口，禁用并说明 */}
          <Tooltip title="后端暂未提供导出接口">
            <Button icon={<DownloadOutlined />} disabled>
              导出配置
            </Button>
          </Tooltip>
          {/* 新增角色：受 ROLE_CREATE 权限控制 */}
          <AuthButton
            type="primary"
            icon={<PlusOutlined />}
            permission={PERM.ROLE_CREATE}
            onClick={() => {
              // 打开弹窗前先清空表单，避免残留上次输入
              form.resetFields();
              setCreating(true);
            }}
          >
            新增角色
          </AuthButton>
        </div>
      </div>

      {/* 角色卡片列表 */}
      <div className={s.cards}>
        {roles.map((r) => {
          // 取该角色的图标配置（图标组件、底色、图标色）
          const icon = getRoleIcon(r);
          const RoleIcon = icon.Icon;
          // 该角色已拥有的权限项数量
          const count = (rolePerms[r.id] || []).length;
          return (
            <div
              key={r.id}
              // 用 div + role/tabIndex 实现可点击卡片（同时支持回车/空格键）
              role="button"
              tabIndex={0}
              className={`${s.roleCard} ${current === r.id ? s.roleCardActive : ''}`}
              onClick={() => setCurrent(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCurrent(r.id);
              }}
            >
              <div className={s.roleHead}>
                {/* 角色图标：底色与图标色由角色配置决定 */}
                <span
                  className={s.roleIcon}
                  style={{ background: icon.bg, color: icon.color }}
                >
                  <RoleIcon />
                </span>
                <div className={s.roleTitle}>
                  <div className={s.roleName}>{r.name}</div>
                  {/* 描述为空显示破折号 */}
                  <div className={s.roleDesc}>{r.description || '—'}</div>
                </div>
                {/* hover 卡片才出现的两个圆形操作按钮：无权限则不渲染 */}
                {(can(PERM.ROLE_UPDATE) || can(PERM.ROLE_DELETE)) && (
                  <div className={s.cardActions}>
                    {/* 编辑入口 */}
                    {can(PERM.ROLE_UPDATE) && (
                      <Tooltip title="编辑角色" placement="topRight">
                        <button
                          type="button"
                          className={s.cardAction}
                          aria-label="编辑角色"
                          onClick={(e) => {
                            // 阻止冒泡，避免同时触发卡片的「切换当前列」
                            e.stopPropagation();
                            onOpenEdit(r);
                          }}
                        >
                          <EditOutlined />
                        </button>
                      </Tooltip>
                    )}
                    {/* 删除入口：红色按钮 */}
                    {can(PERM.ROLE_DELETE) && (
                      <Tooltip title="删除角色" placement="topRight">
                        <button
                          type="button"
                          className={`${s.cardAction} ${s.actionDanger}`}
                          aria-label="删除角色"
                          onClick={(e) => {
                            e.stopPropagation(); // 关键：别触发卡片本身的「切换当前列」
                            onDelete(r);
                          }}
                        >
                          <DeleteOutlined />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>

              {/* 卡片底部：成员数、权限数、状态胶囊 */}
              <div className={s.roleFoot}>
                <span className={s.roleStat}>
                  <b>{r.user_count ?? 0}</b>位成员
                </span>
                <span className={s.roleStat}>
                  <b>{count}</b>项权限
                </span>
                {/* 状态可点击：点一下即切换启用 / 停用 */}
                <button
                  type="button"
                  className={`${s.statusPill} ${r.status === 1 ? s.statusOn : s.statusOff}`}
                  disabled={!can(PERM.ROLE_UPDATE)}
                  onClick={(e) => {
                    // 阻止冒泡，避免顺带切换当前列
                    e.stopPropagation();
                    onToggleStatus(r);
                  }}
                >
                  <i />
                  {r.status === 1 ? '启用' : '停用'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* 权限矩阵卡片 */}
      <div className={s.matrixCard}>
        <div className={s.matrixHead}>
          <div>
            <h2 className={s.matrixTitle}>权限矩阵</h2>
            <p className={s.matrixHint}>勾选 = 该角色拥有对应菜单 / 按钮权限</p>
          </div>
          {/* 当前列全选 / 清空：未选中角色或无权限时禁用 */}
          <Button
            type="link"
            onClick={toggleColumn}
            disabled={!current || !can(PERM.ROLE_UPDATE)}
            loading={savingId === current}
          >
            {currentAll ? '清空当前列' : '全选当前列'} ›
          </Button>
        </div>

        <Table
          className={s.table}
          // 行唯一键用行的 key（不是 id）
          rowKey="key"
          columns={columns}
          dataSource={MATRIX_ROWS}
          loading={loading}
          // 矩阵数据量固定且不大，不需要分页
          pagination={false}
          locale={{ emptyText: '暂无权限项' }}
        />
      </div>

      {/* 新增角色弹窗 */}
      <Modal
        title="新增角色"
        open={creating}
        // 提前渲染，保证 resetFields 有实例可用
        forceRender
        confirmLoading={saving}
        onOk={onCreate}
        onCancel={() => setCreating(false)}
        okText="保存"
        cancelText="取消"
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {/* 角色名称：必填 */}
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="如：商品编辑" />
          </Form.Item>
          {/* 角色编码：必填 + 格式约束（后端用作唯一标识） */}
          <Form.Item
            name="code"
            label="角色编码"
            rules={[
              { required: true, message: '请输入角色编码' },
              {
                pattern: /^[a-z][a-z0-9-]*$/,
                message: '小写字母开头，可含数字与短横线',
              },
            ]}
          >
            <Input placeholder="如：goods-editor" />
          </Form.Item>
          {/* 描述：选填 */}
          <Form.Item name="description" label="描述">
            <Input placeholder="一句话说明这个角色能做什么" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑角色弹窗：图标 / 配色 / 启用状态都在这里改 */}
      <Modal
        title={editing ? `编辑角色 · ${editing.name}` : '编辑角色'}
        open={Boolean(editing)}
        forceRender
        confirmLoading={savingEdit}
        onOk={onSaveEdit}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
        width={520}
      >
        <Form form={editForm} layout="vertical" style={{ marginTop: 12 }}>
          {/* 名称：必填 */}
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="如：商品编辑" />
          </Form.Item>
          {/* 描述 */}
          <Form.Item name="description" label="描述">
            <Input placeholder="一句话说明这个角色能做什么" />
          </Form.Item>

          {/* 图标选择器：选中项以当前配色描边 + 浅色底高亮 */}
          <div className={s.field}>
            <span className={s.fieldLabel}>图标</span>
            <div className={s.iconPicker}>
              {ICON_OPTIONS.map(({ name, label, component: OptIcon }) => (
                <button
                  key={name}
                  type="button"
                  title={label}
                  className={`${s.iconOption} ${editIcon === name ? s.iconOptionActive : ''}`}
                  // 选中时用当前配色生成描边、文字色与浅底
                  style={
                    editIcon === name
                      ? {
                          borderColor: editColor,
                          color: editColor,
                          background: softBg(editColor),
                        }
                      : undefined
                  }
                  onClick={() => setEditIcon(name)}
                >
                  <OptIcon />
                </button>
              ))}
            </div>
          </div>

          {/* 配色选择器 */}
          <div className={s.field}>
            <span className={s.fieldLabel}>配色</span>
            <div className={s.colorPicker}>
              {COLOR_OPTIONS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  title={c.label}
                  aria-label={c.label}
                  className={`${s.colorDot} ${editColor === c.value ? s.colorDotActive : ''}`}
                  style={{ background: c.value }}
                  onClick={() => setEditColor(c.value)}
                />
              ))}
            </div>
          </div>

          {/* 启用状态：开关与文案双向映射 */}
          <div className={`${s.field} ${s.fieldRow}`}>
            <div>
              <span className={s.fieldLabel}>启用该角色</span>
              <p className={s.fieldHint}>停用后卡片显示为灰色「停用」</p>
            </div>
            <Switch
              checked={editStatus === 1}
              onChange={(v) => setEditStatus(v ? 1 : 0)}
              checkedChildren="启用"
              unCheckedChildren="停用"
            />
          </div>
        </Form>
      </Modal>
    </div>
  );
}
