UI_HTML = r'''<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>披星云伴侣</title>
<script src="/static/vue.global.prod.js"></script>
<style>
:root{--pri:#2563eb;--pri-l:#eaf1ff;--pri-d:#1d4ed8;--ok:#12a46f;--ok-l:#eaf8f2;--warn:#d97706;--warn-l:#fff5df;--err:#dc2626;--err-l:#fff0f0;--bg:#eef3f8;--bg2:#f8fafc;--side:#111827;--side2:#1d2737;--side-tx:#d7deea;--side-mt:#8491a5;--card:rgba(255,255,255,.9);--brd:#dde5ef;--brd2:#eef2f7;--tx:#172033;--tx2:#5d6b7d;--tx3:#91a0b4;--radius:8px;--shadow:0 10px 30px rgba(15,23,42,.08),0 1px 2px rgba(15,23,42,.05);--shadow-lg:0 22px 60px rgba(15,23,42,.18)}
*{box-sizing:border-box;margin:0;padding:0}
html,body{height:100%}
body{background:radial-gradient(circle at 14% -10%,rgba(37,99,235,.12),transparent 32%),linear-gradient(140deg,#eef3f8 0%,#f8fafc 48%,#edf4f1 100%);color:var(--tx);font:14px/1.6 "Microsoft YaHei","Segoe UI",system-ui,Arial,sans-serif;-webkit-font-smoothing:antialiased;overflow:hidden}
#app{display:grid;grid-template-columns:236px 1fr;height:100vh}
[v-cloak]{display:none!important}

/* ── Sidebar ── */
aside{position:relative;background:linear-gradient(180deg,#111827 0%,#151d2b 55%,#101722 100%);display:flex;flex-direction:column;overflow:hidden;border-right:1px solid rgba(255,255,255,.08);box-shadow:18px 0 50px rgba(15,23,42,.16)}
aside::before{content:'';position:absolute;inset:0;background:linear-gradient(145deg,rgba(255,255,255,.08),transparent 36%);pointer-events:none}
.brand{position:relative;padding:22px 18px 18px;display:flex;align-items:center;gap:12px}
.brand-logo{width:36px;height:36px;border-radius:10px;background:linear-gradient(145deg,#3b82f6,#14b8a6);box-shadow:0 12px 24px rgba(20,184,166,.24),inset 0 1px 0 rgba(255,255,255,.35);display:flex;align-items:center;justify-content:center;font-weight:800;font-size:16px;color:#fff;flex-shrink:0}
.brand-name{font-size:15px;font-weight:750;color:#fff;line-height:1.3}
.brand-ver{font-size:11px;color:var(--side-mt)}
.nav{position:relative;flex:1;padding:8px 10px 14px;overflow-y:auto}
.nav-section{font-size:11px;color:var(--side-mt);text-transform:uppercase;letter-spacing:.5px;margin:18px 9px 7px;font-weight:700}
.nav-item{position:relative;display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:8px;color:var(--side-tx);cursor:pointer;transition:background .18s ease,color .18s ease,transform .18s ease,box-shadow .18s ease;font-size:13px;font-weight:600;user-select:none}
.nav-item:hover{background:rgba(255,255,255,.075);color:#fff;transform:translateX(2px)}
.nav-item.active{background:linear-gradient(135deg,#24436b,#1e5a5d);color:#fff;box-shadow:0 10px 22px rgba(15,23,42,.22),inset 0 1px 0 rgba(255,255,255,.12)}
.nav-item.active::before{content:'';position:absolute;left:-10px;top:9px;bottom:9px;width:3px;border-radius:3px;background:#79f2d5}
.nav-icon{width:20px;text-align:center;font-size:15px;flex-shrink:0;filter:saturate(.95)}
.nav-badge{margin-left:auto;background:#ef4444;color:#fff;font-size:10px;padding:1px 6px;border-radius:999px;font-weight:800;box-shadow:0 6px 16px rgba(239,68,68,.32)}
.side-footer{position:relative;margin:0 10px 12px;padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:10px;background:rgba(255,255,255,.045)}
.side-status{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--side-tx);font-weight:600}
.pulse{width:8px;height:8px;border-radius:50%;animation:pulse 1.9s ease-in-out infinite}
.pulse.ok{background:var(--ok)}.pulse.warn{background:var(--warn)}.pulse.err{background:var(--err)}.pulse.gray{background:var(--tx3)}
@keyframes pulse{0%,100%{opacity:1;box-shadow:0 0 0 0 currentColor}50%{opacity:.55;box-shadow:0 0 0 5px transparent}}
.side-cd{font-size:11px;color:var(--side-mt);margin-top:4px}

/* ── Main ── */
main{overflow-y:auto;padding:26px 30px 34px;scroll-behavior:smooth}
.page-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;gap:16px}
.page-head h1{font-size:22px;font-weight:760;letter-spacing:0;color:#111827}
.page-head .sub{font-size:13px;color:var(--tx2);margin-top:2px}

/* ── Cards ── */
.card{background:var(--card);border:1px solid rgba(221,229,239,.9);border-radius:var(--radius);box-shadow:var(--shadow);margin-bottom:16px;overflow:hidden;backdrop-filter:blur(10px);transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease}
.card:hover{transform:translateY(-1px);box-shadow:0 14px 36px rgba(15,23,42,.1),0 1px 2px rgba(15,23,42,.05);border-color:#cfdae7}
.card-h{padding:14px 18px;border-bottom:1px solid var(--brd2);display:flex;align-items:center;justify-content:space-between;background:linear-gradient(180deg,rgba(248,250,252,.9),rgba(255,255,255,.72))}
.card-h h2{font-size:15px;font-weight:720}
.card-b{padding:18px}

/* ── Grid ── */
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
@media(max-width:760px){.grid2,.grid3{grid-template-columns:1fr}}

/* ── Stat Cards ── */
.stat{display:flex;align-items:center;gap:14px}
.stat-ico{width:46px;height:46px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.65)}
.stat-ico.blue{background:var(--pri-l);color:var(--pri)}
.stat-ico.green{background:var(--ok-l);color:var(--ok)}
.stat-ico.amber{background:var(--warn-l);color:var(--warn)}
.stat-ico.red{background:var(--err-l);color:var(--err)}
.stat-val{font-size:24px;font-weight:780;line-height:1.2;letter-spacing:0}
.stat-lbl{font-size:12px;color:var(--tx2)}

/* ── Buttons ── */
button,.btn{border:none;border-radius:8px;padding:8px 16px;cursor:pointer;font:inherit;font-weight:680;font-size:13px;transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease,color .16s ease;display:inline-flex;align-items:center;gap:6px;min-height:34px}
button:hover,.btn:hover{transform:translateY(-1px)}
button:active,.btn:active{transform:translateY(0)}
.btn-pri{background:linear-gradient(135deg,#2563eb,#1d4ed8);color:#fff;box-shadow:0 8px 18px rgba(37,99,235,.22)}.btn-pri:hover{background:linear-gradient(135deg,#2f6ff1,#1d4ed8);box-shadow:0 12px 24px rgba(37,99,235,.28)}
.btn-ok{background:linear-gradient(135deg,#12a46f,#0f8c60);color:#fff;box-shadow:0 8px 18px rgba(18,164,111,.18)}
.btn-warn{background:linear-gradient(135deg,#f59e0b,#d97706);color:#fff;box-shadow:0 8px 18px rgba(217,119,6,.2)}
.btn-ghost{background:#fff;color:var(--tx2);border:1px solid var(--brd);box-shadow:0 1px 2px rgba(15,23,42,.04)}.btn-ghost:hover{background:#f8fafc;color:var(--tx);border-color:#cbd5e1}
.btn-err{background:#fff;color:var(--err);border:1px solid #fecaca}.btn-err:hover{background:var(--err-l);border-color:#fca5a5}
.btn-sm{padding:5px 12px;font-size:12px}
button:disabled,.btn:disabled{opacity:.55;cursor:not-allowed;transform:none;box-shadow:none}
.btn-row{display:flex;gap:8px;flex-wrap:wrap}
.acct-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.acct-toolbar .btn-sm{min-width:86px;justify-content:center}
.acct-toolbar .refresh-btn{min-width:54px}

/* ── Feedback ── */
.toast-wrap{position:fixed;right:28px;top:22px;z-index:300;max-width:min(420px,calc(100vw - 56px));pointer-events:none}
.toast{border:1px solid var(--brd);border-left-width:4px;border-radius:8px;background:#fff;box-shadow:var(--shadow-lg);padding:11px 14px;color:var(--tx);font-size:13px;font-weight:650;animation:toastIn .18s ease both}
.toast.info{border-left-color:var(--pri)}.toast.ok{border-left-color:var(--ok)}.toast.warn{border-left-color:var(--warn)}.toast.err{border-left-color:var(--err)}
.update-mask{position:fixed;inset:0;z-index:400;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(2px)}
.update-modal{width:min(480px,calc(100vw - 40px));background:#fff;border-radius:14px;box-shadow:0 24px 64px rgba(0,0,0,.35);overflow:hidden;animation:updrop .25s ease}
@keyframes updrop{from{transform:translateY(-18px);opacity:0}to{transform:none;opacity:1}}
.update-modal .um-head{background:linear-gradient(135deg,var(--pri),#4f46e5);color:#fff;padding:18px 22px;font-size:17px;font-weight:700;display:flex;align-items:center;gap:10px}
.update-modal .um-body{padding:20px 22px;font-size:13px;color:#334155;line-height:1.7;max-height:260px;overflow:auto;white-space:pre-wrap}
.update-modal .um-foot{display:flex;gap:10px;padding:14px 22px 20px;justify-content:flex-end}
.update-modal .um-foot .btn{margin:0}
.busy-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:16px;border:1px solid #fde68a;background:#fffbeb;color:#92400e;border-radius:8px;padding:10px 12px;font-size:13px;font-weight:650}
.busy-banner .muted{color:#b45309;font-size:12px;font-weight:500}
@keyframes toastIn{from{opacity:0;transform:translateY(-6px)}to{opacity:1;transform:none}}

/* ── Badges ── */
.badge{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:720;padding:3px 10px;border-radius:999px;white-space:nowrap;border:1px solid transparent}
.badge.ok{background:var(--ok-l);color:var(--ok)}.badge.warn{background:var(--warn-l);color:var(--warn)}.badge.err{background:var(--err-l);color:var(--err)}.badge.info{background:var(--pri-l);color:var(--pri)}.badge.gray{background:#f1f5f9;color:var(--tx3)}

/* ── Form ── */
.form-group{margin-bottom:14px}
.form-group label{display:block;font-size:13px;font-weight:600;margin-bottom:5px;color:var(--tx)}
.form-group input,.form-group select,.form-group textarea{width:100%;height:40px;border:1px solid var(--brd);border-radius:8px;padding:0 12px;font:inherit;background:#fff;transition:border .16s ease,box-shadow .16s ease,background .16s ease}
.form-group input:focus,.form-group select:focus,.form-group textarea:focus{outline:none;border-color:#93b4f8;box-shadow:0 0 0 4px rgba(37,99,235,.11);background:#fff}
.form-group .hint{font-size:12px;color:var(--tx3);margin-top:4px}
.form-row{display:flex;gap:12px}.form-row>*{flex:1}
.toggle{display:inline-flex;align-items:center;gap:8px;cursor:pointer;user-select:none}
.toggle input{display:none}
.toggle-slider{width:40px;height:22px;background:#cbd5e1;border-radius:20px;position:relative;transition:background .2s ease}
.toggle-slider::after{content:'';position:absolute;width:18px;height:18px;border-radius:50%;background:#fff;top:2px;left:2px;transition:transform .2s ease;box-shadow:0 2px 6px rgba(15,23,42,.2)}
.toggle input:checked+.toggle-slider{background:linear-gradient(135deg,#2563eb,#14b8a6)}
.toggle input:checked+.toggle-slider::after{transform:translateX(16px)}

/* ── Login ── */
.login-wrap{position:fixed;inset:0;z-index:20;display:flex;align-items:center;justify-content:center;height:100vh;background:radial-gradient(circle at 22% 12%,rgba(20,184,166,.24),transparent 30%),linear-gradient(135deg,#111827,#1e293b 58%,#0f172a)}
.login-card{background:rgba(255,255,255,.94);border:1px solid rgba(255,255,255,.7);border-radius:14px;box-shadow:var(--shadow-lg);padding:36px;width:368px;max-width:90vw;backdrop-filter:blur(14px);animation:cardIn .34s ease both}
.login-logo{width:58px;height:58px;border-radius:14px;background:linear-gradient(145deg,#2563eb,#14b8a6);box-shadow:0 16px 36px rgba(20,184,166,.28);display:flex;align-items:center;justify-content:center;font-size:26px;font-weight:800;color:#fff;margin:0 auto 16px}
.login-title{text-align:center;font-size:20px;font-weight:700;margin-bottom:4px}
.login-sub{text-align:center;font-size:13px;color:var(--tx2);margin-bottom:24px}
.login-err{background:var(--err-l);color:var(--err);font-size:13px;padding:8px 12px;border-radius:8px;margin-bottom:12px;display:none}
.login-err.show{display:block}
.login-divider{display:flex;align-items:center;gap:10px;margin:16px 0;color:var(--tx3);font-size:12px}
.login-divider::before,.login-divider::after{content:'';height:1px;background:var(--brd);flex:1}
.btn-feishu{width:100%;height:40px;justify-content:center;background:#fff;color:#0f766e;border:1px solid #99f6e4;box-shadow:0 8px 18px rgba(20,184,166,.12)}
.btn-feishu:hover{background:#f0fdfa;border-color:#5eead4}
.feishu-fallback{margin-top:10px;text-align:center}
.feishu-fallback button{border:0;background:transparent;color:#2563eb;font-size:12px;font-weight:600;cursor:pointer;padding:4px 6px}
.feishu-fallback button:hover{text-decoration:underline}
@keyframes cardIn{from{opacity:0;transform:translateY(10px) scale(.99)}to{opacity:1;transform:none}}

/* ── Progress ── */
.progress{height:7px;background:#e8edf5;border-radius:999px;overflow:hidden;margin-top:8px;box-shadow:inset 0 1px 2px rgba(15,23,42,.08)}
.progress-bar{height:100%;background:linear-gradient(90deg,#2563eb,#14b8a6);border-radius:999px;transition:width .34s ease}
.spinner{width:28px;height:28px;border:3px solid #e6e8f0;border-top-color:var(--pri);border-radius:50%;animation:spin .7s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}

/* ── Table/List ── */
.list-row{display:flex;align-items:center;gap:12px;padding:11px 0;border-bottom:1px solid #eef2f7;transition:background .16s ease,padding .16s ease}
.list-row:hover{background:rgba(37,99,235,.035);padding-left:6px;padding-right:6px}
.list-row:last-child{border-bottom:none}
.list-ico{width:38px;height:38px;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0;box-shadow:inset 0 1px 0 rgba(255,255,255,.6)}
.list-main{flex:1;min-width:0}
.list-title{font-weight:600;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.list-sub{font-size:12px;color:var(--tx3)}
.list-actions{display:flex;gap:6px;flex-shrink:0}

/* ── Platform Grid ── */
.plat-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;margin-bottom:16px}
.plat-card{border:1px solid var(--brd);border-radius:10px;padding:16px;cursor:pointer;transition:transform .18s ease,box-shadow .18s ease,border-color .18s ease,background .18s ease;display:flex;align-items:center;gap:12px;background:#fff}
.plat-card:hover{border-color:#9bb8f5;background:linear-gradient(180deg,#fff,#f7fbff);transform:translateY(-2px);box-shadow:0 12px 24px rgba(15,23,42,.08)}
.plat-card.active{border-color:#2563eb;background:linear-gradient(180deg,#f7fbff,#eef7ff);box-shadow:0 0 0 3px rgba(37,99,235,.1)}
.plat-ico{width:42px;height:42px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;box-shadow:0 8px 18px rgba(15,23,42,.12)}
.plat-name{font-weight:600;font-size:14px}
.plat-hint{font-size:12px;color:var(--tx3)}

/* ── Scan Bind Flow ── */
.scan-box{text-align:center;padding:32px 20px;min-height:210px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;animation:softIn .22s ease both}
.scan-box .ico{font-size:42px}
.scan-box .title{font-size:16px;font-weight:600}
.scan-box .desc{font-size:13px;color:var(--tx2);max-width:340px}
@keyframes softIn{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}

/* ── Log ── */
.log-list{max-height:400px;overflow-y:auto;font-family:"Cascadia Code","Consolas",monospace;font-size:12px;line-height:1.8}
.log-item{padding:2px 0;display:flex;gap:8px}
.log-time{color:var(--tx3);flex-shrink:0;width:140px}
.log-level{font-weight:700;flex-shrink:0;width:50px;text-transform:uppercase;font-size:11px}
.log-level.info{color:var(--pri)}.log-level.ok{color:var(--ok)}.log-level.warn{color:var(--warn)}.log-level.err{color:var(--err)}
.log-msg{color:var(--tx);word-break:break-all}

/* ── Doudian ── */
.doudian-row{display:flex;align-items:center;gap:12px;padding:12px;border:1px solid var(--brd);border-radius:8px;margin-bottom:8px;background:#fff;transition:transform .16s ease,box-shadow .16s ease,border-color .16s ease}
.doudian-row.has-error{border-color:#fed7aa;background:#fff7ed}
.doudian-row:hover{transform:translateY(-1px);box-shadow:0 10px 24px rgba(15,23,42,.08);border-color:#cbd5e1}
.doudian-row .store-name{font-weight:600;flex:1}
.doudian-row .store-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.doudian-row .store-id{font-size:11px;color:var(--tx3);font-family:monospace}
.doudian-row .store-error{margin-top:5px;font-size:12px;color:var(--warn);line-height:1.45;word-break:break-all}
.store-status{display:inline-flex;align-items:center;gap:5px;height:22px;padding:0 8px;border-radius:999px;font-size:12px;font-weight:700;border:1px solid transparent;white-space:nowrap}
.store-status::before{content:"";width:7px;height:7px;border-radius:999px;background:currentColor;box-shadow:0 0 0 3px rgba(148,163,184,.14)}
.store-status.online{color:#047857;background:#ecfdf5;border-color:#bbf7d0}
.store-status.expired,.store-status.error{color:#dc2626;background:#fef2f2;border-color:#fecaca}
.store-status.unknown{color:#b45309;background:#fffbeb;border-color:#fde68a}
.doudian-error-list{display:flex;flex-direction:column;gap:6px;text-align:right;max-width:72%}
.doudian-error-item{font-size:13px;color:var(--warn);line-height:1.45;word-break:break-all}
.doudian-error-item b{color:var(--tx);font-weight:600}

/* ── Empty ── */
.empty{text-align:center;padding:40px 20px;color:var(--tx3)}
.empty .ico{font-size:36px;margin-bottom:8px;opacity:.5}
.empty .txt{font-size:14px}

/* ── Scrollbar ── */
::-webkit-scrollbar{width:6px;height:6px}
::-webkit-scrollbar-track{background:transparent}
::-webkit-scrollbar-thumb{background:#cbd5e1;border-radius:999px}
::-webkit-scrollbar-thumb:hover{background:#94a3b8}

@media(prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}
}

/* ── Responsive ── */
@media(max-width:980px){
  #app{grid-template-columns:220px 1fr}
  main{padding:22px 20px 30px}
  .grid2,.grid3,.plat-grid{grid-template-columns:1fr}
  .page-head{align-items:flex-start}
  .card-b{padding:16px}
  .stat-lbl{white-space:normal}
}
@media(max-width:640px){
  #app{grid-template-columns:1fr}
  aside{display:none}
}
</style>
</head>
<body>
<div id="app" v-cloak>

  <!-- ═══════ Login Screen ═══════ -->
  <div v-if="!configured" class="login-wrap">
    <div class="login-card">
      <div class="login-logo">P</div>
      <div class="login-title">披星云伴侣</div>
      <div class="login-sub">登录披星云账号以开始使用</div>
      <div class="login-err" :class="{show:!!loginError}">{{loginError}}</div>
      <div class="form-group">
        <input v-model.trim="loginEmail" placeholder="邮箱 / 手机号" @keyup.enter="$refs.pwd.focus()">
      </div>
      <div class="form-group">
        <input ref="pwd" v-model="loginPass" type="password" placeholder="密码" @keyup.enter="doLogin">
      </div>
      <div style="margin-bottom:16px">
        <label class="toggle">
          <input type="checkbox" v-model="rememberPwd">
          <span class="toggle-slider"></span>
          <span style="font-size:13px;color:var(--tx2)">记住密码并自动登录</span>
        </label>
      </div>
      <button class="btn-pri" style="width:100%;height:40px;justify-content:center" @click="doLogin" :disabled="loginLoading">
        <span v-if="loginLoading" class="spinner" style="width:16px;height:16px;border-width:2px"></span>
        <span v-if="loginLoading">登录中…</span>
        <span v-else>登 录</span>
      </button>
      <div class="login-divider"><span>或</span></div>
      <button class="btn-feishu" @click="startFeishuLogin" :disabled="feishuLoading">
        <span v-if="feishuLoading" class="spinner" style="width:16px;height:16px;border-width:2px"></span>
        <span v-if="feishuLoading">等待授权…</span>
        <span v-else>飞书登录</span>
      </button>
      <div v-if="feishuLoading&&feishuLoginUrl" class="feishu-fallback">
        <button type="button" @click="openFeishuLoginUrl">浏览器没打开？点这里继续授权</button>
      </div>
      <div style="text-align:center;margin-top:16px;font-size:12px;color:var(--tx3)">
        首次使用？请先在 ddddkiii.com 注册账号
      </div>
    </div>
  </div>

  <!-- ═══════ Main Layout ═══════ -->
  <template v-else>
  <aside>
    <div class="brand">
      <div class="brand-logo">P</div>
      <div>
        <div class="brand-name">披星云伴侣</div>
        <div class="brand-ver">v{{appVersion}}</div>
      </div>
    </div>
    <div class="nav">
      <div class="nav-section">概览</div>
      <div class="nav-item" :class="{active:page==='dash'}" @click="page='dash'">
        <span class="nav-icon">📊</span> 仪表盘
      </div>
      <div class="nav-section">功能</div>
      <div class="nav-item" :class="{active:page==='bind'}" @click="page='bind'">
        <span class="nav-icon">🔗</span> 账号绑定
        <span class="nav-badge" v-if="expiredCount>0">{{expiredCount}}</span>
      </div>
      <div class="nav-item" :class="{active:page==='collect'}" @click="page='collect'">
        <span class="nav-icon">📡</span> 数据采集
      </div>
      <div class="nav-item" :class="{active:page==='doudian'}" @click="page='doudian'">
        <span class="nav-icon">🛒</span> 抖店管理
      </div>
      <div class="nav-item" :class="{active:page==='editor'}" @click="page='editor'">
        <span class="nav-icon">🎬</span> AI 剪辑
      </div>
      <div class="nav-section">系统</div>
      <div class="nav-item" :class="{active:page==='settings'}" @click="page='settings'">
        <span class="nav-icon">⚙️</span> 设置
      </div>
      <div class="nav-item" :class="{active:page==='about'}" @click="page='about'">
        <span class="nav-icon">ℹ️</span> 关于
      </div>
    </div>
    <div class="side-footer">
      <div class="side-status">
        <span class="pulse" :class="healthOk?'ok':'err'"></span>
        {{healthOk?'本地服务正常':'服务离线'}}
      </div>
      <div class="side-cd" v-if="dcProgress&&dcProgress.schedule">
        下次采集：{{countdownText}}
      </div>
      <div class="side-cd" v-else>定时采集未启动</div>
    </div>
  </aside>

  <main>
    <div class="toast-wrap" v-if="toast.show">
      <div class="toast" :class="toast.type">{{toast.message}}</div>
    </div>
    <!-- 更新强提醒弹窗：检测到新版本即弹出；点击更新后原地显示下载进度条 -->
    <div class="update-mask" v-if="updateReminder">
      <div class="update-modal">
        <div class="um-head">{{updating?('正在更新 v'+updateReminder.version):('🔔 发现披星云伴侣新版本 v'+updateReminder.version)}}</div>
        <div class="um-body" v-if="!updating">{{updateReminder.notes||'新版本已发布，建议尽快更新以获得修复与新功能。'}}
          当前版本：v{{appVersion}} · 安装包大小：{{fmtSize(updateReminder.size)}}</div>
        <div class="um-body" v-else>
          <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px">
            <span>{{updatePhaseText(updateStatus)}}</span>
            <span>{{updatePercent(updateStatus)}}%</span>
          </div>
          <div style="height:10px;border-radius:999px;background:#eef2ff;overflow:hidden;margin-top:10px">
            <div :style="{width:updatePercent(updateStatus)+'%',height:'100%',background:'linear-gradient(90deg,var(--pri),#4f46e5)'}"></div>
          </div>
          <div v-if="updateStatus&&updateStatus.total" style="margin-top:10px;font-size:12px;color:#667085">
            已下载 {{formatBytes(updateStatus.downloaded)}} / {{formatBytes(updateStatus.total)}}（8线程分片，支持暂停续传）
          </div>
          <div v-if="updateStatus&&updateStatus.phase==='error'" style="margin-top:10px;font-size:12px;color:var(--err)">{{updateStatus.error||'更新失败'}}</div>
          <div v-if="updateStatus&&updateStatus.phase==='restarting'" style="margin-top:10px;font-size:12px">本地伴侣正在重启，如果窗口关闭，稍等几秒再从桌面打开即可。</div>
        </div>
        <div class="um-foot" v-if="!updating">
          <button class="btn" @click="reminderSnooze">稍后提醒（30分钟）</button>
          <button class="btn-pri" @click="reminderApply">立即更新</button>
        </div>
        <div class="um-foot" v-else>
          <button class="btn-ghost btn-sm" v-if="updateStatus&&updateStatus.phase==='downloading'" @click="pauseUpdateDownload">⏸ 暂停下载</button>
          <button class="btn-pri btn-sm" v-if="updateStatus&&updateStatus.phase==='paused'" @click="resumeUpdateDownload">▶ 继续下载</button>
          <button class="btn" v-if="updateStatus&&updateStatus.phase==='error'" @click="updateReminder=null">关闭</button>
        </div>
      </div>
    </div>
    <div class="busy-banner" v-if="collecting">
      <div>{{collectionBusyText}}</div>
      <div class="muted">采集完成前，重复触发类按钮会被伴侣拦截</div>
    </div>
    <!-- ═══════ Dashboard ═══════ -->
    <template v-if="page==='dash'">
      <div class="page-head">
        <div>
          <h1>仪表盘</h1>
          <div class="sub">披星云伴侣运行状态一览</div>
        </div>
        <div class="btn-row">
          <button class="btn-warn btn-sm" @click="triggerCollect('full')">{{collecting?'采集中':'全量采集'}}</button>
        </div>
      </div>
      <div class="grid3" style="margin-bottom:16px">
        <div class="card"><div class="card-b">
          <div class="stat">
            <div class="stat-ico blue">🔗</div>
            <div>
              <div class="stat-val">{{localAccounts.length}}</div>
              <div class="stat-lbl">已绑定账号</div>
            </div>
          </div>
        </div></div>
        <div class="card"><div class="card-b">
          <div class="stat">
            <div class="stat-ico" :class="collecting?'amber':'green'">{{collecting?'⏳':'✓'}}</div>
            <div>
              <div class="stat-val">{{collecting?'采集中':'空闲'}}</div>
              <div class="stat-lbl">采集状态</div>
            </div>
          </div>
        </div></div>
        <div class="card"><div class="card-b">
          <div class="stat">
            <div class="stat-ico" :class="expiredCount>0?'red':'green'">{{expiredCount>0?'!':'✓'}}</div>
            <div>
              <div class="stat-val">{{expiredCount>0?expiredCount+'个':'正常'}}</div>
              <div class="stat-lbl">账号需重绑</div>
            </div>
          </div>
        </div></div>
      </div>
      <div class="grid2">
        <div class="card">
          <div class="card-h"><h2>采集进度</h2><span class="badge" :class="collecting?'warn':'gray'">{{collecting?'进行中':'空闲'}}</span></div>
          <div class="card-b">
            <div v-if="dcProgress&&dcProgress.running">
              <div style="display:flex;justify-content:space-between;margin-bottom:4px">
                <span style="font-weight:600">{{dcProgress.progress?.nickname||'采集中…'}}</span>
                <span class="muted" style="font-size:13px;color:var(--tx2)">{{dcProgress.progress?.current||0}} / {{dcProgress.progress?.total||0}}</span>
              </div>
              <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">{{dcProgress.progress?.phase||''}}</div>
              <div class="progress"><div class="progress-bar" :style="{width:progressPercent+'%'}"></div></div>
            </div>
            <div v-else class="empty"><div class="ico">📡</div><div class="txt">当前无采集任务</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-h"><h2>定时计划</h2></div>
          <div class="card-b">
            <div v-if="dcProgress&&dcProgress.schedule&&dcProgress.schedule.started">
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="font-size:13px;color:var(--tx2)">模式</span>
                <span class="badge info">{{scheduleMode}}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                <span style="font-size:13px;color:var(--tx2)">下次采集</span>
                <span style="font-weight:600">{{countdownText}}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="font-size:13px;color:var(--tx2)">最近成功</span>
                <span style="font-size:13px">{{lastSuccessText}}</span>
              </div>
            </div>
            <div v-else class="empty"><div class="ico">⏰</div><div class="txt">定时采集未启动</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>抖店同步</h2><span class="badge" :class="doudianSchedule?.running?'warn':'ok'">{{doudianStatusText}}</span></div>
        <div class="card-b">
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;color:var(--tx2)">店铺</span>
            <span style="font-weight:600">{{doudianStores.length}}</span>
          </div>
          <div style="display:flex;justify-content:space-between;margin-bottom:8px">
            <span style="font-size:13px;color:var(--tx2)">下次同步</span>
            <span style="font-weight:600">{{doudianCountdownText}}</span>
          </div>
          <div style="display:flex;justify-content:space-between">
            <span style="font-size:13px;color:var(--tx2)">最近同步</span>
            <span style="font-size:13px">{{doudianSchedule?.last_run||'暂无记录'}}</span>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>最近采集记录</h2></div>
        <div class="card-b" style="padding-top:6px">
          <div v-if="recentRuns.length">
            <div class="list-row" v-for="run in recentRuns" :key="run.id||run.finished_at">
              <div class="list-ico" :class="runStatusClass(run)" :style="{background:runStatusClass(run)==='green'?'var(--ok-l)':(runStatusClass(run)==='warn'?'#fff7ed':'var(--err-l)')}">
                {{runStatusClass(run)==='green'?'✓':(runStatusClass(run)==='warn'?'!':'×')}}
              </div>
              <div class="list-main">
                <div class="list-title">{{runAccountText(run)}} · {{runVideoText(run)}}</div>
                <div class="list-sub">{{run.finished_at||run.started_at||''}} · {{displayRunMode(run)}}</div>
              </div>
              <span class="badge" :class="runStatusClass(run)==='green'?'ok':(runStatusClass(run)==='warn'?'warn':'err')">{{runStatusText(run)}}</span>
            </div>
          </div>
          <div v-else class="empty"><div class="ico">📋</div><div class="txt">暂无采集记录</div></div>
        </div>
      </div>
    </template>

    <!-- ═══════ Account Binding ═══════ -->
    <template v-if="page==='bind'">
      <div class="page-head">
        <div><h1>账号绑定</h1><div class="sub">通过扫码登录绑定各平台账号</div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>选择平台</h2></div>
        <div class="card-b">
          <div class="plat-grid">
            <div v-for="p in platforms" :key="p.id" class="plat-card" :class="{active:selected===p.id}" @click="selectPlatform(p.id)">
              <div class="plat-ico" :style="{background:p.bg,color:'#fff'}">{{p.icon}}</div>
              <div><div class="plat-name">{{p.name}}</div><div class="plat-hint">点击开始扫码绑定</div></div>
            </div>
          </div>
        </div>
      </div>
      <div class="card" v-if="selected">
        <div class="card-h"><h2>{{selectedPlatform?.name}} 扫码绑定</h2></div>
        <div class="card-b">
          <div class="scan-box" v-if="status==='idle'">
            <div class="ico">📷</div>
            <div class="title">准备扫码绑定</div>
            <div class="desc">点击下方按钮，会打开{{selectedPlatform?.name}}登录页面。请使用手机扫码完成登录，登录成功后点击"我已完成登录"。</div>
            <button class="btn-pri" @click="startSelectedScan">开始扫码绑定</button>
          </div>
          <div class="scan-box" v-if="status==='loading'">
            <div class="spinner"></div>
            <div class="desc">正在打开浏览器…</div>
          </div>
          <div class="scan-box" v-if="status==='browser'">
            <div class="ico" style="color:var(--ok)">✓</div>
            <div class="title">浏览器已打开</div>
            <div class="desc">请在弹出的窗口中完成{{selectedPlatform?.name}}扫码登录</div>
            <div class="btn-row">
              <button class="btn-pri" @click="confirmLogin">我已完成登录，提取 Cookie</button>
              <button class="btn-ghost" @click="cancelScan">取消</button>
            </div>
          </div>
          <div class="scan-box" v-if="status==='uploading'">
            <div class="spinner"></div>
            <div class="desc">正在绑定账号、完成初始采集并同步到网站…</div>
          </div>
          <div class="scan-box" v-if="status==='done'">
            <div class="ico" style="color:var(--ok);font-size:48px">✓</div>
            <div class="title">绑定和初始采集完成</div>
            <button class="btn-ghost" @click="reset">继续绑定其他账号</button>
          </div>
          <div class="scan-box" v-if="status==='error'">
            <div class="ico" style="color:var(--err)">✕</div>
            <div class="title" style="color:var(--err)">{{errorMsg}}</div>
            <button class="btn-pri" @click="reset">重试</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>已绑定账号（{{localAccounts.length}}）</h2>
          <div class="acct-toolbar">
            <button class="btn-pri btn-sm" @click="triggerCollect('quick','WECHAT_VIDEO')" :disabled="collecting">视频号采集</button>
            <button class="btn-pri btn-sm" @click="triggerCollect('quick','DOUYIN')" :disabled="collecting">抖音采集</button>
            <button class="btn-ghost btn-sm refresh-btn" @click="loadLocalAccounts(true)" :disabled="loadingAccounts">
              <span>刷新</span>
            </button>
          </div>
        </div>
        <div class="card-b" style="padding-top:6px">
          <div v-if="groupedLocalAccounts.length">
            <template v-for="g in groupedLocalAccounts" :key="g.key">
              <div style="font-size:12px;font-weight:600;color:var(--tx3);text-transform:uppercase;letter-spacing:.5px;margin:12px 0 4px">{{g.name}}（{{g.items.length}}）</div>
              <div class="list-row" v-for="a in g.items" :key="a.id">
                <div class="list-ico" :style="{background:g.bg||'var(--pri-l)'}">{{g.icon||'🔗'}}</div>
                <div class="list-main">
                  <div class="list-title">{{a.nickname||a.platform_uid||a.id}}</div>
                  <div class="list-sub">最近采集：{{a.last_collected_at||'未采集'}}</div>
                </div>
                <span class="badge" :class="accountBadgeClass(a)">{{accountStatusText(a)}}</span>
                <div class="list-actions">
                  <button class="btn-ghost btn-sm" @click="rebindAccount(a.id)" v-if="a.needs_rescan">重新绑定</button>
                  <button class="btn-err btn-sm" @click="removeLocalAccount(a.id)">删除</button>
                </div>
              </div>
            </template>
          </div>
          <div v-else class="empty"><div class="ico">🔗</div><div class="txt">暂无绑定账号，请选择上方平台开始绑定</div></div>
        </div>
      </div>
    </template>

    <!-- ═══════ Data Collection ═══════ -->
    <template v-if="page==='collect'">
      <div class="page-head">
        <div><h1>数据采集</h1><div class="sub">管理定时采集任务和手动触发</div></div>
        <div class="btn-row">
          <button class="btn-pri btn-sm" @click="triggerCollect('quick','WECHAT_VIDEO')" :disabled="collecting">视频号采集</button>
          <button class="btn-pri btn-sm" @click="triggerCollect('quick','DOUYIN')" :disabled="collecting">抖音采集</button>
          <button class="btn-warn btn-sm" @click="triggerCollect('full')">{{collecting?'采集中':'全量采集'}}</button>
        </div>
      </div>
      <div class="grid2">
        <div class="card">
          <div class="card-h"><h2>当前进度</h2><span class="badge" :class="collecting?'warn':'gray'">{{collecting?'采集中':'空闲'}}</span></div>
          <div class="card-b">
            <div v-if="dcProgress&&dcProgress.running">
              <div style="font-weight:600;margin-bottom:4px">{{dcProgress.progress?.nickname||'采集中…'}}</div>
              <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">{{dcProgress.progress?.phase||''}}</div>
              <div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:4px">
                <span>{{dcProgress.progress?.current||0}} / {{dcProgress.progress?.total||0}}</span>
                <span>{{progressPercent}}%</span>
              </div>
              <div class="progress"><div class="progress-bar" :style="{width:progressPercent+'%'}"></div></div>
            </div>
            <div v-else class="empty"><div class="ico">📡</div><div class="txt">当前无采集任务</div></div>
          </div>
        </div>
        <div class="card">
          <div class="card-h"><h2>定时计划</h2></div>
          <div class="card-b">
            <div v-if="dcProgress&&dcProgress.schedule">
              <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                <span style="font-size:13px;color:var(--tx2)">状态</span>
                <span class="badge" :class="dcProgress.schedule.started?'ok':'gray'">{{dcProgress.schedule.started?'已启动':'未启动'}}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                <span style="font-size:13px;color:var(--tx2)">采集模式</span>
                <span class="badge info">{{scheduleMode}}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                <span style="font-size:13px;color:var(--tx2)">下次采集</span>
                <span style="font-weight:600">{{countdownText}}</span>
              </div>
              <div style="display:flex;justify-content:space-between;margin-bottom:10px">
                <span style="font-size:13px;color:var(--tx2)">预计时间</span>
                <span style="font-size:13px">{{dcProgress.schedule.next_run_at||'—'}}</span>
              </div>
              <div style="display:flex;justify-content:space-between">
                <span style="font-size:13px;color:var(--tx2)">最近成功</span>
                <span style="font-size:13px">{{lastSuccessText}}</span>
              </div>
            </div>
            <div v-else class="empty"><div class="ico">⏰</div><div class="txt">定时采集未启动</div></div>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>采集记录</h2></div>
        <div class="card-b" style="padding-top:6px">
          <div v-if="recentRuns.length">
            <div class="list-row" v-for="run in recentRuns" :key="run.id||run.finished_at">
              <div class="list-ico" :style="{background:runStatusClass(run)==='green'?'var(--ok-l)':(runStatusClass(run)==='warn'?'#fff7ed':'var(--err-l)'),color:runStatusClass(run)==='green'?'var(--ok)':(runStatusClass(run)==='warn'?'#d97706':'var(--err)')}">
                {{runStatusClass(run)==='green'?'✓':(runStatusClass(run)==='warn'?'!':'×')}}
              </div>
              <div class="list-main">
                <div class="list-title">{{runAccountText(run)}} · {{runVideoText(run)}}</div>
                <div class="list-sub">{{run.finished_at||run.started_at||''}} · {{displayRunMode(run)}}</div>
              </div>
              <span class="badge" :class="runStatusClass(run)==='green'?'ok':(runStatusClass(run)==='warn'?'warn':'err')">{{runStatusText(run)}}</span>
            </div>
          </div>
          <div v-else class="empty"><div class="ico">📋</div><div class="txt">暂无采集记录</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>Cookie 状态</h2></div>
        <div class="card-b">
          <div v-if="cookieStatus&&cookieStatus.by_platform">
            <div class="list-row" v-for="(hours,plat) in cookieStatus.by_platform" :key="plat">
              <div class="list-ico" :style="{background:platColor(plat)}">{{platIcon(plat)}}</div>
              <div class="list-main">
                <div class="list-title">{{platName(plat)}}</div>
                <div class="list-sub">Cookie 年龄：{{hours>=0?Math.round(hours)+'小时':'未知'}}</div>
              </div>
              <span class="badge" :class="hours>=72?'err':hours>=48?'warn':'ok'">
                {{hours>=72?'已过期':hours>=48?'即将过期':'正常'}}
              </span>
            </div>
          </div>
          <div v-else class="empty"><div class="ico">🍪</div><div class="txt">暂无 Cookie 状态</div></div>
        </div>
      </div>
    </template>

    <!-- ═══════ Doudian Stores ═══════ -->
    <template v-if="page==='doudian'">
      <div class="page-head">
        <div><h1>抖店管理</h1><div class="sub">管理抖店账号登录和数据同步</div></div>
        <button class="btn-pri btn-sm" @click="showAddStore=true">添加抖店</button>
      </div>
      <div class="card">
        <div class="card-h"><h2>已配置抖店（{{doudianStores.length}}）</h2>
          <button class="btn-ghost btn-sm" @click="loadDoudianStores(true)" :disabled="doudianChecking||doudianBusy">
            {{doudianChecking?'检查中':'刷新'}}
          </button>
        </div>
        <div class="card-b">
          <div v-if="doudianStores.length">
            <div class="doudian-row" :class="{'has-error': hasDoudianStoreProblem(s)}" v-for="s in doudianStores" :key="s.id">
              <div class="list-ico" style="background:var(--warn-l);color:var(--warn)">🛒</div>
              <div style="flex:1">
                <div class="store-title">
                  <div class="store-name">{{s.name}}</div>
                  <span class="store-status" :class="doudianStoreState(s)">{{doudianStoreStateLabel(s)}}</span>
                  <span v-if="hasDoudianStoreError(s)" class="badge warn">{{doudianStoreErrorLabel(s)}}</span>
                </div>
                <div class="store-id">ID: {{s.id}} · 云端: {{s.cloud_store_id||'未关联'}}</div>
                <div style="font-size:11px;color:var(--tx3);margin-top:2px">
                  创建：{{s.created_at||''}} · 同步：{{s.last_synced_at||'从未'}} · 状态检查：{{s.login_checked_at||'未检查'}}
                </div>
                <div v-if="doudianStoreProblemText(s)" class="store-error">
                  {{doudianStoreProblemText(s)}}
                </div>
              </div>
              <div class="list-actions">
                <button class="btn-ghost btn-sm" @click="doudianLogin(s.id)" :disabled="doudianBusy">{{doudianLoginStoreId===s.id?'登录中':'登录'}}</button>
                <button class="btn-err btn-sm" v-if="isDoudianStoreSyncing(s)" @click="doudianCancelSync" :disabled="doudianCanceling||!doudianJobId">{{doudianJobId?(doudianCanceling?'取消中':'取消同步'):'采集中'}}</button>
                <button class="btn-ghost btn-sm" v-else-if="isDoudianStoreQueued(s)" disabled>排队中</button>
                <button class="btn-pri btn-sm" v-else @click="doudianSync(s.id)" :disabled="doudianBusy">同步</button>
                <button class="btn-err btn-sm" @click="doudianDelete(s.id)" :disabled="doudianBusy">删除</button>
              </div>
            </div>
          </div>
          <div v-else class="empty"><div class="ico">🛒</div><div class="txt">暂无抖店，点击右上角添加</div></div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>抖店定时同步</h2></div>
        <div class="card-b">
          <div v-if="doudianSchedule">
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:13px;color:var(--tx2)">状态</span>
              <span class="badge" :class="doudianSchedule.started?'ok':'gray'">{{doudianSchedule.started?'已启动':'未启动'}}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:13px;color:var(--tx2)">下次同步</span>
              <span style="font-weight:600">{{doudianSchedule.countdown_seconds!==null?doudianCountdownText:'—'}}</span>
            </div>
            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
              <span style="font-size:13px;color:var(--tx2)">最近同步</span>
              <span style="font-size:13px">{{doudianSchedule.last_run||'从未'}}</span>
            </div>
            <div v-if="doudianSchedule.store_errors&&doudianSchedule.store_errors.length" style="display:flex;justify-content:space-between;gap:12px">
              <span style="font-size:13px;color:var(--tx2)">最近异常</span>
              <div class="doudian-error-list">
                <div class="doudian-error-item" v-for="err in doudianSchedule.store_errors" :key="err.id||err.name">
                  <b>{{err.name||err.id||'未知店铺'}}</b>：{{err.error}}
                </div>
              </div>
            </div>
            <div v-else-if="doudianSchedule.last_error" style="display:flex;justify-content:space-between;gap:12px">
              <span style="font-size:13px;color:var(--tx2)">最近异常</span>
              <span style="font-size:13px;color:var(--warn);text-align:right">{{doudianSchedule.last_error}}</span>
            </div>
          </div>
          <div v-else class="empty"><div class="ico">⏰</div><div class="txt">加载中…</div></div>
        </div>
      </div>
      <!-- Add Store Dialog -->
      <div v-if="showAddStore" style="position:fixed;inset:0;background:rgba(0,0,0,.4);display:flex;align-items:center;justify-content:center;z-index:100" @click.self="showAddStore=false">
        <div class="card" style="width:380px">
          <div class="card-h"><h2>添加抖店</h2></div>
          <div class="card-b">
            <div class="form-group">
              <label>店铺名称</label>
              <input v-model.trim="newStoreName" placeholder="例如：唐商披星" @keyup.enter="addDoudianStore">
            </div>
            <div class="btn-row" style="justify-content:flex-end;margin-top:16px">
              <button class="btn-ghost" @click="showAddStore=false">取消</button>
              <button class="btn-pri" @click="addDoudianStore" :disabled="!newStoreName">添加</button>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════ Settings ═══════ -->
    <template v-if="page==='settings'">
      <div class="page-head">
        <div><h1>设置</h1><div class="sub">配置伴侣运行参数</div></div>
      </div>
      <div class="card">
        <div class="card-h"><h2>服务器配置</h2></div>
        <div class="card-b">
          <div class="form-group">
            <label>API 地址</label>
            <input v-model.trim="settingsForm.api_url" placeholder="https://ddddkiii.com/api/v1">
            <div class="hint">披星云后端 API 地址，通常不需要修改</div>
          </div>
          <div class="form-group">
            <label>更新清单地址</label>
            <input v-model.trim="settingsForm.update_manifest_url" placeholder="https://dl.ddddkiii.com/companion-updates/latest.json">
            <div class="hint">远程更新检查地址</div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-top:1px solid #f1f3f8">
            <div>
              <div style="font-weight:600;font-size:14px">开机自启动</div>
              <div style="font-size:12px;color:var(--tx3)">开机后静默进入托盘，不弹主窗口；路径变化时会自动修复</div>
              <div v-if="startupStatus&&startupStatus.enabled&&!startupStatus.path_ok" style="font-size:12px;color:var(--warn);margin-top:4px">启动路径需要修复，重启伴侣后会自动修复</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settingsForm.launch_on_start" @change="toggleStartup">
              <span class="toggle-slider"></span>
            </label>
          </div>
          <button class="btn-pri btn-sm" @click="saveSettings" :disabled="savingSettings">{{savingSettings?'保存中…':'保存配置'}}</button>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>采集设置</h2></div>
        <div class="card-b">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
            <div>
              <div style="font-weight:600;font-size:14px">自动采集</div>
              <div style="font-size:12px;color:var(--tx3)">关闭后不会排定时全量采集；手动采集仍可用</div>
            </div>
            <label class="toggle">
              <input type="checkbox" v-model="settingsForm.auto_collect_on_start" @change="saveSettings">
              <span class="toggle-slider"></span>
            </label>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>账号</h2></div>
        <div class="card-b">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0">
            <div>
              <div style="font-weight:600;font-size:14px">当前登录</div>
              <div style="font-size:12px;color:var(--tx3)">{{configInfo.saved_identifier||configInfo.saved_email||'未知'}}</div>
            </div>
            <button class="btn-err btn-sm" @click="logout">退出登录</button>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══════ About ═══════ -->
    <template v-if="page==='about'">
      <div class="page-head">
        <div><h1>关于</h1><div class="sub">版本信息和更新检查</div></div>
      </div>
      <div class="card">
        <div class="card-b" style="text-align:center;padding:32px">
          <div style="width:64px;height:64px;border-radius:16px;background:linear-gradient(135deg,#6366f1,#8b5cf6);display:flex;align-items:center;justify-content:center;font-size:30px;font-weight:800;color:#fff;margin:0 auto 12px">P</div>
          <div style="font-size:18px;font-weight:700">披星云伴侣</div>
          <div style="font-size:13px;color:var(--tx2);margin-top:4px">v{{appVersion}}</div>
          <div style="font-size:12px;color:var(--tx3);margin-top:8px">便携式多平台数据采集工具</div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>检查更新</h2></div>
        <div class="card-b">
          <div v-if="updateInfo" style="margin-bottom:12px">
            <div v-if="updateInfo.available" style="display:flex;align-items:center;gap:10px">
              <span class="badge ok">有新版本</span>
              <span style="font-weight:600">v{{updateInfo.latest.version}}</span>
            </div>
            <div v-else style="display:flex;align-items:center;gap:10px">
              <span class="badge gray">已是最新</span>
              <span style="font-size:13px;color:var(--tx2)">当前 v{{appVersion}}</span>
            </div>
            <div v-if="updateInfo.latest&&updateInfo.latest.notes" style="margin-top:8px;font-size:13px;color:var(--tx2);white-space:pre-wrap">{{updateInfo.latest.notes}}</div>
            <div v-if="updateInfo.latest&&updateInfo.latest.size" style="margin-top:8px;font-size:12px;color:var(--tx3)">
              更新包 {{formatBytes(updateInfo.latest.size)}}，下载完成后会自动校验并重启
            </div>
          </div>
          <div v-if="updating||(updateStatus&&updateStatus.phase&&updateStatus.phase!=='idle')" style="margin-bottom:12px">
            <div style="display:flex;align-items:center;justify-content:space-between;font-size:13px;color:var(--tx2);margin-bottom:6px">
              <span>{{updatePhaseText(updateStatus)}}</span>
              <span>{{updatePercent(updateStatus)}}%</span>
            </div>
            <div style="height:8px;border-radius:999px;background:#eef2ff;overflow:hidden">
              <div :style="{width:updatePercent(updateStatus)+'%',height:'100%',background:'linear-gradient(90deg,#6366f1,#22c55e)',transition:'width .25s ease'}"></div>
            </div>
            <div v-if="updateStatus&&updateStatus.total" style="margin-top:6px;font-size:12px;color:var(--tx3)">
              已下载 {{formatBytes(updateStatus.downloaded)}} / {{formatBytes(updateStatus.total)}}
            </div>
            <div v-if="updateStatus&&(updateStatus.phase==='downloading'||updateStatus.phase==='paused')" style="margin-top:8px;display:flex;gap:10px">
              <button class="btn-ghost btn-sm" v-if="updateStatus.phase==='downloading'" @click="pauseUpdateDownload">⏸ 暂停下载</button>
              <button class="btn-pri btn-sm" v-if="updateStatus.phase==='paused'" @click="resumeUpdateDownload">▶ 继续下载</button>
            </div>
            <div v-if="updateStatus&&updateStatus.phase==='restarting'" style="margin-top:6px;font-size:12px;color:var(--tx3)">
              本地伴侣正在重启，如果窗口关闭，稍等几秒再从桌面打开即可。
            </div>
          </div>
          <div v-if="updateError" style="color:var(--tx3);font-size:13px;margin-bottom:12px">{{updateError}}</div>
          <div class="btn-row">
            <button class="btn-ghost btn-sm" @click="checkUpdate" :disabled="updating">检查更新</button>
            <button class="btn-pri btn-sm" v-if="updateInfo&&updateInfo.available" @click="applyUpdate" :disabled="updating">{{updating?'更新中…':'安装更新'}}</button>
            <button class="btn-ghost btn-sm" v-if="updateInfo&&updateInfo.available" @click="snoozeUpdate" :disabled="updating">稍后提醒</button>
          </div>
        </div>
      </div>
      <div class="card">
        <div class="card-h"><h2>系统信息</h2></div>
        <div class="card-b">
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f3f8">
            <span style="font-size:13px;color:var(--tx2)">服务地址</span>
            <span style="font-size:13px;font-family:monospace">http://localhost:5409</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0;border-bottom:1px solid #f1f3f8">
            <span style="font-size:13px;color:var(--tx2)">API 地址</span>
            <span style="font-size:13px;font-family:monospace">{{configInfo.api_url||'—'}}</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:6px 0">
            <span style="font-size:13px;color:var(--tx2)">健康状态</span>
            <span class="badge" :class="healthOk?'ok':'err'">{{healthOk?'正常':'离线'}}</span>
          </div>
        </div>
      </div>
    </template>

    <!-- ═══ AI 剪辑 ═══ -->
    <template v-if="page==='editor'">
      <div class="page-head">
        <div><h1>AI 剪辑</h1><div class="sub">一键完成气口、字幕、素材和成片</div></div>
        <span class="badge" :class="veEnv?.deepseek_key_set?'ok':'warn'">AI服务：{{veEnv?.deepseek_key_set?'已配置':'未配置'}}</span>
      </div>

      <div style="display:flex;gap:0;margin-bottom:16px;border:1px solid var(--brd);border-radius:8px;overflow:hidden;width:fit-content">
        <button :class="veMode==='standard'?'btn-pri':'btn-ghost'" style="border-radius:0;box-shadow:none" @click="veMode='standard'">基础剪辑</button>
        <button :class="veMode==='advanced'?'btn-pri':'btn-ghost'" style="border-radius:0;box-shadow:none;border-left:1px solid var(--brd)" @click="veMode='advanced'">高级剪辑</button>
        <button :class="veMode==='tools'?'btn-pri':'btn-ghost'" style="border-radius:0;box-shadow:none;border-left:1px solid var(--brd)" @click="veMode='tools'">高级工具</button>
      </div>

      <template v-if="veMode==='standard'">
        <div class="card">
            <div class="card-h"><h2>AI 基础剪辑</h2><span v-if="veTaskStatus" class="badge" :class="veStatusBadge">{{veStatusText}}</span></div>
            <div class="card-b">
              <div style="font-size:13px;color:var(--tx2);margin-bottom:16px">适合数字人、口播视频，一键完成气口、字幕、素材和成片。</div>
              <div v-if="!veBasicReady" style="font-size:13px;color:var(--warn);background:var(--warn-l);border:1px solid #fed7aa;border-radius:8px;padding:10px 12px;margin-bottom:14px">
                剪辑能力检查：{{veBasicReadinessText}}
              </div>
              <div class="form-group">
                <label>视频</label>
                <button class="btn-ghost" @click="pickVeVideo">选择视频</button>
              <div v-if="veVideoPath" style="margin-top:10px;font-size:13px;line-height:1.9;background:#f8fafc;border:1px solid var(--brd2);border-radius:8px;padding:10px 12px">
                <div>文件名：{{veVideoName}}</div>
                <div>时长：{{fmtDuration(veVideoInfo?.duration)}}</div>
                <div>分辨率：{{veVideoInfo?.width||'-'}} × {{veVideoInfo?.height||'-'}}</div>
              </div>
            </div>
            <div class="form-row">
              <div class="form-group"><label>剪辑节奏</label><select v-model="vePace"><option value="natural">自然</option><option value="compact">紧凑</option><option value="fast">极致</option></select><div class="hint">{{vePaceHint}}</div></div>
              <div class="form-group"><label>字幕样式</label><select v-model="veSubtitleTemplate"><option value="minimal">极简</option><option value="yellow">黄白重点</option><option value="business">商业</option><option value="emotion">情感</option></select></div>
              <div class="form-group"><label>素材</label><select v-model="veMaterialDensity"><option value="off">不加素材</option><option value="low">少量</option><option value="normal">正常</option><option value="high">丰富</option></select></div>
            </div>
            <div class="form-group">
              <label>素材库</label>
              <div class="btn-row"><button class="btn-ghost" @click="pickVeMaterialFolder">选择素材库</button><button class="btn-ghost" @click="refreshVeMaterials" :disabled="!veMaterialLibrary">刷新素材</button></div>
              <div class="hint">当前素材库：{{veMaterialLibrary||defaultMaterialLibrary}} · 共 {{veMaterialCount}} 个素材</div>
            </div>
            <div class="btn-row">
              <button class="btn-pri" @click="startStandardEdit" :disabled="!veVideoPath||veTaskRunning||(veEnv&&!veEnv.ffmpeg?.available)">{{veTaskRunning?'AI剪辑处理中...':'开始一键剪辑'}}</button>
              <button class="btn-err" v-if="veTaskRunning" @click="cancelVeTask">取消</button>
            </div>
          </div>
        </div>
        <div class="card" v-if="veTaskStatus&&veTaskRunning">
          <div class="card-h"><h2>AI剪辑处理中</h2></div>
          <div class="card-b">
            <div v-for="s in veProgressSteps" :key="s" style="font-size:13px;padding:4px 0">{{veStepDone(s)?'✓':'○'}} {{s}}</div>
            <div class="progress"><div class="progress-bar" :style="{width:(veTaskStatus.progress||0)+'%'}"></div></div>
            <div style="margin-top:8px;font-size:13px;color:var(--tx2)">{{veTaskStatus.progress||0}}% · {{veTaskStatus.current_step}}</div>
          </div>
        </div>
        <div class="card" v-if="veTaskStatus&&veTaskStatus.status==='done'">
          <div class="card-h"><h2>剪辑完成</h2></div>
          <div class="card-b">
            <div class="grid3">
              <div>原视频：<b>{{fmtDuration(veTaskStatus.stats?.source_duration)}}</b></div>
              <div>成片：<b>{{fmtDuration(veTaskStatus.stats?.output_duration)}}</b></div>
              <div>删除停顿：<b>{{fmtDuration(veTaskStatus.stats?.removed_silence)}}</b></div>
              <div>字幕：<b>{{veTaskStatus.stats?.subtitle_count||0}} 条</b></div>
              <div>素材：<b>{{veTaskStatus.stats?.material_count||0}} 段</b></div>
              <div>耗时：<b>{{fmtDuration(veTaskStatus.stats?.processing_seconds)}}</b></div>
            </div>
            <div v-if="veTaskStatus.warnings&&veTaskStatus.warnings.length" style="margin-top:12px;font-size:13px;color:var(--warn);background:var(--warn-l);border:1px solid #fed7aa;border-radius:8px;padding:10px 12px">
              提醒：{{veWarningText}}
            </div>
            <div class="btn-row" style="margin-top:16px"><button class="btn-pri" @click="playVeOutput(veTaskStatus.output_path)">播放成片</button><button class="btn-ghost" @click="openVeOutput(veTaskStatus.output_path)">打开文件夹</button><button class="btn-ghost" @click="resetVeBasic">再剪一个</button></div>
          </div>
        </div>
      </template>

      <template v-if="veMode==='advanced'">
        <div class="card">
          <div class="card-h"><h2>高级剪辑</h2><span v-if="veTaskStatus" class="badge" :class="veStatusBadge">{{veStatusText}}</span></div>
          <div class="card-b">
            <button class="btn-ghost" @click="pickVeVideo">选择视频</button>
            <div v-if="veVideoPath" style="margin:10px 0;font-size:13px">{{veVideoName}} · {{fmtDuration(veVideoInfo?.duration)}}</div>
            <div class="form-group"><label>我要剪什么</label><textarea v-model="veInstruction" rows="4" style="height:auto;resize:vertical" placeholder="帮我剪一条 1~2 分钟、开头观点冲突一点的短视频。"></textarea></div>
            <div class="form-row">
              <div class="form-group"><label>目标时长</label><select v-model="veDurationMode"><option value="short">30~60秒</option><option value="medium">1~2分钟</option><option value="long">2~3分钟</option></select></div>
              <div class="form-group"><label>剪辑风格</label><select v-model="veAdvancedStyle"><option value="faithful">保留原意</option><option value="viral">爆款优先</option><option value="emotion">情绪优先</option><option value="dense">干货密度优先</option></select></div>
            </div>
            <div class="btn-row"><button class="btn-pri" @click="startAdvancedAnalyze" :disabled="!veVideoPath||!veInstruction||veTaskRunning">AI分析视频</button><button class="btn-err" v-if="veTaskRunning" @click="cancelVeTask">取消</button></div>
          </div>
        </div>
        <div class="card" v-if="veTaskStatus&&veTaskStatus.plan&&veTaskStatus.status==='awaiting_confirmation'">
          <div class="card-h"><h2>{{veTaskStatus.plan.title}}</h2><span>{{fmtDuration(veTaskStatus.plan.estimated_duration)}}</span></div>
          <div class="card-b">
            <div v-for="clip in veTaskStatus.plan.clips" :key="clip.id" style="border:1px solid var(--brd2);border-radius:8px;padding:12px;margin-bottom:10px">
              <div style="display:flex;justify-content:space-between"><b>{{fmtDuration(clip.source_start)}} - {{fmtDuration(clip.source_end)}} · {{clip.role}}</b><label><input type="checkbox" v-model="clip.enabled"> 启用</label></div>
              <div style="margin:8px 0">{{clip.text}}</div>
              <div style="font-size:12px;color:var(--tx2)">理由：{{clip.reason}}</div>
              <div class="btn-row" style="margin-top:8px"><button class="btn-ghost btn-sm" @click="moveVeClip(clip,-1)">上移</button><button class="btn-ghost btn-sm" @click="moveVeClip(clip,1)">下移</button></div>
            </div>
            <div class="btn-row"><button class="btn-ghost" @click="saveVePlan">保存调整</button><button class="btn-pri" @click="renderAdvanced">生成成片</button></div>
          </div>
        </div>
      </template>

      <div class="card">
        <div class="card-h"><h2>最近任务</h2></div>
        <div class="card-b">
          <div v-for="t in veTasks" :key="t.id" class="list-row">
            <div class="list-main"><div class="list-title">{{fileName(t.source_path)}} · {{t.mode==='advanced'?'高级剪辑':'基础剪辑'}}</div><div class="list-sub">{{t.created_at}} · {{t.current_step||t.status}}</div></div>
            <span class="badge" :class="t.status==='done'?'ok':t.status==='error'?'err':t.status==='awaiting_confirmation'?'warn':'gray'">{{t.status}}</span>
            <button class="btn-ghost btn-sm" v-if="t.output_path" @click="playVeOutput(t.output_path)">播放</button>
            <button class="btn-ghost btn-sm" v-if="t.output_path" @click="openVeOutput(t.output_path)">文件夹</button>
            <button class="btn-ghost btn-sm" v-if="t.status==='error'" @click="rerunVeTask(t)">重新执行</button>
          </div>
          <div v-if="!veTasks.length" class="empty">暂无剪辑任务</div>
        </div>
      </div>

      <template v-if="veMode==='tools'">

      <!-- 环境状态 -->
      <div class="card" v-if="veEnv">
        <div class="card-h"><h2>环境状态</h2></div>
        <div class="card-b">
          <div style="display:flex;gap:16px;flex-wrap:wrap">
            <div style="display:flex;align-items:center;gap:8px">
              <span class="pulse" :class="veEnv.capcut?.available?'ok':'err'"></span>
              <span style="font-size:13px;font-weight:600">capcut-cli</span>
              <span class="badge" :class="veEnv.capcut?.available?'ok':'err'">{{veEnv.capcut?.available?'已安装':'未安装'}}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="pulse" :class="veEnv.jianying?.installed?'ok':'err'"></span>
              <span style="font-size:13px;font-weight:600">剪映</span>
              <span class="badge" :class="veEnv.jianying?.installed?'ok':'err'">{{veEnv.jianying?.installed?'已检测到':'未检测到'}}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="pulse" :class="veEnv.ffmpeg?.available?'ok':'gray'"></span>
              <span style="font-size:13px;font-weight:600">FFmpeg</span>
              <span class="badge" :class="veEnv.ffmpeg?.available?'ok':'gray'">{{veEnv.ffmpeg?.available?'可用':'不可用'}}</span>
            </div>
            <div style="display:flex;align-items:center;gap:8px">
              <span class="pulse" :class="veEnv.speech_to_text_ready?'ok':'gray'"></span>
              <span style="font-size:13px;font-weight:600">字幕识别</span>
              <span class="badge" :class="veEnv.speech_to_text_ready?'ok':'gray'">{{veEnv.speech_to_text_ready?'可用':'无模型'}}</span>
            </div>
          </div>
          <div v-if="veEnv.speech_to_text_ready&&!veEnv.faster_whisper?.model_ready&&veEnv.whisper?.cached_model" style="margin-top:10px;font-size:12px;color:var(--tx2);background:var(--pri-l);padding:8px 12px;border-radius:6px">
            字幕将使用本机 Whisper 缓存模型：{{veEnv.whisper.cached_model}}
          </div>
          <div v-if="!veEnv.speech_to_text_ready" style="margin-top:10px;font-size:12px;color:var(--warn);background:var(--warn-l);padding:8px 12px;border-radius:6px">
            未检测到本地字幕模型；基础剪辑仍可先导出无字幕成片。
          </div>
          <div v-if="!veEnv.capcut?.available" style="margin-top:10px;font-size:12px;color:var(--warn);background:var(--warn-l);padding:8px 12px;border-radius:6px">
            capcut-cli 未安装，请在终端运行: <code style="background:#fff;padding:2px 6px;border-radius:4px">npm install -g capcut-cli</code>
          </div>
        </div>
      </div>

      <!-- DeepSeek 配置 -->
      <div class="card">
        <div class="card-h"><h2>DeepSeek 配置</h2></div>
        <div class="card-b">
          <div class="form-row">
            <div class="form-group">
              <label>API Key</label>
              <input type="password" v-model="veApiKey" placeholder="sk-..." style="font-family:monospace">
              <div class="hint">在 platform.deepseek.com 获取</div>
            </div>
            <div class="form-group">
              <label>模型</label>
              <select v-model="veModel">
                <option v-for="m in veModels" :key="m.id" :value="m.id">{{m.name || m.id}}</option>
              </select>
              <div class="hint">{{veModelHint}}</div>
            </div>
            <div class="form-group">
              <label>API 地址</label>
              <input type="text" v-model="veBaseUrl" placeholder="https://api.deepseek.com" style="font-family:monospace">
            </div>
          </div>
        </div>
      </div>

      <!-- 项目管理 -->
      <div class="card">
        <div class="card-h"><h2>剪映项目</h2>
          <button class="btn-ghost btn-sm" @click="loadVeDrafts">刷新草稿</button>
        </div>
        <div class="card-b">
          <div class="form-row" style="margin-bottom:12px">
            <div class="form-group" style="margin-bottom:0">
              <input type="text" v-model="veNewProjectName" placeholder="新项目名称">
            </div>
            <div class="form-group" style="margin-bottom:0">
              <input type="text" v-model="veNewVideoPath" placeholder="视频文件路径（可选）">
            </div>
            <button class="btn-pri" @click="createVeProject" :disabled="!veNewProjectName||veCreating" style="white-space:nowrap">
              {{veCreating?'创建中...':'创建项目'}}
            </button>
          </div>
          <div v-if="veDrafts.length>0">
            <div style="font-size:12px;color:var(--tx3);margin-bottom:8px">已有草稿（{{veDrafts.length}}个），目录: {{veDraftDir}}</div>
            <div v-for="d in veDrafts" :key="d" style="display:flex;align-items:center;justify-content:space-between;padding:8px 12px;border:1px solid var(--brd2);border-radius:6px;margin-bottom:6px"
              :style="{borderColor:veSelectedDraft===d?'var(--pri)':'var(--brd2)',background:veSelectedDraft===d?'var(--pri-l)':'transparent'}">
              <span style="font-size:13px;font-weight:600">{{d}}</span>
              <div class="btn-row">
                <button class="btn-ghost btn-sm" @click="veSelectedDraft=d;notify('已选择: '+d,'info')">选择</button>
                <button class="btn-ghost btn-sm" @click="openVeProject(d)">打开</button>
              </div>
            </div>
          </div>
          <div v-else style="font-size:13px;color:var(--tx3);text-align:center;padding:16px">
            暂无剪映草稿。请在剪映中创建一个项目，或使用上方创建。
          </div>
          <div v-if="veSelectedDraft" style="margin-top:8px;font-size:12px;color:var(--pri);font-weight:600">
            当前选中: {{veSelectedDraft}}
          </div>
        </div>
      </div>

      <!-- ══ 标准模式 ══ -->
      <template v-if="veMode==='standard'">
        <div class="card">
          <div class="card-h"><h2>标准模式 — 一键流水线</h2>
            <span v-if="veTaskStatus" class="badge" :class="veStatusBadge">{{veStatusText}}</span>
          </div>
          <div class="card-b">
            <div style="display:flex;gap:12px;margin-bottom:16px;flex-wrap:wrap">
              <!-- 4 步骤指示 -->
              <div v-for="(s,i) in ['剪辑气口','字号字幕','场景素材','导出视频']" :key="i"
                style="display:flex;align-items:center;gap:6px;padding:6px 12px;border-radius:6px;font-size:13px;font-weight:600"
                :style="{background:veStepStatus(i)==='done'?'var(--ok-l)':veStepStatus(i)==='running'?'var(--warn-l)':veStepStatus(i)==='warn'?'var(--warn-l)':'#f1f5f9',color:veStepStatus(i)==='done'?'var(--ok)':veStepStatus(i)==='running'?'var(--warn)':veStepStatus(i)==='warn'?'var(--warn)':'var(--tx3)'}">
                <span>{{veStepStatus(i)==='done'?'✅':veStepStatus(i)==='running'?'⏳':veStepStatus(i)==='warn'?'⚠️':'⬜'}}</span>
                {{i+1}}. {{s}}
              </div>
            </div>

            <div class="form-group">
              <label>视频文件路径</label>
              <input type="text" v-model="veVideoPath" placeholder="C:\Videos\my-video.mp4" style="font-family:monospace">
              <div class="hint">标准模式需要一个视频文件路径</div>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>字幕字号: <span style="color:var(--pri);font-weight:700">{{veFontSize}}</span></label>
                <input type="range" min="24" max="96" step="2" v-model.number="veFontSize" style="height:auto;padding:0">
              </div>
              <div class="form-group">
                <label>字幕颜色</label>
                <input type="color" v-model="veSubtitleColor" style="height:40px;padding:4px">
              </div>
              <div class="form-group">
                <label>气口阈值: <span style="color:var(--pri);font-weight:700">{{veSilenceThreshold}}s</span></label>
                <input type="range" min="0.3" max="2.0" step="0.1" v-model.number="veSilenceThreshold" style="height:auto;padding:0">
                <div class="hint">超过此时长的静音被识别为气口</div>
              </div>
            </div>

<div class="form-group">
<label style="display:flex;align-items:center;gap:8px;cursor:pointer">
<input type="checkbox" v-model="veEffectsEnabled" style="width:auto;height:auto">
场景特效（剪映内置）
</label>
<div v-if="veEffectsEnabled" class="hint" style="margin-top:4px">
AI 将根据字幕内容，从剪映内置 912 个场景特效 + 468 个滤镜中智能匹配并直接应用
</div>
</div>

            <div class="btn-row" style="margin-top:8px">
              <button class="btn-pri" @click="startStandardEdit"
                :disabled="!veVideoPath||!veSelectedDraft||['executing','pending'].includes(veTaskStatus?.status)">
                {{['executing','pending'].includes(veTaskStatus?.status)?'流水线执行中...':'🚀 开始标准剪辑'}}
              </button>
              <button class="btn-ghost" @click="openVeProject(veSelectedDraft)" v-if="veSelectedDraft">打开剪映草稿</button>
            </div>
          </div>
        </div>

        <!-- 标准模式进度 -->
        <div class="card" v-if="veTaskStatus&&veTaskStatus.steps">
          <div class="card-h"><h2>流水线进度</h2></div>
          <div class="card-b">
            <div style="font-size:13px;color:var(--tx2);margin-bottom:12px">{{veTaskStatus.message||'处理中...'}}</div>
            <div v-for="(step,i) in veTaskStatus.steps" :key="i"
              style="border:1px solid var(--brd2);border-radius:8px;padding:12px;margin-bottom:10px">
              <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
                <div style="display:flex;align-items:center;gap:8px">
                  <span style="font-size:16px">{{step.status==='done'?'✅':step.status==='running'?'⏳':step.status==='warn'?'⚠️':'⬜'}}</span>
                  <span style="font-weight:700;font-size:14px">{{i+1}}. {{step.name}}</span>
                </div>
                <span class="badge" :class="step.status==='done'?'ok':step.status==='running'?'warn':step.status==='warn'?'warn':'gray'">
                  {{step.status==='done'?'完成':step.status==='running'?'进行中':step.status==='warn'?'跳过':'待执行'}}
                </span>
              </div>
              <div v-if="step.details&&step.details.length" style="font-size:12px;color:var(--tx2);margin-left:28px">
                <div v-for="(d,j) in step.details" :key="j" style="padding:2px 0">{{d}}</div>
              </div>
              <div v-if="step.note" style="font-size:12px;color:var(--warn);margin-left:28px;margin-top:4px;font-style:italic">{{step.note}}</div>
            </div>
          </div>
        </div>
      </template>

      <!-- ══ 自定义模式 ══ -->
      <template v-if="veMode==='custom'">
        <div class="card">
          <div class="card-h"><h2>自定义模式 — 自然语言剪辑</h2>
            <span v-if="veTaskStatus" class="badge" :class="veStatusBadge">{{veStatusText}}</span>
          </div>
          <div class="card-b">
            <div class="form-group">
              <label>告诉 AI 你想做什么</label>
              <textarea v-model="veInstruction" rows="4" style="height:auto;resize:vertical;font-family:inherit"
                placeholder="例如：&#10;1. 给视频加上中文字幕&#10;2. 把视频前30秒切出来做一个短片&#10;3. 加一段文字'关注我'在视频开头，持续3秒&#10;4. 给第1个片段加 dissolve 转场"></textarea>
              <div class="hint">DeepSeek 会自动生成剪映命令并执行</div>
            </div>
            <div class="btn-row" style="margin-bottom:12px">
              <button class="btn-pri" @click="startAiEdit" :disabled="!veInstruction||!veApiKey||['thinking','executing','pending'].includes(veTaskStatus?.status)">
                {{['thinking','executing','pending'].includes(veTaskStatus?.status)?'执行中...':'开始 AI 剪辑'}}
              </button>
              <button class="btn-ghost" @click="veInstruction='';veTaskStatus=null;veTaskId=null" v-if="!['thinking','executing','pending'].includes(veTaskStatus?.status)">清空</button>
            </div>

            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
              <button class="btn-ghost btn-sm" @click="veInstruction='给视频自动识别中文字幕'">加字幕</button>
              <button class="btn-ghost btn-sm" @click="veInstruction='检测视频场景，把长视频切成3个短片'">长切短</button>
              <button class="btn-ghost btn-sm" @click="veInstruction='在视频开头加文字标题，内容是「精彩瞬间」，持续3秒，白色大字'">加标题</button>
              <button class="btn-ghost btn-sm" @click="veInstruction='给第一个片段加 dissolve 转场'">加转场</button>
              <button class="btn-ghost btn-sm" @click="veInstruction='导出字幕为 SRT 文件'">导出字幕</button>
            </div>

            <!-- 自定义模式进度 -->
            <div v-if="veTaskStatus" style="margin-top:12px">
              <div style="font-size:13px;color:var(--tx2);margin-bottom:8px">{{veTaskStatus.message||'处理中...'}}</div>
              <div v-if="veTaskStatus.commands" style="margin-bottom:12px">
                <div style="font-size:12px;font-weight:700;color:var(--tx3);margin-bottom:6px">DeepSeek 生成的命令（{{veTaskStatus.commands.length}}条）:</div>
                <div v-for="(cmd,i) in veTaskStatus.commands" :key="i" style="background:#f8fafc;border:1px solid var(--brd2);border-radius:6px;padding:8px 12px;margin-bottom:4px;font-size:12px">
                  <span style="color:var(--pri);font-weight:700">{{i+1}}.</span>
                  <span style="color:var(--tx);font-weight:600">{{cmd.cmd}}</span>
                  <span style="color:var(--tx2);font-family:monospace"> {{cmd.args.join(' ')}}</span>
                  <div v-if="cmd.desc" style="color:var(--tx3);margin-top:2px">{{cmd.desc}}</div>
                </div>
              </div>
              <div v-if="veTaskStatus.results">
                <div style="font-size:12px;font-weight:700;color:var(--tx3);margin-bottom:6px">执行结果:</div>
                <div v-for="r in veTaskStatus.results" :key="r.index" style="display:flex;align-items:flex-start;gap:8px;padding:8px 12px;border-radius:6px;margin-bottom:4px"
                  :style="{background:r.ok?'var(--ok-l)':'var(--err-l)'}">
                  <span style="font-size:14px">{{r.ok?'✅':'❌'}}</span>
                  <div style="flex:1">
                    <div style="font-size:13px;font-weight:600">{{r.cmd}} — {{r.ok?'成功':'失败'}}</div>
                    <div v-if="r.error" style="font-size:12px;color:var(--err);margin-top:2px;font-family:monospace">{{r.error.substring(0,300)}}</div>
                    <div v-if="r.data" style="font-size:12px;color:var(--tx2);margin-top:2px">{{JSON.stringify(r.data).substring(0,200)}}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- 高级：直接执行命令 -->
      <div class="card">
        <div class="card-h"><h2>直接执行命令（高级）</h2></div>
        <div class="card-b">
          <div class="form-group">
            <label>capcut-cli 命令参数（空格分隔，--jianying 会自动添加）</label>
            <input type="text" v-model="veRawCmd" placeholder="例如: info my-project" style="font-family:monospace">
          </div>
          <button class="btn-ghost btn-sm" @click="runRawCapcut" :disabled="!veRawCmd||veRunningRaw">
            {{veRunningRaw?'执行中...':'执行'}}
          </button>
          <div v-if="veCmdResult" style="margin-top:12px">
            <div style="font-size:12px;font-weight:700;margin-bottom:4px" :style="{color:veCmdResult.ok?'var(--ok)':'var(--err)'}">
              {{veCmdResult.ok?'成功':'失败'}} (exit {{veCmdResult.exit_code||'?'}})
            </div>
            <pre style="background:#f8fafc;border:1px solid var(--brd2);border-radius:6px;padding:12px;font-size:12px;overflow-x:auto;max-height:300px;overflow-y:auto">{{veCmdResult.stdout||veCmdResult.error||veCmdResult.stderr||''}}</pre>
          </div>
        </div>
      </div>
    </template>
    </template>
  </main>
  </template>
</div>

<script>
const{createApp}=Vue;
createApp({
  data(){
    return{
      appVersion:'3.2.0',
      configured:false,
      healthOk:false,
      page:'dash',

      // Login
      loginEmail:'',loginPass:'',rememberPwd:true,loginLoading:false,loginError:'',feishuLoading:false,feishuSessionId:'',feishuLoginUrl:'',feishuPollTimer:null,

      // Platforms
      platforms:[
        {id:'douyin',key:'DOUYIN',name:'抖音',icon:'🎵',bg:'#161823'},
        {id:'tencent',key:'WECHAT_VIDEO',name:'视频号',icon:'📹',bg:'#07c160'},
        {id:'kuaishou',key:'KUAISHOU',name:'快手',icon:'⚡',bg:'#ff4906'},
        {id:'xiaohongshu',key:'XIAOHONGSHU',name:'小红书',icon:'📕',bg:'#ff2442'},
      ],

      // Scan-bind
      selected:'',status:'idle',sessionId:'',errorMsg:'',scanPollTimer:null,

      // Accounts
      localAccounts:[],
      loadingAccounts:false,

      // Collection
      collecting:false,dcProgress:null,cookieStatus:null,recentRuns:[],

      // Doudian
      doudianStores:[],doudianSchedule:null,showAddStore:false,newStoreName:'',doudianSyncing:false,doudianCanceling:false,doudianChecking:false,doudianJobId:'',doudianLoginStoreId:'',

      // Feedback
      toast:{show:false,message:'',type:'info',timer:null},

      // Settings
      settingsForm:{api_url:'',update_manifest_url:'',auto_collect_on_start:false,launch_on_start:false},
      configInfo:{},savingSettings:false,startupStatus:null,

      // Update
      updateInfo:null,updateStatus:null,updateError:'',updating:false,updatePollTimer:null,updateReminder:null,updateReminderTimer:null,

      // Video Editor
      veEnv:null,veDrafts:[],veDraftDir:'',veLoadingEnv:false,veCreating:false,
      veNewProjectName:'',veNewVideoPath:'',
      veApiKey:'',veBaseUrl:'https://api.deepseek.com',veModel:'deepseek-v4-flash',veModels:[
        {id:'deepseek-v4-flash',name:'DeepSeek V4 Flash',description:'更快，适合标准剪辑和日常命令生成'},
        {id:'deepseek-v4-pro',name:'DeepSeek V4 Pro',description:'更强，适合复杂自定义剪辑规划'},
      ],veInstruction:'',
      veTaskId:null,veTaskStatus:null,vePollTimer:null,
      veSelectedDraft:'',veCmdResult:null,veRawCmd:'',veRunningRaw:false,
      veMode:'standard', // standard | advanced | tools
      veTasks:[],veVideoInfo:null,veMaterialLibrary:'',veMaterialCount:0,
      vePace:'compact',veSubtitleTemplate:'yellow',veMaterialDensity:'normal',
      veDurationMode:'medium',veAdvancedStyle:'viral',
      defaultMaterialLibrary:'',
      veProgressSteps:['分析视频','剪辑气口','识别字幕','字幕排版','匹配素材','合成视频'],
      // 标准模式选项
      veVideoPath:'',veFontSize:48,veSubtitleColor:'#FFFFFF',
      veSilenceThreshold:0.5,veEffectsEnabled:true,
    }
  },
  computed:{
    selectedPlatform(){return this.platforms.find(p=>p.id===this.selected)},
    groupedLocalAccounts(){
      const names={WECHAT_VIDEO:{n:'视频号',i:'📹',b:'#e6f9f0'},DOUYIN:{n:'抖音',i:'🎵',b:'#f0f0f5'},KUAISHOU:{n:'快手',i:'⚡',b:'#fff0ed'},XIAOHONGSHU:{n:'小红书',i:'📕',b:'#ffe8ec'}};
      const order=['WECHAT_VIDEO','DOUYIN','KUAISHOU','XIAOHONGSHU'];
      const groups={};
      for(const a of this.localAccounts||[]){
        const k=a.platform||'OTHER';
        if(!groups[k])groups[k]={key:k,name:(names[k]||{n:k}).n,items:[],icon:(names[k]||{}).i,bg:(names[k]||{}).b};
        groups[k].items.push(a);
      }
      return Object.values(groups).sort((a,b)=>(order.indexOf(a.key)<0?99:order.indexOf(a.key))-(order.indexOf(b.key)<0?99:order.indexOf(b.key)));
    },
    progressPercent(){const p=this.dcProgress?.progress||{};return Math.max(0,Math.min(100,Math.round((p.current||0)/(p.total||1)*100)))},
    scheduleMode(){
      const s=this.dcProgress?.schedule;
      if(!s||!s.started)return'未启动';
      return'全量采集';
    },
    countdownText(){
      const sec=this.dcProgress?.schedule?.countdown_seconds;
      if(sec===null||sec===undefined)return'计算中';
      if(sec<=0)return'即将开始';
      const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),r=sec%60;
      return h>0?`${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${m}:${String(r).padStart(2,'0')}`;
    },
    lastSuccessText(){
      const run=this.dcProgress?.schedule?.last_success;
      if(!run)return'暂无记录';
      return`${(run.finished_at||'').split(' ')[1]||run.finished_at||''} · ${run.accounts_reported||0}账号`;
    },
    collectionBusyText(){
      const p=this.dcProgress?.progress||{};
      const name=p.nickname||'当前账号';
      const cur=p.current||0,total=p.total||0,phase=p.phase||'处理中';
      return `后台正在采集：${name}（${cur}/${total}，${phase}）。请等本轮实际结束后再手动触发。`;
    },
    doudianCountdownText(){
      const sec=this.doudianSchedule?.countdown_seconds;
      if(sec===null||sec===undefined||sec===null)return'—';
      if(sec<=0)return'即将开始';
      const h=Math.floor(sec/3600),m=Math.floor((sec%3600)/60),r=sec%60;
      return h>0?`${h}:${String(m).padStart(2,'0')}:${String(r).padStart(2,'0')}`:`${m}:${String(r).padStart(2,'0')}`;
    },
    doudianBusy(){
      return !!(this.doudianSyncing||this.doudianLoginStoreId||this.doudianSchedule?.running);
    },
    doudianStatusText(){
      if(!this.doudianSchedule?.running)return'空闲';
      const task=this.doudianSchedule?.active_task||{};
      if(task.label)return task.store_name?`${task.store_name} ${task.label}`:task.label;
      return'处理中';
    },
    expiredCount(){
      return (this.localAccounts||[]).filter(a=>a.needs_rescan).length;
    },
    veStatusBadge(){
      const s=this.veTaskStatus?.status;
      if(!s)return'';
      const map={queued:'gray',pending:'gray',thinking:'info',executing:'warn',cutting_silence:'warn',transcribing:'warn',subtitles:'warn',materials:'warn',rendering:'warn',analyzing:'info',planning:'info',awaiting_confirmation:'ok',done:'ok',partial:'warn',cancelled:'warn',error:'err'};
      return map[s]||'gray';
    },
    veStatusText(){
      const s=this.veTaskStatus?.status;
      if(!s)return'';
      const map={queued:'排队中',pending:'等待中',thinking:'AI思考中',executing:'执行中',cutting_silence:'剪气口',transcribing:'识别字幕',subtitles:'生成字幕',materials:'匹配素材',rendering:'合成中',analyzing:'分析中',planning:'生成方案',awaiting_confirmation:'待确认',done:'完成',partial:'部分完成',cancelled:'已取消',error:'错误'};
      return map[s]||s;
    },
    veBasicReady(){
      if(!this.veEnv)return true;
      return !!this.veEnv.ffmpeg?.available && !!this.veEnv.speech_to_text_ready;
    },
    veBasicReadinessText(){
      if(!this.veEnv)return'正在检查本机剪辑环境...';
      if(!this.veEnv.ffmpeg?.available)return'缺少 FFmpeg，当前无法导出视频。';
      if(!this.veEnv.speech_to_text_ready)return`字幕识别模型未就绪；当前仍可先导出无字幕剪辑成片。模型目录：${this.veEnv.faster_whisper?.model_dir||''}`;
      return'本机环境正常。';
    },
    veWarningText(){
      const labels={MODEL_REQUIRED:'字幕识别模型未就绪，本次已导出无字幕成片',ASR_FAILED:'字幕识别失败，本次已导出无字幕成片',ASR_TIMEOUT:'字幕识别超时，本次已导出无字幕成片',MATERIAL_LIBRARY_EMPTY:'未找到本地素材，本次未插入素材'};
      return (this.veTaskStatus?.warnings||[]).map(x=>labels[x]||x).join('；');
    },
    veModelHint(){
      const m=(this.veModels||[]).find(x=>x.id===this.veModel);
      return m?.description||'选择 DeepSeek 模型';
    },
    veTaskRunning(){
      return ['queued','pending','thinking','executing','cutting_silence','transcribing','subtitles','materials','rendering','analyzing','planning'].includes(this.veTaskStatus?.status);
    },
    veVideoName(){
      return this.fileName(this.veVideoPath);
    },
    vePaceHint(){
      return {natural:'保留更多呼吸和停顿',compact:'适合短视频口播',fast:'节奏更快、信息密度更高'}[this.vePace]||'';
    },
    veStepStatus(){
      return (i)=>{
        const steps=this.veTaskStatus?.steps;
        if(!steps||!steps[i])return'pending';
        return steps[i].status;
      };
    },
  },
  methods:{
    notify(message,type='info',timeout=3200){
      if(this.toast.timer)clearTimeout(this.toast.timer);
      this.toast={show:true,message,type,timer:null};
      this.toast.timer=setTimeout(()=>{this.toast.show=false},timeout);
    },
    // ── Config & Login ──
    async checkConfig(){
      try{
        const j=await(await fetch('/api/config')).json();
        this.configured=!!j.configured;
        this.appVersion=j.app_version||this.appVersion;
        this.configInfo=j;

        if(j.saved_identifier||j.saved_email)this.loginEmail=j.saved_identifier||j.saved_email;
        this.settingsForm.api_url=j.api_url||'https://ddddkiii.com/api/v1';
        this.settingsForm.update_manifest_url=j.update_manifest_url||'';
        this.settingsForm.auto_collect_on_start=!!j.auto_collect_on_start;
        this.settingsForm.launch_on_start=!!j.launch_on_start;
        this.loadStartupStatus();
      }catch(e){this.configured=false}
    },
    async tryAutoLogin(){
      try{
        const j=await(await fetch('/api/auto-login',{method:'POST'})).json();
        if(j.configured){this.configured=true;this.loadLocalAccounts()}
      }catch(e){}
    },
    async doLogin(){
      if(!this.loginEmail||!this.loginPass){this.loginError='请输入邮箱/手机号和密码';return}
      this.loginLoading=true;this.loginError='';
      try{
        const j=await(await fetch('/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:this.loginEmail,password:this.loginPass,remember:this.rememberPwd})})).json();
        if(j.error){this.loginError=j.error}
        else{this.configured=true;this.loginPass='';this.notify('登录成功','ok');this.loadLocalAccounts();this.loadDoudianStores()}
      }catch(e){this.loginError='登录失败：'+e.message}
      this.loginLoading=false;
    },
    async startFeishuLogin(){
      this.loginError='';
      this.feishuLoading=true;
      try{
        const j=await(await fetch('/api/feishu/start',{method:'POST'})).json();
        if(j.error)throw new Error(j.error);
        this.feishuSessionId=j.session_id||'';
        this.feishuLoginUrl=j.url||'';
        this.notify('已打开浏览器，请在飞书完成授权','info',5000);
        this.pollFeishuLogin();
      }catch(e){
        this.loginError='飞书登录失败：'+e.message;
        this.feishuLoading=false;
      }
    },
    openFeishuLoginUrl(){
      if(this.feishuLoginUrl)window.open(this.feishuLoginUrl,'_blank');
    },
    pollFeishuLogin(){
      if(this.feishuPollTimer)clearInterval(this.feishuPollTimer);
      const check=async()=>{
        if(!this.feishuSessionId)return;
        try{
          const j=await(await fetch('/api/feishu/status/'+encodeURIComponent(this.feishuSessionId))).json();
          if(j.status==='success'){
            clearInterval(this.feishuPollTimer);this.feishuPollTimer=null;this.feishuLoading=false;
            this.configured=true;this.notify('飞书登录成功','ok');this.loadLocalAccounts();this.loadDoudianStores();
          }else if(j.status==='error'||j.status==='expired'){
            clearInterval(this.feishuPollTimer);this.feishuPollTimer=null;this.feishuLoading=false;
            this.loginError=j.message||'飞书登录未完成，请重试';
          }
        }catch(e){}
      };
      check();
      this.feishuPollTimer=setInterval(check,1500);
      setTimeout(()=>{if(this.feishuPollTimer){clearInterval(this.feishuPollTimer);this.feishuPollTimer=null;this.feishuLoading=false;this.loginError='飞书登录超时，请重试'}},10*60*1000);
    },
    async logout(){
      if(!confirm('确定退出登录吗？本地数据不会被删除。'))return;
      try{
        await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({token:''})});
        this.configured=false;
      }catch(e){this.notify('退出失败：'+e.message,'err')}
    },

    // ── Scan Bind ──
    selectPlatform(id){this.selected=id;this.status='idle';this.errorMsg=''},
    async startSelectedScan(){
      if(!this.selected)return;
      if(this.status==='loading'||this.status==='browser'||this.status==='uploading'){
        this.notify('当前扫码绑定还在处理中，请先完成或取消这一轮。','warn');
        return;
      }
      this.clearScanPoll();
      this.status='loading';this.errorMsg='';
      try{
        const cfg=await(await fetch('/api/config')).json();
        let token='';
        if(cfg.token_set){const tj=await(await fetch('/api/get-token')).json();token=tj.token||''}
        if(!token)throw new Error('请先登录披星云账号');
        const api=cfg.api_url||'https://ddddkiii.com/api/v1';
        const j=await(await fetch('/api/scan-bind/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({platform:this.selected,token,api_url:api})})).json();
        if(j.code!==0)throw new Error(j.msg||'启动失败');
        this.sessionId=j.session_id;this.status='loading';
        this.monitorScanLaunch();
        this.notify('浏览器已打开，请扫码登录后回到伴侣确认。','ok');
      }catch(e){this.status='error';this.errorMsg=e.message;this.notify(e.message,'err',5200)}
    },
    async confirmLogin(){
      if(!this.sessionId){this.status='error';this.errorMsg='会话丢失，请重试';return}
      this.status='uploading';
      this.clearScanPoll();
      try{
        const j=await(await fetch('/api/confirm-login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:this.sessionId})})).json();
        if(j.code!==0)throw new Error(j.msg||'确认失败');
        let tries=0;
        const maxTries=900;
        this.scanPollTimer=setInterval(async()=>{
          tries++;
          try{
            const s=await(await fetch('/api/scan-bind/poll/'+this.sessionId)).json();
            if(s.status==='done'){this.clearScanPoll();this.status='done';this.notify('绑定和初始采集完成，网站会按实际采集结果更新。','ok',5200);this.loadLocalAccounts()}
            if(s.status==='error'){this.clearScanPoll();this.status='error';this.errorMsg=s.msg||'上传失败';this.notify(this.errorMsg,'err',5200)}
            if(tries>maxTries){this.clearScanPoll();this.status='error';this.errorMsg='采集上传耗时较长，请稍后刷新状态；不要重复扫码。';this.notify(this.errorMsg,'warn',6500)}
          }catch(e){if(tries>maxTries){this.clearScanPoll();this.status='error';this.errorMsg='状态查询暂时中断，伴侣仍可能在采集上传，请稍后刷新。'}}
        },1000);
      }catch(e){this.status='error';this.errorMsg=e.message;this.notify(e.message,'err',5200)}
    },
    async cancelScan(){
      try{if(this.sessionId)await fetch('/api/cancel-scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({session_id:this.sessionId})})}catch(e){}
      this.notify('已取消本次扫码绑定','info');
      this.reset();
    },
    clearScanPoll(){
      if(this.scanPollTimer){clearInterval(this.scanPollTimer);this.scanPollTimer=null}
    },
    monitorScanLaunch(){
      this.clearScanPoll();
      let tries=0;
      this.scanPollTimer=setInterval(async()=>{
        tries++;
        try{
          const s=await(await fetch('/api/scan-bind/poll/'+this.sessionId)).json();
          if(s.status==='browser'){
            this.clearScanPoll();
            this.status='browser';
            this.notify('浏览器已打开，请扫码登录后回到伴侣确认。','ok');
          }
          if(s.status==='error'||s.status==='not_found'){
            this.clearScanPoll();
            this.status='error';
            this.errorMsg=s.msg||'浏览器启动失败，请重启披星云伴侣后重试';
            this.notify(this.errorMsg,'err',6500);
          }
          if(tries>45){
            this.clearScanPoll();
            this.status='error';
            this.errorMsg='浏览器启动超时，请重启披星云伴侣后重试';
            this.notify(this.errorMsg,'err',6500);
          }
        }catch(e){
          if(tries>45){
            this.clearScanPoll();
            this.status='error';
            this.errorMsg='浏览器启动状态查询失败，请重启披星云伴侣后重试';
          }
        }
      },1000);
    },
    reset(){this.clearScanPoll();this.status='idle';this.sessionId='';this.errorMsg=''},
    displayRunMode(run){
      return '全量采集';
    },
    runStatusClass(run){
      if(!run || run.status!=='success')return 'red';
      const accounts=Number(run.accounts_reported||0);
      const videos=Number(run.videos_reported||run.posts_collected||0);
      return (accounts>0||videos>0)?'green':'warn';
    },
    runStatusText(run){
      if(!run || run.status!=='success')return '失败';
      return this.runStatusClass(run)==='green'?'已上报':'未上报';
    },
    runAccountText(run){
      const count=Number(run?.accounts_reported||0);
      return `${count} 个账号`;
    },
    runVideoText(run){
      const count=Number(run?.videos_reported||run?.posts_collected||0);
      return `${count} 条内容`;
    },

        // ── Accounts ──
    async loadLocalAccounts(showLoading=false){
      if(showLoading)this.loadingAccounts = true;
      try{
        const r = await fetch('/api/local-accounts');
        const j = await r.json();
        if(j.code === 0){
          this.localAccounts = j.data || [];
        } else {
          const msg=j.msg||'加载账号失败';
          console.error('加载账号失败:', msg);
          this.notify(msg,'err');
        }
      } catch(e){
        console.error('加载账号失败:', e);
        this.notify('加载账号失败：'+e.message,'err');
      } finally {
        if(showLoading)this.loadingAccounts = false;
      }
    },
    accountStatusText(a){
      if(a.platform==='WECHAT_VIDEO'&&a.is_current_online)return'当前在线';
      if(a.platform==='WECHAT_VIDEO'&&a.auth_saved)return'需切换/重扫';
      if(a.needs_rescan)return'已失效';
      if(a.last_collected_at)return'已采集';
      if(a.profile_refreshed_at||a.status==='active')return'已登录';
      return'已失效';
    },
    accountBadgeClass(a){
      if(a.platform==='WECHAT_VIDEO'&&a.is_current_online)return'ok';
      if(a.platform==='WECHAT_VIDEO'&&a.auth_saved)return'warn';
      if(a.needs_rescan)return'err';
      if(a.last_collected_at)return'ok';
      if(a.profile_refreshed_at||a.status==='active')return'info';
      return'warn';
    },
    async removeLocalAccount(id){
      if(!confirm('确定删除这个本地账号吗？'))return;
      try{
        const j=await(await fetch('/api/local-accounts/'+id,{method:'DELETE'})).json();
        if(j.code!==0)throw new Error(j.msg||'删除失败');
        this.notify('本地账号已删除','ok');
        this.loadLocalAccounts();
      }catch(e){this.notify('删除失败：'+e.message,'err')}
    },
    async rebindAccount(id){
      try{
        const account=(this.localAccounts||[]).find(a=>a.id===id);
        const map={WECHAT_VIDEO:'tencent',DOUYIN:'douyin',KUAISHOU:'kuaishou',XIAOHONGSHU:'xiaohongshu'};
        const platform=map[account?.platform];
        if(!platform){this.notify('暂不支持重新绑定这个平台','warn');return}
        this.page='bind';
        this.selected=platform;
        this.status='idle';
        this.sessionId='';
        this.errorMsg='';
        await this.startSelectedScan();
      }catch(e){this.notify('重新绑定失败：'+e.message,'err')}
    },

    // ── Collection ──
    async pollStatus(){
      try{
        const j=await(await fetch('/api/data-collection/status')).json();
        this.dcProgress=j;
        this.collecting=!!j.running;
        this.recentRuns=j.schedule?.recent_runs||[];
      }catch(e){}
    },
    async triggerCollect(mode, platform=''){
      mode='full';
      if(this.collecting){
        this.notify(this.collectionBusyText,'warn',6500);
        return;
      }
      const platformNames={WECHAT_VIDEO:'视频号',DOUYIN:'抖音'};
      const targetName=platformNames[platform]||'全部账号';
      if(!confirm(`确定现在开始${targetName}全量采集吗？`))return;
      this.collecting=true;
      try{
        const j=await(await fetch('/api/data-collection/trigger',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:'full',max_posts:0,platform})})).json();
        if(j.status==='already_running'){
          this.notify('后台已有采集任务在跑，请等实际采集结束。','warn',5200);
        }else if(j.status==='started'){
          this.notify(`已开始${targetName}采集，请以当前进度结束为准。`,'ok');
        }else{
          this.notify(j.msg||'采集触发结果未知，请查看当前进度。','warn');
        }
        this.pollStatus();
      }catch(e){this.collecting=false;this.notify('触发采集失败：'+e.message,'err')}
    },
    async loadCookieStatus(){
      try{const j=await(await fetch('/api/cookie-status')).json();this.cookieStatus=j}catch(e){}
    },

    // ── Doudian ──
    doudianStoreErrorText(store){
      return String(store?.last_error||'').trim();
    },
    doudianStoreState(store){
      const state=String(store?.login_state||'unknown').toLowerCase();
      if(state==='online')return'online';
      if(state==='expired')return'expired';
      if(state==='error')return'error';
      return'unknown';
    },
    doudianStoreStateLabel(store){
      const state=this.doudianStoreState(store);
      if(state==='online')return'已登录';
      if(state==='expired')return'登录失效';
      if(state==='error')return'检查失败';
      return'待确认';
    },
    doudianStoreProblemText(store){
      const msg=this.doudianStoreErrorText(store);
      if(msg)return msg;
      const state=this.doudianStoreState(store);
      if(state==='expired')return store?.login_message||'抖店登录失效，请重新登录';
      if(state==='error')return store?.login_message||'抖店状态检查失败，请点刷新重试';
      if(state==='unknown')return store?.login_message||'还没有确认登录状态，点击刷新检查';
      return '';
    },
    hasDoudianStoreError(store){
      return !!this.doudianStoreErrorText(store);
    },
    hasDoudianStoreProblem(store){
      return this.hasDoudianStoreError(store)||['expired','error'].includes(this.doudianStoreState(store));
    },
    doudianStoreErrorLabel(store){
      const msg=this.doudianStoreErrorText(store);
      return msg.includes('登录')||msg.toLowerCase().includes('login')?'登录失效':'同步异常';
    },
    isDoudianStoreSyncing(store){
      const task=this.doudianSchedule?.active_task||{};
      return !!(this.doudianSchedule?.running&&task.store_id&&store?.id===task.store_id);
    },
    isDoudianStoreQueued(store){
      if(!this.doudianSchedule?.running)return false;
      const task=this.doudianSchedule?.active_task||{};
      if(task.store_id)return store?.id!==task.store_id;
      return !this.doudianSyncing;
    },
    async loadDoudianStores(probe=false){
      if(probe)this.doudianChecking=true;
      try{
        const url=probe?'/api/doudian/stores?probe=1':'/api/doudian/stores';
        const j=await(await fetch(url)).json();
        if(j.code===0){
          this.doudianStores=j.data||[];
          if(probe)this.notify('抖店登录状态检查完成','ok');
        }else this.notify(j.msg||'加载抖店失败','err')
      }catch(e){this.notify((probe?'检查抖店状态失败：':'加载抖店失败：')+e.message,'err')}
      finally{if(probe)this.doudianChecking=false}
    },
    async loadDoudianSchedule(){
      try{
        const j=await(await fetch('/api/doudian/schedule')).json();
        if(j.code===0){
          const wasBusy=!!this.doudianSchedule?.running;
          this.doudianSchedule=j.data;
          if(this.doudianLoginStoreId&&!j.data?.running){
            this.doudianLoginStoreId='';
            this.loadDoudianStores();
          }
          if(wasBusy&&!j.data?.running)this.loadDoudianStores();
        }
      }catch(e){}
    },
    async addDoudianStore(){
      if(!this.newStoreName)return;
      try{
        const j=await(await fetch('/api/doudian/stores',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:this.newStoreName})})).json();
        if(j.code===0){this.showAddStore=false;this.newStoreName='';this.notify('抖店已添加','ok');this.loadDoudianStores();this.loadDoudianSchedule()}
        else{this.notify(j.msg||'添加失败','err')}
      }catch(e){this.notify('添加失败：'+e.message,'err')}
    },
    async doudianLogin(id){
      if(this.doudianBusy){
        this.notify('抖店正在同步或登录中，请稍后再操作。','warn');
        return;
      }
      this.doudianLoginStoreId=id;
      try{
        const j=await(await fetch(`/api/doudian/stores/${id}/login`,{method:'POST'})).json();
        if(j.code!==0){this.doudianLoginStoreId='';this.notify(j.msg||'登录失败','err')}
        else{this.notify('抖店登录窗口已打开；扫码成功后会自动关闭窗口。','ok');this.loadDoudianSchedule()}
      }catch(e){this.doudianLoginStoreId='';this.notify('登录失败：'+e.message,'err')}
    },
    async doudianSync(id){
      if(this.doudianSyncing||this.doudianSchedule?.running){
        this.notify(`抖店${this.doudianStatusText}，请完成后再操作。`,'warn');
        return;
      }
      this.doudianSyncing=true;
      this.doudianCanceling=false;
      this.doudianJobId='';
      try{
        const j=await(await fetch(`/api/doudian/stores/${id}/sync`,{method:'POST'})).json();
        if(j.code===0){
          // Poll job status
          const jobId=j.job_id;
          this.doudianJobId=jobId;
          const pollJob=async()=>{
            try{
              const sj=await(await fetch(`/api/doudian/jobs/${jobId}`)).json();
              if(sj.code===0&&sj.data){
                if(sj.data.status==='done'||sj.data.status==='success'){
                  this.doudianSyncing=false;
                  this.doudianCanceling=false;
                  this.doudianJobId='';
                  this.loadDoudianStores();
                  this.loadDoudianSchedule();
                  this.notify('抖店同步完成','ok');
                  return;
                }
                if(sj.data.status==='canceled'){this.doudianSyncing=false;this.doudianCanceling=false;this.doudianJobId='';this.loadDoudianStores();this.loadDoudianSchedule();this.notify(sj.data.message||'同步已取消','warn');return}
                if(sj.data.status==='error'){this.doudianSyncing=false;this.doudianCanceling=false;this.doudianJobId='';this.loadDoudianStores();this.loadDoudianSchedule();this.notify(sj.data.message||'同步失败','err',5200);return}
              }
              setTimeout(pollJob,2000);
            }catch(e){this.doudianSyncing=false;this.doudianCanceling=false;this.doudianJobId='';this.loadDoudianStores();this.loadDoudianSchedule();this.notify('同步状态查询失败：'+e.message,'err')}
          };
          pollJob();
        }else{this.doudianSyncing=false;this.doudianCanceling=false;this.loadDoudianStores();this.loadDoudianSchedule();this.notify(j.msg||'同步失败','err')}
      }catch(e){this.doudianSyncing=false;this.doudianCanceling=false;this.loadDoudianStores();this.loadDoudianSchedule();this.notify('同步失败：'+e.message,'err')}
    },
    async doudianCancelSync(){
      if(!this.doudianJobId){this.notify('同步任务还在启动，请稍后再取消','warn');return}
      this.doudianCanceling=true;
      try{
        const j=await(await fetch(`/api/doudian/jobs/${this.doudianJobId}/cancel`,{method:'POST'})).json();
        if(j.code!==0){this.doudianCanceling=false;this.notify(j.msg||'取消失败','err')}
        else this.notify('已发送取消同步请求','info');
      }catch(e){this.doudianCanceling=false;this.notify('取消失败：'+e.message,'err')}
    },
    async doudianDelete(id){
      if(!confirm('确定删除这个抖店吗？'))return;
      try{
        const j=await(await fetch(`/api/doudian/stores/${id}`,{method:'DELETE'})).json();
        if(j.code!==0)throw new Error(j.msg||'删除失败');
        this.notify('抖店已删除','ok');
        this.loadDoudianStores();
        this.loadDoudianSchedule();
      }catch(e){this.notify('删除抖店失败：'+e.message,'err')}
    },

    // ── Settings ──
    async saveSettings(){
      this.savingSettings=true;
      try{
        const j=await(await fetch('/api/config',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(this.settingsForm)})).json();
        if(j.status&&j.status!=='ok')throw new Error(j.msg||'保存失败');
        this.checkConfig();
        this.notify('配置已保存','ok');
      }catch(e){this.notify('保存配置失败：'+e.message,'err')}
      this.savingSettings=false;
    },

    // ── Update ──
    async loadStartupStatus(){
      try{
        const j=await(await fetch('/api/startup/status')).json();
        if(j.code===0){
          this.startupStatus=j.status||null;
          this.settingsForm.launch_on_start=!!(this.startupStatus&&this.startupStatus.launch_on_start);
        }
      }catch(e){}
    },
    async toggleStartup(){
      const desired=!!this.settingsForm.launch_on_start;
      try{
        const j=await(await fetch('/api/startup/configure',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({enabled:desired})})).json();
        if(j.code!==0)throw new Error(j.msg||'startup configure failed');
        this.startupStatus=j.status||null;
        this.settingsForm.launch_on_start=!!desired;
        this.notify(desired?'已开启开机自启动':'已关闭开机自启动','ok');
      }catch(e){
        this.settingsForm.launch_on_start=!desired;
        this.notify('开机自启动设置失败：'+e.message,'err');
      }
    },
    formatBytes(n){
      const v=Number(n||0);
      if(!v)return'0 B';
      if(v>=1024*1024*1024)return`${(v/1024/1024/1024).toFixed(2)} GB`;
      if(v>=1024*1024)return`${(v/1024/1024).toFixed(v>=100*1024*1024?0:1)} MB`;
      if(v>=1024)return`${(v/1024).toFixed(1)} KB`;
      return`${Math.round(v)} B`;
    },
    updatePercent(s){
      const p=Number((s&&s.percent)||0);
      return Math.max(0,Math.min(100,Math.round(p)));
    },
    updatePhaseText(s){
      const phase=(s&&s.phase)||'idle';
      const map={
        idle:'空闲',
        queued:'准备更新',
        downloading:'正在下载安装包',
        paused:'已暂停下载',
        verifying:'正在校验安装包',
        verified:'校验完成',
        starting:'正在启动更新程序',
        restarting:'正在重启本地伴侣',
        error:'更新失败'
      };
      return map[phase]||'正在更新';
    },
    startUpdatePoll(){
      this.stopUpdatePoll();
      this.pollUpdateStatus();
      this.updatePollTimer=setInterval(()=>this.pollUpdateStatus(),1000);
    },
    stopUpdatePoll(){
      if(this.updatePollTimer){
        clearInterval(this.updatePollTimer);
        this.updatePollTimer=null;
      }
    },
    async pollUpdateStatus(){
      try{
        const j=await(await fetch('/api/update/status')).json();
        if(j.code!==0)return;
        this.updateStatus=j.status||null;
        if(this.updateStatus&&this.updateStatus.running)this.updating=true;
        if(this.updateStatus&&this.updateStatus.phase==='error'){
          this.updateError=this.updateStatus.error||'更新失败';
          this.updating=false;
          this.stopUpdatePoll();
        }
      }catch(e){
        if(this.updating)this.updateError='本地伴侣可能正在重启，稍等片刻后重新打开即可。';
      }
    },
    async checkUpdate(){
      this.updateError='';
      try{
        const j=await(await fetch('/api/update/check')).json();
        this.updateInfo=j;
        this.updateStatus=j.update_status||this.updateStatus;
        if(this.updateStatus&&this.updateStatus.running)this.startUpdatePoll();
        if(j.error)this.updateError='暂时无法连接更新服务器，可稍后再试；不影响采集和同步功能。';
        else this.notify(j.available?'发现新版本':'当前已是最新版本',j.available?'info':'ok');
      }catch(e){
        this.updateError='暂时无法连接更新服务器，可稍后再试；不影响采集和同步功能。';
        this.notify(this.updateError,'warn');
      }
    },
    fmtSize(n){
      if(!n&&n!==0)return '未知';
      if(n>1048576)return (n/1048576).toFixed(1)+' MB';
      if(n>1024)return (n/1024).toFixed(0)+' KB';
      return n+' B';
    },
    async checkUpdateReminder(){
      if(this.updateReminderTimer)return;
      const tick=async()=>{
        try{
          const j=await(await fetch('/api/update/available')).json();
          if(j.code===0){
            this.updateReminder=(j.available&&j.latest)?j.latest:null;
            if(this.updateReminder){
              this.updateInfo={code:0,current_version:j.current_version,available:true,latest:j.latest};
            }
          }
        }catch(e){}
      };
      await tick();
      this.updateReminderTimer=setInterval(tick,15000);
    },
    async reminderSnooze(){
      const version=this.updateReminder?.version||'';
      try{
        await fetch('/api/update/snooze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,minutes:30})});
        this.updateReminder=null;
        this.notify('已设置 30 分钟后再提醒','ok');
      }catch(e){
        this.notify('稍后提醒设置失败：'+e.message,'err');
      }
    },
    async reminderApply(){
      if(!this.updateReminder)return;
      if(!confirm('现在安装更新并重启本地伴侣吗？'))return;
      this.updateInfo={code:0,current_version:this.appVersion,available:true,latest:this.updateReminder};
      await this.applyUpdate();
    },
    async pauseUpdateDownload(){
      try{
        const j=await(await fetch('/api/update/pause',{method:'POST'})).json();
        if(j.code===0)this.notify('下载已暂停，可随时继续','info');
        this.updateStatus=j.status||this.updateStatus;
        this.startUpdatePoll();
      }catch(e){this.notify('暂停失败：'+e.message,'err');}
    },
    async resumeUpdateDownload(){
      try{
        const j=await(await fetch('/api/update/resume',{method:'POST'})).json();
        if(j.code===0)this.notify('继续下载中','ok');
        this.updateStatus=j.status||this.updateStatus;
        this.startUpdatePoll();
      }catch(e){this.notify('继续失败：'+e.message,'err');}
    },
    async snoozeUpdate(){
      const version=this.updateInfo?.latest?.version||'';
      try{
        await fetch('/api/update/snooze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({version,hours:24})});
        this.notify('已设置 24 小时后再提醒','ok');
      }catch(e){
        this.notify('稍后提醒设置失败：'+e.message,'err');
      }
    },
    async applyUpdate(){
      if(!this.updateInfo?.available)return;
      if(!confirm('现在安装更新并重启本地伴侣吗？'))return;
      this.updating=true;
      this.updateError='';
      this.updateStatus={phase:'queued',percent:0,downloaded:0,total:(this.updateInfo.latest&&this.updateInfo.latest.size)||0,running:true};
      try{
        const j=await(await fetch('/api/update/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).json();
        if(j.code!==0)throw new Error(j.msg||'更新失败');
        this.updateStatus=j.status||this.updateStatus;
        this.startUpdatePoll();
        this.notify('更新已开始，下载完成后会自动重启。','info',6000);
      }catch(e){
        this.updateError=e.message;
        this.updating=false;
        this.stopUpdatePoll();
      }
    },

    // ── Health ──
    async ping(){
      try{const j=await(await fetch('/health')).json();this.healthOk=true;this.appVersion=j.version||this.appVersion}catch(e){this.healthOk=false}
    },

    // ── Helpers ──
    platName(k){const m={DOUYIN:'抖音',WECHAT_VIDEO:'视频号',KUAISHOU:'快手',XIAOHONGSHU:'小红书'};return m[k]||k},
    platIcon(k){const m={DOUYIN:'🎵',WECHAT_VIDEO:'📹',KUAISHOU:'⚡',XIAOHONGSHU:'📕'};return m[k]||'🔗'},
    platColor(k){const m={DOUYIN:'#f0f0f5',WECHAT_VIDEO:'#e6f9f0',KUAISHOU:'#fff0ed',XIAOHONGSHU:'#ffe8ec'};return m[k]||'var(--pri-l)'},

    // ── AI 剪辑 ──
    fileName(p){return String(p||'').split(/[\\/]/).pop()||''},
    fmtDuration(v){
      const n=Math.max(0,Number(v||0)); const m=Math.floor(n/60), s=Math.floor(n%60);
      return `${m}:${String(s).padStart(2,'0')}`;
    },
    veStepDone(label){
      const p=Number(this.veTaskStatus?.progress||0);
      const map={'分析视频':8,'剪辑气口':20,'识别字幕':45,'字幕排版':62,'匹配素材':75,'合成视频':90};
      return p>=map[label];
    },
    async loadVeEnv(){
      this.veLoadingEnv=true;
      try{
        const j=await(await fetch('/api/video-editor/v2/env')).json();
        if(j.code===0){
          this.veEnv=j.data;
          this.defaultMaterialLibrary=(j.data?.default_material_library)||((this.settingsForm?.user_home||'')+'\\Videos\\PixingyunAssets');
          if(Array.isArray(j.data?.deepseek_models)&&j.data.deepseek_models.length){
            this.veModels=j.data.deepseek_models;
          }
          if(j.data?.deepseek_default_model&&!this.veModel){
            this.veModel=j.data.deepseek_default_model;
          }
        }
        else this.notify(j.error||'环境检查失败','err');
      }catch(e){this.notify('环境检查失败: '+e.message,'err')}
      this.veLoadingEnv=false;
    },
    async loadVeTasks(){
      try{
        const j=await(await fetch('/api/video-editor/v2/tasks')).json();
        if(j.code===0)this.veTasks=j.data||[];
      }catch(e){}
    },
    async pickVeVideo(){
      try{
        const j=await(await fetch('/api/video-editor/v2/pick-video',{method:'POST'})).json();
        if(j.code===0&&!j.data?.cancelled){this.veVideoPath=j.data.path;this.veVideoInfo=j.data.info;this.notify('已选择视频','ok')}
      }catch(e){this.notify('选择视频失败：'+e.message,'err')}
    },
    async pickVeMaterialFolder(){
      try{
        const j=await(await fetch('/api/video-editor/v2/pick-material-folder',{method:'POST'})).json();
        if(j.code===0&&!j.data?.cancelled){this.veMaterialLibrary=j.data.folder;this.veMaterialCount=j.data.material_count||0;this.notify('素材库已选择','ok')}
      }catch(e){this.notify('选择素材库失败：'+e.message,'err')}
    },
    async refreshVeMaterials(){
      try{
        const j=await(await fetch('/api/video-editor/v2/materials/scan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({folder:this.veMaterialLibrary})})).json();
        if(j.code===0){this.veMaterialCount=(j.data.materials||[]).length;this.notify('素材库已刷新','ok')}
      }catch(e){this.notify('刷新素材失败：'+e.message,'err')}
    },
    async loadVeDrafts(){
      try{
        const j=await(await fetch('/api/video-editor/drafts')).json();
        if(j.code===0){this.veDrafts=j.data.drafts||[];this.veDraftDir=j.data.draft_dir||'';}
        else this.notify(j.error||j.data?.error||'加载草稿失败','warn');
      }catch(e){this.notify('加载草稿失败: '+e.message,'err')}
    },
    async createVeProject(){
      this.veCreating=true;
      try{
        const body={name:this.veNewProjectName};
        if(this.veNewVideoPath)body.video_path=this.veNewVideoPath;
        const j=await(await fetch('/api/video-editor/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
        if(j.code===0&&j.data?.ok){
          this.notify('项目创建成功','ok');
          this.veNewProjectName='';this.veNewVideoPath='';
          this.loadVeDrafts();
        }else{
          this.notify(j.data?.error||j.data?.stderr||'创建失败','err');
        }
      }catch(e){this.notify('创建失败: '+e.message,'err')}
      this.veCreating=false;
    },
    async openVeProject(name){
      try{
        const path=this.veDraftDir+'\\'+name;
        await fetch('/api/video-editor/open',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({project_path:path})});
      }catch(e){}
    },
    async startStandardEdit(){
      if(!this.veVideoPath){this.notify('请先选择视频','warn');return}
      if(this.veEnv&&!this.veEnv.ffmpeg?.available){this.notify('缺少 FFmpeg，无法导出视频','err');return}
      try{
        const body={
          source_path:this.veVideoPath,
          pace:this.vePace,
          subtitle_template:this.veSubtitleTemplate,
          material_density:this.veMaterialDensity,
          material_library:this.veMaterialLibrary||this.defaultMaterialLibrary,
        };
        const j=await(await fetch('/api/video-editor/v2/basic',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
        if(j.code===0){
          this.veTaskId=j.data.task_id;
          this.veTaskStatus={status:'queued',progress:0,current_step:'等待剪辑任务',stats:{}};
          this.pollVeTask();
        }else{
          this.notify(j.error||'启动失败','err');
        }
      }catch(e){this.notify('启动失败: '+e.message,'err')}
    },
    async startAdvancedAnalyze(){
      if(!this.veVideoPath||!this.veInstruction){this.notify('请先选择视频并填写剪辑要求','warn');return}
      try{
        const body={source_path:this.veVideoPath,instruction:this.veInstruction,duration_mode:this.veDurationMode,style:this.veAdvancedStyle};
        const j=await(await fetch('/api/video-editor/v2/advanced/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
        if(j.code===0){this.veTaskId=j.data.task_id;this.veTaskStatus={status:'queued',progress:0,current_step:'等待 AI 分析'};this.pollVeTask()}
        else this.notify(j.error||'启动失败','err');
      }catch(e){this.notify('启动失败: '+e.message,'err')}
    },
    async saveVePlan(){
      const plan=this.veTaskStatus?.plan;if(!plan)return;
      const clips=(plan.clips||[]).map((c,i)=>({id:c.id,enabled:!!c.enabled,order:i+1}));
      const j=await(await fetch(`/api/video-editor/v2/advanced/${this.veTaskId}/plan`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({title:plan.title,clips})})).json();
      if(j.code===0){this.veTaskStatus.plan=j.data;this.notify('方案已保存','ok')}
    },
    moveVeClip(clip,delta){
      const list=this.veTaskStatus?.plan?.clips||[];const i=list.indexOf(clip);const j=i+delta;
      if(i<0||j<0||j>=list.length)return;[list[i],list[j]]=[list[j],list[i]];
    },
    async renderAdvanced(){
      await this.saveVePlan();
      const body={pace:this.vePace,subtitle_template:this.veSubtitleTemplate,material_density:this.veMaterialDensity,material_library:this.veMaterialLibrary||this.defaultMaterialLibrary};
      const j=await(await fetch(`/api/video-editor/v2/advanced/${this.veTaskId}/render`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
      if(j.code===0){this.veTaskStatus.status='rendering';this.veTaskStatus.progress=5;this.pollVeTask()}else this.notify(j.error||'生成失败','err');
    },
    async cancelVeTask(){
      if(!this.veTaskId)return;
      await fetch(`/api/video-editor/v2/tasks/${this.veTaskId}/cancel`,{method:'POST'});
      this.notify('已请求取消','info');
    },
    async playVeOutput(path){await fetch('/api/video-editor/v2/play',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})})},
    async openVeOutput(path){await fetch('/api/video-editor/v2/open-output',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({path})})},
    resetVeBasic(){this.veTaskId=null;this.veTaskStatus=null;this.veVideoPath='';this.veVideoInfo=null},
    rerunVeTask(t){this.veVideoPath=t.source_path;this.veMode=t.mode==='advanced'?'advanced':'standard';this.veTaskStatus=null;this.veTaskId=null},
    async startAiEdit(){
      if(!this.veInstruction){this.notify('请输入剪辑需求','warn');return}
      if(!this.veApiKey){this.notify('请配置 DeepSeek API Key','warn');return}
      try{
        const body={instruction:this.veInstruction,api_key:this.veApiKey,base_url:this.veBaseUrl,model:this.veModel};
        if(this.veSelectedDraft)body.project=this.veDraftDir+'\\'+this.veSelectedDraft;
        const j=await(await fetch('/api/video-editor/ai-edit',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
        if(j.code===0){
          this.veTaskId=j.data.task_id;
          this.veTaskStatus={status:'pending',message:'任务已创建...'};
          this.pollVeTask();
        }else{
          this.notify(j.error||'启动失败','err');
        }
      }catch(e){this.notify('启动失败: '+e.message,'err')}
    },
    pollVeTask(){
      if(this.vePollTimer)clearInterval(this.vePollTimer);
      const check=async()=>{
        if(!this.veTaskId)return;
        try{
          const j=await(await fetch('/api/video-editor/v2/tasks/'+this.veTaskId)).json();
          if(j.code===0){
            this.veTaskStatus=j.data;
            this.loadVeTasks();
            if(['done','partial','error','cancelled','awaiting_confirmation'].includes(j.data.status)){
              clearInterval(this.vePollTimer);this.vePollTimer=null;
              if(j.data.status==='done')this.notify('AI 剪辑完成','ok');
              else if(j.data.status==='awaiting_confirmation')this.notify('剪辑方案已生成','ok');
              else if(j.data.status==='error')this.notify('AI 剪辑出错: '+(j.data.error||j.data.error_message||j.data.message||j.data.current_step||'未知错误'),'err');
              else if(j.data.status==='cancelled')this.notify('任务已取消','warn');
              else this.notify('AI 剪辑部分完成','warn');
              this.loadVeDrafts();
            }
          }
        }catch(e){}
      };
      check();
      this.vePollTimer=setInterval(check,1500);
    },
    async runRawCapcut(){
      this.veRunningRaw=true;this.veCmdResult=null;
      try{
        const args=this.veRawCmd.trim().split(/\s+/);
        const j=await(await fetch('/api/video-editor/capcut',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({args})})).json();
        if(j.code===0)this.veCmdResult=j.data;
        else this.veCmdResult={ok:false,error:j.error||'执行失败'};
      }catch(e){this.veCmdResult={ok:false,error:e.message}}
      this.veRunningRaw=false;
    },
  },
  mounted(){
    this.checkConfig().then(()=>{
      this.tryAutoLogin();
      this.loadLocalAccounts();
      this.loadDoudianStores();
      this.loadDoudianSchedule();
      this.loadCookieStatus();
      this.loadVeEnv();
      this.loadVeTasks();
    });
    this.ping();
    this.pollStatus();
    this.pollUpdateStatus();
    this.checkUpdateReminder();
    setInterval(()=>this.ping(),5000);
    setInterval(()=>{
      if(this.configured){
        this.pollStatus();
        this.loadLocalAccounts();
        this.loadDoudianSchedule();
        if(!this.doudianSyncing&&!this.doudianLoginStoreId)this.loadDoudianStores();
      }
    },3000);
    setInterval(()=>{
      if(this.configured){
        this.loadCookieStatus();
      }
    },30000);
  }
}).mount('#app');
</script>
</body>
</html>'''
