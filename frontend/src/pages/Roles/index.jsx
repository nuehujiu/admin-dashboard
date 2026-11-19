import React, { useState, useCallback, useEffect, useMemo } from 'react';
import s from './index.module.scss';
import {
  Button,
  Tooltip,
  Form,
  App,
  Table,
  Checkbox,
  Modal,
  Input,
} from 'antd';
import {
  DownloadOutlined,
  PlusOutlined,
  SafetyOutlined,
  BarChartOutlined,
  ShopOutlined,
  EyeOutlined,
} from '@ant-design/icons';
import {
  getRoles,
  getMenus,
  getRoleMenus,
  assignRoleMenus,
  createRole,
} from '../../api/roles';

/** 角色卡图标与配色（按角色 code 取，未命中走访客样式） */
const ROLE_ICONS = {
  admin: { icon: <SafetyOutlined />, color: '#F5611D', bg: '#FFF2EA' },
  operator: { icon: <BarChartOutlined />, color: '#2F8F86', bg: '#E7F4F2' },
  'goods-editor': { icon: <ShopOutlined />, color: '#C77A28', bg: '#FCF1E3' },
  guest: { icon: <EyeOutlined />, color: '#A8A29C', bg: '#F4F1ED' },
};
/**
 * 权限矩阵的行：按设计稿的分组呈现
 * perms 用 permission 标识而不是写死 id，菜单表变动后依然能对上
 */
const MATRIX_ROWS = [
  { key: 'dashboard', label: '数据看板', perms: ['dashboard:view'] },
  { key: 'sales', label: '销售统计', perms: ['sales:view'] },
  { key: 'goods', label: '商品管理', perms: ['goods:view'] },
  {
    key: 'system',
    label: '系统管理 · 用户 / 角色 / 设置',
    perms: ['user:list', 'role:list', 'settings:view'],
  },
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
    key: 'btn-goods',
    label: '按钮 · 商品上下架 / 库存调整',
    perms: ['goods:status', 'goods:stock'],
  },
];

