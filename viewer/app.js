import {
  PAGE_SIZE,
  METRIC_MODAL,
  escapeHtml,
  shortPath,
  strategyMeta,
  severityPill,
  cmsCategoryPill,
  cmsCategoryMeta,
  completenessTagPill,
  priorityPill,
  statusPill,
  statusMatchesFilter,
  metricTone,
  infoButton,
  metricCard,
  covClass,
  formatGenerated,
} from "./helpers.js";
import { parseReport } from "./parse.js";

var state = {
  report: null,
  filename: "",
  issuesPage: 0,
  cmsIssuesPage: 0,
  completenessPage: 0,
  coveragePage: 0,
  issueQuery: "",
  issueSeverity: "all",
  issueStrategy: "all",
  cmsQuery: "",
  cmsSeverity: "all",
  cmsCategory: "all",
  completenessQuery: "",
  completenessPriority: "all",
  completenessKind: "all",
  completenessTag: "all",
  coverageQuery: "",
  coverageSort: "lines-asc",
  modal: null,
};

var el = {
  dropzone: document.getElementById("dropzone"),
  dropError: document.getElementById("dropzone-error"),
  fileInput: document.getElementById("file-input"),
  report: document.getElementById("report"),
  generated: document.getElementById("report-generated"),
  filename: document.getElementById("report-filename"),
  qualityHero: document.getElementById("quality-hero"),
  cmsHero: document.getElementById("cms-migration-hero"),
  completenessHero: document.getElementById("completeness-hero"),
  summary: document.getElementById("summary-strip"),
  strategies: document.getElementById("strategies"),
  accordions: document.getElementById("accordions"),
  expand: document.getElementById("btn-expand"),
  collapse: document.getElementById("btn-collapse"),
  modal: document.getElementById("detail-modal"),
  modalTitle: document.getElementById("modal-title"),
  modalSub: document.getElementById("modal-sub"),
  modalBody: document.getElementById("modal-body"),
  tip: document.getElementById("floating-tip"),
};

/* ---------- Floating tooltip (viewport-aware) ---------- */

function hideTip() {
  if (!el.tip) return;
  el.tip.hidden = true;
  el.tip.textContent = "";
}

function placeTip(anchor) {
  if (!el.tip || !anchor) return;
  var text = anchor.getAttribute("data-tip");
  if (!text) {
    hideTip();
    return;
  }
  el.tip.hidden = false;
  el.tip.textContent = text;

  var rect = anchor.getBoundingClientRect();
  var tipRect = el.tip.getBoundingClientRect();
  var gap = 8;
  var left = rect.right - tipRect.width;
  var top = rect.bottom + gap;

  if (left < 8) left = 8;
  if (left + tipRect.width > window.innerWidth - 8) {
    left = Math.max(8, window.innerWidth - tipRect.width - 8);
  }
  if (top + tipRect.height > window.innerHeight - 8) {
    top = rect.top - tipRect.height - gap;
  }
  if (top < 8) top = 8;

  el.tip.style.left = Math.round(left) + "px";
  el.tip.style.top = Math.round(top) + "px";
}

function bindTipEvents(root) {
  if (!root) return;
  Array.prototype.forEach.call(root.querySelectorAll(".info-tip[data-tip]"), function (btn) {
    if (btn.getAttribute("data-tip-bound")) return;
    btn.setAttribute("data-tip-bound", "1");
    btn.addEventListener("mouseenter", function () {
      placeTip(btn);
    });
    btn.addEventListener("focus", function () {
      placeTip(btn);
    });
    btn.addEventListener("mouseleave", hideTip);
    btn.addEventListener("blur", hideTip);
    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      e.preventDefault();
    });
  });
}

/* ---------- Shared filters ---------- */

function uniqueStrategies(issues) {
  var seen = {};
  var list = [];
  (issues || []).forEach(function (issue) {
    var meta = strategyMeta(issue.strategy);
    var key = meta.id || meta.title;
    if (!key || seen[key]) return;
    seen[key] = true;
    list.push({ id: meta.id || meta.title, title: meta.title });
  });
  list.sort(function (a, b) {
    return a.title.localeCompare(b.title);
  });
  return list;
}

function issueMatchesStrategy(issue, strategyFilter) {
  if (!strategyFilter || strategyFilter === "all") return true;
  var meta = strategyMeta(issue.strategy);
  return (
    meta.id === strategyFilter ||
    meta.title === strategyFilter ||
    String(issue.strategy) === strategyFilter
  );
}

function filterIssues(opts) {
  opts = opts || {};
  var q = String(opts.query || "").trim().toLowerCase();
  var severity = opts.severity || "all";
  var strategy = opts.strategy || "all";
  return (state.report.issues || []).filter(function (issue) {
    if (severity !== "all" && issue.severity !== severity) return false;
    if (!issueMatchesStrategy(issue, strategy)) return false;
    if (!q) return true;
    var title = strategyMeta(issue.strategy).title.toLowerCase();
    return (
      issue.file.toLowerCase().indexOf(q) !== -1 ||
      issue.rule.toLowerCase().indexOf(q) !== -1 ||
      issue.message.toLowerCase().indexOf(q) !== -1 ||
      String(issue.strategy).toLowerCase().indexOf(q) !== -1 ||
      title.indexOf(q) !== -1
    );
  });
}

function filterTests(opts) {
  opts = opts || {};
  var q = String(opts.query || "").trim().toLowerCase();
  var status = opts.status || "all";
  return (state.report.tests || []).filter(function (row) {
    if (!statusMatchesFilter(row.status, status)) return false;
    if (!q) return true;
    return (
      row.file.toLowerCase().indexOf(q) !== -1 ||
      row.name.toLowerCase().indexOf(q) !== -1 ||
      row.status.toLowerCase().indexOf(q) !== -1
    );
  });
}

function filteredCoverage() {
  var q = state.coverageQuery.trim().toLowerCase();
  var rows = state.report.coverage.filter(function (row) {
    return !q || row.file.toLowerCase().indexOf(q) !== -1;
  });

  var sort = state.coverageSort;
  rows.sort(function (a, b) {
    if (sort === "lines-asc") return a.lines - b.lines;
    if (sort === "lines-desc") return b.lines - a.lines;
    if (sort === "name") return a.file.localeCompare(b.file);
    return 0;
  });
  return rows;
}

function issuesToolbarHtml(ids, opts) {
  opts = opts || {};
  var strategies = uniqueStrategies(state.report.issues);
  var strategyOptions =
    '<option value="all">All strategies</option>' +
    strategies
      .map(function (s) {
        return (
          '<option value="' +
          escapeHtml(s.id) +
          '">' +
          escapeHtml(s.title) +
          "</option>"
        );
      })
      .join("");

  return (
    '<div class="acc__toolbar">' +
    '<input class="field" id="' +
    ids.query +
    '" type="search" placeholder="Search file, rule, strategy, message…" autocomplete="off" />' +
    '<select class="field select" id="' +
    ids.severity +
    '">' +
    '<option value="all">All severities</option>' +
    '<option value="error">Errors</option>' +
    '<option value="warning">Warnings</option>' +
    '<option value="info">Info</option>' +
    "</select>" +
    '<select class="field select" id="' +
    ids.strategy +
    '"' +
    (opts.lockStrategy ? " disabled" : "") +
    ">" +
    strategyOptions +
    "</select>" +
    "</div>" +
    '<div class="acc__scroll" data-results></div>' +
    '<div class="pager" data-pager></div>'
  );
}

function testsToolbarHtml(ids, opts) {
  opts = opts || {};
  return (
    '<div class="acc__toolbar">' +
    '<input class="field" id="' +
    ids.query +
    '" type="search" placeholder="Search file or test name…" autocomplete="off" />' +
    '<select class="field select" id="' +
    ids.status +
    '"' +
    (opts.lockStatus ? " disabled" : "") +
    ">" +
    '<option value="all">All statuses</option>' +
    '<option value="passed">Passed</option>' +
    '<option value="failed">Failed</option>' +
    '<option value="pending">Pending / skipped</option>' +
    '<option value="todo">Todo</option>' +
    "</select>" +
    "</div>" +
    '<div class="acc__scroll" data-results></div>' +
    '<div class="pager" data-pager></div>'
  );
}

