import { Scrollbars } from 'react-custom-scrollbars-2';
import * as Hangul from 'hangul-js';
import { DOMElement, createRef, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { AppContext } from './App';
import Denque from 'denque';
import { WordTag, backend, calcGapMatch, highlightPrompt, isMobile, promptService } from './models';
import { FaBook, FaBox, FaBrush, FaDatabase, FaExpand, FaPaintBrush, FaTag, FaTimes, FaTimesCircle } from 'react-icons/fa';
import { FaPerson, FaStar } from "react-icons/fa6";
import { FixedSizeList as List } from 'react-window';
import getCaretCoordinates from 'textarea-caret';

interface PromptEditTextAreaProps {
  value: string;
  className?: string;
  innerRef?: any;
  disabled?: boolean;
  onChange: (value: string) => void;
}

interface HistoryEntry {
  text: string;
  cursorPos: number[];
  copmositionBuffer: string[];
}

function isMacPlatform() {
  return navigator.platform.toUpperCase().indexOf('MAC') >= 0;
}

class Mutex {
  _queue: any[];
  _locked: boolean;
  constructor() {
    this._queue = [];
    this._locked = false;
  }

  _acquire() {
    return new Promise(resolve => {
      this._queue.push(resolve);
      if (!this._locked) {
        this._dispatchNext();
      }
    });
  }

  _dispatchNext() {
    if (this._queue.length === 0) {
      this._locked = false;
      return;
    }
    this._locked = true;
    const resolve = this._queue.shift();
    resolve();
  }

  async lock() {
    await this._acquire();
  }

  unlock() {
    this._dispatchNext();
  }

  async runExclusive(callback: () => void | Promise<void>) {
    await this.lock();
    try {
      return await callback();
    } finally {
      this.unlock();
    }
  }
}

const mutex = new Mutex();

const MAX_HISTORY_SIZE = 4096; // 1024 * 4096 bytes = 4 MB

class CursorMemorizeEditor {
  compositionBuffer: string[];
  previousRange: number[] | any;
  curText: string;
  domText: string;
  container: HTMLElement;
  editor: HTMLElement;
  clipboard: HTMLElement;
  highlightPrompt: (text: string, curWord: string, updateAutoComplete: boolean) => string;
  onUpdated: (text: string) => void;
  onUpArrow: () => void;
  onDownArrow: () => void;
  onEnter: () => void;
  onEsc: () => void;
  autocomplete: boolean;
  historyBuf: any;
  redoBuf: any;
  shuffling: boolean;
  constructor(
    container: HTMLElement,
    editor: HTMLElement,
    clipboard: HTMLElement,
    highlightPrompt: (text: string, curWord: string, updateAutoComplete: boolean) => string,
    onUpdated: (text: string) => void,
    historBuf: any,
    redoBuf: any,
    onUpArrow: () => void,
    onDownArrow: () => void,
    onEnter: () => void,
    onEsc: () => void
  ) {
    this.container = container;
    this.compositionBuffer = [];
    this.previousRange = undefined;
    this.curText = '';
    this.domText = '';
    this.editor = editor;
    this.clipboard = clipboard;
    this.highlightPrompt = highlightPrompt;
    this.onUpdated = onUpdated;
    this.historyBuf = historBuf;
    this.redoBuf = redoBuf;
    this.autocomplete = false;
    this.onUpArrow = onUpArrow;
    this.onDownArrow = onDownArrow;
    this.onEnter = onEnter;
    this.onEsc = onEsc;
    this.shuffling = false;
  }

  getCaretPosition() {
    const selection = window.getSelection()!;
    let res = [0,0];
    const done = [false,false];
    if (selection.rangeCount === 0)
      return res;
    const range = selection.getRangeAt(0);
    let startContainer = range.startContainer;
    let endContainer = range.endContainer;
    let startOffset = range.startOffset;
    let endOffset = range.endOffset;
    const nodeIterator = document.createNodeIterator(this.editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
    let currentNode;
    while (currentNode = nodeIterator.nextNode()) {
      for (let [i,container,offset] of [[0,startContainer, startOffset], [1,endContainer, endOffset]]) {
        i = i as number;
        offset = offset as number;
        container = container as Node;
        if (currentNode === container) {
          if (container.nodeType === 3) {
            res[i] += offset;
          } else if ((container as any).tagName !== "BR"){
            for (let j=0;j<offset;j++){
              const child = container.childNodes[j];
              res[i] += (child as any).textContent.length;
              if ((child as any).tagName === 'BR')
                res[i]++;
            }
          }
          done[i] = true;
        } else {
          if (!done[i]) {
            if (currentNode.nodeType === 3) {
              res[i] += currentNode.textContent!.length;
            }
            if (currentNode.nodeName === 'BR') {
              res[i] += 1;
            }
          }
        }
      }
    }
    return res;
  }

  async setCaretPosition(pos: number[] | any) {
    await new Promise(resolve => requestAnimationFrame(resolve));
    const selection = window.getSelection()!;
    const range = document.createRange();
    let foundNode = undefined;
    for (let i = 0; i < 2; i ++) {
      let offset = 0;
      const nodeIterator = document.createNodeIterator(this.editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null);
      let currentNode;
      while (currentNode = nodeIterator.nextNode()) {
          if (currentNode.nodeName === 'BR') {
              if (offset === pos[i]) {
                if (i === 0) {
                  range.setStart(currentNode, pos[i] - offset);
                } else {
                  range.setEnd(currentNode, pos[i] - offset);
                  foundNode = currentNode;
                }
                break;
              }
              offset += 1;
          }
          if (currentNode.nodeType === 3) {
            let nodeLength = currentNode.textContent!.length;
            if (offset + nodeLength >= pos[i]) {
                if (i === 0) {
                  range.setStart(currentNode, pos[i] - offset);
                } else {
                  range.setEnd(currentNode, pos[i] - offset);
                  foundNode = currentNode;
                }
                break;
            }
            offset += nodeLength;
          }
      }
    }

    selection.removeAllRanges();
    selection.addRange(range);
    this.previousRange = pos;
    const rect = range.getBoundingClientRect();
    const parentRect = this.container.getBoundingClientRect();
    if (rect.bottom > parentRect.bottom) {
      this.container.scrollTop += rect.bottom - parentRect.bottom;
    }
  }

  updateDOM(text: string, newPos: number, updateAutoComplete: boolean = true) {
    this.domText = text;
    const cur = this.getCurWord(newPos)
    this.editor.innerHTML = this.highlightPrompt(text, cur, updateAutoComplete) + '<span></span><br>';
  }

  updateCurText(text: string, push: boolean = true) {
    this.curText = text;
    this.onUpdated(text);
  }

  pushHistory() {
    if (this.historyBuf.length > MAX_HISTORY_SIZE) {
      this.historyBuf.shift();
    }
    let pos = this.getCaretPosition();
    let text = this.curText;
    if (this.compositionBuffer.length > 0) {
      text = text.substring(0, pos[0]-1) + Hangul.assemble(this.compositionBuffer) + text.substring(pos[0]-1);
    }
    this.historyBuf.push({ text, cursorPos: this.getCaretPosition(), compositionBuffer: this.compositionBuffer });
    this.redoBuf.clear();
  }

  getCurWord(start: number) {
    let curText = this.domText;
    let startIdx = start;
    while (startIdx > 0 && !',\n'.includes(curText[startIdx-1])) {
      startIdx--;
    }
    return curText.substring(startIdx, start+1).trim();
  }

  setCurWord(word: string) {
    mutex.runExclusive(async () => {
      const [start,end] = this.getCaretPosition();
      let curText = this.domText;
      let startIdx = start;
      while (startIdx > 0 && !',\n'.includes(curText[startIdx-1])) {
        startIdx--;
      }
      if (startIdx !== 0 && curText[startIdx-1] !== '\n')
        word = ' ' + word;
      this.updateCurText(curText.substring(0, startIdx) + word + curText.substring(start));
      this.updateDOM(this.curText, startIdx, false);
      this.compositionBuffer = [];
      await this.setCaretPosition([startIdx + word.length, startIdx + word.length]);
    });
  }

  async handleInput(inputChar: string, collapsed: boolean, pos: number[] | undefined = undefined) {
    this.pushHistory();
    const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g;
    const [start,end] = pos ? pos : this.getCaretPosition();
    this.updateCurText(this.curText.substring(0, start) + this.curText.substring(end), false);
    let newPos = start;
    if (koreanRegex.test(inputChar)) {
      let txtB = Hangul.assemble(this.compositionBuffer);
      if (this.compositionBuffer.length === 0) {
        newPos++;
      }
      this.compositionBuffer.push(inputChar);
      let txt = Hangul.assemble(this.compositionBuffer);
      if (txt.length === 2) {
        this.updateCurText(this.curText.substring(0,start-1) + txt[0] + this.curText.substring(start-1));
        let found;
        for (let i = 0; i < this.compositionBuffer.length; i++) {
          if (Hangul.assemble(this.compositionBuffer.slice(0,i)) === txt[0]) {
            found = i;
            break;
          }
        }
        this.compositionBuffer = this.compositionBuffer.slice(found);
        newPos++;
        txt = txt[1];
        this.updateDOM(this.curText.substring(0, start) + txt + this.curText.substring(start), newPos);
      } else {
        if (txtB.length === 0) {
          this.updateDOM(this.curText.substring(0, start) + txt + this.curText.substring(start), newPos);
        } else {
          this.updateDOM(this.curText.substring(0, start-1) + txt + this.curText.substring(start-1), newPos);
        }
      }
    } else {
      if (this.compositionBuffer.length) {
        let txt = Hangul.assemble(this.compositionBuffer);
        this.updateCurText(this.curText.substring(0,start-1) + txt + inputChar + this.curText.substring(start-1));
        this.compositionBuffer = [];
        newPos++;
        this.updateDOM(this.curText, newPos);
      } else {
        this.updateCurText(this.curText.substring(0, start) + inputChar + this.curText.substring(start));
        newPos++;
        this.updateDOM(this.curText, newPos);
      }
    }
    await this.setCaretPosition([newPos,newPos]);
  }

  handleWindowMouseDown(e: any) {
    if (this.compositionBuffer.length)
  		this.flushCompositon(this.previousRange);
  }

  handleMouseDown(e: any) {
    // const pos = this.getCaretPosition();
    // this.setCaretPosition(pos);
  }

  flushCompositon(prev: number[])  {
    if (!prev) return false;
    const [start,end] = prev;
    if (this.compositionBuffer.length) {
      let txt = Hangul.assemble(this.compositionBuffer);
      this.updateCurText(this.curText.substring(0,start-1) + txt + this.curText.substring(start-1));
      this.compositionBuffer = [];
      return true;
    }
    return false;
  }

  async handleKeyDown(e: any) {
    await mutex.runExclusive(async () => {
      const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g;
      const selection = window.getSelection()!;
      const range = selection.getRangeAt(0);
      const [start,end] = this.getCaretPosition();
      const collapsed = range.collapsed;
      if (koreanRegex.test(e.key || '')) {
        e.preventDefault();
        this.shuffling = true;
        this.editor.blur();
        this.shuffling = false;
        await this.handleInput(e.key || '', collapsed, [start, end]);
        return;
      }
      if (this.autocomplete && ! e.shiftKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.onUpArrow();
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.onDownArrow();
          return;
        }
      }
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'ArrowUp' || e.key === 'ArrowDown' || (e.key === 'a' && (e.metaKey || e.ctrlKey))) {
        this.flushCompositon(this.previousRange);
        return;
      }
      if (e.key === 'c' && (e.metaKey || e.ctrlKey)) {
        this.flushCompositon(this.previousRange);
        return;
      }
      if (e.key === 'x' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        this.pushHistory();
        await navigator.clipboard.writeText(this.curText.substring(start, end));
        this.updateCurText(this.curText.substring(0, start) + this.curText.substring(end));
        this.updateDOM(this.curText, start);
        await this.setCaretPosition([start,start]);
        return;
      }
      if ((e.key === 'z' || e.key === 'Z') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (e.shiftKey) {
          if (this.redoBuf.length > 0) {
            const entry = this.redoBuf.pop()!;
            this.compositionBuffer = [];
            this.historyBuf.push(entry);
            this.updateCurText(entry.text, false);
            this.updateDOM(this.curText, entry.cursorPos, false);
            await this.setCaretPosition(entry.cursorPos);
          }
        } else {
          if (this.historyBuf.length > 0) {
            const entry = this.historyBuf.pop()!;
            this.compositionBuffer = [];
            this.redoBuf.push(entry);
            this.updateCurText(entry.text, false);
            this.updateDOM(this.curText, entry.cursorPos, false);
            await this.setCaretPosition(entry.cursorPos);
          }
        }
        return;
      }
      if (e.key === 'y' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        if (this.redoBuf.length > 0) {
          const entry = this.redoBuf.pop()!;
          this.compositionBuffer = [];
          this.historyBuf.push(entry);
          this.updateCurText(entry.text, false);
          this.updateDOM(this.curText, entry.curPos, false);
          await this.setCaretPosition(entry.cursorPos);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.autocomplete) {
          this.onEnter();
          return;
        }
        let cursor = start;
        this.pushHistory();
        if (!range.collapsed) {
          this.updateCurText(this.curText.substring(0, start) + this.curText.substring(end), false);
        } else {
          if (this.flushCompositon(this.previousRange)) {
            cursor++;
          }
        }
        this.updateCurText(this.curText.substring(0, cursor) + '\n' + this.curText.substring(cursor));
        this.updateDOM(this.curText, start+1, false);
        await this.setCaretPosition([start+1,start+1]);
        return;
      }
      if (e.key === 'Delete') {
        e.preventDefault();
        let newPos = start;
        if (range.collapsed) {
          if (start !== this.curText.length) {
            this.pushHistory();
            this.flushCompositon(this.previousRange);
            this.updateCurText(this.curText.substring(0, start) + this.curText.substring(start+1));
            this.updateDOM(this.curText, newPos);
          }
        } else {
          this.pushHistory();
          if (this.compositionBuffer.length) {
            this.compositionBuffer = [];
          }
          this.updateCurText(this.curText.substring(0, start) + this.curText.substring(end));
          this.updateDOM(this.curText, newPos);
        }
        await this.setCaretPosition([newPos,newPos]);
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        let newPos = start;
        if (range.collapsed) {
          let delAmount = 1;
          const massDel = e.shiftKey || e.metaKey;
          if (massDel) {
            let i = start-2;
            const blanks = ' \t\n\u200B';
            if (!blanks.includes(this.curText[start-1])) {
              while (i >= 0 && !blanks.includes(this.curText[i])) {
                i--;
                delAmount++;
              }
            }
          }
          if (start !== 0) {
            this.pushHistory();
            if (this.compositionBuffer.length) {
              if (!massDel) {
                this.compositionBuffer.pop();
                const txt = Hangul.assemble(this.compositionBuffer);
                if (txt === '') {
                  newPos--;
                  this.updateDOM(this.curText, newPos);
                } else {
                  this.updateDOM(this.curText.substring(0, start-1) + txt + this.curText.substring(start-1), newPos);
                }
              } else {
                newPos -= delAmount;
                this.compositionBuffer = [];
                this.updateCurText(this.curText.substring(0, start-delAmount) + this.curText.substring(start-1));
                this.updateDOM(this.curText, newPos);
              }
            } else {
              newPos-=delAmount;
              this.updateCurText(this.curText.substring(0, start-delAmount) + this.curText.substring(start));
              this.updateDOM(this.curText, newPos);
            }
          }
        } else {
          this.pushHistory();
          if (this.compositionBuffer.length) {
            this.compositionBuffer = [];
          }
          this.updateCurText(this.curText.substring(0, start) + this.curText.substring(end));
          this.updateDOM(this.curText, newPos);
        }
        await this.setCaretPosition([newPos,newPos]);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        if (this.autocomplete) {
          this.onEsc();
        } else {
          this.flushCompositon(this.previousRange);
        }
        return;
      }
    });
  }

  async handleBeforeInput(e: any) {
    e.preventDefault();
    await mutex.runExclusive(async () => {
      const koreanRegex = /[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/g;
      if (koreanRegex.test(e.data || ''))
        return;
      if (!e.data) return;
      await this.handleInput(e.data || '', false);
    });
  }

  async handleCompositionUpdate(e: any) {
    e.preventDefault();
    await mutex.runExclusive(async () => {
      if (!e.data) return;
      const selection = window.getSelection()!;
      const range = selection.getRangeAt(0);
      const [start,end] = this.getCaretPosition();
      const collapsed = range.collapsed;
      this.shuffling = true;
      this.clipboard.focus();
      this.shuffling = false;
      await new Promise(resolve => requestAnimationFrame(resolve));
      await new Promise(resolve => requestAnimationFrame(resolve));
      await this.handleInput(e.data || '', collapsed, [start, end]);
    });
  }

  async handlePaste(e: any) {
    e.preventDefault();
    await mutex.runExclusive(async () => {
      const text = e.clipboardData.getData('text');
      const selection = window.getSelection()!;
      const [start,end] = this.getCaretPosition();
      let cursor = start;
      if (this.flushCompositon(this.previousRange)) {
        cursor++;
      }
      this.updateCurText(this.curText.substring(0, cursor) + text + this.curText.substring(end));
      this.updateDOM(this.curText, cursor+text.length, false);
      await this.setCaretPosition([cursor+text.length,cursor+text.length]);
    });
  }
}

const PromptAutoComplete = ({ tags, curWord, clientX, clientY, selectedTag, onSelectTag }: { tags: WordTag[], curWord: string, clientX: number, clientY: number, selectedTag: number, onSelectTag: (idx: number) => void }) => {
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [matchMasks, setMatchMasks] = useState<any[][]>([]);
  const tagsRef = useRef<any[]>([]);
  const listRef = createRef<any>();
  const categoryIcon = (category: number) => {
    if (category === 0) return <FaTag/>
    if (category === 1) return <FaPaintBrush/>
    if (category === 3) return <FaBook/>
    if (category === 4) return <FaPerson/>
    if (category === 5) return <FaDatabase/>
    return <FaBox/>
  }
  useEffect(() => {
    setPosX(clientX);
    setPosY(clientY + 22);
  }, [clientX, clientY]);
  useEffect(() => {
    setMatchMasks(tags.map(tag =>
      calcGapMatch(curWord, tag.word).path
    ));
  }, [tags, curWord]);
  useEffect(() => {
    if (listRef.current)
      listRef.current.scrollToItem(selectedTag, "smart");
  }, [listRef,selectedTag, tagsRef.current.length]);
  const processWord = (word: string, mask: number[]) => {
    const sections = [];
    let currentSection = { text: '', bold: false };

    for (let i = 0; i < word.length; i++) {
      const char = word[i];
      const isBold = mask && mask.includes(i);

      if (isBold !== currentSection.bold) {
        if (currentSection.text) {
          sections.push(currentSection);
        }
        currentSection = { text: char, bold: isBold };
      } else {
        currentSection.text += char;
      }
    }

    if (currentSection.text) {
      sections.push(currentSection);
    }

    return sections;
  };

  const formatCount = (count: number) => {
    if (count > 1000) {
      return (count / 1000).toFixed(1) + 'k';
    }
    return count;
  }

  const renderRow = ({ index, style } : { index: number, style: any }) => {
    return <div
      ref={tagsRef.current[index]}
      className={'hover:brightness-95 active:brightness-90 cursor-pointer ' + (index === selectedTag ? 'flex items-center p-1 bg-gray-200' : 'flex bg-white items-center p-1')}
      style={style}
      key={index}
      onMouseDown={() => onSelectTag(index)}
    >
      <span className="text-gray-600 mr-1 flex-none">{tags[index].word.startsWith('<') ? <FaStar></FaStar> : categoryIcon(tags[index].category)}</span>
      <div className="flex-1 truncate h-full">
        {matchMasks.length ? processWord(tags[index].word, matchMasks[index]).map((section, idx2) => (
          <span key={idx2} className={section.bold ? 'font-bold' : ''}>
            {section.text}
          </span>
        )) : tags[index].word}
        {(tags[index].redirect.trim()!=='null') && <span className="text-gray-400">→{tags[index].redirect}</span>}
      </div>
      {!tags[index].word.startsWith('<') && <div className="flex-none text-right">{formatCount(tags[index].freq)}</div>}
    </div>
  };
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg z-30"
      style={
        {
          display: (tags.length > 0 && (clientX !== 0 || clientY !== 0)) ? 'block' : 'none',
          width: '90vw',
          maxWidth: '400px',
          height: '200px',
          left: isMobile ? "5vw" : posX,
          top: posY,
        }
      }>
       <List
        ref={listRef}
        className="always-show-scroll"
        height={200}
        itemCount={tags.length}
        itemSize={31}
        /*
        // @ts-ignore */
        overscanRowCount={16}
      >
        {renderRow}
      </List>
    </div>
  );
};

