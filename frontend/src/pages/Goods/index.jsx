import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  App, Button, Input, Select, Space, Table, Modal, Form, InputNumber, Popconfirm, Pagination, Tooltip,
} from 'antd';
import {
  PlusOutlined, UploadOutlined, SearchOutlined,
} from '@ant-design/icons';
import {
  getGoods, getGoodsCategories, createGoods, updateGoods, toggleGoodsStatus,
  deleteGoods, batchGoodsStatus, batchDeleteGoods,
} from '../../api/goods';

import { money, int } from '../../utils/format';
import s from './index.module.scss';

/** 库存预警线：低于它库存条变橙、数字变橙 */
const WARN_STOCK = 20;
/** 库存条满格对应的库存量 */
const FULL_STOCK = 400;

const STATUS_OPTIONS = [
  { label: '已上架', value: 1 },
  { label: '已下架', value: 0 },
];

/**
 * 商品管理组件
 * 用于展示、编辑、新增、删除商品，以及管理商品状态
 */
export default function Goods() {
  // 使用Ant Design的App组件获取全局message提示
  const { message } = App.useApp();
  // 创建表单实例
  const [dialogForm] = Form.useForm();

  // 筛选表单值（未提交）
  const [filters, setFilters] = useState({ keyword: '', category: undefined, status: undefined });
  // 真正用于请求的筛选条件（点「查询」才同步）
  const [params, setParams] = useState({ keyword: '', category: undefined, status: undefined });
  // 当前页码
  const [page, setPage] = useState(1);
  // 每页显示数量
  const [pageSize, setPageSize] = useState(10);

  // 商品列表数据
  const [rows, setRows] = useState([]);
  // 总商品数量
  const [total, setTotal] = useState(0);
  // 加载状态
  const [loading, setLoading] = useState(true);
  // 商品分类列表
  const [cats, setCats] = useState([]);
  // 选中的商品ID列表
  const [selected, setSelected] = useState([]);
  // 用于强制重新加载的计数器
  const [tick, setTick] = useState(0);

  // editing: null 关闭；{} 新增；{id,...} 编辑
  const [editing, setEditing] = useState(null);
  const [saving, setSaving] = useState(false);
  // 批量操作进行中（防止连点重复提交）
  const [bulkLoading, setBulkLoading] = useState(false);

  // 分类下拉
  useEffect(() => {
    getGoodsCategories()
      .then((list) => setCats(list || []))
      .catch(() => setCats([]));
  }, []);

  // 列表
  useEffect(() => {
    let alive = true;
    // loading 由各触发点（查询 / 重置 / 翻页 / reload）在发请求前置 true，
    // effect 体里同步 setState 会触发级联渲染，被 react-hooks 规则拦下
    getGoods({ ...params, page, pageSize })
      .then((data) => {
        if (!alive) return;
        setRows(
          (data.list || []).map((r) => ({
            ...r,
            price: Number(r.price), // 后端 DECIMAL 返回 "899.00"，统一转数字
            stock: Number(r.stock),
            sales: Number(r.sales),
          })),
        );
        setTotal(data.total || 0);
      })
      .catch(() => {
        if (alive) {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [params, page, pageSize, tick]);

  // 打开弹窗时回填
  useEffect(() => {
    if (!editing) return;
    if (editing.id) {
      dialogForm.setFieldsValue({ ...editing, price: Number(editing.price) });
    } else {
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

  // 刷新函数，用于增加计数器的值
  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  /**
   * 执行搜索操作的函数
   * 该函数会更新搜索参数、重置页码并清空选中项
   */
  const doSearch = () => {
    // 更新搜索参数为当前筛选条件
    setLoading(true);
    setParams({ ...filters });
    // 将页码重置为第一页
    setPage(1);
    // 清空所有选中项
    setSelected([]);
  };

/**
 * 重置函数，用于清空所有筛选条件并重置分页和选中状态
 * @returns {void} 无返回值
 */
  const doReset = () => {
  // 定义一个空对象，包含所有需要重置的筛选条件
    const empty = { keyword: '', category: undefined, status: undefined };
    setLoading(true);
  // 重置筛选条件状态
    setFilters(empty);
  // 重置参数状态
    setParams(empty);
  // 重置页码为第一页
    setPage(1);
  // 清空选中项
    setSelected([]);
  };

/**
 * 提交对话框表单的异步函数
 * 用于创建或更新商品信息
 * @returns {Promise<void>} 无返回值的Promise
 */
  const submitDialog = async () => {
  // 验证表单字段并获取值
    const values = await dialogForm.validateFields();
  // 设置保存状态为true，表示正在保存
    setSaving(true);
    try {
    // 构建提交数据，确保price为数字类型
      const payload = { ...values, price: Number(values.price) };
    // 判断是更新还是创建操作
      if (editing.id) {
      // 如果存在editing.id，则执行更新操作
        await updateGoods(editing.id, payload);
        message.success('已保存');
      } else {
      // 否则执行创建新商品操作
        await createGoods(payload);
        message.success('新增成功');
      }
    // 重置编辑状态并重新加载数据
      setEditing(null);
      reload();
    } catch (e) {
      if (e?.errorFields) return; // 表单校验失败，antd 已高亮
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

/**
 * 处理商品状态切换的异步函数
 * @param {Object} row - 包含商品信息的对象，至少包含id和status属性
 * @returns {Promise<void>} - 无返回值的Promise
 */
  const onToggle = useCallback(async (row) => {
    try {
    // 根据当前状态计算下一个状态：1变0，0变1
      const next = row.status === 1 ? 0 : 1;
    // 调用API切换商品状态
      await toggleGoodsStatus(row.id, next);
    // 根据新状态显示成功消息
      message.success(next === 1 ? '已上架' : '已下架');
    // 重新加载数据
      reload();
    } catch (e) {
    // 显示错误消息，优先使用错误信息中的message，否则显示默认错误信息
      message.error(e?.message || '操作失败');
    }
  }, [message, reload]);

/**
 * 删除商品的处理函数
 * @param {Object} row - 包含商品信息的行对象，至少包含id属性
 * @returns {Promise<void>} 异步函数，没有返回值
 */
  const onDelete = useCallback(async (row) => {
    try {
    // 调用删除商品的API
      await deleteGoods(row.id);
    // 显示删除成功的提示信息
      message.success('删除成功');
    // 从已选列表中移除被删除的商品ID
      setSelected((prev) => prev.filter((k) => k !== row.id));
    // 重新加载数据
      reload();
    } catch (e) {
    // 捕获可能的错误并显示错误信息
      message.error(e?.message || '删除失败');
    }
  }, [message, reload]);

  /**
   * 批量上下架
   * @param {number} status 目标状态：1 上架 / 0 下架
   */
  const onBatchStatus = async (status) => {
    setBulkLoading(true);
    try {
      const res = await batchGoodsStatus(selected, status);
      message.success(`已${status === 1 ? '上架' : '下架'} ${res.affected} 件商品`);
      if (res.missing?.length) {
        message.warning(`${res.missing.length} 件商品已不存在，已跳过`);
      }
      setSelected([]);
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
      const res = await batchDeleteGoods(selected);
      message.success(`已删除 ${res.affected} 件商品`);
      setSelected([]);
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

  const columns = useMemo(
    () => [
      {
        title: '商品信息',
        dataIndex: 'name',
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
      { title: '分类', dataIndex: 'category', width: 110, render: (v) => v || '—' },
      {
        title: '价格',
        dataIndex: 'price',
        width: 110,
        align: 'left',
        render: (v) => money(v),
      },
      {
        title: '库存',
        dataIndex: 'stock',
        width: 140,
        render: (v) => {
          const warn = v < WARN_STOCK;
          const width = Math.min(100, Math.max(3, (v / FULL_STOCK) * 100));
          return (
            <div className={s.stockCell}>
              <span className={s.stockNum} style={warn ? { color: 'var(--warn)' } : undefined}>
                {int(v)}
              </span>
              <span className={s.stockBar}>
                <span style={{ width: `${width}%`, background: warn ? 'var(--warn)' : 'var(--success)' }} />
              </span>
            </div>
          );
        },
      },
      { title: '销量', dataIndex: 'sales', width: 90, align: 'left', render: (v) => int(v) },
      {
        title: '状态',
        dataIndex: 'status',
        width: 100,
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
        render: (_, r) => (
          <Space size={0} split={<span className={s.dot}>·</span>}>
            <Button type="link" size="small" className={s.opBtn} onClick={() => setEditing(r)}>
              编辑
            </Button>
            <Button type="link" size="small" className={s.opBtn} onClick={() => onToggle(r)}>
              {r.status === 1 ? '下架' : '上架'}
            </Button>
            <Popconfirm
              title="删除这个商品？"
              description="删除后不可恢复"
              okText="删除"
              okButtonProps={{ danger: true }}
              onConfirm={() => onDelete(r)}
            >
              <Button type="link" size="small" danger className={s.opBtn}>
                删除
              </Button>
            </Popconfirm>
          </Space>
        ),
      },
    ],
    [onToggle, onDelete],
  );

  return (
    <div className={s.page}>
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>商品管理</h1>
          <p className={s.meta}>共 {total} 件商品 · 库存预警线 {WARN_STOCK} 件</p>
        </div>
        <div className={s.actions}>
          <Tooltip title="后端暂未提供导入接口">
            <Button icon={<UploadOutlined />} disabled>
              导入
            </Button>
          </Tooltip>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => setEditing({})}
          >
            新增商品
          </Button>
        </div>
      </div>

      <div className={s.toolbar}>
        <Input
          className={s.search}
          allowClear
          prefix={<SearchOutlined style={{ color: 'var(--text-3)' }} />}
          placeholder="搜索商品名称 / SKU"
          value={filters.keyword}
          onChange={(e) => setFilters((f) => ({ ...f, keyword: e.target.value }))}
          onPressEnter={doSearch}
        />
        <Select
          className={s.selectCat}
          allowClear
          placeholder="全部分类"
          value={filters.category}
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
        <span className={s.toolbarRight}>共筛选出 {total} 条</span>
      </div>

      <div className={s.tableCard}>
        {selected.length > 0 && (
          <div className={s.bulkBar}>
            <span className={s.bulkText}>已选 {selected.length} 项</span>
            <div className={s.bulkActions}>
              <Button size="small" loading={bulkLoading} onClick={() => onBatchStatus(1)}>
                批量上架
              </Button>
              <Button size="small" loading={bulkLoading} onClick={() => onBatchStatus(0)}>
                批量下架
              </Button>
              <Popconfirm
                title={`删除选中的 ${selected.length} 件商品？`}
                description="删除后不可恢复"
                okText="删除"
                okButtonProps={{ danger: true }}
                onConfirm={onBatchDelete}
              >
                <Button size="small" danger loading={bulkLoading}>
                  批量删除
                </Button>
              </Popconfirm>
              <Button size="small" type="text" onClick={() => setSelected([])}>
                取消选择
              </Button>
            </div>
          </div>
        )}

        <Table
          className={s.table}
          rowKey="id"
          columns={columns}
          dataSource={rows}
          loading={loading}
          pagination={false}
          scroll={{ x: 900 }}
          rowSelection={{
            selectedRowKeys: selected,
            preserveSelectedRowKeys: true,
            onChange: (keys) => setSelected(keys),
          }}
          locale={{ emptyText: '没有符合条件的商品' }}
        />

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
              const nextPage = ps !== pageSize ? 1 : p;
              const nextSize = ps !== pageSize ? ps : pageSize;
              // 点当前页 / 当前条数不会真的变，直接返回，避免 loading 卡在 true
              if (nextPage === page && nextSize === pageSize) return;
              setLoading(true);
              if (ps !== pageSize) {
                setPageSize(ps);
                setPage(1);
              } else {
                setPage(p);
              }
              // 翻页保留选中（preserveSelectedRowKeys）
            }}
          />
        </div>
      </div>

      <Modal
        title={editing?.id ? '编辑商品' : '新增商品'}
        open={!!editing}
        onCancel={() => setEditing(null)}
        onOk={submitDialog}
        okText="保存"
        cancelText="取消"
        confirmLoading={saving}
        width={560}
        forceRender
      >
        <Form form={dialogForm} layout="vertical" style={{ marginTop: 12 }}>
          <Form.Item
            label="商品名称"
            name="name"
            rules={[{ required: true, message: '请输入商品名称' }]}
          >
            <Input placeholder="如 无线蓝牙耳机 Pro" maxLength={100} />
          </Form.Item>

          <div className={s.formRow}>
            <Form.Item
              label="SKU"
              name="sku"
              rules={[
                { required: true, message: '请输入 SKU' },
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

          <div className={s.formRow}>
            <Form.Item
              label="价格（元）"
              name="price"
              rules={[{ required: true, message: '请输入价格' }]}
            >
              <InputNumber min={0} precision={2} style={{ width: '100%' }} placeholder="0.00" />
            </Form.Item>
            <Form.Item label="库存" name="stock">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="销量" name="sales">
              <InputNumber min={0} precision={0} style={{ width: '100%' }} />
            </Form.Item>
          </div>

          <Form.Item label="状态" name="status">
            <Select options={STATUS_OPTIONS} />
          </Form.Item>

          <Form.Item label="商品描述" name="description">
            <Input.TextArea rows={3} maxLength={200} showCount placeholder="选填" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