function paintPager(pager, total, page, onPrev, onNext) {
  var totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (page > totalPages - 1) page = totalPages - 1;
  pager.innerHTML =
    "<span>" +
    total +
    " shown · page " +
    (page + 1) +
    " / " +
    totalPages +
    "</span>" +
    '<div class="pager__btns">' +
    '<button type="button" class="btn btn--ghost" data-prev' +
    (page === 0 ? " disabled" : "") +
    ">Prev</button>" +
    '<button type="button" class="btn btn--ghost" data-next' +
    (page >= totalPages - 1 ? " disabled" : "") +
    ">Next</button>" +
    "</div>";
  pager.querySelector("[data-prev]").onclick = onPrev;
  pager.querySelector("[data-next]").onclick = onNext;
  return page;
}

function pathCopyCell(filePath) {
  return (
    '<td class="path path--copy" tabindex="0" role="button" data-copy-path="' +
    escapeHtml(filePath) +
    '" title="Click to copy full path">' +
    escapeHtml(shortPath(filePath)) +
    "</td>"
  );
}

function copyPathToClipboard(text, cell) {
  if (!text) return;
  function flash() {
    if (!cell) return;
    cell.classList.add("is-copied");
    cell.setAttribute("title", "Copied!");
    window.setTimeout(function () {
      cell.classList.remove("is-copied");
      cell.setAttribute("title", "Click to copy full path");
    }, 1200);
  }
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(flash).catch(function () {
      fallbackCopy(text, flash);
    });
    return;
  }
  fallbackCopy(text, flash);
}

function fallbackCopy(text, done) {
  var ta = document.createElement("textarea");
  ta.value = text;
  ta.setAttribute("readonly", "");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (done) done();
  } catch (e) {
    /* ignore */
  }
  document.body.removeChild(ta);
}

