import { useCallback, useEffect, useMemo, useState } from 'react';
import { Segmented, Button, Empty, Skeleton } from 'antd';
import {
  DownloadOutlined,
  ShoppingOutlined,
  FileTextOutlined,
  BarChartOutlined,
  TeamOutlined,
  AppstoreOutlined,
  UserAddOutlined,
  CarOutlined,
  FileExcelOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import ChartBox from '../../components/ChartBox';
import Sparkline from '../../components/Sparkline';
import {
  getOverview,
  getTrend,
  getCategoryRatio,
  getRank,
} from '../../api/dashboard';
import { money, moneyShort, int, percent } from '../../utils/format';
import { useUserStore } from '../../store/useUserStore';
import s from './index.module.scss';

const PALETTE = [
  '#F5611D',
  '#F0A33C',
  '#2F8F86',
  '#C08867',
  '#C7BFB6',
  '#D9CFC5',
];
const RANGES = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 根据传入的小时数返回不同的问候语
 * @param {number} h - 小时数（0-23）
 * @returns {string} 对应时段的问候语
 */
function greeting(h) {
  if (h < 6) return '凌晨好';    // 0点-5点返回凌晨好
  if (h < 12) return '上午好';   // 6点-11点返回上午好
  if (h < 14) return '中午好';   // 12点-13点返回中午好
  if (h < 18) return '下午好';   // 14点-17点返回下午好
  return '晚上好';               // 18点-23点返回晚上好
}

/**
 * 仪表板组件 - 展示销售数据概览、趋势和统计信息
 */
export default function Dashboard() {
  // 导航钩子和用户状态管理
  const navigate = useNavigate();
  const user = useUserStore((u) => u.user);
  // 当前日期，使用 useMemo 避免重复计算
  const now = useMemo(() => new Date(), []);



  // 状态管理
  const [overview, setOverview] = useState(null);  // 数据概览
  const [trend, setTrend] = useState([]);          // 销售趋势数据
  const [ratio, setRatio] = useState([]);         // 品类占比数据
  const [rank, setRank] = useState([]);           // 排行榜数据
  const [range, setRange] = useState(30);         // 数据时间范围（天）
  const [tick, setTick] = useState(0);            // 用于触发数据重新加载
  const [loading, setLoading] = useState(true);   // 加载状态
  const [error, setError] = useState(false);      // 错误状态
  const [updatedAt, setUpdatedAt] = useState(''); // 数据更新时间

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all([
    // 并行请求所有数据
      getOverview(),
      getCategoryRatio(),
      getRank(5),
      getTrend(range),
    ])
      .then(([ov, ra, rk, tr]) => {
        if (!alive) return;
        setOverview(ov);
        setRatio(ra || []);
        setRank(rk || []);
        setTrend(tr || []);
        setUpdatedAt(
          new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
        setError(false);
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

  const reload = useCallback(() => setTick((t) => t + 1), []);

  // ---------- 派生 ----------
  const amountSpark = useMemo(
    () => trend.map((i) => i.amount).slice(-7),
    [trend],
  );
  const qtySpark = useMemo(() => trend.map((i) => i.qty).slice(-7), [trend]);
  const ratioSum = useMemo(
    () => ratio.reduce((a, i) => a + i.value, 0),
    [ratio],
  );
  const rankMax = useMemo(
    () => Math.max(1, ...rank.map((i) => i.amount)),
    [rank],
  );

  // ---------- 趋势图 ----------
  const trendOption = useMemo(
    () => ({
      color: [PALETTE[0], '#2F8F86'],
      grid: { left: 56, right: 20, top: 16, bottom: 30 },
      tooltip: {
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#EDE8E2',
        borderWidth: 1,
        textStyle: { color: '#1C1917', fontSize: 12 },
        axisPointer: { type: 'line', lineStyle: { color: '#EDE8E2' } },
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: trend.map((i) => i.date.slice(5)),
        axisLine: { lineStyle: { color: '#EDE8E2' } },
        axisTick: { show: false },
        axisLabel: {
          color: '#A8A29C',
          fontSize: 11,
          // 90 个点全显示会糊成一团，按数量抽稀
          interval: Math.max(0, Math.floor(trend.length / 8) - 1),
        },
      },
      yAxis: [
        {
          type: 'value',
          splitLine: { lineStyle: { color: '#F4F1ED' } },
          axisLabel: {
            color: '#A8A29C',
            fontSize: 11,
            formatter: (v) => (v >= 10000 ? `${v / 10000}万` : v),
          },
        },
        { type: 'value', show: false }, // 销量走独立轴，不显刻度
      ],
      series: [
        {
          name: '销售额',
          type: 'line',
          smooth: true,
          showSymbol: false,
          yAxisIndex: 0,
          data: trend.map((i) => i.amount),
          lineStyle: { width: 2 },
          areaStyle: { opacity: 0.14 },
        },
        {
          name: '销量',
          type: 'line',
          smooth: true,
          showSymbol: false,
          yAxisIndex: 1,
          data: trend.map((i) => i.qty),
          lineStyle: { width: 1.4, type: 'dashed' },
        },
      ],
    }),
    [trend],
  );

  // ---------- 环形图 ----------
  const pieOption = useMemo(
    () => ({
      color: PALETTE,
      tooltip: {
        trigger: 'item',
        backgroundColor: '#fff',
        borderColor: '#EDE8E2',
        borderWidth: 1,
        textStyle: { color: '#1C1917', fontSize: 12 },
        formatter: (p) => `${p.name}<br/>${money(p.value)}（${p.percent}%）`,
      },
      series: [
        {
          type: 'pie',
          radius: ['62%', '84%'],
          center: ['50%', '50%'],
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          label: { show: false },
          labelLine: { show: false },
          emphasis: { scale: true, scaleSize: 4 },
          data: ratio.map((i) => ({ name: i.name, value: i.value })),
        },
      ],
    }),
    [ratio],
  );

  // ---------- KPI ----------
  const change = overview?.today_amount_change ?? 0;
  const kpis = [
    {
      key: 'today_amount',
      label: '今日销售额',
      value: overview ? money(overview.today_amount) : '—',
      sub: overview ? `${percent(change)} 较昨日` : '',
      dir: change > 0 ? 'up' : change < 0 ? 'down' : '',
      spark: amountSpark,
      color: PALETTE[0],
      iconBg: '#FFF2EA',
      icon: <ShoppingOutlined />,
    },
    {
      key: 'today_qty',
      label: '今日订单',
      value: overview ? int(overview.today_qty) : '—',
      unit: '单',
      sub: '今日累计',
      dir: '',
      spark: qtySpark,
      color: '#2F8F86',
      iconBg: '#E9F7F7',
      icon: <FileTextOutlined />,
    },
    {
      key: 'total_amount',
      label: '累计销售额',
      value: overview ? money(overview.total_amount, 0) : '—',
      sub: overview
        ? `${int(overview.total_qty)} 件 · ${int(overview.record_count)} 条销售记录`
        : '',
      dir: '',
      spark: amountSpark,
      color: '#F0A33C',
      iconBg: '#FBF1E4',
      icon: <BarChartOutlined />,
    },
    {
      key: 'user_count',
      label: '注册用户',
      value: overview ? int(overview.user_count) : '—',
      unit: '人',
      sub: '账号总数',
      dir: '',
      spark: [],
      color: '#C7BFB6',
      iconBg: '#F4F1ED',
      icon: <TeamOutlined />,
    },
  ];

  const shortcuts = [
    {
      key: 'goods',
      title: '新增商品',
      sub: '发布并上架',
      icon: <AppstoreOutlined />,
      to: '/goods',
    },
    {
      key: 'users',
      title: '新增用户',
      sub: '分配角色权限',
      icon: <UserAddOutlined />,
      to: '/system/users',
    },
    {
      key: 'sales',
      title: '销售明细',
      sub: '按日查看成交',
      icon: <CarOutlined />,
      to: '/sales',
    },
    {
      key: 'export',
      title: '导出数据',
      sub: '销售报表 CSV',
      icon: <FileExcelOutlined />,
      to: '/sales',
    },
  ];

  // ---------- 渲染 ----------
  if (error) {
    return (
      <div className={s.state}>
        <Empty description="看板数据加载失败">
          <Button type="primary" onClick={reload}>
            重新加载
          </Button>
        </Empty>
      </div>
    );
  }

  if (loading && !overview) {
    return (
      <div className={s.page}>
        <div className={s.hero}>
          <div>
            <h1 className={s.hello}>数据加载中…</h1>
          </div>
        </div>
        <div className={s.kpiGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.kpi}>
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
        <div className={s.row2}>
          <div className={s.card}>
            <Skeleton active paragraph={{ rows: 9 }} />
          </div>
          <div className={s.card}>
            <Skeleton active paragraph={{ rows: 9 }} />
          </div>
        </div>
      </div>
    );
  }

  const isAllEmpty =
    overview &&
    overview.today_amount === 0 &&
    overview.total_amount === 0 &&
    trend.every((i) => i.amount === 0);

  return (
    <div className={s.page}>
      {/* 顶部 */}
      <div className={s.hero}>
        <div>
          <h1 className={s.hello}>
            {greeting(now.getHours())}，
            {user?.nickname || user?.username || '管理员'}
          </h1>
          <div className={s.meta}>
            {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 周
            {WEEK[now.getDay()]}
            {updatedAt && ` · 数据更新于 ${updatedAt}`}
          </div>
        </div>
        <div className={s.heroActions}>
          <Segmented value={range} options={RANGES} onChange={setRange} />
          <Button
            icon={<DownloadOutlined />}
            onClick={() => navigate('/sales')}
          >
            导出报表
          </Button>
        </div>
      </div>

      {/* KPI */}
      <div className={s.kpiGrid}>
        {kpis.map((k) => (
          <div key={k.key} className={s.kpi}>
            <div className={s.kpiMain}>
              <div className={s.kpiLabel}>{k.label}</div>
              <div className={s.kpiValue}>
                {k.value}
                {k.unit && <span className={s.kpiUnit}>{k.unit}</span>}
              </div>
              {k.sub && (
                <div className={s.kpiSub}>
                  {k.dir === 'up' && <span className={s.up}>▲ </span>}
                  {k.dir === 'down' && <span className={s.down}>▼ </span>}
                  <span
                    className={
                      k.dir === 'up' ? s.up : k.dir === 'down' ? s.down : ''
                    }
                  >
                    {k.sub}
                  </span>
                </div>
              )}
            </div>
            <div className={s.kpiRight}>
              <div className={s.kpiIcon} style={{ background: k.iconBg }}>
                {k.icon}
              </div>
              {k.spark.length > 0 && (
                <Sparkline data={k.spark} color={k.color} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* 趋势 + 环形 */}
      <div className={s.row2}>
        <div className={s.card}>
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>销售趋势</div>
              <div className={s.cardSub}>近 {range} 天每日销售额与销量走势</div>
            </div>
            <div className={s.legendTop}>
              <span className={s.legendKey}>
                <i style={{ background: PALETTE[0] }} />
                销售额
              </span>
              <span className={s.legendKey}>
                <i style={{ background: '#2F8F86' }} />
                销量
              </span>
            </div>
          </div>
          {trend.some((i) => i.amount > 0) ? (
            <ChartBox option={trendOption} height={306} />
          ) : (
            <div className={s.emptyBox}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无销售数据"
              />
            </div>
          )}
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>品类销售占比</div>
              <div className={s.cardSub}>按累计销售金额统计</div>
            </div>
          </div>
          {ratio.length > 0 ? (
            <div className={s.pieRow}>
              <div className={s.pieBox}>
                <ChartBox option={pieOption} height={186} />
                <div className={s.pieCenter}>
                  <span>销售合计</span>
                  <strong>{moneyShort(ratioSum)}</strong>
                </div>
              </div>
              <div className={s.pieLegend}>
                {ratio.map((item, i) => (
                  <div key={item.name} className={s.pieLegendRow}>
                    <i
                      className={s.dot}
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    <span className={s.pieName}>{item.name}</span>
                    <span className={s.piePct}>
                      {ratioSum
                        ? ((item.value / ratioSum) * 100).toFixed(0)
                        : 0}
                      %
                    </span>
                    <span className={s.pieAmt}>{moneyShort(item.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className={s.emptyBox}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无品类数据"
              />
            </div>
          )}
        </div>
      </div>

      {/* 排行 + 快捷入口 */}
      <div className={s.row3}>
        <div className={s.card}>
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>品类销售排行</div>
              <div className={s.cardSub}>TOP 5 · 累计销售额</div>
            </div>
            <Button type="link" size="small" onClick={() => navigate('/sales')}>
              查看全部 ›
            </Button>
          </div>
          {rank.length > 0 ? (
            <div className={s.rankList}>
              {rank.map((item, i) => (
                <div key={item.id} className={s.rankRow}>
                  <span
                    className={`${s.rankIdx} ${i === 0 ? s.rankIdxTop : ''}`}
                  >
                    {i + 1}
                  </span>
                  <span className={s.rankName}>{item.name}</span>
                  <span className={s.rankBarWrap}>
                    <span
                      className={s.rankBar}
                      style={{ width: `${(item.amount / rankMax) * 100}%` }}
                    />
                  </span>
                  <span className={s.rankAmt}>{money(item.amount, 0)}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className={s.emptyBox}>
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无排行数据"
              />
            </div>
          )}
        </div>

        <div className={s.card}>
          <div className={s.cardHead}>
            <div className={s.cardTitle}>快捷入口</div>
            <span className={s.cardHint}>常用操作</span>
          </div>
          <div className={s.tiles}>
            {shortcuts.map((t) => (
              <div
                key={t.key}
                className={s.tile}
                onClick={() => navigate(t.to)}
              >
                <div className={s.tileIcon}>{t.icon}</div>
                <div className={s.tileTitle}>{t.title}</div>
                <div className={s.tileSub}>{t.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {isAllEmpty && (
        <div className={s.hint}>
          当前 mock 返回空数据，可参考验证清单第 6 条排查
        </div>
      )}
    </div>
  );
}
