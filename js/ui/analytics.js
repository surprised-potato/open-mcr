/**
 * analytics.js - Class performance statistics and question item difficulty analysis
 */

export function initAnalytics(app) {
  const statTotalGraded = document.getElementById('statTotalGraded') || document.getElementById('statCount');
  const statClassAverage = document.getElementById('statClassAverage') || document.getElementById('statAverage');
  const statPassingRate = document.getElementById('statPassingRate');
  const statMedian = document.getElementById('statMedian');
  const statMax = document.getElementById('statMax');
  const statMin = document.getElementById('statMin');
  const itemTableBody = document.getElementById('itemAnalysisTableBody');

  function renderAnalytics() {
    const activeExam = app.getActiveExam();
    const validSubs = app.getActiveSubmissions().filter(s => !s.error && s.score !== undefined);
    const numQ = activeExam.variant === '150' ? 150 : 75;

    if (statTotalGraded) statTotalGraded.textContent = validSubs.length;

    if (validSubs.length === 0) {
      if (statClassAverage) statClassAverage.textContent = '0.0%';
      if (statPassingRate) statPassingRate.textContent = '0.0%';
      if (statMedian) statMedian.textContent = '0.0%';
      if (statMax) statMax.textContent = '0.0%';
      if (statMin) statMin.textContent = '0.0%';
      itemTableBody.innerHTML = `
        <tr>
          <td colspan="12" style="text-align: center; color: var(--text-muted); padding: 2rem;">Scan exam sheets for "${activeExam.name}" to generate item analysis.</td>
        </tr>`;
      return;
    }

    const scores = validSubs.map(s => s.score).sort((a, b) => a - b);
    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = sum / scores.length;
    const mid = Math.floor(scores.length / 2);
    const median = scores.length % 2 !== 0 ? scores[mid] : ((scores[mid - 1] + scores[mid]) / 2);
    const passingCount = scores.filter(s => s >= 50).length;
    const passingPct = (passingCount / scores.length) * 100;

    if (statClassAverage) statClassAverage.textContent = `${avg.toFixed(1)}%`;
    if (statPassingRate) statPassingRate.textContent = `${passingPct.toFixed(1)}%`;
    if (statMedian) statMedian.textContent = `${median.toFixed(1)}%`;
    if (statMax) statMax.textContent = `${scores[scores.length - 1].toFixed(1)}%`;
    if (statMin) statMin.textContent = `${scores[0].toFixed(1)}%`;

    // Item Difficulty, Distractor & Discrimination Analysis
    itemTableBody.innerHTML = '';
    const defaultKey = activeExam.answerKeys['*'] || Object.values(activeExam.answerKeys)[0] || [];

    // Sort submissions descending for Top 10% and Bottom 10% cohorts
    const sortedSubs = [...validSubs].sort((a, b) => b.score - a.score);
    const cohortSize = Math.max(1, Math.round(sortedSubs.length * 0.1));
    const topCohort = sortedSubs.slice(0, cohortSize);
    const bottomCohort = sortedSubs.slice(-cohortSize);

    for (let q = 0; q < numQ; q++) {
      const correctAns = (defaultKey[q] || '').toUpperCase();
      let correctCount = 0;
      const counts = { A: 0, B: 0, C: 0, D: 0, E: 0, other: 0 };

      validSubs.forEach(sub => {
        const studentAns = sub.answers && sub.answers[q] ? sub.answers[q].toUpperCase() : '';
        if (counts[studentAns] !== undefined) {
          counts[studentAns]++;
        } else {
          counts.other++;
        }

        // Match against specific form key if available
        const subKey = app.getAnswersForForm(sub.testFormCode || 'A');
        const expected = subKey ? (subKey[q] || '') : correctAns;
        if (studentAns && expected && studentAns === expected) {
          correctCount++;
        }
      });

      // Top 10% cohort correct count
      let topCorrectCount = 0;
      topCohort.forEach(sub => {
        const studentAns = sub.answers && sub.answers[q] ? sub.answers[q].toUpperCase() : '';
        const subKey = app.getAnswersForForm(sub.testFormCode || 'A');
        const expected = subKey ? (subKey[q] || '') : correctAns;
        if (studentAns && expected && studentAns === expected) {
          topCorrectCount++;
        }
      });
      const topPercent = Number(((topCorrectCount / topCohort.length) * 100).toFixed(1));

      // Bottom 10% cohort correct count
      let bottomCorrectCount = 0;
      bottomCohort.forEach(sub => {
        const studentAns = sub.answers && sub.answers[q] ? sub.answers[q].toUpperCase() : '';
        const subKey = app.getAnswersForForm(sub.testFormCode || 'A');
        const expected = subKey ? (subKey[q] || '') : correctAns;
        if (studentAns && expected && studentAns === expected) {
          bottomCorrectCount++;
        }
      });
      const bottomPercent = Number(((bottomCorrectCount / bottomCohort.length) * 100).toFixed(1));

      // Discrimination Index D = P_top - P_bottom
      const dVal = (topCorrectCount / topCohort.length) - (bottomCorrectCount / bottomCohort.length);
      const dFormatted = (dVal >= 0 ? '+' : '') + dVal.toFixed(2);

      let dBadgeClass = 'badge-slate';
      let dRating = 'Poor';
      if (dVal >= 0.40) {
        dBadgeClass = 'badge-mint';
        dRating = 'Excellent';
      } else if (dVal >= 0.30) {
        dBadgeClass = 'badge-sky';
        dRating = 'Good';
      } else if (dVal >= 0.15) {
        dBadgeClass = 'badge-violet';
        dRating = 'Marginal';
      } else if (dVal < 0) {
        dBadgeClass = 'badge-rose';
        dRating = 'Negative';
      }

      const percentCorrect = Number(((correctCount / validSubs.length) * 100).toFixed(1));
      
      let badgeClass = 'badge-sky';
      if (percentCorrect < 50) badgeClass = 'badge-rose';
      else if (percentCorrect >= 80) badgeClass = 'badge-mint';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>Q${q + 1}</strong></td>
        <td><span class="badge badge-sky">${correctAns || '?'}</span></td>
        <td><span class="badge ${badgeClass}">${percentCorrect}%</span></td>
        <td>${topPercent}%</td>
        <td>${bottomPercent}%</td>
        <td><span class="badge ${dBadgeClass}">${dFormatted} (${dRating})</span></td>
        <td>${counts.A}</td>
        <td>${counts.B}</td>
        <td>${counts.C}</td>
        <td>${counts.D}</td>
        <td>${counts.E}</td>
        <td>${counts.other}</td>
      `;
      itemTableBody.appendChild(tr);
    }
  }

  return { renderAnalytics };
}