function paintIssuesInto(root, filterState, pageRef) {
  var rows = filterIssues(filterState);
  var page = pageRef.get();
  var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page > totalPages - 1) page = totalPages - 1;
  pageRef.set(page);
  var start = page * PAGE_SIZE;
  var pageRows = rows.slice(start, start + PAGE_SIZE);

  var tableRows = pageRows
    .map(function (issue) {
      var meta = strategyMeta(issue.strategy);
      return (
        "<tr>" +
        pathCopyCell(issue.file) +
        "<td>" +
        escapeHtml(issue.line) +
        "</td>" +
        '<td title="' +
        escapeHtml(meta.blurb) +
        '">' +
        escapeHtml(meta.title) +
        "</td>" +
        '<td class="mono">' +
        escapeHtml(issue.rule) +
        "</td>" +
        "<td>" +
        severityPill(issue.severity) +
        "</td>" +
        "<td>" +
        escapeHtml(issue.message) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  var results = root.querySelector("[data-results]");
  results.innerHTML = pageRows.length
    ? '<div class="table-wrap"><table class="data data--issues"><colgroup>' +
      '<col class="col-file" /><col class="col-line" /><col class="col-strategy" />' +
      '<col class="col-rule" /><col class="col-sev" /><col class="col-msg" />' +
      "</colgroup><thead><tr>" +
      "<th>File</th><th>Line</th><th>Strategy</th><th>Rule</th><th>Severity</th><th>Message</th>" +
      "</tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div>"
    : '<p class="empty">No issues match this filter.</p>';

  var pager = root.querySelector("[data-pager]");
  paintPager(
    pager,
    rows.length,
    page,
    function () {
      pageRef.set(Math.max(0, pageRef.get() - 1));
      paintIssuesInto(root, filterState, pageRef);
    },
    function () {
      pageRef.set(pageRef.get() + 1);
      paintIssuesInto(root, filterState, pageRef);
    }
  );
}

function paintTestsInto(root, filterState, pageRef) {
  var rows = filterTests(filterState);
  var page = pageRef.get();
  var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page > totalPages - 1) page = totalPages - 1;
  pageRef.set(page);
  var start = page * PAGE_SIZE;
  var pageRows = rows.slice(start, start + PAGE_SIZE);

  var tableRows = pageRows
    .map(function (row) {
      return (
        "<tr>" +
        '<td class="path" title="' +
        escapeHtml(row.file) +
        '">' +
        escapeHtml(shortPath(row.file)) +
        "</td>" +
        "<td>" +
        escapeHtml(row.name) +
        "</td>" +
        "<td>" +
        statusPill(row.status) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  var results = root.querySelector("[data-results]");
  results.innerHTML = pageRows.length
    ? '<div class="table-wrap"><table class="data data--tests"><colgroup>' +
      '<col class="col-file" /><col class="col-test" /><col class="col-sev" />' +
      "</colgroup><thead><tr>" +
      "<th>File</th><th>Test</th><th>Status</th>" +
      "</tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div>"
    : '<p class="empty">No tests match this filter. Re-run the auditor to refresh Test Cases in the report.</p>';

  var pager = root.querySelector("[data-pager]");
  paintPager(
    pager,
    rows.length,
    page,
    function () {
      pageRef.set(Math.max(0, pageRef.get() - 1));
      paintTestsInto(root, filterState, pageRef);
    },
    function () {
      pageRef.set(pageRef.get() + 1);
      paintTestsInto(root, filterState, pageRef);
    }
  );
}

function failedHtml(files) {
  if (!files || !files.length) {
    return '<p class="empty">No failed tests in this report.</p>';
  }
  return (
    '<div class="acc__scroll">' +
    files
      .map(function (item) {
        var msgs = item.messages.length ? item.messages : ["(no message captured)"];
        var multi = msgs.length > 1;
        var blocks = msgs
          .map(function (msg, idx) {
            return (
              '<div class="fail-card__item">' +
              (multi
                ? '<p class="fail-card__item-label">Failure ' +
                  (idx + 1) +
                  " of " +
                  msgs.length +
                  "</p>"
                : "") +
              '<pre class="fail-card__pre">' +
              escapeHtml(msg) +
              "</pre>" +
              "</div>"
            );
          })
          .join("");
        return (
          '<article class="fail-card">' +
          '<div class="fail-card__head" title="' +
          escapeHtml(item.file) +
          '">' +
          escapeHtml(item.file) +
          (item.failCount
            ? ' <span class="acc__badge acc__badge--bad">' +
              item.failCount +
              " failed</span>"
            : "") +
          "</div>" +
          '<div class="fail-card__body">' +
          blocks +
          "</div>" +
          "</article>"
        );
      })
      .join("") +
    "</div>"
  );
}

/* ---------- Modal ---------- */

function closeModal() {
  if (!el.modal) return;
  el.modal.hidden = true;
  document.body.classList.remove("modal-open");
  state.modal = null;
  hideTip();
}

function openModal(config) {
  if (!el.modal || !state.report) return;
  state.modal = {
    kind: config.kind,
    title: config.title,
    sub: config.sub || "",
    severity: config.severity || "all",
    strategy: config.strategy || "all",
    status: config.status || "all",
    query: "",
    page: 0,
    lockStrategy: !!config.lockStrategy,
    lockStatus: !!config.lockStatus,
  };
  el.modalTitle.textContent = config.title;
  el.modalSub.textContent = config.sub || "";
  el.modal.hidden = false;
  document.body.classList.add("modal-open");
  paintModal();
  var closeBtn = document.getElementById("modal-close");
  if (closeBtn) closeBtn.focus();
}

function modalPageRef() {
  return {
    get: function () {
      return state.modal ? state.modal.page : 0;
    },
    set: function (v) {
      if (state.modal) state.modal.page = v;
    },
  };
}

function paintModal() {
  if (!state.modal || !el.modalBody) return;
  var m = state.modal;

  if (m.kind === "failed") {
    el.modalBody.innerHTML = failedHtml(state.report.failed);
    return;
  }

  if (m.kind === "tests") {
    el.modalBody.innerHTML = testsToolbarHtml(
      { query: "modal-test-q", status: "modal-test-status" },
      { lockStatus: m.lockStatus }
    );
    var tq = el.modalBody.querySelector("#modal-test-q");
    var ts = el.modalBody.querySelector("#modal-test-status");
    tq.value = m.query;
    ts.value = m.status;
    tq.addEventListener("input", function (e) {
      m.query = e.target.value;
      m.page = 0;
      paintTestsInto(
        el.modalBody,
        { query: m.query, status: m.status },
        modalPageRef()
      );
    });
    ts.addEventListener("change", function (e) {
      m.status = e.target.value;
      m.page = 0;
      paintTestsInto(
        el.modalBody,
        { query: m.query, status: m.status },
        modalPageRef()
      );
    });
    paintTestsInto(
      el.modalBody,
      { query: m.query, status: m.status },
      modalPageRef()
    );
    return;
  }

  if (m.kind === "issues") {
    el.modalBody.innerHTML = issuesToolbarHtml(
      {
        query: "modal-issue-q",
        severity: "modal-issue-sev",
        strategy: "modal-issue-strategy",
      },
      { lockStrategy: m.lockStrategy }
    );
    var iq = el.modalBody.querySelector("#modal-issue-q");
    var isev = el.modalBody.querySelector("#modal-issue-sev");
    var istr = el.modalBody.querySelector("#modal-issue-strategy");
    iq.value = m.query;
    isev.value = m.severity;
    istr.value = m.strategy;
    iq.addEventListener("input", function (e) {
      m.query = e.target.value;
      m.page = 0;
      paintIssuesInto(
        el.modalBody,
        { query: m.query, severity: m.severity, strategy: m.strategy },
        modalPageRef()
      );
    });
    isev.addEventListener("change", function (e) {
      m.severity = e.target.value;
      m.page = 0;
      paintIssuesInto(
        el.modalBody,
        { query: m.query, severity: m.severity, strategy: m.strategy },
        modalPageRef()
      );
    });
    istr.addEventListener("change", function (e) {
      m.strategy = e.target.value;
      m.page = 0;
      paintIssuesInto(
        el.modalBody,
        { query: m.query, severity: m.severity, strategy: m.strategy },
        modalPageRef()
      );
    });
    paintIssuesInto(
      el.modalBody,
      { query: m.query, severity: m.severity, strategy: m.strategy },
      modalPageRef()
    );
  }
}

/* ---------- Top sections ---------- */

function renderQualityHero(quality) {
  if (!el.qualityHero) return;
  if (!quality || !quality.Score) {
    el.qualityHero.hidden = true;
    el.qualityHero.innerHTML = "";
    return;
  }
  var gradeRaw = String(quality.Grade || "");
  var grade = gradeRaw.charAt(0) || "–";
  var gradeLabelMatch = gradeRaw.match(/\(([^)]+)\)/);
  var gradeLabel = gradeLabelMatch
    ? gradeLabelMatch[1]
    : gradeRaw.replace(/^[A-F]\s*/, "").trim();
  var tone = metricTone("Grade", grade);
  var scoreTone = metricTone("Score", quality.Score);
  var scoreNum = String(quality.Score).replace(/\/100$/, "");
  el.qualityHero.hidden = false;
  el.qualityHero.innerHTML =
    '<div class="quality-hero__glow" aria-hidden="true"></div>' +
    '<div class="quality-hero__score metric--' +
    scoreTone +
    '">' +
    '<p class="quality-hero__eyebrow">Quality score' +
    infoButton("Score") +
    "</p>" +
    '<p class="quality-hero__number">' +
    escapeHtml(scoreNum) +
    '<span class="quality-hero__of">/100</span></p>' +
    "</div>" +
    '<div class="quality-hero__grade metric--' +
    tone +
    '">' +
    '<p class="quality-hero__eyebrow">Grade' +
    infoButton("Grade") +
    "</p>" +
    '<p class="quality-hero__letter">' +
    escapeHtml(grade) +
    "</p>" +
    '<p class="quality-hero__label">' +
    escapeHtml(gradeLabel) +
    "</p>" +
    "</div>" +
    '<div class="quality-hero__copy">' +
    "<p>" +
    escapeHtml(
      quality.Summary ||
        "Suite health from static strategies, failures, and coverage."
    ) +
    "</p>" +
    '<p class="quality-hero__note">Total includes pending and todo tests — so Total is not always Passed + Failed.</p>' +
    "</div>";
  bindTipEvents(el.qualityHero);
}

function renderCmsMigrationHero(cms) {
  if (!el.cmsHero) return;
  if (!cms || !cms.readiness) {
    el.cmsHero.hidden = true;
    el.cmsHero.innerHTML = "";
    return;
  }
  var gradeRaw = String(cms.grade || "");
  var grade = gradeRaw.charAt(0) || "–";
  var gradeLabelMatch = gradeRaw.match(/\(([^)]+)\)/);
  var gradeLabel = gradeLabelMatch
    ? gradeLabelMatch[1]
    : gradeRaw.replace(/^[A-F]\s*/, "").trim();
  var tone = metricTone("Grade", grade);
  var scoreTone = metricTone("Readiness", cms.readiness);
  var scoreNum = String(cms.readiness).replace(/\/100$/, "");
  var fromLabel = cms.from.displayName || cms.from.id || "Source";
  var toLabel = cms.to.displayName || cms.to.id || "Target";

  el.cmsHero.hidden = false;
  el.cmsHero.innerHTML =
    '<div class="quality-hero__glow cms-hero__glow" aria-hidden="true"></div>' +
    '<div class="quality-hero__score metric--' +
    scoreTone +
    '">' +
    '<p class="quality-hero__eyebrow">CMS readiness' +
    infoButton("Readiness") +
    "</p>" +
    '<p class="quality-hero__number">' +
    escapeHtml(scoreNum) +
    '<span class="quality-hero__of">/100</span></p>' +
    "</div>" +
    '<div class="quality-hero__grade metric--' +
    tone +
    '">' +
    '<p class="quality-hero__eyebrow">Grade' +
    infoButton("Grade") +
    "</p>" +
    '<p class="quality-hero__letter">' +
    escapeHtml(grade) +
    "</p>" +
    '<p class="quality-hero__label">' +
    escapeHtml(gradeLabel) +
    "</p>" +
    "</div>" +
    '<div class="quality-hero__copy">' +
    '<p class="cms-hero__route">' +
    '<span class="cms-badge">' +
    escapeHtml(fromLabel) +
    "</span>" +
    '<span class="cms-hero__arrow" aria-hidden="true">→</span>' +
    '<span class="cms-badge cms-badge--target">' +
    escapeHtml(toLabel) +
    "</span>" +
    "</p>" +
    "<p>" +
    escapeHtml(
      cms.summary ||
        "How ready unit tests are for the CMS migration (separate from Quality Score)."
    ) +
    "</p>" +
    '<p class="quality-hero__note">CMS findings do not change the Quality Score — they are scored separately as migration readiness.</p>' +
    "</div>";
  bindTipEvents(el.cmsHero);
}

function renderCompletenessHero(comp) {
  if (!el.completenessHero) return;
  if (!comp || !comp.score) {
    el.completenessHero.hidden = true;
    el.completenessHero.innerHTML = "";
    return;
  }
  var gradeRaw = String(comp.grade || "");
  var grade = gradeRaw.charAt(0) || "–";
  var gradeLabelMatch = gradeRaw.match(/\(([^)]+)\)/);
  var gradeLabel = gradeLabelMatch
    ? gradeLabelMatch[1]
    : gradeRaw.replace(/^[A-F]\s*/, "").trim();
  var tone = metricTone("Grade", grade);
  var scoreTone = metricTone("Completeness", comp.score);
  var scoreNum = String(comp.score).replace(/\/100$/, "");
  var scanned = comp.sourcesScanned || "0";
  var withTests = comp.withTests || "0";
  var untested = comp.untested || "0";

  el.completenessHero.hidden = false;
  el.completenessHero.innerHTML =
    '<div class="quality-hero__glow completeness-hero__glow" aria-hidden="true"></div>' +
    '<div class="quality-hero__score metric--' +
    scoreTone +
    '">' +
    '<p class="quality-hero__eyebrow">Test completeness' +
    infoButton("Completeness") +
    "</p>" +
    '<p class="quality-hero__number">' +
    escapeHtml(scoreNum) +
    '<span class="quality-hero__of">/100</span></p>' +
    "</div>" +
    '<div class="quality-hero__grade metric--' +
    tone +
    '">' +
    '<p class="quality-hero__eyebrow">Grade' +
    infoButton("Grade") +
    "</p>" +
    '<p class="quality-hero__letter">' +
    escapeHtml(grade) +
    "</p>" +
    '<p class="quality-hero__label">' +
    escapeHtml(gradeLabel) +
    "</p>" +
    "</div>" +
    '<div class="quality-hero__copy">' +
    '<p class="cms-hero__route">' +
    '<span class="cms-badge">' +
    escapeHtml(String(scanned)) +
    " scanned</span>" +
    '<span class="cms-hero__arrow" aria-hidden="true">·</span>' +
    '<span class="cms-badge cms-badge--target">' +
    escapeHtml(String(withTests)) +
    " with tests</span>" +
    '<span class="cms-hero__arrow" aria-hidden="true">·</span>' +
    '<span class="cms-badge">' +
    escapeHtml(String(untested)) +
    " untested</span>" +
    "</p>" +
    "<p>" +
    escapeHtml(
      comp.summary ||
        "Which app modules still need unit tests — separate from Quality Score."
    ) +
    "</p>" +
    '<p class="quality-hero__note">Jest shows what ran. Completeness shows what is still missing and what to write next.</p>' +
    "</div>";
  bindTipEvents(el.completenessHero);
}

function renderSummaryStrip(summary, cms, completeness) {
  var order = [
    "Total tests",
    "Passed",
    "Failed",
    "Pending",
    "Todo",
    "Static errors",
    "Static warnings",
    "Static info",
  ];
  var html = "";
  order.forEach(function (key) {
    if (!(key in summary)) return;
    html += metricCard(key, summary[key], key, !!METRIC_MODAL[key]);
  });
  if (cms && cms.filesWithLegacyRefs !== undefined && cms.filesWithLegacyRefs !== "") {
    html += metricCard(
      "Legacy refs",
      cms.filesWithLegacyRefs,
      "Legacy refs",
      false
    );
  }
  if (completeness && completeness.untested !== undefined && completeness.untested !== "") {
    html += metricCard("Untested", completeness.untested, "Untested", false);
  }
  if (
    completeness &&
    completeness.highPriority !== undefined &&
    completeness.highPriority !== ""
  ) {
    html += metricCard(
      "High-risk gaps",
      completeness.highPriority,
      "High-risk gaps",
      false
    );
  }
  el.summary.innerHTML = html;
  bindTipEvents(el.summary);

  Array.prototype.forEach.call(
    el.summary.querySelectorAll("[data-open-metric]"),
    function (card) {
      function open() {
        var key = card.getAttribute("data-open-metric");
        var cfg = METRIC_MODAL[key];
        if (!cfg) return;
        openModal({
          kind: cfg.kind,
          title: cfg.title,
          sub: cfg.sub,
          severity: cfg.severity || "all",
          status: cfg.status || "all",
          lockStatus: cfg.kind === "tests" && cfg.status !== "all",
        });
      }
      card.addEventListener("click", function (e) {
        if (e.target.closest && e.target.closest(".info-tip")) return;
        open();
      });
      card.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          open();
        }
      });
    }
  );
}

