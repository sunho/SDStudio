import './App.css';
import './contexify.css';
import {
  Component,
  ReactNode,
  useEffect,
  createContext,
  useState,
  useRef,
} from 'react';
import SessionSelect from './SessionSelect';
import PreSetEditor from './PreSetEdtior';
import SceneQueuControl, { SceneCell } from './SceneQueueControl';
import TaskQueueControl from './TaskQueueControl';
import TobBar from './TobBar';
import AlertWindow from './AlertWindow';
import { DropdownSelect, TabComponent } from './UtilComponents';
import PieceEditor, { PieceCell } from './PieceEditor';
import PromptTooltip from './PromptTooltip';
import ConfirmWindow, { Dialog } from './ConfirmWindow';
import QueueControl from './SceneQueueControl';
import { convertDenDenData, isValidDenDenDataFormat } from './models/compat';
import { FloatViewProvider } from './FloatView';
import {
  FaImage,
  FaImages,
  FaPenFancy,
  FaPenNib,
  FaPuzzlePiece,
} from 'react-icons/fa';
import {
  Menu,
  Item,
  Separator,
  Submenu,
  useContextMenu,
} from 'react-contexify';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import { TouchBackend } from 'react-dnd-touch-backend';
import { usePreview } from 'react-dnd-preview';

import React from 'react';
import { CellPreview } from './ResultViewer';
import { SlotPiece } from './SceneEditor';
import { v4 } from 'uuid';

import styles from './App.module.scss';
import { StackFixed, StackGrow, VerticalStack } from './LayoutComponents';
import ProgressWindow, { ProgressDialog } from './ProgressWindow';
import {
  taskQueueService,
  backend,
  sessionService,
  appUpdateNoticeService,
  localAIService,
  imageService,
  isMobile,
} from './models';
import { dataUriToBase64 } from './models/ImageService';
import { importStyle, embedJSONInPNG } from './models/SessionService';
import {
  PreSet,
  isValidSession,
  isValidPieceLibrary,
  SceneContextAlt,
  ImageContextAlt,
  StyleContextAlt,
  ContextMenuType,
  Session,
} from './models/types';

