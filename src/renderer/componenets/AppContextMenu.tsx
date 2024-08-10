import { observer } from 'mobx-react-lite';
import { getSnapshot } from 'mobx-state-tree';
import { Item, Menu } from 'react-contexify';
import { sessionService, backend, imageService, isMobile } from '../models';
import { appState } from '../models/AppService';
import { dataUriToBase64, deleteImageFiles } from '../models/ImageService';
import { createImageWithText, embedJSONInPNG } from '../models/SessionService';
import {
  SceneContextAlt,
  ImageContextAlt,
  StyleContextAlt,
  ContextMenuType,
  genericSceneFromJSON,
  GallaryImageContextAlt,
} from '../models/types';
import { oneTimeFlowMap, oneTimeFlows } from '../models/workflows/OneTimeFlows';
import { extractPromptDataFromBase64 } from '../models/util';

export const AppContextMenu = observer(() => {
  const duplicateScene = async (ctx: SceneContextAlt) => {
    const newScene = genericSceneFromJSON(ctx.scene.toJSON());
    let cnt = 0;
    const newName = () =>
      newScene.name + '_copy' + (cnt === 0 ? '' : cnt.toString());
    while (appState.curSession!.hasScene(newScene.type, newName())) {
      cnt++;
    }
    newScene.name = newName();
    appState.curSession!.addScene(newScene);
  };
  const moveSceneFront = (ctx: SceneContextAlt) => {
    const curSession = appState.curSession;
    curSession!.moveScene(ctx.scene, 0);
  };
  const moveSceneBack = (ctx: SceneContextAlt) => {
    const curSession = appState.curSession;
    curSession!.moveScene(ctx.scene, curSession!.scenes.size - 1);
  };
  const handleSceneItemClick = ({ id, props }: any) => {
    const ctx = props.ctx as SceneContextAlt;
    if (id === 'duplicate') {
      duplicateScene(ctx);
    } else if (id === 'move-front') {
      moveSceneFront(ctx);
    } else if (id === 'move-back') {
      moveSceneBack(ctx);
    } else if (id === 'delete') {
      appState.pushDialog({
        type: 'confirm',
        text: '정말로 삭제하시겠습니까?',
        callback: () => {
          appState.curSession!.removeScene(ctx.scene.type, ctx.scene.name);
        },
      });
    }
  };
  const duplicateImage = async (ctx: GallaryImageContextAlt) => {
    if (!ctx.scene) return;
    for (const path of ctx.path) {
      const tmp = path.slice(0, path.lastIndexOf('/'));
      await backend.copyFile(
        path,
        tmp + '/' + Date.now().toString() + '.png',
      );
    }
    imageService.refresh(appState.curSession!, ctx.scene);
    appState.pushDialog({
      type: 'yes-only',
      text: '이미지를 복제했습니다',
    });
  };
  const copyImage = (ctx: GallaryImageContextAlt) => {
    appState.pushDialog({
      type: 'dropdown',
      text: '이미지를 어디에 복사할까요?',
      items: Array.from(appState.curSession!.scenes.keys()).map((key) => ({
        text: key,
        value: key,
      })),
      callback: async (value) => {
        if (!value) return;

        const scene = appState.curSession!.scenes.get(value);
        if (!scene) {
          return;
        }

        for (const path of ctx.path) {
          await backend.copyFile(
            path,
            imageService.getImageDir(appState.curSession!, scene) +
              '/' +
              Date.now().toString() +
              '.png',
          );
        }
        imageService.refresh(appState.curSession!, scene);
        appState.pushDialog({
          type: 'yes-only',
          text: '이미지를 복사했습니다',
        });
      },
    });
  };
  const clipboardImage = async (ctx: GallaryImageContextAlt) => {
    await backend.copyImageToClipboard(ctx.path[0]);
  };
  const favImage = (ctx: GallaryImageContextAlt) => {
    if (!ctx.scene) return;
    for (const path_ of ctx.path) {
      const path = path_.split('/').pop()!;
      if (ctx.scene.mains.includes(path)) {
        ctx.scene.mains.splice(ctx.scene.mains.indexOf(path), 1);
      } else {
        ctx.scene.mains.push(path);
      }
    }
  };
  const deleteImg = async (ctx: GallaryImageContextAlt) => {
    appState.pushDialog({
      type: 'confirm',
      text: '정말로 삭제하시겠습니까?',
      callback: async () => {
        await deleteImageFiles(appState.curSession!, ctx.path, ctx.scene);
      }
    });
  };
  const transformImage = async (ctx: GallaryImageContextAlt) => {
    const items = oneTimeFlows.map(x => ({
      text: x.text,
      value: x.text
    }));
    const menu = await appState.pushDialogAsync({
      text: '이미지 변형 방법을 선택하세요',
      type: 'select',
      items: items,
    });
    if (!menu) return;
    for (const p of ctx.path) {
      let image = await imageService.fetchImage(p);
      image = dataUriToBase64(image!);
      const job = await extractPromptDataFromBase64(image);
      oneTimeFlowMap.get(menu)!.handler(appState.curSession!, ctx.scene!, image, undefined, job);
    }
  };
  const handleImageItemClick = ({ id, props }: any) => {
    const ctx2: GallaryImageContextAlt = {
      ...props.ctx,
      type: 'gallary_image',
      path: [props.ctx.path],
    };
    if (id === 'duplicate') {
      duplicateImage(ctx2);
    } else if (id === 'copy') {
      copyImage(ctx2);
    } else if (id === 'clipboard') {
      clipboardImage(ctx2);
    } else if (id === 'fav') {
      favImage(ctx2);
    } else if (id === 'delete') {
      deleteImg(ctx2);
    }
  };
  const handleImageItemClick2 = ({ id, props }: any) => {
    if (id === 'duplicate') {
      duplicateImage(props.ctx);
    } else if (id === 'copy') {
      copyImage(props.ctx);
    } else if (id === 'clipboard') {
      clipboardImage(props.ctx);
    } else if (id === 'fav') {
      favImage(props.ctx);
    } else if (id === 'delete') {
      deleteImg(props.ctx);
    } else if (id === 'transform') {
      transformImage(props.ctx);
    }
  };
  const exportStyle = async (ctx: StyleContextAlt) => {
    await appState.exportPreset(appState.curSession!, ctx.preset);
  };
  const deleteStyle = async (ctx: StyleContextAlt) => {
    appState.pushDialog({
      type: 'confirm',
      text: '정말로 삭제하시겠습니까?',
      callback: async () => {
        const curSession = appState.curSession;
        const presets = appState.curSession!.presets.get(ctx.preset.type)!;
        if (presets.length === 1) {
          appState.pushMessage('그림체는 최소 한 개 이상이어야 합니다');
          return;
        }
        curSession!.removePreset(ctx.preset.type, ctx.preset.name);
      },
    });
  };
  const editStyle = async (ctx: StyleContextAlt) => {
    sessionService.styleEdit(ctx.preset, ctx.container);
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
        <Item id="delete" onClick={handleSceneItemClick}>
          해당 씬 삭제
        </Item>
      </Menu>
      <Menu id={ContextMenuType.GallaryImage}>
        <Item id="fav" onClick={handleImageItemClick2}>
          즐겨찾기 토글
        </Item>
        <Item id="transform" onClick={handleImageItemClick2}>
          이미지 변형
        </Item>
        <Item id="delete" onClick={handleImageItemClick2}>
          해당 이미지 삭제
        </Item>
        <Item id="duplicate" onClick={handleImageItemClick2}>
          해당 이미지 복제
        </Item>
        <Item id="copy" onClick={handleImageItemClick2}>
          다른 씬으로 이미지 복사
        </Item>
        {!isMobile && (
          <Item id="clipboard" onClick={handleImageItemClick2}>
            클립보드로 이미지 복사
          </Item>
        )}
      </Menu>
      <Menu id={ContextMenuType.Image}>
        <Item id="fav" onClick={handleImageItemClick}>
          즐겨찾기 토글
        </Item>
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
});
