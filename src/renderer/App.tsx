import './App.css';
import {
  Component,
  ReactNode,
  useEffect,
  createContext,
  useState,
  useRef,
} from 'react';
import {
  taskQueueService,
  Session,
  PreSet,
  isValidSession,
  isValidPieceLibrary,
  sessionService,
  appUpdateNoticeService,
  invoke,
  imageService,
  ContextAlt,
  SceneContextAlt,
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

const ipcRenderer = window.electron.ipcRenderer;

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
  const [samples, setSamples] = useState<number>(10);
  const [messages, setMessages] = useState<string[]>([]);
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const updatedIgnored = useRef<boolean>(false);
  useEffect(() => {
    const handleUpdate = () => {
      if (appUpdateNoticeService.outdated && !updatedIgnored.current) {
        pushDialog({
          type: 'confirm',
          text: '새로운 버전이 있습니다. 새로 다운 받으시겠습니까?',
          green: true,
          callback: () => {
            invoke('open-web-page', 'https://github.com/sunho/SDStudio/releases');
          },
        })
        updatedIgnored.current = true;
      }
    };
    handleUpdate();
    appUpdateNoticeService.addEventListener('updated', handleUpdate);
    return () => {
      appUpdateNoticeService.removeEventListener('updated', handleUpdate);
    };
  },[]);
  useEffect(() => {
    const removeDuplicateSceneListener = ipcRenderer.on('duplicate-scene', async (ctx: SceneContextAlt) => {
      const field = ctx.sceneType === 'scene' ? 'scenes' : 'inpaints';
      const scene = curSession![field][ctx.name];
      if (!scene) {
        return;
      }
      const newScene = JSON.parse(JSON.stringify(scene));
      let cnt = 0;
      const newName = () => (ctx.name + '_copy' + (cnt === 0 ? '' : cnt.toString()));
      while (newName() in curSession![field]) {
        cnt++;
      }
      newScene.name = newName();
      curSession![field][newName()] = newScene;
      sessionService.markUpdated(curSession!.name);
      sessionService.sceneOrderChanged();
    });
    const removeImageChangedListener = ipcRenderer.on('image-changed', async (path: string) => {
      console.log('image-changed', path);
      imageService.invalidateCache(path);
    });
    const removeDuplicateImageListener = ipcRenderer.on('duplicate-image', async (ctx: ContextAlt) => {
      const tmp = ctx.path.slice(0, ctx.path.lastIndexOf('/'));
      const dir = tmp.split('/').pop();
      const parDir = tmp.slice(0, tmp.lastIndexOf('/')) as any;
      const field = parDir.startsWith('outs') ? 'scenes' : 'inpaints';
      console.log(parDir);
      const scene = (curSession! as any)[field][dir];
      if (!scene) {
        return;
      }

      await invoke(
        'copy-file',
        ctx.path,
        tmp +
          '/' +
          Date.now().toString() +
          '.png',
      );
      imageService.refresh(curSession!, scene);
      pushDialog({
        type: 'yes-only',
        text: '이미지를 복제했습니다',
      });
    });
    const removeCopyImageListener = ipcRenderer.on('copy-image', (ctx: ContextAlt) => {
      pushDialog({
        type: 'dropdown',
        text: '이미지를 어디에 복사할까요?',
        items: Object.keys(curSession!.scenes).map((key) => ({
          text: key,
          value: key,
        })),
        callback: async (value) => {
          if (!value)
            return;

          const scene = curSession!.scenes[value];
          if (!scene) {
            return;
          }

          await invoke(
            'copy-file',
            ctx.path,
            imageService.getImageDir(curSession!, scene) +
              '/' +
              Date.now().toString() +
              '.png',
          );
          imageService.refresh(curSession!, scene);
          pushDialog({
            type: 'yes-only',
            text: '이미지를 복사했습니다',
          });
        },
      });
    });
    const removeMoveSceneFrontListener = ipcRenderer.on('move-scene-front', (ctx: SceneContextAlt) => {
      const field = ctx.sceneType === 'scene' ? 'scenes' : 'inpaints';
      const scene = curSession![field][ctx.name];
      if (!scene) {
        return;
      }
      const newScenes: any = {};
      newScenes[ctx.name] = scene;
      for (const key in curSession![field]) {
        if (key !== ctx.name) {
          newScenes[key] = curSession![field][key];
        }
      }
      curSession![field] = newScenes;
      sessionService.markUpdated(curSession!.name);
      sessionService.sceneOrderChanged();
    });
    const removeMoveSceneBackListener = ipcRenderer.on('move-scene-back', (ctx: SceneContextAlt) => {
      const field = ctx.sceneType === 'scene' ? 'scenes' : 'inpaints';
      const scene = curSession![field][ctx.name];
      if (!scene) {
        return;
      }
      const newScenes: any = {};
      for (const key in curSession![field]) {
        if (key !== ctx.name) {
          newScenes[key] = curSession![field][key];
        }
      }
      newScenes[ctx.name] = scene;
      curSession![field] = newScenes;
      sessionService.markUpdated(curSession!.name);
      sessionService.sceneOrderChanged();
    });
    return () => {
      removeCopyImageListener();
      removeMoveSceneFrontListener();
      removeMoveSceneBackListener();
      removeImageChangedListener();
      removeDuplicateImageListener();
      removeDuplicateSceneListener();
    };
  },[curSession]);
  useEffect(() => {
    const handleJSONContent = async (name: string, json: any) => {
      if (name.endsWith('.json')) {
        name = name.slice(0, -5);
      }
      const handleAddSession = async (json: Session) => {
        const importCool = async () => {
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
        }
        if (!curSession) {
          await importCool();
        } else {
          pushDialog({
            type: 'select',
            text: '프로젝트를 임포트 합니다. 원하시는 방식을 선택해주세요.',
            items: [{
                text: '새 프로젝트로 임포트',
                value: 'new-project'
              },
              {
                text: '현재 프로젝트에 씬만 임포트 (⚠️! 씬이 덮어씌워짐)',
                value: 'cur-project'
              }
            ],
            callback: async (option?: string) => {
              if (option === 'new-project') {
                await importCool();
              } else if (option === 'cur-project') {
                const cur = curSession!;
                await sessionService.migrateSession(json);
                for (const key in json.scenes) {
                  if (key in cur.scenes) {
                    cur.scenes[key].slots = json.scenes[key].slots;
                  } else {
                    cur.scenes[key] = json.scenes[key];
                    cur.scenes[key].main = undefined;
                    cur.scenes[key].game = undefined;
                  }
                }
                sessionService.markUpdated(cur.name);
                sessionService.mainImageUpdated();
                pushDialog({
                  type: 'yes-only',
                  text: '씬을 임포트 했습니다',
                });
              }
            },
          })
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
          sessionService.reloadPieceLibraryDB(curSession);
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
    if (curSession)
      sessionService.reloadPieceLibraryDB(curSession);
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
    { label: '프롬프트조각', content: <PieceEditor /> },
  ];

  return (
    <AppContext.Provider value={ctx}>
      <div className="flex flex-col relative h-screen bg-white">
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
