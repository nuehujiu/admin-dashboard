// 引入副作用与状态钩子
import { useEffect, useState } from 'react';
// 引入 antd：App、头像、按钮、表单、输入框、气泡提示
import { App, Avatar, Button, Form, Input, Tooltip } from 'antd';
// 引入图标：锁（密码）、手机、邮箱
import { LockOutlined, MobileOutlined, MailOutlined } from '@ant-design/icons';
// 引入路由跳转（改密成功后回登录页）
import { useNavigate } from 'react-router-dom';
// 引入页面样式
import s from './index.module.scss';
// 引入资料 / 改密 / 头像上传接口
import { getProfile, updateProfile, updatePassword, uploadAvatar } from '../../api/auth';
// 引入用户仓库（同步全局用户信息与登出）
import { useUserStore } from '../../store/useUserStore';

// 手机号正则：11 位、1 开头、第二位 3-9
const PHONE_RE = /^1[3-9]\d{9}$/;
// 邮箱正则：非空字符 + @ + 域名 + 点 + 后缀
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
/** 原图上限 2MB（压缩到 128px 后只有十几 KB） */
const MAX_FILE = 2 * 1024 * 1024;

/**
 * 把用户选的图片处理成方形头像
 * 流程：FileReader 读文件 → Image 解码 → canvas 居中裁正方形 → 缩到 128px → 输出 JPEG dataURL
 * @param {File} file - 用户选择的图片文件
 * @returns {Promise<string>} 压缩后的 dataURL
 */
