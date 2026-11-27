// 引入所需钩子：缓存回调、副作用、派生数据、局部状态
import { useCallback, useEffect, useMemo, useState } from 'react';
// 引入 antd 的按钮、输入框、弹窗
import { Button, Input, Modal } from 'antd';
// 引入搜索图标
import { SearchOutlined } from '@ant-design/icons';
// 引入样式模块
import s from './GlobalSearch.module.scss';
// 引入本地「最近访问」读写工具
import { pushRecentPage, readRecentPages } from '../utils/recentPages';

/**
 * 全局页面搜索（只搜菜单/页面，不查业务数据）
 * - 入口：顶栏图标 / Ctrl·Cmd + K
 * - 数据：由 Layout 传入已按权限过滤过的页面列表 items
 * - 空态：最近访问过、且当前仍有权限的页面
 * @param {{ path: string, name: string, icon?: ReactNode, group?: string }[]} items - 可搜索页面
 * @param {(path: string) => void} onSelect - 选中页面后的回调（由父组件做路由跳转）
 */
export default function GlobalSearch({ items = [], onSelect }) {
  // 弹窗开关
  const [open, setOpen] = useState(false);
  // 搜索关键词
  const [q, setQ] = useState('');
  // 键盘高亮项索引
  const [active, setActive] = useState(0);
  // 最近访问的路径原始数组（读自 localStorage）
  const [recent, setRecent] = useState([]);

  /** 打开（或重新打开）搜索：清空输入、重置高亮、刷新最近访问 */
  const openSearch = useCallback(() => {
    // 每次打开都从空输入开始，避免带上上次的关键词
    setQ('');
    // 高亮回到第一项
    setActive(0);
    // 重新读取本地最近访问，保证是当前设备的最新记录
    setRecent(readRecentPages());
    // 打开弹窗
    setOpen(true);
  }, []);

  /** 注册 Ctrl / Cmd + K 全局快捷键 */
  useEffect(() => {
    // 键盘事件处理器
    const onKey = (e) => {
      // Ctrl（Windows）或 Cmd（macOS）+ K
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        // 阻止浏览器默认行为（如地址栏搜索）
        e.preventDefault();
        // 打开搜索弹窗
        openSearch();
      }
    };
    // 绑定到 window，保证焦不在输入框时也能触发
    window.addEventListener('keydown', onKey);
    // 卸载时解绑，避免重复监听
    return () => window.removeEventListener('keydown', onKey);
  }, [openSearch]);

  /** 匹配结果：空格分隔多关键字，名称与路径都参与匹配（全关键字都要命中） */
  const matched = useMemo(() => {
    // 归一化：去首尾空格、转小写、按空白拆词并剔除空串
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    // 无关键词时不做匹配（由最近访问列表接管展示）
    if (!words.length) return [];
    // 每个词都要命中 name 或 path，实现「多词与」语义
    return items.filter((it) =>
      words.every(
        (w) => it.name.toLowerCase().includes(w) || it.path.toLowerCase().includes(w),
      ),
    );
  }, [items, q]);

  /** 最近访问转成可渲染项：按 path 映射回菜单项，并过滤掉已无权限的页面 */
  const recentItems = useMemo(() => {
    // 先建 path → 菜单项 的映射，避免嵌套遍历
    const byPath = new Map(items.map((it) => [it.path, it]));
    // 逐个还原，找不到（已失去权限 / 已删除菜单）的项被 filter(Boolean) 去掉
    return recent.map((p) => byPath.get(p)).filter(Boolean);
  }, [items, recent]);

  // 列表数据源：有关键词看匹配结果，无关键词看最近访问
  const list = q.trim() ? matched : recentItems;
  // 是否处于「最近访问」分组态（用于显示分组标题、隐藏路径信息）
  const grouped = !q.trim() && list.length > 0;

  /** 选中某一项：记录到最近访问、关闭弹窗、交给父组件跳转 */
  const choose = (it) => {
    // 空项（如列表为空时按回车）直接忽略
    if (!it) return;
    // 写入本地最近访问，并同步到当前 state（下次打开立即生效）
    setRecent(pushRecentPage(it.path));
    // 关闭弹窗
    setOpen(false);
    // 通知父组件执行路由跳转
    onSelect?.(it.path);
  };

  /** 键盘交互：上下移动高亮、回车确认 */
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      // 阻止光标移动等默认行为
      e.preventDefault();
      // 下移一位，最多停在最后一项（列表为空时保持 0）
      setActive((i) => Math.min(i + 1, Math.max(list.length - 1, 0)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      // 上移一位，最少停在 0
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      // 回车直接选择当前高亮项
      choose(list[active]);
    }
  };

  return (
    <>
      {/* 顶栏入口按钮：文字按钮样式，仅图标 */}
      <Button
        type="text"
        aria-label="搜索页面（Ctrl+K）"
        title="搜索页面（Ctrl+K）"
        style={{ width: 32, height: 32 }}
        onClick={openSearch}
      >
        <SearchOutlined style={{ fontSize: 15 }} />
      </Button>

      {/* 搜索弹窗：无页脚、无关闭按钮（点遮罩或 Esc 关闭） */}
      <Modal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        closable={false}
        width={520}
        centered
        // 去掉默认内边距，让输入框与列表贴边，形成通栏视觉
        styles={{ content: { padding: 0, overflow: 'hidden' } }}
        // 关闭即销毁内部结构，保证每次打开都是全新状态（输入框可重新 autoFocus）
        destroyOnHidden
      >
        {/* 搜索输入框：无边框大号样式，聚焦自动获得焦点 */}
        <Input
          autoFocus
          size="large"
          variant="borderless"
          className={s.input}
          // 左侧灰色搜索图标
          prefix={<SearchOutlined style={{ color: '#A8A29C' }} />}
          placeholder="搜索页面，如「角色」「设置」"
          value={q}
          allowClear
          onChange={(e) => {
            // 更新关键词
            setQ(e.target.value);
            // 关键词变化后高亮回到第一项
            setActive(0);
          }}
          // 输入框内直接接管方向键与回车
          onKeyDown={onKeyDown}
        />

        {/* 结果 / 最近访问列表 */}
        <div className={s.list}>
          {/* 空输入且有过访问记录时，显示分组标题 */}
          {grouped ? <div className={s.groupTitle}>最近访问</div> : null}

          {list.length ? (
            // 逐项渲染为可点击按钮，保证键盘与鼠标都可操作
            list.map((it, i) => (
              <button
                type="button"
                key={it.path}
                // 当前高亮项追加激活类名
                className={`${s.item} ${i === active ? s.itemActive : ''}`}
                // 鼠标移入同步高亮索引，键盘与鼠标状态不分叉
                onMouseEnter={() => setActive(i)}
                onClick={() => choose(it)}
              >
                {/* 菜单图标 */}
                <span className={s.itemIcon}>{it.icon}</span>
                {/* 菜单名称 */}
                <span className={s.itemName}>{it.name}</span>
                {/* 最近访问只显示图标 + 名称；搜索匹配结果才带「分组 · 路径」辅助定位 */}
                {grouped ? null : (
                  <span className={s.itemPath}>
                    {it.group} · {it.path}
                  </span>
                )}
              </button>
            ))
          ) : (
            // 空态：有关键词说没匹配到，无关键词则引导用户尝试搜索
            <div className={s.empty}>
              {q.trim() ? '没有匹配的页面' : '还没有访问记录，试试搜「角色」「设置」'}
            </div>
          )}
        </div>
      </Modal>
    </>
  );
}
