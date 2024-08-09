import * as React from 'react';
import { useEffect, useState } from 'react';
import { DropdownSelect, Option } from './UtilComponents';
import { FaPlus, FaShare, FaTrashAlt } from 'react-icons/fa';
import { sessionService, imageService, backend, zipService } from '../models';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';

const SessionSelect = observer(() => {
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
      appState.pushDialog({
        type: 'input-confirm',
        text: '신규 프로젝트 이름을 입력해주세요',
        callback: async (inputValue) => {
          if (inputValue) {
            if (sessionNames.includes(inputValue)) {
              appState.pushMessage('이미 존재하는 프로젝트 이름입니다.');
              return;
            }
            await sessionService.add(inputValue);
            const newSession = (await sessionService.get(inputValue))!;
            appState.curSession = newSession;
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
        appState.curSession = session;
      }
    })();
  };

  const deleteSession = () => {
    appState.pushDialog({
      type: 'confirm',
      text: '정말로 이 프로젝트를 삭제하시겠습니까?',
      callback: async () => {
        await sessionService.delete(appState.curSession!.name);
        appState.curSession = undefined;
      },
    });
  };

  return (
    <div className="flex gap-2 items-center w-full">
      <span className="hidden md:inline whitespace-nowrap text-sub">
        프로젝트:{' '}
      </span>
      <div className="md:max-w-80 w-full">
        <DropdownSelect
          menuPlacement="top"
          selectedOption={appState.curSession?.name}
          options={sessionNames.map((name) => ({ label: name, value: name }))}
          onSelect={selectSession}
        />
      </div>
      <button className={`icon-button nback-sky mx-1`} onClick={addSession}>
        <FaPlus size={18} />
      </button>
      <button
        className={`icon-button nback-orange mx-1`}
        onClick={() => {
          appState.projectBackupMenu();
        }}
      >
        <FaShare />
      </button>
      <button className={`icon-button nback-red mx-1`} onClick={deleteSession}>
        <FaTrashAlt size={18} />{' '}
      </button>
    </div>
  );
});

export default SessionSelect;
