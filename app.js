window.onerror = function (m) {
  var d = document.createElement("div");
  d.style.cssText = "position:fixed;left:0;right:0;bottom:0;background:#b00020;color:#fff;padding:8px;font-size:12px;z-index:99";
  d.textContent = "Error: " + m;
  document.body.appendChild(d);
};
function dlg(title, def, withInput, cb) {
  var i = $("mi");
  $("mt").textContent = title;
  i.value = def || "";
  i.classList.toggle("hide", !withInput);
  $("modal").classList.remove("hide");
  if (withInput) setTimeout(function () { i.focus(); i.select(); }, 50);
  function close() { $("modal").classList.add("hide"); }
  $("mc").onclick = close;
  $("mo").onclick = function () { var v = i.value; close(); cb(withInput ? v : true); };
  i.onkeydown = function (e) { if (e.key === "Enter") $("mo").onclick(); };
}
var KEY = "pocketcode-v2", OLD = "live-editor-files-v1";
var db, proj, cur, timer;
var $ = function (id) { return document.getElementById(id); };
var STARTER = {
  "index.html": '<!DOCTYPE html>\n<html>\n<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n  <h1>Hello!</h1>\n  <button id="btn">Tap me</button>\n  <p id="out"></p>\n  <script src="script.js"><\/script>\n</body>\n</html>',
  "style.css": 'body {\n  font-family: sans-serif;\n  text-align: center;\n  padding: 30px;\n  background: #eef3ff;\n}\nbutton {\n  padding: 10px 20px;\n  font-size: 18px;\n}',
  "script.js": 'var n = 0;\ndocument.getElementById("btn").onclick = function () {\n  n++;\n  document.getElementById("out").textContent = "Taps: " + n;\n};'
};

function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function mk(name, files) { return { id: uid(), name: name, files: JSON.parse(JSON.stringify(files)), updated: Date.now() }; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) {} }
function load() {
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) {}
  if (!db || !db.projects) {
    db = { projects: [] };
    try {
      var o = JSON.parse(localStorage.getItem(OLD));
      if (o && o["index.html"]) db.projects.push(mk("My first project", o));
    } catch (e) {}
    save();
  }
}

/* ---------- Home: project list ---------- */
function renderHome() {
  var box = $("projects");
  box.innerHTML = "";
  if (!db.projects.length) {
    box.innerHTML = '<div class="empty">No projects yet.<br>Tap "+ New project" to start.</div>';
    return;
  }
  db.projects.slice().sort(function (a, b) { return b.updated - a.updated; }).forEach(function (p) {
    var c = document.createElement("div");
    c.className = "card";
    var n = Object.keys(p.files).length;
    c.innerHTML = '<div class="info"><div class="nm"></div><div class="sub">' + n + ' file' + (n === 1 ? "" : "s") + '</div></div>';
    c.querySelector(".nm").textContent = "📁 " + p.name;
    c.querySelector(".info").onclick = function () { openProject(p); };
    var r = document.createElement("button"); r.textContent = "✎";
    r.onclick = function () {
      dlg("Rename project", p.name, true, function (nm) {
        if (nm && nm.trim()) { p.name = nm.trim(); save(); renderHome(); }
      });
    };
    var d = document.createElement("button"); d.textContent = "🗑";
    d.onclick = function () {
      dlg('Delete project "' + p.name + '" and all its files?', "", false, function () {
        db.projects = db.projects.filter(function (x) { return x !== p; }); save(); renderHome();
      });
    };
    c.appendChild(r); c.appendChild(d);
    box.appendChild(c);
  });
}

$("newProject").onclick = function () {
  dlg("New project name", "", true, function (nm) {
    if (!nm || !nm.trim()) return;
    var p = mk(nm.trim(), STARTER);
    db.projects.push(p); save(); openProject(p);
  });
};

/* ---------- Editor ---------- */
function openProject(p) {
  proj = p;
  cur = p.files["index.html"] != null ? "index.html" : (Object.keys(p.files)[0] || null);
  $("home").classList.add("hide");
  $("editor").classList.remove("hide");
  $("drawer").classList.add("hide");
  $("pname").textContent = "📁 " + p.name;
  showFile(); run();
}

function showFile() {
  $("fname").textContent = cur || "No file";
  $("code").value = cur ? proj.files[cur] : "";
  $("code").disabled = !cur;
}

function touch() { proj.updated = Date.now(); save(); }