function renderStrategies(strategies, issues) {
  if (!el.strategies) return;
  var list = strategies && strategies.length ? strategies.slice() : [];
  if (!list.length && issues && issues.length) {
    var map = {};
    issues.forEach(function (issue) {
      var meta = strategyMeta(issue.strategy);
      var id = meta.id || meta.title || "other";
      if (!map[id]) {
        map[id] = {
          title: meta.title,
          id: id,
          errors: 0,
          warnings: 0,
          infos: 0,
          total: 0,
        };
      }
      map[id].total++;
      if (issue.severity === "error") map[id].errors++;
      else if (issue.severity === "warning") map[id].warnings++;
      else map[id].infos++;
    });
    list = Object.keys(map).map(function (k) {
      return map[k];
    });
  }
  if (!list.length) {
    el.strategies.hidden = true;
    el.strategies.innerHTML = "";
    return;
  }

  var totalErr = 0;
  var totalWarn = 0;
  var totalInfo = 0;
  list.forEach(function (s) {
    totalErr += s.errors || 0;
    totalWarn += s.warnings || 0;
    totalInfo += s.infos || 0;
  });
  var worstTone = totalErr > 0 ? "bad" : totalWarn > 0 ? "warn" : "ok";
  var deckIndex = 0;

  function cardHtml(s, index) {
    var meta = strategyMeta(s.title);
    var blurb = meta.blurb;
    var tone = s.errors > 0 ? "bad" : s.warnings > 0 ? "warn" : "ok";
    var strategyKey = meta.id || s.title;
    return (
      '<article class="deck-card deck-card--' +
      tone +
      '" data-deck-card data-index="' +
      index +
      '" data-open-strategy="' +
      escapeHtml(strategyKey) +
      '" tabindex="-1" role="button" aria-label="' +
      escapeHtml(meta.title || s.title) +
      ' — view findings">' +
      '<p class="deck-card__kicker">Strategy ' +
      (index + 1) +
      " of " +
      list.length +
      "</p>" +
      '<p class="deck-card__title">' +
      escapeHtml(meta.title || s.title) +
      "</p>" +
      '<p class="deck-card__blurb">' +
      escapeHtml(blurb) +
      "</p>" +
      '<p class="deck-card__counts">' +
      '<span class="tone-bad">' +
      s.errors +
      " errors</span> · <span class=\"tone-warn\">" +
      s.warnings +
      " warnings</span> · <span class=\"tone-muted\">" +
      s.infos +
      " info</span>" +
      "</p>" +
      '<p class="deck-card__hint">Open findings</p>' +
      "</article>"
    );
  }

  el.strategies.hidden = false;
  el.strategies.innerHTML =
    '<div class="strat-deck" data-deck>' +
    '<button type="button" class="strat-deck__sleeve strat-deck__sleeve--' +
    worstTone +
    '" data-deck-toggle aria-expanded="false">' +
    '<div class="strat-deck__stack" aria-hidden="true">' +
    '<span class="strat-deck__ghost strat-deck__ghost--3"></span>' +
    '<span class="strat-deck__ghost strat-deck__ghost--2"></span>' +
    '<span class="strat-deck__ghost strat-deck__ghost--1"></span>' +
    '<span class="strat-deck__top"></span>' +
    "</div>" +
    '<div class="strat-deck__copy">' +
    '<p class="strat-deck__label">Strategies deck</p>' +
    '<p class="strat-deck__summary">' +
    list.length +
    " check" +
    (list.length === 1 ? "" : "s") +
    " tucked away · " +
    totalErr +
    " errors · " +
    totalWarn +
    " warnings · " +
    totalInfo +
    " info</p>" +
    '<p class="strat-deck__nudge">Most people skip this — fan open only if you want the detail.</p>' +
    "</div>" +
    '<span class="strat-deck__action">Fan open</span>' +
    "</button>" +
    '<div class="strat-deck__fan" data-deck-fan hidden>' +
    '<div class="strat-deck__stage" data-deck-stage>' +
    list.map(cardHtml).join("") +
    "</div>" +
    '<div class="strat-deck__nav">' +
    '<button type="button" class="btn btn--ghost" data-deck-prev aria-label="Previous strategy">‹</button>' +
    '<span class="strat-deck__pos" data-deck-pos></span>' +
    '<button type="button" class="btn btn--ghost" data-deck-next aria-label="Next strategy">›</button>' +
    '<button type="button" class="btn btn--ghost strat-deck__putaway" data-deck-close>Put away</button>' +
    "</div>" +
    "</div>" +
    "</div>";

  var root = el.strategies.querySelector("[data-deck]");
  var sleeve = root.querySelector("[data-deck-toggle]");
  var fan = root.querySelector("[data-deck-fan]");
  var stage = root.querySelector("[data-deck-stage]");
  var posEl = root.querySelector("[data-deck-pos]");
  var cards = root.querySelectorAll("[data-deck-card]");

  function paintDeck() {
    Array.prototype.forEach.call(cards, function (card) {
      var i = Number(card.getAttribute("data-index"));
      var offset = i - deckIndex;
      var abs = Math.abs(offset);
      card.classList.toggle("is-active", offset === 0);
      card.classList.toggle("is-behind", offset !== 0);
      card.tabIndex = offset === 0 ? 0 : -1;
      card.setAttribute("aria-hidden", offset === 0 ? "false" : "true");
      card.style.zIndex = String(100 - abs);
      card.style.opacity = String(Math.max(0.28, 1 - abs * 0.28));
      card.style.transform =
        "translateX(" +
        offset * 14 +
        "px) translateY(" +
        abs * 6 +
        "px) scale(" +
        (1 - abs * 0.045) +
        ") rotate(" +
        offset * 1.4 +
        "deg)";
      // Hide far cards from tab/paint noise
      card.style.visibility = abs > 3 ? "hidden" : "visible";
    });
    posEl.textContent = deckIndex + 1 + " / " + list.length;
  }

  function openFindings(key) {
    var meta = strategyMeta(key);
    openModal({
      kind: "issues",
      title: meta.title,
      sub: meta.blurb,
      strategy: meta.id || key,
      severity: "all",
      lockStrategy: true,
    });
  }

  function setExpanded(open) {
    fan.hidden = !open;
    sleeve.hidden = open;
    sleeve.setAttribute("aria-expanded", open ? "true" : "false");
    root.classList.toggle("is-open", open);
    if (open) {
      paintDeck();
      var active = stage.querySelector(".deck-card.is-active");
      if (active) active.focus();
    }
  }

  sleeve.addEventListener("click", function () {
    setExpanded(true);
  });

  root.querySelector("[data-deck-close]").addEventListener("click", function () {
    setExpanded(false);
    sleeve.focus();
  });

  root.querySelector("[data-deck-prev]").addEventListener("click", function () {
    deckIndex = (deckIndex - 1 + list.length) % list.length;
    paintDeck();
  });

  root.querySelector("[data-deck-next]").addEventListener("click", function () {
    deckIndex = (deckIndex + 1) % list.length;
    paintDeck();
  });

  Array.prototype.forEach.call(cards, function (card) {
    card.addEventListener("click", function () {
      var i = Number(card.getAttribute("data-index"));
      if (i !== deckIndex) {
        deckIndex = i;
        paintDeck();
        return;
      }
      openFindings(card.getAttribute("data-open-strategy"));
    });
    card.addEventListener("keydown", function (e) {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (Number(card.getAttribute("data-index")) === deckIndex) {
          openFindings(card.getAttribute("data-open-strategy"));
        }
      }
      if (e.key === "ArrowRight") {
        e.preventDefault();
        deckIndex = (deckIndex + 1) % list.length;
        paintDeck();
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        deckIndex = (deckIndex - 1 + list.length) % list.length;
        paintDeck();
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setExpanded(false);
        sleeve.focus();
      }
    });
  });

  paintDeck();
}

