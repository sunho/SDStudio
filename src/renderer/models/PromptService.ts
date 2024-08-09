import { backend, isMobile, promptService } from '.';
import { NoiseSchedule, Sampling } from '../backends/imageGen';
import {
  InpaintScene,
  PARR,
  PromptGroupNode,
  PromptNode,
  PromptRandomNode,
  Scene,
  Session,
} from './types';

export function cleanPARR(parr: PARR): PARR {
  return parr.map((p) => p.trim());
}

export function toPARR(str: string) {
  return cleanPARR(str.replace('\n', ',').split(',')).filter((x) => x !== '');
}

export class PromptService extends EventTarget {
  running: boolean;
  constructor() {
    super();
    this.running = true;
  }

  tryExpandPiece(
    p: string,
    session: Session,
    scene: InpaintScene | Scene | undefined = undefined,
  ) {
    const errorInfo =
      'project:' +
      (session?.name ?? '') +
      ', scene:' +
      (scene?.name ?? '') +
      '[' +
      (scene?.type === 'inpaint' ? 'inpaint' : '') +
      ']';
    if (p.charAt(0) === '<' && p.charAt(p.length - 1) === '>') {
      p = p.substring(1, p.length - 1);
      const parts = p.split('.');
      if (parts.length !== 2) {
        throw new Error(
          '올바르지 않은 조각 문법 "' + p + '" (' + errorInfo + ')',
        );
      }
      const lib = session.library.get(parts[0]);
      if (!lib) {
        throw new Error(
          '존재하지 않는 조각 모음 "' + p + '" (' + errorInfo + ')',
        );
      }
      if (lib.pieces.find((x) => x.name === parts[1]) == null) {
        throw new Error('존재하지 않는 조각 "' + p + '" (' + errorInfo + ')');
      }
      return lib.pieces.find((x) => x.name === parts[1])!.prompt;
    }
    throw new Error('조각이 아닙니다 "' + p + '" (' + errorInfo + ')');
  }

  isMulti(p: string, session: Session) {
    if (p.charAt(0) !== '<' || p.charAt(p.length - 1) !== '>') {
      return false;
    }
    p = p.substring(1, p.length - 1);
    const parts = p.split('.');
    if (parts.length !== 2) {
      return false;
    }
    const lib = session.library.get(parts[0]);
    if (!lib) {
      return false;
    }
    return lib.pieces.find((x) => x.name === parts[1])?.multi ?? false;
  }

  parseWord(
    word: string,
    session: Session | undefined = undefined,
    scene: InpaintScene | Scene | undefined = undefined,
    visited: { [key: string]: boolean } | undefined = undefined,
  ): PromptNode {
    if (!visited) {
      visited = {};
    }
    if (word.charAt(0) === '<' && word.charAt(word.length - 1) === '>') {
      if (!session) {
        throw new Error('그림체에서는 조각을 사용할 수 없습니다');
      }
      const res: PromptGroupNode = {
        type: 'group',
        children: [],
      };
      if (visited[word]) {
        throw new Error('Cyclic detected at ' + word);
      }
      visited[word] = true;
      if (this.isMulti(word, session)) {
        const expanded = this.tryExpandPiece(word, session, scene);
        const lines = expanded.split('\n');
        const randNode: PromptRandomNode = {
          type: 'random',
          options: [],
        };
        for (const line of lines) {
          const parr = toPARR(line);
          const newNode: PromptGroupNode = {
            type: 'group',
            children: [],
          };
          for (const p of parr) {
            newNode.children.push(this.parseWord(p, session, scene, visited));
          }
          randNode.options.push(newNode);
        }
        res.children.push(randNode);
      } else {
        let newp = toPARR(this.tryExpandPiece(word, session, scene));
        for (const p of newp) {
          res.children.push(this.parseWord(p, session, scene, visited));
        }
      }
      return res;
    } else {
      return {
        type: 'text',
        text: word,
      };
    }
  }

  showPromptTooltip(piece: string, e: any) {
    try {
      let txt = '';
      if (piece !== '|') {
        const expanded = this.tryExpandPiece(piece, window.curSession!);
        if (this.isMulti(piece, window.curSession!)) {
          txt =
            '이 중 한 줄 랜덤 선택:\n' +
            expanded.split('\n').slice(0, 32).join('\n');
        } else {
          txt = expanded;
        }
      } else {
        txt =
          '프롬프트를 교차합니다.\n예시:\n상위 프롬프트: 1girl, |, 캐릭터 \n중위 프롬프트: 그림체, |, 포즈\n이렇게 세팅되어 있으면 1girl, 캐릭터, 그림체, 포즈 순으로 교차됩니다.';
      }
      this.dispatchEvent(
        new CustomEvent('prompt-tooltip', {
          detail: { text: txt, x: e.clientX, y: e.clientY },
        }),
      );
    } catch (e: any) {
      console.error(e);
    }
  }

