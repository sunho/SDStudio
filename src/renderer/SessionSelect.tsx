import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import { PreSet, Session, backend, getFirstFile, imageService, sessionService, taskQueueService, zipService } from './models';
import { AppContext } from './App';
import { DropdownSelect, Option } from './UtilComponents';
import TaskQueueControl from './TaskQueueControl';
import {
  FaArrowCircleUp,
  FaFileExport,
  FaPlus,
  FaShare,
  FaTrashAlt,
} from 'react-icons/fa';

interface Props {
  setCurSession: (session: Session | undefined) => void;
  setSelectedPreset: (presets: PreSet) => void;
}

const SessionSelect: React.FC<Props> = ({ setCurSession, setSelectedPreset }) => {
  const ctx = useContext(AppContext)!;
  const [sessionNames, setSessionNames] = useState<string[]>([]);
  useEffect(() => {
    const onListUpdated = () => {
      setSessionNames(sessionService.list());
    };
    onListUpdated();
    sessionService.addEventListener('listupdated', onListUpdated);
    return () => {
      sessionService.removeEventListener('listupdated', onListUpdated);
    };
  }, []);
  const addSession = () => {
    (async () => {
      ctx.pushDialog({
        type: 'input-confirm',
        text: '신규 프로젝트 이름을 입력해주세요',
        callback: async (inputValue) => {
          if (inputValue) {
            if (sessionNames.includes(inputValue)) {
              ctx.pushMessage('이미 존재하는 프로젝트 이름입니다.');
              return;
            }
            await sessionService.add(inputValue);
            const newSession = (await sessionService.get(inputValue))!;
            setCurSession(newSession);
            setSelectedPreset(newSession.presets.filter(x => x.type === newSession.presetMode)[0]);
          }
        },
      });
    })();
  };

  const selectSession = (opt: Option<string>) => {
    (async () => {
      const session = await sessionService.get(opt.value);
      if (session) {
        imageService.refreshBatch(session);
        setCurSession(session);
        setSelectedPreset(session.presets.filter(x => x.type === session.presetMode)[0]);
      }
    })();
  };

  const deleteSession = () => {
    ctx.pushDialog({
      type: 'confirm',
      text: '정말로 이 프로젝트를 삭제하시겠습니까?',
      callback: async () => {
        await sessionService.delete(ctx.curSession!.name);
        setCurSession(undefined);
      },
    });
  };

  return (
    <div className="flex gap-2 items-center w-full">
    <span className="hidden md:inline whitespace-nowrap text-sub">프로젝트: </span>
    <div className="md:max-w-80 w-full">
      <DropdownSelect
        menuPlacement="top"
        selectedOption={ctx.curSession?.name}
        options={sessionNames.map((name) => ({ label: name, value: name }))}
        onSelect={selectSession}
      />
    </div>
    <button
      className={`icon-button nback-sky mx-1`}
      onClick={addSession}
    >
      <FaPlus size={18} />
    </button>
    <button
      className={`icon-button nback-orange mx-1`}
      onClick={async () => {
        ctx.pushDialog({
          type: 'select',
          text: '메뉴를 선택해주세요',
          items: [
            {
              text: '파일 불러오기',
              value: 'load'
            },
            {
              text: '프로젝트 백업 불러오기',
              value: 'loadDeep'
            },
            {
              text: '프로젝트 파일 내보내기 (이미지 미포함)',
              value: 'save'
            },
            {
              text: '프로젝트 백업 내보내기 (이미지 포함)',
              value: 'saveDeep'
            }
          ],

          callback: async (value) => {
            if (value === 'save')  {
              if (ctx.curSession) {
                const proj = await sessionService.exportSessionShallow(ctx.curSession);
                const path = 'exports/' + ctx.curSession.name + '.json';
                await backend.writeFile(path, JSON.stringify(proj));
                await backend.showFile(path);
              }
            } else if (value === 'saveDeep') {
              if (ctx.curSession) {
                const path = 'exports/' + ctx.curSession.name + '.tar';
                if (zipService.isZipping) {
                  ctx.pushMessage('이미 내보내기 작업이 진행중입니다.');
                  return;
                }
                ctx.setProgressDialog({
                  text: '압축 파일 생성중..',
                  done: 0,
                  total: 1
                });
                try {
                  await sessionService.exportSessionDeep(ctx.curSession, path);
                } catch (e: any) {
                  ctx.setProgressDialog(undefined);
                  return;
                }
                ctx.setProgressDialog(undefined);
                ctx.pushDialog({
                  type: 'yes-only',
                  text: '백업이 완료되었습니다.',
                })
                await backend.showFile(path);
                ctx.setProgressDialog(undefined);
              }
            } else if (value === 'load') {
              const file = await getFirstFile();
              ctx.handleFile(file as any);
            } else {
              ctx.pushDialog({
                type: 'input-confirm',
                text: '새로운 프로젝트 이름을 입력해주세요',
                callback: async (inputValue) => {
                  if (inputValue) {
                    if (inputValue in sessionNames) {
                      ctx.pushMessage('이미 존재하는 프로젝트 이름입니다.');
                      return;
                    }
                    const tarPath = await backend.selectFile();
                    if (tarPath) {
                      ctx.setProgressDialog({
                        text: '프로젝트 백업을 불러오는 중입니다...',
                        done: 0,
                        total: 1
                      });
                      try {
                        await sessionService.importSessionDeep(tarPath, inputValue);
                      } catch (e: any) {
                        ctx.setProgressDialog(undefined);
                        ctx.pushMessage(e.message);
                        return;
                      }
                      ctx.setProgressDialog(undefined);
                      ctx.pushDialog({
                        type: 'yes-only',
                        text: '프로젝트 백업을 불러왔습니다.',
                      })
                      const sess = await sessionService.get(inputValue);
                      setCurSession(sess);
                      ctx.setSelectedPreset(sess!.presets.filter(x => x.type === sess!.presetMode)[0]);
                    }
                  }
                },
              });
            }

          }
        });
      }}
    >
      <FaShare />
    </button>
    <button
      className={`icon-button nback-red mx-1`}
      onClick={deleteSession}
    >
      <FaTrashAlt size={18} />{' '}
    </button>
    </div>
  );
};

export default SessionSelect;
