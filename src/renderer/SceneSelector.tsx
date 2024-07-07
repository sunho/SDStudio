import React, { useEffect, useState } from 'react';
import { GenericScene, Scene } from './models';
import { FaObjectGroup } from 'react-icons/fa';
import { roundButton } from './styles';

interface SceneSelectorProps {
  text: string;
  scenes: Scene[];
  getImage: (scene: GenericScene) => Promise<string|null>;
  onConfirm: (selectedScenes: Scene[]) => void;
}

const SceneImage: React.FC<{ scene: GenericScene, getImage: (scene: GenericScene) => Promise<string|null> }> = ({ scene, getImage }) => {
  const [image, setImage] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const uri = await getImage(scene);
        setImage(uri!);
      } catch (e) {}
    })();
  }, []);

  return (
    <div className="w-20 h-20 flex items-center justify-center">
      {image && <img className="bg-checkboard w-auto h-auto max-w-20 max-h-20" src={image} alt={scene.name} />}
    </div>
  );
}

const SceneSelector: React.FC<SceneSelectorProps> = ({ scenes, text, getImage, onConfirm }) => {
  const [selectedScenes, setSelectedScenes] = useState<Scene[]>([]);

  const toggleSceneSelection = (scene: Scene) => {
    const isSelected = selectedScenes.some(selected => selected.name === scene.name);
    const newSelectedScenes = isSelected
      ? selectedScenes.filter(selected => selected.name !== scene.name)
      : [...selectedScenes, scene];

    setSelectedScenes(newSelectedScenes);
  };

  const selectAllScenes = () => {
    setSelectedScenes(scenes);
  };

  const clearAllSelections = () => {
    setSelectedScenes([]);
  };

  return (
    <div className="p-4 flex flex-col h-full">
      <div className="flex items-center gap-2 text-gray-700 flex-none">
        <FaObjectGroup size={25}/>
        <div className="text-xl "> 씬을 선택하고 해당 작업을 적용합니다: <span className="font-bold text-black">{text}</span></div>
      </div>
      <div className="px-1 pt-3 flex flex-col flex-1 overflow-hidden">
        <div className="gap-2 flex flex-none overflow-hidden">
          <button className={`${roundButton} bg-sky-500`} onClick={selectAllScenes}>모두 선택</button>
          <button className={`${roundButton} bg-gray-500`} onClick={clearAllSelections}>모두 선택 해제</button>
        </div>
        <div className="flex-1 overflow-hidden pt-4 pb-2">
          <div className="flex flex-wrap h-full overflow-auto gap-2">
            {scenes.map(scene => (
              <div className={"hover:brightness-95 active:brightness-90 cursor-pointer p-2 border border-gray-400 flex flex-col items-center " + (selectedScenes.some(selected => selected.name === scene.name) ? "border-sky-500 bg-sky-200":"bg-white")}
              onClick={()=>toggleSceneSelection(scene)}
               key={scene.name}>
                <div><SceneImage getImage={getImage} scene={scene}></SceneImage></div>
                <div className="h-12 w-28 overflow-auto break-all">
                  {scene.name}
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex-none flex">
          <button className={`${roundButton} bg-green-500 ml-auto`} onClick={() => onConfirm(selectedScenes)}>작업 적용</button>
        </div>
      </div>
    </div>
  );
};

export default SceneSelector;