interface PromptEditTextAreaProps {
  value: string;
  whiteBg?: boolean;
  innerRef?: any;
  disabled?: boolean;
  lineHighlight?: boolean;
  onChange: (value: string) => void;
}

function useLatest(value: any) {
  const ref = useRef(value);

  useEffect(() => {
    ref.current = value;
  }, [value]);

  return ref;
}

function trimByBraces(str: string) {
  str = str.replace(/^[{\[]*(artist:)?/, '');
  str = str.replace(/[}\]]*S$/, '');
  return str;
}

function replaceMiddleWord(str: string, newWord: string) {
  let trimmedLeft = str.match(/^[{\[]*(artist:)?/) ? str.match(/^[{\[]*(artist:)?/)![0] : '';
  let trimmedRight = str.match(/[}\]]*$/) ? str.match(/[}\]]*$/)![0] : '';
  return trimmedLeft + newWord + trimmedRight;
}

interface EditTextAreaProps {
  value: string;
  disabled?: boolean;
  highlight: (text: string, curWord: string, updateAutoComplete: boolean) => string;
  onUpdated: (text: string) => void;
  history: Denque<HistoryEntry>;
  redo: Denque<HistoryEntry>;
  onUpArrow: () => void;
  onDownArrow: () => void;
  onEnter: () => void;
  onEsc: () => void;
  onFocus: () => void;
  onBlur: () => void;
  closeAutoComplete: () => void;
}

