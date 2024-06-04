import { useContext, useEffect, useRef, useState } from 'react';
import { AppContext } from './App';
import {
  Scene,
  imageService,
  promptService,
  queueScene,
  sessionService,
  taskQueueService,
  toPARR,
} from './models';
import { grayInput, primaryColor, roundButton } from './styles';
import { FaSpinner } from 'react-icons/fa';
import { FaPlay, FaRegCalendarTimes, FaStop } from 'react-icons/fa';
import { FaTimes } from 'react-icons/fa';
import { FaRegClock } from 'react-icons/fa';

interface Props {
  setSamples: (nw: number) => void;
}

interface ProgressBarProps {
  duration: number;
  isError: boolean;
  text: string;
  key: number;
}

const ProgressBar = ({ duration, isError, text, key }: ProgressBarProps) => {
  return (
    <div key={key} className="relative w-52 bg-gray-200 rounded-full h-8">
      <div className="top-0 left-0 w-52 h-8 absolute flex items-center justify-center text-gray-600 gap-2">
        <FaRegClock size={20} />
        <div className="w-36 text-sm text-center overflow-hidden text-nowrap">
          {text}
        </div>
      </div>
      <div
        className={
          'top-0 left-0 absolute w-52 progress-transition rounded-full h-8 progress-clip-animation ' +
          (!isError ? 'bg-sky-500' : 'bg-red-500')
        }
        style={{ animationDuration: `${duration}s` }}
      ></div>
      <div
        className="top-0 left-0 w-52 h-8 absolute flex items-center justify-center text-white gap-2 progress-clip-animation"
        style={{ animationDuration: `${duration}s` }}
      >
        <FaRegClock size={20} />
        <div className="w-36 text-sm text-center overflow-hidden text-nowrap">
          {text}
        </div>
      </div>
    </div>
  );
};

const TaskQueueControl: React.FC<Props> = ({ setSamples }) => {
  const ctx = useContext(AppContext)!;
  const curSession = ctx.curSession!;
  const [_, rerender] = useState<{}>({});
  const [duration, setDuration] = useState(0);
  const [isError, setIsError] = useState(false);
  const [error, setError] = useState<string>('');
  const key = useRef<number>(0);
  useEffect(() => {
    const nextKey = () => {
      console.log(key);
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
      setDuration(taskQueueService.timeEstimator.estimateMedian()! / 1000);
      if (!taskQueueService.isRunning()) {
        setDuration(0);
      }
    };
    const onStart = () => {
      nextKey();
      setIsError(false);
      setError('');
      setDuration(taskQueueService.timeEstimator.estimateMedian()! / 1000);
      if (!taskQueueService.isRunning()) {
        setDuration(0);
      }
    };
    const onError = (e) => {
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
    const stats = taskQueueService.totalStats;
    const remain = stats.total - stats.done;
    const timeEstimate = formatTime(
      remain * taskQueueService.timeEstimator.estimateMedian()!,
    );
    return `${remain}개 남음 (예상 ${timeEstimate})`;
  };

  return (
    <div className="flex gap-4 items-center">
      <div className="whitespace-nowrap">
        <span className="whitespace-nowrap">
        추가개수:
        </span>
        <input
          min={1}
          max={99}
          className={'ml-2 w-16 text-center ' + grayInput}
          type="number"
          value={ctx.samples}
          onChange={(e: any) => {
            try {
              const num = parseInt(e.currentTarget.value) ?? 0;
              setSamples(Math.max(1, Math.min(99, num)));
            } catch (e: any) {
              setSamples(1);
            }
          }}
        />
      </div>
      <div
        onClick={() => {
          if (error !== '') {
            ctx.pushMessage('Error: ' + error);
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
      <button
        className={`${roundButton} bg-gray-500 h-8 px-6`}
        onClick={() => {
          taskQueueService.removeAllTasks();
        }}
      >
        <FaRegCalendarTimes size={18} />
      </button>
      {!taskQueueService.isRunning() ? (
        <button
          className={`${roundButton} bg-green-500 h-8 px-6`}
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
          className={`${roundButton} bg-red-500 h-8 px-6`}
          onClick={() => {
            taskQueueService.stop();
          }}
        >
          <FaStop size={15} />
        </button>
      )}
    </div>
  );
};

export default TaskQueueControl;
