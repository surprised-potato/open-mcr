/**
 * analytics.js - Comprehensive psychometric item analysis and visual test diagnostics
 * Implements Classical Test Theory: Difficulty (P-Value), Kelly's 27% Discrimination (D-Index),
 * Point-Biserial Correlation (r_pbis), KR-20 Reliability, Distractor Functioning, and Heatmap Grid.
 */

export function initAnalytics(app) {
  // Stat Card Elements
  const statTotalGraded = document.getElementById('statTotalGraded');
  const statClassAverage = document.getElementById('statClassAverage');
  const statStdDev = document.getElementById('statStdDev');
  const statMedian = document.getElementById('statMedian');
  const statPassingRate = document.getElementById('statPassingRate');
  const statKR20 = document.getElementById('statKR20');

  // Visualization Containers
  const scoreHistContainer = document.getElementById('scoreHistogramContainer');
  const insightsBadges = document.getElementById('analyticsInsightsBadges');
  const keyInsightsGrid = document.getElementById('analyticsKeyInsights');
  const heatmapGrid = document.getElementById('questionHeatmapGrid');
  const itemTableBody = document.getElementById('itemAnalysisTableBody');
  const searchInput = document.getElementById('inputSearchItemAnalysis');
  const btnExportCsv = document.getElementById('btnExportItemAnalysisCsv');

  // Filter Pill Counts
  const countPillAll = document.getElementById('countPillAll');
  const countPillFlagged = document.getElementById('countPillFlagged');
  const countPillLowDiscrim = document.getElementById('countPillLowDiscrim');
  const countPillHard = document.getElementById('countPillHard');
  const countPillMastered = document.getElementById('countPillMastered');
  const filterPillsContainer = document.getElementById('heatmapFilterPills');

  // Top N / Bottom N Elements
  const inputTopNCount = document.getElementById('inputTopNCount');
  const topNTableBody = document.getElementById('topNTableBody');
  const bottomNTableBody = document.getElementById('bottomNTableBody');
  const topNAvgBadge = document.getElementById('topNAvgBadge');
  const bottomNAvgBadge = document.getElementById('bottomNAvgBadge');
  const histMaxPointsLabel = document.getElementById('histMaxPointsLabel');
  const btnHistModePoints = document.getElementById('btnHistModePoints');
  const btnHistModePercent = document.getElementById('btnHistModePercent');

  let activeFilter = 'all';
  let cachedQuestionStats = [];
  let topNCount = parseInt(localStorage.getItem('openmcr_analytics_top_n') || '5', 10);
  if (isNaN(topNCount) || topNCount < 1) topNCount = 5;
  if (inputTopNCount) inputTopNCount.value = topNCount;

  let histMode = localStorage.getItem('openmcr_hist_mode') || 'points';

  function updateHistModeButtons() {
    if (btnHistModePoints && btnHistModePercent) {
      if (histMode === 'points') {
        btnHistModePoints.classList.add('btn-primary');
        btnHistModePoints.classList.remove('btn-subtle');
        btnHistModePercent.classList.remove('btn-primary');
        btnHistModePercent.classList.add('btn-subtle');
      } else {
        btnHistModePercent.classList.add('btn-primary');
        btnHistModePercent.classList.remove('btn-subtle');
        btnHistModePoints.classList.remove('btn-primary');
        btnHistModePoints.classList.add('btn-subtle');
      }
    }
  }

  if (btnHistModePoints) {
    btnHistModePoints.addEventListener('click', () => {
      histMode = 'points';
      localStorage.setItem('openmcr_hist_mode', 'points');
      updateHistModeButtons();
      renderAnalytics();
    });
  }

  if (btnHistModePercent) {
    btnHistModePercent.addEventListener('click', () => {
      histMode = 'percent';
      localStorage.setItem('openmcr_hist_mode', 'percent');
      updateHistModeButtons();
      renderAnalytics();
    });
  }

  updateHistModeButtons();

  if (inputTopNCount) {
    inputTopNCount.addEventListener('input', () => {
      const val = parseInt(inputTopNCount.value, 10);
      if (!isNaN(val) && val >= 1) {
        topNCount = val;
        localStorage.setItem('openmcr_analytics_top_n', String(topNCount));
        renderAnalytics();
      }
    });
  }

  document.querySelectorAll('.btn-quick-n').forEach(btn => {
    btn.addEventListener('click', () => {
      const n = parseInt(btn.dataset.n, 10);
      if (!isNaN(n) && n >= 1) {
        topNCount = n;
        if (inputTopNCount) inputTopNCount.value = topNCount;
        localStorage.setItem('openmcr_analytics_top_n', String(topNCount));
        renderAnalytics();
      }
    });
  });

  // Bind Filter Pills
  if (filterPillsContainer) {
    filterPillsContainer.querySelectorAll('.filter-pill').forEach(btn => {
      btn.addEventListener('click', () => {
        filterPillsContainer.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active', 'btn-primary'));
        btn.classList.add('active', 'btn-primary');
        activeFilter = btn.dataset.filter;
        renderHeatmapGrid();
        renderItemTable();
      });
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      renderItemTable();
    });
  }

  if (btnExportCsv) {
    btnExportCsv.addEventListener('click', exportItemAnalysisToCsv);
  }

  function renderAnalytics() {
    const activeExam = app.getActiveExam();
    const validSubs = app.getActiveSubmissions().filter(s => !s.error && s.score !== undefined);
    const numQ = app.getActiveExamNumQuestions ? app.getActiveExamNumQuestions() : (activeExam.variant === '150' ? 150 : 75);

    if (statTotalGraded) statTotalGraded.textContent = validSubs.length;

    if (validSubs.length === 0) {
      if (statClassAverage) statClassAverage.textContent = '0.0%';
      if (statStdDev) statStdDev.textContent = '0.0';
      if (statPassingRate) statPassingRate.textContent = '0.0%';
      if (statMedian) statMedian.textContent = '0.0%';
      if (statKR20) statKR20.textContent = '0.00';

      if (scoreHistContainer) {
        scoreHistContainer.innerHTML = `<p style="width: 100%; text-align: center; color: var(--text-muted); padding: 2rem;">No graded scores available for "${activeExam.name}". Scan sheets to view analytics.</p>`;
      }
      if (insightsBadges) insightsBadges.innerHTML = '';
      if (keyInsightsGrid) keyInsightsGrid.innerHTML = '';
      if (heatmapGrid) {
        heatmapGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1.5rem;">Scan sheets to populate question heatmap matrix.</p>`;
      }
      if (itemTableBody) {
        itemTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No exam data available.</td></tr>`;
      }
      renderLeaderboards([], numQ);
      cachedQuestionStats = [];
      updatePillCounts();
      return;
    }

    // 1. Compute Overall Descriptive Statistics
    const scores = validSubs.map(s => s.score).sort((a, b) => a - b);
    const rawPoints = validSubs.map(s => s.points !== undefined ? s.points : (s.score / 100) * numQ);
    
    const sumScore = scores.reduce((a, b) => a + b, 0);
    const meanScore = sumScore / scores.length;
    
    const mid = Math.floor(scores.length / 2);
    const medianScore = scores.length % 2 !== 0 ? scores[mid] : ((scores[mid - 1] + scores[mid]) / 2);
    
    const passingCount = scores.filter(s => s >= 50).length;
    const passingPct = (passingCount / scores.length) * 100;

    // Standard Deviation of percentage scores
    const variance = scores.reduce((acc, val) => acc + Math.pow(val - meanScore, 2), 0) / scores.length;
    const stdDev = Math.sqrt(variance);

    // Standard Deviation & Variance of raw point scores for KR-20
    const meanRaw = rawPoints.reduce((a, b) => a + b, 0) / rawPoints.length;
    const varRaw = rawPoints.reduce((acc, val) => acc + Math.pow(val - meanRaw, 2), 0) / rawPoints.length;

    if (statClassAverage) statClassAverage.textContent = `${meanScore.toFixed(1)}%`;
    if (statStdDev) statStdDev.textContent = stdDev.toFixed(1);
    if (statPassingRate) statPassingRate.textContent = `${passingPct.toFixed(1)}%`;
    if (statMedian) statMedian.textContent = `${medianScore.toFixed(1)}%`;

    // 2. Compute Item-by-Item Psychometrics (Kelly's 27% Rule, Point-Biserial, Distractor Traps)
    const defaultKey = activeExam.answerKeys['*'] || Object.values(activeExam.answerKeys)[0] || [];
    
    // Sort submissions descending by total score to extract upper 27% and lower 27% cohorts
    const sortedSubs = [...validSubs].sort((a, b) => b.score - a.score);
    const cohortSize = Math.max(1, Math.round(sortedSubs.length * 0.27));
    const upperCohort = sortedSubs.slice(0, cohortSize);
    const lowerCohort = sortedSubs.slice(-cohortSize);

    let sumPQ = 0;
    const questionStats = [];

    for (let q = 0; q < numQ; q++) {
      const correctAns = (defaultKey[q] || '').toUpperCase();
      let correctCount = 0;
      const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, other: 0 };
      const upperCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, other: 0 };
      const lowerCounts = { A: 0, B: 0, C: 0, D: 0, E: 0, other: 0 };

      const itemCorrectScores = []; // overall scores of students who got item right
      const itemIncorrectScores = []; // overall scores of students who got item wrong

      validSubs.forEach(sub => {
        const studentAns = sub.answers && sub.answers[q] ? sub.answers[q].toUpperCase() : '';
        if (counts[studentAns] !== undefined) counts[studentAns]++;
        else counts.other++;

        const subKey = app.getAnswersForForm(sub.testFormCode || 'A');
        const expected = subKey ? (subKey[q] || '') : correctAns;
        const isRight = Boolean(studentAns && expected && studentAns === expected);

        if (isRight) {
          correctCount++;
          itemCorrectScores.push(sub.score);
        } else {
          itemIncorrectScores.push(sub.score);
        }
      });

      // Upper 27% cohort correct
      let upperCorrect = 0;
      upperCohort.forEach(sub => {
        const studentAns = sub.answers && sub.answers[q] ? sub.answers[q].toUpperCase() : '';
        if (upperCounts[studentAns] !== undefined) upperCounts[studentAns]++;
        else upperCounts.other++;

        const subKey = app.getAnswersForForm(sub.testFormCode || 'A');
        const expected = subKey ? (subKey[q] || '') : correctAns;
        if (studentAns && expected && studentAns === expected) upperCorrect++;
      });

      // Lower 27% cohort correct
      let lowerCorrect = 0;
      lowerCohort.forEach(sub => {
        const studentAns = sub.answers && sub.answers[q] ? sub.answers[q].toUpperCase() : '';
        if (lowerCounts[studentAns] !== undefined) lowerCounts[studentAns]++;
        else lowerCounts.other++;

        const subKey = app.getAnswersForForm(sub.testFormCode || 'A');
        const expected = subKey ? (subKey[q] || '') : correctAns;
        if (studentAns && expected && studentAns === expected) lowerCorrect++;
      });

      // P-Value (Difficulty Index)
      const pVal = correctCount / validSubs.length;
      const qVal = 1 - pVal;
      sumPQ += (pVal * qVal);

      // Discrimination Index D = P_upper - P_lower
      const pUpper = upperCorrect / upperCohort.length;
      const pLower = lowerCorrect / lowerCohort.length;
      const dIndex = pUpper - pLower;

      // Point-Biserial Correlation r_pbis
      let rPbis = 0;
      if (stdDev > 0 && pVal > 0 && pVal < 1) {
        const meanRight = itemCorrectScores.length > 0
          ? itemCorrectScores.reduce((a, b) => a + b, 0) / itemCorrectScores.length
          : meanScore;
        rPbis = ((meanRight - meanScore) / stdDev) * Math.sqrt(pVal * qVal);
      }

      // Distractor Traps & Non-functioning detection
      const totalN = validSubs.length;
      const distractorTraps = [];
      const nonFunctioning = [];

      ['A', 'B', 'C', 'D', 'E'].forEach(opt => {
        if (opt !== correctAns) {
          const optCount = counts[opt] || 0;
          const optPct = optCount / totalN;
          if (optPct < 0.03 && totalN >= 10) {
            nonFunctioning.push(opt);
          }
          // Trap: if chosen by >= 20% OR chosen more by upper cohort than lower cohort
          const upperOptPct = upperCounts[opt] / upperCohort.length;
          const lowerOptPct = lowerCounts[opt] / lowerCohort.length;
          if (optPct >= 0.20 || (upperOptPct > lowerOptPct && optCount >= 2)) {
            distractorTraps.push({ opt, pct: Math.round(optPct * 100), misleading: upperOptPct > lowerOptPct });
          }
        }
      });

      questionStats.push({
        qNum: q + 1,
        correctAns,
        totalN,
        correctCount,
        pVal,
        pPercent: Number((pVal * 100).toFixed(1)),
        pUpper: Number((pUpper * 100).toFixed(1)),
        pLower: Number((pLower * 100).toFixed(1)),
        dIndex: Number(dIndex.toFixed(2)),
        rPbis: Number(rPbis.toFixed(2)),
        counts,
        distractorTraps,
        nonFunctioning
      });
    }

    cachedQuestionStats = questionStats;

    // 3. Compute KR-20 Reliability
    let kr20 = 0;
    if (numQ > 1 && varRaw > 0) {
      kr20 = (numQ / (numQ - 1)) * (1 - (sumPQ / varRaw));
      kr20 = Math.max(0, Math.min(1, kr20));
    }
    if (statKR20) statKR20.textContent = kr20.toFixed(2);

    // 4. Render Top N & Bottom N Student Leaderboards
    renderLeaderboards(validSubs, numQ);

    // 5. Render Visual Dynamic Score Distribution Histogram
    renderScoreHistogram(scores, rawPoints, numQ, meanScore, medianScore);

    // 6. Render Key Insights Summary Badges
    renderInsightsBadges(questionStats, kr20, meanScore);

    // 7. Update Filter Pill Counts
    updatePillCounts();

    // 8. Render Heatmap Matrix Grid
    renderHeatmapGrid();

    // 9. Render Item Analysis Table
    renderItemTable();
  }

  function renderLeaderboards(validSubs, numQ) {
    const effectiveN = Math.min(topNCount, validSubs.length);
    document.querySelectorAll('.top-n-display').forEach(el => el.textContent = effectiveN);
    document.querySelectorAll('.bottom-n-display').forEach(el => el.textContent = effectiveN);

    // 1. Render Top N Table (Descending)
    if (topNTableBody) {
      topNTableBody.innerHTML = '';
      const topSubs = [...validSubs].sort((a, b) => {
        const diff = (b.score || 0) - (a.score || 0);
        if (diff !== 0) return diff;
        return (b.points || 0) - (a.points || 0);
      }).slice(0, topNCount);

      if (topSubs.length === 0) {
        topNTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1rem;">No data available</td></tr>`;
      } else {
        const topAvg = topSubs.reduce((acc, s) => acc + (s.score || 0), 0) / topSubs.length;
        if (topNAvgBadge) topNAvgBadge.textContent = `Avg: ${topAvg.toFixed(1)}%`;

        topSubs.forEach((sub, idx) => {
          const rankNum = idx + 1;
          let rankHtml = `<span class="rank-badge rank-other">${rankNum}</span>`;
          if (rankNum === 1) rankHtml = `<span class="rank-badge rank-1" title="1st Place">🥇</span>`;
          else if (rankNum === 2) rankHtml = `<span class="rank-badge rank-2" title="2nd Place">🥈</span>`;
          else if (rankNum === 3) rankHtml = `<span class="rank-badge rank-3" title="3rd Place">🥉</span>`;

          const pts = sub.points !== undefined ? sub.points : Math.round(((sub.score || 0) / 100) * numQ);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${rankHtml}</td>
            <td>
              <strong>${sub.studentName || 'Student'}</strong>
              ${sub.isOverridden ? '<span class="badge badge-amber" style="font-size: 0.65rem; margin-left: 0.2rem;">✏️</span>' : ''}
            </td>
            <td><code>${sub.studentId || '-'}</code></td>
            <td>
              <span class="badge badge-mint" style="font-weight: 700;">${sub.score}%</span>
              <span style="font-size: 0.72rem; color: var(--text-secondary); margin-left: 0.25rem;">(${pts}/${numQ})</span>
            </td>
            <td>
              <button class="btn btn-sm btn-subtle btn-view-top" data-id="${sub.id}">🖼️ View</button>
            </td>
          `;

          tr.querySelector('.btn-view-top').addEventListener('click', () => {
            if (app.ui.sheetViewer) app.ui.sheetViewer.openFullscreenViewer(sub.id);
          });
          topNTableBody.appendChild(tr);
        });
      }
    }

    // 2. Render Bottom N Table (Ascending)
    if (bottomNTableBody) {
      bottomNTableBody.innerHTML = '';
      const bottomSubs = [...validSubs].sort((a, b) => {
        const diff = (a.score || 0) - (b.score || 0);
        if (diff !== 0) return diff;
        return (a.points || 0) - (b.points || 0);
      }).slice(0, topNCount);

      if (bottomSubs.length === 0) {
        bottomNTableBody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 1rem;">No data available</td></tr>`;
      } else {
        const bottomAvg = bottomSubs.reduce((acc, s) => acc + (s.score || 0), 0) / bottomSubs.length;
        if (bottomNAvgBadge) bottomNAvgBadge.textContent = `Avg: ${bottomAvg.toFixed(1)}%`;

        bottomSubs.forEach((sub, idx) => {
          const rankNum = idx + 1;
          const rankHtml = `<span class="rank-badge rank-other" style="color: var(--pastel-rose-text); border-color: var(--pastel-rose-border);">${rankNum}</span>`;

          const pts = sub.points !== undefined ? sub.points : Math.round(((sub.score || 0) / 100) * numQ);
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${rankHtml}</td>
            <td>
              <strong>${sub.studentName || 'Student'}</strong>
              ${sub.isOverridden ? '<span class="badge badge-amber" style="font-size: 0.65rem; margin-left: 0.2rem;">✏️</span>' : ''}
            </td>
            <td><code>${sub.studentId || '-'}</code></td>
            <td>
              <span class="badge ${(sub.score >= 50) ? 'badge-sky' : 'badge-rose'}" style="font-weight: 700;">${sub.score}%</span>
              <span style="font-size: 0.72rem; color: var(--text-secondary); margin-left: 0.25rem;">(${pts}/${numQ})</span>
            </td>
            <td>
              <button class="btn btn-sm btn-subtle btn-view-bottom" data-id="${sub.id}">🖼️ View</button>
            </td>
          `;

          tr.querySelector('.btn-view-bottom').addEventListener('click', () => {
            if (app.ui.sheetViewer) app.ui.sheetViewer.openFullscreenViewer(sub.id);
          });
          bottomNTableBody.appendChild(tr);
        });
      }
    }
  }

  function renderScoreHistogram(scores, rawPoints, numQ, meanScore, medianScore) {
    if (!scoreHistContainer) return;
    scoreHistContainer.innerHTML = '';

    if (histMaxPointsLabel) {
      histMaxPointsLabel.textContent = numQ;
    }

    let brackets = [];

    if (histMode === 'points') {
      // Dynamic point-based bins capped precisely at numQ (e.g. 60 items -> bins up to 60 only)
      let step = 10;
      if (numQ <= 15) step = 3;
      else if (numQ <= 30) step = 5;
      else if (numQ <= 60) step = 10;
      else if (numQ <= 100) step = 10;
      else step = 20;

      let start = 0;
      while (start < numQ) {
        const end = Math.min(numQ, start + step);
        const label = start === 0 ? `0-${end}` : `${start + 1}-${end}`;
        brackets.push({
          label: `${label} pts`,
          min: start === 0 ? 0 : start + 0.001,
          max: end,
          count: 0
        });
        start = end;
      }

      rawPoints.forEach(pt => {
        const b = brackets.find(b => pt >= b.min && pt <= b.max) || brackets[brackets.length - 1];
        if (b) b.count++;
      });
    } else {
      // Percentage distribution (0-100%)
      brackets = [
        { label: '0-9%', min: 0, max: 9.99, count: 0 },
        { label: '10-19%', min: 10, max: 19.99, count: 0 },
        { label: '20-29%', min: 20, max: 29.99, count: 0 },
        { label: '30-39%', min: 30, max: 39.99, count: 0 },
        { label: '40-49%', min: 40, max: 49.99, count: 0 },
        { label: '50-59%', min: 50, max: 59.99, count: 0 },
        { label: '60-69%', min: 60, max: 69.99, count: 0 },
        { label: '70-79%', min: 70, max: 79.99, count: 0 },
        { label: '80-89%', min: 80, max: 89.99, count: 0 },
        { label: '90-100%', min: 90, max: 100, count: 0 }
      ];

      scores.forEach(s => {
        const b = brackets.find(b => s >= b.min && s <= b.max) || brackets[brackets.length - 1];
        if (b) b.count++;
      });
    }

    const totalStudents = scores.length;
    const maxCount = Math.max(1, ...brackets.map(b => b.count));

    brackets.forEach(b => {
      const pctHeight = Math.max(4, Math.round((b.count / maxCount) * 100));
      const col = document.createElement('div');
      col.className = 'hist-col';
      
      const midpointPct = (b.min / (histMode === 'points' ? numQ : 100)) * 100;
      let barColor = '#64748b';
      if (midpointPct >= 70) barColor = '#10b981';
      else if (midpointPct >= 50) barColor = '#0ea5e9';
      else if (midpointPct >= 30) barColor = '#f59e0b';
      else barColor = '#ef4444';

      col.innerHTML = `
        <span class="hist-count">${b.count > 0 ? b.count : ''}</span>
        <div class="hist-bar-outer" title="${b.label}: ${b.count} student(s) (${Math.round((b.count / totalStudents) * 100)}%)">
          <div class="hist-bar-inner" style="height: ${pctHeight}%; background-color: ${barColor};"></div>
        </div>
        <span class="hist-label">${b.label}</span>
      `;
      scoreHistContainer.appendChild(col);
    });
  }

  function renderInsightsBadges(questionStats, kr20, meanScore) {
    if (insightsBadges) {
      insightsBadges.innerHTML = '';
      const flaggedCount = questionStats.filter(q => q.dIndex < 0).length;
      if (flaggedCount > 0) {
        insightsBadges.innerHTML += `<span class="badge badge-rose" style="animation: pulse 2s infinite;">🚨 ${flaggedCount} Key Mismatch / Negative D</span>`;
      }
      if (kr20 >= 0.80) {
        insightsBadges.innerHTML += `<span class="badge badge-mint">⭐ High Test Reliability (KR-20: ${kr20.toFixed(2)})</span>`;
      } else if (kr20 < 0.60 && questionStats.length > 5) {
        insightsBadges.innerHTML += `<span class="badge badge-slate">⚠️ Moderate Test Reliability (KR-20: ${kr20.toFixed(2)})</span>`;
      }
    }

    if (keyInsightsGrid) {
      const sortedByDifficulty = [...questionStats].sort((a, b) => a.pVal - b.pVal);
      const hardest = sortedByDifficulty[0];
      const easiest = sortedByDifficulty[sortedByDifficulty.length - 1];
      const sortedByDiscrim = [...questionStats].sort((a, b) => b.dIndex - a.dIndex);
      const bestDiscrim = sortedByDiscrim[0];

      keyInsightsGrid.innerHTML = `
        <div style="background: var(--bg-card-subtle, #f8fafc); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 6px); padding: 0.75rem;">
          <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.2rem;">🔥 Hardest Question</div>
          <strong>Q${hardest ? hardest.qNum : '-'}</strong> (${hardest ? hardest.pPercent + '%' : '-'} correct) — Key: <code>${hardest ? hardest.correctAns : '-'}</code>
        </div>
        <div style="background: var(--bg-card-subtle, #f8fafc); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 6px); padding: 0.75rem;">
          <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.2rem;">🎯 Highest Mastery</div>
          <strong>Q${easiest ? easiest.qNum : '-'}</strong> (${easiest ? easiest.pPercent + '%' : '-'} correct) — Key: <code>${easiest ? easiest.correctAns : '-'}</code>
        </div>
        <div style="background: var(--bg-card-subtle, #f8fafc); border: 1px solid var(--border-color); border-radius: var(--radius-sm, 6px); padding: 0.75rem;">
          <div style="color: var(--text-secondary); font-size: 0.75rem; margin-bottom: 0.2rem;">⭐ Best Discriminator</div>
          <strong>Q${bestDiscrim ? bestDiscrim.qNum : '-'}</strong> (D: <strong>${bestDiscrim ? (bestDiscrim.dIndex >= 0 ? '+' : '') + bestDiscrim.dIndex : '-'}</strong>)
        </div>
      `;
    }
  }

  function updatePillCounts() {
    if (!cachedQuestionStats) return;
    if (countPillAll) countPillAll.textContent = cachedQuestionStats.length;
    if (countPillFlagged) countPillFlagged.textContent = cachedQuestionStats.filter(q => q.dIndex < 0).length;
    if (countPillLowDiscrim) countPillLowDiscrim.textContent = cachedQuestionStats.filter(q => q.dIndex >= 0 && q.dIndex < 0.20).length;
    if (countPillHard) countPillHard.textContent = cachedQuestionStats.filter(q => q.pPercent < 40).length;
    if (countPillMastered) countPillMastered.textContent = cachedQuestionStats.filter(q => q.pPercent >= 75).length;
  }

  function getFilteredQuestionStats() {
    let list = cachedQuestionStats.slice();

    if (activeFilter === 'flagged') {
      list = list.filter(q => q.dIndex < 0);
    } else if (activeFilter === 'low_discrim') {
      list = list.filter(q => q.dIndex >= 0 && q.dIndex < 0.20);
    } else if (activeFilter === 'hard') {
      list = list.filter(q => q.pPercent < 40);
    } else if (activeFilter === 'mastered') {
      list = list.filter(q => q.pPercent >= 75);
    }

    const query = (searchInput ? searchInput.value : '').trim().toLowerCase();
    if (query) {
      list = list.filter(q =>
        `q${q.qNum}`.toLowerCase().includes(query) ||
        `${q.qNum}`.includes(query) ||
        (q.correctAns && q.correctAns.toLowerCase().includes(query))
      );
    }

    return list;
  }

  function renderHeatmapGrid() {
    if (!heatmapGrid) return;
    heatmapGrid.innerHTML = '';

    const list = getFilteredQuestionStats();

    if (list.length === 0) {
      heatmapGrid.innerHTML = `<p style="grid-column: 1 / -1; text-align: center; color: var(--text-muted); padding: 1rem;">No questions match filter "${activeFilter}".</p>`;
      return;
    }

    list.forEach(q => {
      let bg = '#0ea5e9';
      if (q.dIndex < 0) bg = '#8b5cf6'; // Violet: Negative D (Key Check)
      else if (q.pPercent >= 75) bg = '#10b981'; // Green: High Mastery
      else if (q.pPercent >= 50) bg = '#0ea5e9'; // Sky: Optimal
      else if (q.pPercent >= 30) bg = '#f59e0b'; // Amber: Challenging
      else bg = '#ef4444'; // Red: Hard

      const chip = document.createElement('div');
      chip.className = 'heatmap-chip';
      chip.style.backgroundColor = bg;
      chip.dataset.q = q.qNum;
      chip.title = `Q${q.qNum} (Key: ${q.correctAns}) | Difficulty: ${q.pPercent}% | D-Index: ${q.dIndex >= 0 ? '+' : ''}${q.dIndex}`;

      chip.innerHTML = `
        <span>Q${q.qNum}</span>
        <span class="q-sub">${q.pPercent}%</span>
      `;

      chip.addEventListener('click', () => {
        heatmapGrid.querySelectorAll('.heatmap-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        
        // Scroll to question in item analysis table
        const row = document.getElementById(`itemRow_Q${q.qNum}`);
        if (row) {
          row.scrollIntoView({ behavior: 'smooth', block: 'center' });
          row.style.transition = 'background-color 0.5s ease';
          row.style.backgroundColor = 'rgba(14, 165, 233, 0.15)';
          setTimeout(() => {
            row.style.backgroundColor = '';
          }, 1500);
        }
      });

      heatmapGrid.appendChild(chip);
    });
  }

  function renderItemTable() {
    if (!itemTableBody) return;
    itemTableBody.innerHTML = '';

    const list = getFilteredQuestionStats();

    if (list.length === 0) {
      itemTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 2rem;">No questions match filter criteria.</td></tr>`;
      return;
    }

    list.forEach(q => {
      const tr = document.createElement('tr');
      tr.id = `itemRow_Q${q.qNum}`;

      // Difficulty Badge
      let pBadge = 'badge-sky';
      let pLabel = 'Optimal';
      if (q.pPercent >= 85) { pBadge = 'badge-mint'; pLabel = 'Very Easy'; }
      else if (q.pPercent >= 50) { pBadge = 'badge-sky'; pLabel = 'Optimal'; }
      else if (q.pPercent >= 30) { pBadge = 'badge-slate'; pLabel = 'Challenging'; }
      else { pBadge = 'badge-rose'; pLabel = 'Very Hard'; }

      // Discrimination Badge
      let dBadge = 'badge-slate';
      let dRating = 'Poor';
      if (q.dIndex >= 0.40) { dBadge = 'badge-mint'; dRating = 'Excellent'; }
      else if (q.dIndex >= 0.30) { dBadge = 'badge-sky'; dRating = 'Good'; }
      else if (q.dIndex >= 0.15) { dBadge = 'badge-slate'; dRating = 'Marginal'; }
      else if (q.dIndex < 0) { dBadge = 'badge-rose'; dRating = '🚨 Negative D'; }

      // Diagnostic Status Badges
      const flagBadges = [];
      if (q.dIndex < 0) {
        flagBadges.push(`<span class="badge badge-rose" style="font-weight: 700;">🚨 Check Key</span>`);
      } else if (q.dIndex >= 0.40) {
        flagBadges.push(`<span class="badge badge-mint">⭐ Excellent</span>`);
      } else if (q.dIndex < 0.15) {
        flagBadges.push(`<span class="badge badge-slate">⚠️ Low Discrim</span>`);
      }

      if (q.distractorTraps.length > 0) {
        q.distractorTraps.forEach(trap => {
          flagBadges.push(`<span class="badge badge-rose" title="Option ${trap.opt} chosen by ${trap.pct}% of students${trap.misleading ? ' (Favored by top students!)' : ''}">🪤 Trap: ${trap.opt} (${trap.pct}%)</span>`);
        });
      }

      // Visual Stacked Distractor Bar
      const totalN = Math.max(1, q.totalN);
      let distractorSegments = '';
      const letters = ['A', 'B', 'C', 'D', 'E', 'other'];

      letters.forEach(opt => {
        const count = q.counts[opt] || 0;
        if (count === 0) return;
        const pct = Math.round((count / totalN) * 100);
        const isKey = (opt === q.correctAns);
        const isTrap = q.distractorTraps.some(t => t.opt === opt);

        let segClass = 'standard-distractor';
        if (isKey) segClass = 'correct-key';
        else if (isTrap) segClass = 'trap';
        else if (opt === 'other') segClass = 'empty-distractor';

        const optDisplay = opt === 'other' ? '∅' : opt;
        distractorSegments += `
          <div class="distractor-segment ${segClass}" style="width: ${pct}%;" title="Option ${optDisplay}: ${count} student(s) (${pct}%)${isKey ? ' [CORRECT KEY]' : ''}">
            ${pct >= 8 ? `${optDisplay} (${pct}%)` : (pct >= 5 ? optDisplay : '')}
          </div>
        `;
      });

      tr.innerHTML = `
        <td><strong>Q${q.qNum}</strong></td>
        <td><span class="badge badge-sky" style="font-weight: 700;">${q.correctAns || '?'}</span></td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span class="badge ${pBadge}" style="font-weight: 700;">${q.pPercent}%</span>
            <span style="font-size: 0.72rem; color: var(--text-secondary);">${pLabel}</span>
          </div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span class="badge ${dBadge}" style="font-weight: 700;">${q.dIndex >= 0 ? '+' : ''}${q.dIndex}</span>
            <span style="font-size: 0.72rem; color: var(--text-secondary);">${dRating}</span>
          </div>
        </td>
        <td><code>${q.rPbis >= 0 ? '+' : ''}${q.rPbis}</code></td>
        <td>
          <div class="distractor-stack">
            ${distractorSegments}
          </div>
        </td>
        <td>
          <div style="display: flex; gap: 0.25rem; flex-wrap: wrap;">
            ${flagBadges.join(' ')}
          </div>
        </td>
      `;

      itemTableBody.appendChild(tr);
    });
  }

  function exportItemAnalysisToCsv() {
    if (!cachedQuestionStats || cachedQuestionStats.length === 0) {
      alert("No item analysis data to export. Please scan exam sheets first.");
      return;
    }

    const activeExam = app.getActiveExam();
    const rows = [
      ['Question', 'Key', 'Difficulty (P-Value %)', 'Upper 27% Correct (%)', 'Lower 27% Correct (%)', 'Discrimination (D-Index)', 'Point-Biserial (r_pbis)', 'Count A', 'Count B', 'Count C', 'Count D', 'Count E', 'Blank/Multi', 'Distractor Traps', 'Diagnostic Status']
    ];

    cachedQuestionStats.forEach(q => {
      const traps = q.distractorTraps.map(t => `${t.opt}:${t.pct}%`).join('; ') || 'None';
      let status = 'Good';
      if (q.dIndex < 0) status = 'Key Check / Negative D';
      else if (q.dIndex >= 0.40) status = 'Excellent';
      else if (q.dIndex < 0.15) status = 'Low Discrimination';

      rows.push([
        `Q${q.qNum}`,
        q.correctAns,
        q.pPercent,
        q.pUpper,
        q.pLower,
        q.dIndex,
        q.rPbis,
        q.counts.A || 0,
        q.counts.B || 0,
        q.counts.C || 0,
        q.counts.D || 0,
        q.counts.E || 0,
        q.counts.other || 0,
        `"${traps}"`,
        `"${status}"`
      ]);
    });

    const csvContent = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Item_Analysis_${(activeExam.name || 'Exam').replace(/\s+/g, '_')}_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return { renderAnalytics };
}