interface EditTextAreaRef {
  onCloseAutoComplete: () => void;
  onOpenAutoComplete: () => void;
  setCurWord: (word: string) => void;
  getCaretCoords(): Promise<number[]>;
}

const EmulatedEditTextArea = forwardRef<EditTextAreaRef, any>(({
  value, disabled, highlight, onUpdated, history, redo, onUpArrow, onDownArrow, onEnter, onEsc, closeAutoComplete
  }: EditTextAreaProps, ref: any) => {
  const editorRef = useRef<any>(null);
  const containerRef = useRef<any>(null);
  const clipboardRef = useRef<any>(null);
  const editorModelRef = useRef<any>(null);

  useEffect(() => {
    if (!editorRef.current) return;
    const editor = new CursorMemorizeEditor(containerRef.current, editorRef.current,
      clipboardRef.current, highlight, onUpdated, history, redo,
      onUpArrow, onDownArrow, onEnter, onEsc
    );
    editorModelRef.current = editor;
    editor.updateCurText(value);
    editor.updateDOM(value, 0, false);
    const handleKeyDown = (e: any) => editor.handleKeyDown(e);
    editorRef.current.addEventListener('keydown', handleKeyDown);
    const handleBeforeInput = (e: any) => editor.handleBeforeInput(e);
    editorRef.current.addEventListener('beforeinput', handleBeforeInput);
    const handleCompositionUpdate = (e: any) => editor.handleCompositionUpdate(e);
    if (!isMacPlatform()) {
      editorRef.current.addEventListener('compositionupdate', handleCompositionUpdate);
    }
    const handlePaste = (e: any) => editor.handlePaste(e);
    editorRef.current.addEventListener('paste', handlePaste);
    const handleWindowMouseDown = (e: any) => {
      closeAutoComplete();
      editor.handleWindowMouseDown(e);
    };
    window.addEventListener('mousedown', handleWindowMouseDown);
    const handleMouseDown = (e: any) => editor.handleMouseDown(e);
    editorRef.current.addEventListener('mousedown', handleMouseDown);
    return () => {
      if (editorRef.current === null) return;
      editorRef.current.removeEventListener('keydown', handleKeyDown);
      editorRef.current.removeEventListener('beforeinput', handleBeforeInput);
      if (!isMacPlatform()) {
        editorRef.current.removeEventListener('compositionupdate', handleCompositionUpdate);
      }
      editorRef.current.removeEventListener('paste', handlePaste);
      window.removeEventListener('mousedown', handleWindowMouseDown);
      editorRef.current.removeEventListener('mousedown', handleMouseDown);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    onCloseAutoComplete: () => {
      editorModelRef.current.autocomplete = false;
    },
    onOpenAutoComplete: () => {
      editorModelRef.current.autocomplete = true;
    },
    setCurWord: (word: string) => {
      editorModelRef.current.setCurWord(word);
    },
    getCaretCoords: async () => {
      let selection = window.getSelection()!;
      if (selection.rangeCount === 0) return;
      let range = selection.getRangeAt(0);
      let rect = range.getBoundingClientRect();
      if (rect.right === 0 && rect.top === 0) {
        await new Promise(resolve => requestAnimationFrame(resolve));
        selection = window.getSelection()!;
        range = selection.getRangeAt(0);
        rect = range.getBoundingClientRect();
      }
      return [rect.right, rect.top];
    }
  }));

  return <>
    <div ref={containerRef} className="overflow-auto h-full">
      <div
        className={'w-full min-h-full focus:outline-0 whitespace-pre-wrap align-middle'}
        ref={editorRef}
        contentEditable={disabled ? 'false' : 'true'}
      ></div>
    </div>
    <textarea
      className="absolute top-0 left-0 opacity-0 w-0 h-0"
      disabled={disabled}
      ref={clipboardRef}
      value=''
      onChange={(e) => {e.target.value=''}}></textarea>
    </>
});

