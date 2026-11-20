import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Input, Modal } from 'antd';
import { SearchOutlined } from '@ant-design/icons';
import s from './GlobalSearch.module.scss';
import { pushRecentPage, readRecentPages } from '../utils/recentPages';

/**
 * 全局页面搜索（只搜菜单，不查业务数据）
 * - 入口：顶栏图标 / Ctrl·Cmd + K
 * - 数据：由 Layout 传入已按权限过滤过的页面列表
 * - 空态：最近访问过、且当前仍有权限的页面
 */
export default function GlobalSearch({ items = [], onSelect }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const [recent, setRecent] = useState([]);

  /** 打开（或重新打开）时清空输入、刷新最近访问 */
  const openSearch = useCallback(() => {
    setQ('');
    setActive(0);
    setRecent(readRecentPages());
    setOpen(true);
  }, []);

  /** Ctrl / Cmd + K 唤起 */
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  /** 匹配结果：空格分隔多关键字，名称与路径都参与匹配 */
  const matched = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return items.filter((it) =>
      words.every(
        (w) => it.name.toLowerCase().includes(w) || it.path.toLowerCase().includes(w),
      ),
    );
  }, [items, q]);

  const recentItems = useMemo(() => {
    const byPath = new Map(items.map((it) => [it.path, it]));
    return recent.map((p) => byPath.get(p)).filter(Boolean);
  }, [items, recent]);

  // 空输入且有历史 → 显示最近访问；否则显示匹配结果
  const list = q.trim() ? matched : recentItems;
  const grouped = !q.trim() && list.length > 0;

  const choose = (it) => {
    if (!it) return;
    setRecent(pushRecentPage(it.path));
    setOpen(false);
    onSelect?.(it.path);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(list[active]);
    }
  };

  return (
    <>
      <Button
        type="text"
        aria-label="搜索页面（Ctrl+K）"
        title="搜索页面（Ctrl+K）"
        style={{ width: 32, height: 32 }}
        onClick={openSearch}
      >
        <SearchOutlined style={{ fontSize: 15 }} />
      </Button>

      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        width={520}
        centered
        styles={{ content: { padding: 0, overflow: 'hidden' } }}
        destroyOnHidden
      >
        <Input
          autoFocus
          size="large"
          variant="borderless"
          className={s.input}
          prefix={<SearchOutlined style={{ color: '#A8A29C' }} />}
          placeholder="搜索页面，如「角色」「设置」"
          value={q}
          allowClear
          onChange={(e) => {
            setQ(e.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />

        <div className={s.list}>
          {grouped ? <div className={s.groupTitle}>最近访问</div> : null}

          {list.length ? (
            list.map((it, i) => (
              <button
                type="button"
                key={it.path}
                className={`${s.item} ${i === active ? s.itemActive : ''}`}
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it)}
              >
                <span className={s.itemIcon}>{it.icon}</span>
                <span className={s.itemName}>{it.name}</span>
                {/* 最近访问只显示图标 + 名称；搜索匹配结果才带路径辅助定位 */}
                {grouped ? null : (
                  <span className={s.itemPath}>
                    {it.group} · {it.path}
                  </span>
                )}
              </button>
            ))
          ) : (
            <div className={s.empty}>
              {q.trim() ? '没有匹配的页面' : '还没有访问记录，试试搜「角色」「设置」'}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