export interface Context {
  curSession: Session | undefined;
  selectedPreset: PreSet | undefined;
  setSelectedPreset: (preset: PreSet) => void;
  messages: string[];
  pushMessage: (msg: string) => void;
  pushDialog: (dialog: Dialog) => void;
  pushDialogAsync: (dialog: Dialog) => Promise<string | undefined>;
  setProgressDialog: (dialog: ProgressDialog | undefined) => void;
  handleFile: (file: File) => void;
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

const DnDPreview = () => {
  const preview = usePreview();
  if (!preview.display) {
    return null;
  }
  const { itemType, item, style } = preview;
  style['rotate'] = '2deg';
  style['transformOrigin'] = 'center';
  let res: any = null;
  if (itemType === 'scene') {
    const { scene, curSession, getImage, cellSize } = item as any;
    res = (
      <SceneCell
        scene={scene}
        curSession={curSession}
        getImage={getImage}
        cellSize={cellSize}
        style={style}
      />
    );
  } else if (itemType === 'image') {
    const { path, cellSize, imageSize } = item as any;
    res = (
      <CellPreview
        path={path}
        cellSize={cellSize}
        imageSize={imageSize}
        style={style}
      />
    );
  } else if (itemType === 'piece') {
    res = <PieceCell {...(item as any)} style={style} />;
  } else if (itemType === 'slot') {
    res = <SlotPiece {...(item as any)} style={style} />;
  } else {
    return <></>;
  }
  return res;
};

export default function App() {
  useEffect(() => {
    return () => {
      taskQueueService.stop();
    };
  }, []);
  const [darkMode, setDarkMode] = useState(false);
  const [curSession, setCurSession] = useState<Session | undefined>(undefined);
  const [selectedPreset, setSelectedPreset] = useState<PreSet | undefined>(
    undefined,
  );
  const [samples, setSamples] = useState<number>(10);
  const [messages, setMessages] = useState<string[]>([]);
  const [dialogs, setDialogs] = useState<Dialog[]>([]);
  const updatedIgnored = useRef<boolean>(false);
  useEffect(() => {
    const refreshDarkMode = async () => {
      const conf = await backend.getConfig();
      setDarkMode(!conf.whiteMode);
    };
    refreshDarkMode();
    sessionService.addEventListener('config-changed', refreshDarkMode);
    return () => {
      sessionService.removeEventListener('config-changed', refreshDarkMode);
    };
  }, []);
  useEffect(() => {
    const handleUpdate = () => {
      if (appUpdateNoticeService.outdated && !updatedIgnored.current) {
        pushDialog({
          type: 'confirm',
          text: '새로운 버전이 있습니다. 새로 다운 받으시겠습니까?',
          green: true,
          callback: () => {
            backend.openWebPage('https://github.com/sunho/SDStudio/releases');
          },
        });
        updatedIgnored.current = true;
      }
    };
    handleUpdate();
    appUpdateNoticeService.addEventListener('updated', handleUpdate);
    return () => {
      appUpdateNoticeService.removeEventListener('updated', handleUpdate);
    };
  }, []);
  useEffect(() => {
    const removeDonwloadProgressListener = backend.onDownloadProgress(
      (progress: any) => {
        console.log(progress);
        localAIService.notifyDownloadProgress(progress.percent);
      },
    );
    const removeZipProgressListener = backend.onZipProgress((progress: any) => {
      setProgressDialog({
        text: '압축파일 생성 중..',
        done: progress.done,
        total: progress.total,
      });
    });
    const removeImageChangedListener = backend.onImageChanged(
      async (path: string) => {
        console.log('image-changed', path);
        imageService.invalidateCache(path);
      },
    );
    const handleIPCheckFail = () => {
      pushDialog({
        type: 'yes-only',
        text: '네트워크 변경을 감지하고 작업을 중단했습니다. 잦은 네트워크 변경은 계정 공유로 취급되어 밴의 위험이 있습니다. 이를 무시하고 싶으면 환경설정에서 "IP 체크 끄기"를 켜주세요.',
      });
    };
    taskQueueService.addEventListener('ip-check-fail', handleIPCheckFail);
    return () => {
      removeDonwloadProgressListener();
      removeImageChangedListener();
      removeZipProgressListener();
      taskQueueService.removeEventListener('ip-check-fail', handleIPCheckFail);
    };
  }, [curSession]);

  const handleFile = async (file: File) => {
    if (file.type === 'application/json') {
      const reader = new FileReader();
      reader.onload = (e: any) => {
        try {
          const json = JSON.parse(e.target.result);
          handleJSONContent(file.name, json);
        } catch (err) {
          console.error(err);
        }
      };
      reader.readAsText(file);
    } else if (file.type === 'image/png') {
      if (!curSession) {
        return;
      }
      try {
        const reader = new FileReader();
        reader.onload = async (e: any) => {
          try {
            const base64 = dataUriToBase64(e.target.result);
            const preset = await importStyle(curSession!, base64);
            if (preset) {
              setSelectedPreset(preset);
              sessionService.markUpdated(curSession!.name);
              pushDialog({
                type: 'yes-only',
                text: '그림체를 임포트 했습니다',
              });
            }
          } catch (e) {}
        };
        reader.readAsDataURL(file);
      } catch (err) {
        console.error(err);
      }
    }
    const handleJSONContent = async (name: string, json: any) => {
      if (name.endsWith('.json')) {
        name = name.slice(0, -5);
      }
      const handleAddSession = async (json: Session) => {
        const importCool = async () => {
          const sess = await sessionService.get(json.name);
          if (!sess) {
            await sessionService.importSessionShallow(json, json.name);
            const newSession = (await sessionService.get(json.name))!;
            setCurSession(newSession);
            setSelectedPreset(
              newSession.presets.filter(
                (x) => x.type === newSession.presetMode,
              )[0],
            );
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
                  await sessionService.importSessionShallow(json, value);
                  const newSession = (await sessionService.get(value))!;
                  setCurSession(newSession);
                  setSelectedPreset(
                    newSession.presets.filter(
                      (x) => x.type === newSession.presetMode,
                    )[0],
                  );
                } catch (e) {
                  pushMessage('이미 존재하는 프로젝트 이름입니다.');
                }
              },
            });
          }
        };
        if (!curSession) {
          await importCool();
        } else {
          pushDialog({
            type: 'select',
            text: '프로젝트를 임포트 합니다. 원하시는 방식을 선택해주세요.',
            items: [
              {
                text: '새 프로젝트로 임포트',
                value: 'new-project',
              },
              {
                text: '현재 프로젝트에 씬만 임포트 (⚠️! 씬이 덮어씌워짐)',
                value: 'cur-project',
              },
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
                    cur.scenes[key].resolution = json.scenes[key].resolution;
                  } else {
                    cur.scenes[key] = json.scenes[key];
                    cur.scenes[key].mains = [];
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
  };
  useEffect(() => {
    const handleDragOver = (event: any) => {
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
    };

    const handleDragLeave = (event: any) => {
      event.preventDefault();
    };

    const handleDrop = (event: any) => {
      event.preventDefault();
      event.stopPropagation();
      const file = event.dataTransfer.files[0];
      if (file) {
        handleFile(file);
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
    if (curSession) sessionService.reloadPieceLibraryDB(curSession);
    return () => {
      window.curSession = undefined;
    };
  }, [curSession]);

  const ContextMenuList = () => {
    const duplicateScene = async (ctx: SceneContextAlt) => {
      const field = ctx.sceneType === 'scene' ? 'scenes' : 'inpaints';
      const scene = curSession![field][ctx.name];
      if (!scene) {
        return;
      }
      const newScene = JSON.parse(JSON.stringify(scene));
      let cnt = 0;
      const newName = () =>
        ctx.name + '_copy' + (cnt === 0 ? '' : cnt.toString());
      while (newName() in curSession![field]) {
        cnt++;
      }
      newScene.name = newName();
      curSession![field][newName()] = newScene;
      sessionService.markUpdated(curSession!.name);
      sessionService.sceneOrderChanged();
    };
    const moveSceneFront = (ctx: SceneContextAlt) => {
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
    };
    const moveSceneBack = (ctx: SceneContextAlt) => {
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
    };
    const handleSceneItemClick = ({ id, props }: any) => {
      const ctx = props.ctx as SceneContextAlt;
      if (id === 'duplicate') {
        duplicateScene(ctx);
      } else if (id === 'move-front') {
        moveSceneFront(ctx);
      } else if (id === 'move-back') {
        moveSceneBack(ctx);
      }
    };
    const duplicateImage = async (ctx: ImageContextAlt) => {
      const tmp = ctx.path.slice(0, ctx.path.lastIndexOf('/'));
      const dir = tmp.split('/').pop()!;
      const parDir = tmp.slice(0, tmp.lastIndexOf('/')) as any;
      const field = parDir.startsWith('outs') ? 'scenes' : 'inpaints';
      const scene = (curSession! as any)[field][dir];
      if (!scene) {
        return;
      }
      await backend.copyFile(
        ctx.path,
        tmp + '/' + Date.now().toString() + '.png',
      );
      imageService.refresh(curSession!, scene);
      pushDialog({
        type: 'yes-only',
        text: '이미지를 복제했습니다',
      });
    };
    const copyImage = (ctx: ImageContextAlt) => {
      pushDialog({
        type: 'dropdown',
        text: '이미지를 어디에 복사할까요?',
        items: Object.keys(curSession!.scenes).map((key) => ({
          text: key,
          value: key,
        })),
        callback: async (value) => {
          if (!value) return;

          const scene = curSession!.scenes[value];
          if (!scene) {
            return;
          }

          await backend.copyFile(
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
    };
    const clipboardImage = async (ctx: ImageContextAlt) => {
      await backend.copyImageToClipboard(ctx.path);
    };
    const handleImageItemClick = ({ id, props }: any) => {
      if (id === 'duplicate') {
        duplicateImage(props.ctx as ImageContextAlt);
      } else if (id === 'copy') {
        copyImage(props.ctx as ImageContextAlt);
      } else if (id === 'clipboard') {
        clipboardImage(props.ctx as ImageContextAlt);
      }
    };
    const exportStyle = async (ctx: StyleContextAlt) => {
      const pngData = dataUriToBase64(
        await backend.readDataFile(
          imageService.getVibesDir(curSession!) + '/' + ctx.preset.profile,
        ),
      );
      const newPngData = embedJSONInPNG(pngData, ctx.preset);
      const path =
        'exports/' + ctx.preset.name + '_' + Date.now().toString() + '.png';
      await backend.writeDataFile(path, newPngData);
      await backend.showFile(path);
    };
    const deleteStyle = async (ctx: StyleContextAlt) => {
      pushDialog({
        type: 'confirm',
        text: '정말로 삭제하시겠습니까?',
        callback: async () => {
          if (
            ctx.session.presets.filter((p) => p.type === 'style').length === 1
          ) {
            pushMessage('마지막 그림체는 삭제할 수 없습니다');
            return;
          }
          ctx.session.presets = ctx.session.presets.filter(
            (p) => p != ctx.preset,
          );
          setSelectedPreset(
            ctx.session.presets.filter((p) => p.type === 'style')[0],
          );
          sessionService.markUpdated(ctx.session.name);
        },
      });
    };
    const editStyle = async (ctx: StyleContextAlt) => {
      sessionService.styleEditStart(ctx.preset);
    };
    const handleStyleItemClick = ({ id, props }: any) => {
      if (id === 'export') {
        exportStyle(props.ctx as StyleContextAlt);
      } else if (id === 'delete') {
        deleteStyle(props.ctx as StyleContextAlt);
      } else if (id === 'edit') {
        editStyle(props.ctx as StyleContextAlt);
      }
    };
    return (
      <>
        <Menu id={ContextMenuType.Scene}>
          <Item id="duplicate" onClick={handleSceneItemClick}>
            해당 씬 복제
          </Item>
          <Item id="move-front" onClick={handleSceneItemClick}>
            해당 씬 맨 위로
          </Item>
          <Item id="move-back" onClick={handleSceneItemClick}>
            해당 씬 맨 뒤로
          </Item>
        </Menu>
        <Menu id={ContextMenuType.Image}>
          <Item id="duplicate" onClick={handleImageItemClick}>
            해당 이미지 복제
          </Item>
          <Item id="copy" onClick={handleImageItemClick}>
            다른 씬으로 이미지 복사
          </Item>
          {!isMobile && (
            <Item id="clipboard" onClick={handleImageItemClick}>
              클립보드로 이미지 복사
            </Item>
          )}
        </Menu>
        <Menu id={ContextMenuType.Style}>
          <Item id="export" onClick={handleStyleItemClick}>
            해당 그림체 내보내기
          </Item>
          <Item id="edit" onClick={handleStyleItemClick}>
            해당 그림체 편집
          </Item>
          <Item id="delete" onClick={handleStyleItemClick}>
            해당 그림체 삭제
          </Item>
        </Menu>
      </>
    );
  };

  const pushMessage = (msg: string) => {
    setMessages((prev) => [...prev, msg]);
  };

  const pushDialog = (dialog: Dialog) => {
    setDialogs((prev) => [...prev, dialog]);
  };

  const pushDialogAsync = async (dialog: Dialog) => {
    return new Promise<string | undefined>((resolve, reject) => {
      dialog.callback = (value?: string, text?: string) => {
        resolve(value);
      };
      dialog.onCancel = () => {
        resolve(undefined);
      };
      pushDialog(dialog);
    });
  };

  const [progressDialog, setProgressDialog] = useState<
    ProgressDialog | undefined
  >(undefined);

  const ctx: Context = {
    curSession,
    selectedPreset,
    samples,
    messages,
    dialogs,
    setSelectedPreset,
    pushMessage,
    pushDialog,
    setProgressDialog,
    pushDialogAsync,
    handleFile,
  };

  const tabs = [
    {
      label: '이미지생성',
      content: <QueueControl type="scene" showPannel />,
      emoji: <FaImages />,
    },
    {
      label: '인페인트',
      content: <QueueControl type="inpaint" showPannel />,
      emoji: <FaPenFancy />,
    },
    {
      label: '프롬프트조각',
      content: <PieceEditor />,
      emoji: <FaPuzzlePiece />,
    },
  ];
  const editorKey =
    curSession?.presetMode === 'preset'
      ? 'preset_' + curSession.name + '_' + selectedPreset?.name
      : 'style_' + curSession?.name;

  return (
    <AppContext.Provider value={ctx}>
      <DndProvider
        backend={isMobile ? TouchBackend : HTML5Backend}
        options={{
          enableTouchEvents: true,
          enableMouseEvents: false,
          delayTouchStart: 400,
        }}
      >
        <div
          className={
            'flex flex-col relative h-screen w-screen bg-white dark:bg-slate-900 ' +
            (darkMode ? 'dark' : '')
          }
        >
          <div className="z-30">
            <DnDPreview />
          </div>
          <ErrorBoundary
            onErr={(error, errorInfo) => {
              pushMessage(`${error.message}`);
            }}
          >
            <FloatViewProvider>
              <ContextMenuList />
              <VerticalStack>
                <StackFixed>
                  <TobBar
                    setCurSession={setCurSession}
                    setSelectedPreset={setSelectedPreset}
                  />
                </StackFixed>
                <StackGrow className="flex">
                  {curSession && selectedPreset && (
                    <>
                      <StackGrow outerClassName="hidden md:block">
                        <PreSetEditor
                          type={curSession.presetMode}
                          key={editorKey}
                          middlePromptMode={false}
                          selectedPreset={selectedPreset}
                          setSelectedPreset={setSelectedPreset}
                        />
                      </StackGrow>
                      <StackGrow>
                        <TabComponent
                          key={curSession.name}
                          tabs={tabs}
                          toggleView={
                            <PreSetEditor
                              type={curSession.presetMode}
                              key={editorKey + '2'}
                              globalMode
                              selectedPreset={selectedPreset}
                              middlePromptMode={false}
                              setSelectedPreset={setSelectedPreset}
                            />
                          }
                        />
                      </StackGrow>
                    </>
                  )}
                </StackGrow>
              </VerticalStack>
            </FloatViewProvider>
            <StackFixed>
              <div className="px-3 py-2 border-t flex gap-3 items-center line-color">
                <div className="hidden md:block flex-1">
                  <SessionSelect
                    setCurSession={setCurSession}
                    setSelectedPreset={setSelectedPreset}
                  />
                </div>
                <div className="flex flex-none gap-4 ml-auto">
                  <TaskQueueControl setSamples={setSamples} />
                </div>
              </div>
            </StackFixed>
          </ErrorBoundary>
          <AlertWindow setMessages={setMessages} />
          <ConfirmWindow setDialogs={setDialogs} />
          {progressDialog && <ProgressWindow dialog={progressDialog} />}
          <PromptTooltip />
        </div>
      </DndProvider>
    </AppContext.Provider>
  );
}
