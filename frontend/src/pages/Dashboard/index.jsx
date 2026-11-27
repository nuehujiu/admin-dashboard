// 引入所需钩子：回调缓存、副作用、派生数据、局部状态
import { useCallback, useEffect, useMemo, useState } from 'react';
// 引入 antd 的分段控制器（时间范围切换）、按钮、空态、骨架屏
import { Segmented, Button, Empty, Skeleton } from 'antd';
// 引入用到的图标：下载、商品、单据、图表、团队、应用、加人、车辆、表格
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
// 引入路由跳转
import { useNavigate } from 'react-router-dom';
// 引入图表容器组件（ECharts 封装）
import ChartBox from '../../components/ChartBox';
// 引入迷你趋势线组件
import Sparkline from '../../components/Sparkline';
// 引入看板相关接口：概览、趋势、品类占比、排行
import {
  getOverview,
  getTrend,
  getCategoryRatio,
  getRank,
} from '../../api/dashboard';
// 引入格式化工具：金额、金额缩写、整数、百分比
import { money, moneyShort, int, percent } from '../../utils/format';
// 引入用户仓库（取当前用户做问候语）
import { useUserStore } from '../../store/useUserStore';
// 引入样式模块
import s from './index.module.scss';

// 图表配色：暖橙系为主，穿插青绿与中性色，保证色相区分度
const PALETTE = [
  '#F5611D',
  '#F0A33C',
  '#2F8F86',
  '#C08867',
  '#C7BFB6',
  '#D9CFC5',
];
// 时间范围选项（Segmented 的配置）
const RANGES = [
  { label: '近 7 天', value: 7 },
  { label: '近 30 天', value: 30 },
  { label: '近 90 天', value: 90 },
];
// 星期中文映射，Date.getDay() 返回 0~6 对应「日」到「六」
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * 按时段返回问候语
 * @param {number} h - 小时数（0-23）
 * @returns {string} 对应时段的问候语
 */
function greeting(h) {
  if (h < 6) return '凌晨好';    // 0-5 点
  if (h < 12) return '上午好';   // 6-11 点
  if (h < 14) return '中午好';   // 12-13 点
  if (h < 18) return '下午好';   // 14-17 点
  return '晚上好';               // 18-23 点
}

/**
 * 数据看板页
 * 组成：问候区（时间范围切换）→ 四个 KPI 卡 → 趋势图 + 品类环形图 → 排行 + 快捷入口
 * 数据策略：四个接口并行拉取，任一失败整体进入错误态（页面数据互相依赖，单独降级意义不大）
 */