const NativeEditTextArea = forwardRef(({
  value, disabled, highlight, onUpdated, history, redo, onUpArrow, onDownArrow, onEnter, onEsc, closeAutoComplete, onFocus, onBlur
} : EditTextAreaProps, ref) => {
  const textareaRef = useRef<any>(null);
  const highlightRef = useRef<any>(null);
  const containerRef = useRef<any>(null);
  const isAutoComplete = useRef(false);

  useEffect(() => {
    if (!textareaRef.current || !highlightRef.current) return;
    const getCurWord = () => {
      let start = textareaRef.current.selectionStart;;
      const curText = textareaRef.current.value;
      let startIdx = start;
      while (startIdx > 0 && !',\n'.includes(curText[startIdx - 1])) {
        startIdx--;
      }
      return curText.substring(startIdx, start).trim();
    };

    const handleInput = () => {
      const text = textareaRef.current.value;
      highlightRef.current.innerHTML = highlight(text, getCurWord(), true) + '<span></span><br>';
      onUpdated(text);
    };

    textareaRef.current.addEventListener('input', handleInput);
    textareaRef.current.addEventListener('focus', onFocus);
    textareaRef.current.addEventListener('blur', onBlur);

    handleInput();

    const handleWindowMouseDown = (e: any) => {
      closeAutoComplete();
    };
    window.addEventListener('mousedown', handleWindowMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
      if (!textareaRef.current) return;
      textareaRef.current.removeEventListener('input', handleInput);
      textareaRef.current.removeEventListener('focus', onFocus);
      textareaRef.current.removeEventListener('blur', onBlur);
    };
  }, []);

  useImperativeHandle(ref, () => ({
    onCloseAutoComplete: () => {
      isAutoComplete.current = false;
    },
    onOpenAutoComplete: () => {
      isAutoComplete.current = true;
    },
    setCurWord: (word: string) => {
      const start = textareaRef.current.selectionStart;
      let curText = textareaRef.current.value;
      let startIdx = start;
      while (startIdx > 0 && !',\n'.includes(curText[startIdx-1])) {
        startIdx--;
      }
      if (startIdx !== 0 && curText[startIdx-1] !== '\n')
        word = ' ' + word;
      const newText = curText.substring(0, startIdx) + word + curText.substring(start);
      textareaRef.current.value = newText;
      onUpdated(newText);
      textareaRef.current.selectionEnd = startIdx + word.length;
      highlightRef.current.innerHTML = highlight(newText, '', false) + '<span></span><br>';
    },
    getCaretCoords: async () => {
      const caret = getCaretCoordinates(textareaRef.current!, textareaRef.current!.selectionEnd);
      const rect = textareaRef.current!.getBoundingClientRect();
      return [caret.left + rect.left, caret.top + rect.top];
    }
  }));

  return (
    <div className="w-full h-full overflow-auto">
      <div ref={containerRef} className="native-text-area-container">
        <div
          ref={highlightRef}
          className="native-text-area-highlight select-none"
        ></div>
        <textarea
          ref={textareaRef}
          className="native-text-area-input native-text-area-highlight"
          defaultValue={value}
          disabled={disabled}
          onKeyDown={(e: any) => {
            if (e.key === 'ArrowUp') {
              if (isAutoComplete.current) {
                e.preventDefault();
              }
              onUpArrow();
            }
            else if (e.key === 'ArrowDown') {
              if (isAutoComplete.current) {
                e.preventDefault();
              }
              onDownArrow();
            }
            else if (e.key === 'Enter') {
              if (isAutoComplete.current)
                e.preventDefault();
              onEnter();
            }
            else if (e.key === 'Escape') onEsc();
          }}
        ></textarea>
      </div>
    </div>
  );
});

