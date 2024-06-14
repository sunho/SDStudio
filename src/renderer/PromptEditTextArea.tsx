import * as Hangul from 'hangul-js';
import { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from './App';
import Denque from 'denque';
import { highlightPrompt, invoke, promptService } from './models';

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
  highlightPrompt: (editor: CursorMemorizeEditor, text: string) => string;
  onUpdated: (editor: CursorMemorizeEditor, text: string) => void;
  historyBuf: any;
  redoBuf: any;
  constructor(editor: HTMLElement, clipboard: HTMLElement, highlightPrompt: (editor: CursorMemorizeEditor, text: string) => string, onUpdated: (editor: CursorMemorizeEditor, text: string) => void, historBuf: any, redoBuf: any) {
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

  updateDOM(text: string) {
    this.domText = text;
    this.editor.innerHTML = this.highlightPrompt(this, text) + '<span></span><br>';
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
    let startIdx = start;
    let endIdx = end;
    while (startIdx > 0 && curText[startIdx-1] !== ',') {
      startIdx--;
    }
    while (endIdx < curText.length && curText[endIdx] !== ',') {
      endIdx++;
    }
    return curText.substring(startIdx, endIdx).trim();
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
        let cursor = start;
        e.preventDefault();
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

interface PromptEditTextAreaProps {
  value: string;
  className?: string;
  innerRef?: any;
  disabled?: boolean;
  onChange: (value: string) => void;
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
  const historyRef = useRef<Denque<HistoryEntry>>(new Denque<HistoryEntry>());
  const redoRef = useRef<Denque<HistoryEntry>>(new Denque<HistoryEntry>());
  const [tags, setTags] = useState<any[]>([]);
  const [clientX, setClientX] = useState(0);
  const [clientY, setClientY] = useState(0);
  const [_, rerender] = useState<{}>({});

  useEffect(() => {
    const onUpdated = (me: CursorMemorizeEditor, text: string) => {
      onChange(text);
    };
    const highlight = (me: CursorMemorizeEditor, text: string) => {
      const word = me.getCurWord();
      invoke('search-tags', word).then((tags: any[]) => {
        setTags(tags.map(x=>x.word));
        const selection = window.getSelection()!;
        const range = selection.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        setClientX(rect.right);
        setClientY(rect.top);
      });
      return highlightPrompt(curSession!, text);
    }
    const editor = new CursorMemorizeEditor(editorRef.current, editorRef.current, highlight, onUpdated, historyRef.current, redoRef.current);
    editor.updateDOM(value);
    editor.updateCurText(value);
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
  }, [editorRef]);

  useEffect(() => {

  }, []);

  // const applyHistory = (entry: HistoryEntry) => {
  //   const [text, cursorPos] = [entry.text, entry.cursorPos];
  //   setInput(text, cursorPos);
  // };
  //
  // useEffect(() => {
  //   if (value !== editorRef.current!.innerText) {
  //     historyRef.current.push({ text: cleanedValue, cursorPos: 0 });
  //     if (historyRef.current.length > MAX_HISTORY_SIZE) {
  //       historyRef.current.shift();
  //     }
  //     redoRef.current.clear();
  //     if (value === '') {
  //       editorRef.current.innerHTML = '';
  //     } else {
  //       editorRef.current.innerHTML = highlightPrompt(
  //         curSession!,
  //         value,
  //       );
  //     }
  //     onChange(cleanedValue);
  //   }
  // }, [value]);
  //
  // useEffect(() => {
  //   const handleInput = (e: any) => {
  //     let text = cleanify(e.target.innerText);
  //     if (text === '') {
  //       onChange(text);
  //       return;
  //     }
  //     historyRef.current.push({ text: text, cursorPos: getCurPos() });
  //     if (historyRef.current.length > MAX_HISTORY_SIZE) {
  //       historyRef.current.shift();
  //     }
  //     redoRef.current.clear();
  //     setInput(text, getCurPos());
  //   };
  //   const cancelEnter = (e: any) => {
  //     const redo = () => {
  //       if (redoRef.current.length > 0) {
  //         const entry = redoRef.current.pop()!;
  //         applyHistory(entry);
  //         historyRef.current.push(entry);
  //       }
  //     };
  //     if (e.key === 'Enter') {
  //       e.preventDefault();
  //     } else if ((e.key === 'z' || e.key === 'Z') && (e.ctrlKey || e.metaKey)) {
  //       e.preventDefault();
  //       if (e.shiftKey) {
  //        redo();
  //       } else {
  //         if (historyRef.current.length > 1) {
  //           const entry = historyRef.current.pop()!;
  //           redoRef.current.push(entry);
  //           applyHistory(historyRef.current.peekBack()!);
  //         }
  //       }
  //     } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
  //       redo();
  //     }
  //   };
  //   const onFetch = () => {
  //     setInput(cleanify(editorRef.current.innerText), getCurPos());
  //   };
  //   editorRef.current.addEventListener('input', handleInput);
  //   editorRef.current.addEventListener('keydown', cancelEnter);
  //   promptService.addEventListener('fetched', onFetch);
  //   return () => {
  //     if (editorRef.current) {
  //       editorRef.current.removeEventListener('input', handleInput);
  //       editorRef.current.removeEventListener('keydown', cancelEnter);
  //     }
  //     promptService.removeEventListener('fetched', onFetch);
  //   };
  // }, []);

  return (
    <div
      ref={innerRef}
      spellCheck={false}
      className={className + ' overflow-auto '}
    >
      <div
        className={'w-full h-full focus:outline-0 whitespace-pre-wrap align-middle'}
        ref={editorRef}
        contentEditable={disabled ? 'false' : 'true'}
      ></div>
      <div
        className="fixed bg-white border border-gray-300 rounded-lg shadow-lg overflow-auto"
        style={
          {
            display: (tags.length > 0 && (clientX !== 0 || clientY !== 0)) ? 'block' : 'none',
            width: '200px',
            height: '200px',
            left: clientX,
            top: clientY + 22,
          }
        }>
        <ul className="p-2">
          {tags.map((tag, idx) => (
            <li key={idx}>{tag}</li>
          ))}
        </ul>
      </div>
    </div>
    );
};


export default PromptEditTextArea;
