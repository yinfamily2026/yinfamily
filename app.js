// 尹氏家谱 v7.0 - 主应用逻辑（云端同步 + 家族密码 + 离异/现配）
(function () {
  const LS_KEY = 'yin_family_tree_data';
  const LS_USERS = 'yin_family_users';
  const LS_SESSION = 'yin_family_session';
  const LS_GATE = 'yin_family_gate_passed';
  const LS_GATE_PASS = 'yin_family_gate_pass';

  // ---------- Supabase 云端配置 ----------
  const CLOUD_URL = 'https://khfcmukoxjntzsyfqzwv.supabase.co/rest/v1';
  const CLOUD_KEY = 'sb_publishable_HRV-ov-TvRFCX_uIWJshDQ_beHbL5sw';

  // 默认家族访问密码
  const DEFAULT_GATE_PASS = 'yin2026';

  let resetTreeFn = null;
  let autoSaveTimer = null;
  let cloudSyncing = false;
  const state = { family: null, currentUser: null };

  const $ = id => document.getElementById(id);

  // ---------- 家族访问密码门 ----------
  function getGatePass() {
    return localStorage.getItem(LS_GATE_PASS) || DEFAULT_GATE_PASS;
  }

  function isGatePassed() {
    return localStorage.getItem(LS_GATE) === 'yes';
  }

  function showGate() {
    $('gatePage').style.display = 'flex';
    $('loginPage').style.display = 'none';
    $('app').classList.add('app-hidden');
  }

  function handleGate(e) {
    e.preventDefault();
    const pass = $('gatePass').value.trim();
    if (pass === getGatePass()) {
      localStorage.setItem(LS_GATE, 'yes');
      $('gatePass').value = '';
      $('gatePage').style.display = 'none';
      showLogin();
    } else {
      alert('访问密码不正确');
    }
  }

  function changeGatePass() {
    if (!isAdmin()) { alert('只有管理员可以修改访问密码'); return; }
    const pass = $('s_gatePass').value.trim();
    if (!pass) { alert('请输入新密码'); return; }
    localStorage.setItem(LS_GATE_PASS, pass);
    alert('家族访问密码已更新');
    $('s_gatePass').value = '';
  }

  // ---------- 云端同步 ----------
  async function cloudFetch() {
    try {
      const res = await fetch(CLOUD_URL + '/family_tree?select=data&id=eq.1', {
        headers: { apikey: CLOUD_KEY, Authorization: 'Bearer ' + CLOUD_KEY }
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const rows = await res.json();
      return rows && rows.length ? rows[0].data : null;
    } catch (e) {
      console.warn('云端读取失败：', e.message);
      return null;
    }
  }

  async function cloudSave(data) {
    if (cloudSyncing) return false;
    cloudSyncing = true;
    try {
      const res = await fetch(CLOUD_URL + '/family_tree?id=eq.1', {
        method: 'PATCH',
        headers: {
          apikey: CLOUD_KEY,
          Authorization: 'Bearer ' + CLOUD_KEY,
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify({ data: data })
      });
      return res.ok;
    } catch (e) {
      console.warn('云端保存失败：', e.message);
      return false;
    } finally {
      cloudSyncing = false;
    }
  }

  // ---------- 用户系统 ----------
  function getUsers() {
    try {
      const users = JSON.parse(localStorage.getItem(LS_USERS));
      if (users && users.length) return users;
    } catch (e) {}
    return [{ user: 'admin', pass: 'yin190523', role: 'admin' }];
  }

  function saveUsers(users) { localStorage.setItem(LS_USERS, JSON.stringify(users)); }

  function getSession() {
    try { return JSON.parse(localStorage.getItem(LS_SESSION)); } catch (e) { return null; }
  }

  function setSession(s) { s ? localStorage.setItem(LS_SESSION, JSON.stringify(s)) : localStorage.removeItem(LS_SESSION); }

  function isAdmin() { return state.currentUser && state.currentUser.role === 'admin'; }

  // ---------- 登录/注册 ----------
  function showLogin() {
    $('gatePage').style.display = 'none';
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
    $('gatePage').style.display = 'none';
    $('loginPage').style.display = 'none';
    $('app').classList.remove('app-hidden');
    updateUIForRole();
  }

  function updateUIForRole() {
    if (!state.currentUser) return;
    const u = state.currentUser;
    $('userBadge').textContent = u.role === 'admin' ? '管理员' : '族人';
    $('userBadge').className = 'user-badge' + (u.role === 'admin' ? ' admin' : '');
    $('cardUsers').style.display = isAdmin() ? '' : 'none';
    $('cardAccount').style.display = isAdmin() ? '' : 'none';
    $('cardGate').style.display = isAdmin() ? '' : 'none';
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
      setSync('offline', '正在连接云端...');
      refreshAll();
      loadFromCloud();
    } else {
      alert('用户名或密码不正确');
    }
  }

  function handleRegister(e) {
    e.preventDefault();
    const user = $('regUser').value.trim();
    const pass = $('regPass').value.trim();
    if (!user || !pass) { alert('请填写用户名和密码'); return; }
    const users = getUsers();
    if (users.find(u => u.user === user)) { alert('该用户名已存在'); return; }
    const newUser = { user, pass, role: 'user' };
    users.push(newUser);
    saveUsers(users);
    state.currentUser = newUser;
    setSession({ user: newUser.user });
    $('regUser').value = ''; $('regPass').value = '';
    alert('注册成功！您可以查看族谱和续谱');
    showApp();
    state.family = loadLocal() || defaultFamily();
    document.title = state.family.clan.name + ' · 家谱';
    setSync('offline', '正在连接云端...');
    refreshAll();
    loadFromCloud();
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
      const roleLabel = u.role === 'admin' ? '管理员' : '族人';
      return `<div class="user-item">
        <div class="user-info"><b>${u.user}</b> <span class="hint">${roleLabel}</span></div>
        ${delBtn}
      </div>`;
    }).join('');
    $('userList').innerHTML = html;
  }

  // ---------- 权限 ----------
  function canEdit() { return !!state.currentUser; }
  function canAdd() { return !!state.currentUser; }

  // ---------- 排行选项动态生成 ----------
  function updateBirthOrderOptions() {
    const gender = $('f_gender').value;
    const sel = $('f_birthOrder');
    const currentVal = sel.value;
    let opts = '<option value="">— 不指定 —</option>';
    if (gender === '女') {
      opts += '<option value="1">长女</option><option value="2">次女</option><option value="3">三女</option><option value="4">四女</option><option value="5">五女</option><option value="6">六女</option><option value="7">七女</option><option value="8">八女</option><option value="9">九女</option>';
    } else {
      opts += '<option value="1">长子</option><option value="2">次子</option><option value="3">三子</option><option value="4">四子</option><option value="5">五子</option><option value="6">六子</option><option value="7">七子</option><option value="8">八子</option><option value="9">九子</option>';
    }
    sel.innerHTML = opts;
    sel.value = currentVal;
  }

  // ---------- 传统称呼计算 ----------
  function getBirthOrderName(member) {
    if (!member.birthOrder) return '';
    const order = parseInt(member.birthOrder, 10);
    const male = member.gender !== '女';
    const names = male
      ? ['', '长子', '次子', '三子', '四子', '五子', '六子', '七子', '八子', '九子']
      : ['', '长女', '次女', '三女', '四女', '五女', '六女', '七女', '八女', '九女'];
    return names[order] || '';
  }

  // ---------- 亲属关系获取 ----------
  function getBrothers(member) {
    if (!member) return [];
    const all = state.family.members;
    const byId = new Map(all.map(m => [m.id, m]));
    let bros = [];
    if (member.brotherIds && member.brotherIds.length) {
      bros = member.brotherIds.map(id => byId.get(id)).filter(Boolean);
    }
    if (member.fatherId) {
      all.forEach(m => {
        if (m.id !== member.id && m.fatherId === member.fatherId && m.gender !== '女' && !bros.find(b => b.id === m.id)) {
          bros.push(m);
        }
      });
    }
    return bros;
  }

  function getSisters(member) {
    if (!member) return [];
    const all = state.family.members;
    const byId = new Map(all.map(m => [m.id, m]));
    let sis = [];
    if (member.sisterIds && member.sisterIds.length) {
      sis = member.sisterIds.map(id => byId.get(id)).filter(Boolean);
    }
    if (member.fatherId) {
      all.forEach(m => {
        if (m.id !== member.id && m.fatherId === member.fatherId && m.gender === '女' && !sis.find(s => s.id === m.id)) {
          sis.push(m);
        }
      });
    }
    return sis;
  }

  function getChildren(member) {
    if (!member) return [];
    return state.family.members.filter(m => m.fatherId === member.id || m.motherId === member.id);
  }

  // ---------- 数据加载 ----------
  function defaultFamily() {
    return { clan: { name: '尹氏家族', surname: '尹', updatedAt: null }, members: [] };
  }

  function loadLocal() {
    try { const raw = localStorage.getItem(LS_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
    return null;
  }

  async function loadFromCloud() {
    const cloud = await cloudFetch();
    if (cloud && cloud.members) {
      if (cloud.members.length || !(state.family.members && state.family.members.length)) {
        state.family = cloud;
      } else {
        cloudSave(state.family);
      }
      localStorage.setItem(LS_KEY, JSON.stringify(state.family));
      document.title = state.family.clan.name + ' · 家谱';
      setSync('online', '云端已同步 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      refreshAll();
      return;
    }
    setSync('offline', '本地模式');
  }

  // ---------- 自动保存 ----------
  function saveLocal() {
    localStorage.setItem(LS_KEY, JSON.stringify(state.family));
    const t = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setSync('online', '已保存 ' + t);
    cloudSave(state.family).then(ok => {
      if (ok) setSync('online', '云端已保存 ' + new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }));
      else setSync('offline', '已存本地（云端未连接）');
    });
  }

  function autoSave() {
    if (autoSaveTimer) clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      saveLocal();
      refreshAll();
    }, 800);
  }

  // ---------- 初始化 ----------
  function init() {
    bindEvents();
    // 先检查家族访问密码门
    if (!isGatePassed()) {
      showGate();
      return;
    }
    const session = getSession();
    if (session) {
      const users = getUsers();
      const u = users.find(x => x.user === session.user);
      if (u) {
        state.currentUser = u;
        showApp();
        state.family = loadLocal() || defaultFamily();
        document.title = state.family.clan.name + ' · 家谱';
        setSync('offline', '正在连接云端...');
        refreshAll();
        loadFromCloud();
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
    // 世系自动排序：按 generation 排序后再传给 Tree
    const sortedMembers = state.family.members.slice().sort((a, b) => {
      const ga = a.generation || 99;
      const gb = b.generation || 99;
      if (ga !== gb) return ga - gb;
      return a.name.localeCompare(b.name, 'zh');
    });
    Tree.render(svg, { clan: state.family.clan, members: sortedMembers }, id => openMember(id));
    resetTreeFn = Tree.enablePanZoom(wrap, svg);
    $('btnResetTree').onclick = () => resetTreeFn && resetTreeFn();
  }

  function renderMembers() {
    const keyword = ($('searchInput') ? $('searchInput').value : '').trim().toLowerCase();
    let list = state.family.members.slice().sort((a, b) => {
      const g = (a.generation - b.generation) || 0;
      if (g !== 0) return g;
      const gd = (a.gender === '女' ? 1 : 0) - (b.gender === '女' ? 1 : 0);
      if (gd !== 0) return gd;
      const oa = parseInt(a.birthOrder, 10) || 99;
      const ob = parseInt(b.birthOrder, 10) || 99;
      if (oa !== ob) return oa - ob;
      return a.name.localeCompare(b.name, 'zh');
    });
    if (keyword) {
      list = list.filter(m =>
        (m.name || '').toLowerCase().includes(keyword) ||
        (m.alias || '').toLowerCase().includes(keyword) ||
        String(m.generation || '').includes(keyword)
      );
    }
    const box = $('memberList');
    if (!list.length) {
      box.innerHTML = '<p class="hint" style="text-align:center;padding:30px 0">暂无成员，点击右上角「＋ 新增」开始续谱</p>';
      return;
    }
    box.innerHTML = list.map(m => {
      const orderName = getBirthOrderName(m);
      const sub = [orderName, m.birth && '生于' + m.birth, m.death && '卒于' + m.death].filter(Boolean).join(' · ');
      const aliasHtml = m.alias ? `<div class="mi-alias">${m.alias}</div>` : '';
      return `<div class="member-item" data-id="${m.id}">
        <div class="avatar ${m.gender === '女' ? 'female' : ''}">${(m.name || '?').slice(-1)}</div>
        <div class="mi-main">
          <div class="mi-name">${m.name || '未命名'}${orderName ? '<span class="mi-order">' + orderName + '</span>' : ''}</div>
          ${aliasHtml}
          <div class="mi-sub">${sub || '—'}</div>
        </div>
        <span class="mi-gen">${m.generation ? '第' + m.generation + '世' : '世次未定'}</span>
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
    const exSpouse = m.exSpouseId ? getMember(m.exSpouseId) : null;
    const father = m.fatherId ? getMember(m.fatherId) : null;
    const mother = m.motherId ? getMember(m.motherId) : null;
    const brothers = getBrothers(m);
    const sisters = getSisters(m);
    const children = getChildren(m);
    const orderName = getBirthOrderName(m);
    const maritalMap = { married: '已婚', divorced: '已离异', remarried: '再婚', widowed: '丧偶' };

    const rows = [
      ['曾用名', m.alias], ['性别', m.gender],
      ['世次', m.generation ? '第' + m.generation + '世' : ''],
      ['排行', orderName],
      ['父亲', father ? father.name : ''],
      ['母亲', mother ? mother.name : ''],
      ['原配', exSpouse ? exSpouse.name : ''],
      ['现配', spouse ? spouse.name : ''],
      ['婚姻', maritalMap[m.marital] || ''],
      ['兄弟', brothers.length ? brothers.map(b => b.name).join('、') : ''],
      ['姐妹', sisters.length ? sisters.map(s => s.name).join('、') : ''],
      ['子女', children.length ? children.map(c => c.name).join('、') : ''],
      ['出生', m.birth], ['逝世', m.death],
      ['籍贯', m.birthPlace], ['安葬', m.burialPlace],
      ['微信', m.wechat], ['住址', m.address], ['简介', m.bio]
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
    if (!canEdit()) { alert('只有管理员可以删除成员'); return; }
    if (!confirm(`确定删除「${m.name}」吗？\n其子女的"父亲"关系将一并解除。`)) return;
    state.family.members = state.family.members.filter(x => x.id !== id);
    state.family.members.forEach(x => {
      if (x.fatherId === id) x.fatherId = null;
      if (x.motherId === id) x.motherId = null;
      if (x.spouseId === id) x.spouseId = null;
      if (x.exSpouseId === id) x.exSpouseId = null;
      if (x.brotherIds) x.brotherIds = x.brotherIds.filter(b => b !== id);
      if (x.sisterIds) x.sisterIds = x.sisterIds.filter(s => s !== id);
    });
    closeModal();
    autoSave();
  }

  // ---------- 续谱表单 ----------
  function fillFormSelects() {
    const all = state.family.members;
    const males = all.filter(m => m.gender !== '女');
    const females = all.filter(m => m.gender === '女');
    const sortFn = (a, b) => (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh');
    const allOpts = all.slice().sort(sortFn).map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`).join('');
    $('f_father').innerHTML = '<option value="">— 无（始祖） —</option>' + males.slice().sort(sortFn).map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`).join('');
    $('f_mother').innerHTML = '<option value="">— 无 —</option>' + females.slice().sort(sortFn).map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`).join('');
    $('f_spouse').innerHTML = '<option value="">— 无 —</option>' + allOpts;
    $('f_exSpouse').innerHTML = '<option value="">— 无 —</option>' + allOpts;
    $('f_brothers').innerHTML = males.slice().sort(sortFn).map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`).join('');
    $('f_sisters').innerHTML = females.slice().sort(sortFn).map(m => `<option value="${m.id}">第${m.generation || '?'}世 ${m.name}</option>`).join('');
  }

  function openForm(id) {
    const m = id ? getMember(id) : null;
    if (id && m && !canEdit()) { alert('请先登录'); return; }
    if (!id && !canAdd()) { alert('请先登录'); return; }
    $('formTitle').textContent = m ? '续谱 · 编辑成员' : '续谱 · 新增成员';
    $('f_id').value = m ? m.id : '';
    $('f_name').value = m ? m.name : '';
    $('f_alias').value = m ? m.alias || '' : '';
    $('f_gender').value = m ? m.gender : '男';
    $('f_generation').value = m ? m.generation || '' : '';
    updateBirthOrderOptions();
    $('f_birthOrder').value = m ? m.birthOrder || '' : '';
    $('f_father').value = m && m.fatherId ? m.fatherId : '';
    $('f_mother').value = m && m.motherId ? m.motherId : '';
    $('f_spouse').value = m && m.spouseId ? m.spouseId : '';
    $('f_exSpouse').value = m && m.exSpouseId ? m.exSpouseId : '';
    $('f_marital').value = m && m.marital ? m.marital : '';
    $('f_birth').value = m ? m.birth || '' : '';
    $('f_death').value = m ? m.death || '' : '';
    $('f_birthPlace').value = m ? m.birthPlace || '' : '';
    $('f_burialPlace').value = m ? m.burialPlace || '' : '';
    $('f_wechat').value = m ? m.wechat || '' : '';
    $('f_address').value = m ? m.address || '' : '';
    $('f_bio').value = m ? m.bio || '' : '';
    fillFormSelects();
    if (m && m.fatherId) $('f_father').value = m.fatherId;
    if (m && m.motherId) $('f_mother').value = m.motherId;
    if (m && m.spouseId) $('f_spouse').value = m.spouseId;
    if (m && m.exSpouseId) $('f_exSpouse').value = m.exSpouseId;
    if (m && m.brotherIds) {
      Array.from($('f_brothers').options).forEach(opt => opt.selected = m.brotherIds.includes(opt.value));
    } else {
      Array.from($('f_brothers').options).forEach(opt => opt.selected = false);
    }
    if (m && m.sisterIds) {
      Array.from($('f_sisters').options).forEach(opt => opt.selected = m.sisterIds.includes(opt.value));
    } else {
      Array.from($('f_sisters').options).forEach(opt => opt.selected = false);
    }
    updateUIForRole();
    switchPage('add');
  }

  function submitForm(e) {
    e.preventDefault();
    const id = $('f_id').value;
    if (!state.currentUser) { alert('请先登录后再续谱'); return; }
    const brotherIds = Array.from($('f_brothers').selectedOptions).map(o => o.value).filter(Boolean);
    const sisterIds = Array.from($('f_sisters').selectedOptions).map(o => o.value).filter(Boolean);
    const data = {
      name: $('f_name').value.trim(),
      alias: $('f_alias').value.trim(),
      gender: $('f_gender').value,
      generation: parseInt($('f_generation').value, 10) || null,
      birthOrder: $('f_birthOrder').value || null,
      fatherId: $('f_father').value || null,
      motherId: $('f_mother').value || null,
      spouseId: $('f_spouse').value || null,
      exSpouseId: $('f_exSpouse').value || null,
      marital: $('f_marital').value || null,
      brotherIds: brotherIds,
      sisterIds: sisterIds,
      birth: $('f_birth').value.trim(),
      death: $('f_death').value.trim(),
      birthPlace: $('f_birthPlace').value.trim(),
      burialPlace: $('f_burialPlace').value.trim(),
      wechat: $('f_wechat').value.trim(),
      address: $('f_address').value.trim(),
      bio: $('f_bio').value.trim()
    };
    if (!data.name) { alert('请填写姓名'); return; }
    if (id) {
      const m = getMember(id);
      if (!canEdit()) { alert('没有权限'); return; }
      Object.assign(m, data);
    } else {
      data.id = 'm' + Date.now();
      state.family.members.push(data);
    }
    // 双向同步兄弟关系
    if (brotherIds.length) {
      brotherIds.forEach(bid => {
        const bro = getMember(bid);
        if (bro) {
          if (!bro.brotherIds) bro.brotherIds = [];
          const currentId = id || data.id;
          if (!bro.brotherIds.includes(currentId)) bro.brotherIds.push(currentId);
        }
      });
    }
    if (sisterIds.length) {
      sisterIds.forEach(sid => {
        const sis = getMember(sid);
        if (sis) {
          if (!sis.sisterIds) sis.sisterIds = [];
          const currentId = id || data.id;
          if (!sis.sisterIds.includes(currentId)) sis.sisterIds.push(currentId);
        }
      });
    }
    autoSave();
    switchPage('members');
  }

  // ---------- 持久化 ----------
  function persist() {
    saveLocal();
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
    $('gateForm').addEventListener('submit', handleGate);
    $('loginForm').addEventListener('submit', handleLogin);
    $('registerForm').addEventListener('submit', handleRegister);
    $('switchToReg').addEventListener('click', showRegisterForm);
    $('switchToLogin').addEventListener('click', showLoginForm);
    $('btnLogout').addEventListener('click', handleLogout);
    $('btnChangePass').addEventListener('click', changePass);
    $('btnChangeGate').addEventListener('click', changeGatePass);
    $('f_gender').addEventListener('change', updateBirthOrderOptions);
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
    $('btn_print').addEventListener('click', () => FamilyExport.printFamily({ clan: state.family.clan, members: state.family.members }));
    $('btn_resetLocal').addEventListener('click', resetLocal);
    window._app = { deleteUser };
  }

  document.addEventListener('DOMContentLoaded', init);
})();
