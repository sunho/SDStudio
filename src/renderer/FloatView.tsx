import React, { createContext, useContext, useState, useEffect, ReactNode, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';

interface FloatView {
  id: number;
  component: ReactNode;
  priority: number;
  showToolbar?: boolean;
  onEscape?: () => void;
}

interface FloatViewContextProps {
  registerView: (view: FloatView) => void;
  unregisterView: (id: number) => void;
}

const FloatViewContext = createContext<FloatViewContextProps | undefined>(undefined);

export const useFloatView = (): FloatViewContextProps => {
  const context = useContext(FloatViewContext);
  if (!context) {
    throw new Error('useFloatView must be used within a FloatViewProvider');
  }
  return context;
};

interface FloatViewProviderProps {
  children: ReactNode;
}

export const FloatViewProvider: React.FC<FloatViewProviderProps> = ({ children }) => {
  const [views, setViews] = useState<FloatView[]>([]);

  const registerView = (view: FloatView) => {
    setViews((prevViews) => [...prevViews, view].sort((a, b) => b.priority - a.priority));
  };

  const unregisterView = (id: number) => {
    setViews((prevViews) => prevViews.filter((view) => view.id !== id));
  };

  const closeTopView = () => {
    const topView = views[views.length-1];
    if (topView && topView.onEscape) {
      topView.onEscape();
    }
  };

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && views.length > 0) {
      closeTopView();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('keydown', handleEscape);
    };
  }, [views]);

  return (
    <FloatViewContext.Provider value={{ registerView, unregisterView }}>
      {children}
      {!!views.length && <div className={"top-0 absolute w-full z-10 float-view " + (views[views.length-1].showToolbar ? 'show-toolbar' : 'h-full')}>
      {views.map((view) => (
        <div key={view.id} className="bg-white h-full w-full" style={{ position: 'absolute', zIndex: view.priority }}>
        <div className="flex flex-col h-full w-full">
            <div className="flex-none border-b border-gray-300">
              <button className="button" onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  closeTopView();
                }}>
                <FaTimes size={20} />
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              {view.component}
            </div>
          </div>
        </div>
      ))}
      </div>}
    </FloatViewContext.Provider>
  );
};

    {/* <div className={className ?? 'floating-component'}> */}
    {/*   <div className="content flex flex-col"> */}
    {/*     <div className="flex-none"> */}
    {/*       <button className="button" onClick={onClose}> */}
    {/*         <FaTimes size={20} /> */}
    {/*       </button> */}
    {/*     </div> */}
    {/*     <div className="w-full flex-1 flex flex-col overflow-hidden"> */}
    {/*       {children} */}
    {/*     </div> */}
    {/*   </div> */}
    {/* </div> */}
    {/**/}
    {/**/}
interface FloatViewProps {
  children: ReactNode;
  priority: number;
  showToolbar?: boolean;
  onEscape?: () => void;
}

let viewId = 0;

export const FloatView: React.FC<FloatViewProps> = ({ children, priority, showToolbar, onEscape }) => {
  const { registerView, unregisterView } = useFloatView();
  const id = useRef(++viewId);

  useEffect(() => {
    const view = { id: id.current, component: children, priority, onEscape, showToolbar };
    registerView(view);
    return () => unregisterView(id.current);
  }, [children, priority, onEscape, registerView, unregisterView]);

  return null;
};


