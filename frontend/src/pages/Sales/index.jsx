// 引入所需钩子
import { useEffect, useMemo, useState } from 'react';
// 引入 antd 组件：App、分段控制器、按钮、空态、骨架、抽屉、表格、分页、下拉、加载遮罩
import {
  App, Segmented, Button, Empty, Skeleton, Drawer, Table, Pagination, Select, Spin,
} from 'antd';
// 引入图标：下载、账本、购物车、标签、回退（退款）
import {
  DownloadOutlined, AccountBookOutlined, ShoppingCartOutlined,
  TagOutlined, RollbackOutlined,
} from '@ant-design/icons';
// 引入图表容器
import ChartBox from '../../components/ChartBox';
// 引入销售接口：统计 + 明细列表
import { getSales, getSalesStats } from '../../api/sales';
// 引入格式化工具
import { money, int } from '../../utils/format';
// 引入页面样式
import s from './index.module.scss';

// 顶部统计的时间范围选项（本季按 90 天近似）
const RANGES = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '本季', value: 90 },
];

// 明细抽屉的时间范围选项（0 表示不限时间）
const DRAWER_RANGES = [
  { label: '全部', value: 0 },
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
];

/** 品类条配色：同一橙色由深到浅，按索引循环使用 */
const BAR_FILL = ['#F5611D', '#F57535', '#F78A4E', '#F9A068', '#FBB587'];

/**
 * 生成「本地日期字符串」，避免用 toISOString（那个是 UTC，会跨日错位）
 * @param {number} offsetDays - 相对今天的天数偏移（负数表示过去）
 * @returns {string} YYYY-MM-DD
 */
function localDate(offsetDays = 0) {
  // 用毫秒偏移计算目标时刻
  const d = new Date(Date.now() + offsetDays * 86400000);
  // 分别取年月日，月份从 0 开始故 +1
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  // 拼成后端可识别的日期格式
  return `${y}-${m}-${day}`;
}

/**
 * 金额紧凑格式（图表轴/窄空间用）
 * @param {number} n - 原始金额
 * @returns {string} ¥1.38M / ¥854K / ¥120
 */
function moneyCompact(n) {
  // 百万级：保留两位小数 + M
  if (n >= 1e6) return `¥${(n / 1e6).toFixed(2)}M`;
  // 千级：取整 + K
  if (n >= 1e3) return `¥${Math.round(n / 1e3)}K`;
  // 其余：取整
  return `¥${Math.round(n)}`;
}

/**
 * 环比展示行
 * @param {number|null} value - 变化值（小数形式，如 0.12 表示 12%）
 * @param {boolean} isRate - 是否为比率类指标（退款率越低越好，好坏判定要反过来）
 */
function CompareLine({ value, isRate = false }) {
  // 缺数据时明确展示「暂无上期数据」，而不是显示 0%
  if (value === null || value === undefined) {
    return <span className={s.footMuted}>暂无上期数据</span>;
  }
  // 是否上升
  const up = value > 0;
  // 是否为「好」的变化：普通指标涨是好事，退款率降才是好事
  const good = isRate ? value < 0 : value > 0;
  return (
    <span className={s.footMuted}>
      {/* 箭头 + 绝对值百分比，颜色表示好/坏 */}
      <span className={good ? s.up : s.down}>
        {up ? '↑' : '↓'}
        {Math.abs(value * 100).toFixed(1)}%
      </span>
      {/* 退款率额外说明比上期高还是低（中性表达），其余指标统一「较上期」 */}
      {isRate ? (up ? ' 高于上期' : ' 低于上期') : ' 较上期'}
    </span>
  );
}

/**
 * 销售统计页
 * 组成：顶部时间范围 + 导出、四个 KPI 卡（含环比）、每日销售额柱状图、品类明细条、
 *      以及可打开「销售明细」抽屉（支持分页/时间/品类筛选）
 */
