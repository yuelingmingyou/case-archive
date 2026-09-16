/* ============================================================
 * 案件档案馆 · 逻辑
 * 路由（hash）/ 检索筛选 / 馆内编辑模式（localStorage + 导出）
 * ============================================================ */

(function () {
  "use strict";

  var STORE_KEY = "case-archive-data-v1";

  /* ---------- 数据：本地修改优先于 cases.js ---------- */
  function loadCases() {
    try {
      var raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch (e) { /* 数据损坏则回退 */ }
    return window.CASES_DATA || [];
  }

  var CASES = loadCases();
  var editing = false;
  var activeCategory = "全部";
  var keyword = "";

  function persist() {
    localStorage.setItem(STORE_KEY, JSON.stringify(CASES));
  }

  function hasLocalChanges() {
    return !!localStorage.getItem(STORE_KEY);
  }

  /* ---------- 工具 ---------- */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setPath(obj, path, value) {
    var keys = path.split(".");
    var cur = obj;
    for (var i = 0; i < keys.length - 1; i++) {
      var k = /^\d+$/.test(keys[i]) ? Number(keys[i]) : keys[i];
      cur = cur[k];
      if (cur == null) return;
    }
    var last = keys[keys.length - 1];
    cur[/^\d+$/.test(last) ? Number(last) : last] = value;
  }

  // 把可编辑文本节点的换行存回数据
  function bindEditable(root, caseId) {
    root.querySelectorAll("[data-edit]").forEach(function (el) {
      if (!editing) return;
      el.setAttribute("contenteditable", "true");
      el.setAttribute("spellcheck", "false");
      el.addEventListener("input", function () {
        var c = CASES.find(function (x) { return x.id === caseId; });
        if (!c) return;
        var text = el.innerText.replace(/ /g, " ").replace(/\s+\n/g, "\n").trim();
        setPath(c, el.getAttribute("data-edit"), text);
        persist();
      });
    });
  }

  /* ---------- 目录页 ---------- */
  function getCategories() {
    var cats = { "全部": CASES.length };
    CASES.forEach(function (c) {
      cats[c.category] = (cats[c.category] || 0) + 1;
    });
    return cats;
  }

  function matchCase(c) {
    if (activeCategory !== "全部" && c.category !== activeCategory) return false;
    if (!keyword) return true;
    var hay = [c.title, c.subtitle, c.summary, c.category, c.year,
      (c.tags || []).join(" "), (c.points || []).join(" ")].join(" ").toLowerCase();
    return hay.indexOf(keyword.toLowerCase()) !== -1;
  }

  function renderIndex() {
    var cats = getCategories();
    var list = CASES.filter(matchCase);

    var catHtml = Object.keys(cats).map(function (name) {
      return '<button class="cat-item' + (name === activeCategory ? " active" : "") +
        '" data-cat="' + esc(name) + '"><span>' + esc(name) + '</span><span class="n">' +
        cats[name] + "</span></button>";
    }).join("");

    var rows = list.map(function (c, i) {
      return '<tr class="rise d' + Math.min(i + 1, 4) + '" data-id="' + esc(c.id) + '">' +
        '<td><span class="idx-code">' + esc(c.code) + '</span><br>' +
          (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
        '</td>' +
        '<td><div class="idx-title">' + esc(c.title) + '</div>' +
          '<div class="idx-sub">' + esc(c.subtitle) + "</div></td>" +
        '<td class="idx-year">' + esc(c.year) + '</td>' +
        '<td class="idx-cat">' + esc(c.category) + '</td>' +
        '<td class="idx-status">' + esc(c.status) + '</td>' +
        '<td class="idx-summary">' + esc(c.summary) + "</td>" +
      "</tr>";
    }).join("");

    if (!rows) {
      rows = '<tr><td colspan="6"><div class="empty-note">—— 没有匹配的卷宗 ——</div></td></tr>';
    }

    return {
      side:
        '<h3>分类索引 / INDEX</h3>' + catHtml +
        '<h3>馆务 / DESK</h3>' +
        '<div class="local-note">' +
          (hasLocalChanges()
            ? "※ 当前展示含本机修改<br>（存于浏览器 localStorage）"
            : "数据以 cases.js 为准<br>馆内修改仅保存在本机") +
        "</div>",
      main:
        '<div class="view-head rise">' +
          '<div class="t">卷宗目录<small>Case Index · ' + list.length + ' / ' + CASES.length + ' Files</small></div>' +
          '<div class="search-box"><label>检索</label>' +
          '<input id="kw" type="text" placeholder="案件名 / 标签 / 关键词…" value="' + esc(keyword) + '"></div>' +
        "</div>" +
        '<table class="index-table"><thead><tr>' +
          "<th>编号 / 标签</th><th>案件名称</th><th>年代</th><th>分类</th><th>状态</th><th>案由摘要</th>" +
        "</tr></thead><tbody>" + rows + "</tbody></table>" +
        '<div class="colophon"><span>Case Archive · 案件档案馆</span><span>整理自公开资料 · 仅供查阅</span></div>'
    };
  }

  /* ---------- 详情页 ---------- */
  var CN_NUM = ["壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖", "拾"];

  function renderCase(c) {
    var ed = function (path) { return editing ? ' data-edit="' + path + '"' : ""; };

    var metaRows = [
      ["档案编号", c.code, true, "code"], ["案件分类", c.category, true, "category"],
      ["案发时间", c.year, true, "year"], ["时代背景", c.era, false, "era"],
      ["案发地点", c.location, false, "location"], ["主要人物", (c.people[0] ? c.people[0].name : ""), false, "people.0.name"],
      ["档案状态", c.status, true, "status"], ["资料来源", c.source, false, "source"]
    ].map(function (r) {
      return '<div class="meta-row"><span class="k">' + esc(r[0]) +
        '</span><span class="dots"></span><span class="v' + (r[2] ? " mono" : "") + '"' +
        ed(r[3]) + '>' + esc(r[1]) + "</span></div>";
    }).join("");

    var points = c.points.map(function (p, i) {
      return "<li" + ed("points." + i) + ">" + esc(p) + "</li>";
    }).join("");

    var people = c.people.map(function (p, i) {
      return "<tr><td" + ed("people." + i + ".name") + ">" + esc(p.name) + "</td><td" +
        ed("people." + i + ".role") + ">" + esc(p.role) + "</td></tr>";
    }).join("");

    var timeline = c.timeline.map(function (t, i) {
      return '<div class="tl-item"><div class="tl-date"' + ed("timeline." + i + ".date") + ">" +
        esc(t.date) + '</div><div class="tl-title"' + ed("timeline." + i + ".title") + ">" +
        esc(t.title) + '</div><div class="tl-text"' + ed("timeline." + i + ".text") + ">" +
        esc(t.text) + "</div></div>";
    }).join("");

    var sections = c.sections.map(function (s, i) {
      var paras = s.paras.map(function (p, j) {
        return "<p" + ed("sections." + i + ".paras." + j) + ">" + esc(p) + "</p>";
      }).join("");
      return '<div class="sub-section"><h3' + ed("sections." + i + ".title") + ">" +
        esc(s.title) + "</h3>" + paras + "</div>";
    }).join("");

    var quotes = c.quotes.map(function (q, i) {
      return '<div class="quote-slip"><div class="q"' + ed("quotes." + i + ".text") + ">" +
        esc(q.text) + '</div><div class="from">—— <span' + ed("quotes." + i + ".from") + ">" +
        esc(q.from) + "</span></div></div>";
    }).join("");

    var related = c.related.map(function (r, i) {
      return "<li" + ed("related." + i) + ">" + esc(r) + "</li>";
    }).join("");

    var main =
      '<div class="edit-banner">编辑模式已开启 —— 点击虚线框内文字即可修改，改动自动保存在本机浏览器</div>' +
      '<a class="back-link" href="#/">← 返回卷宗目录</a>' +
      '<a class="back-link" style="margin-left:20px" href="#/edit/' + encodeURIComponent(c.id) + '">✎ 表单编辑此卷宗</a>' +
      '<div class="dossier rise">' +
        '<div class="dossier-head">' +
          '<div class="code-line"><span>File No. ' + esc(c.code) + '</span><span>' + esc(c.era) + "</span></div>" +
          "<h1" + ed("title") + ">" + esc(c.title) + "</h1>" +
          '<div class="sub"' + ed("subtitle") + ">" + esc(c.subtitle) + "</div>" +
          '<div class="stamp slam">' + esc(c.status) + "</div>" +
        "</div>" +
        '<div class="meta-grid">' + metaRows + "</div>" +
        '<div style="margin-top:6px">' +
          (c.tags || []).map(function (t) { return '<span class="tag">' + esc(t) + "</span>"; }).join("") +
          '<span class="stamp-rect" style="margin-left:10px">' + esc(c.year) + "</span>" +
        "</div>" +

        '<div class="brief rise d1">' +
          '<span class="brief-label">阅卷速览</span><span class="brief-en">Key Points</span>' +
          "<ol>" + points + "</ol>" +
        "</div>" +

        '<div class="section-block rise d1"><h2><span class="no">第壹节</span>涉案人物<span class="en">Persons</span></h2>' +
          '<table class="people-table">' + people + "</table></div>" +

        '<div class="section-block rise d2"><h2><span class="no">第贰节</span>案件时间线<span class="en">Chronology</span></h2>' +
          '<div class="timeline">' + timeline + "</div></div>" +

        '<div class="section-block rise d2"><h2><span class="no">第叁节</span>案件详述<span class="en">Full Record</span></h2>' +
          sections + "</div>" +

        '<div class="section-block rise d3"><h2><span class="no">第肆节</span>证物摘录<span class="en">Exhibits</span></h2>' +
          quotes + "</div>" +

        '<div class="section-block rise d3"><h2><span class="no">第伍节</span>延伸关联<span class="en">Cross Ref.</span></h2>' +
          '<ul class="related-list">' + related + "</ul></div>" +

        '<div class="colophon"><span>File No. ' + esc(c.code) + " · " + esc(c.title) +
          '</span><span>来源：' + esc(c.source) + "</span></div>" +
      "</div>";

    return { side: indexSideOnly(), main: main };
  }

  function indexSideOnly() {
    var cats = getCategories();
    var catHtml = Object.keys(cats).map(function (name) {
      return '<button class="cat-item" data-cat="' + esc(name) + '"><span>' + esc(name) +
        '</span><span class="n">' + cats[name] + "</span></button>";
    }).join("");
    return '<h3>分类索引 / INDEX</h3>' + catHtml +
      '<h3>馆务 / DESK</h3>' +
      '<div class="local-note">' +
        (hasLocalChanges() ? "※ 当前展示含本机修改" : "馆内修改仅保存在本机") +
      "</div>";
  }

  /* ---------- 新建 / 表单编辑 ---------- */
  function blankCase() {
    return {
      id: "", code: "", title: "", subtitle: "", year: "", era: "", location: "",
      category: "未分类", tags: [], status: "整理中", source: "", summary: "",
      points: [], people: [], timeline: [], sections: [], quotes: [], related: []
    };
  }

  function splitLines(text) {
    return String(text || "").split("\n")
      .map(function (s) { return s.trim(); }).filter(Boolean);
  }
  function splitPipe(line) {
    return line.split(/[|｜]/).map(function (s) { return s.trim(); });
  }
  function joinLines(arr) { return (arr || []).join("\n"); }

  function parseSections(text) {
    var out = [], cur = null;
    String(text || "").split("\n").forEach(function (line) {
      var t = line.trim();
      if (!t) return;
      if (t.charAt(0) === "#") {
        cur = { title: t.replace(/^#+\s*/, ""), paras: [] };
        out.push(cur);
      } else if (cur) {
        cur.paras.push(t);
      } else {
        cur = { title: "正文", paras: [t] };
        out.push(cur);
      }
    });
    return out;
  }

  function field(id, label, value, hint, textarea, rows) {
    var input = textarea
      ? '<textarea id="' + id + '" rows="' + (rows || 4) + '">' + esc(value) + "</textarea>"
      : '<input id="' + id + '" type="text" value="' + esc(value) + '">';
    return '<div class="f-field"><label for="' + id + '">' + label + "</label>" + input +
      (hint ? '<div class="hint">' + hint + "</div>" : "") + "</div>";
  }

  function renderForm(main, c, isNew) {
    var peopleText = (c.people || []).map(function (p) { return p.name + " ｜ " + p.role; }).join("\n");
    var tlText = (c.timeline || []).map(function (t) { return t.date + " ｜ " + t.title + " ｜ " + t.text; }).join("\n");
    var secText = (c.sections || []).map(function (s) {
      return "# " + s.title + "\n" + (s.paras || []).join("\n");
    }).join("\n\n");
    var quoteText = (c.quotes || []).map(function (q) { return q.text + " ｜ " + q.from; }).join("\n");

    main.innerHTML =
      '<a class="back-link" href="' + (isNew ? "#/" : "#/case/" + encodeURIComponent(c.id)) + '">← 放弃并返回</a>' +
      '<div class="dossier rise">' +
        '<div class="dossier-head">' +
          '<div class="code-line"><span>' + (isNew ? "New File" : "Edit File · " + esc(c.code)) + '</span><span>表单录入</span></div>' +
          "<h1>" + (isNew ? "新建卷宗" : "编辑卷宗") + "</h1>" +
          '<div class="sub">带「｜」的是分隔符；列表类内容每行一条，保存后立即生效</div>' +
        "</div>" +

        '<div class="two-col">' +
          field("f-code", "档案编号 / File No.", c.code, "如 A-002，留空则自动生成") +
          field("f-status", "档案状态 / Status", c.status, "如 已归档 / 整理中，会显示为右上角印章") +
          field("f-year", "年代 / Period", c.year, "如 1948—1949") +
          field("f-category", "案件分类 / Category", c.category, "目录页按此自动分组筛选，写新名字即新增分类") +
          field("f-era", "时代背景 / Era", c.era, "") +
          field("f-location", "案发地点 / Location", c.location, "") +
          field("f-tags", "标签 / Tags", (c.tags || []).join("，"), "用逗号或顿号分隔") +
          field("f-source", "资料来源 / Source", c.source, "") +
        "</div>" +

        field("f-title", "案件名称 / Title *", c.title, "") +
        field("f-subtitle", "副标题 / Subtitle", c.subtitle, "") +
        field("f-summary", "案由摘要 / Summary", c.summary, "一句话概括，显示在目录页", true, 2) +
        field("f-points", "阅卷速览 / Key Points", joinLines(c.points), "每行一条要点", true, 6) +
        field("f-people", "涉案人物 / Persons", peopleText, "每行：姓名 ｜ 介绍", true, 5) +
        field("f-timeline", "案件时间线 / Chronology", tlText, "每行：日期 ｜ 标题 ｜ 内容", true, 8) +
        field("f-sections", "案件详述 / Full Record", secText, "以「# 章节标题」另起一节；其余每行一个段落", true, 12) +
        field("f-quotes", "证物摘录 / Exhibits", quoteText, "每行：引文 ｜ 出处", true, 5) +
        field("f-related", "延伸关联 / Cross Ref.", joinLines(c.related), "每行一条", true, 4) +

        '<div class="btn-row">' +
          '<button class="tool-btn" id="btn-save">保存卷宗</button>' +
          '<button class="tool-btn ghost" id="btn-cancel">取消</button>' +
          (isNew ? "" : '<button class="tool-btn danger" id="btn-delete">删除此卷宗</button>') +
        "</div>" +
        '<div class="local-note">保存后存于本机浏览器；要同步到 GitHub 请再点右下角「导出 cases.js」并提交仓库。</div>' +
      "</div>";

    document.getElementById("btn-save").addEventListener("click", function () {
      var data = collectForm(isNew, c.id);
      if (!data) return;
      if (isNew) {
        CASES.push(data);
      } else {
        var idx = CASES.findIndex(function (x) { return x.id === c.id; });
        if (idx !== -1) CASES[idx] = data;
      }
      persist();
      activeCategory = "全部";
      keyword = "";
      location.hash = "#/case/" + encodeURIComponent(data.id);
    });
    document.getElementById("btn-cancel").addEventListener("click", function () {
      location.hash = isNew ? "#/" : "#/case/" + encodeURIComponent(c.id);
    });
    var delBtn = document.getElementById("btn-delete");
    if (delBtn) {
      delBtn.addEventListener("click", function () {
        if (!confirm("确定删除卷宗「" + c.title + "」吗？此操作在本机立即生效。")) return;
        CASES = CASES.filter(function (x) { return x.id !== c.id; });
        persist();
        location.hash = "#/";
      });
    }
  }

  function collectForm(isNew, origId) {
    function val(id) { return document.getElementById(id).value.trim(); }
    var title = val("f-title");
    if (!title) { alert("请至少填写「案件名称」。"); return null; }
    return {
      id: isNew ? ("case-" + Date.now().toString(36)) : origId,
      code: val("f-code") || ("A-" + String(CASES.length + 1).padStart(3, "0")),
      title: title,
      subtitle: val("f-subtitle"),
      year: val("f-year"),
      era: val("f-era"),
      location: val("f-location"),
      category: val("f-category") || "未分类",
      tags: val("f-tags").split(/[,，、;；]/).map(function (s) { return s.trim(); }).filter(Boolean),
      status: val("f-status") || "整理中",
      source: val("f-source"),
      summary: val("f-summary"),
      points: splitLines(val("f-points")),
      people: splitLines(val("f-people")).map(function (l) {
        var p = splitPipe(l); return { name: p[0] || "", role: p.slice(1).join("｜") };
      }),
      timeline: splitLines(val("f-timeline")).map(function (l) {
        var p = splitPipe(l); return { date: p[0] || "", title: p[1] || "", text: p.slice(2).join("｜") };
      }),
      sections: parseSections(val("f-sections")),
      quotes: splitLines(val("f-quotes")).map(function (l) {
        var p = splitPipe(l); return { text: p[0] || "", from: p.slice(1).join("｜") };
      }),
      related: splitLines(val("f-related"))
    };
  }

  /* ---------- 渲染 ---------- */
  function render() {
    var hash = location.hash || "#/";
    var m = hash.match(/^#\/case\/(.+)$/);
    var side = document.getElementById("side");
    var main = document.getElementById("main");

    /* 新建卷宗 */
    if (hash === "#/new") {
      side.innerHTML = indexSideOnly();
      renderForm(main, blankCase(), true);
      window.scrollTo(0, 0);
      bindSide();
      return;
    }
    /* 表单编辑已有卷宗 */
    var me = hash.match(/^#\/edit\/(.+)$/);
    if (me) {
      var ec = CASES.find(function (x) { return x.id === decodeURIComponent(me[1]); });
      if (ec) {
        side.innerHTML = indexSideOnly();
        renderForm(main, ec, false);
        window.scrollTo(0, 0);
        bindSide();
        return;
      }
    }

    if (m) {
      var c = CASES.find(function (x) { return x.id === decodeURIComponent(m[1]); });
      if (c) {
        var r = renderCase(c);
        side.innerHTML = r.side;
        main.innerHTML = r.main;
        bindEditable(main, c.id);
        window.scrollTo(0, 0);
        bindSide();
        return;
      }
    }
    var r2 = renderIndex();
    side.innerHTML = r2.side;
    main.innerHTML = r2.main;
    bindIndex();
    bindSide();
  }

  function bindSide() {
    document.querySelectorAll(".cat-item").forEach(function (b) {
      b.addEventListener("click", function () {
        activeCategory = b.getAttribute("data-cat");
        if (location.hash !== "#/" && location.hash !== "") location.hash = "#/";
        else render();
      });
    });
  }

  function bindIndex() {
    document.querySelectorAll(".index-table tbody tr[data-id]").forEach(function (tr) {
      tr.addEventListener("click", function () {
        location.hash = "#/case/" + encodeURIComponent(tr.getAttribute("data-id"));
      });
    });
    var kw = document.getElementById("kw");
    if (kw) {
      kw.addEventListener("input", function () { keyword = kw.value; render(); });
      kw.addEventListener("keydown", function (e) { e.stopPropagation(); });
      // 保持焦点
      if (keyword) { kw.focus(); kw.setSelectionRange(kw.value.length, kw.value.length); }
    }
  }

  /* ---------- 编辑模式开关 / 导出 / 还原 ---------- */
  function toggleEdit() {
    editing = !editing;
    document.body.classList.toggle("editing", editing);
    document.getElementById("btn-edit").textContent = editing ? "退出编辑" : "编辑模式";
    render();
  }

  function exportData() {
    var header =
"/* ============================================================\n" +
" * 案件档案馆 · 卷宗数据（由馆内编辑模式导出）\n" +
" * 将本文件替换仓库中的 cases.js 并提交，即可把修改同步到线上。\n" +
" * ============================================================ */\n\n" +
"window.CASES_DATA = ";
    var blob = new Blob([header + JSON.stringify(CASES, null, 2) + ";\n"],
      { type: "text/javascript;charset=utf-8" });
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "cases.js";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* 导入：接受导出的 cases.js（window.CASES_DATA = [...]）或纯 JSON 数组 */
  function importData(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var text = String(reader.result || "");
      var data = null;
      try { data = JSON.parse(text); } catch (e) {
        var m = text.match(/CASES_DATA\s*=\s*(\[[\s\S]*\])\s*;?\s*$/);
        if (m) { try { data = JSON.parse(m[1]); } catch (e2) { /* fallthrough */ } }
      }
      if (!Array.isArray(data) || !data.length || !data[0].id || !data[0].title) {
        alert("导入失败：文件内容不是有效的卷宗数据。\n请使用本站导出的 cases.js，或包含案件数组的 JSON 文件。");
        return;
      }
      if (!confirm("导入将覆盖当前全部卷宗数据（含本机修改），共 " + data.length + " 份卷宗。确定导入吗？")) return;
      CASES = data;
      persist();
      activeCategory = "全部";
      keyword = "";
      location.hash = "#/";
      render();
    };
    reader.readAsText(file, "utf-8");
  }

  window.addEventListener("hashchange", render);

  document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("btn-new").addEventListener("click", function () { location.hash = "#/new"; });
    document.getElementById("btn-edit").addEventListener("click", toggleEdit);
    document.getElementById("btn-export").addEventListener("click", exportData);
    var fileInput = document.getElementById("import-file");
    document.getElementById("btn-import").addEventListener("click", function () { fileInput.click(); });
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) importData(fileInput.files[0]);
      fileInput.value = "";
    });
    render();
  });
})();