function accordionShell(id, title, subtitle, badgeText, badgeTone) {
  return (
    '<details class="acc" data-panel="' +
    id +
    '">' +
    '<summary class="acc__summary">' +
    '<div class="acc__heading">' +
    '<p class="acc__title">' +
    escapeHtml(title) +
    "</p>" +
    '<p class="acc__sub">' +
    escapeHtml(subtitle) +
    "</p>" +
    "</div>" +
    '<div class="acc__meta">' +
    '<span class="acc__badge' +
    (badgeTone ? " acc__badge--" + badgeTone : "") +
    '">' +
    escapeHtml(badgeText) +
    "</span>" +
    '<span class="acc__chevron" aria-hidden="true"></span>' +
    "</div>" +
    "</summary>" +
    '<div class="acc__body" data-body="' +
    id +
    '"><p class="empty">Open to load this section…</p></div>' +
    "</details>"
  );
}

function buildAccordions(report) {
  var errCount = report.issues.filter(function (i) {
    return i.severity === "error";
  }).length;
  var warnCount = report.issues.filter(function (i) {
    return i.severity === "warning";
  }).length;
  var infoCount = report.issues.filter(function (i) {
    return i.severity === "info";
  }).length;
  var issueTone = errCount > 0 ? "bad" : warnCount > 0 ? "warn" : "ok";

  var failedTests =
    (report.failedMeta && report.failedMeta.failedTests) ||
    Number(report.summary.Failed) ||
    0;
  var failedFiles =
    (report.failedMeta && report.failedMeta.filesWithFailures) ||
    (report.failed && report.failed.length) ||
    0;
  var failTone = failedTests > 0 ? "bad" : "ok";
  var covTone = report.coverage.length > 0 ? "ok" : "warn";

  var html =
    accordionShell(
      "issues",
      "Static Analysis Issues",
      errCount +
        " errors · " +
        warnCount +
        " warnings · " +
        infoCount +
        " info across strategies",
      String(report.issues.length),
      issueTone
    ) +
    accordionShell(
      "failed",
      "Failed Tests",
      failedTests +
        " failing tests across " +
        failedFiles +
        " file" +
        (failedFiles === 1 ? "" : "s"),
      String(failedTests),
      failTone
    );

  if (report.cmsMigration) {
    var cmsIssues = report.cmsMigration.issues || [];
    var legacyN = cmsIssues.filter(function (i) {
      return i.category === "legacy";
    }).length;
    var gapN = cmsIssues.filter(function (i) {
      return i.category === "gap";
    }).length;
    var progressN = cmsIssues.filter(function (i) {
      return i.category === "progress";
    }).length;
    var cmsTone = legacyN > 0 ? "warn" : gapN > 0 ? "warn" : "ok";
    var fromName =
      (report.cmsMigration.from && report.cmsMigration.from.displayName) ||
      "source";
    var toName =
      (report.cmsMigration.to && report.cmsMigration.to.displayName) || "target";
    html += accordionShell(
      "cms",
      "CMS Migration findings",
      fromName +
        " → " +
        toName +
        " · " +
        legacyN +
        " legacy · " +
        gapN +
        " gap · " +
        progressN +
        " progress",
      String(cmsIssues.length),
      cmsTone
    );
  }

  if (report.testCompleteness) {
    var recs = report.testCompleteness.recommendations || [];
    var missingN = recs.filter(function (r) {
      return r.tag === "missing";
    }).length;
    var weakN = recs.filter(function (r) {
      return r.tag === "weak-coverage";
    }).length;
    var perfN = recs.filter(function (r) {
      return r.tag === "perf-risk";
    }).length;
    var highN = recs.filter(function (r) {
      return r.priority === "high";
    }).length;
    var compTone = highN > 0 || missingN > 0 ? "warn" : recs.length ? "warn" : "ok";
    html += accordionShell(
      "completeness",
      "Missing tests / recommendations",
      missingN +
        " missing · " +
        weakN +
        " weak coverage · " +
        perfN +
        " perf/loading · " +
        highN +
        " high priority",
      String(recs.length),
      compTone
    );
  }

  html += accordionShell(
    "coverage",
    "Coverage",
    "Per-file statements, branches, functions, lines",
    report.coverage.length ? String(report.coverage.length) + " files" : "n/a",
    covTone
  );

  el.accordions.innerHTML = html;

  Array.prototype.forEach.call(
    el.accordions.querySelectorAll("details.acc"),
    function (details) {
      details.addEventListener("toggle", function () {
        if (details.open) ensurePanel(details.getAttribute("data-panel"));
      });
    }
  );
}

