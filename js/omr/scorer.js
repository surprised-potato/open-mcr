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
  
  let keyAnswers = null;
  let keyUsed = formCode;

  if (answerKeys && answerKeys[formCode]) {
    keyAnswers = answerKeys[formCode];
  } else if (answerKeys && answerKeys['*']) {
    keyAnswers = answerKeys['*'];
    keyUsed = '*';
  } else if (answerKeys && Object.keys(answerKeys).length === 1) {
    // If only one key exists, use it
    keyUsed = Object.keys(answerKeys)[0];
    keyAnswers = answerKeys[keyUsed];
  }

  if (!keyAnswers || keyAnswers.length === 0) {
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