export default function Roles() {
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [creating, setCreating] = useState(false);
  const [roles, setRoles] = useState([]);
  const [rolePerms, setRolePerms] = useState({});
  const [current, setCurrent] = useState(null);
  const [menus, setMenus] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [rs, ms] = await Promise.all([getRoles(), getMenus()]);
      const pairs = await Promise.all(
        (rs || []).map((r) =>
          getRoleMenus(r.id).then((ids) => [r.id, ids || []]),
        ),
      );
      setRoles(rs || []);
      setMenus(ms || []);
      setRolePerms(Object.fromEntries(pairs));
      setCurrent((prev) => prev ?? rs?.[0]?.id ?? null);
    } catch (e) {
      message.error(e?.message || '加载角色失败');
      setRoles([]);
      setMenus([]);
      setRolePerms({});
    } finally {
      setLoading(false);
    }
  }, [message]);

  useEffect(() => {
    load();
  }, [load]);

  const enabledCount = roles.filter((item) => item.status === 1).length;

  const memberCount = roles.reduce((a, r) => a + (r.user_count || 0), 0);

  const toggleColumn = () => {
    if (!current) return;
    applyPerms(current, currentAll ? [] : allRowIds);
  };
  const permToId = useMemo(() => {
    const map = {};
    menus.forEach((m) => {
      if (m.permission) map[m.permission] = m.id;
    });
    return map;
  }, [menus]);

  const rowIds = useCallback(
    (row) => row.perms.map((p) => permToId[p]).filter(Boolean),
    [permToId],
  );
  const applyPerms = useCallback(
    async (roleId, nextIds) => {
      const prev = rolePerms[roleId] || [];
      setRolePerms((p) => ({ ...p, [roleId]: nextIds }));
      setSavingId(roleId);
      try {
        await assignRoleMenus(roleId, nextIds);
        message.success('权限已保存');
      } catch (e) {
        setRolePerms((p) => ({ ...p, [roleId]: prev }));
        message.error(e?.message || '权限保存失败');
      } finally {
        setSavingId(null);
      }
    },
    [message, rolePerms],
  );
  const toggleCell = useCallback(
    (roleId, ids, checked) => {
      const cur = rolePerms[roleId] || [];
      const nextIds = checked
        ? Array.from(new Set([...cur, ...ids]))
        : cur.filter((id) => !ids.includes(id));
      applyPerms(roleId, nextIds);
    },
    [rolePerms, applyPerms],
  );

  const allRowIds = useMemo(
    () =>
      Array.from(
        new Set(
          MATRIX_ROWS.flatMap((row) =>
            row.perms.map((p) => permToId[p]).filter(Boolean),
          ),
        ),
      ),
    [permToId],
  );

  const columns = useMemo(
    () => [
      {
        title: '权限项',
        dataIndex: 'label',
        width: 300,
        render: (v, row) => (
          <span className={row.indent ? s.rowIndent : s.rowLabel}>{v}</span>
        ),
      },
      ...roles.map((r) => ({
        title: r.name,
        key: `role-${r.id}`,
        align: 'center',
        render: (_, row) => {
          const ids = rowIds(row);
          if (!ids.length) return <span className={s.cellEmpty}>—</span>;
          const cur = rolePerms[r.id] || [];
          const owned = ids.filter((id) => cur.includes(id));
          return (
            <Checkbox
              checked={owned.length === ids.length}
              indeterminate={owned.length > 0 && owned.length < ids.length}
              disabled={savingId === r.id}
              onChange={(e) => toggleCell(r.id, ids, e.target.checked)}
            />
          );
        },
      })),
    ],
    [roles, rolePerms, savingId, rowIds, toggleCell],
  );

  /** 整列全选 / 清空 */
  const currentAll = useMemo(
    () =>
      Boolean(current) &&
      allRowIds.length > 0 &&
      allRowIds.every((id) => (rolePerms[current] || []).includes(id)),
    [current, allRowIds, rolePerms],
  );

  const onCreate = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      await createRole({
        name: values.name,
        code: values.code,
        description: values.description || '',
      });
      message.success('新增成功');
      setCreating(false);
      form.resetFields();
      await load();
    } catch (e) {
      message.error(e?.message || '新增失败');
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className={s.page}>
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>角色管理</h1>
          <p className={s.meta}>
            共 {roles.length} 个角色 · {enabledCount} 个已启用 · 覆盖{' '}
            {memberCount} 位成员
          </p>
        </div>
        <div className={s.actions}>
          <Tooltip title="后端暂未提供导出接口">
            <Button icon={<DownloadOutlined />} disabled>
              导出配置
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => {
              form.resetFields();
              setCreating(true);
            }}
          >
            新增角色
          </Button>
        </div>
      </div>

      <div className={s.cards}>
        {roles.map((r) => {
          const icon = ROLE_ICONS[r.code] || ROLE_ICONS.guest;
          const count = (rolePerms[r.id] || []).length;
          return (
            <div
              key={r.id}
              role="button"
              tabIndex={0}
              className={`${s.roleCard} ${current === r.id ? s.roleCardActive : ''}`}
              onClick={() => setCurrent(r.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') setCurrent(r.id);
              }}
            >
              <div className={s.roleHead}>
                <span
                  className={s.roleIcon}
                  style={{ background: icon.bg, color: icon.color }}
                >
                  {icon.icon}
                </span>
                <div className={s.roleTitle}>
                  <div className={s.roleName}>{r.name}</div>
                  <div className={s.roleDesc}>{r.description || '—'}</div>
                </div>
              </div>
              <div className={s.roleFoot}>
                <span className={s.roleStat}>
                  <b>{r.user_count ?? 0}</b>位成员
                </span>
                <span className={s.roleStat}>
                  <b>{count}</b>项权限
                </span>
                <span
                  className={`${s.statusPill} ${r.status === 1 ? s.statusOn : s.statusOff}`}
                >
                  <i />
                  {r.status === 1 ? '启用' : '停用'}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <div className={s.matrixCard}>
        <div className={s.matrixHead}>
          <div>
            <h2 className={s.matrixTitle}>权限矩阵</h2>
            <p className={s.matrixHint}>
              勾选 = 该角色拥有对应菜单 / 按钮权限
            </p>
          </div>
          <Button
            type="link"
            onClick={toggleColumn}
            disabled={!current}
            loading={savingId === current}
          >
            {currentAll ? '清空当前列' : '全选当前列'} ›
          </Button>
        </div>

        <Table
          className={s.table}
          rowKey="key"
          columns={columns}
          dataSource={MATRIX_ROWS}
          loading={loading}
          pagination={false}
          locale={{ emptyText: '暂无权限项' }}
        />
      </div>
      <Modal
        title="新增角色"
        open={creating}
        forceRender
        confirmLoading={saving}
        onOk={onCreate}
        onCancel={() => setCreating(false)}
        okText="保存"
        cancelText="取消"
        width={460}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="name"
            label="角色名称"
            rules={[{ required: true, message: '请输入角色名称' }]}
          >
            <Input placeholder="如：商品编辑" />
          </Form.Item>
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
          <Form.Item name="description" label="描述">
            <Input placeholder="一句话说明这个角色能做什么" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
