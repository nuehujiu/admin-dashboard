// 引入副作用与状态钩子
import { useEffect, useState } from 'react';
// 引入 antd：App（message + modal）、按钮、表单、输入框、开关
import { App, Button, Form, Input, Switch } from 'antd';
// 引入重置图标
import { ReloadOutlined } from '@ant-design/icons';
// 引入页面样式
import s from './index.module.scss';
// 引入设置接口：读取、保存、恢复默认
import { getSettings, saveSettings, resetSettings } from '../../api/settings';
// 引入权限点与判断 Hook
import { PERM, usePermission } from '../../utils/permissions';
// 引入 CSS 变量同步（改主题色后要让 SCSS 变量也跟上）
import { applyCssVars } from '../../utils/theme';
// 引入用户仓库（保存后写回 settings，触发主题重算）
import { useUserStore } from '../../store/useUserStore';

/** 设计稿给的 4 个品牌色（点击色块即选色） */
const THEME_COLORS = [
  { value: '#F5611D', name: '暖橙' },
  { value: '#2F8F86', name: '青绿' },
  { value: '#C77A28', name: '琥珀' },
  { value: '#5D5751', name: '石墨' },
];

/**
 * 字段标签渲染：把中文展示名包一层统一结构（便于以后加字段名提示）
 * @param {string} text - 展示文案
 */
const fieldLabel = (text) => (
  <span className={s.labelRow}>
    <span className={s.label}>{text}</span>
  </span>
);

/**
 * 系统设置页
 * 字段：系统名称、标语、公告、主题色、侧栏默认折叠
 * 权限：无 settings:update 时表单整体禁用，仅可查看
 */
