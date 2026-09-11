// 尹氏家谱 v3.0 - 主应用逻辑（多用户+房支权限）
(function () {
  const LS_KEY = 'yin_family_tree_data';
  const LS_USERS = 'yin_family_users';
  const LS_SESSION = 'yin_family_session';
  let resetTreeFn = null;
  const state = { family: null, currentUser: null };

  const $ = id => document.getElementById(id);

  // ---------- 用户系统 ----------
  // 用户结构：{ user, pass, role: 'admin'|'user', branch: '长房'|null }
  function getUsers() {
    try {
      const users = JSON.parse(localStorage.getItem(LS_USERS));
      if (users && users.length) return users;
    } catch (e) {}
    return [{ user: 'admin', pass: 'yin190523', role: 'admin', branch: null }];
  }

  function saveUsers(users) { localStorage.setItem(LS_USERS, JSON.stringify(users)); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch (e) { return null; }
  }

  function setSession(s) { s ? localStorage.setItem(LS_SESSION, JSON.stringify(s)) : localStorage.removeItem(LS_SESSION); }

  function isAdmin() { return state.currentUser && state.currentUser.role === 'admin'; }

  function getUserBranch() { return state.currentUser ? state.currentUser.branch : null; }

  // ---------- 登录/注册 ----------
  function showLogin() {
    $('loginPage').style.display = 'flex';
    $('app').classList.add('app-hidden');
    showLoginForm();
  }

  function showLoginForm() {
    $('loginForm').style.display = '';
    $('registerForm').style.display = 'none';
    $('switchToReg').style.display = '';
    $('switchToLogin').style.display = 'none';
  }

  function showRegisterForm() {
    $('loginForm').style.display = 'none';
    $('registerForm').style.display = '';
    $('switchToReg').style.display = 'none';
    $('switchToLogin').style.display = '';
  }

  function showApp() {
    $('loginPage').style.display = 'none';
    $('app').classList.remove('app-hidden');
    updateUIForRole();
  }

  function updateUIForRole() {
    if (!state.currentUser) return;
    const u = state.currentUser;
    $('userBadge').textContent = u.role === 'admin' ? '管理员' : (u.branch || '用户');
    $('userBadge').className = 'user-badge' + (u.role === 'admin' ? ' admin' : '');

    // 管理员能看到所有功能，普通用户隐藏用户管理和账号管理
    $('cardUsers').style.display = isAdmin() ? '' : 'none';
    $('cardAccount').style.display = isAdmin() ? '' : 'none';

    // 普通用户的成员标题显示房支
    $('membersTitle').textContent = isAdmin() ? '成员名录' : (u.branch ? u.branch + '成员' : '成员名录');

    // 普通用户续谱时房支自动锁定
    const branchInput = $('f_branch');
    if (!isAdmin() && u.branch) {
      branchInput.value = u.branch;
      branchInput.readOnly = true;
      branchInput.style.background = '#f0ebe1';
      branchInput.style.color = '#999';
    } else {
      branchInput.readOnly = false;
      branchInput.style.background = '';
      branchInput.style.color = '';
    }

    if (isAdmin()) {
      $('s_username').value = u.user;
      $('s_password').value = u.pass;
    }
    renderUserList();
  }

  function handleLogin(e) {
    e.preventDefault();
    const user = $('loginUser').value.trim();
    const pass = $('loginPass').value.trim();
    const users = getUsers();
    const found = users.find(u => u.user === user && u.pass === pass);
    if (found) {
      state.currentUser = found;
      setSession({ user: found.user });
      $('loginUser').value = '';
      $('loginPass').value = '';
      showApp();
      state.family = loadLocal() || defaultFamily();
      document.title = state.family.clan.name + ' · 家谱';
      setSync('offline', '本地模式');
      refreshAll();
    } else {
      alert('用户名或密码不正确');
    }
  }

  function handleRegister(e) {
    e.preventDefault();
    const user = $('regUser').value.trim();
    const pass = $('regPass').value.trim();
    const branch = $('regBranch').value.trim();
    if (!user || !pass || !branch) { alert('请填写所有字段'); return; }
    const users = getUsers();
    if (users.find(u => u.user === user)) { alert('该用户名已存在'); return; }
    const newUser = { user, pass, role: 'user', branch };
    users.push(newUser);
    saveUsers(users);
    state.currentUser = newUser;
    setSession({ user: newUser.user });
    $('regUser').value = ''; $('regPass').value = ''; $('regBranch').value = '';
    alert('注册成功！您只能管理「' + branch + '」的成员');
    showApp();
    state.family = loadLocal() || defaultFamily();
    document.title = state.family.clan.name + ' · 家谱';
    setSync('offline', '本地模式');
    refreshAll();
  }

  function handleLogout() {
    if (!confirm('确定退出登录吗？')) return;
    state.currentUser = null;
    setSession(null);
    showLogin();
  }

  function changePass() {
    if (!isAdmin()) return;
    const user = $('s_username').value.trim();
    const pass = $('s_password').value.trim();
    if (!user || !pass) { alert('用户名和密码不能为空'); return; }
    const users = getUsers();
    const admin = users.find(u => u.role === 'admin');
    if (admin) { admin.user = user; admin.pass = pass; }
    saveUsers(users);
    state.currentUser = admin;
    setSession({ user: admin.user });
    alert('账号信息已保存');
    updateUIForRole();
  }

  function deleteUser(username) {
    if (!isAdmin()) return;
    if (username === 'admin') { alert('不能删除管理员账号'); return; }
    if (!confirm('确定删除用户「' + username + '」吗？')) return;
    const users = getUsers().filter(u => u.user !== username);
    saveUsers(users);
    renderUserList();
  }

  function renderUserList() {
    if (!isAdmin()) return;
    const users = getUsers();
    const html = users.map(u => {
      const isMe = state.currentUser && state.currentUser.user === u.user;
      const delBtn = u.role !== 'admin' && !isMe
        ? `<button class="btn small danger" onclick="window._app.deleteUser('${u.user}')">删除</button>` : '';
      const roleLabel = u.role === 'admin' ? '管理员' : (u.branch || '普通用户');
      return `<div class="user-item">
        <div class="user-info"><b>${u.user}</b> <span class="hint">${roleLabel}</span></div>
        ${delBtn}
      </div>`;
    }).join('');
    $('userList').innerHTML = html;
  }

  // ---------- 权限过滤 ----------
  function getVisibleMembers() {
    if (isAdmin()) return state.family.members;
    const branch = getUserBranch();
    if (!branch) return state.family.members;
    return state.family.members.filter(m => !m.branch || m.branch === branch);
  }

  function canEditMember(m) {
    if (isAdmin()) return true;
    const branch = getUserBranch();
    if (!branch) return true;
    return !m.branch || m.branch === branch;
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
    const session = getSession();
    if (session) {
      const users = getUsers();
      const u = users.find(x => x.user === session.user);
      if (u) {
        state.currentUser = u;
        showApp();
        state.family = loadLocal() || defaultFamily();
        document.title = state.family.clan.name + ' · 家谱';
        setSync('offline', '本地模式');
        refreshAll();
        return;
      }
    }
    showLogin();
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
    // 普通用户只看本房支的树
    const visibleData = { clan: state.family.clan, members: getVisibleMembers() };
    Tree.render(svg, visibleData, id => openMember(id));
    resetTreeFn = Tree.enablePanZoom(wrap, svg);
    $('btnResetTree').onclick = () => resetTreeFn && resetTreeFn();
  }

  function renderMembers() {
    const keyword = ($('searchInput') ? $('searchInput').value : '').trim().toLowerCase();
    let list = getVisibleMembers().slice().sort((a, b) => (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh'));
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
    if (!canEditMember(m)) { alert('您只能查看本房支的成员信息'); return; }
    const spouse = m.spouseId ? getMember(m.spouseId) : null;
    const father = m.fatherId ? getMember(m.fatherId) : null;
    const rows = [
      ['曾用名', m.alias], ['性别', m.gender],
      ['世次', m.generation ? '第' + m.generation + '世' : ''],
      ['房支', m.branch], ['父亲', father ? father.name : ''],
      ['配偶', spouse ? spouse.name : ''],
      ['出生', m.birth], ['逝世', m.death],
      ['籍贯', m.birthPlace], ['安葬', m.burialPlace],
      ['手机', m.phone], ['微信', m.wechat],
      ['住址', m.address], ['简介', m.bio]
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
    if (!canEditMember(m)) { alert('您没有权限删除此成员'); return; }
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
    const visible = getVisibleMembers();
    const opts = visible
      .slice()
      .sort((a, b) => (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh'))
      .map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`)
      .join('');
    $('f_father').innerHTML = '<option value="">— 无（始祖/配偶） —</option>' + opts;
    $('f_spouse').innerHTML = '<option value="">— 无 —</option>' + opts;
  }

  function openForm(id) {
    const m = id ? getMember(id) : null;
    if (id && m && !canEditMember(m)) { alert('您没有权限编辑此成员'); return; }
    $('formTitle').textContent = m ? '续谱 · 编辑成员' : '续谱 · 新增成员';
    $('f_id').value = m ? m.id : '';
    $('f_name').value = m ? m.name : '';
    $('f_alias').value = m ? m.alias || '' : '';
    $('f_gender').value = m ? m.gender : '男';
    $('f_generation').value = m ? m.generation || '' : '';
    $('f_branch').value = m ? m.branch || '' : '';
    // 普通用户自动填入房支并锁定
    if (!isAdmin() && state.currentUser && state.currentUser.branch) {
      $('f_branch').value = state.currentUser.branch;
    }
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
    updateUIForRole();
    switchPage('add');
  }

  function submitForm(e) {
    e.preventDefault();
    const id = $('f_id').value;
    let branch = $('f_branch').value.trim();
    // 普通用户强制使用自己的房支
    if (!isAdmin() && state.currentUser && state.currentUser.branch) {
      branch = state.currentUser.branch;
    }
    const data = {
      name: $('f_name').value.trim(),
      alias: $('f_alias').value.trim(),
      gender: $('f_gender').value,
      generation: parseInt($('f_generation').value, 10) || null,
      branch: branch,
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
      if (!canEditMember(m)) { alert('没有权限'); return; }
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
    if (!isAdmin()) { alert('只有管理员可以重置数据'); return; }
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
    $('registerForm').addEventListener('submit', handleRegister);
    $('switchToReg').addEventListener('click', showRegisterForm);
    $('switchToLogin').addEventListener('click', showLoginForm);
    $('btnLogout').addEventListener('click', handleLogout);
    $('btnChangePass').addEventListener('click', changePass);
    document.querySelectorAll('.tab').forEach(t => {
      t.addEventListener('click', () => switchPage(t.dataset.page));
    });
    $('memberForm').addEventListener('submit', submitForm);
    $('btnCancelForm').addEventListener('click', () => switchPage('members'));
    $('btnAddQuick').addEventListener('click', () => openForm(null));
    $('searchInput').addEventListener('input', renderMembers);
    $('btn_exportJson').addEventListener('click', () => { if (isAdmin()) FamilyExport.exportJSON(state.family); else alert('只有管理员可以导出'); });
    $('btn_importJson').addEventListener('change', e => {
      if (!isAdmin()) { alert('只有管理员可以导入'); e.target.value = ''; return; }
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('导入将覆盖当前族谱数据，确定继续？')) { e.target.value = ''; return; }
      FamilyExport.importJSON(file).then(data => {
        state.family = data; persist(); e.target.value = '';
      }).catch(err => { alert(err.message); e.target.value = ''; });
    });
    $('btn_print').addEventListener('click', () => FamilyExport.printFamily({ clan: state.family.clan, members: getVisibleMembers() }));
    $('btn_resetLocal').addEventListener('click', resetLocal);
    // 暴露 deleteUser 给内联 onclick
    window._app = { deleteUser };
  }

  document.addEventListener('DOMContentLoaded', init);
})();