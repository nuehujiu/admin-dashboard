import { useState, useCallback, useMemo, useEffect } from 'react';
import s from './index.module.scss';
import {
  Button,
  Form,
  App,
  Input,
  Select,
  Table,
  Popconfirm,
  Switch,
  Space,
  Pagination,
  Modal,
} from 'antd';
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import {
  batchUserStatus,
  toggleUserStatus,
  getRoles,
  getUsers,
  getUsersSummary,
  updateUser,
  createUser,
  deleteUser,
} from '../../api/users';

const STATUS_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];
const SORT_OPTIONS = [
  { label: '最近登录', value: 'recent' },
  { label: '默认排序', value: 'default' },
];
const AVATAR_COLORS = [
  '#F5611D',
  '#2F8F86',
  '#C77A28',
  '#5D5751',
  '#B9400A',
  '#1F9D55',
];

function formatLogin(v) {
  if (!v) return '从未登录';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return String(v);
  const diff = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}
const pad = (n) => String(n).padStart(2, '0');

const dayStart = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

export default function Users() {
  const navigate = useNavigate();
  const [form] = Form.useForm();
  const { message } = App.useApp();
  const [summary, setSummary] = useState({
    total: 0,
    weekNew: 0,
    active: 0,
    disabled: 0,
  });
  const [editing, setEditing] = useState(null);
  const [filters, setFilters] = useState({
    keyword: '',
    role_id: undefined,
    status: undefined,
  });
  const [page, setPage] = useState(1);
  const [params, setParams] = useState({
    keyword: '',
    role_id: undefined,
    status: undefined,
  });
  const [selected, setSelected] = useState([]);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);
  const [sort, setSort] = useState('recent');
  const [bulkLoading, setBulkLoading] = useState(false);
  const [rows, setRows] = useState([]);
  const [switching, setSwitching] = useState([]);
  const [pageSize, setPageSize] = useState(8);
  const [tick, setTick] = useState(0);
  const [total, setTotal] = useState(0);
  const [saving, setSaving] = useState(false);

  // 角色下拉
  useEffect(() => {
    getRoles()
      .then((list) => setRoles(list || []))
      .catch(() => setRoles([]));
  }, []);

  // 列表
  useEffect(() => {
    let alive = true;
    getUsers({
      ...params,
      page,
      pageSize,
      sort: sort === 'recent' ? 'recent' : undefined,
    })
      .then((data) => {
        if (!alive) return;
        setRows(data.list || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (!alive) return;
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [params, page, pageSize, sort, tick]);

  // 概览（页头「共 N 位成员 · 本周新增 M 位」）
  useEffect(() => {
    getUsersSummary()
      .then((d) =>
        setSummary(d || { total: 0, active: 0, disabled: 0, weekNew: 0 }),
      )
      .catch(() =>
        setSummary({ total: 0, active: 0, disabled: 0, weekNew: 0 }),
      );
  }, [tick]);

  const openEdit = useCallback(
    (row) => {
      setEditing(row || {});
      form.setFieldsValue(
        row
          ? {
              nickname: row.nickname,
              username: row.username,
              email: row.email,
              role_id: row.role_id,
              password: '',
            }
          : {
              nickname: '',
              username: '',
              email: '',
              role_id: roles[0]?.id,
              password: '',
            },
      );
    },
    [form, roles],
  );

  const doSearch = () => {
    setPage(1);
    setSelected([]);
    setLoading(true);
    setParams({ ...filters });
  };

  const doReset = () => {
    const empty = { keyword: '', role_id: undefined, status: undefined };
    setFilters(empty);
    setParams(empty);
    setPage(1);
    setSort('recent');
    setSelected([]);
    setLoading(true);
  };

  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  const onBatchStatus = async (status) => {
    if (!selected.length) {
      message.info('请先选择用户');
      return;
    }
    setBulkLoading(true);
    try {
      const res = await batchUserStatus(selected, status);
      message.success(
        `已${status === 1 ? '启用' : '禁用'} ${res.affected} 个用户`,
      );
      if (res.skipped?.length) message.warning('当前登录账号已自动跳过');
      if (res.missing?.length)
        message.warning(`${res.missing.length} 个用户已不存在，已跳过`);
      setSelected([]);
      if (rows.length - res.affected <= 0 && page > 1) setPage(page - 1);
      reload();
    } catch (e) {
      message.error(e?.message || '批量操作失败');
    } finally {
      setBulkLoading(false);
    }
  };

  const onToggleStatus = useCallback(
    async (row, next) => {
      setSwitching((prev) => [...prev, row.id]);
      try {
        await toggleUserStatus(row.id, next ? 1 : 0);
        message.success(
          `${next ? '已启用' : '已禁用'} ${row.nickname || row.username}`,
        );
        reload();
      } catch (e) {
        message.error(e?.message || '操作失败');
      } finally {
        setSwitching((prev) => prev.filter((id) => id !== row.id));
      }
    },
    [message, reload],
  );

  const onDelete = useCallback(
    async (row) => {
      try {
        await deleteUser(row.id);
        message.success('删除成功');
        setSelected((prev) => prev.filter((k) => k !== row.id));
        if (rows.length === 1 && page > 1) setPage(page - 1);
        reload();
      } catch (e) {
        message.error(e?.message || '删除失败');
      }
    },
    [message, rows.length, page, reload],
  );

  const columns = useMemo(
    () => [
      {
        title: '用户',
        dataIndex: 'nickname',
        width: 240,
        render: (_, r) => (
          <div className={s.userCell}>
            <span
              className={s.avatar}
              style={{ background: AVATAR_COLORS[r.id % AVATAR_COLORS.length] }}
            >
              {(r.nickname || r.username || '?').slice(0, 1)}
            </span>
            <span className={s.userText}>
              <div className={s.userName}>{r.nickname || r.username}</div>
              <div className={s.userMeta}>
                {r.username} · ID {r.id}
              </div>
            </span>
          </div>
        ),
      },
      {
        title: '邮箱',
        dataIndex: 'email',
        width: 210,
        render: (v) => v || '—',
      },
      {
        title: '角色',
        dataIndex: 'role_name',
        width: 120,
        render: (v, r) => (
          <span className={`${s.rolePill} ${roleClass(r.role_id)}`}>
            {v || '—'}
          </span>
        ),
      },
      {
        title: '状态',
        dataIndex: 'status',
        width: 96,
        render: (v, r) => (
          <Switch
            checked={v === 1}
            loading={switching.includes(r.id)}
            onChange={(checked) => onToggleStatus(r, checked)}
          />
        ),
      },
      {
        title: '最近登录',
        dataIndex: 'last_login_at',
        width: 160,
        render: (v) => <span className={s.loginText}>{formatLogin(v)}</span>,
      },
      {
        title: '操作',
        key: 'ops',
        width: 160,
        render: (_, r) => (
          <Space size={0} separator={<span className={s.dot}>·</span>}>
            <Button
              type="link"
              size="small"
              className={s.opBtn}
              onClick={() => openEdit(r)}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              className={s.opBtn}
              onClick={() => onToggleStatus(r, r.status !== 1)}
            >
              {r.status === 1 ? '禁用' : '启用'}
            </Button>
            <Popconfirm
              title="删除这个用户？"
              description="删除后不可恢复"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(r)}
            >
              <Button type="link" size="small" className={s.opBtn} danger>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [switching, onToggleStatus, onDelete, openEdit],
  );

  const roleClass = (id) =>
    id === 1 ? s.roleAdmin : id === 2 ? s.roleOp : s.roleOther;

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const onSubmit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        const payload = {
          nickname: values.nickname,
          email: values.email,
          role_id: values.role_id,
        };
        if (values.password) payload.password = values.password;
        await updateUser(editing.id, payload);
        message.success('保存成功');
      } else {
        await createUser({
          username: values.username,
          password: values.password,
          nickname: values.nickname,
          email: values.email,
          role_id: values.role_id,
        });
        message.success('新增成功');
      }
      setEditing(null);
      reload();
    } catch (e) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={s.page}>
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>用户管理</h1>
          <p className={s.meta}>
            共 {summary.total} 位成员 · 本周新增 {summary.weekNew} 位
          </p>
        </div>
        <div className={s.actions}>
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => navigate('/system/roles')}
          >
            角色配置
          </Button>
          <Button
            type="primary"
            onClick={() => openEdit(null)}
            icon={<PlusOutlined />}
          >
            新增用户
          </Button>
        </div>
      </div>

      <div className={s.toolbar}>
        <Input
          className={s.serach}
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--text-3)' }} />}
          placeholder="姓名/邮箱/登录名"
          value={filters.keyword}
          onChange={(e) =>
            setFilters((f) => ({ ...f, keyword: e.target.value }))
          }
          onPressEnter={doSearch}
        ></Input>
        <Select
          className={s.selectRole}
          allowClear
          placeholder="全部角色"
          value={filters.role_id}
          options={roles.map((r) => ({ label: r.name, value: r.id }))}
          onChange={(v) => setFilters((f) => ({ ...f, role_id: v }))}
        />
        <Select
          className={s.selectStatus}
          allowClear
          placeholder="全部状态"
          value={filters.status}
          options={STATUS_OPTIONS}
          onChange={(v) => setFilters((f) => ({ ...f, status: v }))}
        />
        <Button type="primary" onClick={doSearch}>
          查询
        </Button>
        <Button type="text" onClick={doReset}>
          重置
        </Button>
        <Select
          className={s.sortSelect}
          value={sort}
          options={SORT_OPTIONS}
          onChange={(v) => {
            setSort(v);
            setPage(1);
            setLoading(true);
          }}
        />
      </div>
      <div className={s.tableCard}>
        <div className={s.bulkBar}>
          <span className={s.bulkText}>已选{selected.length}项</span>
          <div className={s.bulkActions}>
            <Button
              size="small"
              disabled={!selected.length}
              loading={bulkLoading}
              onClick={() => onBatchStatus(1)}
            >
              批量启用
            </Button>
            <Button
              size="small"
              disabled={!selected.length}
              loading={bulkLoading}
              onClick={() => onBatchStatus(0)}
            >
              批量禁用
            </Button>
          </div>
          <span className={s.bulkHint}>
            {sort === 'recent'
              ? '列表按最近登录时间排序'
              : '列表按创建时间排序'}
          </span>
        </div>
        <Table
          className={s.table}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={{ x: 1000 }}
          rowSelection={{
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelected(keys),
          }}
          locale={{ emptyText: '没有符合条件的用户' }}
        />
        <div className={s.footer}>
          <span className={s.footerLeft}>
            共 {total} 条 · 第 {page} / {pageCount} 页
          </span>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[8, 16, 32]}
            onChange={(p, ps) => {
              const nextPage = ps !== pageSize ? 1 : p;
              const nextSize = ps !== pageSize ? ps : pageSize;
              if (nextPage === page && nextSize === pageSize) return;
              setLoading(true);
              if (ps !== pageSize) {
                setPageSize(ps);
                setPage(1);
              } else {
                setPage(p);
              }
            }}
          />
        </div>
      </div>
      <Modal
        title={editing?.id ? '编辑用户' : '新增用户'}
        open={Boolean(editing)}
        forceRender
        confirmLoading={saving}
        onOk={onSubmit}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            name="username"
            label="登录名"
            rules={[{ required: !editing?.id, message: '请输入登录名' }]}
          >
            <Input
              placeholder="用于登录，创建后不可修改"
              disabled={Boolean(editing?.id)}
            />
          </Form.Item>
          <Form.Item
            name="password"
            label={editing?.id ? '新密码' : '密码'}
            rules={
              editing?.id
                ? [{ min: 6, message: '密码至少 6 位' }]
                : [
                    { required: true, message: '请输入密码' },
                    { min: 6, message: '密码至少 6 位' },
                  ]
            }
          >
            <Input.Password
              placeholder={editing?.id ? '留空则不修改密码' : '至少 6 位'}
            />
          </Form.Item>
          <Form.Item name="nickname" label="昵称">
            <Input placeholder="显示在列表中的名字" />
          </Form.Item>
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input placeholder="name@example.com" />
          </Form.Item>
          <Form.Item
            name="role_id"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              placeholder="请选择角色"
              options={roles.map((r) => ({ label: r.name, value: r.id }))}
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
