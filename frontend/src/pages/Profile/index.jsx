import { useEffect, useState } from 'react';
import { App, Avatar, Button, Form, Input, Tooltip } from 'antd';
import { LockOutlined, MobileOutlined, MailOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import s from './index.module.scss';
import { getProfile, updateProfile, updatePassword } from '../../api/auth';
import { useUserStore } from '../../store/useUserStore';

const PHONE_RE = /^1[3-9]\d{9}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 原图上限 2MB（压缩后只有十几 KB） */
const MAX_FILE = 2 * 1024 * 1024;

/** 选图 → 居中裁方 → 缩到 128px jpeg，返回 dataURL */
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      const img = new window.Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        const SIZE = 128;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        const min = Math.min(img.width, img.height);
        ctx.drawImage(
          img,
          (img.width - min) / 2, (img.height - min) / 2, min, min,
          0, 0, SIZE, SIZE,
        );
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

/** 密码强度 0~4，用于四段条 */
function scorePassword(pwd) {
  if (!pwd) return 0;
  let score = 0;
  if (pwd.length >= 6) score += 1;
  if (pwd.length >= 10) score += 1;
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  if (/\d/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) score += 1;
  return Math.min(score, 4);
}
const STRENGTH_TEXT = ['', '弱', '一般', '较强', '强'];

/** 只读字段（账号信息区） */
function Readonly({ value }) {
  return <Input value={value ?? '—'} disabled />;
}

export default function Profile() {
  const [profileForm] = Form.useForm();
  const [pwdForm] = Form.useForm();
  const { message } = App.useApp();
  const navigate = useNavigate();

  const setProfile = useUserStore((st) => st.setProfile);
  const logout = useUserStore((st) => st.logout);

  const [profile, setLocal] = useState(null);
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [pwdLoading, setPwdLoading] = useState(false);

  const newPwd = Form.useWatch('newPassword', pwdForm);
  const level = scorePassword(newPwd);

  /** 把接口返回的整份资料写回表单和全局状态 */
  const applyProfile = (data) => {
    setLocal(data);
    setAvatar(data.avatar || '');
    profileForm.setFieldsValue({
      nickname: data.nickname || '',
      phone: data.phone || '',
      email: data.email || '',
      intro: data.intro || '',
    });
    setProfile({
      user: data,
      menus: data.menus || [],
      permissions: data.permissions || [],
    });
  };

  useEffect(() => {
    let alive = true;
    getProfile()
      .then((data) => {
        if (!alive) return;
        applyProfile(data);
      })
      .catch((e) => message.error(e?.message || '读取资料失败'));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileForm, message, setProfile]);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // 允许重复选同一张图
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      message.error('只支持 JPG / PNG 格式');
      return;
    }
    if (file.size > MAX_FILE) {
      message.error('图片不能超过 2MB');
      return;
    }
    try {
      setAvatar(await fileToAvatar(file));
    } catch (err) {
      message.error(err?.message || '图片处理失败');
    }
  };

  const onSaveProfile = async () => {
    let values;
    try {
      values = await profileForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      const res = await updateProfile({ ...values, avatar });
      applyProfile(res);
      message.success('资料已保存');
    } catch (e) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const onCancel = () => {
    if (!profile) return;
    setAvatar(profile.avatar || '');
    profileForm.setFieldsValue({
      nickname: profile.nickname || '',
      phone: profile.phone || '',
      email: profile.email || '',
      intro: profile.intro || '',
    });
  };

  const onSubmitPwd = async () => {
    let values;
    try {
      values = await pwdForm.validateFields();
    } catch {
      return;
    }
    setPwdLoading(true);
    try {
      await updatePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码已修改，请重新登录');
      logout();
      navigate('/login');
    } catch (e) {
      message.error(e?.message || '修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  const isActive = profile?.status === 1;
  const ua = navigator.userAgent;
  const deviceOs = ua.includes('Windows') ? 'Windows'
    : ua.includes('Mac') ? 'macOS'
      : ua.includes('Android') ? 'Android'
        : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : '未知系统';
  const deviceBrowser = ua.includes('Edg') ? 'Edge'
    : ua.includes('Chrome') ? 'Chrome'
      : ua.includes('Firefox') ? 'Firefox' : 'Safari';

  return (
    <div className={s.page}>
      {/* ---------- 页头 ---------- */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>个人中心</h1>
          <p className={s.meta}>维护个人资料与账号安全设置</p>
        </div>
        <span className={`${s.statusPill} ${isActive ? '' : s.statusOff}`}>
          <i className={s.dot} />
          {isActive ? '账号状态正常' : '账号已禁用'}
        </span>
      </div>

      <div className={s.grid}>
        {/* ---------- 左列 ---------- */}
        <div className={s.col}>
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>基本资料</h2>
              <span className={s.cardHint}>修改后需保存生效</span>
            </div>

            <div className={s.avatarRow}>
              <Avatar size={64} src={avatar || undefined} className={s.avatar}>
                {(profile?.nickname || profile?.username || '?').slice(0, 1)}
              </Avatar>
              <div>
                <div className={s.avatarName}>
                  {profile?.nickname || '—'}
                  <span className={s.roleTag}>{profile?.role_name || '—'}</span>
                </div>
                <div className={s.avatarSub}>
                  登录名 {profile?.username || '—'} · 用户 ID {profile?.id ?? '—'}
                </div>
                <div className={s.avatarActions}>
                  <Tooltip title="图片会压缩到 128px 再保存">
                    <label className={s.uploadBtn}>
                      换头像
                      <input type="file" accept="image/png,image/jpeg" hidden onChange={onPick} />
                    </label>
                  </Tooltip>
                  {avatar ? (
                    <button type="button" className={s.textBtn} onClick={() => setAvatar('')}>
                      移除
                    </button>
                  ) : null}
                  <span className={s.avatarTip}>支持 JPG / PNG，≤ 2MB</span>
                </div>
              </div>
            </div>

            <Form form={profileForm} layout="vertical" className={s.formGrid}>
              <Form.Item
                name="nickname"
                label="昵称"
                rules={[
                  { required: true, message: '请输入昵称' },
                  { max: 50, message: '昵称不能超过 50 个字' },
                ]}
              >
                <Input maxLength={50} placeholder="显示在顶栏与成员列表" />
              </Form.Item>

              <Form.Item
                name="phone"
                label="手机号"
                rules={[
                  {
                    validator: (_, v) =>
                      !v || PHONE_RE.test(v)
                        ? Promise.resolve()
                        : Promise.reject(new Error('请输入 11 位手机号')),
                  },
                ]}
              >
                <Input maxLength={11} prefix={<MobileOutlined />} placeholder="选填" />
              </Form.Item>

              <Form.Item
                name="email"
                label="邮箱"
                rules={[
                  {
                    validator: (_, v) =>
                      !v || EMAIL_RE.test(v)
                        ? Promise.resolve()
                        : Promise.reject(new Error('邮箱格式不正确')),
                  },
                ]}
              >
                <Input maxLength={100} prefix={<MailOutlined />} placeholder="选填" />
              </Form.Item>

              <Form.Item label="所属角色">
                <Input value={profile?.role_name || '—'} disabled />
              </Form.Item>

              <Form.Item name="intro" label="个人简介" className={s.span2}>
                <Input.TextArea rows={3} maxLength={200} placeholder="一句话介绍你的职责范围" />
              </Form.Item>
            </Form>

            <div className={s.footer}>
              <Button type="primary" loading={saving} onClick={onSaveProfile}>
                保存修改
              </Button>
              <Button onClick={onCancel} disabled={saving}>
                取消
              </Button>
              <div className={s.grow} />
              {profile?.updated_at ? (
                <span className={s.savedAt}>上一次保存：{profile.updated_at}</span>
              ) : null}
            </div>
          </section>

          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>账号信息</h2>
              <span className={s.cardHint}>由系统统一管理，如需变更请联系管理员</span>
            </div>
            <div className={s.formGrid}>
              <div className={s.field}>
                <span className={s.label}>登录名</span>
                <Readonly value={profile?.username} />
              </div>
              <div className={s.field}>
                <span className={s.label}>用户 ID</span>
                <Readonly value={profile?.id} />
              </div>
              <div className={s.field}>
                <span className={s.label}>创建时间</span>
                <Readonly value={profile?.created_at} />
              </div>
              <div className={s.field}>
                <span className={s.label}>最近登录</span>
                <Readonly value={profile?.last_login_at} />
              </div>
            </div>
          </section>
        </div>

        {/* ---------- 右列 ---------- */}
        <div className={s.col}>
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>修改密码</h2>
              <span className={s.cardHint}>建议 90 天更换一次</span>
            </div>

            <Form form={pwdForm} layout="vertical">
              <Form.Item
                name="oldPassword"
                label="当前密码"
                rules={[{ required: true, message: '请输入当前密码' }]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="请输入当前密码"
                  autoComplete="current-password"
                />
              </Form.Item>

              <Form.Item
                name="newPassword"
                label="新密码"
                rules={[
                  { required: true, message: '请输入新密码' },
                  { min: 6, message: '新密码至少 6 位' },
                  { max: 32, message: '新密码不能超过 32 位' },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="6-32 位"
                  autoComplete="new-password"
                />
              </Form.Item>

              {newPwd ? (
                <div className={s.strength}>
                  {[1, 2, 3, 4].map((i) => (
                    <i key={i} className={`${s.strengthBar} ${i <= level ? s.on : ''}`} />
                  ))}
                  <span className={s.strengthTxt}>强度：{STRENGTH_TEXT[level]}</span>
                </div>
              ) : null}

              <Form.Item
                name="confirmPassword"
                label="确认新密码"
                dependencies={['newPassword']}
                rules={[
                  { required: true, message: '请再次输入新密码' },
                  {
                    validator: (_, v) =>
                      !v || v === pwdForm.getFieldValue('newPassword')
                        ? Promise.resolve()
                        : Promise.reject(new Error('两次输入的新密码不一致')),
                  },
                ]}
              >
                <Input.Password
                  prefix={<LockOutlined />}
                  placeholder="再次输入新密码"
                  autoComplete="new-password"
                />
              </Form.Item>

              <div className={s.footer}>
                <Button type="primary" loading={pwdLoading} onClick={onSubmitPwd}>
                  确认修改
                </Button>
                <Button onClick={() => pwdForm.resetFields()}>重置</Button>
              </div>

              <p className={s.note}>
                密码规则：至少 6 位，建议包含大小写字母、数字与符号；修改成功后需重新登录。
              </p>
            </Form>
          </section>

          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>登录设备</h2>
              <Tooltip title="JWT 无状态，强制下线需要服务端 session 支持">
                <Button size="small" type="text" disabled>
                  全部下线
                </Button>
              </Tooltip>
            </div>

            <div className={s.deviceRow}>
              <div className={s.deviceIcon}>PC</div>
              <div>
                <div className={s.deviceName}>
                  {deviceOs} · {deviceBrowser}
                  <span className={s.deviceTag}>当前</span>
                </div>
                <div className={s.deviceSub}>
                  本次会话 · 最近登录 {profile?.last_login_at || '—'}
                </div>
              </div>
            </div>

            <div className={s.safetyBar}>
              <span>双因素认证未开启，开启后异地登录需二次验证</span>
              <Tooltip title="需接入 TOTP 或短信验证，暂未实现">
                <Button size="small" disabled>
                  去开启
                </Button>
              </Tooltip>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
