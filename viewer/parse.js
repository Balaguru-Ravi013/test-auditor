export function parseMarkdownTable(block) {
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
    // Honor reportGenerator escCell: \| inside a cell is a literal pipe, not a column break.
    var raw = line.replace(/^\|/, "").replace(/\|$/, "");
    var cells = [];
    var cur = "";
    for (var i = 0; i < raw.length; i++) {
      var ch = raw.charAt(i);
      if (ch === "\\" && raw.charAt(i + 1) === "|") {
        cur += "|";
        i += 1;
        continue;
      }
      if (ch === "|") {
        cells.push(cur.trim());
        cur = "";
        continue;
      }
      cur += ch;
    }
    cells.push(cur.trim());
    return cells;
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

export function parseReport(md) {
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

  var testsTable = parseMarkdownTable(sectionBody(md, "Test Cases"));
  var tests = testsTable.rows.map(function (row) {
    return {
      file: row[0] || "",
      name: row[1] || "",
      status: (row[2] || "").toLowerCase(),
    };
  });

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

  var cmsMigration = parseCmsMigration(sectionBody(md, "CMS Migration"));
  var testCompleteness = parseTestCompleteness(
    sectionBody(md, "Test Completeness")
  );

  return {
    generated: generatedMatch ? generatedMatch[1].trim() : "",
    summary: summary,
    quality: quality,
    strategies: strategies,
    cmsMigration: cmsMigration,
    testCompleteness: testCompleteness,
    issues: issues,
    failed: failedParsed.files,
    failedMeta: failedParsed.meta,
    tests: tests,
    coverage: coverage,
    rawEmptyCoverage: /No coverage data found/i.test(sectionBody(md, "Coverage")),
  };
}

function parseCmsMigration(body) {
  if (!body || !body.trim()) return null;

  var fromTo = body.match(
    /\*\*From:\*\*\s*(.+?)\s*\(`([^`]+)`\)\s*→\s*\*\*To:\*\*\s*(.+?)\s*\(`([^`]+)`\)/i
  );
  if (!fromTo) {
    // Fallback: still try metrics table
    fromTo = null;
  }

  var main = body.split(/\n###\s+/)[0] || body;
  var table = parseMarkdownTable(main);
  var metrics = {};
  table.rows.forEach(function (row) {
    if (row.length >= 2) metrics[row[0]] = row[1];
  });

  if (!metrics.Readiness && !fromTo) return null;

  var findingsBlock = "";
  var findingsMatch = body.match(
    /###\s+Migration findings\s*\n([\s\S]*?)(?=\n###\s+|$)/i
  );
  if (findingsMatch) findingsBlock = findingsMatch[1];
  var findingsTable = parseMarkdownTable(findingsBlock);
  var issues = [];
  if (findingsTable.rows.length) {
    findingsTable.rows.forEach(function (row) {
      if (row.length < 6) return;
      issues.push({
        file: row[0] || "",
        line: row[1] || "",
        category: (row[2] || "").toLowerCase(),
        rule: row[3] || "",
        severity: (row[4] || "").toLowerCase(),
        cmsId: row[5] || "",
        message: row[6] || "",
      });
    });
  }

  return {
    from: fromTo
      ? { displayName: fromTo[1].trim(), id: fromTo[2].trim() }
      : { displayName: "", id: "" },
    to: fromTo
      ? { displayName: fromTo[3].trim(), id: fromTo[4].trim() }
      : { displayName: "", id: "" },
    readiness: metrics.Readiness || "",
    grade: metrics.Grade || "",
    summary: metrics.Summary || "",
    filesScanned: metrics["Files scanned"] || "",
    filesWithLegacyRefs: metrics["Files with legacy refs"] || "",
    legacyIssues: metrics["Legacy issues"] || "",
    gapIssues: metrics["Gap issues"] || "",
    progressSignals: metrics["Progress signals"] || "",
    issues: issues,
  };
}

function parseTestCompleteness(body) {
  if (!body || !body.trim()) return null;

  var main = body.split(/\n###\s+/)[0] || body;
  var table = parseMarkdownTable(main);
  var metrics = {};
  table.rows.forEach(function (row) {
    if (row.length >= 2) metrics[row[0]] = row[1];
  });

  if (!metrics.Score) return null;

  var recBlock = "";
  var recMatch = body.match(
    /###\s+Recommendations\s*\n([\s\S]*?)(?=\n###\s+|$)/i
  );
  if (recMatch) recBlock = recMatch[1];
  var recTable = parseMarkdownTable(recBlock);
  var recommendations = [];
  recTable.rows.forEach(function (row) {
    if (row.length < 5) return;
    recommendations.push({
      source: row[0] || "",
      kind: (row[1] || "").toLowerCase(),
      priority: (row[2] || "").toLowerCase(),
      tag: (row[3] || "").toLowerCase(),
      why: row[4] || "",
      suggest: row[5] || "",
    });
  });

  return {
    score: metrics.Score || "",
    grade: metrics.Grade || "",
    summary: metrics.Summary || "",
    sourcesScanned: metrics["Sources scanned"] || "",
    withTests: metrics["With tests"] || "",
    untested: metrics.Untested || "",
    weakCoverage: metrics["Weak coverage"] || "",
    perfRisks: metrics["Perf risks"] || "",
    highPriority: metrics["High priority"] || "",
    recommendations: recommendations,
  };
}
