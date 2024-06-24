import * as React from 'react';
import { useContext, useEffect, useState } from 'react';
import { Session, invoke, sessionService, taskQueueService } from './models';
import { AppContext } from './App';
import { primaryColor, roundButton } from './styles';
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
  setSamples: (nw: number) => void;
  setCurSession: (session: Session | undefined) => void;
}

const SessionSelect: React.FC<Props> = ({ setCurSession, setSamples }) => {
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
            if (inputValue in sessionNames) {
              ctx.pushMessage('이미 존재하는 프로젝트 이름입니다.');
              return;
            }
            await sessionService.add(inputValue);
            setCurSession(await sessionService.get(inputValue)!);
          }
        },
      });
    })();
  };

  const selectSession = (opt: Option<string>) => {
    (async () => {
      const session = await sessionService.get(opt.value);
      if (session) setCurSession(session);
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
    <div className="px-3 py-2 border-t flex gap-3 items-center">
      <span className="whitespace-nowrap">프로젝트: </span>
      <div className="w-1/5 xl:w-1/4">
        <DropdownSelect
          menuPlacement="top"
          selectedOption={ctx.curSession?.name}
          options={sessionNames.map((name) => ({ label: name, value: name }))}
          onSelect={selectSession}
        />
      </div>
      <button
        className={`${roundButton} ${primaryColor} w-18 h-8`}
        onClick={addSession}
      >
        <FaPlus size={18} />
      </button>
      <button
        className={`${roundButton} bg-orange-500 h-8 w-18`}
        onClick={async () => {
          if (!ctx.curSession) return;
          await invoke(
            'show-file',
            sessionService.getPath(ctx.curSession.name),
          );
        }}
      >
        <FaShare />
      </button>
      <button
        className={`${roundButton} bg-red-500 w-18 h-8`}
        onClick={deleteSession}
      >
        <FaTrashAlt size={18} />{' '}
      </button>
      <div className="flex gap-4 ml-auto">
        <TaskQueueControl setSamples={setSamples} />
      </div>
    </div>
  );
};

export default SessionSelect;
