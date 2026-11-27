// 引入钩子：缓存回调、副作用、局部状态
import { useCallback, useEffect, useState } from 'react';
// 引入 antd 角标、按钮、气泡卡片
import { Badge, Button, Popover } from 'antd';
// 引入所需图标：铃铛（默认）、对勾（已读）、商品（库存类通知）、喇叭（公告）、用户（账号类通知）
import {
  BellOutlined, CheckOutlined, ShoppingOutlined, SoundOutlined, UserOutlined,
} from '@ant-design/icons';
// 引入路由跳转（点击通知可跳到对应页面）
import { useNavigate } from 'react-router-dom';
// 引入样式模块
import s from './NoticeBell.module.scss';
// 引入通知列表接口（后端按权限派生可见范围）
import { getNotifications } from '../api/notification';

/**
 * 已读状态存储键
 * 值形如 { [id]: sig }：记录「读到哪个版本的这条通知」
 * 后端更新内容会改变 sig，签名一变化就重新算作未读
 */
const READ_KEY = 'houtai-notice-read';
// 轮询间隔：60 秒
const POLL_MS = 60000;

// 不同类型通知对应的图标映射
const ICONS = {
  // 库存 / 商品类
  stock: <ShoppingOutlined />,
  // 账号 / 用户类
  user: <UserOutlined />,
  // 公告类
  notice: <SoundOutlined />,
};

/**
 * 读取本地已读表
 * @returns {Record<string, string>} id → 签名 的映射；数据异常时返回空对象
 */
function loadRead() {
  try {
    // 解析本地 JSON，缺省用 '{}'
    const map = JSON.parse(localStorage.getItem(READ_KEY) || '{}');
    // 必须是对象，否则视为脏数据
    return map && typeof map === 'object' ? map : {};
  } catch {
    // 解析失败静默降级，未读状态从头算
    return {};
  }
}

/**
 * 顶栏通知铃铛
 * 行为：轮询拉取通知 → 与本地已读签名比对 → 角标显示未读数 → 弹层展示明细
 */
export default function NoticeBell() {
  // 路由跳转函数
  const navigate = useNavigate();
  // 通知列表
  const [items, setItems] = useState([]);
  // 已读映射（初始化时直接读本地，避免首帧闪烁）
  const [readMap, setReadMap] = useState(loadRead);
  // 弹层开关
  const [open, setOpen] = useState(false);

  /** 拉取通知列表 */
  const fetchAll = useCallback(() => {
    getNotifications()
      // 后端异常返回非数组时兜底成空数组，避免 map 报错
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {
        /* 通知拉取失败不影响主流程，静默忽略 */
      });
  }, []);

  /** 首次进入拉一次；之后定时轮询，并在页面重新可见时补拉 */
  useEffect(() => {
    fetchAll();
    // 定时器：标签页隐藏时跳过请求，省流量也省后端压力
    const timer = setInterval(() => {
      if (!document.hidden) fetchAll();
    }, POLL_MS);
    // 从后台切回前台时立即补拉一次，避免看到过期数据
    const onVisible = () => {
      if (!document.hidden) fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    // 卸载清理：停掉定时器与事件监听
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchAll]);

  /** 写入已读状态：内存与本地存储同步更新 */
  const saveRead = (next) => {
    // 更新 state 触发重渲染（角标与红点随之变化）
    setReadMap(next);
    try {
      // 持久化到本地，刷新后已读状态不丢
      localStorage.setItem(READ_KEY, JSON.stringify(next));
    } catch {
      /* 隐私模式写不进去，忽略即可 */
    }
  };

  // 未读列表：本地记录的签名与通知当前签名不一致即为未读
  const unread = items.filter((it) => readMap[it.id] !== it.sig);

  /** 单条标记已读 */
  const markOne = (it) => saveRead({ ...readMap, [it.id]: it.sig });

  /** 全部标记已读：把每条通知的当前签名都记录下来 */
  const markAll = () => {
    // 基于现有映射浅拷贝，避免直接改原对象
    const next = { ...readMap };
    items.forEach((it) => {
      next[it.id] = it.sig;
    });
    saveRead(next);
  };

  /** 点击某条通知：标记已读 → 关闭弹层 → 跳转对应页面 */
  const openItem = (it) => {
    markOne(it);
    setOpen(false);
    navigate(it.path);
  };

  // 弹层内容：头部（标题 + 未读数 + 全部已读）+ 列表 / 空态
  const content = (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.title}>
          通知
          {/* 有未读时在标题后展示数字徽标 */}
          {unread.length ? <em className={s.count}>{unread.length}</em> : null}
        </span>
        {/* 全部已读：没有未读时禁用，避免无效点击 */}
        <Button
          type="link"
          size="small"
          icon={<CheckOutlined />}
          disabled={!unread.length}
          onClick={markAll}
        >
          全部已读
        </Button>
      </div>

      {items.length ? (
        <div className={s.list}>
          {items.map((it) => {
            // 逐条判断未读（与角标口径一致）
            const isUnread = readMap[it.id] !== it.sig;
            return (
              <button
                type="button"
                key={it.id}
                className={s.row}
                onClick={() => openItem(it)}
              >
                {/* 类型图标：按 type 取对应图标与配色类名，未知类型回落铃铛 */}
                <span className={`${s.icon} ${s[it.type] || ''}`}>
                  {ICONS[it.type] || <BellOutlined />}
                </span>
                <span className={s.body}>
                  <span className={s.rowTitle}>
                    {/* 未读时标题前加一个红点 */}
                    {isUnread ? <i className={s.dot} /> : null}
                    {it.title}
                  </span>
                  {/* 副描述 */}
                  <span className={s.desc}>{it.desc}</span>
                  {/* 时间，缺省用破折号占位 */}
                  <span className={s.time}>{it.time || '—'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        // 无通知时的空态
        <div className={s.empty}>暂无通知</div>
      )}
    </div>
  );

  return (
    // 气泡卡片：点击触发，右下角弹出，无箭头，去掉默认内边距
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        // 打开时顺手补拉一次，保证看到的是最新通知
        if (v) fetchAll();
      }}
      content={content}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      styles={{ body: { padding: 0 } }}
    >
      {/* 触发按钮：图标 + 未读角标 */}
      <Button
        type="text"
        aria-label={unread.length ? `通知（${unread.length} 条未读）` : '通知'}
        title="通知"
        style={{ width: 32, height: 32 }}
      >
        <Badge count={unread.length} size="small" offset={[2, -2]}>
          <BellOutlined style={{ fontSize: 15 }} />
        </Badge>
      </Button>
    </Popover>
  );
}