function accordionIssuesPageRef() {
  return {
    get: function () {
      return state.issuesPage;
    },
    set: function (v) {
      state.issuesPage = v;
    },
  };
}

function renderIssuesPanel() {
  var body = el.accordions.querySelector('[data-body="issues"]');
  if (!body) return;

  var needsShell = !body.querySelector("[data-results]");
  if (needsShell) {
    body.innerHTML = issuesToolbarHtml({
      query: "issue-q",
      severity: "issue-sev",
      strategy: "issue-strategy",
    });

    var q = body.querySelector("#issue-q");
    var sev = body.querySelector("#issue-sev");
    var strat = body.querySelector("#issue-strategy");
    q.value = state.issueQuery;
    sev.value = state.issueSeverity;
    strat.value = state.issueStrategy;

    q.addEventListener("input", function (e) {
      state.issueQuery = e.target.value;
      state.issuesPage = 0;
      paintIssuesInto(
        body,
        {
          query: state.issueQuery,
          severity: state.issueSeverity,
          strategy: state.issueStrategy,
        },
        accordionIssuesPageRef()
      );
    });
    sev.addEventListener("change", function (e) {
      state.issueSeverity = e.target.value;
      state.issuesPage = 0;
      paintIssuesInto(
        body,
        {
          query: state.issueQuery,
          severity: state.issueSeverity,
          strategy: state.issueStrategy,
        },
        accordionIssuesPageRef()
      );
    });
    strat.addEventListener("change", function (e) {
      state.issueStrategy = e.target.value;
      state.issuesPage = 0;
      paintIssuesInto(
        body,
        {
          query: state.issueQuery,
          severity: state.issueSeverity,
          strategy: state.issueStrategy,
        },
        accordionIssuesPageRef()
      );
    });
  }

  paintIssuesInto(
    body,
    {
      query: state.issueQuery,
      severity: state.issueSeverity,
      strategy: state.issueStrategy,
    },
    accordionIssuesPageRef()
  );
}

function renderFailedPanel() {
  var body = el.accordions.querySelector('[data-body="failed"]');
  if (!body) return;
  body.innerHTML = failedHtml(state.report.failed);
}

function renderCoveragePanel() {
  var body = el.accordions.querySelector('[data-body="coverage"]');
  if (!body) return;

  if (!state.report.coverage.length) {
    body.innerHTML =
      '<p class="empty">' +
      (state.report.rawEmptyCoverage
        ? "No coverage data found in the report."
        : "No coverage rows to display.") +
      "</p>";
    return;
  }

  var needsShell = !body.querySelector("[data-cov-results]");
  if (needsShell) {
    body.innerHTML =
      '<div class="acc__toolbar">' +
      '<input class="field" id="cov-q" type="search" placeholder="Filter by file path…" autocomplete="off" />' +
      '<select class="field select" id="cov-sort">' +
      '<option value="lines-asc">Lowest lines %</option>' +
      '<option value="lines-desc">Highest lines %</option>' +
      '<option value="name">File name</option>' +
      "</select>" +
      "</div>" +
      '<div class="acc__scroll" data-cov-results></div>' +
      '<div class="pager" data-cov-pager></div>';

    var q = body.querySelector("#cov-q");
    var sort = body.querySelector("#cov-sort");
    q.value = state.coverageQuery;
    sort.value = state.coverageSort;

    q.addEventListener("input", function (e) {
      state.coverageQuery = e.target.value;
      state.coveragePage = 0;
      paintCoverageResults(body);
    });
    sort.addEventListener("change", function (e) {
      state.coverageSort = e.target.value;
      state.coveragePage = 0;
      paintCoverageResults(body);
    });
  }

  paintCoverageResults(body);
}

function paintCoverageResults(body) {
  var rows = filteredCoverage();
  var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (state.coveragePage > totalPages - 1) state.coveragePage = totalPages - 1;
  var start = state.coveragePage * PAGE_SIZE;
  var pageRows = rows.slice(start, start + PAGE_SIZE);

  var tableRows = pageRows
    .map(function (row) {
      function cell(pct) {
        return (
          '<td class="cov ' +
          covClass(pct) +
          '">' +
          escapeHtml(pct) +
          "%</td>"
        );
      }
      return (
        "<tr>" +
        pathCopyCell(row.file) +
        cell(row.statements) +
        cell(row.branches) +
        cell(row.functions) +
        cell(row.lines) +
        "</tr>"
      );
    })
    .join("");

  var results = body.querySelector("[data-cov-results]");
  results.innerHTML = pageRows.length
    ? '<div class="table-wrap"><table class="data data--coverage"><colgroup>' +
      '<col class="col-file" /><col class="col-pct" /><col class="col-pct" />' +
      '<col class="col-pct" /><col class="col-pct" />' +
      "</colgroup><thead><tr>" +
      "<th>File</th><th>Statements</th><th>Branches</th><th>Functions</th><th>Lines</th>" +
      "</tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div>"
    : '<p class="empty">No coverage rows match this filter.</p>';

  var pager = body.querySelector("[data-cov-pager]");
  paintPager(
    pager,
    rows.length,
    state.coveragePage,
    function () {
      state.coveragePage = Math.max(0, state.coveragePage - 1);
      paintCoverageResults(body);
    },
    function () {
      state.coveragePage += 1;
      paintCoverageResults(body);
    }
  );
}

function ensurePanel(id) {
  if (id === "issues") renderIssuesPanel();
  if (id === "failed") renderFailedPanel();
  if (id === "cms") renderCmsPanel();
  if (id === "completeness") renderCompletenessPanel();
  if (id === "coverage") renderCoveragePanel();
}