export default function Settings() {
  // 表单实例
  const [form] = Form.useForm();
  // 取 message（提示）与 modal（二次确认）两个实例
  const { message, modal } = App.useApp();
  // 写回全局设置（保存成功后立即生效，无需刷新）
  const setSettings = useUserStore((st) => st.setSettings);
  // 权限判断
  const { can } = usePermission();
  // 有修改权限：需求语义为「任一满足」，因此同时传入 update 与 view
  const canUpdate = can([PERM.SETTINGS_UPDATE, PERM.SETTINGS_VIEW]);
  // 保存进行中
  const [saving, setSaving] = useState(false);
  // 恢复默认进行中
  const [resetting, setResetting] = useState(false);
  // 服务端已保存的值：改主题色时用于对比与二次确认
  const [saved, setSaved] = useState({ themeColor: '#F5611D' });

  // 当前表单里的主题色（色块选中态需要响应式读取）
  const themeColor = Form.useWatch('themeColor', form) || '#F5611D';

  // 进入页面时拉取一次设置并回填
  useEffect(() => {
    // 卸载标记
    let alive = true;
    getSettings()
      .then((data) => {
        if (!alive) return;
        // 回填表单
        form.setFieldsValue(data);
        // 记录「已保存值」基准
        setSaved(data);
      })
      // 读取失败提示，但不阻塞页面（表单保持空值）
      .catch((e) => message.error(e?.message || '读取设置失败'));
    // 清理
    return () => {
      alive = false;
    };
  }, [form, message]);

  /**
   * 主题色变更二次确认（全站视觉变化较大，避免误点）
   * @param {string} next - 目标色值
   * @returns {Promise<boolean>} 用户是否确认
   */
  const confirmTheme = (next) =>
    new Promise((resolve) => {
      modal.confirm({
        title: '确认切换主题色？',
        // 明确说明影响范围，让用户预期到全局变化
        content: `主色将从 ${saved.themeColor} 改为 ${next}，全站主按钮、菜单选中态与品牌区都会一起变化。`,
        okText: '确认切换',
        cancelText: '再想想',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  /** 保存设置 */
  const onSubmit = async () => {
    // 先做表单校验，失败则直接返回（字段已高亮）
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    // 主题色有变化时先弹二次确认，取消则中止保存
    if (values.themeColor !== saved.themeColor) {
      const ok = await confirmTheme(values.themeColor);
      if (!ok) return;
    }
    setSaving(true);
    try {
      // 提交到后端
      const data = await saveSettings(values);
      // 更新基准值（下次比较用新值）
      setSaved(data);
      // 用后端返回的完整设置回填表单（包含未被前端提交的字段）
      form.setFieldsValue(data);
      // 同步 CSS 变量（SCSS 侧的 var(--primary) 等立即变化）
      applyCssVars(data.themeColor);
      // 写回全局仓库，AppRoot 会据此重算 antd 主题
      setSettings(data);
      message.success('已保存，对全部成员立即生效');
    } catch (e) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /** 恢复默认设置（破坏性操作，需二次确认） */
  const onReset = () => {
    modal.confirm({
      title: '恢复默认设置？',
      // 说明会被重置的字段范围
      content: '系统名称、标语、公告、主题色与侧栏折叠都会回到初始值。',
      okText: '恢复默认',
      // 确认按钮标红，提示是破坏性操作
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setResetting(true);
        try {
          // 调后端重置接口，返回默认值
          const data = await resetSettings();
          setSaved(data);
          form.setFieldsValue(data);
          applyCssVars(data.themeColor);
          setSettings(data);
          message.success('已恢复默认设置');
        } catch (e) {
          message.error(e?.message || '恢复失败');
        } finally {
          setResetting(false);
        }
      },
    });
  };

  return (
    <div className={s.page}>
      {/* 页头：标题 + 右上操作 */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>系统设置</h1>
          <p className={s.meta}>5 项可配置字段 · 保存后对全部成员立即生效</p>
        </div>
        <div className={s.actions}>
          {/* 恢复默认：无权限时禁用并给出 title 提示 */}
          <Button
            icon={<ReloadOutlined />}
            loading={resetting}
            disabled={!canUpdate}
            title={canUpdate ? undefined : '当前账号无修改权限'}
            onClick={onReset}
          >
            恢复默认
          </Button>
          {/* 保存：同上 */}
          <Button
            type="primary"
            loading={saving}
            disabled={!canUpdate}
            title={canUpdate ? undefined : '当前账号无修改权限'}
            onClick={onSubmit}
          >
            保存设置
          </Button>
        </div>
      </div>

      {/* 表单：整体 disabled 由权限控制，避免无权限用户逐项点击 */}
      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canUpdate}
        // 两栏网格布局（样式里定义）
        className={s.grid}
      >
        {/* ---------- 基础信息卡片 ---------- */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>基础信息</h2>

          {/* 系统名称：必填，最长 30 字 */}
          <Form.Item
            name="systemName"
            label={fieldLabel('系统名称', 'systemName')}
            rules={[
              { required: true, message: '请输入系统名称' },
              { max: 30, message: '系统名称不能超过 30 个字' },
            ]}
          >
            <Input maxLength={30} placeholder="显示在登录页品牌区与侧栏" />
          </Form.Item>

          {/* 标语：选填，最长 50 字 */}
          <Form.Item
            name="slogan"
            label={fieldLabel('标语', 'slogan')}
            rules={[{ max: 50, message: '标语不能超过 50 个字' }]}
          >
            <Input maxLength={50} placeholder="留空则只显示系统名称" />
          </Form.Item>

          {/* 公告：选填，多行，最长 200 字 */}
          <Form.Item
            name="notice"
            label={fieldLabel('公告', 'notice')}
            rules={[{ max: 200, message: '公告不能超过 200 个字' }]}
          >
            <Input.TextArea rows={3} maxLength={200} placeholder="留空则不展示公告条" />
          </Form.Item>
        </div>

        {/* ---------- 外观与布局卡片 ---------- */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>外观与布局</h2>

          {/* 主题色：用色块选择，不做输入框 */}
          <div className={s.field}>
            <div className={s.labelRow}>
              <span className={s.label}>主题色</span>
              {/* <span className={s.key}>themeColor</span> */}
            </div>
            <div className={s.swatches}>
              {THEME_COLORS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  // title 展示颜色名与色值，便于识别
                  title={`${c.name} ${c.value}`}
                  aria-label={c.name}
                  // 当前选中色追加激活类名（显示选中环）
                  className={`${s.swatch} ${themeColor === c.value ? s.swatchActive : ''}`}
                  style={{ background: c.value }}
                  // 直接写表单字段值，由 Form 统一托管
                  onClick={() => form.setFieldValue('themeColor', c.value)}
                />
              ))}
            </div>
          </div>

          {/* 侧栏默认折叠：开关 */}
          <div className={s.row}>
            <div className={s.labelRow}>
              <span className={s.label}>侧栏默认折叠</span>
              {/* <span className={s.key}>siderCollapsed</span> */}
            </div>
            <Form.Item
              name="siderCollapsed"
              noStyle
              // 后端存 0/1，开关需要 boolean：这里做双向转换
              getValueProps={(v) => ({ checked: Number(v) === 1 })}
              getValueFromEvent={(checked) => (checked ? 1 : 0)}
            >
              <Switch />
            </Form.Item>
          </div>

          {/* 主题色只靠色块选择，这里挂一个隐藏字段让 Form 托管它 */}
          <Form.Item name="themeColor" hidden>
            <Input />
          </Form.Item>
        </div>
      </Form>
    </div>
  );
}
