<template>
  <div class="legal-page">
    <div class="legal-page__container">
      <h1>隐私政策</h1>
      <p class="legal-page__updated">最后更新日期：2026年7月9日</p>

      <h2>1. 信息收集</h2>
      <p>我们在您使用 MatrixFlow 平台时，可能收集以下信息：</p>
      <ul>
        <li><strong>注册信息</strong>：邮箱地址、用户名、手机号（可选）；</li>
        <li>
          <strong>平台账号信息</strong
          >：您绑定的第三方平台（抖音、小红书等）的账号名称、粉丝数等公开数据；
        </li>
        <li><strong>操作日志</strong>：您在平台上的操作记录，用于服务改进和安全审计；</li>
        <li><strong>技术信息</strong>：浏览器类型、IP 地址、设备信息，用于安全防护。</li>
      </ul>

      <h2>2. 信息使用</h2>
      <p>我们收集的信息仅用于以下目的：</p>
      <ul>
        <li>提供矩阵账号管理、数据采集与分析服务；</li>
        <li>保障账号安全，防止未授权访问；</li>
        <li>改进产品功能和用户体验；</li>
        <li>遵守法律法规的要求。</li>
      </ul>
      <p>我们绝不会将您的信息出售给第三方。</p>

      <h2>3. 信息存储与保护</h2>
      <p>3.1 您的数据存储在平台服务器上，采用加密传输（HTTPS）和加密存储（AES-256）保护。</p>
      <p>3.2 用户密码使用 bcrypt 算法加盐哈希存储，平台无法获取明文密码。</p>
      <p>
        3.3 桌面伴侣（本地软件）采集的数据优先存储在您本地设备的 SQLite
        数据库中，仅在同步时上传到服务器。
      </p>
      <p>3.4 我们采取合理的技术和管理措施保护您的信息安全，但无法保证 100% 不被泄露。</p>

      <h2>4. 信息共享</h2>
      <p>除以下情形外，我们不会与第三方共享您的信息：</p>
      <ul>
        <li>获得您的明确同意；</li>
        <li>根据法律法规或政府部门的强制性要求；</li>
        <li>为维护平台的合法权益（如应对侵权投诉）。</li>
      </ul>

      <h2>5. Cookie 与本地存储</h2>
      <p>
        本平台使用浏览器本地存储（localStorage /
        sessionStorage）保存登录令牌和用户偏好设置。这些数据仅存储在您的设备上，不会发送到第三方。
      </p>

      <h2>6. 用户权利</h2>
      <p>您有权：</p>
      <ul>
        <li>访问和修改您的个人信息；</li>
        <li>删除您的账号和相关数据；</li>
        <li>导出您的数据；</li>
        <li>撤回授权（将导致部分功能不可用）。</li>
      </ul>

      <h2>7. 未成年人保护</h2>
      <p>
        本平台不面向 16
        岁以下未成年人。如发现未成年人未经监护人同意使用本平台，我们将采取措施删除相关信息。
      </p>

      <h2>8. 政策变更</h2>
      <p>本隐私政策可能不时更新。重大变更时，我们将通过平台通知或邮件方式告知您。</p>

      <h2>9. 联系方式</h2>
      <p>如对本隐私政策有任何疑问，请通过平台内反馈功能联系我们。</p>

      <p class="legal-page__back">
        <router-link to="/login">← 返回登录</router-link>
      </p>
    </div>
  </div>
</template>

<script setup lang="ts"></script>

<style lang="scss" scoped>
.legal-page {
  min-height: 100vh;
  background-color: $bg-deep;
  padding: 48px 24px;

  &__container {
    max-width: 720px;
    margin: 0 auto;
    background: $bg-base;
    border: 1px solid $border-base;
    border-radius: $radius-lg;
    padding: 48px;

    h1 {
      font-size: 28px;
      font-weight: 700;
      color: $text-primary;
      margin: 0 0 8px;
    }

    h2 {
      font-size: 18px;
      font-weight: 600;
      color: $text-primary;
      margin: 32px 0 12px;
    }

    p {
      font-size: 14px;
      line-height: 1.7;
      color: $text-secondary;
      margin: 0 0 12px;
    }

    ul {
      padding-left: 20px;
      margin: 0 0 16px;

      li {
        font-size: 14px;
        line-height: 1.7;
        color: $text-secondary;
        margin-bottom: 6px;

        strong {
          color: $text-primary;
          font-weight: 600;
        }
      }
    }
  }

  &__updated {
    font-size: 13px !important;
    color: $text-tertiary !important;
    margin-bottom: 24px !important;
  }

  &__back {
    margin-top: 32px !important;
    text-align: center;

    a {
      font-size: 14px;
      color: $accent-400;
      text-decoration: none;
      transition: color 0.2s $ease-out;

      &:hover {
        color: $accent-300;
      }
    }
  }

  @media (max-width: 640px) {
    padding: 24px 12px;

    &__container {
      padding: 24px;
    }
  }
}
</style>