export default function Sales() {
  // 带主题的提示
  const { message } = App.useApp();

  // ===== 顶部统计区状态 =====
  // 统计窗口天数
  const [range, setRange] = useState(30);
  // 统计结果（trend / categories / kpi / range）
  const [stats, setStats] = useState(null);
  // 加载态
  const [loading, setLoading] = useState(true);
  // 错误态
  const [error, setError] = useState(false);
  // 数据更新时间
  const [updatedAt, setUpdatedAt] = useState('');
  // 手动刷新计数器
  const [tick, setTick] = useState(0);

  // ===== 明细抽屉状态 =====
  // 抽屉开关
  const [drawerOpen, setDrawerOpen] = useState(false);
  // 明细行数据
  const [rows, setRows] = useState([]);
  // 明细总数
  const [total, setTotal] = useState(0);
  // 明细页码
  const [page, setPage] = useState(1);
  // 明细每页条数
  const [pageSize, setPageSize] = useState(10);
  // 抽屉内时间范围（0 = 全部）
  const [drRange, setDrRange] = useState(0);
  // 抽屉内品类筛选
  const [drCat, setDrCat] = useState();
  // 明细加载态
  const [rowsLoading, setRowsLoading] = useState(false);

  // 导出进行中（按钮 loading）
  const [exporting, setExporting] = useState(false);

  // 统计数据拉取：range 变化或手动刷新时执行
  useEffect(() => {
    // 卸载标记
    let alive = true;
    // 请求前先把加载态置上，避免旧数据闪一下（必要的外部同步）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getSalesStats(range)
      .then((d) => {
        if (!alive) return;
        // 写入统计结果
        setStats(d);
        // 成功后清错误态
        setError(false);
        // 更新时间精确到分钟（24 小时制，避免出现下午 3:05 这种）
        setUpdatedAt(
          new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }),
        );
      })
      .catch(() => {
        if (alive) setError(true);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    // 清理：作废旧请求
    return () => {
      alive = false;
    };
  }, [range, tick]);

  // 明细拉取：抽屉打开后，页码 / 每页条数 / 时间 / 品类变化时重新请求
  useEffect(() => {
    // 抽屉关闭时不请求（省流量，也避免无意义请求）
    if (!drawerOpen) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRowsLoading(true);
    // 时间范围换算成起止日期；「全部」时传空串，由后端忽略该条件
    const start = drRange > 0 ? localDate(-(drRange - 1)) : '';
    const end = drRange > 0 ? localDate(0) : '';
    getSales({ page, pageSize, start, end, category_id: drCat })
      .then((data) => {
        if (!alive) return;
        // 写入列表与总数
        setRows(data.list || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
        // 失败清空，避免残留旧数据误读
        if (alive) {
          setRows([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (alive) setRowsLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [drawerOpen, page, pageSize, drRange, drCat]);

  // ===== 派生数据 =====
  // 每日趋势序列
  const trend = useMemo(() => stats?.trend || [], [stats]);
  // 品类汇总
  const categories = stats?.categories || [];
  // 顶部 KPI 数据
  const kpi = stats?.kpi;

  // 柱状图配置：每日销售额，柱顶显示「万元」数值
  const barOption = useMemo(
    () => ({
      // containLabel 保证标签不超出画布
      grid: { left: 10, right: 10, top: 34, bottom: 6, containLabel: true },
      tooltip: {
        // 轴触发：hover 某一天显示整柱信息
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#EDE8E2',
        borderWidth: 1,
        textStyle: { color: '#1C1917', fontSize: 12 },
        // 阴影指示器，突出当前柱
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(245,97,29,.06)' } },
        // 提示内容：日期 + 销售额 + 订单笔数
        formatter: (params) => {
          const row = trend[params[0].dataIndex];
          return `${row.date}<br/>销售额 ${money(row.amount)}<br/>订单 ${int(row.order_count)} 笔`;
        },
      },
      xAxis: {
        type: 'category',
        // 日期只留「月.日」，例如 11.26
        data: trend.map((i) => i.date.slice(5).replace('-', '.')),
        // 去掉轴线与刻度，只保留标签，视觉更干净
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#5D5751',
          fontSize: 11.5,
          // 标签与柱体之间的间距
          margin: 14,
          // 数据点多时隔一个显示，避免标签重叠
          interval: trend.length > 15 ? 2 : 0,
        },
      },
      // y 轴不显示，最大值上浮 14% 给柱顶数值留空间
      yAxis: { type: 'value', show: false, max: (v) => Math.ceil(v.max * 1.14) },
      series: [
        {
          type: 'bar',
          data: trend.map((i) => i.amount),
          // 柱宽上限，防止数据点少时柱子过宽
          barMaxWidth: 22,
          itemStyle: {
            // 纵向渐变：顶部浅橙到主色，营造体积感
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#FF9A5A' },
                { offset: 1, color: '#F5611D' },
              ],
            },
          },
          label: {
            // 柱顶显示数值
            show: true,
            position: 'top',
            distance: 8,
            fontSize: 12,
            color: '#5D5751',
            // 换算成万元并保留一位，避免长数字
            formatter: (p) => (p.value / 10000).toFixed(1),
          },
        },
      ],
    }),
    [trend],
  );

  /**
   * 导出前拉全量明细：按 100 条一页循环翻页，直到取完
   * @returns {Promise<object[]>} 完整明细数组
   */
  async function fetchAllForExport() {
    // 与抽屉共用同一套筛选条件
    const start = drRange > 0 ? localDate(-(drRange - 1)) : '';
    const end = drRange > 0 ? localDate(0) : '';
    const base = { start, end, category_id: drCat, pageSize: 100 };
    // 先取第一页，顺便拿到总数
    const first = await getSales({ ...base, page: 1 });
    const all = [...(first.list || [])];
    // 按总数算出总页数
    const pages = Math.ceil((first.total || 0) / 100);
    // 串行翻页（避免瞬时并发过多请求打满后端）
    for (let p = 2; p <= pages; p++) {
      const r = await getSales({ ...base, page: p });
      all.push(...(r.list || []));
    }
    return all;
  }

  /** 导出 CSV：前端生成 Blob 并触发下载（无需后端导出接口） */
  const exportCsv = async () => {
    setExporting(true);
    try {
      // 拉全量数据
      const all = await fetchAllForExport();
      if (!all.length) {
        message.info('当前没有明细数据');
        return;
      }
      // 表头
      const head = '日期,品类,销售额(元),销量(件),订单数(笔),退款金额(元)\n';
      // 数据行：字段顺序与表头一一对应
      const body = all
        .map((r) => `${r.sale_date},${r.category_name},${r.amount},${r.qty},${r.order_count},${r.refund_amount}`)
        .join('\n');
      // \uFEFF 是 BOM，让 Excel 打开 CSV 时正确识别 UTF-8 中文
      const blob = new Blob([`\uFEFF${head}${body}`], { type: 'text/csv;charset=utf-8;' });
      // 生成临时对象 URL
      const url = URL.createObjectURL(blob);
      // 通过隐藏的 <a> 触发浏览器下载
      const a = document.createElement('a');
      a.href = url;
      a.download = `销售明细_${drRange > 0 ? `近${drRange}天` : '全部'}.csv`;
      a.click();
      // 释放 URL，避免内存泄漏
      URL.revokeObjectURL(url);
      message.success(`已导出 ${all.length} 条明细`);
    } catch {
      message.error('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  // 实际统计天数：优先后端返回的 range.days，兜底前端选择的值
  const days = stats?.range?.days || range;

  // 四个 KPI：销售额、订单量、客单价、退款率
  const kpis = [
    {
      key: 'amount',
      icon: <AccountBookOutlined />,
      label: `近 ${days} 天销售额`,
      value: kpi ? money(kpi.amount, 0) : '—',
      // 环比变化值（小数）
      compare: kpi?.compare?.amount,
    },
    {
      key: 'order',
      icon: <ShoppingCartOutlined />,
      label: '订单量',
      value: kpi ? int(kpi.orderCount) : '—',
      unit: '单',
      compare: kpi?.compare?.orderCount,
    },
    {
      key: 'aov',
      icon: <TagOutlined />,
      label: '客单价',
      value: kpi ? money(kpi.avgOrderValue, 0) : '—',
      unit: '/ 单',
      compare: kpi?.compare?.avgOrderValue,
    },
    {
      key: 'refund',
      icon: <RollbackOutlined />,
      label: '退款率',
      // 后端给的是小数比例，转成百分比数字
      value: kpi ? (kpi.refundRate * 100).toFixed(1) : '—',
      unit: '%',
      compare: kpi?.compare?.refundRate,
      // 标记为比率指标：判定好坏的方向相反
      isRate: true,
    },
  ];

  // 品类下拉选项
  const catOptions = categories.map((c) => ({ label: c.name, value: c.id }));

  // 明细表格列
  const columns = [
    { title: '日期', dataIndex: 'sale_date', width: 112 },
    { title: '品类', dataIndex: 'category_name', width: 88 },
    { title: '销售额', dataIndex: 'amount', align: 'right', render: (v) => money(v) },
    { title: '订单', dataIndex: 'order_count', align: 'right', width: 72, render: (v) => `${int(v)} 单` },
    { title: '销量', dataIndex: 'qty', align: 'right', width: 80, render: (v) => `${int(v)} 件` },
    {
      title: '退款',
      dataIndex: 'refund_amount',
      align: 'right',
      width: 88,
      // 无退款显示破折号，避免满屏 ¥0
      render: (v) => (v > 0 ? money(v) : '—'),
    },
  ];

  // 错误态：整页兜底 + 重新加载
  if (error) {
    return (
      <div className={s.state}>
        <Empty description="销售数据加载失败">
          <Button type="primary" onClick={() => setTick((t) => t + 1)}>
            重新加载
          </Button>
        </Empty>
      </div>
    );
  }

  return (
    <div className={s.page}>
      {/* 页头：标题 + 范围切换 + 导出 */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>销售统计</h1>
          <p className={s.meta}>
            近 {days} 天 · {categories.length} 大品类
            {updatedAt ? ` · 数据更新于 ${updatedAt}` : ''}
          </p>
        </div>
        <div className={s.actions}>
          {/* 切换范围直接改 range，由 effect 重新拉数 */}
          <Segmented value={range} options={RANGES} onChange={setRange} />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportCsv}>
            导出明细
          </Button>
        </div>
      </div>

      {/* KPI 卡：首屏无数据时用骨架屏占位 */}
      <div className={s.kpiGrid}>
        {kpis.map((k) => (
          <div key={k.key} className={s.kpi}>
            <span className={s.kpiIcon}>{k.icon}</span>
            {loading && !kpi ? (
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            ) : (
              <>
                <div className={s.kpiLabel}>{k.label}</div>
                <div className={s.kpiValue}>
                  {k.value}
                  {k.unit && <span className={s.kpiUnit}>{k.unit}</span>}
                </div>
                {/* 环比行 */}
                <div className={s.kpiFoot}>
                  <CompareLine value={k.compare} isRate={k.isRate} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* 第二行：柱状图 + 品类明细条 */}
      <div className={s.row2}>
        <div className={s.card}>
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>每日销售额</div>
              <div className={s.cardSub}>近 {days} 天 · 单位：万元</div>
            </div>
            <span className={s.legendKey}>
              {/* 图例色块（颜色由样式定义） */}
              <i />
              销售额
            </span>
          </div>
          {/* 有金额数据才画图，否则空态 */}
          {trend.some((i) => i.amount > 0) ? (
            <ChartBox option={barOption} height={402} />
          ) : (
            <div className={s.emptyBox}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无销售数据" />
            </div>
          )}
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>品类销售明细</div>
              <div className={s.cardSub}>近 {days} 天 · 按金额排序</div>
            </div>
            {/* 打开明细抽屉 */}
            <Button type="link" size="small" className={s.linkMore} onClick={() => setDrawerOpen(true)}>
              查看明细
            </Button>
          </div>
          {categories.length > 0 ? (
            <div className={s.catList}>
              {categories.map((item, i) => (
                <div key={item.id} className={s.catRow}>
                  <span className={s.catName}>{item.name}</span>
                  <span className={s.catBar}>
                    {/* 占比条：最低 2% 保证可见，颜色按索引从调色板循环取 */}
                    <span
                      style={{
                        width: `${Math.max(item.pct * 100, 2)}%`,
                        background: BAR_FILL[i % BAR_FILL.length],
                      }}
                    />
                  </span>
                  <span className={s.catAmtBox}>
                    {/* 金额用紧凑格式，订单数用小字 */}
                    <span className={s.catAmt}>{moneyCompact(item.amount)}</span>
                    <span className={s.catQty}>{int(item.orderCount)} 单</span>
                  </span>
                  {/* 占比（整数百分比） */}
                  <span className={s.catPct}>{(item.pct * 100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.emptyBox}>
              <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无品类数据" />
            </div>
          )}
        </div>
      </div>

      {/* 明细抽屉：右侧滑出，宽 720 */}
      <Drawer
        title="销售明细"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { paddingTop: 16 } }}
      >
        {/* 抽屉工具条：时间范围 + 品类筛选 */}
        <div className={s.drawerToolbar}>
          <Segmented
            value={drRange}
            options={DRAWER_RANGES}
            onChange={(v) => {
              // 改变筛选条件后回到第一页
              setDrRange(v);
              setPage(1);
            }}
          />
          <Select
            allowClear
            placeholder="全部品类"
            style={{ width: 150 }}
            value={drCat}
            options={catOptions}
            onChange={(v) => {
              setDrCat(v);
              setPage(1);
            }}
          />
        </div>

        {/* 表格外层加载遮罩：翻页时保留旧数据并显示 loading，体验更平滑 */}
        <Spin spinning={rowsLoading}>
          <Table
            rowKey="id"
            size="small"
            columns={columns}
            dataSource={rows}
            pagination={false}
            locale={{ emptyText: '当前筛选条件下没有数据' }}
          />
        </Spin>

        {/* 抽屉内独立分页器 */}
        <div className={s.drawerPager}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            showTotal={(t) => `共 ${t} 条`}
            onChange={(p, ps) => {
              // 改每页条数时回到第一页
              if (ps !== pageSize) {
                setPageSize(ps);
                setPage(1);
              } else {
                setPage(p);
              }
            }}
          />
        </div>
      </Drawer>
    </div>
  );
}