$("code").addEventListener("input", function (e) {
  if (!cur) return;
  if (e.inputType === "insertText" && e.data && e.data.length === 1) afterType(e.data);
  else if (e.inputType === "insertLineBreak" || e.inputType === "insertParagraph") afterEnter();
  proj.files[cur] = $("code").value; touch();
  clearTimeout(timer); timer = setTimeout(run, 400);
});
$("code").addEventListener("keydown", function (e) {
  if (e.key === "Tab") { e.preventDefault(); insert("  "); }
});
function insert(t) {
  var c = $("code");
  if (c.disabled) return;
  c.setRangeText(t, c.selectionStart, c.selectionEnd, "end");
  c.focus(); c.dispatchEvent(new Event("input"));
}

$("back").onclick = function () {
  $("editor").classList.add("hide");
  $("home").classList.remove("hide");
  renderHome();
};

/* ---------- Smart typing: auto-close + auto-indent ---------- */
var PAIRS = { "(": ")", "{": "}", "[": "]", '"': '"', "'": "'" };
var VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|param|source|track|wbr)$/i;
function isHtml() { return /\.html?$/i.test(cur || ""); }

function afterType(ch) {
  var c = $("code");
  if (c.disabled) return;
  var v = c.value, s = c.selectionStart, prev = v[s - 2] || "", next = v[s] || "", ed = false;
  if (next === ch && ")}]\"'".indexOf(ch) >= 0) {
    c.setRangeText("", s, s + 1, "start"); ed = true;
  } else if (PAIRS[ch]) {
    if (!((ch === '"' || ch === "'") && (/\w/.test(prev) || /\w/.test(next)))) {
      c.setRangeText(PAIRS[ch], s, s, "start"); ed = true;
    }
  } else if (ch === ">" && isHtml()) {
    var m = /<([a-zA-Z][\w-]*)(\s[^<>]*)?>$/.exec(v.slice(0, s));
    if (m && !VOID.test(m[1]) && !/\/\s*>$/.test(m[0])) {
      c.setRangeText("</" + m[1] + ">", s, s, "start"); ed = true;
    }
  }
  if (ed) c.dispatchEvent(new Event("input"));
}

function afterEnter() {
  var c = $("code");
  if (c.disabled) return;
  var v = c.value, s = c.selectionStart, before = v.slice(0, s - 1);
  var line = before.slice(before.lastIndexOf("\n") + 1), ind = /^[ \t]*/.exec(line)[0];
  var prev = before.slice(-1), next = v[s] || "", more = false, between = false;
  if (prev && "{[(".indexOf(prev) >= 0) {
    more = true; between = PAIRS[prev] === next;
  } else if (isHtml() && prev === ">") {
    var m = /<([a-zA-Z][\w-]*)(\s[^<>]*)?>$/.exec(before);
    if (m && !VOID.test(m[1]) && !/\/\s*>$/.test(m[0])) {
      more = true; between = v.slice(s).indexOf("</" + m[1]) === 0;
    }
  }
  var add = ind + (more ? "  " : "");
  if (between) {
    c.setRangeText(add + "\n" + ind, s, s, "start");
    c.selectionStart = c.selectionEnd = s + add.length;
  } else if (add) {
    c.setRangeText(add, s, s, "end");
  } else return;
  c.dispatchEvent(new Event("input"));
}

/* ---------- Preview: inline linked css/js by path ---------- */
function norm(ref) {
  if (/^([a-z]+:|\/\/)/i.test(ref)) return null;
  var out = [];
  ref.split("/").forEach(function (s) { if (s === "..") out.pop(); else if (s && s !== ".") out.push(s); });
  return out.join("/");
}
function build() {
  var f = proj.files, html = f["index.html"];
  if (html == null) return '<p style="font-family:sans-serif;padding:20px">Add an <b>index.html</b> file to see the preview.</p>';
  html = html.replace(/<link[^>]*href=["']([^"']+)["'][^>]*>/gi, function (m, h) {
    var p = norm(h);
    return p && f[p] != null && /stylesheet/i.test(m) ? "<style>" + f[p] + "</style>" : m;
  });
  html = html.replace(/<script([^>]*?)src=["']([^"']+)["']([^>]*)>\s*<\/script>/gi, function (m, a, s) {
    var p = norm(s);
    return p && f[p] != null ? "<script>" + f[p].replace(/<\/script/gi, "<\\/script") + "<\/script>" : m;
  });
  return html;
}
function run() { $("frame").srcdoc = build(); }

