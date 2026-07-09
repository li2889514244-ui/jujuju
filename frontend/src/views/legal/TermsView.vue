<template>
  <div class="legal-page">
    <div class="legal-page__container">
      <h1>服务条款</h1>
      <p class="legal-page__updated">最后更新日期：2026年7月9日</p>

      <h2>1. 服务概述</h2>
      <p>
        MatrixFlow（以下简称"本平台"），由披星云团队运营，域名
        ddddkiii.com。本平台提供多平台短视频矩阵账号管理、数据采集与分析、电商运营等工具服务。
      </p>

      <h2>2. 用户注册与账号</h2>
      <p>
        2.1 用户应使用真实邮箱注册账号，并妥善保管账号密码。因账号密码泄露造成的损失由用户自行承担。
      </p>
      <p>2.2 用户不得将账号转让、出借给第三方使用。如发现账号被他人使用，应立即通知平台。</p>
      <p>2.3 平台有权对违规账号进行暂停或终止服务的处理。</p>

      <h2>3. 用户行为规范</h2>
      <p>用户在使用本平台服务时，不得：</p>
      <ul>
        <li>利用本平台从事违反法律法规的活动；</li>
        <li>未经授权采集、存储他人个人信息；</li>
        <li>对本平台进行反向工程、破解或干扰正常运营；</li>
        <li>利用技术手段恶意攻击本平台系统或第三方平台；</li>
        <li>发布、传播违法违规内容。</li>
      </ul>

      <h2>4. 知识产权</h2>
      <p>4.1 本平台的软件代码、界面设计、商标、标识等知识产权归披星云团队所有，受相关法律保护。</p>
      <p>
        4.2
        用户上传的内容（包括但不限于视频、图片、文案）的知识产权归原作者所有，平台仅在用户授权范围内使用。
      </p>

      <h2>5. 免责声明</h2>
      <p>
        5.1
        本平台提供的工具仅用于合法的内容管理和数据分析，不对第三方平台（抖音、小红书、快手等）的政策变更负责。
      </p>
      <p>5.2 因不可抗力（自然灾害、网络故障、政策变更等）导致服务中断，平台不承担责任。</p>
      <p>5.3 用户使用本平台采集的数据仅供参考，平台不对数据的准确性和完整性做保证。</p>

      <h2>6. 服务变更与终止</h2>
      <p>6.1 平台有权根据运营需要调整服务内容、功能或定价，调整前会提前通知用户。</p>
      <p>6.2 用户可随时停止使用本平台服务。平台亦有权在用户违反本条款时终止服务。</p>

      <h2>7. 联系方式</h2>
      <p>如对本服务条款有任何疑问，请通过平台内反馈功能联系我们。</p>

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
