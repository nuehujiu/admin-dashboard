/**
 * 通知中心（不建表，从业务数据实时派生）
 *   - 库存偏低：goods.stock < 50        需 goods:view
 *   - 账号禁用：users.status = 0         需 user:list
 *   - 系统公告：settings.notice 非空      所有登录用户可见
 *
 * 每条通知带 sig（签名）：库存数量 / 禁用数量 / 公告内容 任一变化，
 * sig 就会变，前端据此把该条重新标为未读。
 */
// 查询助手
const { query } = require('../config/db');
// 统一成功响应
const { success } = require('../utils/response');

// 库存预警线（与商品页的预警线保持一致）
const LOW_STOCK = 50;

/** 当前角色拥有的权限点 */
async function ownedPerms(roleId) {
  // 与 middleware/auth.js 的查询同源：role_menu → menus.permission
  const rows = await query(
    'SELECT m.permission FROM role_menu rm JOIN menus m ON m.id = rm.menu_id WHERE rm.role_id = ?',
    [roleId]
  );
  // Set 去重，过滤空 permission
  return new Set(rows.map((r) => r.permission).filter(Boolean));
}

/**
 * 当前用户可见的通知列表
 * 组装策略：按权限决定是否派生对应业务通知，最后按时间倒序
 */
async function list(req, res, next) {
  try {
    // 先取权限，后面的分支都依赖它
    const owned = await ownedPerms(req.user.role_id);
    // 结果集合
    const items = [];

    // —— 分支一：库存预警（需 goods:view）
    if (owned.has('goods:view')) {
      const rows = await query(
        `SELECT COUNT(*) AS n, DATE_FORMAT(MAX(updated_at), '%Y-%m-%d %H:%i') AS t
         FROM goods WHERE stock < ?`,
        [LOW_STOCK]
      );
      // COUNT 返回可能是字符串（部分驱动），统一转数字
      const n = Number(rows[0]?.n || 0);
      if (n > 0) {
        items.push({
          // id 固定，便于前端按 id 记录已读
          id: 'goods-stock-low',
          // sig 用数量：数量一变，前端就认为是「新通知」
          sig: String(n),
          type: 'stock',
          title: `${n} 件商品库存偏低`,
          desc: `库存不足 ${LOW_STOCK} 件，建议尽快补货`,
          // 点击通知后跳转的页面
          path: '/goods',
          // 取最近一次更新时间，用于排序与展示
          time: rows[0]?.t || '',
        });
      }
    }

    // —— 分支二：禁用账号（需 user:list）
    if (owned.has('user:list')) {
      const rows = await query(
        `SELECT COUNT(*) AS n, DATE_FORMAT(MAX(updated_at), '%Y-%m-%d %H:%i') AS t
         FROM users WHERE status = 0`,
        []
      );
      const n = Number(rows[0]?.n || 0);
      if (n > 0) {
        items.push({
          id: 'users-disabled',
          sig: String(n),
          type: 'user',
          title: `${n} 个账号处于禁用状态`,
          desc: '禁用账号无法登录，请确认是否符合预期',
          path: '/system/users',
          time: rows[0]?.t || '',
        });
      }
    }

    // —— 分支三：系统公告（所有登录用户可见，不判权限）
    const notices = await query(
      "SELECT `value`, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS t FROM settings WHERE `key` = 'notice'"
    );
    // 取公告正文并去首尾空白
    const text = notices.length ? String(notices[0].value || '').trim() : '';
    if (text) {
      items.push({
        id: 'system-notice',
        // 用正文前 24 个字符做签名：内容改了就算新通知
        sig: text.slice(0, 24),
        type: 'notice',
        title: '系统公告已更新',
        // 过长截断加省略号，避免通知项撑高
        desc: text.length > 40 ? `${text.slice(0, 40)}…` : text,
        path: '/settings',
        time: notices[0].t || '',
      });
    }

    // 按时间倒序，无时间的排后面
    // 时间格式统一为 YYYY-MM-DD HH:mm，字符串比较即时间比较
    items.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));

    return success(res, items);
  } catch (err) {
    next(err);
  }
}

// 只导出 list
module.exports = { list };
