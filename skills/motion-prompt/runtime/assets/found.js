/* Motion Prompt — "Examples" page (found.html). Plain JS, no dependencies.
   Reads examples/found.json (post IDs, URLs and our own one-line introductions only).
   Every post is shown as an X embed: widgets.js is loaded once, and each post is drawn with
   twttr.widgets.createTweet() as its card comes near the viewport. */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var root = document.documentElement;
  var WIDGETS = 'https://platform.twitter.com/widgets.js';

  var I18N = {
    'zh-Hans': {
      "title": "社区案例｜Motion Prompt",
      "skip": "跳转到案例列表",
      "navLabel": "站内导航",
      "navGallery": "示例库",
      "navFound": "社区案例",
      "langLabel": "语言",
      "themeToDark": "切换到深色模式",
      "themeToLight": "切换到浅色模式",
      "eyebrow": "社区案例",
      "h1": "用术语和示例建立共同语言",
      "lead": "这里收录了创作者发布的术语、动态示例和速查表，涉及不同领域、语言与风格。我们选择由投稿者自行制作示例的帖子，帖子内容及相关权利属于各位作者。",
      "leadNote": "被收录不代表作者为本站背书。案例介绍由本站撰写。",
      "noteH": "关于嵌入内容",
      "noteP": "本页通过 X（原 Twitter）嵌入展示帖子。打开后将从 X 服务器加载内容并使用 X Cookie。X 可能记录浏览情况并将其用于广告。嵌入时已设置 dnt，请求 X 不将此次访问用于个性化推荐。",
      "notePrivacy": "X 隐私政策",
      "noteCookies": "X 的 Cookie 使用说明",
      "listH": "案例列表",
      "loadListFailed": "案例列表加载失败。",
      "emptyList": "暂无社区案例。",
      "count": "{n} 条帖子",
      "postLang": {
        "ja": "日语",
        "en": "英语"
      },
      "postLangLabel": "帖子语言：{l}",
      "viewOnX": "在 X 上查看",
      "viewOnXLabel": "在 X 上查看 {a} 的帖子",
      "loading": "正在加载…",
      "gone": "无法显示此帖子，可能已被删除。",
      "failed": "无法从 X 加载内容，可能被内容拦截工具阻止。你仍可点击“在 X 上查看”打开原帖。",
      "shown": "已显示 {a} 的帖子",
      "moreH": "分享你发现的案例",
      "recH": "推荐帖子，也欢迎自荐",
      "recP": "如果发现以示例讲解术语的帖子，欢迎通过 GitHub Issue 推荐，也可以推荐自己的作品。本站只嵌入帖子并提供链接，不复制图片或视频。",
      "recLink": "推荐案例（GitHub Issue）",
      "rmH": "申请移除帖子",
      "rmP": "如需移除自己的帖子或更正介绍，请通过 Issue 表单申请，核实后会尽快处理。",
      "rmLink": "申请删除或更正（GitHub Issue）",
      "author": "作者",
      "authorName": "Shohei Ohtaki",
      "whyLink": "创作缘由",
      "makeLink": "制作自己的领域或语言版本",
      "addLink": "贡献你所在领域的术语",
      "listLink": "术语列表",
      "removeP1": "如需删除或更正收录内容，请使用",
      "removeLink": "GitHub Issue 表单",
      "removeP2": "提交申请，核实后会尽快处理。",
      "thanks1": "动态示例配合可复制提示词的形式受到",
      "thanks2": "的启发，感谢原作者。"
    },
    en: {
      title: 'Examples — Motion Prompt',
      skip: 'Skip to the examples', navLabel: 'Site', navGallery: 'Gallery', navFound: 'Examples', langLabel: 'Language',
      themeToDark: 'Switch to dark mode', themeToLight: 'Switch to light mode',
      eyebrow: 'Examples we found',
      h1: 'People building a common language with names and samples',
      lead: 'Posts by people who publish names to use with AI, together with moving samples or cheat sheets. The fields, languages and looks all differ. We pick posts whose samples the author made, and each post and its rights belong to its author.',
      leadNote: 'Being listed here does not mean the author supports this site. The introductions are written by this site.',
      noteH: 'About the embeds',
      noteP: "This page shows each post as an X (formerly Twitter) embed. When you open it, the posts load from X's servers and X cookies are used. X may record the view and use it for ads. The embeds are loaded with the setting that asks X not to use them for personalization (dnt).",
      notePrivacy: 'X Privacy Policy', noteCookies: 'How X uses cookies',
      listH: 'Examples', loadListFailed: 'Could not load the list.', emptyList: 'No community examples yet.',
      count: '{n} posts',
      postLang: { ja: 'Japanese', en: 'English' },
      postLangLabel: 'Post language: {l}',
      viewOnX: 'View on X',
      viewOnXLabel: 'View the post by {a} on X',
      loading: 'Loading…',
      gone: 'This post cannot be shown. It may have been deleted.',
      failed: 'Could not load from X. A content blocker may have stopped it. You can still open it with "View on X".',
      shown: 'Showing the post by {a}',
      moreH: 'Know a good one?',
      recH: 'Suggest a post (your own is welcome)',
      recP: 'If you find a post that shares names with samples, tell us in a GitHub issue. It can be your own. We only embed and link to it; images and videos are not copied to this site.',
      recLink: 'Suggest an example (GitHub issue)',
      rmH: 'To have a post removed',
      rmP: 'If you want your post taken off, or an introduction is wrong, use the issue form. We remove it as soon as the request is confirmed.',
      rmLink: 'Ask for a removal or correction (GitHub issue)',
      author: 'by', authorName: 'Shohei Ohtaki',
      whyLink: 'Why I made this', makeLink: 'Make one for your own field or language', addLink: 'Add the names of your field', listLink: 'Name lists (GitHub)',
      removeP1: 'To ask for a removal or a correction, use the ', removeLink: 'issue form on GitHub', removeP2: '. We act on it once the request is confirmed.',
      thanks1: 'The format — moving samples with a prompt you can copy — was inspired by', thanks2: '. Thank you.',
    },
  };

  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) { /* private mode etc. */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } },
  };
  var darkQuery = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : { matches: false };
  var state = { lang: root.lang === 'en' ? 'en' : 'zh-Hans', data: null };
  var cards = [];   // { item, el, box, status, shown, token }

  function t(key, vars) {
    var s = I18N[state.lang][key];
    if (s == null) s = I18N.en[key];
    if (s == null) s = key;
    if (vars && typeof s === 'string') Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    return s;
  }
  function h(tag, attrs, kids) {
    var n = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) {
      if (k === 'class') n.className = attrs[k];
      else if (k === 'text') n.textContent = attrs[k];
      else n.setAttribute(k, attrs[k]);
    });
    (kids || []).forEach(function (c) { if (c) n.appendChild(c); });
    return n;
  }
  function say(msg) { var l = $('#live'); l.textContent = ''; setTimeout(function () { l.textContent = msg; }, 30); }
  function isDark() {
    var a = root.getAttribute('data-theme');
    return a ? a === 'dark' : darkQuery.matches;
  }

  // ------------------------------------------------------------------ X widgets
  var widgetsPromise = null;
  function loadWidgets() {
    if (widgetsPromise) return widgetsPromise;
    widgetsPromise = new Promise(function (resolve, reject) {
      if (window.twttr && window.twttr.widgets && window.twttr.widgets.createTweet) { resolve(window.twttr); return; }
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; reject(new Error('timeout')); } }, 15000);
      var s = document.createElement('script');
      s.id = 'x-wjs'; s.async = true; s.charset = 'utf-8'; s.src = WIDGETS;
      s.onload = function () {
        if (!window.twttr || !window.twttr.ready) { done = true; clearTimeout(timer); reject(new Error('no twttr')); return; }
        window.twttr.ready(function (tw) { if (done) return; done = true; clearTimeout(timer); resolve(tw); });
      };
      s.onerror = function () { if (done) return; done = true; clearTimeout(timer); reject(new Error('blocked')); };
      document.head.appendChild(s);
    });
    widgetsPromise.catch(function () { widgetsPromise = null; var old = $('#x-wjs'); if (old) old.remove(); });
    return widgetsPromise;
  }

  function setStatus(c, key) {
    c.statusKey = key || null;
    c.status.textContent = key ? t(key) : '';
    c.status.hidden = !key;
    c.status.classList.toggle('is-warn', key === 'gone' || key === 'failed');
  }
  function show(c) {
    var token = (c.token || 0) + 1;
    c.token = token;
    c.shown = true;
    c.box.innerHTML = '';
    c.box.hidden = false;
    c.el.classList.add('is-open');
    setStatus(c, 'loading');
    return loadWidgets().then(function (tw) {
      if (c.token !== token) return;
      return tw.widgets.createTweet(c.item.id, c.box, {
        lang: state.lang === 'zh-Hans' ? 'zh-cn' : state.lang, theme: isDark() ? 'dark' : 'light', dnt: true, conversation: 'none', align: 'center',
      }).then(function (el) {
        if (c.token !== token) return;
        if (el) { setStatus(c, null); c.el.classList.remove('is-gone'); }
        else { c.box.innerHTML = ''; c.box.hidden = true; setStatus(c, 'gone'); c.el.classList.add('is-gone'); }
      });
    }).catch(function () {
      if (c.token !== token) return;
      c.box.innerHTML = ''; c.box.hidden = true;
      setStatus(c, 'failed');
    });
  }
  function redrawShown() { cards.forEach(function (c) { if (c.shown) show(c); }); }

  // ------------------------------------------------------------------ list
  function authorHandle(item) { return item.author.replace(/^@/, ''); }
  function build() {
    var wrap = $('#themes');
    wrap.innerHTML = '';
    cards = [];
    var data = state.data;
    data.themes.forEach(function (th) {
      var items = data.items.filter(function (it) { return it.theme === th.slug; });
      if (!items.length) return;
      var hid = 'th-' + th.slug;
      var list = h('ul', { class: 'ex-list' });
      items.forEach(function (it) {
        var handle = authorHandle(it);
        var link = h('a', { class: 'ex-x', href: it.url, rel: 'noopener', 'aria-label': t('viewOnXLabel', { a: it.author }), text: t('viewOnX') });
        var status = h('p', { class: 'ex-status', role: 'status' });
        status.hidden = true;
        var box = h('div', { class: 'ex-embed' });
        box.hidden = true;
        var langName = (t('postLang') || {})[it.lang] || it.lang;
        var li = h('li', { class: 'ex' }, [
          h('div', { class: 'ex-head' }, [
            h('a', { class: 'ex-author', href: 'https://x.com/' + encodeURIComponent(handle), rel: 'noopener', text: it.author }),
            h('span', { class: 'ex-lang', title: t('postLangLabel', { l: langName }), 'aria-label': t('postLangLabel', { l: langName }), text: langName }),
          ]),
          h('p', { class: 'ex-intro', text: (it.intro && (it.intro[state.lang] || it.intro.en)) || '' }),
          h('div', { class: 'ex-act' }, [link]),
          status,
          box,
        ]);
        var c = { item: it, el: li, box: box, status: status, shown: false, token: 0 };
        cards.push(c);
        list.appendChild(li);
      });
      wrap.appendChild(h('section', { class: 'ex-theme', 'aria-labelledby': hid }, [
        h('div', { class: 'pack-h' }, [
          h('h3', { id: hid, text: th[state.lang] || th.en }),
          h('span', { text: t('count', { n: items.length }) }),
        ]),
        list,
      ]));
    });
    $('#f-empty').hidden = cards.length > 0;
    $('#f-empty').textContent = t('emptyList');
    observe();
  }

  // Draw each embed as its card comes near the viewport, so the page opens fast but reads as fully embedded.
  var io = null;
  function observe() {
    if (io) io.disconnect();
    if (!('IntersectionObserver' in window)) { cards.forEach(show); return; }
    io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        var c = cards.filter(function (x) { return x.el === e.target; })[0];
        if (c && !c.shown) show(c);
      });
    }, { rootMargin: '1200px 0px' });
    cards.forEach(function (c) { io.observe(c.el); });
  }

  // ------------------------------------------------------------------ text, language, theme
  function applyText() {
    var lang = state.lang;
    root.lang = lang;
    document.title = t('title');
    $$('[data-t]').forEach(function (n) { n.textContent = t(n.getAttribute('data-t')); });
    $$('[data-t-attr]').forEach(function (n) {
      n.getAttribute('data-t-attr').split(',').forEach(function (pair) {
        var kv = pair.split(':'); n.setAttribute(kv[0].trim(), t(kv[1].trim()));
      });
    });
    $$('[data-lang]').forEach(function (b) { b.setAttribute('aria-pressed', b.getAttribute('data-lang') === lang ? 'true' : 'false'); });
    $$('[data-href-' + lang + ']').forEach(function (a) { a.href = a.getAttribute('data-href-' + lang); });
    applyTheme();
  }
  function applyTheme() { $('#theme').setAttribute('aria-label', t(isDark() ? 'themeToLight' : 'themeToDark')); }
  $$('[data-lang]').forEach(function (b) {
    b.addEventListener('click', function () {
      var lang = b.getAttribute('data-lang');
      if (lang === state.lang) return;
      state.lang = lang;
      store.set('mp-lang', lang);
      var q = new URLSearchParams(location.search);
      if (q.has('lang')) {
        q.set('lang', lang);
        history.replaceState(history.state, '', location.pathname + '?' + q.toString() + location.hash);
      }
      applyText();
      if (state.data) build();  // rebuild redraws the embeds in the new language
    });
  });
  $('#theme').addEventListener('click', function () {
    var next = isDark() ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    store.set('mp-theme', next);
    applyTheme();
    redrawShown();
  });
  if (darkQuery.addEventListener) darkQuery.addEventListener('change', function () {
    applyTheme();
    if (!root.getAttribute('data-theme')) redrawShown();
  });

  // ------------------------------------------------------------------ start
  applyText();
  fetch('examples/found.json', { cache: 'no-cache' })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(function (data) {
      state.data = data;
      build();
    })
    .catch(function () { $('#f-empty').textContent = t('loadListFailed'); $('#f-empty').hidden = false; });
})();
