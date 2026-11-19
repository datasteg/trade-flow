// josa(value, particle): the Korean particle that fits a value known only at render time.
// qkr writes a particle after a slot as a token ({holder|이}); ko-refine apply turns it into ${josa(holder, '이')}.
// The particle follows the last pronounced syllable: Hangul by its final consonant, digits as read in Sino-Korean
// (영 일 이 삼 사 오 육 칠 팔 구), a trailing bracket skipped (케이맨 제도(KY) → 케이맨 제도가), % read as 퍼센트.
// Keep PAIRS and INVARIANT identical to qkr/josa.py: qkr only returns tokens whose particle is in one of them.
const PAIR_LIST: [string, string][] = [
  ['이', '가'], ['은', '는'], ['을', '를'], ['과', '와'], ['과의', '와의'], ['과는', '와는'], ['과도', '와도'],
  ['으로', '로'], ['으로서', '로서'], ['으로써', '로써'], ['으로는', '로는'], ['으로도', '로도'], ['으로부터', '로부터'],
  ['으로의', '로의'],
  ['이나', '나'], ['이다', '다'], ['이며', '며'], ['이고', '고'], ['이었다', '였다'], ['이었고', '였고'],
  ['이었습니다', '였습니다'], ['이면', '면'], ['이라', '라'], ['이라는', '라는'], ['이라고', '라고'], ['이란', '란'],
  ['이든', '든'], ['이지만', '지만'], ['이므로', '므로'],
];
const PAIRS: Record<string, [string, string]> = {};
for (const [a, b] of PAIR_LIST) { PAIRS[a] = [a, b]; PAIRS[b] = [a, b]; }
// particles that do not depend on the last sound (appended unchanged)
export const INVARIANT = new Set(['에', '의', '도', '만', '에서', '에게', '까지', '부터', '보다', '처럼', '마다', '만큼', '에는',
  '에도', '에서는', '에서도', '에서의', '에게는', '까지는', '부터는', '보다는', '만으로', '입니다', '인', '인지']);

// final consonant of digits read in Sino-Korean: 0 영(ㅇ) 1 일(ㄹ) 3 삼(ㅁ) 6 육(ㄱ) 7 칠(ㄹ) 8 팔(ㄹ)
const DIGIT_FINAL: Record<string, 'none' | 'rieul' | 'other'> = {
  '0': 'other', '1': 'rieul', '2': 'none', '3': 'other', '4': 'none', '5': 'none', '6': 'other', '7': 'rieul', '8': 'rieul', '9': 'none',
};

function lastSound(word: string): 'none' | 'rieul' | 'other' {
  let w = word.trim();
  while (/[)\]」』"'’”]$/.test(w)) {
    const open = { ')': '(', ']': '[', '」': '「', '』': '『' }[w.slice(-1)];
    const i = open ? w.lastIndexOf(open) : -1;
    w = (i > 0 ? w.slice(0, i) : w.slice(0, -1)).trim();
  }
  const ch = [...w].pop() ?? '';
  const code = ch.charCodeAt(0) - 0xac00;
  if (code >= 0 && code < 11172) {
    const jong = code % 28;
    return jong === 0 ? 'none' : jong === 8 ? 'rieul' : 'other';
  }
  if (ch in DIGIT_FINAL) return DIGIT_FINAL[ch];
  if (ch === '%') return 'none';
  if (/[a-z]/i.test(ch)) return /[lmnr]$/i.test(w) ? (/l$/i.test(w) ? 'rieul' : 'other') : 'none';
  return 'none';
}

export function josa(word: string | number, particle: string): string {
  const w = String(word);
  const pair = PAIRS[particle];
  if (!pair) return w + particle;
  const s = lastSound(w);
  const withFinal = pair[0].startsWith('으로') ? s === 'other' : s !== 'none';
  return w + (withFinal ? pair[0] : pair[1]);
}