  clearPromptTooltip() {
    this.dispatchEvent(
      new CustomEvent('prompt-tooltip', { detail: { text: '' } }),
    );
  }
}

export const createSDPrompts = async (
  session: Session,
  preset: any,
  shared: any,
  scene: Scene,
) => {
  const promptComb: string[] = [];
  const res: PromptNode[] = [];
  const dfs = async () => {
    if (promptComb.length === scene.slots.length) {
      let front = toPARR(preset.frontPrompt);
      if (shared.type === 'sd_style') {
        front = front.concat(toPARR(shared.characterPrompt));
        const newFront = [];
        const rest = [];
        const regex = /^\d+(boy|girl|other)s?$/;
        for (const word of front) {
          if (
            regex.test(word) ||
            word === 'multiple girls' ||
            word === 'multiple boys' ||
            word === 'multiple others'
          ) {
            newFront.push(word);
          } else {
            const tag = await backend.lookupTag(word);
            if (tag && tag.category === 4) {
              newFront.push(word);
            } else {
              rest.push(word);
            }
          }
        }
        front = newFront.concat(rest);
      }
      let middle: string[] = [];
      for (const comb of promptComb) {
        middle = middle.concat(toPARR(comb));
      }
      let left = 0,
        right = 0;
      let cur: string[] = [];
      let currentInsert = 0;
      while (left < front.length && right < middle.length) {
        if (currentInsert === 0) {
          if (front[left] === '|') {
            currentInsert = 1;
            left++;
            continue;
          }
          cur.push(front[left]);
          left++;
        } else {
          if (middle[right] === '|') {
            currentInsert = 0;
            right++;
            continue;
          }
          cur.push(middle[right]);
          right++;
        }
      }
      while (left < front.length) {
        if (front[left] !== '|') cur.push(front[left]);
        left++;
      }
      while (right < middle.length) {
        if (middle[right] !== '|') cur.push(middle[right]);
        right++;
      }
      if (shared.type === 'sd_style') {
        cur = cur.concat(toPARR(shared.backgroundPrompt));
      }
      cur = cur.concat(toPARR(preset.backPrompt));
      const newNode: PromptNode = {
        type: 'group',
        children: [],
      };
      for (const word of cur) {
        newNode.children.push(promptService.parseWord(word, session, scene));
      }
      console.log('newnode', newNode);
      res.push(newNode);
      return;
    }
    const level = promptComb.length;
    for (const piece of scene.slots[level]) {
      if (piece.enabled == undefined || piece.enabled) {
        promptComb.push(piece.prompt);
        await dfs();
        promptComb.pop();
      }
    }
  };
  await dfs();
  return res;
};

const mouth = ['<', '>', '(', ')', '{', '}', ')', '('];
const eyes = [':', ';'];
const expressions = mouth.map((m) => eyes.map((e) => e + m)).flat();
expressions.push('><');

function trimUntouch(word: string) {
  let leftTrimPos = 0;
  while (leftTrimPos < word.length && isWhitespace(word[leftTrimPos])) {
    leftTrimPos++;
  }
  let rightTrimPos = word.length - 1;
  while (rightTrimPos >= 0 && isWhitespace(word[rightTrimPos])) {
    rightTrimPos--;
  }
  if (leftTrimPos > rightTrimPos) {
    return undefined;
  }
  return [leftTrimPos, rightTrimPos];
}

function parenCheck(str: string): [boolean, number] {
  str = str
    .split(',')
    .map((x) => {
      const trimmed = trimUntouch(x);
      if (trimmed) {
        const [leftTirmPos, rightTrimPos] = trimmed;
        const y = x.substring(leftTirmPos, rightTrimPos + 1);
        for (const exp of expressions) {
          if (y === exp) {
            return (
              x.substring(0, leftTirmPos) +
              'xx' +
              x.substring(rightTrimPos + 1, x.length)
            );
          }
        }
        return x;
      } else {
        return x;
      }
    })
    .join(',');
  const stack = [];
  const parens = ['(', ')', '[', ']', '{', '}', '<', '>'];
  for (let i = 0; i < str.length; i++) {
    const c = str[i];
    if (parens.includes(c)) {
      if (parens.indexOf(c) % 2 === 0) {
        stack.push([c, i]);
      } else {
        if (stack.length === 0) {
          return [false, i];
        }
        const last = stack.pop()!;
        if (parens.indexOf(c) - 1 !== parens.indexOf(last[0] as string)) {
          return [false, last[1] as number];
        }
      }
    }
  }
  if (stack.length > 0) {
    return [false, stack.pop()![1] as number];
  }
  return [true, -1];
}

