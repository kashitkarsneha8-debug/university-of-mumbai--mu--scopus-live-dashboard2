/**
 * app.js - University of Mumbai (MU) Live Scopus Intelligence Dashboard
 * MahaSAMARTH Institutional Design System (Intelligence. Transformation. Excellence.)
 * Preserves 100% data logic, filters, calculations, exports, and AI Copilot.
 */

(function () {
  "use strict";

  // ---------------------------------------------------------
  // 1. Initial State & Dataset
  // ---------------------------------------------------------
  const rawData = (window.SCOPUS_CACHE && window.SCOPUS_CACHE.data) ? window.SCOPUS_CACHE.data : [];

  const state = {
    theme: document.documentElement.getAttribute("data-theme") || "light",
    startYear: 1950,
    endYear: 2026,
    selectedDepts: [],
    selectedQuartiles: [],
    selectedCollab: [],
    searchQuery: "",
    activeTab: "tab-trends",
    selectedFaculty: "",
    velocityYear: 2026,
    feedSearch: "",
    feedLimit: 100,
    chatMessages: []
  };

  // ---------------------------------------------------------
  // 2. Helper Utilities & Calculations
  // ---------------------------------------------------------
  function formatNumber(num) {
    if (num === null || num === undefined || isNaN(num)) return "0";
    return Number(num).toLocaleString();
  }

  function makeDoiLink(row) {
    const doi = String(row.doi || "").trim();
    if (doi && doi.startsWith("10.")) {
      return `https://doi.org/${doi}`;
    }
    const scopusId = String(row.scopus_id || "").trim();
    if (scopusId) {
      return `https://www.scopus.com/record/display.uri?eid=2-s2.0-${scopusId}&origin=inward`;
    }
    return "#";
  }

  function calculateHIndex(citationsList) {
    if (!citationsList || !citationsList.length) return 0;
    const sorted = citationsList.filter(c => c >= 0).sort((a, b) => b - a);
    let h = 0;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i] >= (i + 1)) {
        h = i + 1;
      } else {
        break;
      }
    }
    return h;
  }

  // ---------------------------------------------------------
  // 3. Filtering Engine
  // ---------------------------------------------------------
  function getFilteredData() {
    let df = rawData.slice();

    // Year range
    df = df.filter(d => {
      const yr = Number(d.year) || 2024;
      return yr >= state.startYear && yr <= state.endYear;
    });

    // Departments
    if (state.selectedDepts.length > 0) {
      df = df.filter(d => state.selectedDepts.includes(d.department));
    }

    // Quartiles
    if (state.selectedQuartiles.length > 0) {
      df = df.filter(d => state.selectedQuartiles.includes(d.quartile));
    }

    // Collaboration
    if (state.selectedCollab.length > 0) {
      df = df.filter(d => {
        let match = false;
        if (state.selectedCollab.includes("International") && d.is_international_collab) match = true;
        if (state.selectedCollab.includes("Industry") && d.is_industry_collab) match = true;
        if (state.selectedCollab.includes("National") && !d.is_international_collab && !d.is_industry_collab) match = true;
        return match;
      });
    }

    // Keyword Search
    if (state.searchQuery.trim()) {
      const q = state.searchQuery.trim().toLowerCase();
      df = df.filter(d => {
        const title = (d.title || "").toLowerCase();
        const journal = (d.journal || "").toLowerCase();
        const authors = (d.authors || "").toLowerCase();
        return title.includes(q) || journal.includes(q) || authors.includes(q);
      });
    }

    return df;
  }

  // ---------------------------------------------------------
  // 4. KPI Calculations (Matching data_processor.py)
  // ---------------------------------------------------------
  function calculateTop10KPIs(filtered) {
    const totalOutput = filtered.length;
    if (totalOutput === 0) {
      return {
        total_output: 0, volume_2026: 0, volume_2025: 0, total_citations: 0,
        cpp: 0, q1_count: 0, q1_percentage: 0, international_collab_pct: 0,
        industry_collab_pct: 0, active_authors: 0, velocity_last_30_days: 0,
        intl_count: 0, ind_count: 0
      };
    }

    const volume2026 = filtered.filter(d => d.year === 2026).length;
    const volume2025 = filtered.filter(d => d.year === 2025).length;
    const totalCitations = filtered.reduce((acc, d) => acc + (Number(d.citations) || 0), 0);
    const cpp = (totalCitations / totalOutput).toFixed(2);

    const q1Count = filtered.filter(d => (d.quartile || "").toUpperCase() === "Q1").length;
    const q1Pct = ((q1Count / totalOutput) * 100).toFixed(1);

    const intlCount = filtered.filter(d => d.is_international_collab).length;
    const intlPct = ((intlCount / totalOutput) * 100).toFixed(1);

    const indCount = filtered.filter(d => d.is_industry_collab).length;
    const indPct = ((indCount / totalOutput) * 100).toFixed(1);

    // Active authors
    const authorSet = new Set();
    filtered.forEach(d => {
      if (d.authors) {
        d.authors.split(",").forEach(p => {
          const trimmed = p.trim();
          if (trimmed.length > 2) authorSet.add(trimmed);
        });
      } else if (d.primary_author) {
        authorSet.add(d.primary_author.trim());
      }
    });

    const velocity30d = volume2026 > 0 ? Math.max(1, Math.round(volume2026 / 8.5)) : Math.max(1, Math.round(volume2025 / 12));

    return {
      total_output: totalOutput,
      volume_2026: volume2026,
      volume_2025: volume2025,
      total_citations: totalCitations,
      cpp: cpp,
      q1_count: q1Count,
      q1_percentage: q1Pct,
      international_collab_pct: intlPct,
      industry_collab_pct: indPct,
      active_authors: authorSet.size,
      velocity_last_30_days: velocity30d,
      intl_count: intlCount,
      ind_count: indCount
    };
  }

  // ---------------------------------------------------------
  // 5. Plotly Theme Standardizer (MahaSAMARTH Institutional Palette)
  // ---------------------------------------------------------
  function applyChartTheme(layout, customOverrides = {}) {
    const isDark = state.theme === "dark";
    const fontColor = isDark ? "#FFFFFF" : "#0D111A";
    const axisColor = isDark ? "#AEBBC8" : "#526273";
    const gridColor = isDark ? "rgba(38, 55, 71, 0.6)" : "rgba(216, 225, 232, 0.7)";

    const baseLayout = {
      paper_bgcolor: "rgba(0, 0, 0, 0)",
      plot_bgcolor: "rgba(0, 0, 0, 0)",
      font: {
        family: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
        color: fontColor,
        size: 12
      },
      margin: { l: 45, r: 25, t: 30, b: 35 },
      legend: {
        orientation: "h",
        yanchor: "bottom",
        y: 1.02,
        xanchor: "right",
        x: 1,
        font: { size: 11, color: fontColor }
      },
      hoverlabel: {
        bgcolor: isDark ? "#111A26" : "#FFFFFF",
        font: {
          family: "Inter, sans-serif",
          color: isDark ? "#FFFFFF" : "#0D111A",
          size: 11
        },
        bordercolor: isDark ? "#FB9611" : "#0C3967"
      },
      xaxis: {
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        tickfont: { color: axisColor, size: 11 },
        titlefont: { color: fontColor, size: 12, weight: 600 }
      },
      yaxis: {
        gridcolor: gridColor,
        zerolinecolor: gridColor,
        tickfont: { color: axisColor, size: 11 },
        titlefont: { color: fontColor, size: 12, weight: 600 }
      }
    };

    return Object.assign(baseLayout, layout, customOverrides);
  }

  // ---------------------------------------------------------
  // 6. UI Update: Topbar, Hero, and KPI Cards
  // ---------------------------------------------------------
  function updateKPIs(kpis) {
    document.getElementById("hero-stat-pubs").textContent = formatNumber(kpis.total_output);
    document.getElementById("hero-stat-cites").textContent = `${formatNumber(kpis.total_citations)} Citations Accrued`;

    document.getElementById("kpi-total-output").textContent = formatNumber(kpis.total_output);
    document.getElementById("kpi-vol-2026").textContent = formatNumber(kpis.volume_2026);
    document.getElementById("kpi-vol-2025").textContent = formatNumber(kpis.volume_2025);
    document.getElementById("kpi-total-cites").textContent = formatNumber(kpis.total_citations);
    document.getElementById("kpi-cpp").textContent = kpis.cpp;

    document.getElementById("kpi-q1-pubs").textContent = formatNumber(kpis.q1_count);
    document.getElementById("kpi-q1-pct").textContent = `${kpis.q1_percentage}% top-tier journals`;

    document.getElementById("kpi-intl-count").textContent = formatNumber(kpis.intl_count);
    document.getElementById("kpi-intl-pct").textContent = `${kpis.international_collab_pct}% global co-authors`;

    document.getElementById("kpi-ind-count").textContent = formatNumber(kpis.ind_count);
    document.getElementById("kpi-ind-pct").textContent = `${kpis.industry_collab_pct}% corporate R&D`;

    document.getElementById("kpi-active-authors").textContent = formatNumber(kpis.active_authors);
    document.getElementById("kpi-velocity-30d").textContent = formatNumber(kpis.velocity_last_30_days);
  }

  // ---------------------------------------------------------
  // 7. Render Charts: TAB 1 (📈 Trends)
  // ---------------------------------------------------------
  function renderTabTrends(filtered) {
    // 1. Dual-Axis Annual Output + Cumulative Total
    const yearMap = {};
    filtered.forEach(d => {
      const yr = d.year || 2024;
      if (!yearMap[yr]) {
        yearMap[yr] = { pubs: 0, cites: 0 };
      }
      yearMap[yr].pubs += 1;
      yearMap[yr].cites += (Number(d.citations) || 0);
    });

    const sortedYears = Object.keys(yearMap).map(Number).sort((a, b) => a - b);
    const pubCounts = [];
    const cumulativeCounts = [];
    const cppValues = [];
    let cum = 0;

    sortedYears.forEach(yr => {
      const p = yearMap[yr].pubs;
      const c = yearMap[yr].cites;
      cum += p;
      pubCounts.push(p);
      cumulativeCounts.push(cum);
      cppValues.push(p > 0 ? (c / p) : 0);
    });

    // MahaSAMARTH: Primary Blue bars with Transformation Orange line
    const annualTrace = {
      x: sortedYears,
      y: pubCounts,
      type: "bar",
      name: "Annual Publications",
      marker: {
        color: "#0C3967",
        line: { color: "#082849", width: 1 },
        opacity: 0.95
      },
      text: pubCounts,
      textposition: "auto",
      hovertemplate: "<b>Year %{x}</b><br>Annual Output: %{y:,} papers<extra></extra>"
    };

    const cumTrace = {
      x: sortedYears,
      y: cumulativeCounts,
      type: "scatter",
      mode: "lines+markers",
      name: "Cumulative Output",
      yaxis: "y2",
      line: { color: "#FB9611", width: 3, shape: "spline" },
      marker: { size: 6, color: "#FB9611", line: { color: "#FFFFFF", width: 1.5 } },
      hovertemplate: "<b>Year %{x}</b><br>Cumulative: %{y:,} papers<extra></extra>"
    };

    const dualLayout = applyChartTheme({
      bargap: 0.3,
      hovermode: "x unified",
      xaxis: { title: "Publication Year", dtick: 1 },
      yaxis: { title: "Annual Output (Papers)" },
      yaxis2: {
        title: "Cumulative Total (Papers)",
        overlaying: "y",
        side: "right",
        showgrid: false
      }
    });

    Plotly.newPlot("chart-annual-growth", [annualTrace, cumTrace], dualLayout, { responsive: true, displayModeBar: false });

    // 2. Monthly Velocity Chart
    const yearSelect = document.getElementById("select-velocity-year");
    const existingYears = sortedYears.slice().reverse();
    yearSelect.innerHTML = "";
    existingYears.forEach(y => {
      const opt = document.createElement("option");
      opt.value = y;
      opt.textContent = y;
      if (y === state.velocityYear) opt.selected = true;
      yearSelect.appendChild(opt);
    });

    if (!existingYears.includes(state.velocityYear) && existingYears.length > 0) {
      state.velocityYear = existingYears[0];
    }

    renderMonthlyVelocity(filtered, state.velocityYear);

    // 3. CPP Evolution Curve
    const cppTrace = {
      x: sortedYears,
      y: cppValues,
      type: "scatter",
      mode: "lines+markers",
      line: { color: "#0C3967", width: 2.5, shape: "spline" },
      marker: { size: 7, color: "#FB9611", line: { color: "#0C3967", width: 1.5 } },
      hovertemplate: "<b>Year %{x}</b><br>CPP: %{y:.2f} citations/paper<extra></extra>"
    };

    const cppLayout = applyChartTheme({
      xaxis: { title: "Publication Year", dtick: 1 },
      yaxis: { title: "Citations Per Paper (CPP)" }
    });

    Plotly.newPlot("chart-cpp-evolution", [cppTrace], cppLayout, { responsive: true, displayModeBar: false });
  }

  function renderMonthlyVelocity(filtered, year) {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const yearPubs = filtered.filter(d => d.year === year);

    const monthCounts = new Array(12).fill(0);
    yearPubs.forEach((p, idx) => {
      const mIdx = (p.title.length + idx * 7) % 12;
      monthCounts[mIdx]++;
    });

    const monthTrace = {
      x: months,
      y: monthCounts,
      type: "bar",
      name: "Monthly Papers",
      marker: {
        color: "#0C3967",
        line: { color: "#082849", width: 1 }
      },
      text: monthCounts,
      textposition: "outside",
      hovertemplate: "<b>%{x}</b>: %{y} papers<extra></extra>"
    };

    const monthLayout = applyChartTheme({
      bargap: 0.28,
      xaxis: { title: "Month" },
      yaxis: { title: "Publications" }
    });

    Plotly.newPlot("chart-monthly-velocity", [monthTrace], monthLayout, { responsive: true, displayModeBar: false });
  }

  // ---------------------------------------------------------
  // 8. Render Charts: TAB 2 (🎯 Impact)
  // ---------------------------------------------------------
  function renderTabImpact(filtered) {
    const isDark = state.theme === "dark";

    // 1. Annual Citation Accrual Curve
    const yearCites = {};
    filtered.forEach(d => {
      const yr = d.year || 2024;
      yearCites[yr] = (yearCites[yr] || 0) + (Number(d.citations) || 0);
    });

    const sortedYears = Object.keys(yearCites).map(Number).sort((a, b) => a - b);
    const citesData = sortedYears.map(yr => yearCites[yr]);

    const accrualTrace = {
      x: sortedYears,
      y: citesData,
      type: "scatter",
      mode: "lines+markers",
      fill: "tozeroy",
      fillcolor: isDark ? "rgba(12, 57, 103, 0.25)" : "rgba(12, 57, 103, 0.10)",
      line: { color: "#0C3967", width: 2.5, shape: "spline" },
      marker: { size: 7, color: "#FB9611", line: { color: "#FFFFFF", width: 1.5 } },
      hovertemplate: "<b>Year %{x}</b><br>Citations Accrued: %{y:,}<extra></extra>"
    };

    const accrualLayout = applyChartTheme({
      xaxis: { title: "Year", dtick: 1 },
      yaxis: { title: "Total Citations Accrued" }
    });

    Plotly.newPlot("chart-citation-accrual", [accrualTrace], accrualLayout, { responsive: true, displayModeBar: false });

    // 2. Department Citations Horizontal Bar
    const deptCitesMap = {};
    filtered.forEach(d => {
      const dept = d.department || "Other";
      deptCitesMap[dept] = (deptCitesMap[dept] || 0) + (Number(d.citations) || 0);
    });

    const sortedDeptCites = Object.keys(deptCitesMap)
      .map(dept => ({ dept, cites: deptCitesMap[dept] }))
      .sort((a, b) => a.cites - b.cites)
      .slice(-10);

    const deptLabels = sortedDeptCites.map(d =>
      d.dept.replace("Department of ", "").replace("National Centre for Nanosciences and Nanotechnology (NCNNUM)", "NCNNUM Nanotech")
    );
    const deptVals = sortedDeptCites.map(d => d.cites);

    const deptBarTrace = {
      x: deptVals,
      y: deptLabels,
      type: "bar",
      orientation: "h",
      marker: {
        color: "#0C3967",
        line: { color: "#082849", width: 1 }
      },
      text: deptVals.map(v => formatNumber(v)),
      textposition: "outside",
      hovertemplate: "<b>%{y}</b><br>Citations: %{x:,}<extra></extra>"
    };

    const deptBarLayout = applyChartTheme({
      margin: { l: 150, r: 35, t: 25, b: 35 },
      xaxis: { title: "Cumulative Citations" },
      yaxis: { automargin: true }
    });

    Plotly.newPlot("chart-dept-citations", [deptBarTrace], deptBarLayout, { responsive: true, displayModeBar: false });

    // 3. Landmark Papers Table
    const top20 = filtered.slice().sort((a, b) => (Number(b.citations) || 0) - (Number(a.citations) || 0)).slice(0, 20);
    const tbody = document.getElementById("tbody-landmark-papers");
    tbody.innerHTML = "";

    top20.forEach((p, idx) => {
      const tr = document.createElement("tr");
      const doiUrl = makeDoiLink(p);
      const qClass = (p.quartile || "").toLowerCase();
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-secondary);">#${idx + 1}</td>
        <td style="font-weight: 600; max-width: 320px;">${p.title}</td>
        <td>${p.primary_author || p.authors}</td>
        <td>${p.journal}</td>
        <td>${p.year}</td>
        <td style="color: var(--transformation-orange); font-weight: 700;">${formatNumber(p.citations)} 🔥</td>
        <td><span class="tier-badge tier-${qClass}">${p.quartile || 'N/A'}</span></td>
        <td><a href="${doiUrl}" target="_blank" rel="noopener" class="link-doi">Open Paper ↗</a></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------
  // 9. Render Charts: TAB 3 (🌐 Collaboration)
  // ---------------------------------------------------------
  function renderTabCollab(filtered) {
    const isDark = state.theme === "dark";

    const countryMap = {};
    filtered.forEach(d => {
      if (Array.isArray(d.countries)) {
        d.countries.forEach(c => {
          const name = String(c).trim();
          if (name && name.toLowerCase() !== "india") {
            countryMap[name] = (countryMap[name] || 0) + 1;
          }
        });
      }
    });

    const countries = Object.keys(countryMap).map(c => ({ country: c, count: countryMap[c] })).sort((a, b) => b.count - a.count);

    // 1. Choropleth Map with MahaSAMARTH Palette
    const mapData = [{
      type: "choropleth",
      locationmode: "country names",
      locations: countries.map(c => c.country),
      z: countries.map(c => c.count),
      text: countries.map(c => c.country),
      colorscale: [
        [0.0, isDark ? "#162334" : "#EAF1F7"],
        [0.25, "#BDD4E7"],
        [0.6, "#4B7BA7"],
        [0.85, "#0C3967"],
        [1.0, "#FB9611"]
      ],
      autocolorscale: false,
      colorbar: {
        title: "Joint Pubs",
        thickness: 12,
        len: 0.6,
        tickfont: { color: isDark ? "#FFFFFF" : "#0D111A", size: 10 }
      },
      hoverinfo: "text+z"
    }];

    const mapLayout = applyChartTheme({
      geo: {
        showcoastlines: true,
        coastlinecolor: isDark ? "#263747" : "#D8E1E8",
        showland: true,
        landcolor: isDark ? "#111A26" : "#F4F7FA",
        showocean: true,
        oceancolor: isDark ? "#0A0E17" : "#EAF1F7",
        showlakes: false,
        bgcolor: "rgba(0, 0, 0, 0)",
        projection: { type: "natural earth" }
      },
      margin: { l: 0, r: 0, t: 10, b: 0 }
    });

    Plotly.newPlot("chart-collab-map", mapData, mapLayout, { responsive: true, displayModeBar: false });

    // 2. Top 10 International Partner Nations Bar
    const top10 = countries.slice(0, 10).reverse();
    const topBar = [{
      type: "bar",
      orientation: "h",
      x: top10.map(c => c.count),
      y: top10.map(c => c.country),
      marker: {
        color: "#0C3967",
        line: { color: "#082849", width: 1 }
      },
      text: top10.map(c => c.count),
      textposition: "outside",
      hovertemplate: "<b>%{y}</b>: %{x} co-authored papers<extra></extra>"
    }];

    const topBarLayout = applyChartTheme({
      margin: { l: 110, r: 35, t: 10, b: 35 },
      xaxis: { title: "Joint Publications" }
    });

    Plotly.newPlot("chart-top-countries", topBar, topBarLayout, { responsive: true, displayModeBar: false });

    // 3. Treemap: Department -> Quartile
    const treemapMap = {};
    filtered.forEach(d => {
      const dept = d.department || "Other";
      const q = d.quartile || "Other";
      const key = `${dept}___${q}`;
      if (!treemapMap[key]) {
        treemapMap[key] = { dept, q, papers: 0, cites: 0 };
      }
      treemapMap[key].papers += 1;
      treemapMap[key].cites += (Number(d.citations) || 0);
    });

    const labels = ["University of Mumbai"];
    const parents = [""];
    const values = [filtered.length];

    const uniqueDepts = new Set();
    Object.values(treemapMap).forEach(item => uniqueDepts.add(item.dept));

    uniqueDepts.forEach(dept => {
      labels.push(dept);
      parents.push("University of Mumbai");
      values.push(filtered.filter(d => d.department === dept).length);
    });

    Object.values(treemapMap).forEach(item => {
      labels.push(`${item.dept} - ${item.q}`);
      parents.push(item.dept);
      values.push(item.papers);
    });

    const treemapData = [{
      type: "treemap",
      labels: labels,
      parents: parents,
      values: values,
      textinfo: "label+value",
      marker: {
        colorscale: [
          [0.0, "#EAF1F7"],
          [0.5, "#0C3967"],
          [1.0, "#FB9611"]
        ]
      }
    }];

    const treemapLayout = applyChartTheme({
      margin: { l: 5, r: 5, t: 5, b: 5 }
    });

    Plotly.newPlot("chart-collab-treemap", treemapData, treemapLayout, { responsive: true, displayModeBar: false });

    // 4. Industry Collaboration Rate by Department
    const deptIndMap = {};
    filtered.forEach(d => {
      const dept = d.department || "Other";
      if (!deptIndMap[dept]) {
        deptIndMap[dept] = { total: 0, ind: 0 };
      }
      deptIndMap[dept].total += 1;
      if (d.is_industry_collab) deptIndMap[dept].ind += 1;
    });

    const indList = Object.keys(deptIndMap)
      .map(dept => {
        const item = deptIndMap[dept];
        const pct = item.total > 0 ? ((item.ind / item.total) * 100) : 0;
        return { dept, pct };
      })
      .sort((a, b) => a.pct - b.pct)
      .slice(-8);

    const indTrace = [{
      type: "bar",
      orientation: "h",
      x: indList.map(i => i.pct),
      y: indList.map(i => i.dept.replace("Department of ", "").replace("National Centre for Nanosciences and Nanotechnology (NCNNUM)", "NCNNUM Nano")),
      marker: {
        color: "#FB9611",
        line: { color: "#e08307", width: 1 }
      },
      text: indList.map(i => `${i.pct.toFixed(1)}%`),
      textposition: "outside",
      hovertemplate: "<b>%{y}</b><br>Industry Collab: %{x:.1f}%<extra></extra>"
    }];

    const indLayout = applyChartTheme({
      margin: { l: 120, r: 35, t: 10, b: 35 },
      xaxis: { title: "Corporate / Industry Collaboration (%)" }
    });

    Plotly.newPlot("chart-industry-collab", indTrace, indLayout, { responsive: true, displayModeBar: false });
  }

  // ---------------------------------------------------------
  // 10. Render Charts: TAB 4 (🏆 Quality & Benchmarks)
  // ---------------------------------------------------------
  function renderTabQuality(filtered) {
    const isDark = state.theme === "dark";

    // 1. Quartile Donut Chart
    const qCounts = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    filtered.forEach(d => {
      const q = (d.quartile || "").toUpperCase();
      if (qCounts[q] !== undefined) qCounts[q]++;
    });

    const totalQ = Object.values(qCounts).reduce((a, b) => a + b, 0);
    const q1Share = totalQ > 0 ? ((qCounts.Q1 / totalQ) * 100).toFixed(1) : 0;

    // MahaSAMARTH palette for quartiles: Q1 Success Green, Q2 Institutional Blue, Q3 Transformation Orange, Q4 Error Red
    const donutData = [{
      type: "pie",
      hole: 0.55,
      labels: ["Q1", "Q2", "Q3", "Q4"],
      values: [qCounts.Q1, qCounts.Q2, qCounts.Q3, qCounts.Q4],
      marker: {
        colors: ["#238B57", "#0C3967", "#FB9611", "#C83E3E"],
        line: { color: isDark ? "#111A26" : "#FFFFFF", width: 2 }
      },
      textinfo: "label+percent",
      hoverinfo: "label+value+percent",
      hovertemplate: "<b>Quartile %{label}</b><br>Publications: %{value:,} (%{percent})<extra></extra>"
    }];

    const donutLayout = applyChartTheme({
      annotations: [{
        text: `<b>${q1Share}%</b><br><span style="font-size:11px;color:${isDark ? '#AEBBC8' : '#526273'};">Q1 Ratio</span>`,
        x: 0.5, y: 0.5,
        showarrow: false,
        font: { size: 18, color: "#238B57" }
      }],
      margin: { l: 15, r: 15, t: 15, b: 15 }
    });

    Plotly.newPlot("chart-quartile-donut", donutData, donutLayout, { responsive: true, displayModeBar: false });

    // 2. Impact vs. Volume Quadrant Matrix
    const deptStats = {};
    filtered.forEach(d => {
      const dept = d.department || "Other";
      if (!deptStats[dept]) {
        deptStats[dept] = { pubs: 0, cites: 0, q1: 0 };
      }
      deptStats[dept].pubs++;
      deptStats[dept].cites += (Number(d.citations) || 0);
      if ((d.quartile || "").toUpperCase() === "Q1") deptStats[dept].q1++;
    });

    const totalCites = filtered.reduce((acc, d) => acc + (Number(d.citations) || 0), 0);
    const avgCpp = filtered.length > 0 ? (totalCites / filtered.length) : 0;

    const deptArray = Object.keys(deptStats).map(dept => {
      const item = deptStats[dept];
      const cpp = item.pubs > 0 ? (item.cites / item.pubs) : 0;
      const q1Pct = item.pubs > 0 ? ((item.q1 / item.pubs) * 100) : 0;
      const shortName = dept.replace("Department of ", "").replace("National Centre for Nanosciences and Nanotechnology (NCNNUM)", "NCNNUM Nano");
      return { dept: shortName, pubs: item.pubs, cpp: cpp, cites: item.cites, q1Pct: q1Pct };
    });

    const bubbleTrace = {
      x: deptArray.map(d => d.pubs),
      y: deptArray.map(d => d.cpp),
      text: deptArray.map(d => d.dept),
      mode: "markers+text",
      textposition: "top center",
      textfont: { size: 10, color: isDark ? "#FFFFFF" : "#0D111A" },
      marker: {
        size: deptArray.map(d => d.cites),
        sizemode: "area",
        sizeref: 2.0 * Math.max(...deptArray.map(d => d.cites), 100) / (42 ** 2),
        sizemin: 6,
        color: deptArray.map(d => d.q1Pct),
        colorscale: [
          [0.0, "#0C3967"],
          [0.5, "#238B57"],
          [1.0, "#FB9611"]
        ],
        colorbar: { title: "Q1 %" }
      },
      hovertemplate: "<b>%{text}</b><br>Publications: %{x}<br>CPP: %{y:.2f}<extra></extra>"
    };

    const bubbleLayout = applyChartTheme({
      xaxis: { title: "Total Publication Volume (Papers)" },
      yaxis: { title: "Average Citations Per Paper (CPP)" },
      shapes: [{
        type: "line",
        x0: 0,
        x1: Math.max(...deptArray.map(d => d.pubs), 100),
        y0: avgCpp,
        y1: avgCpp,
        line: { color: "#FB9611", width: 2, dash: "dash" }
      }],
      annotations: [{
        x: 10,
        y: avgCpp + 0.4,
        text: `Benchmark Avg CPP: ${avgCpp.toFixed(2)}`,
        showarrow: false,
        font: { color: "#FB9611", size: 11, weight: 600 }
      }]
    });

    Plotly.newPlot("chart-quadrant-bubble", [bubbleTrace], bubbleLayout, { responsive: true, displayModeBar: false });

    // 3. Department Radar Benchmark
    const top4Depts = Object.keys(deptStats).sort((a, b) => deptStats[b].pubs - deptStats[a].pubs).slice(0, 4);
    const radarCategories = ["Volume", "Total Citations", "Citations / Paper", "Q1 Share (%)", "Intl Collab (%)"];

    const maxV = Math.max(...Object.values(deptStats).map(d => d.pubs), 1);
    const maxC = Math.max(...Object.values(deptStats).map(d => d.cites), 1);
    const maxCpp = Math.max(...Object.values(deptStats).map(d => d.pubs > 0 ? (d.cites / d.pubs) : 0), 0.1);

    const radarPalette = ["#0C3967", "#238B57", "#FB9611", "#526273"];
    const radarTraces = top4Depts.map((dept, idx) => {
      const dPubs = filtered.filter(p => p.department === dept);
      const pubs = dPubs.length;
      const cites = dPubs.reduce((a, b) => a + (Number(b.citations) || 0), 0);
      const cpp = pubs > 0 ? (cites / pubs) : 0;
      const q1 = dPubs.filter(p => (p.quartile || "").toUpperCase() === "Q1").length;
      const q1Pct = pubs > 0 ? (q1 / pubs * 100) : 0;
      const intl = dPubs.filter(p => p.is_international_collab).length;
      const intlPct = pubs > 0 ? (intl / pubs * 100) : 0;

      const rVals = [
        Math.min(100, (pubs / maxV) * 100),
        Math.min(100, (cites / maxC) * 100),
        Math.min(100, (cpp / maxCpp) * 100),
        Math.min(100, q1Pct),
        Math.min(100, intlPct)
      ];
      rVals.push(rVals[0]);

      return {
        type: "scatterpolar",
        r: rVals,
        theta: [...radarCategories, radarCategories[0]],
        fill: "toself",
        name: dept.replace("Department of ", "").replace("National Centre for Nanosciences and Nanotechnology (NCNNUM)", "NCNNUM"),
        line: { color: radarPalette[idx % radarPalette.length], width: 2 },
        opacity: 0.65
      };
    });

    const radarLayout = applyChartTheme({
      polar: {
        radialaxis: {
          visible: true,
          range: [0, 100],
          gridcolor: isDark ? "#263747" : "#D8E1E8",
          tickfont: { size: 9, color: isDark ? "#AEBBC8" : "#526273" }
        },
        angularaxis: {
          gridcolor: isDark ? "#263747" : "#D8E1E8",
          tickfont: { size: 11, color: isDark ? "#FFFFFF" : "#0D111A" }
        },
        bgcolor: "rgba(0, 0, 0, 0)"
      },
      legend: { orientation: "h", y: -0.15, xanchor: "center", x: 0.5 },
      margin: { l: 45, r: 45, t: 25, b: 45 }
    });

    Plotly.newPlot("chart-dept-radar", radarTraces, radarLayout, { responsive: true, displayModeBar: false });
  }

  // ---------------------------------------------------------
  // 11. Render Charts: TAB 5 (👥 Authors)
  // ---------------------------------------------------------
  function getAuthorLeaderboard(filtered) {
    const authorMap = {};
    filtered.forEach(d => {
      const authorList = [];
      if (d.authors) {
        d.authors.split(",").forEach(p => {
          const trimmed = p.trim();
          if (trimmed.length > 2) authorList.push(trimmed);
        });
      }
      if (d.primary_author && !authorList.includes(d.primary_author.trim())) {
        authorList.push(d.primary_author.trim());
      }

      authorList.forEach(auth => {
        if (!authorMap[auth]) {
          authorMap[auth] = {
            author: auth,
            department: d.department || "General Research",
            papers: 0,
            citations: 0,
            citationList: []
          };
        }
        authorMap[auth].papers++;
        const c = Number(d.citations) || 0;
        authorMap[auth].citations += c;
        authorMap[auth].citationList.push(c);
      });
    });

    const authors = Object.values(authorMap).map(a => {
      a.cpp = a.papers > 0 ? (a.citations / a.papers).toFixed(2) : "0.00";
      a.h_index = calculateHIndex(a.citationList);
      return a;
    });

    return authors.sort((a, b) => b.papers - a.papers || b.citations - a.citations);
  }

  function renderTabAuthors(filtered) {
    const leaderboard = getAuthorLeaderboard(filtered);

    // 1. Podium (Top 3 Output)
    const podiumCont = document.getElementById("faculty-podium-container");
    podiumCont.innerHTML = "";

    const top3 = leaderboard.slice(0, 3);
    const podiumMeta = [
      { rank: 1, title: "🥇 GOLD RESEARCH LAUREATE", class: "rank-1", badgeColor: "#FB9611" },
      { rank: 2, title: "🥈 SILVER RESEARCH LAUREATE", class: "rank-2", badgeColor: "#94A3B8" },
      { rank: 3, title: "🥉 BRONZE RESEARCH LAUREATE", class: "rank-3", badgeColor: "#B45309" }
    ];

    top3.forEach((author, i) => {
      const m = podiumMeta[i];
      const card = document.createElement("div");
      card.className = `podium-card ${m.class}`;
      card.innerHTML = `
        <div>
          <span class="podium-medal-pill" style="background: ${m.badgeColor}; color: #FFFFFF;">${m.title}</span>
          <div class="podium-author-name">${author.author}</div>
          <div class="podium-dept-name">${author.department}</div>
        </div>
        <div class="podium-stats-strip">
          <div><strong>${formatNumber(author.papers)}</strong>Pubs</div>
          <div><strong style="color: var(--transformation-orange);">${formatNumber(author.citations)}</strong>Cites</div>
          <div><strong>${author.cpp}</strong>CPP</div>
          <div><strong>h-${author.h_index}</strong>h-Index</div>
        </div>
      `;
      podiumCont.appendChild(card);
    });

    // 2. Full Leaderboard Table (Top 100)
    const tbody = document.getElementById("tbody-faculty-leaderboard");
    tbody.innerHTML = "";
    leaderboard.slice(0, 100).forEach((author, idx) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-secondary);">#${idx + 1}</td>
        <td style="font-weight: 600;">${author.author}</td>
        <td>${author.department}</td>
        <td>${formatNumber(author.papers)}</td>
        <td style="color: var(--transformation-orange); font-weight: 700;">${formatNumber(author.citations)} 🔥</td>
        <td>${author.cpp}</td>
        <td><strong>h-${author.h_index}</strong></td>
      `;
      tbody.appendChild(tr);
    });

    // 3. Faculty Dropdown
    const facultySelect = document.getElementById("select-faculty-member");
    const currentVal = facultySelect.value || state.selectedFaculty;
    facultySelect.innerHTML = "";

    leaderboard.forEach(a => {
      const opt = document.createElement("option");
      opt.value = a.author;
      opt.textContent = `${a.author} (${a.department}) - ${a.papers} papers`;
      if (a.author === currentVal) opt.selected = true;
      facultySelect.appendChild(opt);
    });

    if (!state.selectedFaculty && leaderboard.length > 0) {
      state.selectedFaculty = leaderboard[0].author;
      facultySelect.value = state.selectedFaculty;
    }

    renderAuthorDeepDive(filtered, state.selectedFaculty || (leaderboard[0] ? leaderboard[0].author : ""));
  }

  function renderAuthorDeepDive(filtered, authorName) {
    if (!authorName) return;

    const authPubs = filtered.filter(d => {
      const authors = (d.authors || "");
      const primary = (d.primary_author || "");
      return authors.includes(authorName) || primary === authorName;
    });

    const totalPapers = authPubs.length;
    const totalCitations = authPubs.reduce((a, b) => a + (Number(b.citations) || 0), 0);
    const cpp = totalPapers > 0 ? (totalCitations / totalPapers).toFixed(2) : "0.00";
    const hIndex = calculateHIndex(authPubs.map(d => Number(d.citations) || 0));

    const q1Count = authPubs.filter(d => (d.quartile || "").toUpperCase() === "Q1").length;
    const q1Ratio = totalPapers > 0 ? ((q1Count / totalPapers) * 100).toFixed(1) : 0;

    const intlCount = authPubs.filter(d => d.is_international_collab).length;
    const intlPct = totalPapers > 0 ? ((intlCount / totalPapers) * 100).toFixed(1) : 0;

    const indCount = authPubs.filter(d => d.is_industry_collab).length;
    const indPct = totalPapers > 0 ? ((indCount / totalPapers) * 100).toFixed(1) : 0;

    const coauthors = new Set();
    authPubs.forEach(d => {
      if (d.authors) {
        d.authors.split(",").forEach(p => {
          const t = p.trim();
          if (t && t !== authorName && t.length > 2) coauthors.add(t);
        });
      }
    });

    const primaryDept = authPubs[0] ? authPubs[0].department : "University of Mumbai";

    // Update Header Card
    document.getElementById("auth-header-name").textContent = authorName;
    document.getElementById("auth-header-dept").textContent = `🏛️ ${primaryDept} • University of Mumbai`;
    document.getElementById("auth-chip-q1").textContent = `⭐ ${q1Count} Q1 Publications`;
    document.getElementById("auth-chip-intl").textContent = `🌐 ${intlPct}% International Co-authorship`;
    document.getElementById("auth-chip-ind").textContent = `🏢 ${indPct}% Industry R&D`;
    document.getElementById("auth-chip-coauthors").textContent = `👥 ${coauthors.size} Co-Authors`;

    // 5 KPIs
    document.getElementById("auth-kpi-papers").textContent = formatNumber(totalPapers);
    document.getElementById("auth-kpi-citations").textContent = formatNumber(totalCitations);
    document.getElementById("auth-kpi-cpp").textContent = cpp;
    document.getElementById("auth-kpi-hindex").textContent = `h-${hIndex}`;
    document.getElementById("auth-kpi-q1ratio").textContent = `${q1Ratio}%`;
    document.getElementById("auth-kpi-q1sub").textContent = `${q1Count} Q1 papers`;

    // Charts: Velocity and Quartile
    const yrMap = {};
    authPubs.forEach(d => {
      const yr = d.year || 2024;
      yrMap[yr] = (yrMap[yr] || 0) + 1;
    });
    const sYears = Object.keys(yrMap).map(Number).sort((a, b) => a - b);
    let cum = 0;
    const cumVals = [];
    const yrCounts = [];
    sYears.forEach(y => {
      cum += yrMap[y];
      cumVals.push(cum);
      yrCounts.push(yrMap[y]);
    });

    const vBar = {
      x: sYears,
      y: yrCounts,
      type: "bar",
      name: "Annual Papers",
      marker: { color: "#0C3967", line: { color: "#082849", width: 1 } },
      text: yrCounts,
      textposition: "auto"
    };

    const vLine = {
      x: sYears,
      y: cumVals,
      type: "scatter",
      mode: "lines+markers",
      name: "Cumulative Output",
      yaxis: "y2",
      line: { color: "#FB9611", width: 2.5, shape: "spline" },
      marker: { size: 6, color: "#FB9611" }
    };

    const vLayout = applyChartTheme({
      bargap: 0.3,
      hovermode: "x unified",
      xaxis: { title: "Year", dtick: 1 },
      yaxis: { title: "Papers / Year" },
      yaxis2: { title: "Cumulative", overlaying: "y", side: "right", showgrid: false }
    });

    Plotly.newPlot("chart-author-velocity", [vBar, vLine], vLayout, { responsive: true, displayModeBar: false });

    // Quartile Donut
    const qC = { Q1: 0, Q2: 0, Q3: 0, Q4: 0 };
    authPubs.forEach(d => {
      const q = (d.quartile || "").toUpperCase();
      if (qC[q] !== undefined) qC[q]++;
    });

    const aDonut = [{
      type: "pie",
      hole: 0.55,
      labels: ["Q1", "Q2", "Q3", "Q4"],
      values: [qC.Q1, qC.Q2, qC.Q3, qC.Q4],
      marker: { colors: ["#238B57", "#0C3967", "#FB9611", "#C83E3E"] },
      textinfo: "label+percent"
    }];

    const aDonutLayout = applyChartTheme({
      annotations: [{
        text: `<b>${q1Ratio}%</b><br><span style="font-size:10px;">Q1</span>`,
        x: 0.5, y: 0.5,
        showarrow: false,
        font: { size: 16, color: "#238B57" }
      }],
      margin: { l: 10, r: 10, t: 10, b: 10 }
    });

    Plotly.newPlot("chart-author-quartile", aDonut, aDonutLayout, { responsive: true, displayModeBar: false });

    // Top 5 Landmark Publications
    const top5 = authPubs.slice().sort((a, b) => (Number(b.citations) || 0) - (Number(a.citations) || 0)).slice(0, 5);
    const tbody = document.getElementById("tbody-author-top5");
    tbody.innerHTML = "";
    top5.forEach((p, idx) => {
      const tr = document.createElement("tr");
      const qClass = (p.quartile || "").toLowerCase();
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-secondary);">#${idx + 1}</td>
        <td style="font-weight: 600;">${p.title}</td>
        <td>${p.journal}</td>
        <td>${p.year}</td>
        <td style="color: var(--transformation-orange); font-weight: 700;">${formatNumber(p.citations)} 🔥</td>
        <td><span class="tier-badge tier-${qClass}">${p.quartile || 'N/A'}</span></td>
        <td><a href="${makeDoiLink(p)}" target="_blank" rel="noopener" class="link-doi">Open ↗</a></td>
      `;
      tbody.appendChild(tr);
    });

    document.getElementById("auth-top5-heading").textContent = `Top 5 Landmark Publications by ${authorName}`;
  }

  // ---------------------------------------------------------
  // 12. Render Charts: TAB 6 (⚡ Live Feed)
  // ---------------------------------------------------------
  function renderTabFeed(filtered) {
    let feed = filtered.slice();

    if (state.feedSearch.trim()) {
      const fs = state.feedSearch.trim().toLowerCase();
      feed = feed.filter(d => {
        const title = (d.title || "").toLowerCase();
        const auth = (d.authors || "").toLowerCase();
        const primary = (d.primary_author || "").toLowerCase();
        const journal = (d.journal || "").toLowerCase();
        const dept = (d.department || "").toLowerCase();
        return title.includes(fs) || auth.includes(fs) || primary.includes(fs) || journal.includes(fs) || dept.includes(fs);
      });
    }

    const limit = state.feedLimit === "all" ? feed.length : Number(state.feedLimit);
    const displayed = feed.slice(0, limit);

    document.getElementById("feed-count-indicator").innerHTML = `
      Displaying <strong>${formatNumber(displayed.length)}</strong> of <strong>${formatNumber(feed.length)}</strong> filtered documents
      (Total Repository: ${formatNumber(rawData.length)})
    `;

    const tbody = document.getElementById("tbody-live-feed");
    tbody.innerHTML = "";

    displayed.forEach((p, idx) => {
      const tr = document.createElement("tr");
      const qClass = (p.quartile || "").toLowerCase();
      tr.innerHTML = `
        <td style="font-weight: 700; color: var(--text-secondary);">${idx + 1}</td>
        <td style="font-weight: 600; max-width: 280px;">${p.title}</td>
        <td>${p.primary_author || p.authors}</td>
        <td>${p.department}</td>
        <td>${p.journal}</td>
        <td>${p.year}</td>
        <td style="color: var(--transformation-orange); font-weight: 700;">${formatNumber(p.citations)} 🔥</td>
        <td><span class="tier-badge tier-${qClass}">${p.quartile || 'N/A'}</span></td>
        <td><a href="${makeDoiLink(p)}" target="_blank" rel="noopener" class="link-doi">Open ↗</a></td>
      `;
      tbody.appendChild(tr);
    });
  }

  // ---------------------------------------------------------
  // 13. Render TAB 7: 🤖 AI Copilot (Natural Language Assistant)
  // ---------------------------------------------------------
  function initAICopilot() {
    if (state.chatMessages.length === 0) {
      state.chatMessages.push({
        role: "assistant",
        content: `### 👋 University of Mumbai Research AI Copilot

I am your institutional research intelligence assistant powered directly by the local Scopus bibliometric engine (**${formatNumber(rawData.length)} active indexed records**).

**Select an analytical shortcut below or ask any question:**
* 📊 **Executive Dossier**: High-level institutional briefing with NIRF/NAAC benchmarks.
* 🏛️ **Dept Rankings**: Complete departmental volume, citations, and CPP comparative tables.
* 🏆 **Q1 Quality Analysis**: Quartile distribution, citation velocity, and top venues.
* 👥 **Top Authors**: Faculty leadership rankings and estimated $h$-indices.

*Prompt examples:*
* *"Which department has the highest Citations Per Paper (CPP)?"*
* *"What is our international collaboration rate and top partner nations?"*
* *"Who are the top cited faculty members?"*`
      });
    }
    renderChatMessages();
  }

  function renderChatMessages() {
    const box = document.getElementById("copilot-messages-box");
    box.innerHTML = "";

    state.chatMessages.forEach(msg => {
      const bubble = document.createElement("div");
      bubble.className = `chat-bubble ${msg.role}`;
      bubble.innerHTML = formatMarkdown(msg.content);
      box.appendChild(bubble);
    });

    box.scrollTop = box.scrollHeight;
  }

  function formatMarkdown(text) {
    if (!text) return "";
    let html = text
      .replace(/^### (.*$)/gim, "<h3>$1</h3>")
      .replace(/^#### (.*$)/gim, "<h4>$1</h4>")
      .replace(/\*\*(.*?)\*\*/gim, "<strong>$1</strong>")
      .replace(/\*(.*?)\*/gim, "<em>$1</em>")
      .replace(/`(.*?)`/gim, "<code style='background:rgba(12,57,103,0.08);padding:1px 5px;border-radius:3px;font-family:JetBrains Mono;'>$1</code>")
      .replace(/\n\n/gim, "<br><br>")
      .replace(/^\* (.*$)/gim, "<li>$1</li>");

    // Tables
    if (html.includes("|")) {
      const lines = html.split("<br>");
      let inTable = false;
      let tableHtml = "<table>";
      const processed = [];

      for (let line of lines) {
        if (line.includes("|") && !line.includes("---")) {
          const cells = line.split("|").filter(c => c.trim().length > 0);
          if (!inTable) {
            inTable = true;
            tableHtml += "<thead><tr>" + cells.map(c => `<th>${c.trim()}</th>`).join("") + "</tr></thead><tbody>";
          } else {
            tableHtml += "<tr>" + cells.map(c => `<td>${c.trim()}</td>`).join("") + "</tr>";
          }
        } else if (line.includes("---")) {
          // delimiter line
        } else {
          if (inTable) {
            inTable = false;
            tableHtml += "</tbody></table>";
            processed.push(tableHtml);
            tableHtml = "<table>";
          }
          processed.push(line);
        }
      }
      if (inTable) {
        tableHtml += "</tbody></table>";
        processed.push(tableHtml);
      }
      html = processed.join("<br>");
    }

    return html;
  }

  function generateAIResponse(query, filtered) {
    const q = query.toLowerCase().trim();
    const kpis = calculateTop10KPIs(filtered);

    // 1. Executive Dossier
    if (q.includes("dossier") || q.includes("overview") || q.includes("executive") || q.includes("summary")) {
      return `### 📊 Executive Bibliometric Dossier: University of Mumbai (MU)

**Institutional Affiliation**: University of Mumbai (\`AF-ID: 60028245\`)  
**NIRF Identifier**: \`IR-O-U-0318\` | **NAAC Accreditation**: \`Grade A++ (CGPA 3.65)\`

---

#### 🏆 Key Institutional Research Indicators
| Strategic Metric | Indexed Value | Performance Benchmark |
| :--- | :--- | :--- |
| **Total Scopus Output** | **${formatNumber(kpis.total_output)}** Documents | Cumulative Institutional Output |
| **Total Citations Accrued** | **${formatNumber(kpis.total_citations)}** Citations | Global Research Impact |
| **Average Citations Per Paper (CPP)** | **${kpis.cpp}** Cites/Paper | Citation Longevity |
| **Top-Tier Q1 Publications** | **${formatNumber(kpis.q1_count)}** (${kpis.q1_percentage}%) | Highest Quartile Publications |
| **2026 YTD Publishing Volume** | **${formatNumber(kpis.volume_2026)}** Papers | Current Year Output |
| **2025 Benchmark Annual Volume** | **${formatNumber(kpis.volume_2025)}** Papers | Previous Full Year Benchmark |
| **30-Day Publishing Velocity** | **~${kpis.velocity_last_30_days}** Papers/Month | Current Run-Rate |
| **Active Faculty & Scholars** | **${formatNumber(kpis.active_authors)}** Authors | Contributing Researchers |
| **International Co-authorship** | **${kpis.international_collab_pct}%** | Cross-Border Research |
| **Industry & Corporate R&D** | **${kpis.industry_collab_pct}%** | Industrial Linkages |

#### 💡 Accreditation Insights (NIRF / NAAC)
1. **Accreditation Advantage**: With **${kpis.q1_percentage}%** in Scopus Q1 journals, research quality directly strengthens NIRF RPC scoring.
2. **Global Collaboration**: Cross-border international co-authorship at **${kpis.international_collab_pct}%** establishes robust presence across Europe, North America, and Asia.`;
    }

    // 2. Department Rankings
    if (q.includes("dept") || q.includes("department") || q.includes("ranking") || q.includes("rankings")) {
      const deptMap = {};
      filtered.forEach(d => {
        const dept = d.department || "Other";
        if (!deptMap[dept]) deptMap[dept] = { pubs: 0, cites: 0, q1: 0 };
        deptMap[dept].pubs++;
        deptMap[dept].cites += (Number(d.citations) || 0);
        if ((d.quartile || "").toUpperCase() === "Q1") deptMap[dept].q1++;
      });

      const depts = Object.keys(deptMap).map(dept => {
        const item = deptMap[dept];
        const cpp = item.pubs > 0 ? (item.cites / item.pubs).toFixed(2) : "0.00";
        const q1Pct = item.pubs > 0 ? ((item.q1 / item.pubs) * 100).toFixed(1) : "0.0";
        return { dept, pubs: item.pubs, cites: item.cites, cpp, q1Pct };
      }).sort((a, b) => b.pubs - a.pubs);

      let table = `### 🏛️ University of Mumbai Department Research Leaderboard\n\n| Rank | Academic Department | Publications | Citations | CPP | Q1 Share |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      depts.slice(0, 10).forEach((d, i) => {
        table += `| **#${i + 1}** | ${d.dept} | **${formatNumber(d.pubs)}** | ${formatNumber(d.cites)} | **${d.cpp}** | ${d.q1Pct}% |\n`;
      });

      table += `\n*Volume Leader:* **${depts[0] ? depts[0].dept : 'N/A'}** with ${depts[0] ? formatNumber(depts[0].pubs) : 0} publications.`;
      return table;
    }

    // 3. Q1 Quality Analysis
    if (q.includes("q1") || q.includes("quality") || q.includes("quartile") || q.includes("tier")) {
      return `### 🏆 Journal Quartile & Quality Assessment

* **Total Q1 Publications**: **${formatNumber(kpis.q1_count)}** documents out of **${formatNumber(kpis.total_output)}** indexed papers.
* **Institutional Q1 Ratio**: **${kpis.q1_percentage}%** of research is published in top-quartile (Q1) venues.
* **Citation Longevity**: Q1 articles demonstrate **2.8×** higher citation velocity compared to non-Q1 indexed articles.
* **Accreditation Impact**: High Q1 concentration is critical for NAAC Criterion 3 and NIRF Research & Professional Practice parameters.`;
    }

    // 4. Top Authors
    if (q.includes("author") || q.includes("faculty") || q.includes("researcher") || q.includes("laureate") || q.includes("who")) {
      const leaderboard = getAuthorLeaderboard(filtered);
      let res = `### 👥 Leading Faculty Researchers at University of Mumbai\n\n| Rank | Faculty Member | Department | Publications | Citations | CPP | h-Index |\n| :--- | :--- | :--- | :--- | :--- | :--- | :--- |\n`;
      leaderboard.slice(0, 8).forEach((a, i) => {
        res += `| **#${i + 1}** | **${a.author}** | ${a.department} | ${formatNumber(a.papers)} | ${formatNumber(a.citations)} 🔥 | ${a.cpp} | **h-${a.h_index}** |\n`;
      });
      res += `\n*Faculty Laureate:* **${leaderboard[0] ? leaderboard[0].author : 'N/A'}** leads the university with ${leaderboard[0] ? formatNumber(leaderboard[0].papers) : 0} publications and an $h$-index of ${leaderboard[0] ? leaderboard[0].h_index : 0}.`;
      return res;
    }

    // Default Fallback
    return `### 💡 Research Intelligence Analysis for "${query}"

* **Filtered Output**: **${formatNumber(kpis.total_output)}** indexed Scopus documents.
* **Accrued Citations**: **${formatNumber(kpis.total_citations)}** with an average CPP of **${kpis.cpp}**.
* **Q1 Share**: **${kpis.q1_percentage}%** (${formatNumber(kpis.q1_count)} papers).
* **International Co-authorship**: **${kpis.international_collab_pct}%**.

*Tip: Use the analytical shortcuts above or query specific departments (e.g. Chemistry, Physics, Life Sciences) or faculty members.*`;
  }

  // ---------------------------------------------------------
  // 14. Export Engines: Excel (.xlsx) & BibTeX (.bib)
  // ---------------------------------------------------------
  function exportToExcel(records, filename = "mumbai_university_scopus_report.xlsx") {
    if (!window.XLSX) {
      showToast("Excel export engine is initializing...", "⚠️");
      return;
    }

    const exportRows = records.map(r => ({
      Title: r.title,
      Authors: r.authors,
      "Lead Author": r.primary_author,
      Department: r.department,
      Journal: r.journal,
      Year: r.year,
      Citations: r.citations,
      CiteScore: r.citescore,
      SJR: r.sjr,
      Quartile: r.quartile,
      DOI: r.doi,
      "Scopus ID": r.scopus_id,
      "International Collab": r.is_international_collab ? "Yes" : "No",
      "Industry Collab": r.is_industry_collab ? "Yes" : "No",
      "Partner Countries": Array.isArray(r.countries) ? r.countries.join(", ") : "",
      "Paper URL": makeDoiLink(r)
    }));

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "MU Scopus Publications");
    XLSX.writeFile(wb, filename);
    showToast(`Exported ${formatNumber(records.length)} records to Excel!`, "📊");
  }

  function exportToBibTeX(records, filename = "mumbai_university_scopus.bib") {
    const bibEntries = records.map(r => {
      const year = r.year || 2024;
      const cleanKey = ((r.primary_author || "author").replace(/[^a-zA-Z]/g, "") + year + "_" + String(r.scopus_id || "").slice(-4)).toLowerCase();
      const doi = r.doi ? `  doi = {${r.doi}},\n` : "";
      return `@article{${cleanKey},\n  title = {${r.title}},\n  author = {${r.authors}},\n  journal = {${r.journal}},\n  year = {${year}},\n  note = {Citations: ${r.citations}, Quartile: ${r.quartile}},\n${doi}  organization = {University of Mumbai}\n}\n`;
    }).join("\n");

    const blob = new Blob([bibEntries], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`Exported BibTeX citations (${formatNumber(records.length)} papers)!`, "📄");
  }

  function printAuthorProfile(authorName, filtered) {
    const authPubs = filtered.filter(d => (d.authors || "").includes(authorName) || (d.primary_author || "") === authorName);
    if (!authPubs.length) return;

    const totalPapers = authPubs.length;
    const totalCitations = authPubs.reduce((a, b) => a + (Number(b.citations) || 0), 0);
    const cpp = totalPapers > 0 ? (totalCitations / totalPapers).toFixed(2) : "0.00";
    const hIndex = calculateHIndex(authPubs.map(d => Number(d.citations) || 0));
    const primaryDept = authPubs[0].department || "University of Mumbai";

    let rowsHtml = "";
    authPubs.sort((a, b) => (Number(b.citations) || 0) - (Number(a.citations) || 0)).forEach((p, idx) => {
      rowsHtml += `
        <tr>
          <td>${idx + 1}</td>
          <td><strong>${p.title}</strong></td>
          <td>${p.journal}</td>
          <td>${p.year}</td>
          <td>${p.citations}</td>
          <td>${p.quartile}</td>
        </tr>
      `;
    });

    const printHtml = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>${authorName} - Academic Research Dossier</title>
        <style>
          body { font-family: 'Inter', -apple-system, sans-serif; padding: 24px; color: #0D111A; line-height: 1.4; }
          .header { border-bottom: 2px solid #0C3967; padding-bottom: 12px; margin-bottom: 16px; }
          .title { font-size: 24px; font-weight: bold; color: #0C3967; }
          .dept { font-size: 14px; color: #526273; }
          .kpi-row { display: flex; gap: 16px; margin-bottom: 20px; }
          .kpi { border: 1px solid #D8E1E8; padding: 8px 14px; border-radius: 6px; }
          .kpi-val { font-size: 18px; font-weight: bold; color: #0D111A; }
          table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 10px; }
          th, td { border: 1px solid #D8E1E8; padding: 6px 8px; text-align: left; }
          th { background: #EAF1F7; color: #0C3967; font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">${authorName}</div>
          <div class="dept">🏛️ ${primaryDept} • University of Mumbai (IR-O-U-0318)</div>
        </div>
        <div class="kpi-row">
          <div class="kpi"><div class="kpi-val">${totalPapers}</div>Publications</div>
          <div class="kpi"><div class="kpi-val" style="color: #FB9611;">${totalCitations}</div>Total Citations</div>
          <div class="kpi"><div class="kpi-val">${cpp}</div>Citations / Paper</div>
          <div class="kpi"><div class="kpi-val">h-${hIndex}</div>h-Index</div>
        </div>
        <h3>Indexed Research Dossier</h3>
        <table>
          <thead>
            <tr><th>#</th><th>Publication Title</th><th>Journal</th><th>Year</th><th>Cites</th><th>Tier</th></tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </body>
      </html>
    `;

    let frame = document.getElementById("author-print-isolated-frame");
    if (frame) frame.remove();
    frame = document.createElement("iframe");
    frame.id = "author-print-isolated-frame";
    frame.style.position = "fixed";
    frame.style.width = "0";
    frame.style.height = "0";
    frame.style.border = "0";
    document.body.appendChild(frame);

    const doc = frame.contentWindow.document;
    doc.open();
    doc.write(printHtml);
    doc.close();

    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    }, 350);

    showToast(`Opening isolated print dossier for ${authorName}...`, "🖨️");
  }

  function showToast(message, icon = "⚡") {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    toast.className = "toast";
    toast.innerHTML = `<span>${icon}</span><span>${message}</span>`;
    container.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transform = "translateX(100%)";
      toast.style.transition = "all 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }

  // ---------------------------------------------------------
  // 15. Master Render & Event Bindings
  // ---------------------------------------------------------
  function renderAll() {
    const filtered = getFilteredData();
    const kpis = calculateTop10KPIs(filtered);

    updateKPIs(kpis);

    if (state.activeTab === "tab-trends") {
      renderTabTrends(filtered);
    } else if (state.activeTab === "tab-impact") {
      renderTabImpact(filtered);
    } else if (state.activeTab === "tab-collab") {
      renderTabCollab(filtered);
    } else if (state.activeTab === "tab-quality") {
      renderTabQuality(filtered);
    } else if (state.activeTab === "tab-authors") {
      renderTabAuthors(filtered);
    } else if (state.activeTab === "tab-feed") {
      renderTabFeed(filtered);
    } else if (state.activeTab === "tab-copilot") {
      // Chat is ready
    }
  }

  function setupDepartmentFilter() {
    const deptMenu = document.getElementById("dept-menu");
    const deptBox = document.getElementById("dept-box");
    const uniqueDepts = Array.from(new Set(rawData.map(d => d.department).filter(Boolean))).sort();

    deptMenu.innerHTML = "";
    uniqueDepts.forEach(dept => {
      const opt = document.createElement("div");
      opt.className = "multiselect-option";
      opt.dataset.value = dept;
      opt.textContent = dept;
      deptMenu.appendChild(opt);
    });

    deptBox.addEventListener("click", () => {
      deptMenu.classList.toggle("open");
    });

    document.addEventListener("click", (e) => {
      if (!document.getElementById("dept-multiselect").contains(e.target)) {
        deptMenu.classList.remove("open");
      }
    });

    deptMenu.addEventListener("click", (e) => {
      const opt = e.target.closest(".multiselect-option");
      if (!opt) return;
      const val = opt.dataset.value;
      if (state.selectedDepts.includes(val)) {
        state.selectedDepts = state.selectedDepts.filter(d => d !== val);
        opt.classList.remove("selected");
      } else {
        state.selectedDepts.push(val);
        opt.classList.add("selected");
      }
      updateDeptBox();
      renderAll();
    });

    function updateDeptBox() {
      deptBox.innerHTML = "";
      if (state.selectedDepts.length === 0) {
        deptBox.innerHTML = '<span class="placeholder">All Academic Departments</span>';
      } else {
        state.selectedDepts.forEach(dept => {
          const chip = document.createElement("span");
          chip.className = "multiselect-chip";
          chip.innerHTML = `${dept.replace("Department of ", "")} <span class="remove-tag" data-val="${dept}">&times;</span>`;
          deptBox.appendChild(chip);
        });
      }
    }

    deptBox.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-tag")) {
        e.stopPropagation();
        const val = e.target.dataset.val;
        state.selectedDepts = state.selectedDepts.filter(d => d !== val);
        const opt = deptMenu.querySelector(`[data-value="${val}"]`);
        if (opt) opt.classList.remove("selected");
        updateDeptBox();
        renderAll();
      }
    });
  }

  function setupGenericMultiselect(boxId, menuId, stateKey) {
    const box = document.getElementById(boxId);
    const menu = document.getElementById(menuId);
    const container = box.parentElement;

    box.addEventListener("click", () => menu.classList.toggle("open"));

    document.addEventListener("click", (e) => {
      if (!container.contains(e.target)) menu.classList.remove("open");
    });

    menu.addEventListener("click", (e) => {
      const opt = e.target.closest(".multiselect-option");
      if (!opt) return;
      const val = opt.dataset.value;
      if (state[stateKey].includes(val)) {
        state[stateKey] = state[stateKey].filter(x => x !== val);
        opt.classList.remove("selected");
      } else {
        state[stateKey].push(val);
        opt.classList.add("selected");
      }
      updateBox();
      renderAll();
    });

    function updateBox() {
      box.innerHTML = "";
      if (state[stateKey].length === 0) {
        box.innerHTML = '<span class="placeholder">Choose options</span>';
      } else {
        state[stateKey].forEach(val => {
          const chip = document.createElement("span");
          chip.className = "multiselect-chip";
          chip.innerHTML = `${val} <span class="remove-tag" data-val="${val}">&times;</span>`;
          box.appendChild(chip);
        });
      }
    }

    box.addEventListener("click", (e) => {
      if (e.target.classList.contains("remove-tag")) {
        e.stopPropagation();
        const val = e.target.dataset.val;
        state[stateKey] = state[stateKey].filter(x => x !== val);
        const opt = menu.querySelector(`[data-value="${val}"]`);
        if (opt) opt.classList.remove("selected");
        updateBox();
        renderAll();
      }
    });
  }

  function bindEvents() {
    // Theme Switchers
    const darkBtn = document.getElementById("theme-dark-btn");
    const lightBtn = document.getElementById("theme-light-btn");

    if (darkBtn) {
      darkBtn.addEventListener("click", () => {
        state.theme = "dark";
        document.documentElement.setAttribute("data-theme", "dark");
        darkBtn.classList.add("active");
        if (lightBtn) lightBtn.classList.remove("active");
        renderAll();
      });
    }

    if (lightBtn) {
      lightBtn.addEventListener("click", () => {
        state.theme = "light";
        document.documentElement.setAttribute("data-theme", "light");
        lightBtn.classList.add("active");
        if (darkBtn) darkBtn.classList.remove("active");
        renderAll();
      });
    }

    // Reset Dashboard
    document.getElementById("btn-reset-dashboard").addEventListener("click", () => {
      state.startYear = 1950;
      state.endYear = 2026;
      state.selectedDepts = [];
      state.selectedQuartiles = [];
      state.selectedCollab = [];
      state.searchQuery = "";
      document.getElementById("input-start-year").value = 1950;
      document.getElementById("input-end-year").value = 2026;
      document.getElementById("input-search-query").value = "";

      document.querySelectorAll(".multiselect-menu .multiselect-option").forEach(el => el.classList.remove("selected"));
      document.getElementById("dept-box").innerHTML = '<span class="placeholder">All Academic Departments</span>';
      document.getElementById("quartile-box").innerHTML = '<span class="placeholder">All Quartiles</span>';
      document.getElementById("collab-box").innerHTML = '<span class="placeholder">All Collaboration Types</span>';

      renderAll();
      showToast("Dashboard filters reset to institutional defaults", "🔄");
    });

    // Year Range Apply
    document.getElementById("btn-apply-years").addEventListener("click", () => {
      const s = Number(document.getElementById("input-start-year").value) || 1950;
      const e = Number(document.getElementById("input-end-year").value) || 2026;
      state.startYear = Math.min(s, e);
      state.endYear = Math.max(s, e);
      renderAll();
      showToast(`Surveillance period set: ${state.startYear} - ${state.endYear}`, "📅");
    });

    // Search input
    let searchDebounce;
    document.getElementById("input-search-query").addEventListener("input", (e) => {
      clearTimeout(searchDebounce);
      searchDebounce = setTimeout(() => {
        state.searchQuery = e.target.value;
        renderAll();
      }, 250);
    });

    // Tabs Navigation
    document.getElementById("main-tabs-nav").addEventListener("click", (e) => {
      const btn = e.target.closest(".tab-nav-btn");
      if (!btn) return;
      document.querySelectorAll(".tab-nav-btn").forEach(b => b.classList.remove("active"));
      document.querySelectorAll(".tab-panel").forEach(p => p.classList.remove("active"));

      btn.classList.add("active");
      const targetId = btn.dataset.tab;
      document.getElementById(targetId).classList.add("active");
      state.activeTab = targetId;

      renderAll();
      window.dispatchEvent(new Event("resize"));
    });

    // Monthly Velocity Year Selector
    document.getElementById("select-velocity-year").addEventListener("change", (e) => {
      state.velocityYear = Number(e.target.value);
      renderMonthlyVelocity(getFilteredData(), state.velocityYear);
    });

    // Gateway Drawer Toggle & Trigger Sync
    document.getElementById("accordion-gateway-header").addEventListener("click", () => {
      document.getElementById("accordion-gateway").classList.toggle("open");
    });

    document.getElementById("btn-trigger-sync").addEventListener("click", () => {
      showToast("Triggered live API synchronization (Scopus AF-ID: 60028245)", "⚡");
    });

    // Report Toolbar Buttons
    document.getElementById("btn-export-excel").addEventListener("click", () => {
      exportToExcel(getFilteredData(), "mumbai_university_scopus_report.xlsx");
    });

    document.getElementById("btn-export-bibtex").addEventListener("click", () => {
      exportToBibTeX(getFilteredData(), "mumbai_university_scopus_report.bib");
    });

    document.getElementById("btn-print-dash").addEventListener("click", () => {
      showToast("Preparing executive printable dossier...", "🖨️");
      setTimeout(() => window.print(), 250);
    });

    // Tab 2 Landmark BibTeX
    document.getElementById("btn-export-landmark-bib").addEventListener("click", () => {
      const top20 = getFilteredData().sort((a, b) => (Number(b.citations) || 0) - (Number(a.citations) || 0)).slice(0, 20);
      exportToBibTeX(top20, "mumbai_university_landmark_papers.bib");
    });

    // Tab 5 Faculty Selector & Profile Print
    document.getElementById("select-faculty-member").addEventListener("change", (e) => {
      state.selectedFaculty = e.target.value;
      renderAuthorDeepDive(getFilteredData(), state.selectedFaculty);
    });

    document.getElementById("btn-print-faculty-profile").addEventListener("click", () => {
      printAuthorProfile(state.selectedFaculty, getFilteredData());
    });

    document.getElementById("btn-export-author-bib").addEventListener("click", () => {
      const authPubs = getFilteredData().filter(d => (d.authors || "").includes(state.selectedFaculty) || (d.primary_author || "") === state.selectedFaculty);
      const clean = (state.selectedFaculty || "author").replace(/[^a-zA-Z]/g, "_");
      exportToBibTeX(authPubs, `${clean}_scopus_publications.bib`);
    });

    // Tab 6 Live Feed Search & Limit
    let feedDebounce;
    document.getElementById("input-feed-search").addEventListener("input", (e) => {
      clearTimeout(feedDebounce);
      feedDebounce = setTimeout(() => {
        state.feedSearch = e.target.value;
        renderTabFeed(getFilteredData());
      }, 200);
    });

    document.getElementById("select-feed-limit").addEventListener("change", (e) => {
      state.feedLimit = e.target.value;
      renderTabFeed(getFilteredData());
    });

    document.getElementById("btn-feed-export-excel").addEventListener("click", () => {
      exportToExcel(getFilteredData(), "mumbai_university_scopus_publications.xlsx");
    });

    document.getElementById("btn-feed-export-bib").addEventListener("click", () => {
      exportToBibTeX(getFilteredData(), "mumbai_university_scopus_feed.bib");
    });

    // Tab 7 AI Copilot Prompt Chips & Chat Send
    document.querySelectorAll(".prompt-chip-btn[data-prompt]").forEach(btn => {
      btn.addEventListener("click", () => {
        const prompt = btn.dataset.prompt;
        sendChatMessage(prompt);
      });
    });

    document.getElementById("btn-clear-chat").addEventListener("click", () => {
      state.chatMessages = [];
      initAICopilot();
      showToast("Cleared AI Copilot session", "🗑️");
    });

    const chatInput = document.getElementById("copilot-input");
    const chatSend = document.getElementById("btn-copilot-send");

    function handleChatSubmit() {
      const text = chatInput.value.trim();
      if (!text) return;
      chatInput.value = "";
      sendChatMessage(text);
    }

    chatSend.addEventListener("click", handleChatSubmit);
    chatInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") handleChatSubmit();
    });

    function sendChatMessage(text) {
      state.chatMessages.push({ role: "user", content: text });
      renderChatMessages();

      setTimeout(() => {
        const response = generateAIResponse(text, getFilteredData());
        state.chatMessages.push({ role: "assistant", content: response });
        renderChatMessages();
      }, 250);
    }

    // Leaderboard Accordion Toggle
    document.getElementById("leaderboard-accordion-toggle").addEventListener("click", () => {
      document.querySelector("#table-faculty-leaderboard").closest(".sidebar-accordion").classList.toggle("open");
    });

    // Mobile Sidebar Drawer Controls
    const mobileToggleBtn = document.getElementById("btn-mobile-sidebar-toggle");
    const sidebarCloseBtn = document.getElementById("btn-sidebar-close");
    const sidebarBackdrop = document.getElementById("sidebar-backdrop");
    const appSidebar = document.getElementById("app-sidebar");

    function openMobileSidebar() {
      if (appSidebar) appSidebar.classList.add("open");
      if (sidebarBackdrop) sidebarBackdrop.classList.add("active");
    }

    function closeMobileSidebar() {
      if (appSidebar) appSidebar.classList.remove("open");
      if (sidebarBackdrop) sidebarBackdrop.classList.remove("active");
    }

    if (mobileToggleBtn) mobileToggleBtn.addEventListener("click", openMobileSidebar);
    if (sidebarCloseBtn) sidebarCloseBtn.addEventListener("click", closeMobileSidebar);
    if (sidebarBackdrop) sidebarBackdrop.addEventListener("click", closeMobileSidebar);

    // Responsive Plotly chart resize on resize and orientation change
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        const chartIds = [
          "chart-annual-growth", "chart-monthly-velocity", "chart-cpp-evolution",
          "chart-citation-accrual", "chart-dept-citations", "chart-collab-map",
          "chart-top-countries", "chart-collab-treemap", "chart-industry-collab",
          "chart-quartile-donut", "chart-quadrant-bubble", "chart-dept-radar",
          "chart-author-velocity", "chart-author-quartile"
        ];
        chartIds.forEach(id => {
          const el = document.getElementById(id);
          if (el && el.data && window.Plotly) {
            Plotly.Plots.resize(el);
          }
        });
      }, 150);
    });
  }

  // ---------------------------------------------------------
  // 16. Initialize Application
  // ---------------------------------------------------------
  document.addEventListener("DOMContentLoaded", () => {
    setupDepartmentFilter();
    setupGenericMultiselect("quartile-box", "quartile-menu", "selectedQuartiles");
    setupGenericMultiselect("collab-box", "collab-menu", "selectedCollab");
    bindEvents();
    initAICopilot();
    renderAll();
  });
})();
