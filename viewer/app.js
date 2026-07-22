(function () {
  "use strict";

  var PAGE_SIZE = 50;

  var state = {
    report: null,
    filename: "",
    issuesPage: 0,
    coveragePage: 0,
    issueQuery: "",
    issueSeverity: "all",
    coverageQuery: "",
    coverageSort: "lines-asc",
  };

  var el = {
    dropzone: document.getElementById("dropzone"),
    dropError: document.getElementById("dropzone-error"),
    fileInput: document.getElementById("file-input"),
    report: document.getElementById("report"),
    generated: document.getElementById("report-generated"),
    filename: document.getElementById("report-filename"),
    qualityHero: document.getElementById("quality-hero"),
    summary: document.getElementById("summary-strip"),
    strategies: document.getElementById("strategies"),
    accordions: document.getElementById("accordions"),
    expand: document.getElementById("btn-expand"),
    collapse: document.getElementById("btn-collapse"),
  };

  var METRIC_HELP = {
    Score:
      "Starts at 100. Deducts for each static finding (errors weigh more), failed-test rate, and low average line coverage. Cap 0–100.",
    Grade:
      "Letter from score: A ≥90, B ≥80, C ≥70, D ≥55, F below 55. Label reflects overall suite health.",
    "Total tests":
      "Jest numTotalTests — every registered test including passed, failed, pending, and todo. So Total ≥ Passed + Failed.",
    Passed: "Jest numPassedTests — assertions that completed successfully.",
    Failed:
      "Jest numFailedTests — individual failing tests (not files). The Failed Tests accordion lists files that contain those failures.",
    Pending:
      "Jest numPendingTests — skipped/pending tests that still count toward Total.",
    Todo: "Jest numTodoTests — test.todo placeholders that still count toward Total.",
    "Static errors":
      "AST rule findings with severity error (e.g. .only, empty tests, unmocked network, tautological expects).",
    "Static warnings":
      "AST rule findings with severity warning (skips, flakes, RTL anti-patterns, weak matchers, etc.).",
    "Static info":
      "Lower-priority readability/hygiene hints that do not block CI by default.",
  };

  var STRATEGY_BLURBS = {
    "Disabled / focused tests":
      "Detects .only / fit / .skip / xit / test.todo left in suites.",
    "Async flake risks":
      "Sleeps, done callbacks, missing awaits on async matchers.",
    "Snapshot overuse":
      "Too many or oversized snapshots that hide intent.",
    "Testing Library anti-patterns":
      "querySelector, innerHTML, heavy getByTestId, fireEvent-only.",
    "Non-deterministic APIs":
      "Unmocked Date.now / Math.random / new Date().",
    "Debug leftovers": "console.*, screen.debug, debugger left behind.",
    "Assertion quality":
      "Weak/tautological expects, assert spam, missing expects.",
    "Empty tests": "Tests with empty bodies.",
    "Duplicate titles": "Repeated it/test titles in a file.",
    "Conditional test logic":
      "expect() inside if, or empty catch blocks.",
    "Hardcoded secrets": "API keys / tokens / credentials in test source.",
    "Unmocked network I/O":
      "fetch/axios/http without an obvious mock/MSW/nock.",
    "Mocking quality":
      "Redundant mocks, mocking SUT, env/storage leaks.",
    "Next.js test hygiene":
      "next/navigation|router|image without common mocks.",
    Readability: "Vague titles, deep describe nesting, oversized files.",
    "Timer hygiene": "Fake timers without advance/restore.",
    "Parse errors": "Files the auditor could not parse.",
    "disabled-focused":
      "Detects .only / fit / .skip / xit / test.todo left in suites.",
    "async-flake": "Sleeps, done callbacks, missing awaits on async matchers.",
    "snapshot-overuse": "Too many or oversized snapshots that hide intent.",
    "rtl-antipattern":
      "querySelector, innerHTML, heavy getByTestId, fireEvent-only.",
    "non-deterministic": "Unmocked Date.now / Math.random / new Date().",
    "debug-leftover": "console.*, screen.debug, debugger left behind.",
    "assertion-quality":
      "Weak/tautological expects, assert spam, missing expects.",
    "empty-test": "Tests with empty bodies.",
    "duplicate-title": "Repeated it/test titles in a file.",
    "conditional-logic": "expect() inside if, or empty catch blocks.",
    "hardcoded-secret": "API keys / tokens / credentials in test source.",
    "network-unmocked":
      "fetch/axios/http without an obvious mock/MSW/nock.",
    "mocking-quality":
      "Redundant mocks, mocking SUT, env/storage leaks.",
    "nextjs-hygiene":
      "next/navigation|router|image without common mocks.",
    readability: "Vague titles, deep describe nesting, oversized files.",
    "timer-hygiene": "Fake timers without advance/restore.",
    "parse-error": "Files the auditor could not parse.",
  };

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function shortPath(filePath) {
    var parts = String(filePath).split(/[/\\]/);
    if (parts.length <= 3) return filePath;
    return "…/" + parts.slice(-3).join("/");
  }

  function parseMarkdownTable(block) {
    var lines = block
      .split("\n")
      .map(function (l) {
        return l.trim();
      })
      .filter(function (l) {
        return l.charAt(0) === "|";
      });

    if (lines.length < 2) return { headers: [], rows: [] };

    function splitRow(line) {
      return line
        .replace(/^\|/, "")
        .replace(/\|$/, "")
        .split("|")
        .map(function (cell) {
          return cell.trim();
        });
    }

    var headers = splitRow(lines[0]);
    var rows = [];
    for (var i = 2; i < lines.length; i++) {
      var cells = splitRow(lines[i]);
      if (cells.length === 1 && cells[0] === "") continue;
      rows.push(cells);
    }
    return { headers: headers, rows: rows };
  }

  function sectionBody(md, heading) {
    var re = new RegExp(
      "##\\s+" + heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)"
    );
    var match = md.match(re);
    return match ? match[1].trim() : "";
  }

  function parseFailedTests(body) {
    if (!body || /^none\.?$/i.test(body.trim())) {
      return { files: [], meta: { failedTests: 0, filesWithFailures: 0 } };
    }

    var meta = { failedTests: 0, filesWithFailures: 0 };
    var metaLine = body.match(
      /Failed tests:\s*\*\*(\d+)\*\*.*?Files with failures:\s*\*\*(\d+)\*\*/i
    );
    if (metaLine) {
      meta.failedTests = Number(metaLine[1]) || 0;
      meta.filesWithFailures = Number(metaLine[2]) || 0;
    }

    var items = [];
    var parts = body.split(/\n(?=###\s+)/);
    for (var j = 0; j < parts.length; j++) {
      var part = parts[j].trim();
      if (part.indexOf("### ") !== 0) continue;
      var nl = part.indexOf("\n");
      var filePath = (nl === -1 ? part.slice(4) : part.slice(4, nl)).trim();
      var failInFile = 0;
      var failMatch = part.match(/Failing in this file:\s*(\d+)/i);
      if (failMatch) failInFile = Number(failMatch[1]) || 0;
      var msgs = [];
      var re = /```[^\n]*\n([\s\S]*?)```/g;
      var mm;
      while ((mm = re.exec(part))) {
        msgs.push(mm[1].replace(/\s+$/, ""));
      }
      if (!failInFile) failInFile = Math.max(msgs.length, 1);
      items.push({ file: filePath, messages: msgs, failCount: failInFile });
    }

    if (!meta.filesWithFailures) meta.filesWithFailures = items.length;
    if (!meta.failedTests) {
      meta.failedTests = items.reduce(function (n, it) {
        return n + (it.failCount || 0);
      }, 0);
    }

    return { files: items, meta: meta };
  }

  function parseReport(md) {
    var generatedMatch = md.match(/Generated:\s*([^\n]+)/i);
    var summaryTable = parseMarkdownTable(sectionBody(md, "Summary"));
    var summary = {};
    summaryTable.rows.forEach(function (row) {
      if (row.length >= 2) summary[row[0]] = row[1];
    });

    var qualityBody = sectionBody(md, "Quality Score");
    var qualityMain = qualityBody.split(/\n###\s+/)[0] || "";
    var qualityTable = parseMarkdownTable(qualityMain);
    var quality = {};
    qualityTable.rows.forEach(function (row) {
      if (row.length >= 2) quality[row[0]] = row[1];
    });

    var strategiesBlock = "";
    var stratMatch = qualityBody.match(
      /###\s+Strategies\s*\n([\s\S]*?)(?=\n###\s+|$)/
    );
    if (stratMatch) strategiesBlock = stratMatch[1];
    var strategiesTable = parseMarkdownTable(strategiesBlock);
    var strategies = strategiesTable.rows.map(function (row) {
      return {
        title: row[0] || "",
        errors: Number(row[1]) || 0,
        warnings: Number(row[2]) || 0,
        infos: Number(row[3]) || 0,
        total: Number(row[4]) || 0,
      };
    });

    var issuesTable = parseMarkdownTable(sectionBody(md, "Static Analysis Issues"));
    var issues = issuesTable.rows.map(function (row) {
      // New format: File | Line | Strategy | Rule | Severity | Message
      // Legacy:     File | Line | Rule | Severity | Message
      if (row.length >= 6) {
        return {
          file: row[0] || "",
          line: row[1] || "",
          strategy: row[2] || "",
          rule: row[3] || "",
          severity: (row[4] || "").toLowerCase(),
          message: row[5] || "",
        };
      }
      return {
        file: row[0] || "",
        line: row[1] || "",
        strategy: "",
        rule: row[2] || "",
        severity: (row[3] || "").toLowerCase(),
        message: row[4] || "",
      };
    });

    var failedParsed = parseFailedTests(sectionBody(md, "Failed Tests"));

    var coverageTable = parseMarkdownTable(sectionBody(md, "Coverage"));
    var coverage = coverageTable.rows.map(function (row) {
      return {
        file: row[0] || "",
        statements: Number(row[1]) || 0,
        branches: Number(row[2]) || 0,
        functions: Number(row[3]) || 0,
        lines: Number(row[4]) || 0,
      };
    });

    return {
      generated: generatedMatch ? generatedMatch[1].trim() : "",
      summary: summary,
      quality: quality,
      strategies: strategies,
      issues: issues,
      failed: failedParsed.files,
      failedMeta: failedParsed.meta,
      coverage: coverage,
      rawEmptyCoverage: /No coverage data found/i.test(sectionBody(md, "Coverage")),
    };
  }

  function metricTone(key, value) {
    if (key === "Score") {
      var score = parseInt(String(value), 10);
      if (isNaN(score)) return "neutral";
      if (score >= 80) return "ok";
      if (score >= 55) return "warn";
      return "bad";
    }
    if (key === "Grade") {
      var g = String(value).charAt(0).toUpperCase();
      if (g === "A" || g === "B") return "ok";
      if (g === "C") return "warn";
      return "bad";
    }
    if (key === "Passed") return "ok";
    if (key === "Failed" || key === "Static errors") {
      return Number(String(value).replace(/,/g, "")) > 0 ? "bad" : "ok";
    }
    if (key === "Static warnings" || key === "Pending" || key === "Todo") {
      return Number(String(value).replace(/,/g, "")) > 0 ? "warn" : "neutral";
    }
    if (key === "Total tests") return "neutral";
    if (key === "Static info") return "neutral";
    return "neutral";
  }

  function infoButton(helpKey) {
    var tip = METRIC_HELP[helpKey] || "Metric from the Jest audit report.";
    return (
      '<button type="button" class="info-tip" aria-label="About ' +
      escapeHtml(helpKey) +
      '" data-tip="' +
      escapeHtml(tip) +
      '"><span aria-hidden="true">i</span></button>'
    );
  }

  function metricCard(label, value, helpKey, extraClass) {
    var tone = metricTone(helpKey || label, value);
    return (
      '<article class="metric metric--' +
      tone +
      (extraClass ? " " + extraClass : "") +
      '">' +
      '<div class="metric__top">' +
      '<p class="metric__label">' +
      escapeHtml(label) +
      "</p>" +
      infoButton(helpKey || label) +
      "</div>" +
      '<p class="metric__value">' +
      escapeHtml(value) +
      "</p>" +
      "</article>"
    );
  }

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
      escapeHtml(quality.Summary || "Suite health from static strategies, failures, and coverage.") +
      "</p>" +
      '<p class="quality-hero__note">Total tests include pending/todo — so Total is not always Passed + Failed.</p>' +
      "</div>";
  }

  function renderSummaryStrip(summary) {
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
      html += metricCard(key, summary[key], key);
    });
    el.summary.innerHTML = html;
  }

  function renderStrategies(strategies, issues) {
    if (!el.strategies) return;
    var list = strategies && strategies.length ? strategies.slice() : [];
    if (!list.length && issues && issues.length) {
      var map = {};
      issues.forEach(function (issue) {
        var id = issue.strategy || "other";
        if (!map[id]) map[id] = { title: id, errors: 0, warnings: 0, infos: 0, total: 0 };
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
    el.strategies.hidden = false;
    el.strategies.innerHTML =
      '<div class="strategies__head">' +
      "<h2>Strategies used</h2>" +
      "<p>Each card is a static analysis strategy. Counts are findings from this audit.</p>" +
      "</div>" +
      '<div class="strategies__grid">' +
      list
        .map(function (s) {
          var key = String(s.title || "")
            .toLowerCase()
            .replace(/\s+/g, "-");
          var blurb =
            STRATEGY_BLURBS[s.title] ||
            STRATEGY_BLURBS[key] ||
            "Static analysis strategy applied to Jest/Next.js tests.";
          var tone = s.errors > 0 ? "bad" : s.warnings > 0 ? "warn" : "ok";
          return (
            '<article class="strategy-card strategy-card--' +
            tone +
            '">' +
            '<div class="metric__top">' +
            '<p class="strategy-card__title">' +
            escapeHtml(s.title) +
            "</p>" +
            '<button type="button" class="info-tip" aria-label="About strategy" data-tip="' +
            escapeHtml(blurb) +
            '"><span aria-hidden="true">i</span></button>' +
            "</div>" +
            '<p class="strategy-card__blurb">' +
            escapeHtml(blurb) +
            "</p>" +
            '<p class="strategy-card__counts">' +
            '<span class="tone-bad">' +
            s.errors +
            " err</span> · <span class=\"tone-warn\">" +
            s.warnings +
            " warn</span> · <span class=\"tone-muted\">" +
            s.infos +
            " info</span>" +
            "</p>" +
            "</article>"
          );
        })
        .join("") +
      "</div>";
  }

  function covClass(pct) {
    if (pct >= 80) return "cov--hi";
    if (pct >= 50) return "cov--mid";
    return "cov--lo";
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

    el.accordions.innerHTML =
      accordionShell(
        "issues",
        "Static Analysis Issues",
        errCount + " errors · " + warnCount + " warnings across strategies",
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
      ) +
      accordionShell(
        "coverage",
        "Coverage",
        "Per-file statements, branches, functions, lines",
        report.coverage.length ? String(report.coverage.length) + " files" : "n/a",
        covTone
      );

    Array.prototype.forEach.call(
      el.accordions.querySelectorAll("details.acc"),
      function (details) {
        details.addEventListener("toggle", function () {
          if (details.open) ensurePanel(details.getAttribute("data-panel"));
        });
      }
    );
  }

  function filteredIssues() {
    var q = state.issueQuery.trim().toLowerCase();
    return state.report.issues.filter(function (issue) {
      if (state.issueSeverity !== "all" && issue.severity !== state.issueSeverity) {
        return false;
      }
      if (!q) return true;
      return (
        issue.file.toLowerCase().indexOf(q) !== -1 ||
        issue.rule.toLowerCase().indexOf(q) !== -1 ||
        issue.message.toLowerCase().indexOf(q) !== -1
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

  function formatGenerated(raw) {
    if (!raw) return "";
    var d = new Date(raw);
    if (isNaN(d.getTime())) return String(raw);
    try {
      return d.toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch (e) {
      return d.toLocaleString();
    }
  }

  function renderIssuesPanel() {
    var body = el.accordions.querySelector('[data-body="issues"]');
    if (!body) return;

    var needsShell = !body.querySelector("[data-issues-results]");
    if (needsShell) {
      body.innerHTML =
        '<div class="acc__toolbar">' +
        '<input class="field" id="issue-q" type="search" placeholder="Filter file, rule, message…" autocomplete="off" />' +
        '<select class="field select" id="issue-sev">' +
        '<option value="all">All severities</option>' +
        '<option value="error">Errors</option>' +
        '<option value="warning">Warnings</option>' +
        "</select>" +
        "</div>" +
        '<div class="acc__scroll" data-issues-results></div>' +
        '<div class="pager" data-issues-pager></div>';

      var q = body.querySelector("#issue-q");
      var sev = body.querySelector("#issue-sev");
      q.value = state.issueQuery;
      sev.value = state.issueSeverity;

      q.addEventListener("input", function (e) {
        state.issueQuery = e.target.value;
        state.issuesPage = 0;
        paintIssuesResults(body);
      });
      sev.addEventListener("change", function (e) {
        state.issueSeverity = e.target.value;
        state.issuesPage = 0;
        paintIssuesResults(body);
      });
    }

    paintIssuesResults(body);
  }

  function paintIssuesResults(body) {
    var rows = filteredIssues();
    var totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
    if (state.issuesPage > totalPages - 1) state.issuesPage = totalPages - 1;
    var start = state.issuesPage * PAGE_SIZE;
    var pageRows = rows.slice(start, start + PAGE_SIZE);

    var tableRows = pageRows
      .map(function (issue) {
        return (
          "<tr>" +
          '<td class="path" title="' +
          escapeHtml(issue.file) +
          '">' +
          escapeHtml(shortPath(issue.file)) +
          "</td>" +
          "<td>" +
          escapeHtml(issue.line) +
          "</td>" +
          '<td class="mono">' +
          escapeHtml(issue.strategy || "—") +
          "</td>" +
          '<td class="mono">' +
          escapeHtml(issue.rule) +
          "</td>" +
          "<td><span class=\"pill pill--" +
          escapeHtml(
            issue.severity === "error"
              ? "error"
              : issue.severity === "info"
                ? "warning"
                : "warning"
          ) +
          '">' +
          escapeHtml(issue.severity) +
          "</span></td>" +
          "<td>" +
          escapeHtml(issue.message) +
          "</td>" +
          "</tr>"
        );
      })
      .join("");

    var results = body.querySelector("[data-issues-results]");
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

    var pager = body.querySelector("[data-issues-pager]");
    pager.innerHTML =
      "<span>" +
      rows.length +
      " shown · page " +
      (state.issuesPage + 1) +
      " / " +
      totalPages +
      "</span>" +
      '<div class="pager__btns">' +
      '<button type="button" class="btn btn--ghost" data-issues-prev' +
      (state.issuesPage === 0 ? " disabled" : "") +
      ">Prev</button>" +
      '<button type="button" class="btn btn--ghost" data-issues-next' +
      (state.issuesPage >= totalPages - 1 ? " disabled" : "") +
      ">Next</button>" +
      "</div>";

    pager.querySelector("[data-issues-prev]").onclick = function () {
      state.issuesPage = Math.max(0, state.issuesPage - 1);
      paintIssuesResults(body);
    };
    pager.querySelector("[data-issues-next]").onclick = function () {
      state.issuesPage += 1;
      paintIssuesResults(body);
    };
  }

  function renderFailedPanel() {
    var body = el.accordions.querySelector('[data-body="failed"]');
    if (!body) return;

    if (!state.report.failed.length) {
      body.innerHTML = '<p class="empty">No failed tests in this report.</p>';
      return;
    }

    var html =
      '<div class="acc__scroll">' +
      state.report.failed
        .map(function (item) {
          var blocks = (item.messages.length ? item.messages : ["(no message captured)"])
            .map(function (msg) {
              return '<pre class="fail-card__pre">' + escapeHtml(msg) + "</pre>";
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
            blocks +
            "</article>"
          );
        })
        .join("") +
      "</div>";

    body.innerHTML = html;
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
          '<td class="path" title="' +
          escapeHtml(row.file) +
          '">' +
          escapeHtml(shortPath(row.file)) +
          "</td>" +
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
    pager.innerHTML =
      "<span>" +
      rows.length +
      " files · page " +
      (state.coveragePage + 1) +
      " / " +
      totalPages +
      "</span>" +
      '<div class="pager__btns">' +
      '<button type="button" class="btn btn--ghost" data-cov-prev' +
      (state.coveragePage === 0 ? " disabled" : "") +
      ">Prev</button>" +
      '<button type="button" class="btn btn--ghost" data-cov-next' +
      (state.coveragePage >= totalPages - 1 ? " disabled" : "") +
      ">Next</button>" +
      "</div>";

    pager.querySelector("[data-cov-prev]").onclick = function () {
      state.coveragePage = Math.max(0, state.coveragePage - 1);
      paintCoverageResults(body);
    };
    pager.querySelector("[data-cov-next]").onclick = function () {
      state.coveragePage += 1;
      paintCoverageResults(body);
    };
  }

  function ensurePanel(id) {
    if (id === "issues") renderIssuesPanel();
    if (id === "failed") renderFailedPanel();
    if (id === "coverage") renderCoveragePanel();
  }

  function showReport(report, filename) {
    state.report = report;
    state.filename = filename || "audit-report.md";
    state.issuesPage = 0;
    state.coveragePage = 0;
    state.issueQuery = "";
    state.issueSeverity = "all";
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
    renderSummaryStrip(report.summary);
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

  // Drag & drop / picker
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

  // When the CLI opens the viewer, it serves the report at /report.md.
  // Also support ?file= when the page is served over http(s).
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
})();