function fileToAvatar(file) {
  return new Promise((resolve, reject) => {
    // 读文件为 base64 dataURL
    const reader = new FileReader();
    // 读取失败
    reader.onerror = () => reject(new Error('图片读取失败'));
    reader.onload = () => {
      // 用 Image 解码，才能拿到宽高并绘制到 canvas
      const img = new window.Image();
      img.onerror = () => reject(new Error('图片解析失败'));
      img.onload = () => {
        // 目标尺寸：128px 足够头像显示，也能显著减小体积
        const SIZE = 128;
        const canvas = document.createElement('canvas');
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext('2d');
        // 取短边作为裁剪边长，保证裁出正方形
        const min = Math.min(img.width, img.height);
        // 从中心开始裁剪，避免裁到边缘主体
        ctx.drawImage(
          img,
          (img.width - min) / 2, (img.height - min) / 2, min, min,
          0, 0, SIZE, SIZE,
        );
        // 0.82 质量系数：体积与清晰度的折中
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      // 触发解码
      img.src = reader.result;
    };
    // 开始读取
    reader.readAsDataURL(file);
  });
}

/**
 * 评估密码强度（0~4，对应四段条）
 * 评分维度：长度 ≥6、长度 ≥10、大小写混合、数字与符号混合
 * @param {string} pwd - 待评估的密码
 * @returns {number} 0~4
 */
function scorePassword(pwd) {
  // 空密码为 0 级
  if (!pwd) return 0;
  let score = 0;
  // 达到基本长度
  if (pwd.length >= 6) score += 1;
  // 达到较长长度
  if (pwd.length >= 10) score += 1;
  // 同时含小写与大写
  if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1;
  // 同时含数字与符号
  if (/\d/.test(pwd) && /[^a-zA-Z0-9]/.test(pwd)) score += 1;
  // 上限 4
  return Math.min(score, 4);
}
// 强度文案（索引即等级，0 级不展示）
const STRENGTH_TEXT = ['', '弱', '一般', '较强', '强'];

/**
 * 只读字段：用禁用输入框展示，保持与可编辑字段一致的视觉
 * @param {*} value - 展示值，空值统一显示破折号
 */
function Readonly({ value }) {
  return <Input value={value ?? '—'} disabled />;
}

/**
 * 个人中心页
 * 左列：基本资料（昵称/手机/邮箱/简介 + 头像上传）、账号信息（只读）
 * 右列：修改密码（含强度提示）、登录设备（当前环境识别，其余为占位能力）
 */
export default function Profile() {
  // 两个独立表单实例：资料表单、密码表单
  const [profileForm] = Form.useForm();
  const [pwdForm] = Form.useForm();
  // 带主题的提示
  const { message } = App.useApp();
  // 路由跳转
  const navigate = useNavigate();

  // 同步全局用户资料（头像/昵称改动要立即反映到顶栏）
  const setProfile = useUserStore((st) => st.setProfile);
  // 登出（改密成功后调用）
  const logout = useUserStore((st) => st.logout);

  // 服务端资料快照（用于「取消」回滚）
  const [profile, setLocal] = useState(null);
  // 当前头像（可能是新选但未保存的）
  const [avatar, setAvatar] = useState('');
  // 头像上传中
  const [avatarLoading, setAvatarLoading] = useState(false);
  // 资料保存中
  const [saving, setSaving] = useState(false);
  // 改密提交中
  const [pwdLoading, setPwdLoading] = useState(false);

  // 实时监听新密码输入，用于强度条
  const newPwd = Form.useWatch('newPassword', pwdForm);
  // 计算强度等级
  const level = scorePassword(newPwd);

  /**
   * 把接口返回的整份资料写回本地状态、表单与全局仓库
   * @param {object} data - 用户资料（含 menus / permissions）
   */
  const applyProfile = (data) => {
    // 保存快照（取消时用它回滚）
    setLocal(data);
    // 同步头像
    setAvatar(data.avatar || '');
    // 回填可编辑字段，空值用空串避免显示 null
    profileForm.setFieldsValue({
      nickname: data.nickname || '',
      phone: data.phone || '',
      email: data.email || '',
      intro: data.intro || '',
    });
    // 同步全局用户 / 菜单 / 权限
    setProfile({
      user: data,
      menus: data.menus || [],
      permissions: data.permissions || [],
    });
  };

  // 进入页面时拉取一次资料
  useEffect(() => {
    let alive = true;
    getProfile()
      .then((data) => {
        if (!alive) return;
        applyProfile(data);
      })
      .catch((e) => message.error(e?.message || '读取资料失败'));
    // 清理：作废旧请求
    return () => {
      alive = false;
    };
    // applyProfile 是组件内闭包，依赖已在下方登记，这里关闭穷尽性检查
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profileForm, message, setProfile]);

  /**
   * 选择头像 → 压缩 → 上传落盘
   * 说明：头像走独立接口，上传成功即生效（不必等「保存修改」）
   */
  const onPick = async (e) => {
    // 取第一个文件
    const file = e.target.files?.[0];
    e.target.value = ''; // 清空 input，允许重复选同一张图
    if (!file) return;
    // 类型白名单：只接受 png / jpeg
    if (!/^image\/(png|jpeg)$/.test(file.type)) {
      message.error('只支持 JPG / PNG 格式');
      return;
    }
    // 体积上限
    if (file.size > MAX_FILE) {
      message.error('图片不能超过 2MB');
      return;
    }
    setAvatarLoading(true);
    try {
      // 压缩成 128px 方形 dataURL
      const dataUrl = await fileToAvatar(file);
      // 上传到服务端落盘，返回可访问路径
      const res = await uploadAvatar(dataUrl);
      // 兜底：若后端未返回路径则用本地 dataURL 展示
      const next = res?.avatar || dataUrl;
      setAvatar(next);
      // 头像是独立上传接口，顺手同步全局用户，顶栏立即更新
      const { user, menus, permissions } = useUserStore.getState();
      setProfile({ user: { ...(user || {}), avatar: next }, menus, permissions });
      message.success('头像已更新');
    } catch (err) {
      message.error(err?.message || '头像上传失败');
    } finally {
      setAvatarLoading(false);
    }
  };

  /** 保存基本资料（把当前头像一并提交） */
  const onSaveProfile = async () => {
    // 先校验表单
    let values;
    try {
      values = await profileForm.validateFields();
    } catch {
      return;
    }
    setSaving(true);
    try {
      // 提交并拿回最新资料
      const res = await updateProfile({ ...values, avatar });
      // 统一回写（含全局状态）
      applyProfile(res);
      message.success('资料已保存');
    } catch (e) {
      message.error(e?.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  /** 取消编辑：把头像与字段回滚到最后一次服务端快照 */
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

  /** 提交改密：成功后强制重新登录（旧 token 仍有效但习惯上要求重登） */
  const onSubmitPwd = async () => {
    // 校验密码表单
    let values;
    try {
      values = await pwdForm.validateFields();
    } catch {
      return;
    }
    setPwdLoading(true);
    try {
      // 提交旧密码与新密码，后端校验旧密码正确性
      await updatePassword({
        oldPassword: values.oldPassword,
        newPassword: values.newPassword,
      });
      message.success('密码已修改，请重新登录');
      // 清空登录态
      logout();
      // 回登录页
      navigate('/login');
    } catch (e) {
      message.error(e?.message || '修改失败');
    } finally {
      setPwdLoading(false);
    }
  };

  // 账号是否启用（用于页头状态胶囊）
  const isActive = profile?.status === 1;
  // 识别当前设备系统：按 UA 关键字匹配，兜底「未知系统」
  const ua = navigator.userAgent;
  const deviceOs = ua.includes('Windows') ? 'Windows'
    : ua.includes('Mac') ? 'macOS'
      : ua.includes('Android') ? 'Android'
        : ua.includes('iPhone') || ua.includes('iPad') ? 'iOS' : '未知系统';
  // 识别浏览器：Edg 必须优先判断（Edge 的 UA 里也含 Chrome）
  const deviceBrowser = ua.includes('Edg') ? 'Edge'
    : ua.includes('Chrome') ? 'Chrome'
      : ua.includes('Firefox') ? 'Firefox' : 'Safari';

  return (
    <div className={s.page}>
      {/* ---------- 页头：标题 + 账号状态胶囊 ---------- */}
      <div className={s.hero}>
        <div>
          <h1 className={s.title}>个人中心</h1>
          <p className={s.meta}>维护个人资料与账号安全设置</p>
        </div>
        {/* 状态胶囊：禁用时追加 statusOff 类名（灰/红系） */}
        <span className={`${s.statusPill} ${isActive ? '' : s.statusOff}`}>
          <i className={s.dot} />
          {isActive ? '账号状态正常' : '账号已禁用'}
        </span>
      </div>

      {/* 两列布局：左列资料与账号信息，右列安全相关 */}
      <div className={s.grid}>
        {/* ---------- 左列 ---------- */}
        <div className={s.col}>
          {/* 基本资料卡 */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>基本资料</h2>
              <span className={s.cardHint}>修改后需保存生效</span>
            </div>

            {/* 头像区：头像 + 姓名/角色 + 上传操作 */}
            <div className={s.avatarRow}>
              <Avatar size={64} src={avatar || undefined} className={s.avatar}>
                {/* 无头像时取昵称/用户名首字作为文字头像 */}
                {(profile?.nickname || profile?.username || '?').slice(0, 1)}
              </Avatar>
              <div>
                <div className={s.avatarName}>
                  {profile?.nickname || '—'}
                  {/* 角色标签 */}
                  <span className={s.roleTag}>{profile?.role_name || '—'}</span>
                </div>
                <div className={s.avatarSub}>
                  登录名 {profile?.username || '—'} · 用户 ID {profile?.id ?? '—'}
                </div>
                <div className={s.avatarActions}>
                  {/* 用 label 包 hidden input 实现自定义上传按钮 */}
                  <Tooltip title="图片会压缩到 128px，上传后保存在服务器">
                    <label className={s.uploadBtn}>
                      {avatarLoading ? '上传中…' : '换头像'}
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        hidden
                        disabled={avatarLoading}
                        onChange={onPick}
                      />
                    </label>
                  </Tooltip>
                  {/* 已有头像时提供移除入口（只是清空本地 avatar，保存后才落库） */}
                  {avatar ? (
                    <button
                      type="button"
                      className={s.textBtn}
                      disabled={avatarLoading}
                      onClick={() => setAvatar('')}
                    >
                      移除
                    </button>
                  ) : null}
                  <span className={s.avatarTip}>支持 JPG / PNG，≤ 2MB</span>
                </div>
              </div>
            </div>

            {/* 资料表单：两列网格 */}
            <Form form={profileForm} layout="vertical" className={s.formGrid}>
              {/* 昵称：必填，最长 50 */}
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

              {/* 手机号：选填，填了才校验格式 */}
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

              {/* 邮箱：选填，填了才校验格式 */}
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

              {/* 所属角色：由管理员分配，只读展示 */}
              <Form.Item label="所属角色">
                <Input value={profile?.role_name || '—'} disabled />
              </Form.Item>

              {/* 个人简介：跨两列（span2 类名控制） */}
              <Form.Item name="intro" label="个人简介" className={s.span2}>
                <Input.TextArea rows={3} maxLength={200} placeholder="一句话介绍你的职责范围" />
              </Form.Item>
            </Form>

            {/* 底部操作：保存 / 取消 / 上次保存时间 */}
            <div className={s.footer}>
              <Button type="primary" loading={saving} onClick={onSaveProfile}>
                保存修改
              </Button>
              {/* 保存中禁用取消，避免状态错乱 */}
              <Button onClick={onCancel} disabled={saving}>
                取消
              </Button>
              {/* 弹性占位把时间推到右侧 */}
              <div className={s.grow} />
              {profile?.updated_at ? (
                <span className={s.savedAt}>上一次保存：{profile.updated_at}</span>
              ) : null}
            </div>
          </section>

          {/* 账号信息卡：全部只读，由系统统一管理 */}
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
          {/* 修改密码卡 */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>修改密码</h2>
              <span className={s.cardHint}>建议 90 天更换一次</span>
            </div>

            <Form form={pwdForm} layout="vertical">
              {/* 当前密码：必填 */}
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

              {/* 新密码：必填 + 长度区间 */}
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

              {/* 强度提示：只在有输入时展示 */}
              {newPwd ? (
                <div className={s.strength}>
                  {/* 四段条，点亮数等于强度等级 */}
                  {[1, 2, 3, 4].map((i) => (
                    <i key={i} className={`${s.strengthBar} ${i <= level ? s.on : ''}`} />
                  ))}
                  <span className={s.strengthTxt}>强度：{STRENGTH_TEXT[level]}</span>
                </div>
              ) : null}

              {/* 确认密码：依赖 newPassword 重新校验（新密码改了要重跑一致性检查） */}
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

              {/* 密码规则说明 */}
              <p className={s.note}>
                密码规则：至少 6 位，建议包含大小写字母、数字与符号；修改成功后需重新登录。
              </p>
            </Form>
          </section>

          {/* 登录设备卡：展示当前环境识别结果，其余为占位能力 */}
          <section className={s.card}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>登录设备</h2>
              {/* 当前 JWT 为无状态实现，无法服务端强制下线 */}
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
                  {/* 展示 UA 识别出的系统与浏览器 */}
                  {deviceOs} · {deviceBrowser}
                  <span className={s.deviceTag}>当前</span>
                </div>
                <div className={s.deviceSub}>
                  本次会话 · 最近登录 {profile?.last_login_at || '—'}
                </div>
              </div>
            </div>

            {/* 安全提示条：双因素认证尚未实现，按钮禁用 */}
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
