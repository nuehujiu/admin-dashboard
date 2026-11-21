import { useEffect, useMemo, useState } from 'react';
import {
  App, Segmented, Button, Empty, Skeleton, Drawer, Table, Pagination, Select, Spin,
} from 'antd';
import {
  DownloadOutlined, AccountBookOutlined, ShoppingCartOutlined,
  TagOutlined, RollbackOutlined,
} from '@ant-design/icons';
import ChartBox from '../../components/ChartBox';
import { getSales, getSalesStats } from '../../api/sales';
import { money, int } from '../../utils/format';
import s from './index.module.scss';

const RANGES = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '本季', value: 90 },
];

const DRAWER_RANGES = [
  { label: '全部', value: 0 },
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
];

/** 品类条：同一橙色由深到浅 */
const BAR_FILL = ['#F5611D', '#F57535', '#F78A4E', '#F9A068', '#FBB587'];

function localDate(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** ¥1.38M / ¥854K */
function moneyCompact(n) {
  if (n >= 1e6) return `¥${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `¥${Math.round(n / 1e3)}K`;
  return `¥${Math.round(n)}`;
}

/** 环比：上升/下降 + 百分比。refundRate 是百分点差，且「降」才是好事 */
function CompareLine({ value, isRate = false }) {
  if (value === null || value === undefined) {
    return <span className={s.footMuted}>暂无上期数据</span>;
  }
  const up = value > 0;
  const good = isRate ? value < 0 : value > 0;
  return (
    <span className={s.footMuted}>
      <span className={good ? s.up : s.down}>
        {up ? '↑' : '↓'}
        {Math.abs(value * 100).toFixed(1)}%
      </span>
      {isRate ? (up ? ' 高于上期' : ' 低于上期') : ' 较上期'}
    </span>
  );
}

export default function Sales() {
  const { message } = App.useApp();

  const [range, setRange] = useState(30);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [updatedAt, setUpdatedAt] = useState('');
  const [tick, setTick] = useState(0);

  // 明细抽屉
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [drRange, setDrRange] = useState(0);
  const [drCat, setDrCat] = useState();
  const [rowsLoading, setRowsLoading] = useState(false);

  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    let alive = true;
    // 请求前先把加载态置上，避免旧数据闪一下（必要的外部同步）
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    getSalesStats(range)
      .then((d) => {
        if (!alive) return;
        setStats(d);
        setError(false);
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
    return () => {
      alive = false;
    };
  }, [range, tick]);

  useEffect(() => {
    if (!drawerOpen) return;
    let alive = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRowsLoading(true);
    const start = drRange > 0 ? localDate(-(drRange - 1)) : '';
    const end = drRange > 0 ? localDate(0) : '';
    getSales({ page, pageSize, start, end, category_id: drCat })
      .then((data) => {
        if (!alive) return;
        setRows(data.list || []);
        setTotal(data.total || 0);
      })
      .catch(() => {
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

  const trend = useMemo(() => stats?.trend || [], [stats]);
  const categories = stats?.categories || [];
  const kpi = stats?.kpi;

  const barOption = useMemo(
    () => ({
      grid: { left: 10, right: 10, top: 34, bottom: 6, containLabel: true },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#EDE8E2',
        borderWidth: 1,
        textStyle: { color: '#1C1917', fontSize: 12 },
        axisPointer: { type: 'shadow', shadowStyle: { color: 'rgba(245,97,29,.06)' } },
        formatter: (params) => {
          const row = trend[params[0].dataIndex];
          return `${row.date}<br/>销售额 ${money(row.amount)}<br/>订单 ${int(row.order_count)} 笔`;
        },
      },
      xAxis: {
        type: 'category',
        data: trend.map((i) => i.date.slice(5).replace('-', '.')),
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: {
          color: '#5D5751',
          fontSize: 11.5,
          margin: 14,
          interval: trend.length > 15 ? 2 : 0,
        },
      },
      yAxis: { type: 'value', show: false, max: (v) => Math.ceil(v.max * 1.14) },
      series: [
        {
          type: 'bar',
          data: trend.map((i) => i.amount),
          barMaxWidth: 22,
          itemStyle: {
            color: {
              type: 'linear', x: 0, y: 0, x2: 0, y2: 1,
              colorStops: [
                { offset: 0, color: '#FF9A5A' },
                { offset: 1, color: '#F5611D' },
              ],
            },
          },
          label: {
            show: true,
            position: 'top',
            distance: 8,
            fontSize: 12,
            color: '#5D5751',
            formatter: (p) => (p.value / 10000).toFixed(1),
          },
        },
      ],
    }),
    [trend],
  );

  async function fetchAllForExport() {
    const start = drRange > 0 ? localDate(-(drRange - 1)) : '';
    const end = drRange > 0 ? localDate(0) : '';
    const base = { start, end, category_id: drCat, pageSize: 100 };
    const first = await getSales({ ...base, page: 1 });
    const all = [...(first.list || [])];
    const pages = Math.ceil((first.total || 0) / 100);
    for (let p = 2; p <= pages; p++) {
      const r = await getSales({ ...base, page: p });
      all.push(...(r.list || []));
    }
    return all;
  }

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await fetchAllForExport();
      if (!all.length) {
        message.info('当前没有明细数据');
        return;
      }
      const head = '日期,品类,销售额(元),销量(件),订单数(笔),退款金额(元)\n';
      const body = all
        .map((r) => `${r.sale_date},${r.category_name},${r.amount},${r.qty},${r.order_count},${r.refund_amount}`)
        .join('\n');
      const blob = new Blob([`\uFEFF${head}${body}`], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `销售明细_${drRange > 0 ? `近${drRange}天` : '全部'}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      message.success(`已导出 ${all.length} 条明细`);
    } catch {
      message.error('导出失败，请稍后重试');
    } finally {
      setExporting(false);
    }
  };

  const days = stats?.range?.days || range;

  const kpis = [
    {
      key: 'amount',
      icon: <AccountBookOutlined />,
      label: `近 ${days} 天销售额`,
      value: kpi ? money(kpi.amount, 0) : '—',
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
      value: kpi ? (kpi.refundRate * 100).toFixed(1) : '—',
      unit: '%',
      compare: kpi?.compare?.refundRate,
      isRate: true,
    },
  ];

  const catOptions = categories.map((c) => ({ label: c.name, value: c.id }));

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
      render: (v) => (v > 0 ? money(v) : '—'),
    },
  ];

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
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>销售统计</h1>
          <p className={s.meta}>
            近 {days} 天 · {categories.length} 大品类
            {updatedAt ? ` · 数据更新于 ${updatedAt}` : ''}
          </p>
        </div>
        <div className={s.actions}>
          <Segmented value={range} options={RANGES} onChange={setRange} />
          <Button icon={<DownloadOutlined />} loading={exporting} onClick={exportCsv}>
            导出明细
          </Button>
        </div>
      </div>

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
                <div className={s.kpiFoot}>
                  <CompareLine value={k.compare} isRate={k.isRate} />
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className={s.row2}>
        <div className={s.card}>
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>每日销售额</div>
              <div className={s.cardSub}>近 {days} 天 · 单位：万元</div>
            </div>
            <span className={s.legendKey}>
              <i />
              销售额
            </span>
          </div>
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
                    <span
                      style={{
                        width: `${Math.max(item.pct * 100, 2)}%`,
                        background: BAR_FILL[i % BAR_FILL.length],
                      }}
                    />
                  </span>
                  <span className={s.catAmtBox}>
                    <span className={s.catAmt}>{moneyCompact(item.amount)}</span>
                    <span className={s.catQty}>{int(item.orderCount)} 单</span>
                  </span>
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

      <Drawer
        title="销售明细"
        width={720}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        styles={{ body: { paddingTop: 16 } }}
      >
        <div className={s.drawerToolbar}>
          <Segmented
            value={drRange}
            options={DRAWER_RANGES}
            onChange={(v) => {
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

        <div className={s.drawerPager}>
          <Pagination
            current={page}
            pageSize={pageSize}
            total={total}
            showSizeChanger
            pageSizeOptions={[10, 20, 50, 100]}
            showTotal={(t) => `共 ${t} 条`}
            onChange={(p, ps) => {
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
