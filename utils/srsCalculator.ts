export interface SrsInput {
  leitner_box: number;
  ease: number;
  review_interval: number;
  lapses: number;
}

export interface SrsOutput {
  leitner_box: number;
  ease: number;
  review_interval: number;
  due_at: Date;
  correct: boolean;
  lapses: number;
}

export function calculateSrs(current: SrsInput, rating: 1 | 2 | 3 | 4): SrsOutput {
  const { leitner_box, ease, lapses } = current;
  const interval = current.review_interval;
  let newBox: number, newEase: number, newInterval: number;
  let correct: boolean;
  let newLapses = lapses;

  switch (rating) {
    case 1: // Again — reset to box 1
      newBox = 1;
      newEase = Math.max(1.3, ease - 0.20);
      newInterval = 0;
      correct = false;
      newLapses = lapses + 1;
      break;
    case 2: // Hard — same box, reduced ease
      newBox = leitner_box;
      newEase = Math.max(1.3, ease - 0.15);
      newInterval = Math.max(1, Math.round((interval || 1) * 1.2));
      correct = false;
      break;
    case 3: // Good — advance box
      newBox = Math.min(5, leitner_box + 1);
      newEase = ease;
      // First successful review from box 1 → always 1 day
      newInterval = leitner_box === 1 ? 1 : Math.max(1, Math.round((interval || 1) * ease));
      correct = true;
      break;
    case 4: // Easy — advance box + ease boost
      newBox = Math.min(5, leitner_box + 1);
      newEase = ease + 0.15;
      newInterval = Math.max(1, Math.round((interval || 1) * newEase * 1.3));
      correct = true;
      break;
  }

  const dueAt = new Date();
  if (rating === 1) {
    // Learning step: due in 1 minute
    dueAt.setMinutes(dueAt.getMinutes() + 1);
  } else {
    dueAt.setDate(dueAt.getDate() + newInterval);
  }

  return {
    leitner_box: newBox,
    ease: newEase,
    review_interval: newInterval,
    due_at: dueAt,
    correct,
    lapses: newLapses,
  };
}
