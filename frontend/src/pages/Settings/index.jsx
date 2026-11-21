import { useEffect, useState } from 'react';
import { App, Button, Form, Input, Switch } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import s from './index.module.scss';
import { getSettings, saveSettings, resetSettings } from '../../api/settings';
import { PERM, usePermission } from '../../utils/permissions';
import { applyCssVars } from '../../utils/theme';
import { useUserStore } from '../../store/useUserStore';

/** 设计稿给的 4 个品牌色 */
const THEME_COLORS = [
  { value: '#F5611D', name: '暖橙' },
  { value: '#2F8F86', name: '青绿' },
  { value: '#C77A28', name: '琥珀' },
  { value: '#5D5751', name: '石墨' },
];

/** label 里带一个等宽小灰字的字段名 */
const fieldLabel = (text) => (
  <span className={s.labelRow}>
    <span className={s.label}>{text}</span>
  </span>
);

export default function Settings() {
  const [form] = Form.useForm();
  const { message, modal } = App.useApp();
  const setSettings = useUserStore((st) => st.setSettings);
  // 无 settings:update 时只能查看，保存与恢复默认按钮禁用
  const { can } = usePermission();
  const canUpdate = can([PERM.SETTINGS_UPDATE, PERM.SETTINGS_VIEW]);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  // 已保存到服务端的值：用于改色二次确认
  const [saved, setSaved] = useState({ themeColor: '#F5611D' });

  // 色块的选中态需要读表单值
  const themeColor = Form.useWatch('themeColor', form) || '#F5611D';

  useEffect(() => {
    let alive = true;
    getSettings()
      .then((data) => {
        if (!alive) return;
        form.setFieldsValue(data);
        setSaved(data);
      })
      .catch((e) => message.error(e?.message || '读取设置失败'));
    return () => {
      alive = false;
    };
  }, [form, message]);

  /** 改主题色要二次确认 */
  const confirmTheme = (next) =>
    new Promise((resolve) => {
      modal.confirm({
        title: '确认切换主题色？',
        content: `主色将从 ${saved.themeColor} 改为 ${next}，全站主按钮、菜单选中态与品牌区都会一起变化。`,
        okText: '确认切换',
        cancelText: '再想想',
        onOk: () => resolve(true),
        onCancel: () => resolve(false),
      });
    });

  const onSubmit = async () => {
    let values;
    try {
      values = await form.validateFields();
    } catch {
      return;
    }
    if (values.themeColor !== saved.themeColor) {
      const ok = await confirmTheme(values.themeColor);
      if (!ok) return;
    }
    setSaving(true);
    try {
      const data = await saveSettings(values);
      setSaved(data);
      form.setFieldsValue(data);
      applyCssVars(data.themeColor);
      setSettings(data); // 触发 main.jsx 重算主题，即时生效
      message.success('已保存，对全部成员立即生效');
    } catch (e) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => {
    modal.confirm({
      title: '恢复默认设置？',
      content: '系统名称、标语、公告、主题色与侧栏折叠都会回到初始值。',
      okText: '恢复默认',
      okButtonProps: { danger: true },
      cancelText: '取消',
      onOk: async () => {
        setResetting(true);
        try {
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
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>系统设置</h1>
          <p className={s.meta}>5 项可配置字段 · 保存后对全部成员立即生效</p>
        </div>
        <div className={s.actions}>
          <Button
            icon={<ReloadOutlined />}
            loading={resetting}
            disabled={!canUpdate}
            title={canUpdate ? undefined : '当前账号无修改权限'}
            onClick={onReset}
          >
            恢复默认
          </Button>
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

      <Form
        form={form}
        layout="vertical"
        requiredMark={false}
        disabled={!canUpdate}
        className={s.grid}
      >
        {/* ---------- 基础信息 ---------- */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>基础信息</h2>

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

          <Form.Item
            name="slogan"
            label={fieldLabel('标语', 'slogan')}
            rules={[{ max: 50, message: '标语不能超过 50 个字' }]}
          >
            <Input maxLength={50} placeholder="留空则只显示系统名称" />
          </Form.Item>

          <Form.Item
            name="notice"
            label={fieldLabel('公告', 'notice')}
            rules={[{ max: 200, message: '公告不能超过 200 个字' }]}
          >
            <Input.TextArea rows={3} maxLength={200} placeholder="留空则不展示公告条" />
          </Form.Item>
        </div>

        {/* ---------- 外观与布局 ---------- */}
        <div className={s.card}>
          <h2 className={s.cardTitle}>外观与布局</h2>

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
                  title={`${c.name} ${c.value}`}
                  aria-label={c.name}
                  className={`${s.swatch} ${themeColor === c.value ? s.swatchActive : ''}`}
                  style={{ background: c.value }}
                  onClick={() => form.setFieldValue('themeColor', c.value)}
                />
              ))}
            </div>
          </div>

          <div className={s.row}>
            <div className={s.labelRow}>
              <span className={s.label}>侧栏默认折叠</span>
              {/* <span className={s.key}>siderCollapsed</span> */}
            </div>
            <Form.Item
              name="siderCollapsed"
              noStyle
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
