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
import { convertDenDenData, isValidDenDenDataFormat } from '../models/compat';
import { FloatViewProvider } from './FloatView';
import { observer, useObserver } from 'mobx-react-lite';
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
} from '../models';
import { dataUriToBase64 } from '../models/ImageService';
import { importStyle, embedJSONInPNG } from '../models/SessionService';
import {
  isValidSession,
  SceneContextAlt,
  ImageContextAlt,
  StyleContextAlt,
  ContextMenuType,
  Session,
  GenericScene,
} from '../models/types';
import { appState } from '../models/AppService';
import { getSnapshot } from 'mobx-state-tree';
import { AppContextMenu } from './AppContextMenu';

import { configure } from 'mobx';
configure({
  enforceActions: 'never',
});

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

export const App = observer(() => {
  useEffect(() => {
    return () => {
      taskQueueService.stop();
    };
  }, []);
  const [darkMode, setDarkMode] = useState(false);
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
        appState.pushDialog({
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
      appState.setProgressDialog({
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
      appState.pushDialog({
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
  }, [appState.curSession]);

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
        appState.handleFile(file);
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
  }, [appState.curSession, appState.dialogs, appState.messages]);

  useEffect(() => {
    window.curSession = appState.curSession;
    if (appState.curSession) {
      sessionService.reloadPieceLibraryDB(appState.curSession);
      imageService.refreshBatch(appState.curSession);
    }
    return () => {
      window.curSession = undefined;
    };
  }, [appState.curSession]);

  const tabs = [
    {
      label: '이미지생성',
      content: <QueueControl type="scene" showPannel />,
      emoji: <FaImages />,
    },
    {
      label: '이미지변형',
      content: <QueueControl type="inpaint" showPannel />,
      emoji: <FaPenFancy />,
    },
    {
      label: '프롬프트조각',
      content: <PieceEditor />,
      emoji: <FaPuzzlePiece />,
    },
  ];
  const editorKey = '';

  return (
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
            appState.pushMessage(`${error.message}`);
          }}
        >
          <FloatViewProvider>
            <AppContextMenu />
            <VerticalStack>
              <StackFixed>
                <TobBar />
              </StackFixed>
              <StackGrow className="flex">
                {appState.curSession && (
                  <>
                    <StackGrow outerClassName="hidden md:block">
                      <PreSetEditor key={editorKey} middlePromptMode={false} />
                    </StackGrow>
                    <StackGrow>
                      <TabComponent
                        key={appState.curSession.name}
                        tabs={tabs}
                        toggleView={
                          <PreSetEditor
                            key={editorKey + '2'}
                            middlePromptMode={false}
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
                <SessionSelect />
              </div>
              <div className="flex flex-none gap-4 ml-auto">
                <TaskQueueControl />
              </div>
            </div>
          </StackFixed>
        </ErrorBoundary>
        <AlertWindow />
        <ConfirmWindow />
        {appState.progressDialog && (
          <ProgressWindow dialog={appState.progressDialog} />
        )}
        <PromptTooltip />
      </div>
    </DndProvider>
  );
});
