/**
 * scorer.js - Scores extracted student answers against answer keys
 */

export function scoreSubmission(submission, answerKeys = {}) {
  if (!submission || !submission.answers || !Array.isArray(submission.answers)) {
    return {
      scored: false,
      error: submission && submission.error ? submission.error : 'No extracted answers available to score',
      points: 0,
      totalQuestions: 0,
      percentage: 0,
      questionScores: []
    };
  }

  const formCode = (submission.testFormCode || '').trim().toUpperCase();
  const hasKeyAnswers = (key) => Array.isArray(key) && key.some(a => (a || '').trim() !== '');

  let keyAnswers = null;
  let keyUsed = formCode;

  // 1. Check if specific form code exists and has at least one keyed answer
  if (answerKeys && formCode && hasKeyAnswers(answerKeys[formCode])) {
    keyAnswers = answerKeys[formCode];
    keyUsed = formCode;
  }
  // 2. Otherwise fallback to Default Key '*' if it has answers
  else if (answerKeys && hasKeyAnswers(answerKeys['*'])) {
    keyAnswers = answerKeys['*'];
    keyUsed = '*';
  }
  // 3. Otherwise find any key that has answers
  else if (answerKeys && Object.keys(answerKeys).length > 0) {
    const populatedEntry = Object.entries(answerKeys).find(([_, k]) => hasKeyAnswers(k));
    if (populatedEntry) {
      keyUsed = populatedEntry[0];
      keyAnswers = populatedEntry[1];
    } else {
      keyAnswers = answerKeys[formCode] || answerKeys['*'] || Object.values(answerKeys)[0] || null;
      keyUsed = formCode || '*';
    }
  }

  if (!keyAnswers || keyAnswers.length === 0 || !hasKeyAnswers(keyAnswers)) {
    return {
      scored: false,
      error: `No matching answer key for form code '${formCode || 'Default'}'`,
      points: 0,
      totalQuestions: submission.answers.length,
      percentage: 0,
      questionScores: submission.answers.map((ans, idx) => ({
        q: idx + 1,
        studentAnswer: ans,
        correctAnswer: '?',
        isCorrect: false,
        isScored: false
      }))
    };
  }

  // Count keyed questions in the answer key
  let keyedCount = 0;
  let maxKeyedIdx = -1;
  for (let i = 0; i < keyAnswers.length; i++) {
    if ((keyAnswers[i] || '').trim() !== '') {
      keyedCount++;
      maxKeyedIdx = i;
    }
  }

  // If answer key has answers, total score considered is ONLY the number of keyed answers (e.g. 60)
  const totalQuestions = keyedCount > 0 ? keyedCount : submission.answers.length;

  let points = 0;
  const numToCheck = maxKeyedIdx >= 0 ? maxKeyedIdx + 1 : submission.answers.length;
  const questionScores = [];

  for (let i = 0; i < numToCheck; i++) {
    const studentAns = (submission.answers[i] || '').trim().toUpperCase();
    const correctAns = (keyAnswers[i] || '').trim().toUpperCase();
    const isScored = Boolean(correctAns);
    const isCorrect = Boolean(isScored && studentAns === correctAns);

    if (isCorrect) points += 1;

    questionScores.push({
      q: i + 1,
      studentAnswer: studentAns,
      correctAnswer: correctAns || '—',
      isCorrect,
      isScored
    });
  }

  const percentage = totalQuestions > 0 ? Number(((points / totalQuestions) * 100).toFixed(2)) : 0;

  return {
    scored: true,
    keyUsed,
    points,
    totalQuestions,
    percentage,
    questionScores
  };
}