/* ---------- File drawer ---------- */
function renderTree() {
  var t = $("tree"), seen = {};
  t.innerHTML = "";
  Object.keys(proj.files).sort().forEach(function (path) {
    var parts = path.split("/"), acc = "";
    for (var i = 0; i < parts.length - 1; i++) {
      acc += parts[i] + "/";
      if (!seen[acc]) {
        seen[acc] = 1;
        var d = document.createElement("div");
        d.className = "row dir"; d.style.paddingLeft = (6 + i * 14) + "px";
        d.textContent = "📂 " + parts[i];
        t.appendChild(d);
      }
    }
    var r = document.createElement("div");
    r.className = "row file" + (path === cur ? " cur" : "");
    r.style.paddingLeft = (6 + (parts.length - 1) * 14) + "px";
    var n = document.createElement("span"); n.className = "n"; n.textContent = parts[parts.length - 1];
    var rn = document.createElement("button"); rn.className = "mini"; rn.textContent = "✎";
    var del = document.createElement("button"); del.className = "mini"; del.textContent = "🗑";
    r.appendChild(n); r.appendChild(rn); r.appendChild(del);
    n.onclick = function () { cur = path; showFile(); $("drawer").classList.add("hide"); };
    rn.onclick = function (e) {
      e.stopPropagation();
      dlg("Rename / move file", path, true, function (np) {
        np = np && np.trim().replace(/^\/+/, "");
        if (!np || np === path) return;
        if (proj.files[np] != null) { dlg("That name already exists", "", false, function () {}); return; }
        proj.files[np] = proj.files[path]; delete proj.files[path];
        if (cur === path) cur = np;
        touch(); renderTree(); showFile(); run();
      });
    };
    del.onclick = function (e) {
      e.stopPropagation();
      dlg("Delete " + path + "?", "", false, function () {
        delete proj.files[path];
        if (cur === path) cur = Object.keys(proj.files)[0] || null;
        touch(); renderTree(); showFile(); run();
      });
    };
    t.appendChild(r);
  });
}
$("filesBtn").onclick = function () { renderTree(); $("drawer").classList.remove("hide"); };
$("closeDrawer").onclick = function () { $("drawer").classList.add("hide"); };
$("addFile").onclick = function () {
  dlg("File name (folder/name.ext for folders)", "", true, function (p) {
    p = p && p.trim().replace(/^\/+/, "");
    if (!p) return;
    if (proj.files[p] != null) { dlg("That file already exists", "", false, function () {}); return; }
    proj.files[p] = ""; cur = p; touch();
    renderTree(); showFile(); run();
  });
};

/* ---------- Symbol bar + view modes ---------- */
["Tab", "<", ">", "/", "=", '"', "'", ";", "(", ")", "{", "}", "[", "]", ":", "#", ".", "!"].forEach(function (k) {
  var b = document.createElement("button");
  b.textContent = k === "Tab" ? "⇥" : k;
  b.addEventListener("mousedown", function (ev) { ev.preventDefault(); });
  b.onclick = function () { if (k === "Tab") return insert("  "); insert(k); afterType(k); };
  $("keys").appendChild(b);
});
document.querySelectorAll("[data-v]").forEach(function (b) {
  b.onclick = function () {
    document.querySelectorAll("[data-v]").forEach(function (x) { x.classList.remove("on"); });
    b.classList.add("on");
    var v = b.dataset.v;
    $("editorWrap").classList.toggle("hide", v === "view");
    $("previewWrap").classList.toggle("hide", v === "code");
    if (v !== "code") run();
  };
});

/* ---------- Install app button ---------- */
var deferred;
window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; });
window.addEventListener("appinstalled", function () { deferred = null; $("installBtn").classList.add("hide"); });
if (window.matchMedia("(display-mode: standalone)").matches) $("installBtn").classList.add("hide");
function diag(cb) {
  var out = [];
  out.push("Opened as installed app: " + window.matchMedia("(display-mode: standalone)").matches);
  out.push("Install event from Chrome: " + (deferred ? "yes" : "no"));
  var sw = navigator.serviceWorker;
  out.push("Service worker: " + (sw ? (sw.controller ? "controlling" : "not controlling yet") : "unsupported"));
  Promise.all(["manifest.json", "icon-192.png", "icon-512.png"].map(function (u) {
    return fetch(u, { cache: "no-store" }).then(function (r) { return u + ": " + r.status; }).catch(function () { return u + ": failed"; });
  })).then(function (r) { cb(out.concat(r).join("\n")); });
}
$("installBtn").onclick = function () {
  if (deferred) {
    deferred.prompt();
    deferred.userChoice.then(function () { deferred = null; });
  } else {
    diag(function (t) {
      dlg("Chrome did not offer the install.\n\n" + t + "\n\nSend me a screenshot of this. You can also try the menu (⋮) > Install app.", "", false, function () {});
    });
  }
};

load();
renderHome();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", function () { navigator.serviceWorker.register("sw.js"); });
}
