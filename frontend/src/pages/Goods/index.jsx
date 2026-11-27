// 引入所需钩子：回调缓存、副作用、列配置缓存、局部状态
import { useCallback, useEffect, useMemo, useState } from 'react';
// 引入 antd 组件：App（带主题的 message）、按钮、输入、下拉、间距、表格、弹窗、表单、数字输入、二次确认、分页、提示气泡
import {
  App, Button, Input, Select, Space, Table, Modal, Form, InputNumber, Popconfirm, Pagination, Tooltip,
} from 'antd';
// 引入图标：新增、导入、搜索
import {
  PlusOutlined, UploadOutlined, SearchOutlined,
} from '@ant-design/icons';
// 引入商品相关接口：列表、分类、增改、上下架、删除、批量操作
import {
  getGoods, getGoodsCategories, createGoods, updateGoods, toggleGoodsStatus,
  deleteGoods, batchGoodsStatus, batchDeleteGoods,
} from '../../api/goods';

// 引入格式化工具：金额、整数
import { money, int } from '../../utils/format';
// 引入带权限判断的按钮
import AuthButton from '../../components/AuthButton';
// 引入权限点常量与判断 Hook
import { PERM, usePermission } from '../../utils/permissions';
// 引入页面样式
import s from './index.module.scss';

/** 库存预警线：低于它库存条变橙、数字变橙 */
const WARN_STOCK = 20;
/** 库存条满格对应的库存量（用于把库存换算成进度条宽度） */
const FULL_STOCK = 400;

// 上下架状态下拉选项
const STATUS_OPTIONS = [
  { label: '已上架', value: 1 },
  { label: '已下架', value: 0 },
];

/**
 * 商品管理页
 * 功能：分页列表 + 关键字/分类/状态筛选 + 新增/编辑弹窗 + 单条与批量上下架/删除
 * 权限：按钮级 — 新增、编辑、上下架、删除、库存调整分别受不同权限点控制
 */
