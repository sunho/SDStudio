import { observer } from 'mobx-react-lite';
import { getSnapshot } from 'mobx-state-tree';
import { Item, Menu } from 'react-contexify';
import { sessionService, backend, imageService, isMobile } from '../models';
import { appState } from '../models/AppService';
import { dataUriToBase64 } from '../models/ImageService';
import { createImageWithText, embedJSONInPNG } from '../models/SessionService';
import {
  SceneContextAlt,
  ImageContextAlt,
  StyleContextAlt,
  ContextMenuType,
  genericSceneFromJSON,
} from '../models/types';

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
    }
  };
  const duplicateImage = async (ctx: ImageContextAlt) => {
    const tmp = ctx.path.slice(0, ctx.path.lastIndexOf('/'));
    const dir = tmp.split('/').pop()!;
    const parDir = tmp.slice(0, tmp.lastIndexOf('/')) as any;
    const field = parDir.startsWith('outs') ? 'scenes' : 'inpaints';
    const scene = (appState.curSession! as any)[field].get(dir);
    if (!scene) {
      return;
    }
    await backend.copyFile(
      ctx.path,
      tmp + '/' + Date.now().toString() + '.png',
    );
    imageService.refresh(appState.curSession!, scene);
    appState.pushDialog({
      type: 'yes-only',
      text: '이미지를 복제했습니다',
    });
  };
  const copyImage = (ctx: ImageContextAlt) => {
    appState.pushDialog({
      type: 'dropdown',
      text: '이미지를 어디에 복사할까요?',
      items: Object.keys(appState.curSession!.scenes).map((key) => ({
        text: key,
        value: key,
      })),
      callback: async (value) => {
        if (!value) return;

        const scene = appState.curSession!.scenes.get(value);
        if (!scene) {
          return;
        }

        await backend.copyFile(
          ctx.path,
          imageService.getImageDir(appState.curSession!, scene) +
            '/' +
            Date.now().toString() +
            '.png',
        );
        imageService.refresh(appState.curSession!, scene);
        appState.pushDialog({
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
});
