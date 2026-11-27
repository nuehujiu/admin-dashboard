/**
 * 系统设置控制器
 * 存储方式：settings(key, value) 键值表，GET 合并默认值后返回一个对象
 * 要点：
 *   - DEFAULTS 既是默认值也是字段白名单，未在白名单里的 key 一律拒绝
 *   - 每个字段独立校验，任一字段不合法就整体失败（不做部分保存）
 */
// 查询助手
const { query } = require('../config/db');
// 统一响应
const { success, fail } = require('../utils/response');

/** 默认值（也是字段白名单） */
const DEFAULTS = {
  systemName: '电商后台管理系统', // 系统名称（登录页与侧边栏品牌区）
  slogan: '用数据驱动每一次增长', // 副标语
  notice: '', // 系统公告（通知中心派生来源）
  themeColor: '#F5611D', // 主题色，仅允许 #RRGGBB
  siderCollapsed: 0, // 侧边栏是否折叠，0 展开 / 1 折叠
};

// 白名单：由默认值的键推导，保证两者永远同步
const ALLOWED_KEYS = Object.keys(DEFAULTS);

/** 校验单个字段，返回 { ok, value } 或 { ok:false, message } */
function validate(key, raw) {
  switch (key) {
    case 'systemName': {
      const v = String(raw ?? '').trim();
      // 名称必填，避免界面上出现空白标题
      if (!v) return { ok: false, message: '系统名称不能为空' };
      if (v.length > 30) return { ok: false, message: '系统名称不能超过 30 个字' };
      return { ok: true, value: v };
    }
    case 'slogan': {
      const v = String(raw ?? '');
      // 标语可空，只限长
      if (v.length > 50) return { ok: false, message: '标语不能超过 50 个字' };
      return { ok: true, value: v };
    }
    case 'notice': {
      const v = String(raw ?? '');
      // 公告可空，超长会撑爆通知项
      if (v.length > 200) return { ok: false, message: '公告不能超过 200 个字' };
      return { ok: true, value: v };
    }
    case 'themeColor': {
      const v = String(raw ?? '').trim();
      // 严格 #RRGGBB，避免注入非法 CSS 值
      if (!/^#[0-9a-fA-F]{6}$/.test(v)) return { ok: false, message: '主题色必须是 #RRGGBB 格式' };
      // 统一大写，便于前端比较与去重
      return { ok: true, value: v.toUpperCase() };
    }
    case 'siderCollapsed': {
      const n = Number(raw);
      // 只允许 0/1，避免前端拿到 3 之类无法解释的值
      if (n !== 0 && n !== 1) return { ok: false, message: 'siderCollapsed 只能为 0 或 1' };
      return { ok: true, value: n };
    }
    default:
      // 理论上不会走到（调用前已做白名单判断），保留兜底
      return { ok: false, message: `不支持的设置项: ${key}` };
  }
}

/** 读库并合并默认值，数字型字段转回 number */
async function readSettings() {
  // 取出全部键值对
  const rows = await query('SELECT `key`, `value` FROM settings');
  const stored = {};
  for (const r of rows) stored[r.key] = r.value;

  // 只返回白名单字段：库里有历史遗留的未知 key 也不会漏给前端
  const result = {};
  for (const key of ALLOWED_KEYS) {
    if (stored[key] === undefined) {
      // 库里没有 → 用默认值
      result[key] = DEFAULTS[key];
    } else if (key === 'siderCollapsed') {
      // DB 里所有值都是字符串，折叠状态需要转成数字
      result[key] = Number(stored[key]);
    } else {
      result[key] = stored[key];
    }
  }
  return result;
}

/** 读取全部设置 */
async function getAll(req, res, next) {
  try {
    return success(res, await readSettings());
  } catch (err) {
    next(err);
  }
}

/** 保存设置（支持部分字段） */
async function save(req, res, next) {
  try {
    const body = req.body || {};
    // 过滤掉 undefined：允许前端只提交改动过的字段（null 会被保留并校验）
    const entries = Object.entries(body).filter(([, v]) => v !== undefined);

    if (!entries.length) {
      return fail(res, '没有可保存的设置项');
    }

    // 先全量校验，全部合法才写库，避免"写了一半失败"
    const valid = [];
    for (const [key, value] of entries) {
      if (!ALLOWED_KEYS.includes(key)) {
        return fail(res, `不支持的设置项: ${key}`);
      }
      const r = validate(key, value);
      if (!r.ok) return fail(res, r.message);
      // 统一存字符串（键值表设计）
      valid.push([key, String(r.value)]);
    }

    // upsert：存在则更新，不存在则插入
    for (const [key, value] of valid) {
      await query(
        'INSERT INTO settings (`key`, `value`) VALUES (?,?) ON DUPLICATE KEY UPDATE `value` = VALUES(`value`)',
        [key, value]
      );
    }

    // 返回合并后的最新全量设置，前端直接用
    return success(res, await readSettings(), '保存成功');
  } catch (err) {
    next(err);
  }
}

/** 恢复默认设置 */
async function reset(req, res, next) {
  try {
    // 直接清空表：读取时缺失的键会自动回落到 DEFAULTS
    await query('DELETE FROM settings');
    return success(res, await readSettings(), '已恢复默认设置');
  } catch (err) {
    next(err);
  }
}

// 导出三个接口
module.exports = { getAll, save, reset };
