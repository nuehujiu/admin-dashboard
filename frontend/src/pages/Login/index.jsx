import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Button, Form, Input, Checkbox, App } from 'antd';
import { ShopOutlined, UserOutlined ,SafetyCertificateOutlined } from '@ant-design/icons';
import s from './index.module.scss';
import { useUserStore } from '../../store/useUserStore';
import { login as loginApi, getProfile } from '../../api/auth';

/**
 * 登录页面组件
 * 提供用户登录功能，包括记住账号、表单验证等功能
 */
export default function Login() {
  // 定义用于记住用户名的本地存储键名
  const SAVED_NAME = 'houtai-remember-username';

  // 从本地存储中获取保存的用户名，如果没有则为空字符串
  const savedName = localStorage.getItem(SAVED_NAME) || '';
  const location = useLocation();
  // 登录加载状态
  const [loading, setLoading] = useState(false);
  // 获取全局消息提示组件
  const { message } = App.useApp();
  // 获取导航功能
  const navigate = useNavigate();
  // 获取用户令牌
  const token = useUserStore((s) => s.token);
  // 设置认证状态
  const setAuth = useUserStore((s) => s.setAuth);
  // 设置用户资料
  const setProfile = useUserStore((s) => s.setProfile);
  // 登录后落到根路径，由路由的 DefaultPage 按角色权限决定实际页面
  const target = location.state?.from || '/';
  useEffect(() => {
    if (token) navigate(target, { replace: true });
  }, [token, target, navigate]);

  /**
   * 表单提交处理函数
   * @param {Object} values - 表单值，包含用户名、密码和记住账号选项
   */
  const onFinish = async ({ username, password, remember }) => {
    setLoading(true);
    try {
      // 去除用户名前后空格
      const name = username.trim();

      // 调用登录API
      const { token: t, user } = await loginApi({ username: name, password });
      // 设置认证状态
      setAuth({ token: t, user });

      // 获取用户资料
      const profile = await getProfile();
      // 设置用户资料、菜单和权限
      setProfile({
        user: profile,
        menus: profile.menus || [],
        permissions: profile.permissions || [],
      });
      // 根据记住账号选项设置或移除本地存储
      if (remember) localStorage.setItem(SAVED_NAME, name);
      else localStorage.removeItem(SAVED_NAME);

      // 显示成功消息
      message.success(`欢迎回来!${profile.nickname || profile.username}`);
      // 导航到目标页面
      navigate(target, { replace: true });
    } catch (e) {
      console.error('[login] 失败:', e);
      message.error(
        e?.response?.data?.message ||
          e?.message ||
          '登录失败，请确认 mock 服务已启动',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={s.page}>
      {/*左侧品牌区*/}
      <aside className={s.brand}>
        <div className={s.brandTop}>
          <div className={s.logoMark}>
            <ShopOutlined />
          </div>
          <div>
            <div className={s.logoName}>houtai</div>
            <div className={s.logoSub}>商城后台管理系统</div>
          </div>
        </div>

        <div className={s.brandMain}>
          <div className={s.eyebrow}>
            <span className={s.eyebrowLine} />
            MERCHANT OPERATIONS CENTER
          </div>
          <h1 className={s.title}>
            把商城的每一笔生意，
            <br />
            <em>都看得清清楚楚。</em>
          </h1>
          <p className={s.desc}>
            商品、用户、订单与经营数据集中在同一个工作台，权限分级清晰，
            日常运营只需三步：查看、处理、复盘。
          </p>
          <div className={s.stats}>
            <div>
              <strong>7</strong>
              <span>业务模块</span>
            </div>
            <div>
              <strong>30</strong>
              <span>后端接口</span>
            </div>
            <div>
              <strong>13</strong>
              <span>菜单权限</span>
            </div>
          </div>
        </div>

        <div className={s.brandFoot}>
          © 2026 houtai | 内部系统，仅限授权账号访问
        </div>
      </aside>
      {/*右侧登录区*/}
      <main className={s.formArea}>
        <div className={s.topLinks}>
          <button
            type="button"
            onClick={() => message.info('演示环境，请联系系统管理员')}
          >
            帮助中心
          </button>
          <button
            type="button"
            onClick={() => message.info('演示环境，请联系系统管理员')}
          >
            联系管理员
          </button>
        </div>

        <div className={s.card}>
          <h2 className={s.welcome}>欢迎回来</h2>
          <p className={s.welcomeSub}>使用后台账号登录，继续今天的运营工作</p>

          <Form
            layout="vertical"
            size="large"
            requiredMark={false}
            initialValues={{
              username: savedName,
              remember: Boolean(savedName),
            }}
            onFinish={onFinish}
            className={s.form}
          >
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input
                prefix={<UserOutlined className={s.inputIcon} />}
                placeholder="admin"
                autoComplete="username"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={
                <div className={s.pwdLabel}>
                  <span>密码</span>
                  <button
                    type="button"
                    onClick={() =>
                      message.info('演示环境，请联系管理员重置密码')
                    }
                  >
                    忘记密码？
                  </button>
                </div>
              }
              rules={[{ required: true, message: '请输入密码' }]}
            >
              <Input.Password
                placeholder="请输入登录密码"
                autoComplete="current-password"
              />
            </Form.Item>

            <div className={s.rememberRow}>
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>记住账号</Checkbox>
              </Form.Item>
              <span className={s.envTag}>当前环境：内网</span>
            </div>

            <Button
              type="primary"
              htmlType="submit"
              block
              loading={loading}
              className={s.submit}
            >
              登录
            </Button>
          </Form>

          <div className={s.divider}>
            <span>演示环境</span>
          </div>

          <div className={s.demoTip}>
            <SafetyCertificateOutlined className={s.tipIcon} />
            <span>
              账号 <b>admin</b> · 密码 <b>123456</b>
            </span>
            <span className={s.demoRight}>运营账号 operator</span>
          </div>

          <p className={s.agree}>
            登录即表示同意《内部系统使用规范》与《数据安全承诺》
          </p>
        </div>
      </main>
    </div>
  );
}