const nbsp = String.fromCharCode(160);
const isWhitespace = (c: string) => {
  return c === ' ' || nbsp === c;
};

export const highlightPrompt = (
  session: Session,
  text: string,
  lineHighlight: boolean = false,
) => {
  let [parenFine, lastPos] = parenCheck(text);
  let offset = 0;
  const words = text
    .split('\n')
    .map((x) => {
      const word = x
        .split(/([,])/)
        .map((word: string, index) => {
          if (word === '\n') {
            return word;
          }
          if (word === ',') {
            return word;
          }
          const classNames = [];
          let leftTrimPos = 0;
          while (leftTrimPos < word.length && isWhitespace(word[leftTrimPos])) {
            leftTrimPos++;
          }
          let rightTrimPos = word.length - 1;
          while (rightTrimPos >= 0 && isWhitespace(word[rightTrimPos])) {
            rightTrimPos--;
          }
          if (leftTrimPos > rightTrimPos) {
            let res = ``;
            res += ' '.repeat(word.length) + '';
            offset += word.length + 1;
            return res;
          }
          if (
            !parenFine &&
            offset <= lastPos &&
            lastPos < offset + word.length
          ) {
            const originalWordLength = word.length;
            const left = word
              .substring(0, lastPos - offset)
              .replace('<', '&lt;')
              .replace('>', '&gt');
            const mid = word[lastPos - offset]
              .replace('<', '&lt;')
              .replace('>', '&gt');
            const right = word
              .substring(lastPos - offset + 1, word.length)
              .replace('<', '&lt;')
              .replace('>', '&gt');
            word = `${left}<span class="syntax-error">${mid}</span>${right}`;
            let res = `<span class="syntax-word">`;
            res += word + '</span>';
            offset += originalWordLength + 1;
            return res;
          }
          let js = '';
          let pword = word.substring(leftTrimPos, rightTrimPos + 1);
          if (pword === '|') {
            classNames.push('syntax-split');
            if (!isMobile)
              js =
                'onmousemove="window.promptService.showPromptTooltip(\'' +
                pword +
                '\', event)" onmouseout="window.promptService.clearPromptTooltip()"';
          }
          if (pword.startsWith('[') && pword.endsWith(']')) {
            classNames.push('syntax-weak');
          }
          if (pword.startsWith('{') && pword.endsWith('}')) {
            classNames.push('syntax-strong');
          }
          if (pword.startsWith('<') && pword.endsWith('>')) {
            try {
              promptService.tryExpandPiece(pword, session);
              if (promptService.isMulti(pword, session))
                classNames.push('syntax-multi-wildcard');
              else classNames.push('syntax-wildcard');

              js =
                'onmousemove="window.promptService.showPromptTooltip(\'' +
                pword +
                '\', event)" onmouseout="window.promptService.clearPromptTooltip()"';
            } catch (e: any) {
              classNames.push('syntax-error');
            }
          }
          pword = pword.replace('<', '&lt;').replace('>', '&gt');
          let res = `<span ${js} class="${classNames.join(' ')}">`;
          if (classNames.length === 0) res = '';
          res += `${word.substring(0, leftTrimPos)}${pword}${word.substring(rightTrimPos + 1, word.length)}`;
          if (classNames.length !== 0) res += '</span>';
          offset += word.length + 1;
          return res;
        })
        .join('');
      return '<span class="syntax-line">' + word + '</span>';
    })
    .join('\n');
  return `${words}`;
};

export function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function reformat(text: string) {
  return toPARR(text).join(', ');
}

export function lowerPromptNode(node: PromptNode): string {
  if (node.type === 'text') {
    return node.text;
  }
  if (node.type === 'random') {
    return lowerPromptNode(pickRandom(node.options));
  }
  return reformat(node.children.map(lowerPromptNode).join(','));
}

export const defaultFPrompt = `1girl, {artist:ixy}`;
export const defaultBPrompt = `{best quality, amazing quality, very aesthetic, highres, incredibly absurdres}`;
export const defaultUC = `worst quality, bad quality, displeasing, very displeasing, lowres, bad anatomy, bad perspective, bad proportions, bad aspect ratio, bad face, long face, bad teeth, bad neck, long neck, bad arm, bad hands, bad ass, bad leg, bad feet, bad reflection, bad shadow, bad link, bad source, wrong hand, wrong feet, missing limb, missing eye, missing tooth, missing ear, missing finger, extra faces, extra eyes, extra eyebrows, extra mouth, extra tongue, extra teeth, extra ears, extra breasts, extra arms, extra hands, extra legs, extra digits, fewer digits, cropped head, cropped torso, cropped shoulders, cropped arms, cropped legs, mutation, deformed, disfigured, unfinished, chromatic aberration, text, error, jpeg artifacts, watermark, scan, scan artifacts`;