export default function Dashboard() {
  // 路由跳转函数（导出报表、快捷入口都用它）
  const navigate = useNavigate();
  // 当前用户（问候语展示昵称）
  const user = useUserStore((u) => u.user);
  // 当前时间：用 useMemo 固化，避免每次渲染都 new Date 导致日期文案抖动
  const now = useMemo(() => new Date(), []);

  // ===== 状态 =====
  // 概览指标（今日金额/订单、累计金额、用户数等）
  const [overview, setOverview] = useState(null);
  // 每日趋势序列（含 date / amount / qty）
  const [trend, setTrend] = useState([]);
  // 品类占比（name / value）
  const [ratio, setRatio] = useState([]);
  // 品类排行（取前 5）
  const [rank, setRank] = useState([]);
  // 统计窗口天数，同时也是趋势接口参数
  const [range, setRange] = useState(30);
  // 计数器：自增即触发重新加载（手动刷新用）
  const [tick, setTick] = useState(0);
  // 加载中标记
  const [loading, setLoading] = useState(true);
  // 加载失败标记
  const [error, setError] = useState(false);
  // 数据更新时间文案（HH:mm）
  const [updatedAt, setUpdatedAt] = useState('');

  // 数据拉取：range 变化（切时间范围）或 tick 自增（手动刷新）时重新执行
  useEffect(() => {
    // 卸载标记，避免请求返回后对已卸载组件 setState
    let alive = true;
    // 四个接口并行，缩短整体等待
    Promise.all([
      getOverview(),
      getCategoryRatio(),
      getRank(5),
      getTrend(range),
    ])
      .then(([ov, ra, rk, tr]) => {
        // 已卸载则丢弃
        if (!alive) return;
        // 依次写入四份数据（列表类接口做空数组兜底）
        setOverview(ov);
        setRatio(ra || []);
        setRank(rk || []);
        setTrend(tr || []);
        // 记录本次拉取时间，仅取「时:分」，展示在页面副标题
        setUpdatedAt(
          new Date().toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          }),
        );
        // 成功后清除错误态（支持失败后重试成功）
        setError(false);
      })
      .catch(() => {
        // 任一接口失败即进入错误态，交由页面整块兜底
        if (alive) setError(true);
      })
      .finally(() => {
        // 无论成败都结束 loading
        if (alive) setLoading(false);
      });
    // 清理：组件卸载或依赖变化时作废旧请求结果
    return () => {
      alive = false;
    };
  }, [range, tick]);

  /** 手动重新加载：先置 loading，再自增 tick 触发上面的 effect */
  const reload = useCallback(() => {
    setLoading(true);
    setTick((t) => t + 1);
  }, []);

  // ===== 派生数据（全部用 useMemo，避免重复计算与无谓重渲染）=====
  // KPI 迷你趋势线：取最近 7 天的金额序列
  const amountSpark = useMemo(
    () => trend.map((i) => i.amount).slice(-7),
    [trend],
  );
  // KPI 迷你趋势线：取最近 7 天的销量序列
  const qtySpark = useMemo(() => trend.map((i) => i.qty).slice(-7), [trend]);
  // 品类销售合计，用于环形图中心展示与百分比计算
  const ratioSum = useMemo(
    () => ratio.reduce((a, i) => a + i.value, 0),
    [ratio],
  );
  // 排行条最大值（兜底 1，避免除以 0 导致宽度 NaN）
  const rankMax = useMemo(
    () => Math.max(1, ...rank.map((i) => i.amount)),
    [rank],
  );

  // ===== 趋势图配置（双轴折线：销售额 + 销量）=====
  const trendOption = useMemo(
    () => ({
      // 两条线的主色：暖橙 + 青绿，色相区分明显
      color: [PALETTE[0], '#2F8F86'],
      // 网格留白：左侧留给金额刻度
      grid: { left: 56, right: 20, top: 16, bottom: 30 },
      tooltip: {
        // 按坐标轴触发，hover 到某一天同时展示两条线
        trigger: 'axis',
        backgroundColor: '#fff',
        borderColor: '#EDE8E2',
        borderWidth: 1,
        textStyle: { color: '#1C1917', fontSize: 12 },
        // 竖向指示线颜色与描边一致
        axisPointer: { type: 'line', lineStyle: { color: '#EDE8E2' } },
      },
      xAxis: {
        // 类目轴：按日期字符串排布
        type: 'category',
        // 折线不预留两端间隙
        boundaryGap: false,
        // 只取 'YYYY-MM-DD' 中的 'MM-DD'，节省横向空间
        data: trend.map((i) => i.date.slice(5)),
        axisLine: { lineStyle: { color: '#EDE8E2' } },
        // 隐藏刻度短线，视觉更干净
        axisTick: { show: false },
        axisLabel: {
          color: '#A8A29C',
          fontSize: 11,
          // 90 个点全显示会糊成一团，按数量抽稀（约显示 8 个标签）
          interval: Math.max(0, Math.floor(trend.length / 8) - 1),
        },
      },
      yAxis: [
        {
          // 左轴：金额，显示刻度与横向分割线
          type: 'value',
          splitLine: { lineStyle: { color: '#F4F1ED' } },
          axisLabel: {
            color: '#A8A29C',
            fontSize: 11,
            // 万级以上转成「x万」，避免刻度过长
            formatter: (v) => (v >= 10000 ? `${v / 10000}万` : v),
          },
        },
        // 右轴：销量走独立轴，不显刻度（两条线量级不同，不能共用一根轴）
        { type: 'value', show: false },
      ],
      series: [
        {
          name: '销售额',
          type: 'line',
          // 平滑曲线，观感更柔和
          smooth: true,
          // 隐藏数据点圆点，减少视觉噪点
          showSymbol: false,
          // 绑定左轴
          yAxisIndex: 0,
          data: trend.map((i) => i.amount),
          lineStyle: { width: 2 },
          // 线下浅色填充，强化趋势「体积感」
          areaStyle: { opacity: 0.14 },
        },
        {
          name: '销量',
          type: 'line',
          smooth: true,
          showSymbol: false,
          // 绑定右轴
          yAxisIndex: 1,
          data: trend.map((i) => i.qty),
          // 虚线 + 细线，与销售额主线条区分
          lineStyle: { width: 1.4, type: 'dashed' },
        },
      ],
    }),
    [trend],
  );

  // ===== 环形图（品类销售占比）=====
  const pieOption = useMemo(
    () => ({
      color: PALETTE,
      tooltip: {
        // 按图形项触发，hover 单个扇区
        trigger: 'item',
        backgroundColor: '#fff',
        borderColor: '#EDE8E2',
        borderWidth: 1,
        textStyle: { color: '#1C1917', fontSize: 12 },
        // 提示内容：品类名 + 金额 + 占比
        formatter: (p) => `${p.name}<br/>${money(p.value)}（${p.percent}%）`,
      },
      series: [
        {
          type: 'pie',
          // 内外半径形成环形（62%~84%）
          radius: ['62%', '84%'],
          center: ['50%', '50%'],
          // 扇区之间 2px 白边，形成分割感
          itemStyle: { borderColor: '#fff', borderWidth: 2 },
          // 不显示引导线与标签（占比信息在右侧图例里展示）
          label: { show: false },
          labelLine: { show: false },
          // hover 时扇区轻微放大
          emphasis: { scale: true, scaleSize: 4 },
          data: ratio.map((i) => ({ name: i.name, value: i.value })),
        },
      ],
    }),
    [ratio],
  );

  // ===== KPI 卡片数据 =====
  // 今日金额同比变化（正数为增长）
  const change = overview?.today_amount_change ?? 0;
  const kpis = [
    {
      key: 'today_amount',
      label: '今日销售额',
      // 未加载时用破折号占位，避免出现 0 造成误解
      value: overview ? money(overview.today_amount) : '—',
      sub: overview ? `${percent(change)} 较昨日` : '',
      // 方向决定箭头与配色
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
      // 副信息拼出件数与记录条数，补充口径说明
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
      // 用户数没有时间序列，不画迷你趋势线
      spark: [],
      color: '#C7BFB6',
      iconBg: '#F4F1ED',
      icon: <TeamOutlined />,
    },
  ];

  // ===== 快捷入口 =====
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

  // ===== 渲染分支 =====
  // 分支 1：加载失败 → 空态 + 重新加载按钮
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

  // 分支 2：首次加载（还没有任何概览数据）→ 骨架屏，避免空白页
  if (loading && !overview) {
    return (
      <div className={s.page}>
        {/* 问候区占位 */}
        <div className={s.hero}>
          <div>
            <h1 className={s.hello}>数据加载中…</h1>
          </div>
        </div>
        {/* 四个 KPI 骨架 */}
        <div className={s.kpiGrid}>
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={s.kpi}>
              <Skeleton active title={false} paragraph={{ rows: 2 }} />
            </div>
          ))}
        </div>
        {/* 两张图的骨架 */}
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

  // 判定「全站无数据」：概览与趋势金额都为 0，用于底部提示排查
  const isAllEmpty =
    overview &&
    overview.today_amount === 0 &&
    overview.total_amount === 0 &&
    trend.every((i) => i.amount === 0);

  return (
    <div className={s.page}>
      {/* ===== 顶部问候区 ===== */}
      <div className={s.hero}>
        <div>
          <h1 className={s.hello}>
            {/* 按时段问候 + 昵称/用户名 */}
            {greeting(now.getHours())}，
            {user?.nickname || user?.username || '管理员'}
          </h1>
          {/* 日期 + 星期 + 数据更新时间 */}
          <div className={s.meta}>
            {now.getFullYear()} 年 {now.getMonth() + 1} 月 {now.getDate()} 日 周
            {/* getDay() 0~6 映射到中文星期 */}
            {WEEK[now.getDay()]}
            {updatedAt && ` · 数据更新于 ${updatedAt}`}
          </div>
        </div>
        {/* 右侧操作：时间范围切换 + 导出 */}
        <div className={s.heroActions}>
          <Segmented
            value={range}
            options={RANGES}
            onChange={(v) => {
              // 切换范围时先置 loading，再用新 range 触发请求
              setLoading(true);
              setRange(v);
            }}
          />
          <Button
            icon={<DownloadOutlined />}
            // 导出统一走销售页（那里有完整的导出逻辑）
            onClick={() => navigate('/sales')}
          >
            导出报表
          </Button>
        </div>
      </div>

      {/* ===== KPI 卡片区 ===== */}
      <div className={s.kpiGrid}>
        {kpis.map((k) => (
          <div key={k.key} className={s.kpi}>
            {/* 左侧：标签 + 数值 + 副说明 */}
            <div className={s.kpiMain}>
              <div className={s.kpiLabel}>{k.label}</div>
              <div className={s.kpiValue}>
                {k.value}
                {/* 单位小字跟在数值后面 */}
                {k.unit && <span className={s.kpiUnit}>{k.unit}</span>}
              </div>
              {k.sub && (
                <div className={s.kpiSub}>
                  {/* 增长/下降箭头，仅 today_amount 那个卡会有 */}
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
            {/* 右侧：图标块 + 迷你趋势线 */}
            <div className={s.kpiRight}>
              <div className={s.kpiIcon} style={{ background: k.iconBg }}>
                {k.icon}
              </div>
              {/* 无序列数据时不画 Sparkline */}
              {k.spark.length > 0 && (
                <Sparkline data={k.spark} color={k.color} />
              )}
            </div>
          </div>
        ))}
      </div>

      {/* ===== 第二行：趋势图 + 品类环形图 ===== */}
      <div className={s.row2}>
        <div className={s.card}>
          {/* 卡片头：标题 + 副标题 + 右上角图例 */}
          <div className={s.cardHead}>
            <div>
              <div className={s.cardTitle}>销售趋势</div>
              <div className={s.cardSub}>近 {range} 天每日销售额与销量走势</div>
            </div>
            <div className={s.legendTop}>
              <span className={s.legendKey}>
                {/* 色块与系列颜色一致 */}
                <i style={{ background: PALETTE[0] }} />
                销售额
              </span>
              <span className={s.legendKey}>
                <i style={{ background: '#2F8F86' }} />
                销量
              </span>
            </div>
          </div>
          {/* 有金额数据才画图，否则显示空态（避免渲染一条全 0 的直线） */}
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
              {/* 左侧环形图 + 中心汇总数字 */}
              <div className={s.pieBox}>
                <ChartBox option={pieOption} height={186} />
                <div className={s.pieCenter}>
                  <span>销售合计</span>
                  {/* 金额缩写（万/亿），适配环形图中心窄空间 */}
                  <strong>{moneyShort(ratioSum)}</strong>
                </div>
              </div>
              {/* 右侧图例：色点 + 名称 + 占比 + 金额 */}
              <div className={s.pieLegend}>
                {ratio.map((item, i) => (
                  <div key={item.name} className={s.pieLegendRow}>
                    <i
                      className={s.dot}
                      // 用取模循环复用调色板，品类数量可变
                      style={{ background: PALETTE[i % PALETTE.length] }}
                    />
                    <span className={s.pieName}>{item.name}</span>
                    <span className={s.piePct}>
                      {/* 占比取整展示；合计为 0 时兜底 0 防除零 */}
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

      {/* ===== 第三行：排行 + 快捷入口 ===== */}
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
                  {/* 序号：第一名的样式额外高亮 */}
                  <span
                    className={`${s.rankIdx} ${i === 0 ? s.rankIdxTop : ''}`}
                  >
                    {i + 1}
                  </span>
                  <span className={s.rankName}>{item.name}</span>
                  <span className={s.rankBarWrap}>
                    {/* 横向进度条：宽度按占最大值的比例计算 */}
                    <span
                      className={s.rankBar}
                      style={{ width: `${(item.amount / rankMax) * 100}%` }}
                    />
                  </span>
                  {/* 金额取整展示，避免小数占宽 */}
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
              // 整个磁贴可点击，直接跳对应页面
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

      {/* 全站无数据时给出排查提示（接口或数据库可能未就绪） */}
      {isAllEmpty && (
        <div className={s.hint}>
          当前没有数据，可检查后端接口与数据库是否正常
        </div>
      )}
    </div>
  );
}