export default function Goods() {
  // 带主题的全局提示
  const { message } = App.useApp();
  // 弹窗表单实例（用于回填与校验）
  const [dialogForm] = Form.useForm();
  // 权限判断函数
  const { can } = usePermission();

  // 筛选表单的「未提交」值（输入框随便改，不触发请求）
  const [filters, setFilters] = useState({ keyword: '', category: undefined, status: undefined });
  // 真正用于请求的筛选条件（仅在点「查询」或「重置」时同步）
  const [params, setParams] = useState({ keyword: '', category: undefined, status: undefined });
  // 当前页码
  const [page, setPage] = useState(1);
  // 每页条数
  const [pageSize, setPageSize] = useState(10);

  // 当前页数据
  const [rows, setRows] = useState([]);
// 总条数（用于分页）
  const [total, setTotal] = useState(0);
  // 表格加载态
  const [loading, setLoading] = useState(true);
  // 分类下拉数据
  const [cats, setCats] = useState([]);
  // 勾选的行 key（id）
  const [selected, setSelected] = useState([]);
  // 自增计数器：变化即触发重新拉取列表
  const [tick, setTick] = useState(0);

  // 弹窗状态：null 关闭；{} 表示新增；{ id, ... } 表示编辑
  const [editing, setEditing] = useState(null);
  // 保存请求进行中
  const [saving, setSaving] = useState(false);
  // 批量操作进行中（防止连点重复提交）
  const [bulkLoading, setBulkLoading] = useState(false);

  // 初始化：拉取分类下拉（只执行一次，失败不影响列表使用）
  useEffect(() => {
    getGoodsCategories()
      // 接口异常返回非数组时兜底空列表
      .then((list) => setCats(list || []))
      .catch(() => setCats([]));
  }, []);

  // 列表拉取：筛选条件、页码、每页条数或手动刷新时触发
  useEffect(() => {
    // 卸载标记，避免请求回流时写已卸载组件
    let alive = true;
    // loading 由各触发点（查询 / 重置 / 翻页 / reload）在发请求前置 true，
    // effect 体里同步 setState 会触发级联渲染，被 react-hooks 规则拦下
    getGoods({ ...params, page, pageSize })
      .then((data) => {
        if (!alive) return;
        // 后端 DECIMAL 字段返回字符串（如 "899.00"），这里统一转数字，便于后续计算与格式化
        setRows(
          (data.list || []).map((r) => ({
            ...r,
            price: Number(r.price),
            stock: Number(r.stock),
            sales: Number(r.sales),
          })),
        );
        // 同步总数
        setTotal(data.total || 0);
      })
      .catch(() => {
        // 失败时清空列表，避免残留上一页数据造成误解
        if (alive) {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        // 无论成败都结束 loading
        if (alive) setLoading(false);
      });
    // 清理：作废旧请求
    return () => {
      alive = false;
    };
  }, [params, page, pageSize, tick]);

  // 弹窗打开时回填表单：编辑用行数据，新增用默认值
  useEffect(() => {
    // 弹窗未打开则不做任何事
    if (!editing) return;
    if (editing.id) {
      // 编辑：整体回填，price 转数字（表单 InputNumber 只接受数字）
      dialogForm.setFieldsValue({ ...editing, price: Number(editing.price) });
    } else {
      // 新增：给一份干净的默认值，状态默认上架
      dialogForm.setFieldsValue({
        name: '',
        sku: '',
        category: undefined,
        price: undefined,
        stock: 0,
        sales: 0,
        status: 1,
        description: '',
      });
    }
  }, [editing, dialogForm]);

  // 手动刷新：置 loading + 计数器自增
  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  // 总页数（至少 1，避免空数据时显示第 0 页）
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /** 执行查询：把「未提交」筛选值同步为请求参数，回到第一页并清空勾选 */
  const doSearch = () => {
    // 先置 loading，保证请求期间表格有反馈
    setLoading(true);
    // 同步筛选条件（对象浅拷贝，避免后续修改 filters 影响正在使用的 params）
    setParams({ ...filters });
    // 回到第一页（筛选条件变了，旧页码可能越界）
    setPage(1);
    // 清空勾选，避免批量操作作用到不在新结果里的行
    setSelected([]);
  };

/**
 * 重置筛选：清空所有条件，回到第一页并清空勾选
 */
  const doReset = () => {
    // 一份空筛选值，同时用于 filters 与 params
    const empty = { keyword: '', category: undefined, status: undefined };
    setLoading(true);
    // 重置输入框显示值
    setFilters(empty);
    // 重置请求条件
    setParams(empty);
    // 回到第一页
    setPage(1);
    // 清空勾选
    setSelected([]);
  };

/**
 * 提交弹窗表单：按 editing.id 区分新增 / 编辑
 */
  const submitDialog = async () => {
    // 触发表单校验；校验不通过会抛错并高亮字段
    const values = await dialogForm.validateFields();
    // 进入保存态（按钮显示 loading）
    setSaving(true);
    try {
      // 价格统一转数字再提交（后端期望数值类型）
      const payload = { ...values, price: Number(values.price) };
      if (editing.id) {
        // 编辑：走 PUT 更新
        await updateGoods(editing.id, payload);
        message.success('已保存');
      } else {
        // 新增：走 POST 创建
        await createGoods(payload);
        message.success('新增成功');
      }
      // 关闭弹窗
      setEditing(null);
      // 重新拉列表（新增/编辑会改变当前页数据）
      reload();
    } catch (e) {
      // 表单校验失败：antd 已高亮字段，这里静默返回，避免重复报错
      if (e?.errorFields) return;
      // 接口失败：展示后端文案或兜底
      message.error(e?.message || '保存失败');
    } finally {
      // 结束保存态
      setSaving(false);
    }
  };

/**
 * 单条上下架切换
 * @param {{ id: number|string, status: number }} row - 目标行数据
 */
  const onToggle = useCallback(async (row) => {
    try {
      // 取反：1 → 0（下架），0 → 1（上架）
      const next = row.status === 1 ? 0 : 1;
      // 提交新状态
      await toggleGoodsStatus(row.id, next);
      // 按新状态给提示
      message.success(next === 1 ? '已上架' : '已下架');
      // 刷新列表
      reload();
    } catch (e) {
      // 失败提示（后端可能返回权限或状态校验错误）
      message.error(e?.message || '操作失败');
    }
  }, [message, reload]);

/**
 * 删除单个商品
 * @param {{ id: number|string }} row - 目标行数据
 */
  const onDelete = useCallback(async (row) => {
    try {
      // 调用删除接口
      await deleteGoods(row.id);
      message.success('删除成功');
      // 从勾选集里剔除被删的 id，避免残留失效选择
      setSelected((prev) => prev.filter((k) => k !== row.id));
      // 刷新列表
      reload();
    } catch (e) {
      // 失败提示（可能存在关联数据导致无法删除）
      message.error(e?.message || '删除失败');
    }
  }, [message, reload]);

  /**
   * 批量上下架
   * @param {number} status - 目标状态：1 上架 / 0 下架
   */
  const onBatchStatus = async (status) => {
    // 进入批量处理态，禁用重复点击
    setBulkLoading(true);
    try {
      // 提交选中的 id 列表与新状态
      const res = await batchGoodsStatus(selected, status);
      // 成功提示带处理条数
      message.success(`已${status === 1 ? '上架' : '下架'} ${res.affected} 件商品`);
      // 后端会返回已不存在（已被他人删除）的 id，单独提示，避免用户困惑
      if (res.missing?.length) {
        message.warning(`${res.missing.length} 件商品已不存在，已跳过`);
      }
      // 清空勾选
      setSelected([]);
      // 刷新列表
      reload();
    } catch (e) {
      message.error(e?.message || '批量操作失败');
    } finally {
      setBulkLoading(false);
    }
  };

  /**
   * 批量删除选中商品
   * 当前页被删空时自动回退一页，避免停在空白页
   */
  const onBatchDelete = async () => {
    setBulkLoading(true);
    try {
      // 提交勾选的 id 列表
      const res = await batchDeleteGoods(selected);
      message.success(`已删除 ${res.affected} 件商品`);
      // 清空勾选
      setSelected([]);
      // 若当前页数据会被删空且不是第一页，则回退一页，避免出现空页
      if (rows.length - res.affected <= 0 && page > 1) {
        setPage(page - 1);
      }
      reload();
    } catch (e) {
      message.error(e?.message || '批量删除失败');
    } finally {
      setBulkLoading(false);
    }
  };

  // 表格列定义：用 useMemo 缓存，避免每次渲染都重建列配置引起表格重排
  const columns = useMemo(
    () => [
      {
        title: '商品信息',
        dataIndex: 'name',
        // 自定义渲染：缩略图（无图时用名称首字）+ 名称 + SKU
        render: (_, r) => (
          <div className={s.goodsCell}>
            <span className={s.thumb}>
              {r.image ? <img src={r.image} alt={r.name} /> : r.name.slice(0, 1)}
            </span>
            <span className={s.goodsText}>
              <div className={s.goodsName}>{r.name}</div>
              <div className={s.goodsMeta}>{r.sku}</div>
            </span>
          </div>
        ),
      },
      // 分类：空值显示破折号
      { title: '分类', dataIndex: 'category', width: 110, render: (v) => v || '—' },
      {
        title: '价格',
        dataIndex: 'price',
        width: 110,
        align: 'left',
        // 统一货币格式
        render: (v) => money(v),
      },
      {
        title: '库存',
        dataIndex: 'stock',
        width: 140,
        // 库存单元格：数字 + 进度条，低于预警线变橙
        render: (v) => {
          // 是否触发预警
          const warn = v < WARN_STOCK;
          // 进度条宽度：按 FULL_STOCK 折算，最低 3% 保证可见，最高 100%
          const width = Math.min(100, Math.max(3, (v / FULL_STOCK) * 100));
          return (
            <div className={s.stockCell}>
              {/* 库存数字：预警时用 CSS 变量 --warn 着色 */}
              <span className={s.stockNum} style={warn ? { color: 'var(--warn)' } : undefined}>
                {int(v)}
              </span>
              {/* 库存条轨道 */}
              <span className={s.stockBar}>
                {/* 进度条：宽度动态，颜色按是否预警切换 */}
                <span style={{ width: `${width}%`, background: warn ? 'var(--warn)' : 'var(--success)' }} />
              </span>
            </div>
          );
        },
      },
      // 销量：千分位整数
      { title: '销量', dataIndex: 'sales', width: 90, align: 'left', render: (v) => int(v) },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
        // 状态胶囊：圆点 + 文案，上下架不同配色
        render: (v) => (
          <span className={`${s.statusPill} ${v === 1 ? s.statusUp : s.statusDown}`}>
            <i />
            {v === 1 ? '已上架' : '已下架'}
          </span>
        ),
      },
      {
        title: '操作',
        key: 'ops',
        width: 170,
        // 操作列：编辑 / 上下架 / 删除，均为权限按钮
        render: (_, r) => (
          <Space size={0} separator={<span className={s.dot}>·</span>}>
            <AuthButton type="link" size="small" className={s.opBtn} permission={PERM.GOODS_UPDATE} onClick={() => setEditing(r)}>
              编辑
            </AuthButton>
            {/* 上下架按钮文案随当前状态变化 */}
            <AuthButton type="link" size="small" className={s.opBtn} permission={PERM.GOODS_STATUS} onClick={() => onToggle(r)}>
              {r.status === 1 ? '下架' : '上架'}
            </AuthButton>
            {/* 删除前二次确认，确认按钮标红 */}
            <Popconfirm
              title="删除这个商品？"
              description="删除后不可恢复"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(r)}
            >
              <AuthButton
                type="link"
                size="small"
                danger
                className={s.opBtn}
                permission={PERM.GOODS_DELETE}
              >
                删除
              </AuthButton>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    // 依赖两个回调，保证列内闭包拿到最新引用
    [onToggle, onDelete],
  );

  return (
    <div className={s.page}>
      {/* 页头：标题 + 统计 + 右上操作 */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>商品管理</h1>
          <p className={s.meta}>共 {total} 件商品 · 库存预警线 {WARN_STOCK} 件</p>
        </div>
        <div className={s.actions}>
          {/* 导入按钮：后端暂无接口，禁用并用 Tooltip 说明原因 */}
          <Tooltip title="后端暂未提供导入接口">
            <Button icon={<UploadOutlined />} disabled>
              导入
            </Button>
          </Tooltip>
          {/* 新增：受 GOODS_CREATE 权限控制 */}
          <AuthButton
            type="primary"
            icon={<PlusOutlined />}
            permission={PERM.GOODS_CREATE}
            onClick={() => setEditing({})}
          >
            新增商品
          </AuthButton>
        </div>
      </div>

      {/* 筛选工具条 */}
      <div className={s.toolbar}>
        <Input
          className={s.search}
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--text-3)' }} />}
          placeholder="搜索商品名称 / SKU"
          value={filters.keyword}
          // 只更新本地筛选值，不发请求
          onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
          // 回车即查询，符合常见搜索习惯
          onPressEnter={doSearch}
        />
        <Select
          className={s.selectCat}
          allowClear
          placeholder="全部分类"
          value={filters.category}
          // 分类来自后端裸字符串数组，映射成 options
          options={cats.map((c) => ({ label: c, value: c }))}
          onChange={(v) => setFilters((f) => ({ ...f, category: v }))}
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
        {/* 右侧结果提示 */}
        <span className={s.toolbarRight}>共筛选出 {total} 条</span>
      </div>

      {/* 表格卡片：含批量操作条、表格、分页 */}
      <div className={s.tableCard}>
        {/* 有勾选时才显示批量操作条 */}
        {selected.length > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkText}>已选 {selected.length} 项</span>
            <div className={s.bulkActions}>
              {/* 批量上架 */}
              <AuthButton size="small" permission={PERM.GOODS_STATUS} loading={bulkLoading} onClick={() => onBatchStatus(1)}>
                批量上架
              </AuthButton>
              {/* 批量下架 */}
              <AuthButton size="small" permission={PERM.GOODS_STATUS} loading={bulkLoading} onClick={() => onBatchStatus(0)}>
                批量下架
              </AuthButton>
              {/* 批量删除：二次确认标题里带上数量，降低误操作 */}
              <Popconfirm
                title={`删除选中的 ${selected.length} 件商品？`}
                description="删除后不可恢复"
                okText="删除"
                okButtonProps={{ danger: true }}
                onConfirm={onBatchDelete}
              >
                <AuthButton
                  size="small"
                  danger
                  loading={bulkLoading}
                  permission={PERM.GOODS_DELETE}
                >
                  批量删除
                </AuthButton>
              </Popconfirm>
              <Button size="small" type="text" onClick={() => setSelected([])}>
                取消选择
              </Button>
            </div>
          </div>
        )}

        <Table
          className={s.table}
          // 行唯一键用 id
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          // 关闭内置分页，改用下方独立分页器（便于自定义统计文案）
          pagination={false}
          // 窄屏横向滚动，避免列被挤压
          scroll={{ x: 900 }}
          // 多选：受控模式
          rowSelection={{
            selectedRowKeys: selected,
            // 跨页保留勾选（翻到下一页仍记住之前的选择）
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelected(keys),
          }}
          // 空数据文案
          locale={{ emptyText: '没有符合条件的商品' }}
        />

        {/* 底部：统计 + 分页 */}
        <div className={s.footer}>
          <span className={s.footerLeft}>
            已选 {selected.length} 项 · 共 {total} 条 · 第 {page} / {pageCount} 页
          </span>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50]}
            onChange={(p, ps) => {
              // 切换每页条数时回到第一页，否则沿用点击的页码
              const nextPage = ps !== pageSize ? 1 : p;
              const nextSize = ps !== pageSize ? ps : pageSize;
              // 点当前页 / 当前条数不会真的变，直接返回，避免 loading 卡在 true
              if (nextPage === page && nextSize === pageSize) return;
              setLoading(true);
              if (ps !== pageSize) {
                // 改每页条数：重置到第一页
                setPageSize(ps);
                setPage(1);
              } else {
                // 仅翻页
                setPage(p);
              }
              // 翻页保留选中（preserveSelectedRowKeys）
            }}
          />
        </div>
      </div>

      {/* 新增 / 编辑弹窗 */}
      <Modal
        title={editing?.id ? '编辑商品' : '新增商品'}
        open={!!editing}
        onCancel={() => setEditing(null)}
        // 点「保存」走统一提交逻辑
        onOk={submitDialog}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={560}
        // forceRender：提前渲染表单，避免首次打开时 setFieldsValue 找不到字段实例
        forceRender
      >
        <Form form={dialogForm} layout="vertical" style={{ marginTop: 12 }}>
          {/* 商品名称：必填 + 长度限制 */}
          <Form.Item
            label="商品名称"
            name="name"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input placeholder="如 无线蓝牙耳机 Pro" maxLength={100} />
          </Form.Item>

          {/* 一行两列：SKU 与分类 */}
          <div className={s.formRow}>
            <Form.Item
              label="SKU"
              name="sku"
              rules={[
                { required: true, message: '请输入 SKU' },
                // 只允许字母、数字与连字符
                { pattern: /^[A-Za-z0-9-]+/, message: '只能用字母、数字和连字符' },
              ]}
            >
              <Input placeholder="如 SKU-EAR-001" maxLength={50} />
            </Form.Item>
            <Form.Item label="分类" name="category">
              <Select
                allowClear
                placeholder="选择分类"
                options={cats.map((c) => ({ label: c, value: c }))}
              />
            </Form.Item>
          </div>

          {/* 一行三列：价格、库存、销量 */}
          <div className={s.formRow}>
            <Form.Item
              label="价格（元）"
              name="price"
              rules={[{ required: true, message: '请输入价格' }]}
            >
              {/* 价格：两位小数，不允许负数 */}
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item
              label="库存"
              name="stock"
              // 无库存调整权限时给悬浮说明，并禁用输入
              tooltip={can(PERM.GOODS_STOCK) ? undefined : '当前角色无库存调整权限'}
            >
              <InputNumber
                min={0}
                precision={0}
                style={{ width: '100%' }}
                disabled={!can(PERM.GOODS_STOCK)}
              />
            </Form.Item>
            <Form.Item label="销量" name="sales">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          {/* 状态：无上下架权限时禁用，并说明原因 */}
          <Form.Item
            label="状态"
            name="status"
            tooltip={can(PERM.GOODS_STATUS) ? undefined : '当前角色无商品上下架权限'}
          >
            <Select options={STATUS_OPTIONS} disabled={!can(PERM.GOODS_STATUS)} />
          </Form.Item>

          {/* 描述：选填，带字数统计 */}
          <Form.Item label="商品描述" name="description">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
