/**
 * 通知中心（不建表，从业务数据实时派生）
 *   - 库存偏低：goods.stock < 50        需 goods:view
 *   - 账号禁用：users.status = 0         需 user:list
 *   - 系统公告：settings.notice 非空      所有登录用户可见
 *
 * 每条通知带 sig（签名）：库存数量 / 禁用数量 / 公告内容 任一变化，
 * sig 就会变，前端据此把该条重新标为未读。
 */
const { query } = require('../config/db');
const { success } = require('../utils/response');

const LOW_STOCK = 50;

/** 当前角色拥有的权限点 */
async function ownedPerms(roleId) {
  const rows = await query(
    'SELECT m.permission FROM role_menu rm JOIN menus m ON m.id = rm.menu_id WHERE rm.role_id = ?',
    [roleId]
  );
  return new Set(rows.map((r) => r.permission).filter(Boolean));
}

async function list(req, res, next) {
  try {
    const owned = await ownedPerms(req.user.role_id);
    const items = [];

    if (owned.has('goods:view')) {
      const rows = await query(
        `SELECT COUNT(*) AS n, DATE_FORMAT(MAX(updated_at), '%Y-%m-%d %H:%i') AS t
         FROM goods WHERE stock < ?`,
        [LOW_STOCK]
      );
      const n = Number(rows[0]?.n || 0);
      if (n > 0) {
        items.push({
          id: 'goods-stock-low',
          sig: String(n),
          type: 'stock',
          title: `${n} 件商品库存偏低`,
          desc: `库存不足 ${LOW_STOCK} 件，建议尽快补货`,
          path: '/goods',
          time: rows[0]?.t || '',
        });
      }
    }

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

    const notices = await query(
      "SELECT `value`, DATE_FORMAT(updated_at, '%Y-%m-%d %H:%i') AS t FROM settings WHERE `key` = 'notice'"
    );
    const text = notices.length ? String(notices[0].value || '').trim() : '';
    if (text) {
      items.push({
        id: 'system-notice',
        sig: text.slice(0, 24),
        type: 'notice',
        title: '系统公告已更新',
        desc: text.length > 40 ? `${text.slice(0, 40)}…` : text,
        path: '/settings',
        time: notices[0].t || '',
      });
    }

    // 按时间倒序，无时间的排后面
    items.sort((a, b) => String(b.time || '').localeCompare(String(a.time || '')));

    return success(res, items);
  } catch (err) {
    next(err);
  }
}

module.exports = { list };
