import { useCallback, useEffect, useState } from 'react';
import { Badge, Button, Popover } from 'antd';
import {
  BellOutlined, CheckOutlined, ShoppingOutlined, SoundOutlined, UserOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import s from './NoticeBell.module.scss';
import { getNotifications } from '../api/notification';

/** 已读状态：id -> sig，签名变了就重新算未读 */
const READ_KEY = 'houtai-notice-read';
const POLL_MS = 60000;

const ICONS = {
  stock: <ShoppingOutlined />,
  user: <UserOutlined />,
  notice: <SoundOutlined />,
};

function loadRead() {
  try {
    const map = JSON.parse(localStorage.getItem(READ_KEY) || '{}');
    return map && typeof map === 'object' ? map : {};
  } catch {
    return {};
  }
}

export default function NoticeBell() {
  const navigate = useNavigate();
  const [items, setItems] = useState([]);
  const [readMap, setReadMap] = useState(loadRead);
  const [open, setOpen] = useState(false);

  const fetchAll = useCallback(() => {
    getNotifications()
      .then((data) => setItems(Array.isArray(data) ? data : []))
      .catch(() => {
        /* 通知拉取失败不影响主流程 */
      });
  }, []);

  useEffect(() => {
    fetchAll();
    const timer = setInterval(() => {
      if (!document.hidden) fetchAll();
    }, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) fetchAll();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [fetchAll]);

  const saveRead = (next) => {
    setReadMap(next);
    try {
      localStorage.setItem(READ_KEY, JSON.stringify(next));
    } catch {
      /* 忽略 */
    }
  };

  const unread = items.filter((it) => readMap[it.id] !== it.sig);

  const markOne = (it) => saveRead({ ...readMap, [it.id]: it.sig });

  const markAll = () => {
    const next = { ...readMap };
    items.forEach((it) => {
      next[it.id] = it.sig;
    });
    saveRead(next);
  };

  const openItem = (it) => {
    markOne(it);
    setOpen(false);
    navigate(it.path);
  };

  const content = (
    <div className={s.panel}>
      <div className={s.head}>
        <span className={s.title}>
          通知
          {unread.length ? <em className={s.count}>{unread.length}</em> : null}
        </span>
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
            const isUnread = readMap[it.id] !== it.sig;
            return (
              <button
                type="button"
                key={it.id}
                className={s.row}
                onClick={() => openItem(it)}
              >
                <span className={`${s.icon} ${s[it.type] || ''}`}>
                  {ICONS[it.type] || <BellOutlined />}
                </span>
                <span className={s.body}>
                  <span className={s.rowTitle}>
                    {isUnread ? <i className={s.dot} /> : null}
                    {it.title}
                  </span>
                  <span className={s.desc}>{it.desc}</span>
                  <span className={s.time}>{it.time || '—'}</span>
                </span>
              </button>
            );
          })}
        </div>
      ) : (
        <div className={s.empty}>暂无通知</div>
      )}
    </div>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (v) fetchAll();
      }}
      content={content}
      trigger="click"
      placement="bottomRight"
      arrow={false}
      styles={{ body: { padding: 0 } }}
    >
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
