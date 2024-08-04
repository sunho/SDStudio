import { useContext, useEffect, useRef, useState } from 'react';
import { FaSpinner } from 'react-icons/fa';
import { FaPlay, FaRegCalendarTimes, FaStop } from 'react-icons/fa';
import { FaTimes } from 'react-icons/fa';
import { FaRegClock } from 'react-icons/fa';
import { taskQueueService } from '../models';
import {
  GenerateImageTaskParams,
  RemoveBgTaskParams,
  Task,
} from '../models/TaskQueueService';
import { appState } from '../models/AppService';
import { observer } from 'mobx-react-lite';

interface ProgressBarProps {
  duration: number;
  isError: boolean;
  text: string;
  key: number;
}

const ProgressBar = ({ duration, isError, text, key }: ProgressBarProps) => {
  return (
    <div
      key={key}
      className="relative w-40 md:w-52 bg-gray-200 dark:bg-slate-700 rounded-full h-8"
    >
      <div className="top-0 left-0 w-40 md:w-52 h-8 absolute flex items-center justify-center text-gray-600 dark:text-white gap-2">
        <FaRegClock size={20} />
        <div className="w-28 md:w-40 text-xs md:text-sm text-center overflow-hidden text-nowrap">
          {text}
        </div>
      </div>
      <div
        className={
          'top-0 left-0 absolute w-40 md:w-52 progress-transition rounded-full h-8 progress-clip-animation ' +
          (!isError ? 'bg-sky-500 dark:bg-indigo-400' : 'bg-red-500')
        }
        style={{ animationDuration: `${duration}s` }}
      ></div>
      <div
        className="top-0 left-0 w-40 md:w-52 h-8 absolute flex items-center justify-center text-white gap-2 progress-clip-animation"
        style={{ animationDuration: `${duration}s` }}
      >
        <FaRegClock size={20} />
        <div className="w-28 md:w-40 text-xs md:text-sm text-center overflow-hidden text-nowrap">
          {text}
        </div>
      </div>
    </div>
  );
};

interface TaskProgressBarProps {
  fast?: boolean;
}
export const TaskProgressBar = ({ fast }: TaskProgressBarProps) => {
  const { pushMessage } = appState;
  const key = useRef<number>(0);
  const [duration, setDuration] = useState(0);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<string>('');
  const [_, rerender] = useState<{}>({});
  const formatTime = (ms: number) => {
    const seconds = ms / 1000;
    const minutes = seconds / 60;
    const hours = minutes / 60;

    if (seconds < 60) {
      return `${Math.round(seconds)}초`;
    } else if (minutes < 60) {
      return `${Math.round(minutes)}분`;
    } else {
      return `${Math.round(hours)}시간`;
    }
  };
  const getProgressText = () => {
    const stats = taskQueueService.statsAllTasks();
    const remain = stats.total - stats.done;
    const ms = taskQueueService.estimateTime('mean');
    const timeEstimate = formatTime(ms);
    return `${remain}개 남음 (예상 ${timeEstimate})`;
  };

  useEffect(() => {
    const nextKey = () => {
      key.current = key.current + 1;
      rerender({});
    };
    const onChange = () => {
      if (!taskQueueService.isRunning()) {
        nextKey();
        setDuration(0);
        setIsError(false);
        setError('');
      }
      rerender({});
    };
    const onComplete = () => {
      nextKey();
      setIsError(false);
      setError('');
      setDuration(taskQueueService.estimateTopTaskTime('mean') / 1000);
      if (!taskQueueService.isRunning()) {
        setDuration(0);
      }
    };
    const onStart = () => {
      nextKey();
      setIsError(false);
      setError('');
      setDuration(taskQueueService.estimateTopTaskTime('mean') / 1000);
      if (!taskQueueService.isRunning()) {
        setDuration(0);
      }
    };
    const onError = (e: any) => {
      if (e.detail.task.type === 'remove-bg') {
        pushMessage('Error: ' + e.detail.error);
      }
      setError(e.detail.error);
      setIsError(true);
    };
    taskQueueService.addEventListener('start', onStart);
    taskQueueService.addEventListener('stop', onChange);
    taskQueueService.addEventListener('progress', onChange);
    taskQueueService.addEventListener('complete', onComplete);
    taskQueueService.addEventListener('error', onError);
    return () => {
      taskQueueService.removeEventListener('start', onStart);
      taskQueueService.removeEventListener('stop', onChange);
      taskQueueService.removeEventListener('progress', onChange);
      taskQueueService.removeEventListener('complete', onComplete);
      taskQueueService.removeEventListener('error', onError);
    };
  }, []);

  return (
    <div
      onClick={() => {
        if (error !== '') {
          pushMessage('Error: ' + error);
        }
      }}
    >
      <ProgressBar
        key={key.current}
        isError={isError}
        duration={duration}
        text={getProgressText()}
      />
    </div>
  );
};

