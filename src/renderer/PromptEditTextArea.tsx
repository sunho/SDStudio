import { Scrollbars } from 'react-custom-scrollbars-2';
import * as Hangul from 'hangul-js';
import { createRef, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from './App';
import Denque from 'denque';
import { WordTag, calcGapMatch, highlightPrompt, invoke, promptService } from './models';
import { FaBook, FaBox, FaBrush, FaDatabase, FaPaintBrush, FaTag } from 'react-icons/fa';
import { FaPerson } from "react-icons/fa6";

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

  async runExclusive(callback) {
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
  editor: HTMLElement;
  clipboard: HTMLElement;
  highlightPrompt: (editor: CursorMemorizeEditor, text: string, updateAutoComplete: boolean) => string;
  onUpdated: (editor: CursorMemorizeEditor, text: string) => void;
  onUpArrow: (editor: CursorMemorizeEditor) => void;
  onDownArrow: (editor: CursorMemorizeEditor) => void;
  onEnter: (editor: CursorMemorizeEditor) => void;
  autocomplete: boolean;
  historyBuf: any;
  redoBuf: any;
  constructor(editor: HTMLElement,
    clipboard: HTMLElement,
    highlightPrompt: (editor: CursorMemorizeEditor, text: string, updateAutoComplete: boolean) => string,
    onUpdated: (editor: CursorMemorizeEditor, text: string) => void,
    historBuf: any,
    redoBuf: any,
    onUpArrow: (editor: CursorMemorizeEditor) => void,
    onDownArrow: (editor: CursorMemorizeEditor) => void,
    onEnter: (editor: CursorMemorizeEditor) => void
  ) {
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
    const nodeIterator = document.createNodeIterator(this.editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
    let currentNode;
    while (currentNode = nodeIterator.nextNode()) {
      for (let [i,container,offset] of [[0,startContainer, startOffset], [1,endContainer, endOffset]]) {
        if (currentNode === container) {
          if (container.nodeType === 3) {
            res[i] += offset;
          } else if (container.tagName !== "BR"){
            for (let j=0;j<offset;j++){
              const child = container.childNodes[j];
              res[i] += child.textContent.length;
              if (child.tagName === 'BR')
                res[i]++;
            }
          }
          done[i] = true;
        } else {
          if (!done[i]) {
            if (currentNode.nodeType === 3) {
              res[i] += currentNode.textContent.length;
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
    for (let i = 0; i < 2; i ++) {
      let offset = 0;
      const nodeIterator = document.createNodeIterator(this.editor, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT, null, false);
      let currentNode;
      while (currentNode = nodeIterator.nextNode()) {
          if (currentNode.nodeName === 'BR') {
              if (offset === pos[i]) {
                if (i === 0) {
                  range.setStart(currentNode, pos[i] - offset);
                } else {
                  range.setEnd(currentNode, pos[i] - offset);
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
  }

  updateDOM(text: string, updateAutoComplete: boolean = true) {
    this.domText = text;
    this.editor.innerHTML = this.highlightPrompt(this, text, updateAutoComplete) + '<span></span><br>';
  }

  updateCurText(text: string, push: boolean = true) {
    this.curText = text;
    this.onUpdated(this, text);
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

  getCurWord() {
    const [start,end] = this.getCaretPosition();
    if (start !== end) {
      return '';
    }
    let curText = this.domText;
    let startIdx = start+1;
    let endIdx = end;
    while (startIdx > 0 && curText[startIdx-1] !== ',') {
      startIdx--;
    }
    while (endIdx < curText.length && curText[endIdx] !== ',') {
      endIdx++;
    }
    if (startIdx >= endIdx) {
      return '';
    }
    return curText.substring(startIdx, endIdx).trim();
  }

  setCurWord(word: string) {
    const [start,end] = this.getCaretPosition();
    let curText = this.domText;
    let startIdx = start+1;
    let endIdx = end;
    while (startIdx > 0 && curText[startIdx-1] !== ',') {
      startIdx--;
    }
    while (endIdx < curText.length && curText[endIdx] !== ',') {
      endIdx++;
    }
    if (startIdx !== 0)
      word = ' ' + word;
    this.updateCurText(curText.substring(0, startIdx) + word + curText.substring(endIdx));
    this.updateDOM(this.curText, false);
    this.setCaretPosition([startIdx + word.length, startIdx + word.length]);
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
        this.updateDOM(this.curText.substring(0, start) + txt + this.curText.substring(start));
      } else {
        if (txtB.length === 0) {
          this.updateDOM(this.curText.substring(0, start) + txt + this.curText.substring(start));
        } else {
          this.updateDOM(this.curText.substring(0, start-1) + txt + this.curText.substring(start-1));
        }
      }
    } else {
      if (this.compositionBuffer.length) {
        let txt = Hangul.assemble(this.compositionBuffer);
        this.updateCurText(this.curText.substring(0,start-1) + txt + inputChar + this.curText.substring(start-1));
        this.compositionBuffer = [];
        this.updateDOM(this.curText);
        newPos++;
      } else {
        this.updateCurText(this.curText.substring(0, start) + inputChar + this.curText.substring(start));
        this.updateDOM(this.curText);
        newPos++;
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
        this.editor.blur();
        await this.handleInput(e.key || '', collapsed, [start, end]);
        return;
      }
      if (this.autocomplete && ! e.shiftKey) {
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          this.onUpArrow(this);
          return;
        }
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          this.onDownArrow(this);
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
        this.updateDOM(this.curText);
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
            this.updateDOM(this.curText);
            await this.setCaretPosition(entry.cursorPos);
          }
        } else {
          if (this.historyBuf.length > 0) {
            const entry = this.historyBuf.pop()!;
            this.compositionBuffer = [];
            this.redoBuf.push(entry);
            this.updateCurText(entry.text, false);
            this.updateDOM(this.curText);
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
          this.updateDOM(this.curText);
          await this.setCaretPosition(entry.cursorPos);
        }
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this.autocomplete) {
          this.onEnter(this);
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
        this.updateDOM(this.curText);
        await this.setCaretPosition([start+1,start+1]);
        return;
      }
      if (e.key === 'Backspace') {
        e.preventDefault();
        let newPos = start;
        if (range.collapsed) {
          if (start !== 0) {
            this.pushHistory();
            if (this.compositionBuffer.length) {
              this.compositionBuffer.pop();
              const txt = Hangul.assemble(this.compositionBuffer);
              if (txt === '') {
                newPos--;
                this.updateDOM(this.curText);
              } else {
                this.updateDOM(this.curText.substring(0, start-1) + txt + this.curText.substring(start-1));
              }
            } else {
              newPos--;
              this.updateCurText(this.curText.substring(0, start-1) + this.curText.substring(start));
              this.updateDOM(this.curText);
            }
          }
        } else {
          this.pushHistory();
          if (this.compositionBuffer.length) {
            this.compositionBuffer = [];
          }
          this.updateCurText(this.curText.substring(0, start) + this.curText.substring(end));
          this.updateDOM(this.curText);
        }
        await this.setCaretPosition([newPos,newPos]);
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
      this.clipboard.focus();
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
      this.updateDOM(this.curText);
      await this.setCaretPosition([cursor+text.length,cursor+text.length]);
    });
  }
}

const PromptAutoComplete = ({ tags, curWord, clientX, clientY, selectedTag, onSelectTag }: { tags: WordTag[], curWord: string, clientX: number, clientY: number, selectedTag: number, onSelectTag: (idx: number) => void }) => {
  const [posX, setPosX] = useState(0);
  const [posY, setPosY] = useState(0);
  const [matchMasks, setMatchMasks] = useState<number[][]>([]);
  const tagsRef = useRef<any[]>([]);
  const idRef = useRef<number>(0);
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
    while (tagsRef.current.length < tags.length) {
      tagsRef.current.push(createRef());
    }
    setMatchMasks([]);
    // idRef.current++;
    // const myId = idRef.current;
    setMatchMasks(tags.map(tag =>
      calcGapMatch(curWord, tag.word).path
    ));
    // setTimeout(() => {
    //   if (myId !== idRef.current) return;
    //   setMatchMasks(tags.map(tag =>
    //     calcGapMatch(curWord, tag.word).path
    //   ));
    // }, 250);
  }, [tags, curWord]);
  useEffect(() => {
    if (selectedTag >= 0 && selectedTag < tagsRef.current.length) {
      if (tagsRef.current[selectedTag].current)
        tagsRef.current[selectedTag].current.scrollIntoView({ block: 'center' });
    }
  }, [selectedTag, tagsRef.current.length]);
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
  return (
    <div
      onMouseDown={(e) => {
        e.stopPropagation();
      }}
      className="fixed bg-white border border-gray-300 rounded-lg shadow-lg overflow-y-scroll z-10 always-show-scroll"
      style={
        {
          display: (tags.length > 0 && (clientX !== 0 || clientY !== 0)) ? 'block' : 'none',
          width: '400px',
          height: '200px',
          left: posX,
          top: posY,
        }
      }>
      <ul>
        {tags.map((tag, idx) => (
          <li ref={tagsRef.current[idx]} className={(idx === selectedTag ? 'flex items-center p-1 bg-gray-200' : 'flex items-center p-1')} key={idx}>
            <span className="text-gray-600 mr-1">{categoryIcon(tag.category)}</span>
            <div>
            {matchMasks.length ? processWord(tag.word, matchMasks[idx]).map((section, idx2) => (
              <span key={idx2} className={section.bold ? 'font-bold' : ''}>
                {section.text}
              </span>
            )) : tag.word}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
};

interface PromptEditTextAreaProps {
  value: string;
  className?: string;
  innerRef?: any;
  disabled?: boolean;
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
  let trimmedLeft = str.match(/^[{\[]*(artist:)?/) ? str.match(/^[{\[]*(artist:)?/)[0] : '';
  let trimmedRight = str.match(/[}\]]*$/) ? str.match(/[}\]]*$/)[0] : '';
  return trimmedLeft + newWord + trimmedRight;
}

const PromptEditTextArea = ({
  value,
  onChange,
  disabled,
  className,
  innerRef,
}: PromptEditTextAreaProps) => {
  const { curSession } = useContext(AppContext)!;
  const editorRef = useRef<any>(null);
  const editorModelRef = useRef<any>(null);
  const historyRef = useRef<Denque<HistoryEntry>>(new Denque<HistoryEntry>());
  const redoRef = useRef<Denque<HistoryEntry>>(new Denque<HistoryEntry>());
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTag, setSelectedTag] = useState<number>(0);
  const [curWord, setCurWord] = useState<string>('');
  const [clientX, setClientX] = useState(0);
  const [clientY, setClientY] = useState(0);
  const tagsRef = useLatest(tags);
  const idRef = useRef<number>(0);
  const selectedTagRef = useLatest(selectedTag);
  const curWordRef = useLatest(curWord);

  const onUpArrow = (me: CursorMemorizeEditor) => {
    if (tagsRef.current.length === 0) return;
    setSelectedTag((selectedTagRef.current - 1 + tagsRef.current.length) % tagsRef.current.length)
  };
  const onDownArrow = (me: CursorMemorizeEditor) => {
    if (tagsRef.current.length === 0) return;
    setSelectedTag((selectedTagRef.current + 1) % tagsRef.current.length);
  };

  useEffect(() => {
    if (!editorRef.current) return;
    const onUpdated = (me: CursorMemorizeEditor, text: string) => {
      onChange(text);
    };
    const highlight = (me: CursorMemorizeEditor, text: string, updateAutoComplete: boolean) => {
      idRef.current++;
      const myId = idRef.current;
      const word = me.getCurWord();
      
      if (updateAutoComplete) {
        invoke('search-tags', trimByBraces(word)).then(async (tags: any[]) => {
          if (myId !== idRef.current) return;
          tags = tags.slice(0, 64);
          if (tags.length > 0) {
            let selection = window.getSelection()!;
            let range = selection.getRangeAt(0);
            let rect = range.getBoundingClientRect();
            if (rect.right === 0 && rect.top === 0) {
              await new Promise(resolve => requestAnimationFrame(resolve));
              selection = window.getSelection()!;
              range = selection.getRangeAt(0);
              rect = range.getBoundingClientRect();
            }
            setClientX(rect.right);
            setClientY(rect.top);
            setSelectedTag(0);
            setCurWord(word);
            editorModelRef.current.autocomplete = true;
          } else {
            editorModelRef.current.autocomplete = false;
          }
          setTags(tags);
        });
      }
      return highlightPrompt(curSession!, text);
    }

    const onEnter = (me: CursorMemorizeEditor) => {
      if (tagsRef.current.length === 0) return;
      const newWord = replaceMiddleWord(curWordRef.current, tagsRef.current[selectedTagRef.current].word);
      me.setCurWord(newWord);
      setTags([]);
      setSelectedTag(0);
      me.autocomplete = false;
    };

    const editor = new CursorMemorizeEditor(editorRef.current,
      editorRef.current, highlight, onUpdated, historyRef.current, redoRef.current,
      onUpArrow, onDownArrow, onEnter
    );
    editorModelRef.current = editor;
    editor.updateCurText(value);
    editor.updateDOM(value);
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
      setTags([]);
      setSelectedTag(0);
      editorModelRef.current.autocomplete = false;
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

  const onSelectTag = (idx: number) => {
  };

  useEffect(() => {
    if (editorModelRef.current && value !== editorModelRef.current.curText) {
      editorModelRef.current.updateCurText(value);
      editorModelRef.current.updateDOM(value);
    }
  }, [value]);

  return (
    <div
      ref={innerRef}
      spellCheck={false}
      className={className + ' overflow-auto relative'}
    >
      <div
        className={'w-full h-full focus:outline-0 whitespace-pre-wrap align-middle'}
        ref={editorRef}
        contentEditable={disabled ? 'false' : 'true'}
      ></div>
      <PromptAutoComplete curWord={curWord} tags={tags} clientX={clientX} clientY={clientY} selectedTag={selectedTag} onSelectTag={onSelectTag}/>
    </div>
    );
};


export default PromptEditTextArea;
