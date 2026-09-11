// 尹氏家谱 v2.0 - 主应用逻辑
(function () {
  const LS_KEY = 'yin_family_tree_data';
  const LS_AUTH = 'yin_family_auth';
  const LS_LOGIN = 'yin_family_logged_in';
  let resetTreeFn = null;
  const state = {
    family: null,
    online: false
  };

  const $ = id => document.getElementById(id);

  // ---------- 登录系统 ----------
  function getAuth() {
    try { return JSON.parse(localStorage.getItem(LS_AUTH)) || { user: 'admin', pass: 'yin190523' }; }
    catch (e) { return { user: 'admin', pass: 'yin190523' }; }
  }

  function saveAuth(auth) { localStorage.setItem(LS_AUTH, JSON.stringify(auth)); }

  function isLoggedIn() { return localStorage.getItem(LS_LOGIN) === '1'; }

  function setLoggedIn(v) { v ? localStorage.setItem(LS_LOGIN, '1') : localStorage.removeItem(LS_LOGIN); }

  function showLogin() {
    $('loginPage').style.display = 'flex';
    $('app').classList.add('app-hidden');
  }

  function showApp() {
    $('loginPage').style.display = 'none';
    $('app').classList.remove('app-hidden');
    const auth = getAuth();
    $('s_username').value = auth.user;
    $('s_password').value = auth.pass;
  }

  function handleLogin(e) {
    e.preventDefault();
    const user = $('loginUser').value.trim();
    const pass = $('loginPass').value.trim();
    const auth = getAuth();
    if (user === auth.user && pass === auth.pass) {
      setLoggedIn(true);
      $('loginUser').value = '';
      $('loginPass').value = '';
      showApp();
      refreshAll();
    } else {
      alert('用户名或密码不正确');
    }
  }

  function handleLogout() {
    if (!confirm('确定退出登录吗？')) return;
    setLoggedIn(false);
    showLogin();
  }

  function changePass() {
    const user = $('s_username').value.trim();
    const pass = $('s_password').value.trim();
    if (!user || !pass) { alert('用户名和密码不能为空'); return; }
    saveAuth({ user, pass });
    alert('账号信息已保存');
  }

  // ---------- 数据加载 ----------
  function defaultFamily() {
    return { clan: { name: '尹氏家族', surname: '尹', updatedAt: null }, members: [] };
  }

  function loadLocal() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }

  function saveLocal() { localStorage.setItem(LS_KEY, JSON.stringify(state.family)); }

  function init() {
    bindEvents();
    if (isLoggedIn()) {
      showApp();
      state.family = loadLocal() || defaultFamily();
      document.title = state.family.clan.name + ' · 家谱';
      setSync('offline', '本地模式');
      refreshAll();
    } else {
      showLogin();
    }
  }

  function setSync(cls, text) {
    const el = $('syncStatus');
    el.className = 'sync-status ' + cls;
    el.textContent = '● ' + text;
  }

  // ---------- 渲染 ----------
  function refreshAll() {
    $('clanTitle').textContent = state.family.clan.name;
    renderTree();
    renderMembers();
    fillFormSelects();
  }

  function renderTree() {
    const svg = $('treeSvg');
    const wrap = $('treeWrap');
    Tree.render(svg, state.family, id => openMember(id));
    resetTreeFn = Tree.enablePanZoom(wrap, svg);
    $('btnResetTree').onclick = () => resetTreeFn && resetTreeFn();
  }

  function renderMembers() {
    const keyword = ($('searchInput') ? $('searchInput').value : '').trim().toLowerCase();
    let list = state.family.members.slice().sort((a, b) => (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh'));
    if (keyword) {
      list = list.filter(m =>
        (m.name || '').toLowerCase().includes(keyword) ||
        (m.alias || '').toLowerCase().includes(keyword) ||
        (m.branch || '').toLowerCase().includes(keyword)
      );
    }
    const box = $('memberList');
    if (!list.length) {
      box.innerHTML = '<p class="hint" style="text-align:center;padding:30px 0">暂无成员，点击右上角「＋ 新增」开始续谱</p>';
      return;
    }
    box.innerHTML = list.map(m => {
      const sub = [m.branch && '房支:' + m.branch, m.birth && '生于' + m.birth, m.death && '卒于' + m.death].filter(Boolean).join(' · ');
      const aliasHtml = m.alias ? `<div class="mi-alias">${m.alias}</div>` : '';
      return `<div class="member-item" data-id="${m.id}">
        <div class="avatar ${m.gender === '女' ? 'female' : ''}">${(m.name || '?').slice(-1)}</div>
        <div class="mi-main">
          <div class="mi-name">${m.name || '未命名'}</div>
          ${aliasHtml}
          <div class="mi-sub">${sub || '—'}</div>
        </div>
        <span class="mi-gen">${m.generation ? '第' + m.generation + '世' : '世数未定'}</span>
      </div>`;
    }).join('');
    box.querySelectorAll('.member-item').forEach(el => {
      el.addEventListener('click', () => openMember(el.dataset.id));
    });
  }

  // ---------- 详情/编辑/删除 ----------
  function getMember(id) { return state.family.members.find(m => m.id === id); }

  function openMember(id) {
    const m = getMember(id);
    if (!m) return;
    const spouse = m.spouseId ? getMember(m.spouseId) : null;
    const father = m.fatherId ? getMember(m.fatherId) : null;
    const rows = [
      ['曾用名', m.alias],
      ['性别', m.gender],
      ['世次', m.generation ? '第' + m.generation + '世' : ''],
      ['房支', m.branch],
      ['父亲', father ? father.name : ''],
      ['配偶', spouse ? spouse.name : ''],
      ['出生', m.birth],
      ['逝世', m.death],
      ['籍贯', m.birthPlace],
      ['安葬', m.burialPlace],
      ['手机', m.phone],
      ['微信', m.wechat],
      ['住址', m.address],
      ['简介', m.bio]
    ];
    $('m_name').textContent = m.name || '未命名';
    $('m_info').innerHTML = rows.filter(r => r[1]).map(r => `<div class="mi-row"><span class="mi-k">${r[0]}</span><span class="mi-v">${r[1]}</span></div>`).join('');
    $('modal').classList.remove('hidden');
    $('btn_editMember').onclick = () => { closeModal(); openForm(m.id); };
    $('btn_delMember').onclick = () => deleteMember(m.id);
    $('btn_closeModal').onclick = closeModal;
  }

  function closeModal() { $('modal').classList.add('hidden'); }

  function deleteMember(id) {
    const m = getMember(id);
    if (!m) return;
    if (!confirm(`确定删除「${m.name}」吗？\n其子女的"父亲"关系将一并解除。`)) return;
    state.family.members = state.family.members.filter(x => x.id !== id);
    state.family.members.forEach(x => {
      if (x.fatherId === id) x.fatherId = null;
      if (x.spouseId === id) x.spouseId = null;
    });
    closeModal();
    persist();
  }

  // ---------- 续谱表单 ----------
  function fillFormSelects() {
    const opts = state.family.members
      .slice()
      .sort((a, b) => (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh'))
      .map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`)
      .join('');
    $('f_father').innerHTML = '<option value="">— 无（始祖/配偶） —</option>' + opts;
    $('f_spouse').innerHTML = '<option value="">— 无 —</option>' + opts;
  }

  function openForm(id) {
    const m = id ? getMember(id) : null;
    $('formTitle').textContent = m ? '续谱 · 编辑成员' : '续谱 · 新增成员';
    $('f_id').value = m ? m.id : '';
    $('f_name').value = m ? m.name : '';
    $('f_alias').value = m ? m.alias || '' : '';
    $('f_gender').value = m ? m.gender : '男';
    $('f_generation').value = m ? m.generation || '' : '';
    $('f_branch').value = m ? m.branch || '' : '';
    $('f_father').value = m && m.fatherId ? m.fatherId : '';
    $('f_spouse').value = m && m.spouseId ? m.spouseId : '';
    $('f_birth').value = m ? m.birth || '' : '';
    $('f_death').value = m ? m.death || '' : '';
    $('f_birthPlace').value = m ? m.birthPlace || '' : '';
    $('f_burialPlace').value = m ? m.burialPlace || '' : '';
    $('f_phone').value = m ? m.phone || '' : '';
    $('f_wechat').value = m ? m.wechat || '' : '';
    $('f_address').value = m ? m.address || '' : '';
    $('f_bio').value = m ? m.bio || '' : '';
    fillFormSelects();
    if (m && m.fatherId) $('f_father').value = m.fatherId;
    if (m && m.spouseId) $('f_spouse').value = m.spouseId;
    switchPage('add');
  }

  function submitForm(e) {
    e.preventDefault();
    const id = $('f_id').value;
    const data = {
      name: $('f_name').value.trim(),
      alias: $('f_alias').value.trim(),
      gender: $('f_gender').value,
      generation: parseInt($('f_generation').value, 10) || null,
      branch: $('f_branch').value.trim(),
      fatherId: $('f_father').value || null,
      spouseId: $('f_spouse').value || null,
      birth: $('f_birth').value.trim(),
      death: $('f_death').value.trim(),
      birthPlace: $('f_birthPlace').value.trim(),
      burialPlace: $('f_burialPlace').value.trim(),
      phone: $('f_phone').value.trim(),
      wechat: $('f_wechat').value.trim(),
      address: $('f_address').value.trim(),
      bio: $('f_bio').value.trim()
    };
    if (!data.name) { alert('请填写姓名'); return; }
    if (id) {
      const m = getMember(id);
      Object.assign(m, data);
    } else {
      if (data.fatherId === data.id) return;
      data.id = 'm' + Date.now();
      state.family.members.push(data);
    }
    persist();
    switchPage('members');
  }

  // ---------- 持久化 ----------
  function persist() {
    saveLocal();
    setSync('offline', '本地保存');
    refreshAll();
  }

  // ---------- 设置页 ----------
  function resetLocal() {
    if (!confirm('将清空本机缓存数据。确定继续？')) return;
    localStorage.removeItem(LS_KEY);
    state.family = defaultFamily();
    saveLocal();
    refreshAll();
    setSync('offline', '已重置');
  }

  // ---------- 页面切换 ----------
  function switchPage(name) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    $('page-' + name).classList.add('active');
    document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.page === name));
  }

  // ---------- 事件绑定 ----------
  function bindEvents() {
    $('loginForm').addEventListener('submit', handleLogin);
    $('btnLogout').addEventListener('click', handleLogout);
    $('btnChangePass').addEventListener('click', changePass);
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchPage(t.dataset.page));
    });
    $('memberForm').addEventListener('submit', submitForm);
    $('btnCancelForm').addEventListener('click', () => switchPage('members'));
    $('btnAddQuick').addEventListener('click', () => openForm(null));
    $('searchInput').addEventListener('input', renderMembers);
    $('btn_exportJson').addEventListener('click', () => FamilyExport.exportJSON(state.family));
    $('btn_importJson').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('导入将覆盖当前族谱数据，确定继续？')) { e.target.value = ''; return; }
      FamilyExport.importJSON(file).then(data => {
        state.family = data;
        persist();
        e.target.value = '';
      }).catch(err => { alert(err.message); e.target.value = ''; });
    });
    $('btn_print').addEventListener('click', () => FamilyExport.printFamily(state.family));
    $('btn_resetLocal').addEventListener('click', resetLocal);
  }

  document.addEventListener('DOMContentLoaded', init);
})();