// 引入钩子：状态、回调缓存、记忆化、副作用
import { useState, useCallback, useMemo, useEffect } from 'react';
// 引入页面样式
import s from './index.module.scss';
// 引入 antd 组件：按钮、表单、App、输入框、选择器、表格、气泡确认、开关、间距、分页、弹窗
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
// 引入图标：角色配置、新增、搜索
import {
  SafetyCertificateOutlined,
  PlusOutlined,
  SearchOutlined,
} from '@ant-design/icons';
// 引入路由跳转（跳角色配置页）
import { useNavigate } from 'react-router-dom';
// 引入用户与角色接口
import {
  batchUserStatus, // 批量改状态
  toggleUserStatus, // 单个改状态
  getRoles, // 角色下拉
  getUsers, // 分页列表
  getUsersSummary, // 页头统计
  updateUser, // 编辑
  createUser, // 新增
  deleteUser, // 删除
} from '../../api/users';
// 引入权限按钮（无权限自动隐藏）
import AuthButton from '../../components/AuthButton';
// 引入权限点与判断 Hook
import { PERM, usePermission } from '../../utils/permissions';

// 状态筛选项
const STATUS_OPTIONS = [
  { label: '启用', value: 1 },
  { label: '禁用', value: 0 },
];
// 排序方式：最近登录 / 默认（创建时间）
const SORT_OPTIONS = [
  { label: '最近登录', value: 'recent' },
  { label: '默认排序', value: 'default' },
];
// 文字头像的调色板：按用户 id 取模分配，保证同一用户颜色稳定
const AVATAR_COLORS = [
  '#F5611D',
  '#2F8F86',
  '#C77A28',
  '#5D5751',
  '#B9400A',
  '#1F9D55',
];

/**
 * 把后端时间字符串格式化成「今天 HH:mm / 昨天 HH:mm / YYYY-MM-DD HH:mm」
 * @param {string} v - 原始时间（形如 "2026-11-27 10:20:30"）
 * @returns {string}
 */
