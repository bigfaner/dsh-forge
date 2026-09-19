/* dsh-forge M1 原型 — 共享交互(所有页面加载)
   仅放跨页共享行为;页面专属逻辑在各页 inline script。 */

// 主题切换(持久化到 localStorage)
(function initTheme() {
  var saved = null;
  try { saved = localStorage.getItem('dsforge-theme'); } catch (e) {}
  if (saved === 'dark') document.body.setAttribute('data-ds-dark-theme', '');
  var btn = document.getElementById('themeToggle');
  if (btn) btn.addEventListener('click', function () {
    var dark = document.body.hasAttribute('data-ds-dark-theme');
    if (dark) {
      document.body.removeAttribute('data-ds-dark-theme');
      try { localStorage.setItem('dsforge-theme', 'light'); } catch (e) {}
    } else {
      document.body.setAttribute('data-ds-dark-theme', '');
      try { localStorage.setItem('dsforge-theme', 'dark'); } catch (e) {}
    }
  });
})();

// 移动端汉堡菜单
(function initBurger() {
  var burger = document.querySelector('.nav-burger');
  var links = document.getElementById('navLinks');
  if (burger && links) burger.addEventListener('click', function () {
    links.classList.toggle('open');
  });
})();

// 当前页导航高亮
(function initNavHighlight() {
  var file = location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-links a').forEach(function (a) {
    if (a.getAttribute('href') === file) a.classList.add('active');
  });
})();

// 应用内 toast(设计规范:顶部居中 top 40px,r14,3s 自动消失,不拦截点击)
function dsToast(text) {
  var t = document.createElement('div');
  t.className = 'ds-toast';
  t.setAttribute('role', 'status');
  t.textContent = text;
  Object.assign(t.style, {
    position: 'fixed', top: '40px', left: '50%', transform: 'translateX(-50%)',
    zIndex: '1100', pointerEvents: 'none',
    maxWidth: 'min(640px, calc(100vw - 48px))',
    padding: '12px 16px', borderRadius: '14px',
    background: 'var(--dsw-alias-toast-bg)', color: '#ffffff',
    fontSize: '14px', lineHeight: '22px', boxShadow: 'var(--shadow-card)',
    animation: 'notif-in 160ms cubic-bezier(0.4, 0, 0.2, 1)'
  });
  document.body.appendChild(t);
  setTimeout(function () {
    t.style.transition = 'opacity 1000ms';
    t.style.opacity = '0';
    setTimeout(function () { t.remove(); }, 1000);
  }, 3000);
}
