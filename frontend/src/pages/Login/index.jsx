// 引入状态与副作用钩子
import { useState, useEffect } from 'react';
// 引入路由跳转与当前路由信息（用于登录后回到来源页）
import { useNavigate, useLocation } from 'react-router-dom';
// 引入 antd 表单相关组件与 App（用于拿到带主题的 message）
import { Button, Form, Input, Checkbox, App } from 'antd';
// 引入品牌图标与账号图标
import { ShopOutlined, UserOutlined } from '@ant-design/icons';
// 引入页面样式模块
import s from './index.module.scss';
// 引入用户仓库（token、系统设置、写入鉴权与资料）
import { useUserStore } from '../../store/useUserStore';
// 引入登录接口与「取当前用户资料」接口
import { login as loginApi, getProfile } from '../../api/auth';

/**
 * 登录页
 * 流程：填表 → 调登录接口拿 token → 写入仓库 → 拉取资料/菜单/权限 → 跳转目标页
 * 附带能力：记住账号（仅存用户名到 localStorage）、已登录自动跳转
 */
export default function Login() {
  // 记住账号用的本地存储键名
  const SAVED_NAME = 'houtai-remember-username';

  // 初始化时读回上次记住的用户名；没有则为空串
  const savedName = localStorage.getItem(SAVED_NAME) || '';
  // 当前路由信息：登录成功后要回到「来源页」
  const location = useLocation();
  // 登录请求进行中标记，用于按钮 loading
  const [loading, setLoading] = useState(false);
  // 取带主题/语言的 message 实例
  const { message } = App.useApp();
  // 路由跳转函数
  const navigate = useNavigate();
  // 当前 token（用于判断是否已登录，已登录则直接跳走）
  const token = useUserStore((s) => s.token);
  // 品牌名：跟随系统设置（登录前 store 里是默认值）
  const systemName = useUserStore((s) => s.settings.systemName);
  // 品牌副标题 / slogan
  const slogan = useUserStore((s) => s.settings.slogan);
  // 写入鉴权信息（token + user）
  const setAuth = useUserStore((s) => s.setAuth);
  // 写入用户资料 + 菜单 + 权限
  const setProfile = useUserStore((s) => s.setProfile);
  // 登录后落到根路径，由路由的 DefaultPage 按角色权限决定实际页面；
  // 若从某个页面被踢回登录，则优先回到原页面
  const target = location.state?.from || '/';

  // 已登录（如刷新后仍有 sessionStorage 中的 token）时直接跳转，避免停在登录页
  useEffect(() => {
    if (token) navigate(target, { replace: true });
  }, [token, target, navigate]);

  /**
   * 表单提交处理
   * @param {{ username: string, password: string, remember: boolean }} values - 表单值
   */
  const onFinish = async ({ username, password, remember }) => {
    // 开始 loading，防止重复提交
    setLoading(true);
    try {
      // 用户名去首尾空格，避免复制粘贴带入空白导致校验失败
      const name = username.trim();

      // 调用登录接口：成功后返回 token 与用户基本信息
      const { token: t, user } = await loginApi({ username: name, password });
      // 先把 token 写进仓库，后续 getProfile 的请求拦截器才能带上鉴权头
      setAuth({ token: t, user });

      // 拉取完整资料（含菜单、权限），供侧栏与权限判断使用
      const profile = await getProfile();
      // 写入用户、菜单、权限（缺字段时兜底空数组）
      setProfile({
        user: profile,
        menus: profile.menus || [],
        permissions: profile.permissions || [],
      });
      // 记住账号：勾选则保存用户名，否则清除旧记录
      if (remember) localStorage.setItem(SAVED_NAME, name);
      else localStorage.removeItem(SAVED_NAME);

      // 欢迎提示：昵称优先，其次用户名
      message.success(`欢迎回来!${profile.nickname || profile.username}`);
      // 跳转目标页（replace 避免登录页留在历史栈里）
      navigate(target, { replace: true });
    } catch (e) {
      // 保留原始错误便于排查（常见是后端未启动或密码错误）
      console.error('[login] 失败:', e);
      // 错误文案优先级：后端返回 message → 前端 Error message → 兜底提示
      message.error(
        e?.response?.data?.message ||
          e?.message ||
          '登录失败，请确认后端服务已启动',
      );
    } finally {
      // 无论成败都结束 loading，保证按钮可再次点击
      setLoading(false);
    }
  };

  return (
    // 整页两栏：左侧品牌介绍，右侧登录表单
    <div className={s.page}>
      {/* ===== 左侧品牌区（纯展示，不含交互逻辑）===== */}
      <aside className={s.brand}>
        {/* 顶部：logo + 系统名 + slogan */}
        <div className={s.brandTop}>
          <div className={s.logoMark}>
            <ShopOutlined />
          </div>
          <div>
            {/* 系统名过长时 hover 显示完整名称 */}
            <div className={s.logoName} title={systemName}>{systemName}</div>
            {/* slogan 为空时用固定兜底文案 */}
            <div className={s.logoSub}>{slogan || '商城后台管理系统'}</div>
          </div>
        </div>

        {/* 中部：英文小标题 + 主标语 + 说明 + 三个数据点 */}
        <div className={s.brandMain}>
          <div className={s.eyebrow}>
            {/* 装饰性短线 */}
            <span className={s.eyebrowLine} />
            MERCHANT OPERATIONS CENTER
          </div>
          <h1 className={s.title}>
            把商城的每一笔生意，
            <br />
            {/* em 用于强调后半句，颜色由样式控制 */}
            <em>都看得清清楚楚。</em>
          </h1>
          <p className={s.desc}>
            商品、用户、订单与经营数据集中在同一个工作台，权限分级清晰，
            日常运营只需三步：查看、处理、复盘。
          </p>
          {/* 品牌区的三个「卖点」数字 */}
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

        {/* 底部版权声明 */}
        <div className={s.brandFoot}>
          © 2026 内部系统，仅限授权账号访问
        </div>
      </aside>

      {/* ===== 右侧登录区 ===== */}
      <main className={s.formArea}>
        {/* 右上角辅助入口：当前均为提示式占位，未跳转页面 */}
        <div className={s.topLinks}>
          <button
            type="button"
            onClick={() => message.info('请通过内部渠道联系系统管理员')}
          >
            帮助中心
          </button>
          <button
            type="button"
            onClick={() => message.info('请通过内部渠道联系系统管理员')}
          >
            联系管理员
          </button>
        </div>

        {/* 登录卡片 */}
        <div className={s.card}>
          <h2 className={s.welcome}>欢迎回来</h2>
          <p className={s.welcomeSub}>使用后台账号登录，继续今天的运营工作</p>

          {/* 垂直布局表单；requiredMark=false 隐藏必填星号（由规则控制） */}
          <Form
            layout="vertical"
            size="large"
            requiredMark={false}
            // 初始值：回填记住的用户名，并同步勾选状态
            initialValues={{
              username: savedName,
              remember: Boolean(savedName),
            }}
            onFinish={onFinish}
            className={s.form}
          >
            {/* 账号输入：必填校验 + 浏览器自动填充 */}
            <Form.Item
              name="username"
              label="账号"
              rules={[{ required: true, message: '请输入账号' }]}
            >
              <Input
                prefix={<UserOutlined className={s.inputIcon} />}
                placeholder="请输入账号"
                autoComplete="username"
              />
            </Form.Item>

            {/* 密码输入：label 内嵌「忘记密码」按钮 */}
            <Form.Item
              name="password"
              label={
                <div className={s.pwdLabel}>
                  <span>密码</span>
                  <button
                    type="button"
                    onClick={() =>
                      message.info('请联系系统管理员重置密码')
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

            {/* 记住账号 + 环境标识：左右分布 */}
            <div className={s.rememberRow}>
              {/* noStyle 让 Checkbox 与同行文本共享布局，不额外占一层 Form.Item 结构 */}
              <Form.Item name="remember" valuePropName="checked" noStyle>
                <Checkbox>记住账号</Checkbox>
              </Form.Item>
              <span className={s.envTag}>当前环境：内网</span>
            </div>

            {/* 提交按钮：loading 期间自动禁用，避免重复请求 */}
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

          {/* 底部合规提示（静态文案，无跳转） */}
          <p className={s.agree}>
            登录即表示同意《内部系统使用规范》与《数据安全承诺》
          </p>
        </div>
      </main>
    </div>
  );
}