function formatLogin(v) {
  // 空值说明从未登录
  if (!v) return '从未登录';
  // 把空格换成 T，规避部分浏览器对 "yyyy-mm-dd hh:mm:ss" 解析不一致
  const d = new Date(String(v).replace(' ', 'T'));
  // 解析失败则原样返回，避免显示 Invalid Date
  if (Number.isNaN(d.getTime())) return String(v);
  // 以「天」为单位计算差值：86400000 = 一天的毫秒数
  const diff = Math.round((dayStart(new Date()) - dayStart(d)) / 86400000);
  // 时分
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (diff === 0) return `今天 ${hm}`;
  if (diff === 1) return `昨天 ${hm}`;
  // 更早则显示完整日期
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${hm}`;
}
// 两位补零
const pad = (n) => String(n).padStart(2, '0');

// 取某天 0 点的时间戳（用于按自然日比较）
const dayStart = (d) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/**
 * 用户管理页
 * 结构：页头统计 + 工具栏筛选 + 表格（含批量操作、分页）+ 新增/编辑弹窗
 * 取数要点：filters 是「输入中的条件」，params 是「已生效的查询条件」，
 *         点「查询」才把 filters 提交成 params，避免每敲一个字就请求
 */
export default function Users() {
  // 路由（跳角色配置）
  const navigate = useNavigate();
  // 新增 / 编辑共用表单
  const [form] = Form.useForm();
  // 消息提示
  const { message } = App.useApp();
  // 权限判断
  const { can } = usePermission();
  // 页头统计
  const [summary, setSummary] = useState({
    total: 0, // 总人数
    weekNew: 0, // 本周新增
    active: 0, // 启用数
    disabled: 0, // 禁用数
  });
  // 弹窗编辑对象：null 关闭、{} 新增、有 id 为编辑
  const [editing, setEditing] = useState(null);
  // 工具栏输入中的条件
  const [filters, setFilters] = useState({
    keyword: '',
    role_id: undefined,
    status: undefined,
  });
  // 当前页码
  const [page, setPage] = useState(1);
  // 已提交生效的查询条件
  const [params, setParams] = useState({
    keyword: '',
    role_id: undefined,
    status: undefined,
  });
  // 已勾选的用户 id
  const [selected, setSelected] = useState([]);
  // 表格加载态
  const [loading, setLoading] = useState(true);
  // 角色下拉数据
  const [roles, setRoles] = useState([]);
  // 排序方式
  const [sort, setSort] = useState('recent');
  // 批量操作进行中
  const [bulkLoading, setBulkLoading] = useState(false);
  // 当前页数据
  const [rows, setRows] = useState([]);
  // 正在切换状态的用户 id（控制开关 loading）
  const [switching, setSwitching] = useState([]);
  // 每页条数
  const [pageSize, setPageSize] = useState(8);
  // 刷新计数器：自增即触发列表与统计重新请求
  const [tick, setTick] = useState(0);
  // 总条数
  const [total, setTotal] = useState(0);
  // 表单保存中
  const [saving, setSaving] = useState(false);

  // 角色下拉：只在挂载时取一次（角色变动需刷新页面）
  useEffect(() => {
    getRoles()
      .then((list) => setRoles(list || []))
      .catch(() => setRoles([]));
  }, []);

  // 列表：params / page / pageSize / sort 变化或手动刷新时重新请求
  useEffect(() => {
    // alive 标记：组件卸载或依赖变化时丢弃过期响应，避免旧数据覆盖新数据
    let alive = true;
    getUsers({
      ...params,
      page,
      pageSize,
      // 只在「最近登录」模式下传 sort，其它情况走后端默认
      sort: sort === 'recent' ? 'recent' : undefined,
    })
      .then((data) => {
        if (!alive) return;
        setRows(data.list || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (!alive) return;
        // 出错时置空，避免残留上一页数据
        setRows([]);
        setTotal(0);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    // 清理：作废本次请求的结果
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

  /**
   * 打开新增 / 编辑弹窗
   * @param {object|null} row - 传入用户行=编辑；传 null=新增
   */
  const openEdit = useCallback(
    (row) => {
      // 编辑时存整行，新增时用空对象
      setEditing(row || {});
      // 回填表单：编辑带出已有值、密码留空（代表不改）；新增默认选中第一个角色
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

  /** 执行查询：把输入条件提交为生效条件，并回到第一页、清空勾选 */
  const doSearch = () => {
    setPage(1);
    setSelected([]);
    setLoading(true);
    setParams({ ...filters });
  };

  /** 重置：清空全部条件与排序，回到第一页 */
  const doReset = () => {
    const empty = { keyword: '', role_id: undefined, status: undefined };
    setFilters(empty);
    setParams(empty);
    setPage(1);
    setSort('recent');
    setSelected([]);
    setLoading(true);
  };

  /** 重新拉取列表与统计（tick 自增触发两个 useEffect） */
  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  /**
   * 批量启用 / 禁用
   * @param {0|1} status - 目标状态
   */
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
      // 后端会跳过当前登录账号（不能把自己禁用）
      if (res.skipped?.length) message.warning('当前登录账号已自动跳过');
      // 勾选的用户可能已被别人删除
      if (res.missing?.length)
        message.warning(`${res.missing.length} 个用户已不存在，已跳过`);
      setSelected([]);
      // 本页数据被全部处理完且不在第一页时，回退一页避免空白页
      if (rows.length - res.affected <= 0 && page > 1) setPage(page - 1);
      reload();
    } catch (e) {
      message.error(e?.message || '批量操作失败');
    } finally {
      setBulkLoading(false);
    }
  };

  /**
   * 单个启用 / 禁用
   * @param {object} row - 用户行
   * @param {boolean} next - true=启用
   */
  const onToggleStatus = useCallback(
    async (row, next) => {
      // 加入 switching，让该行开关显示 loading
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
        // 无论成功失败都移除 loading 标记
        setSwitching((prev) => prev.filter((id) => id !== row.id));
      }
    },
    [message, reload],
  );

  /** 删除单个用户 */
  const onDelete = useCallback(
    async (row) => {
      try {
        await deleteUser(row.id);
        message.success('删除成功');
        // 从勾选集合中移除
        setSelected((prev) => prev.filter((k) => k !== row.id));
        // 删的是本页最后一条且不在第一页，回退一页
        if (rows.length === 1 && page > 1) setPage(page - 1);
        reload();
      } catch (e) {
        message.error(e?.message || '删除失败');
      }
    },
    [message, rows.length, page, reload],
  );

  // 表格列定义：依赖 switching / 各回调，用 useMemo 避免每次渲染重建列
  const columns = useMemo(
    () => [
      {
        title: '用户',
        dataIndex: 'nickname',
        width: 240,
        // 头像 + 昵称 + 登录名/ID 两行信息
        render: (_, r) => (
          <div className={s.userCell}>
            <span
              className={s.avatar}
              // 按 id 取模选色，同一用户颜色恒定
              style={{ background: AVATAR_COLORS[r.id % AVATAR_COLORS.length] }}
            >
              {/* 无头像时用名字首字 */}
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
        // 空邮箱显示破折号
        render: (v) => v || '—',
      },
      {
        title: '角色',
        dataIndex: 'role_name',
        width: 120,
        // 按角色 id 给不同配色
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
        // 开关直接改状态；无 USER_UPDATE 权限则禁用
        render: (v, r) => (
          <Switch
            checked={v === 1}
            loading={switching.includes(r.id)}
            disabled={!can(PERM.USER_UPDATE)}
            onChange={(checked) => onToggleStatus(r, checked)}
          />
        ),
      },
      {
        title: '最近登录',
        dataIndex: 'last_login_at',
        width: 160,
        // 友好时间显示
        render: (v) => <span className={s.loginText}>{formatLogin(v)}</span>,
      },
      {
        title: '操作',
        key: 'ops',
        width: 160,
        // 编辑 / 启停 / 删除，用中点分隔
        render: (_, r) => (
          <Space size={0} separator={<span className={s.dot}>·</span>}>
            <AuthButton
              type="link"
              size="small"
              className={s.opBtn}
              permission={PERM.USER_UPDATE}
              onClick={() => openEdit(r)}
            >
              编辑
            </AuthButton>
            {/* 文案随当前状态取反 */}
            <AuthButton
              type="link"
              size="small"
              className={s.opBtn}
              permission={PERM.USER_UPDATE}
              onClick={() => onToggleStatus(r, r.status !== 1)}
            >
              {r.status === 1 ? '禁用' : '启用'}
            </AuthButton>
            {/* 删除前二次确认 */}
            <Popconfirm
              title="删除这个用户？"
              description="删除后不可恢复"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(r)}
            >
              <AuthButton
                type="link"
                size="small"
                className={s.opBtn}
                danger
                permission={PERM.USER_DELETE}
              >
                删除
              </AuthButton>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [switching, onToggleStatus, onDelete, openEdit, can],
  );

  // 角色配色类名映射（声明在 columns 之后，实际在渲染单元格时才调用，不触发 TDZ）
  const roleClass = (id) =>
    id === 1 ? s.roleAdmin : id === 2 ? s.roleOp : s.roleOther;

  // 总页数（至少 1，避免 0/0 显示）
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /** 提交新增 / 编辑 */
  const onSubmit = async () => {
    // 校验表单
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      if (editing?.id) {
        // 编辑：只提交可变字段（登录名不可改）
        const payload = {
          nickname: values.nickname,
          email: values.email,
          role_id: values.role_id,
        };
        // 密码留空表示不修改，非空才带上
        if (values.password) payload.password = values.password;
        await updateUser(editing.id, payload);
        message.success('保存成功');
      } else {
        // 新增：登录名 + 密码必填
        await createUser({
          username: values.username,
          password: values.password,
          nickname: values.nickname,
          email: values.email,
          role_id: values.role_id,
        });
        message.success('新增成功');
      }
      // 关弹窗并刷新
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
      {/* 页头：标题 + 统计 + 操作 */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>用户管理</h1>
          <p className={s.meta}>
            共 {summary.total} 位成员 · 本周新增 {summary.weekNew} 位
          </p>
        </div>
        <div className={s.actions}>
          {/* 跳转到角色管理页 */}
          <Button
            icon={<SafetyCertificateOutlined />}
            onClick={() => navigate('/system/roles')}
          >
            角色配置
          </Button>
          {/* 新增用户：受 USER_CREATE 权限控制 */}
          <AuthButton
            type="primary"
            onClick={() => openEdit(null)}
            icon={<PlusOutlined />}
            permission={PERM.USER_CREATE}
          >
            新增用户
          </AuthButton>
        </div>
      </div>

      {/* 工具栏：关键字 + 角色 + 状态 + 查询/重置 + 排序 */}
      <div className={s.toolbar}>
        <Input
          className={s.serach}
          allowClear
          // 图标颜色用 CSS 变量，与主题色联动
          prefix={<SearchOutlined style={{ color: 'var(--text-3)' }} />}
          placeholder="姓名/邮箱/登录名"
          value={filters.keyword}
          onChange={(e) =>
            setFilters((f) => ({ ...f, keyword: e.target.value }))
          }
          // 回车等同点查询
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
        {/* 排序切换：改变即重新从第一页取数 */}
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

      {/* 表格卡片 */}
      <div className={s.tableCard}>
        {/* 批量操作条 + 当前排序说明 */}
        <div className={s.bulkBar}>
          <span className={s.bulkText}>已选{selected.length}项</span>
          <div className={s.bulkActions}>
            <AuthButton
              size="small"
              permission={PERM.USER_UPDATE}
              disabled={!selected.length}
              loading={bulkLoading}
              onClick={() => onBatchStatus(1)}
            >
              批量启用
            </AuthButton>
            <AuthButton
              size="small"
              permission={PERM.USER_UPDATE}
              disabled={!selected.length}
              loading={bulkLoading}
              onClick={() => onBatchStatus(0)}
            >
              批量禁用
            </AuthButton>
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
          // 自己渲染分页（带页码/条数信息），关闭内置分页
          pagination={false}
          // 窄屏时横向滚动，列宽合计 1000
          scroll={{ x: 1000 }}
          rowSelection={{
            selectedRowKeys: selected,
            // 跨页保留勾选（切换页码不丢选择）
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelected(keys),
          }}
          locale={{ emptyText: '没有符合条件的用户' }}
        />
        {/* 底部：统计信息 + 分页器 */}
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
              // 改了每页条数就回到第一页，否则按点击页码跳转
              const nextPage = ps !== pageSize ? 1 : p;
              const nextSize = ps !== pageSize ? ps : pageSize;
              // 无变化直接返回，避免无意义请求
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

      {/* 新增 / 编辑用户弹窗 */}
      <Modal
        title={editing?.id ? '编辑用户' : '新增用户'}
        open={Boolean(editing)}
        // 提前渲染表单，保证 setFieldsValue 有实例
        forceRender
        confirmLoading={saving}
        onOk={onSubmit}
        onCancel={() => setEditing(null)}
        okText="保存"
        cancelText="取消"
        width={480}
      >
        <Form form={form} layout="vertical" style={{ marginTop: 12 }}>
          {/* 登录名：新增必填，编辑时禁用（创建后不可改） */}
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
          {/* 密码：新增必填；编辑时选填（留空=不改），两者都要求至少 6 位 */}
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
          {/* 昵称：选填，为空时列表回退显示登录名 */}
          <Form.Item name="nickname" label="昵称">
            <Input placeholder="显示在列表中的名字" />
          </Form.Item>
          {/* 邮箱：选填，但填了必须符合邮箱格式 */}
          <Form.Item
            name="email"
            label="邮箱"
            rules={[{ type: 'email', message: '邮箱格式不正确' }]}
          >
            <Input placeholder="name@example.com" />
          </Form.Item>
          {/* 角色：必选，决定该用户能看到的菜单与按钮 */}
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
