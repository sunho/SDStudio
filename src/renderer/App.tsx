import './App.css';
import {
  Component,
  ReactNode,
  useEffect,
  createContext,
  useState,
} from 'react';
import {
  taskQueueService,
  Session,
  PreSet,
  isValidSession,
  isValidPieceLibrary,
  sessionService,
} from './models';
import SessionSelect from './SessionSelect';
import PreSetEditor from './PreSetEdtior';
import SceneQueuControl from './SceneQueueControl';
import TaskQueueControl from './TaskQueueControl';
import NAILogin from './NAILogin';
import AlertWindow from './AlertWindow';
import { DropdownSelect, TabComponent } from './UtilComponents';
import PieceEditor from './PieceEditor';
import PromptTooltip from './PromptTooltip';
import ConfirmWindow, { Dialog } from './ConfirmWindow';
import QueueControl from './SceneQueueControl';
import { convertDenDenData, isValidDenDenDataFormat } from './compat';
import { FloatViewProvider } from './FloatView';

export interface Context {
  curSession: Session | undefined;
  selectedPreset: PreSet | undefined;
  messages: string[];
  pushMessage: (msg: string) => void;
  pushDialog: (dialog: Dialog) => void;
  dialogs: Dialog[];
  samples: number;
}

export const AppContext = createContext<Context | null>(null);

interface ErrorBoundaryProps {
  children: ReactNode;
  onErr?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    if (this.props.onErr) {
      this.props.onErr(error, errorInfo);
    }
  }

  render() {
    return this.props.children;
  }
}

export default function App() {
  useEffect(() => {
    return () => {
      taskQueueService.stop();
    };
  }, []);
  const [curSession, setCurSession] = useState<Session | undefined>(undefined);
  const [selectedPreset, setSelectedPreset] = useState<PreSet | undefined>(
    undefined,
  );
  const [samples, setSamples] = useState<number>(30);
  const [messages, setMessages] = useState<string[]>([]);
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  useEffect(() => {
    const handleJSONContent = async (name: string, json: any) => {
      if (name.endsWith('.json')) {
        name = name.slice(0, -5);
      }
      const handleAddSession = async (json: Session) => {
        const sess = await sessionService.get(json.name);
        if (!sess) {
          await sessionService.createFrom(json.name, json);
          if (taskQueueService.isEmpty())
            setCurSession(await sessionService.get(json.name));
          pushDialog({
            type: 'yes-only',
            text: '프로젝트를 임포트 했습니다',
          });
        } else {
          pushDialog({
            type: 'input-confirm',
            text: '프로젝트를 임포트 합니다. 새 프로젝트 이름을 입력하세요.',
            callback: async (value) => {
              if (!value || value === '') {
                return;
              }
              try {
                await sessionService.createFrom(value, json);
                setCurSession(await sessionService.get(value));
              } catch (e) {
                pushMessage('이미 존재하는 프로젝트 이름입니다.');
              }
            },
          });
        }
      };
      if (isValidSession(json)) {
        handleAddSession(json as Session);
      } else if (isValidPieceLibrary(json)) {
        if (!curSession) {
          pushMessage('세션을 먼저 선택해주세요.');
          return;
        }
        if (!(json.description in curSession.library)) {
          curSession.library[json.description] = json;
          sessionService.markUpdated(curSession.name);
          sessionService.pieceLibraryImported();
          pushDialog({
            type: 'yes-only',
            text: '조각모음을 임포트 했습니다',
          });
          return;
        }
        pushDialog({
          type: 'input-confirm',
          text: '조각그룹을 임포트 합니다. 새 조각그룹 이름을 입력하세요.',
          callback: (value) => {
            if (!value || value === '') {
              return;
            }
            if (value in curSession.library) {
              pushMessage('이미 존재하는 조각그룹 이름입니다.');
              return;
            }
            json.description = value;
            curSession.library[value] = json;
            sessionService.markUpdated(curSession.name);
            sessionService.pieceLibraryImported();
          },
        });
      } else if (isValidDenDenDataFormat(json)) {
        const converted = convertDenDenData(name, json);
        handleAddSession(converted);
      }
    };

    const handleDragOver = (event) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };

    const handleDragLeave = (event) => {
      event.preventDefault();
    };

    const handleDrop = (event) => {
      event.preventDefault();
      const file = event.dataTransfer.files[0];
      if (file && file.type === 'application/json') {
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const json = JSON.parse(e.target.result);
            handleJSONContent(file.name, json);
          } catch (err) {
            console.error(err);
          }
        };
        reader.readAsText(file);
        event.stopPropagation();
      }
    };
    window.addEventListener('dragover', handleDragOver);
    window.addEventListener('dragleave', handleDragLeave);
    window.addEventListener('drop', handleDrop);

    return () => {
      window.removeEventListener('dragover', handleDragOver);
      window.removeEventListener('dragleave', handleDragLeave);
      window.removeEventListener('drop', handleDrop);
    };
  }, [curSession, dialogs, messages]);
  useEffect(() => {
    window.curSession = curSession;
    return () => {
      window.curSession = undefined;
    };
  }, [curSession]);

  const pushMessage = (msg: string) => {
    setMessages((prev) => [...prev, msg]);
  };

  const pushDialog = (dialog: Dialog) => {
    setDialogs((prev) => [...prev, dialog]);
  };

  const ctx: Context = {
    curSession,
    selectedPreset,
    samples,
    messages,
    dialogs,
    pushMessage,
    pushDialog,
  };

  const tabs = [
    { label: '이미지생성', content: <QueueControl type="scene" showPannel/> },
    { label: '인페인팅', content: <QueueControl type="inpaint" showPannel/> },
    { label: '프롬프트조각', content: <PieceEditor /> },
  ];

  return (
    <AppContext.Provider value={ctx}>
      <div className="flex flex-col relative h-screen">
        <ErrorBoundary
          onErr={(error, errorInfo) => {
            pushMessage(`${error.message}`);
          }}
        >
            <FloatViewProvider>
            <div className="flex flex-col flex-1 overflow-hidden">
              <div className="grow-0">
                <NAILogin />
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="flex w-full h-full overflow-hidden">
                {curSession && (
                  <>
                    <div className="flex-1 overflow-hidden">
                      <PreSetEditor
                        key={curSession.name}
                        middlePromptMode={false}
                        setSelectedPreset={setSelectedPreset}
                      />
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <TabComponent key={curSession.name} tabs={tabs} />
                    </div>
                  </>
                )}
                </div>
              </div>
            </div>
            </FloatViewProvider>
          <div className="grow-0">
            <SessionSelect
              setCurSession={setCurSession}
              setSamples={setSamples}
            />
          </div>
        </ErrorBoundary>
        <AlertWindow setMessages={setMessages} />
        <ConfirmWindow setDialogs={setDialogs} />
        <PromptTooltip />
      </div>
    </AppContext.Provider>
  );
}
