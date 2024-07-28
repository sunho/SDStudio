import React, { useContext, useEffect, useState } from 'react';
import {
  backend,
  imageService,
  isMobile,
  localAIService,
  loginService,
  sessionService,
} from './models';
import {
  Config,
  ImageEditor,
  RemoveBgQuality,
} from '../main/config';
import { AppContext } from './App';

interface ConfigScreenProps {
  onSave: () => void;
}

const ConfigScreen = ({ onSave }: ConfigScreenProps) => {
  const { curSession, pushDialog, pushMessage } = useContext(AppContext)!;
  const [imageEditor, setImageEditor] = useState('');
  const [useGPU, setUseGPU] = useState(false);
  const [whiteMode, setWhiteMode] = useState(false);
  const [noIpCheck, setNoIpCheck] = useState(false);
  const [refreshImage, setRefreshImage] = useState(false);
  const [ready, setReady] = useState(false);
  const [quality, setQuality] = useState('');
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    (async () => {
      const config = await backend.getConfig();
      setWhiteMode(config.whiteMode ?? false);
      setImageEditor(config.imageEditor ?? 'photoshop');
      setUseGPU(config.useCUDA ?? false);
      setQuality(config.removeBgQuality ?? 'normal');
      setNoIpCheck(config.noIpCheck ?? false);
      setRefreshImage(config.refreshImage ?? false);
    })();
    const checkReady = () => {
      setReady(localAIService.ready);
    };
    const onProgress = (e: any) => {
      setProgress(e.detail.percent);
    };
    const onStage = (e: any) => {
      setStage(e.detail.stage);
    };
    checkReady();
    localAIService.addEventListener('updated', checkReady);
    localAIService.addEventListener('progress', onProgress);
    localAIService.addEventListener('stage', onStage);
    return () => {
      localAIService.removeEventListener('updated', checkReady);
      localAIService.removeEventListener('progress', onProgress);
      localAIService.removeEventListener('stage', onStage);
    };
  }, []);

  const roundTag = 'text-white text-xs px-2 py-1 rounded-full';

  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    const onChange = () => {
      setLoggedIn(loginService.loggedIn);
    };
    onChange();
    loginService.addEventListener('change', onChange);
    return () => {
      loginService.removeEventListener('change', onChange);
    };
  }, []);
  const login = () => {
    (async () => {
      try {
        await loginService.login(email, password);
      } catch (err: any) {
        pushMessage('로그인 실패:' + err.message);
      }
    })();
  };

  const clearImageCache = async () => {
    if (!curSession) return;
    pushMessage('이미지 캐시 초기화 시작');
    for (const scene of Object.values(curSession.scenes)) {
      try {
        await backend.deleteDir(
          imageService.getImageDir(curSession, scene) + '/fastcache',
        );
      } catch (e) {}
    }
    imageService.cache.cache.clear();
    await imageService.refreshBatch(curSession);
    pushDialog({
      type: 'yes-only',
      text: '이미지 캐시 초기화 완료',
    });
  };
  const selectFolder = async () => {
    const folder = await backend.selectDir();
    if (!folder) return;
    const config = await backend.getConfig();
    config.saveLocation = folder;
    await backend.setConfig(config);
    pushDialog({
      type: 'yes-only',
      text: '저장 위치 지정 완료. 프로그램을 껏다 켜주세요',
    });
  };
  const stageTexts = [
    '모델 다운로드 중...',
    '모델 가중치 다운로드 중...',
    '모델 압축 푸는 중...',
  ];
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="bg-white dark:bg-slate-800 p-6 rounded shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-4 text-default">환경설정</h1>
        <div className="mb-4">
          <label htmlFor="imageEditor" className="block text-sm gray-label">
            NAI 로그인
          </label>
          <div className="p-1 flex flex-col">
            <div className="flex gap-2 mb-2 w-full overflow-hidden">
              <input
                className={`gray-input block flex-1`}
                type="text"
                placeholder="이메일"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <input
                className={`gray-input block flex-1`}
                type="password"
                placeholder="암호"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="flex items-center">
              <p className="flex items-center gap-1">
                <span className="text-sm gray-label">로그인 상태:</span>{' '}
                {loggedIn ? (
                  <span className={`${roundTag} back-green`}>Yes</span>
                ) : (
                  <span className={`${roundTag} back-red`}>No</span>
                )}
              </p>
              <button
                className={`back-sky py-1 px-2 rounded hover:brightness-95 active:brightness-90 ml-auto`}
                onClick={login}
              >
                로그인
              </button>
            </div>
          </div>
        </div>
        {!isMobile && (
          <>
            {' '}
            <div className="mb-4">
              <label htmlFor="imageEditor" className="block text-sm gray-label">
                선호 이미지 편집기
              </label>
              <select
                id="imageEditor"
                className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                value={imageEditor}
                onChange={(e) => setImageEditor(e.target.value)}
              >
                <option value="photoshop">포토샵</option>
                <option value="gimp">GIMP</option>
                <option value="mspaint">그림판</option>
              </select>
            </div>
            {!ready && (
              <div className="mt-4">
                <button
                  className="w-full back-green py-2 rounded"
                  onClick={() => {
                    if (!localAIService.downloading) localAIService.download();
                  }}
                >
                  {!localAIService.downloading
                    ? '배경 제거 기능 활성화 (배경 제거 모델을 설치)'
                    : stageTexts[stage] + ` (${(progress * 100).toFixed(2)}%)`}
                </button>
              </div>
            )}
            {ready && (
              <>
                <div className="flex gap-2 mt-4">
                  <label
                    htmlFor="imageEditor"
                    className="block text-sm gray-label"
                  >
                    배경 제거 시 GPU 사용{' '}
                    <a
                      onClick={() => {
                        backend.openWebPage(
                          'https://developer.nvidia.com/cuda-11-8-0-download-archive',
                        );
                      }}
                      className="underline text-blue-500 cursor-pointer"
                    >
                      (CUDA를 설치 해야함)
                    </a>
                  </label>
                  <input
                    type="checkbox"
                    checked={useGPU}
                    onChange={(e) => setUseGPU(e.target.checked)}
                  />
                </div>
                <div className="mt-4">
                  <label
                    htmlFor="bgQuality"
                    className="block text-sm gray-label"
                  >
                    배경 제거 퀄리티
                  </label>
                  <select
                    id="bgQuality"
                    className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 sm:text-sm"
                    value={quality}
                    onChange={(e) => setQuality(e.target.value)}
                  >
                    <option value="low">낮음</option>
                    <option value="normal">보통</option>
                    <option value="high">높음</option>
                    <option value="veryhigh">매우높음</option>
                    <option value="veryveryhigh">
                      최고 (메모리 최소 8기가)
                    </option>
                  </select>
                </div>
              </>
            )}
            <button
              className="mt-4 w-full back-green py-2 rounded hover:brightness-95 active:brightness-90"
              onClick={selectFolder}
            >
              이미지 및 데이터 저장 위치 지정
            </button>
          </>
        )}
        <button
          className="mt-4 w-full back-red py-2 rounded hover:brightness-95 active:brightness-90"
          onClick={clearImageCache}
        >
          이미지 캐시 초기화
        </button>
        {isMobile && (
          <div className="mt-4 flex items-center gap-2">
            <label htmlFor="noIpCheck" className="text-sm gray-label">
              IP 체크 끄기
            </label>
            <input
              type="checkbox"
              checked={noIpCheck}
              onChange={(e) => setNoIpCheck(e.target.checked)}
            />
          </div>
        )}
        {
          <div className="mt-4 flex items-center gap-2">
            <label htmlFor="whiteMode" className="text-sm gray-label">
              화이트 모드 켜기
            </label>
            <input
              type="checkbox"
              checked={whiteMode}
              onChange={(e) => setWhiteMode(e.target.checked)}
            />
          </div>
        }
        {!isMobile && (
          <div className="mt-4 flex items-center gap-2">
            <label htmlFor="whiteMode" className="text-sm gray-label">
              이미지 폴더 직접 편집 감지
            </label>
            <input
              type="checkbox"
              checked={refreshImage}
              onChange={(e) => setRefreshImage(e.target.checked)}
            />
          </div>
        )}
        <button
          className="mt-4 w-full back-sky py-2 rounded hover:brightness-95 active:brightness-90"
          onClick={async () => {
            const old = await backend.getConfig();
            const config: Config = {
              imageEditor: imageEditor as ImageEditor,
              useCUDA: useGPU,
              modelType: 'quality',
              removeBgQuality: quality as RemoveBgQuality,
              noIpCheck: noIpCheck,
              refreshImage: refreshImage,
              whiteMode: whiteMode,
            };
            await backend.setConfig(config);
            if (old.useCUDA !== useGPU) localAIService.modelChanged();
            sessionService.configChanged();
            onSave();
          }}
        >
          저장
        </button>
      </div>
    </div>
  );
};

export default ConfigScreen;
