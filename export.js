// 清平哨尹氏族谱 v9.0 - 数据导出 / 导入 / 打印
(function () {
  function exportJSON(family) {
    const blob = new Blob([JSON.stringify(family, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
    a.download = `清平哨尹氏族谱备份_${stamp}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  function importJSON(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const data = JSON.parse(reader.result);
          if (!data.clan || !Array.isArray(data.members)) {
            return reject(new Error('文件格式不正确：缺少 clan 或 members'));
          }
          resolve(data);
        } catch (e) {
          reject(new Error('文件解析失败：' + e.message));
        }
      };
      reader.onerror = () => reject(new Error('文件读取失败'));
      reader.readAsText(file);
    });
  }

  function buildPrintHTML(family) {
    const byGen = new Map();
    family.members
      .slice()
      .sort((a, b) => (a.generation - b.generation) || a.name.localeCompare(b.name, 'zh'))
      .forEach(m => {
        if (!byGen.has(m.generation)) byGen.set(m.generation, []);
        byGen.get(m.generation).push(m);
      });

    let html = `<h1>${family.clan.name}族谱</h1><p style="text-align:center;color:#888;font-size:12px">生成时间：${new Date().toLocaleString('zh-CN')}</p>`;
    for (const [gen, list] of byGen.entries()) {
      html += `<h3>第 ${gen} 世</h3>`;
      list.forEach(m => {
        const parts = [];
        if (m.alias) parts.push('曾用名 ' + m.alias);
        if (m.gender) parts.push(m.gender);
        if (m.birth) parts.push('生于 ' + m.birth);
        if (m.death) parts.push('卒于 ' + m.death);
        if (m.birthPlace) parts.push('籍贯 ' + m.birthPlace);
        if (m.burialPlace) parts.push('葬于 ' + m.burialPlace);
        const spouse = m.spouseId ? family.members.find(x => x.id === m.spouseId) : null;
        const exSpouse = m.exSpouseId ? family.members.find(x => x.id === m.exSpouseId) : null;
        if (exSpouse) parts.push('前配 ' + exSpouse.name);
        if (spouse) parts.push('现配 ' + spouse.name);
        const maritalMap = { married: '已婚', divorced: '已离异', remarried: '再婚', widowed: '丧偶' };
        if (m.marital && maritalMap[m.marital]) parts.push(maritalMap[m.marital]);
        if (m.marriageType === 'ruzhui') parts.push('入赘');
        if (m.wechat) parts.push('微信 ' + m.wechat);
        if (m.address) parts.push('住址 ' + m.address);
        html += `<div class="p-entry">· ${m.name}${parts.length ? '（' + parts.join('，') + '）' : ''}</div>`;
        if (m.bio) html += `<div class="p-bio">　${m.bio}</div>`;
      });
    }
    return html;
  }

  function printFamily(family) {
    const area = document.getElementById('printArea');
    area.innerHTML = buildPrintHTML(family);
    window.print();
  }

  window.FamilyExport = { exportJSON, importJSON, buildPrintHTML, printFamily };
})();