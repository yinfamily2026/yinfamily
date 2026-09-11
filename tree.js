// 尹氏家谱 v4.0 - 世系树渲染（SVG，支持缩放/拖动/点击查看）
(function () {
  const COL_W = 132, ROW_H = 100, NODE_W = 112, NODE_H = 50;
  const MIN_SCALE = 0.3, MAX_SCALE = 3;

  // 构建树结构并按"子树叶子数"布局坐标
  function layout(members) {
    const byId = new Map();
    members.forEach(m => byId.set(m.id, m));
    const childrenOf = new Map();
    members.forEach(m => {
      const pid = m.fatherId && byId.has(m.fatherId) ? m.fatherId : null;
      if (!childrenOf.has(pid)) childrenOf.set(pid, []);
      childrenOf.get(pid).push(m);
    });
    childrenOf.forEach(arr => arr.sort((a, b) => {
      // 男左女右：同一父系下，男性排在左、女性排在右
      const gd = (a.gender === '女' ? 1 : 0) - (b.gender === '女' ? 1 : 0);
      if (gd !== 0) return gd;
      // 再按排行
      const oa = parseInt(a.birthOrder, 10) || 99;
      const ob = parseInt(b.birthOrder, 10) || 99;
      if (oa !== ob) return oa - ob;
      return (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh');
    }));

    const width = {};
    function calcWidth(node) {
      const kids = childrenOf.get(node.id) || [];
      if (!kids.length) { width[node.id] = 1; return; }
      let s = 0;
      kids.forEach(k => { calcWidth(k); s += width[k.id]; });
      width[node.id] = s;
    }
    const roots = childrenOf.get(null) || [];
    if (!roots.length && members.length) roots.push(members[0]);
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

    let maxDepth = 0;
    Object.values(pos).forEach(p => { if (p.y > maxDepth) maxDepth = p.y; });
    return { members, byId, childrenOf, roots, pos, totalW: Math.max(origin, 1), totalH: maxDepth + 1 };
  }

  // 渲染整棵树到 svg，onSelect(id) 为节点点击回调
  function render(svg, data, onSelect) {
    const L = layout(data.members);
    const W = L.totalW * COL_W, H = L.totalH * ROW_H;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    svg.innerHTML = '';

    const NS = 'http://www.w3.org/2000/svg';
    const g = document.createElementNS(NS, 'g');
    g.setAttribute('transform', 'translate(0,0) scale(1)');
    svg.appendChild(g);

    const centers = [];
    for (const m of data.members) {
      const p = L.pos[m.id];
      if (!p) continue;
      centers.push({ m, x: p.x * COL_W, y: p.y * ROW_H });
    }

    // 父子连线（先画线，节点后画覆盖）
    for (const { m, x, y } of centers) {
      if (m.fatherId && L.byId.has(m.fatherId) && L.pos[m.fatherId]) {
        const fp = L.pos[m.fatherId];
        const fx = fp.x * COL_W, fy = fp.y * ROW_H + NODE_H;
        const midY = fy + (y - fy) / 2;
        const ln = document.createElementNS(NS, 'path');
        ln.setAttribute('d', `M ${fx} ${fy} L ${fx} ${midY} L ${x} ${midY} L ${x} ${y}`);
        ln.setAttribute('class', 'link-line');
        g.appendChild(ln);
      }
    }

    // 兄弟横线（同父兄弟之间画水平连线）
    const siblingsMap = new Map();
    for (const { m } of centers) {
      if (m.fatherId) {
        if (!siblingsMap.has(m.fatherId)) siblingsMap.set(m.fatherId, []);
        siblingsMap.get(m.fatherId).push(m);
      }
    }
    siblingsMap.forEach(bros => {
      if (bros.length < 2) return;
      bros.sort((a, b) => {
        const gd = (a.gender === '女' ? 1 : 0) - (b.gender === '女' ? 1 : 0);
        if (gd !== 0) return gd;
        const oa = parseInt(a.birthOrder, 10) || 99;
        const ob = parseInt(b.birthOrder, 10) || 99;
        if (oa !== ob) return oa - ob;
        return a.name.localeCompare(b.name, 'zh');
      });
      for (let i = 0; i < bros.length - 1; i++) {
        const a = L.pos[bros[i].id], b = L.pos[bros[i + 1].id];
        if (!a || !b) continue;
        const ax = a.x * COL_W, bx = b.x * COL_W;
        const ay = a.y * ROW_H, by = b.y * ROW_H;
        // 只在同一行画兄弟线
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

    // 配偶横线（夫妻之间画连线）
    for (const { m, x, y } of centers) {
      if (m.spouseId && L.byId.has(m.spouseId) && L.pos[m.spouseId]) {
        // 只画一次（避免双向重复）
        if (m.id < m.spouseId) {
          const sp = L.pos[m.spouseId];
          const sx = sp.x * COL_W, sy = sp.y * ROW_H;
          if (Math.abs(y - sy) < 5) {
            const ln = document.createElementNS(NS, 'line');
            ln.setAttribute('x1', x + NODE_W / 2);
            ln.setAttribute('y1', y + NODE_H / 2);
            ln.setAttribute('x2', sx - NODE_W / 2);
            ln.setAttribute('y2', sy + NODE_H / 2);
            ln.setAttribute('class', 'link-line spouse-line');
            g.appendChild(ln);
          }
        }
      }
    }

    // 节点
    for (const { m, x, y } of centers) {
      const rx = x - NODE_W / 2, ry = y;
      const rect = document.createElementNS(NS, 'rect');
      rect.setAttribute('x', rx); rect.setAttribute('y', ry);
      rect.setAttribute('width', NODE_W); rect.setAttribute('height', NODE_H);
      rect.setAttribute('class', 'node-rect' + (m.gender === '女' ? ' female' : ''));
      rect.style.cursor = 'pointer';
      g.appendChild(rect);

      // 排行称呼
      const orderNames = ['', '长', '次', '三', '四', '五', '六', '七', '八', '九'];
      const maleNames = ['', '长子', '次子', '三子', '四子', '五子', '六子', '七子', '八子', '九子'];
      const femaleNames = ['', '长女', '次女', '三女', '四女', '五女', '六女', '七女', '八女', '九女'];
      let orderLabel = '';
      if (m.birthOrder) {
        const o = parseInt(m.birthOrder, 10);
        orderLabel = (m.gender === '女' ? femaleNames : maleNames)[o] || '';
      }

      const t1 = document.createElementNS(NS, 'text');
      t1.setAttribute('x', x); t1.setAttribute('y', ry + 21);
      t1.setAttribute('class', 'node-text');
      t1.textContent = m.name || '未命名';
      g.appendChild(t1);

      // 第二行：排行或配偶
      const t2 = document.createElementNS(NS, 'text');
      t2.setAttribute('x', x); t2.setAttribute('y', ry + 39);
      t2.setAttribute('class', 'node-sub');
      const spouse = m.spouseId && L.byId.get(m.spouseId) ? L.byId.get(m.spouseId).name : '';
      if (orderLabel && spouse) {
        t2.textContent = orderLabel + ' · 配' + spouse;
      } else if (orderLabel) {
        t2.textContent = orderLabel;
      } else if (spouse) {
        t2.textContent = '配 ' + spouse;
      } else {
        t2.textContent = (m.generation ? '第' + m.generation + '世' : '');
      }
      g.appendChild(t2);

      rect.addEventListener('click', () => onSelect && onSelect(m.id));
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

  // 挂载缩放/拖动交互（返回复位函数）
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

    // 桌面端拖动
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
