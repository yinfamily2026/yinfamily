// 清平哨尹氏族谱 v9.0 - 世系树渲染（夫妻同框不分开 + 男左女右 + 前配虚线 + 自动排序）
(function () {
  const COL_W = 140, ROW_H = 100, NODE_W = 120, NODE_H = 50;
  const MIN_SCALE = 0.3, MAX_SCALE = 3;
  const MALE_ORDER = ['', '长子', '次子', '三子', '四子', '五子', '六子', '七子', '八子', '九子'];
  const FEMALE_ORDER = ['', '长女', '次女', '三女', '四女', '五女', '六女', '七女', '八女', '九女'];

  function compareSiblings(a, b) {
    const gd = (a.gender === '女' ? 1 : 0) - (b.gender === '女' ? 1 : 0);
    if (gd !== 0) return gd;
    const oa = parseInt(a.birthOrder, 10) || 99;
    const ob = parseInt(b.birthOrder, 10) || 99;
    if (oa !== ob) return oa - ob;
    return (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh');
  }

  function layout(members) {
    const byId = new Map();
    members.forEach(m => byId.set(m.id, m));

    // 夫妻合并：现配（spouseId 互指）合并为同一节点
    // subOf[被合并成员id] = 主成员id；subInfo[主成员id] = 被合并成员（用于卡片副行）
    const subOf = new Map();
    const subInfo = new Map();
    members.forEach(m => {
      if (subOf.has(m.id)) return;
      if (!m.spouseId || !byId.has(m.spouseId)) return;
      const s = byId.get(m.spouseId);
      if (subOf.has(s.id)) return;
      let main = m, sub = s;
      if (m.gender === '女' && s.gender !== '女') { main = s; sub = m; }
      subOf.set(sub.id, main.id);
      subInfo.set(main.id, sub);
    });
    const realId = id => subOf.get(id) || id;

    const childrenOf = new Map();
    members.forEach(m => {
      if (subOf.has(m.id)) return; // 被合并成员不占独立节点
      const pid = m.fatherId && byId.has(m.fatherId) ? realId(m.fatherId) : null;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(m);
    });
    childrenOf.forEach(arr => arr.sort(compareSiblings));

    const width = {};
    function calcWidth(node) {
      const kids = childrenOf.get(node.id) || [];
      if (!kids.length) { width[node.id] = 1; return; }
      let s = 0;
      kids.forEach(k => { calcWidth(k); s += width[k.id]; });
      width[node.id] = s;
    }
    const roots = childrenOf.get(null) || [];
    if (!roots.length && members.length) {
      const mains = members.filter(m => !subOf.has(m.id));
      if (mains.length) roots.push(mains[0]); else roots.push(members[0]);
    }
    roots.forEach(calcWidth);

    const pos = {};
    let origin = 0;
    function place(id, depth, startX) {
      const kids = childrenOf.get(id) || [];
      const w = width[id] || 1;
      pos[id] = { x: startX + w / 2, y: depth };
      let cx = startX;
      kids.forEach(k => { place(k.id, depth + 1, cx); cx += width[k.id]; });
    }
    roots.forEach(r => { place(r.id, 0, origin); origin += width[r.id]; });

    // 前配同行归位：游离在别的行的前配（离异）移到其主配偶同一行右侧，保证虚线可连
    const side = new Map();
    const addSide = (mainId, exId) => {
      if (!side.has(mainId)) side.set(mainId, []);
      if (!side.get(mainId).includes(exId)) side.get(mainId).push(exId);
    };
    members.forEach(m => {
      if (subOf.has(m.id) || !m.exSpouseId || !byId.has(m.exSpouseId)) return;
      const mateId = realId(m.exSpouseId);
      if (mateId === m.id || !pos[mateId] || !pos[m.id]) return;
      if (Math.abs(pos[m.id].y - pos[mateId].y) < 1) return;
      // 只移动"游离方"（无父系占位的一方）到主方同一行
      const hasParent = id => {
        const mm = byId.get(id);
        return !!(mm.fatherId && byId.has(mm.fatherId) && pos[realId(mm.fatherId)]);
      };
      const mFree = !hasParent(m.id);
      const mateFree = !hasParent(mateId);
      if (mFree && !mateFree) addSide(mateId, m.id);
      else if (mateFree && !mFree) addSide(m.id, mateId);
    });
    side.forEach((list, mainId) => {
      const A = pos[mainId];
      let slot = Math.round(A.x) + 1;
      list.forEach(exId => {
        while (Object.values(pos).some(p => p.y === A.y && Math.abs(p.x - slot) < 1)) slot += 1;
        pos[exId] = { x: slot, y: A.y };
        origin = Math.max(origin, slot + 1);
        slot += 1;
      });
    });

    let maxDepth = 0;
    Object.values(pos).forEach(p => { if (p.y > maxDepth) maxDepth = p.y; });
    return { members, byId, subOf, subInfo, realId, childrenOf, roots, pos, totalW: Math.max(origin, 1), totalH: maxDepth + 1 };
  }

  function clipText(s, max) {
    if (s.length <= max) return s;
    return s.slice(0, max - 1) + '…';
  }

  function render(svg, data, onSelect) {
    const L = layout(data.members);
    const W = L.totalW * COL_W, H = L.totalH * ROW_H;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '';

    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'translate(0,0) scale(1)');
    svg.appendChild(g);

    // 参与布局的独立节点（排除被合并进夫妻的成员）
    const centers = [];
    for (const m of data.members) {
      if (L.subOf.has(m.id)) continue;
      const p = L.pos[m.id];
      if (!p) continue;
      centers.push({ m, x: p.x * COL_W, y: p.y * ROW_H });
    }

    // 父子连线
    for (const { m, x, y } of centers) {
      const fid = m.fatherId && L.byId.has(m.fatherId) ? L.realId(m.fatherId) : null;
      if (fid && L.pos[fid]) {
        const fp = L.pos[fid];
        const fx = fp.x * COL_W, fy = fp.y * ROW_H + NODE_H;
        const midY = fy + (y - fy) / 2;
        const ln = document.createElementNS(NS, 'path');
        ln.setAttribute('d', `M ${fx} ${fy} L ${fx} ${midY} L ${x} ${midY} L ${x} ${y}`);
        ln.setAttribute('class', 'link-line');
        g.appendChild(ln);
      }
    }

    // 兄弟横线
    const siblingsMap = new Map();
    for (const { m } of centers) {
      const fid = m.fatherId && L.byId.has(m.fatherId) ? L.realId(m.fatherId) : null;
      if (fid) {
        if (!siblingsMap.has(fid)) siblingsMap.set(fid, []);
        siblingsMap.get(fid).push(m);
      }
    }
    siblingsMap.forEach(bros => {
      if (bros.length < 2) return;
      bros.sort(compareSiblings);
      for (let i = 0; i < bros.length - 1; i++) {
        const a = L.pos[bros[i].id], b = L.pos[bros[i + 1].id];
        if (!a || !b) continue;
        const ax = a.x * COL_W, bx = b.x * COL_W;
        const ay = a.y * ROW_H, by = b.y * ROW_H;
        if (Math.abs(ay - by) < 5) {
          const ln = document.createElementNS(NS, 'line');
          ln.setAttribute('x1', ax + NODE_W / 2);
          ln.setAttribute('y1', ay + NODE_H / 2);
          ln.setAttribute('x2', bx - NODE_W / 2);
          ln.setAttribute('y2', by + NODE_H / 2);
          ln.setAttribute('class', 'link-line sibling-line');
          g.appendChild(ln);
        }
      }
    });

    // 前配（离异）虚线：双方归一到主节点，同一对只画一次
    for (const m of data.members) {
      if (!m.exSpouseId || !L.byId.has(m.exSpouseId)) continue;
      const srcId = L.realId(m.id);
      const dstId = L.realId(m.exSpouseId);
      if (srcId === dstId || srcId > dstId) continue;
      const a = L.pos[srcId], b = L.pos[dstId];
      if (!a || !b) continue;
      const ax = a.x * COL_W, bx = b.x * COL_W;
      const ay = a.y * ROW_H, by = b.y * ROW_H;
      if (Math.abs(ay - by) < 5) {
        const ln = document.createElementNS(NS, 'line');
        ln.setAttribute('x1', ax + NODE_W / 2);
        ln.setAttribute('y1', ay + NODE_H / 2);
        ln.setAttribute('x2', bx - NODE_W / 2);
        ln.setAttribute('y2', by + NODE_H / 2);
        ln.setAttribute('class', 'link-line ex-spouse-line');
        g.appendChild(ln);
      }
    }

    // 节点卡片（夫妻同框：主行姓名，副行 排行 · 配·X · 前配·Y）
    for (const { m, x, y } of centers) {
      const rx = x - NODE_W / 2, ry = y;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', rx); rect.setAttribute('y', ry);
      rect.setAttribute('width', NODE_W); rect.setAttribute('height', NODE_H);
      rect.setAttribute('class', 'node-rect' + (m.gender === '女' ? ' female' : ''));
      rect.style.cursor = 'pointer';
      g.appendChild(rect);

      let orderLabel = '';
      if (m.birthOrder) {
        const o = parseInt(m.birthOrder, 10);
        orderLabel = (m.gender === '女' ? FEMALE_ORDER : MALE_ORDER)[o] || '';
      }

      const t1 = document.createElementNS(NS, 'text');
      t1.setAttribute('x', x); t1.setAttribute('y', ry + 21);
      t1.setAttribute('class', 'node-text');
      t1.textContent = clipText(m.name || '未命名', 9);
      g.appendChild(t1);

      const t2 = document.createElementNS(NS, 'text');
      t2.setAttribute('x', x); t2.setAttribute('y', ry + 39);
      t2.setAttribute('class', 'node-sub');
      t2.style.cursor = 'pointer';
      const merged = L.subInfo.get(m.id);
      const spouse = merged || (m.spouseId && L.byId.get(m.spouseId) ? L.byId.get(m.spouseId) : null);
      const exSpouse = m.exSpouseId && L.byId.get(m.exSpouseId) ? L.byId.get(m.exSpouseId) : null;
      let subText = orderLabel;
      if (spouse) subText += (subText ? ' · ' : '') + '配' + spouse.name;
      if (exSpouse) subText += (subText ? ' · ' : '') + '前配' + exSpouse.name;
      if (!subText) subText = (m.generation ? '第' + m.generation + '世' : '');
      t2.textContent = clipText(subText, 11);
      g.appendChild(t2);

      rect.addEventListener('click', () => onSelect && onSelect(m.id));
      t2.addEventListener('click', e => {
        e.stopPropagation();
        onSelect && onSelect(spouse ? spouse.id : m.id);
      });
    }

    if (!data.members.length) {
      const t = document.createElementNS(NS, 'text');
      t.setAttribute('x', W / 2); t.setAttribute('y', H / 2);
      t.setAttribute('text-anchor', 'middle');
      t.setAttribute('fill', '#8a8378');
      t.textContent = '暂无成员，请先在「续谱」中添加';
      g.appendChild(t);
    }

    return g;
  }

  function enablePanZoom(wrap, svg) {
    let scale = 1, tx = 0, ty = 0;
    let dragging = false, lastX = 0, lastY = 0, pinchDist = 0;
    const g = svg.querySelector('g');

    function apply() {
      if (g) g.setAttribute('transform', `translate(${tx},${ty}) scale(${scale})`);
    }
    function reset() { scale = 1; tx = 0; ty = 0; apply(); }

    wrap.addEventListener('touchstart', e => {
      if (e.touches.length === 1) {
        dragging = true;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
      } else if (e.touches.length === 2) {
        dragging = false;
        pinchDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      }
      e.preventDefault();
    }, { passive: false });

    wrap.addEventListener('touchmove', e => {
      e.preventDefault();
      if (e.touches.length === 1 && dragging) {
        const dx = e.touches[0].clientX - lastX, dy = e.touches[0].clientY - lastY;
        tx += dx; ty += dy;
        lastX = e.touches[0].clientX; lastY = e.touches[0].clientY;
        apply();
      } else if (e.touches.length === 2) {
        const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        if (pinchDist > 0) {
          const k = d / pinchDist;
          scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * k));
          apply();
        }
        pinchDist = d;
      }
    }, { passive: false });

    wrap.addEventListener('touchend', () => { dragging = false; }, { passive: true });

    svg.addEventListener('mousedown', e => {
      if (e.target.tagName === 'rect') return;
      dragging = true; lastX = e.clientX; lastY = e.clientY;
    });
    window.addEventListener('mousemove', e => {
      if (!dragging) return;
      tx += e.clientX - lastX; ty += e.clientY - lastY;
      lastX = e.clientX; lastY = e.clientY;
      apply();
    });
    window.addEventListener('mouseup', () => { dragging = false; });
    svg.addEventListener('wheel', e => {
      e.preventDefault();
      const k = e.deltaY < 0 ? 1.1 : 0.9;
      scale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * k));
      apply();
    }, { passive: false });

    return reset;
  }

  window.Tree = { layout, render, enablePanZoom };
})();