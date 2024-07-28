export interface WordTag {
  normalized: string;
  word: string;
  redirect: string;
  freq: number;
  priority: number;
  category: number;
}

export const inf = 1e9 | 0;

export function normalize(word: string) {
  let result = '';
  let mapping = [];
  let complexMedials: any = {
    ㅘ: 'ㅗㅏ',
    ㅙ: 'ㅗㅐ',
    ㅚ: 'ㅗㅣ',
    ㅝ: 'ㅜㅓ',
    ㅞ: 'ㅜㅔ',
    ㅟ: 'ㅜㅣ',
    ㅢ: 'ㅡㅣ',
  };

  let initialJamos = [
    'ㄱ',
    'ㄲ',
    'ㄴ',
    'ㄷ',
    'ㄸ',
    'ㄹ',
    'ㅁ',
    'ㅂ',
    'ㅃ',
    'ㅅ',
    'ㅆ',
    'ㅇ',
    'ㅈ',
    'ㅉ',
    'ㅊ',
    'ㅋ',
    'ㅌ',
    'ㅍ',
    'ㅎ',
  ];
  let medialJamos = [
    'ㅏ',
    'ㅐ',
    'ㅑ',
    'ㅒ',
    'ㅓ',
    'ㅔ',
    'ㅕ',
    'ㅖ',
    'ㅗ',
    'ㅘ',
    'ㅙ',
    'ㅚ',
    'ㅛ',
    'ㅜ',
    'ㅝ',
    'ㅞ',
    'ㅟ',
    'ㅠ',
    'ㅡ',
    'ㅢ',
    'ㅣ',
  ];
  let finalJamos = [
    '',
    'ㄱ',
    'ㄲ',
    'ㄳ',
    'ㄴ',
    'ㄵ',
    'ㄶ',
    'ㄷ',
    'ㄹ',
    'ㄺ',
    'ㄻ',
    'ㄼ',
    'ㄽ',
    'ㄾ',
    'ㄿ',
    'ㅀ',
    'ㅁ',
    'ㅂ',
    'ㅄ',
    'ㅅ',
    'ㅆ',
    'ㅇ',
    'ㅈ',
    'ㅊ',
    'ㅋ',
    'ㅌ',
    'ㅍ',
    'ㅎ',
  ];

  for (let i = 0; i < word.length; i++) {
    let code = word.codePointAt(i)!;
    let originalIndex = i;

    if (code > 0xffff) {
      i++;
    }

    if (code >= 0x41 && code <= 0x5a) {
      result += String.fromCharCode(code + 0x20);
      mapping.push(originalIndex);
    } else if (
      (code >= 0x61 && code <= 0x7a) ||
      (code >= 0x30 && code <= 0x39)
    ) {
      // 'a' to 'z' or '0' to '9'
      result += String.fromCharCode(code);
      mapping.push(originalIndex);
    } else if (code >= 0xac00 && code <= 0xd7a3) {
      let code_offset = code - 0xac00;
      let initial = Math.floor(code_offset / (21 * 28));
      let medial = Math.floor((code_offset % (21 * 28)) / 28);
      let final = code_offset % 28;

      result += initialJamos[initial];
      mapping.push(originalIndex);

      let medialJamo = medialJamos[medial];
      if (complexMedials[medialJamo]) {
        for (let char of complexMedials[medialJamo]) {
          result += char;
          mapping.push(originalIndex);
        }
      } else {
        result += medialJamo;
        mapping.push(originalIndex);
      }

      if (final !== 0) {
        result += finalJamos[final];
        mapping.push(originalIndex);
      }
    } else {
      result += String.fromCodePoint(code);
      mapping.push(originalIndex);
    }
  }

  return [result, mapping];
}

export function calcGapMatch(small: string, large: string) {
  const [smallN, smallMapping] = normalize(small);
  const [largeN, largeMapping] = normalize(large);
  const m = smallN.length;
  const n = largeN.length;
  const dp = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => [inf, inf]),
  );
  const backtrack: any = Array.from({ length: m + 1 }, () =>
    Array.from({ length: n + 1 }, () => [null, null]),
  );

  dp[0][0][0] = 0;

  for (let i = 0; i <= m; i++) {
    for (let j = 0; j < n; j++) {
      if (i < m && smallN[i] === largeN[j]) {
        if (dp[i][j][0] + 1 < dp[i + 1][j + 1][1]) {
          dp[i + 1][j + 1][1] = dp[i][j][0] + 1;
          backtrack[i + 1][j + 1][1] = [i, j, 0];
        }
        if (dp[i][j][1] < dp[i + 1][j + 1][1]) {
          dp[i + 1][j + 1][1] = dp[i][j][1];
          backtrack[i + 1][j + 1][1] = [i, j, 1];
        }
      }
      if (dp[i][j][0] < dp[i][j + 1][0]) {
        dp[i][j + 1][0] = dp[i][j][0];
        backtrack[i][j + 1][0] = [i, j, 0];
      }
      if (dp[i][j][1] < dp[i][j + 1][0]) {
        dp[i][j + 1][0] = dp[i][j][1];
        backtrack[i][j + 1][0] = [i, j, 1];
      }
    }
  }

  const result = Math.min(dp[m][n][0], dp[m][n][1]);
  if (result === inf) {
    return { result, path: [] };
  }
  let path = [];
  let i = m,
    j = n,
    k = dp[m][n][0] < dp[m][n][1] ? 0 : 1;

  while (i !== 0 || j !== 0) {
    const [prevI, prevJ, prevK] = backtrack[i][j][k];
    if (i - 1 === prevI && j - 1 === prevJ) {
      path.push(largeMapping[j - 1]);
    }
    i = prevI;
    j = prevJ;
    k = prevK;
  }

  path.reverse();
  return { result, path };
}