function filterCmsIssues(opts) {
  opts = opts || {};
  var q = String(opts.query || "").trim().toLowerCase();
  var severity = opts.severity || "all";
  var category = opts.category || "all";
  var list =
    (state.report &&
      state.report.cmsMigration &&
      state.report.cmsMigration.issues) ||
    [];
  return list.filter(function (issue) {
    if (severity !== "all" && String(issue.severity).toLowerCase() !== severity) {
      return false;
    }
    if (category !== "all" && String(issue.category).toLowerCase() !== category) {
      return false;
    }
    if (!q) return true;
    var hay = [
      issue.file,
      issue.rule,
      issue.category,
      issue.cmsId,
      issue.message,
      issue.severity,
    ]
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

function cmsToolbarHtml(ids) {
  return (
    '<div class="acc__toolbar">' +
    '<input class="field" id="' +
    ids.query +
    '" type="search" placeholder="Search file, rule, category, message…" autocomplete="off" />' +
    '<select class="field select" id="' +
    ids.severity +
    '">' +
    '<option value="all">All severities</option>' +
    '<option value="error">Errors</option>' +
    '<option value="warning">Warnings</option>' +
    '<option value="info">Info</option>' +
    "</select>" +
    '<select class="field select" id="' +
    ids.category +
    '">' +
    '<option value="all">All categories</option>' +
    '<option value="legacy">Legacy</option>' +
    '<option value="gap">Gap</option>' +
    '<option value="progress">Progress</option>' +
    "</select>" +
    "</div>" +
    '<div class="acc__scroll" data-results></div>' +
    '<div class="pager" data-pager></div>'
  );
}

function accordionCmsPageRef() {
  return {
    get: function () {
      return state.cmsIssuesPage;
    },
    set: function (v) {
      state.cmsIssuesPage = v;
    },
  };
}

function paintCmsIssuesInto(root, filterState, pageRef) {
  var rows = filterCmsIssues(filterState);
  var page = pageRef.get();
  var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page > totalPages - 1) page = totalPages - 1;
  pageRef.set(page);
  var start = page * PAGE_SIZE;
  var pageRows = rows.slice(start, start + PAGE_SIZE);

  var tableRows = pageRows
    .map(function (issue) {
      var catMeta = cmsCategoryMeta(issue.category);
      return (
        "<tr>" +
        pathCopyCell(issue.file) +
        "<td>" +
        escapeHtml(issue.line) +
        "</td>" +
        '<td title="' +
        escapeHtml(catMeta.blurb) +
        '">' +
        cmsCategoryPill(issue.category) +
        "</td>" +
        '<td class="mono">' +
        escapeHtml(issue.rule) +
        "</td>" +
        "<td>" +
        severityPill(issue.severity) +
        "</td>" +
        '<td class="mono">' +
        escapeHtml(issue.cmsId) +
        "</td>" +
        "<td>" +
        escapeHtml(issue.message) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  var results = root.querySelector("[data-results]");
  results.innerHTML = pageRows.length
    ? '<div class="table-wrap"><table class="data data--issues"><colgroup>' +
      '<col class="col-file" /><col class="col-line" /><col class="col-strategy" />' +
      '<col class="col-rule" /><col class="col-sev" /><col class="col-rule" /><col class="col-msg" />' +
      "</colgroup><thead><tr>" +
      "<th>File</th><th>Line</th><th>Category</th><th>Rule</th><th>Severity</th><th>CMS</th><th>Message</th>" +
      "</tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div>"
    : '<p class="empty">No CMS findings match this filter.</p>';

  var pager = root.querySelector("[data-pager]");
  paintPager(
    pager,
    rows.length,
    page,
    function () {
      pageRef.set(Math.max(0, pageRef.get() - 1));
      paintCmsIssuesInto(root, filterState, pageRef);
    },
    function () {
      pageRef.set(pageRef.get() + 1);
      paintCmsIssuesInto(root, filterState, pageRef);
    }
  );

  Array.prototype.forEach.call(
    results.querySelectorAll("[data-copy-path]"),
    function (cell) {
      if (cell.getAttribute("data-copy-bound")) return;
      cell.setAttribute("data-copy-bound", "1");
      cell.addEventListener("click", function () {
        copyPathToClipboard(cell.getAttribute("data-copy-path"), cell);
      });
      cell.addEventListener("keydown", function (e) {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          copyPathToClipboard(cell.getAttribute("data-copy-path"), cell);
        }
      });
    }
  );
}

function renderCmsPanel() {
  var body = el.accordions.querySelector('[data-body="cms"]');
  if (!body) return;

  if (
    !state.report.cmsMigration ||
    !(state.report.cmsMigration.issues || []).length
  ) {
    body.innerHTML =
      '<p class="empty">No CMS migration findings in this report.</p>';
    return;
  }

  var needsShell = !body.querySelector("[data-results]");
  if (needsShell) {
    body.innerHTML = cmsToolbarHtml({
      query: "cms-q",
      severity: "cms-sev",
      category: "cms-cat",
    });

    var q = body.querySelector("#cms-q");
    var sev = body.querySelector("#cms-sev");
    var cat = body.querySelector("#cms-cat");
    q.value = state.cmsQuery;
    sev.value = state.cmsSeverity;
    cat.value = state.cmsCategory;

    q.addEventListener("input", function (e) {
      state.cmsQuery = e.target.value;
      state.cmsIssuesPage = 0;
      paintCmsIssuesInto(
        body,
        {
          query: state.cmsQuery,
          severity: state.cmsSeverity,
          category: state.cmsCategory,
        },
        accordionCmsPageRef()
      );
    });
    sev.addEventListener("change", function (e) {
      state.cmsSeverity = e.target.value;
      state.cmsIssuesPage = 0;
      paintCmsIssuesInto(
        body,
        {
          query: state.cmsQuery,
          severity: state.cmsSeverity,
          category: state.cmsCategory,
        },
        accordionCmsPageRef()
      );
    });
    cat.addEventListener("change", function (e) {
      state.cmsCategory = e.target.value;
      state.cmsIssuesPage = 0;
      paintCmsIssuesInto(
        body,
        {
          query: state.cmsQuery,
          severity: state.cmsSeverity,
          category: state.cmsCategory,
        },
        accordionCmsPageRef()
      );
    });
  }

  paintCmsIssuesInto(
    body,
    {
      query: state.cmsQuery,
      severity: state.cmsSeverity,
      category: state.cmsCategory,
    },
    accordionCmsPageRef()
  );
}

function filterCompletenessRecs(opts) {
  opts = opts || {};
  var q = String(opts.query || "").trim().toLowerCase();
  var priority = opts.priority || "all";
  var kind = opts.kind || "all";
  var tag = opts.tag || "all";
  var list =
    (state.report &&
      state.report.testCompleteness &&
      state.report.testCompleteness.recommendations) ||
    [];
  return list.filter(function (rec) {
    if (priority !== "all" && String(rec.priority).toLowerCase() !== priority) {
      return false;
    }
    if (kind !== "all" && String(rec.kind).toLowerCase() !== kind) {
      return false;
    }
    if (tag !== "all" && String(rec.tag).toLowerCase() !== tag) {
      return false;
    }
    if (!q) return true;
    var hay = [rec.source, rec.kind, rec.priority, rec.tag, rec.why, rec.suggest]
      .join(" ")
      .toLowerCase();
    return hay.indexOf(q) !== -1;
  });
}

function completenessToolbarHtml(ids) {
  return (
    '<div class="acc__toolbar">' +
    '<input class="field" id="' +
    ids.query +
    '" type="search" placeholder="Search source, why, suggest…" autocomplete="off" />' +
    '<select class="field select" id="' +
    ids.priority +
    '">' +
    '<option value="all">All priorities</option>' +
    '<option value="high">High</option>' +
    '<option value="medium">Medium</option>' +
    '<option value="low">Low</option>' +
    "</select>" +
    '<select class="field select" id="' +
    ids.kind +
    '">' +
    '<option value="all">All kinds</option>' +
    '<option value="page">Page</option>' +
    '<option value="api">API</option>' +
    '<option value="component">Component</option>' +
    '<option value="hook">Hook</option>' +
    '<option value="service">Service</option>' +
    '<option value="util">Util</option>' +
    '<option value="other">Other</option>' +
    "</select>" +
    '<select class="field select" id="' +
    ids.tag +
    '">' +
    '<option value="all">All tags</option>' +
    '<option value="missing">Missing</option>' +
    '<option value="weak-coverage">Weak coverage</option>' +
    '<option value="perf-risk">Perf / loading</option>' +
    "</select>" +
    "</div>" +
    '<div class="acc__scroll" data-results></div>' +
    '<div class="pager" data-pager></div>'
  );
}

function accordionCompletenessPageRef() {
  return {
    get: function () {
      return state.completenessPage;
    },
    set: function (v) {
      state.completenessPage = v;
    },
  };
}

function paintCompletenessInto(root, filterState, pageRef) {
  var rows = filterCompletenessRecs(filterState);
  var page = pageRef.get();
  var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  if (page > totalPages - 1) page = totalPages - 1;
  pageRef.set(page);
  var start = page * PAGE_SIZE;
  var pageRows = rows.slice(start, start + PAGE_SIZE);

  var tableRows = pageRows
    .map(function (rec) {
      return (
        "<tr>" +
        pathCopyCell(rec.source) +
        "<td>" +
        escapeHtml(rec.kind) +
        "</td>" +
        "<td>" +
        priorityPill(rec.priority) +
        "</td>" +
        "<td>" +
        completenessTagPill(rec.tag) +
        "</td>" +
        "<td>" +
        escapeHtml(rec.why) +
        "</td>" +
        "<td>" +
        escapeHtml(rec.suggest) +
        "</td>" +
        "</tr>"
      );
    })
    .join("");

  var results = root.querySelector("[data-results]");
  results.innerHTML = pageRows.length
    ? '<div class="table-wrap"><table class="data data--issues"><thead><tr>' +
      "<th>Source</th><th>Kind</th><th>Priority</th><th>Tag</th><th>Why</th><th>Suggest</th>" +
      "</tr></thead><tbody>" +
      tableRows +
      "</tbody></table></div>"
    : '<p class="empty">No recommendations match this filter.</p>';

  var pager = root.querySelector("[data-pager]");
  paintPager(
    pager,
    rows.length,
    page,
    function () {
      pageRef.set(Math.max(0, pageRef.get() - 1));
      paintCompletenessInto(root, filterState, pageRef);
    },
    function () {
      pageRef.set(pageRef.get() + 1);
      paintCompletenessInto(root, filterState, pageRef);
    }
  );
}

function renderCompletenessPanel() {
  var body = el.accordions.querySelector('[data-body="completeness"]');
  if (!body) return;

  if (
    !state.report.testCompleteness ||
    !(state.report.testCompleteness.recommendations || []).length
  ) {
    body.innerHTML =
      '<p class="empty">No completeness recommendations in this report.</p>';
    return;
  }

  var needsShell = !body.querySelector("[data-results]");
  if (needsShell) {
    body.innerHTML = completenessToolbarHtml({
      query: "comp-q",
      priority: "comp-pri",
      kind: "comp-kind",
      tag: "comp-tag",
    });

    var q = body.querySelector("#comp-q");
    var pri = body.querySelector("#comp-pri");
    var kind = body.querySelector("#comp-kind");
    var tag = body.querySelector("#comp-tag");
    q.value = state.completenessQuery;
    pri.value = state.completenessPriority;
    kind.value = state.completenessKind;
    tag.value = state.completenessTag;

    function repaint() {
      paintCompletenessInto(
        body,
        {
          query: state.completenessQuery,
          priority: state.completenessPriority,
          kind: state.completenessKind,
          tag: state.completenessTag,
        },
        accordionCompletenessPageRef()
      );
    }

    q.addEventListener("input", function (e) {
      state.completenessQuery = e.target.value;
      state.completenessPage = 0;
      repaint();
    });
    pri.addEventListener("change", function (e) {
      state.completenessPriority = e.target.value;
      state.completenessPage = 0;
      repaint();
    });
    kind.addEventListener("change", function (e) {
      state.completenessKind = e.target.value;
      state.completenessPage = 0;
      repaint();
    });
    tag.addEventListener("change", function (e) {
      state.completenessTag = e.target.value;
      state.completenessPage = 0;
      repaint();
    });
  }

  paintCompletenessInto(
    body,
    {
      query: state.completenessQuery,
      priority: state.completenessPriority,
      kind: state.completenessKind,
      tag: state.completenessTag,
    },
    accordionCompletenessPageRef()
  );
}

function showReport(report, filename) {
  closeModal();
  state.report = report;
  state.filename = filename || "audit-report.md";
  state.issuesPage = 0;
  state.cmsIssuesPage = 0;
  state.completenessPage = 0;
  state.coveragePage = 0;
  state.issueQuery = "";
  state.issueSeverity = "all";
  state.issueStrategy = "all";
  state.cmsQuery = "";
  state.cmsSeverity = "all";
  state.cmsCategory = "all";
  state.completenessQuery = "";
  state.completenessPriority = "all";
  state.completenessKind = "all";
  state.completenessTag = "all";
  state.coverageQuery = "";
  state.coverageSort = "lines-asc";

  el.dropzone.hidden = true;
  el.report.hidden = false;
  el.expand.hidden = false;
  el.collapse.hidden = false;

  el.generated.textContent = report.generated
    ? "Generated " + formatGenerated(report.generated)
    : "Generated time not found in report";
  el.filename.textContent = state.filename;

  renderQualityHero(report.quality);
  renderCmsMigrationHero(report.cmsMigration);
  renderCompletenessHero(report.testCompleteness);
  renderSummaryStrip(
    report.summary,
    report.cmsMigration,
    report.testCompleteness
  );
  renderStrategies(report.strategies, report.issues);
  buildAccordions(report);
}

function handleText(text, filename) {
  try {
    var report = parseReport(text);
    if (!report.summary || Object.keys(report.summary).length === 0) {
      throw new Error(
        "Could not find a Summary section. Make sure this is a test-auditor audit-report.md file."
      );
    }
    el.dropError.hidden = true;
    showReport(report, filename);
  } catch (err) {
    el.dropError.hidden = false;
    el.dropError.textContent = err.message || "Failed to parse report.";
  }
}

function readFile(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function () {
    handleText(String(reader.result || ""), file.name);
  };
  reader.onerror = function () {
    el.dropError.hidden = false;
    el.dropError.textContent = "Could not read that file.";
  };
  reader.readAsText(file);
}

el.fileInput.addEventListener("change", function () {
  readFile(el.fileInput.files && el.fileInput.files[0]);
  el.fileInput.value = "";
});

["dragenter", "dragover"].forEach(function (evt) {
  el.dropzone.addEventListener(evt, function (e) {
    e.preventDefault();
    e.stopPropagation();
    el.dropzone.classList.add("is-dragover");
  });
});

["dragleave", "drop"].forEach(function (evt) {
  el.dropzone.addEventListener(evt, function (e) {
    e.preventDefault();
    e.stopPropagation();
    el.dropzone.classList.remove("is-dragover");
  });
});

el.dropzone.addEventListener("drop", function (e) {
  var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
  readFile(file);
});

el.dropzone.addEventListener("keydown", function (e) {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    el.fileInput.click();
  }
});

el.expand.addEventListener("click", function () {
  Array.prototype.forEach.call(
    el.accordions.querySelectorAll("details.acc"),
    function (d) {
      d.open = true;
    }
  );
});

el.collapse.addEventListener("click", function () {
  Array.prototype.forEach.call(
    el.accordions.querySelectorAll("details.acc"),
    function (d) {
      d.open = false;
    }
  );
});

if (el.modal) {
  Array.prototype.forEach.call(
    el.modal.querySelectorAll("[data-modal-dismiss]"),
    function (node) {
      node.addEventListener("click", closeModal);
    }
  );
}

document.addEventListener("keydown", function (e) {
  if (e.key === "Escape" && state.modal) closeModal();
});

document.addEventListener("click", function (e) {
  var cell = e.target.closest && e.target.closest("[data-copy-path]");
  if (!cell) return;
  e.preventDefault();
  copyPathToClipboard(cell.getAttribute("data-copy-path") || "", cell);
});

document.addEventListener("keydown", function (e) {
  if (e.key !== "Enter" && e.key !== " ") return;
  var cell = e.target.closest && e.target.closest("[data-copy-path]");
  if (!cell) return;
  e.preventDefault();
  copyPathToClipboard(cell.getAttribute("data-copy-path") || "", cell);
});

window.addEventListener("scroll", hideTip, true);
window.addEventListener("resize", hideTip);

function tryAutoload() {
  if (!/^https?:$/i.test(window.location.protocol)) return;

  fetch("/report.md", { cache: "no-store" })
    .then(function (res) {
      if (!res.ok) throw new Error("no report");
      return res.text();
    })
    .then(function (text) {
      handleText(text, "audit-report.md");
    })
    .catch(function () {
      try {
        var params = new URLSearchParams(window.location.search);
        var fileParam = params.get("file");
        if (!fileParam) return;
        return fetch(fileParam)
          .then(function (res) {
            if (!res.ok) throw new Error("HTTP " + res.status);
            return res.text();
          })
          .then(function (text) {
            handleText(text, fileParam);
          });
      } catch (e) {
        /* ignore */
      }
    });
}

tryAutoload();