const TaskQueueList = ({ onClose }: { onClose?: () => void }) => {
  const [tasks, setTasks] = useState<any[]>([]);
  useEffect(() => {
    const onChange = () => {
      setTasks([...taskQueueService.queue]);
    };
    taskQueueService.addEventListener('start', onChange);
    taskQueueService.addEventListener('stop', onChange);
    taskQueueService.addEventListener('progress', onChange);
    taskQueueService.addEventListener('complete', onChange);
    taskQueueService.addEventListener('error', onChange);
    onChange();
    return () => {
      taskQueueService.removeEventListener('start', onChange);
      taskQueueService.removeEventListener('stop', onChange);
      taskQueueService.removeEventListener('progress', onChange);
      taskQueueService.removeEventListener('complete', onChange);
      taskQueueService.removeEventListener('error', onChange);
    };
  }, []);

  const getEmoji = (task: Task) => {
    if (task.type === 'generate' || task.type === 'generate-fast') {
      return '🖼️';
    } else if (task.type === 'inpaint') {
      return '🖌️';
    } else if (task.type === 'remove-bg') {
      return '🔪';
    }
  };

  const getTaskText = (task: Task) => {
    if (
      task.type === 'generate' ||
      task.type === 'generate-fast' ||
      task.type === 'inpaint'
    ) {
      const params: GenerateImageTaskParams = task.params;
      return params.scene;
    } else if (task.type === 'remove-bg') {
      const params: RemoveBgTaskParams = task.params;
      return params.scene;
    }
  };

  return (
    <div className="absolute bottom-0 mb-14 md:mb-20 bg-white dark:bg-slate-700 w-60 md:w-96 z-20 shadow-lg prog-list flex flex-col overflow-hidden">
      <button
        className="ml-auto mt-2 mr-2 text-gray-500 hover:text-gray-700 flex-none"
        onClick={() => {
          onClose?.();
        }}
      >
        <FaTimes size={20} />
      </button>
      <div className="flex-1 overflow-hidden pb-2">
        <div className="h-full overflow-auto">
          {tasks.map((task, i) => (
            <div
              key={i}
              className="flex mt-2 items-center gap-2 p-2 border-gray-300 dark:border-slate-500 border mx-2 rounded-lg"
            >
              <div className="flex-none ">{getEmoji(task)}</div>
              <div className="flex-1 truncate text-default">
                {getTaskText(task)}
              </div>
              <div className="flex-none ml-auto p-2 bg-gray-300 dark:bg-slate-500 dark:text-white rounded-lg font-medium text-sm text-gray-500">
                {task!.done}/{task!.total}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const TaskQueueControl = observer(({ }) => {
  const [_, rerender] = useState<{}>({});
  const [showList, setShowList] = useState(false);
  useEffect(() => {
    const onChange = () => {
      rerender({});
    };
    taskQueueService.addEventListener('start', onChange);
    taskQueueService.addEventListener('stop', onChange);
    taskQueueService.addEventListener('progress', onChange);
    taskQueueService.addEventListener('complete', onChange);
    taskQueueService.addEventListener('error', onChange);
    return () => {
      taskQueueService.removeEventListener('start', onChange);
      taskQueueService.removeEventListener('stop', onChange);
      taskQueueService.removeEventListener('progress', onChange);
      taskQueueService.removeEventListener('complete', onChange);
      taskQueueService.removeEventListener('error', onChange);
    };
  }, []);

  return (
    <div className="flex gap-2 md:gap-4 items-center">
      {showList && (
        <TaskQueueList
          onClose={() => {
            setShowList(false);
          }}
        />
      )}
      <div className="whitespace-nowrap">
        <span className="whitespace-nowrap text-default">개수:</span>
        <input
          min={1}
          max={99}
          className={'ml-2 p-1 md:w-16 text-center gray-input'}
          type="number"
          value={appState.samples}
          onChange={(e: any) => {
            try {
              const num = parseInt(e.currentTarget.value) ?? 0;
              appState.samples = Math.max(1, Math.min(99, num));
            } catch (e: any) {
              appState.samples = 1;
            }
          }}
        />
      </div>
      <div
        className="relative cursor-pointer hover:brightness-95 active:brightness-90"
        onClick={() => {
          setShowList(!showList);
        }}
      >
        <TaskProgressBar />
      </div>
      <button
        className={`round-button back-gray px-2 h-8 md:px-6`}
        onClick={() => {
          taskQueueService.removeAllTasks();
        }}
      >
        <FaRegCalendarTimes size={18} />
      </button>
      {!taskQueueService.isRunning() ? (
        <button
          className={`round-button back-green px-2 h-8 md:px-6`}
          onClick={() => {
            (async () => {
              taskQueueService.run();
            })();
          }}
        >
          <FaPlay size={15} />
        </button>
      ) : (
        <button
          className={`round-button back-red px-2 h-8 md:px-6`}
          onClick={() => {
            taskQueueService.stop();
          }}
        >
          <FaStop size={15} />
        </button>
      )}
    </div>
  );
});

export default TaskQueueControl;
