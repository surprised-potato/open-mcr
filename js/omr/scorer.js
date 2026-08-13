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
        isCorrect: false
      }))
    };
  }

  let points = 0;
  const totalQuestions = submission.answers.length;
  const questionScores = [];

  for (let i = 0; i < totalQuestions; i++) {
    const studentAns = (submission.answers[i] || '').trim().toUpperCase();
    const correctAns = (keyAnswers[i] || '').trim().toUpperCase();
    const isCorrect = Boolean(correctAns && studentAns === correctAns);

    if (isCorrect) points += 1;

    questionScores.push({
      q: i + 1,
      studentAnswer: studentAns,
      correctAnswer: correctAns,
      isCorrect
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