const PromptEditTextArea = ({
  value,
  onChange,
  disabled,
  whiteBg,
  lineHighlight,
  innerRef,
}: PromptEditTextAreaProps) => {
  const { curSession } = useContext(AppContext)!;
  const editorRef = useRef<EditTextAreaRef|null>(null);
  const historyRef = useRef<Denque<HistoryEntry>>(new Denque<HistoryEntry>());
  const redoRef = useRef<Denque<HistoryEntry>>(new Denque<HistoryEntry>());
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTag, setSelectedTag] = useState<number>(0);
  const [curWord, setCurWord] = useState<string>('');
  const [clientX, setClientX] = useState(0);
  const [clientY, setClientY] = useState(0);
  const tagsRef = useLatest(tags);
  const [id, setId] = useState(0);
  const cntRef = useRef(0);
  const selectedTagRef = useLatest(selectedTag);
  const curWordRef = useLatest(curWord);
  const [fullScreen, setFullScreen] = useState(false);

  const closeAutoComplete = () => {
    setTags([]);
    setSelectedTag(0);
    editorRef.current!.onCloseAutoComplete();
    setId(id => id + 1);
  };

  const onUpArrow = () => {
    if (tagsRef.current.length === 0) return;
    setSelectedTag((selectedTagRef.current - 1 + tagsRef.current.length) % tagsRef.current.length)
  };
  const onDownArrow = () => {
    if (tagsRef.current.length === 0) return;
    setSelectedTag((selectedTagRef.current + 1) % tagsRef.current.length);
  };
  const onEsc = () => {
    closeAutoComplete();
  };
  const onUpdated = (text: string) => {
    onChange(text);
  };
  const highlight = (text: string, word: string, updateAutoComplete: boolean) => {
    if (updateAutoComplete) {
      if (word === '') {
        closeAutoComplete();
      } else {
        const action = word.startsWith('<') ? backend.searchPieces.bind(backend) : backend.searchTags.bind(backend);
        cntRef.current++;
        const myId = cntRef.current;
        action(trimByBraces(word)).then(async (tags: any[]) => {
          if (myId !== cntRef.current) return;
          if (tags.length > 0) {
            const [x,y] = await editorRef.current!.getCaretCoords();
            setClientX(x);
            setClientY(y);
            setSelectedTag(0);
            setCurWord(word);
            setTags(tags);
            editorRef.current!.onOpenAutoComplete();
          } else {
            closeAutoComplete();
          }
        });
      }
    }
    return highlightPrompt(curSession!, text, lineHighlight ?? false);
  }
  const onEnter = () => {
    if (tagsRef.current.length === 0) return;
    const tag = tagsRef.current[selectedTagRef.current];
    const tagWord = tag.redirect.trim()!=='null' ? tag.redirect.trim() : tag.word;
    const newWord = replaceMiddleWord(curWordRef.current, tagWord);
    editorRef.current!.setCurWord(newWord);
    closeAutoComplete();
  };

  const onSelectTag = (idx: number) => {
    if (tagsRef.current.length === 0) return;
    const tag = tagsRef.current[idx];
    const tagWord = tag.redirect.trim()!=='null' ? tag.redirect.trim() : tag.word;
    const newWord = replaceMiddleWord(curWordRef.current, tagWord);
    editorRef.current!.setCurWord(newWord);
    closeAutoComplete();
  };

  const onFoucs = () => {
    if (isMobile)
      setFullScreen(true);
  }

  const onBlur = () => {
    if (isMobile)
      setFullScreen(false);
  }

  let bgColor = whiteBg ? 'bg-gray-100' : 'bg-gray-200';
  if (fullScreen)
    bgColor = 'bg-white shadow-lg'

  return (
    <>
    <div
      ref={innerRef}
      spellCheck={false}
      draggable={true} onDragStart={event => event.preventDefault()}
      className={bgColor + (!fullScreen ? ' overflow-hidden h-full relative' : ' left-0 m-4 p-2 overflow-hidden fixed z-30 h-96 prompt-full')}
    >
      <div className="absolute right-0 top-0 z-10">
        <button
          onClick={() => {
            if(!disabled)
              setFullScreen(!fullScreen);
          }}
          className="text-gray-500 hover:text-gray-600 opacity-50 mr-1 mt-1"
        >
          {!fullScreen ? <FaExpand></FaExpand> : <FaTimes></FaTimes>}
        </button>
      </div>
      <NativeEditTextArea ref={editorRef} value={value} disabled={disabled} highlight={highlight} onUpdated={onUpdated} history={historyRef.current} redo={redoRef.current} onUpArrow={onUpArrow} onDownArrow={onDownArrow} onEnter={onEnter} onEsc={onEsc} closeAutoComplete={closeAutoComplete} onFocus={onFoucs} onBlur={onBlur}/>
    </div>
    <PromptAutoComplete key={id} curWord={curWord} tags={tags} clientX={clientX} clientY={clientY} selectedTag={selectedTag} onSelectTag={onSelectTag}/>
     {fullScreen && <div className="fixed bg-black opacity-15 w-screen h-screen top-0 left-0 z-20" onClick={() => {setFullScreen(false);}}></div>}
     </>
    );
};

export default PromptEditTextArea;
