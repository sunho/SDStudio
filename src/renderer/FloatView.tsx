import React, { createContext, useContext, useState, memo, useEffect, ReactNode, useRef } from 'react';
import { FaTimes } from 'react-icons/fa';
import { App as CapacitorApp } from '@capacitor/app';
import { isMobile } from './models';

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
    setViews((prevViews) => [...prevViews, view].sort((a, b) => b.id - a.id));
  };

  const unregisterView = (id: number) => {
    setViews((prevViews) => prevViews.filter((view) => view.id !== id));
  };

  const closeTopView = () => {
    const topView = views[0];
    if (topView && topView.onEscape) {
      topView.onEscape();
    }
  };

  const handleEscape = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && views.length > 0) {
      closeTopView();
    }
  };

  const handleBackButton = (e: any) => {
    if (views.length > 0) {
      closeTopView();
    } else {
      CapacitorApp.minimizeApp();
    }
  };

  useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    if (isMobile)
      CapacitorApp.addListener('backButton', handleBackButton);
    return () => {
      document.removeEventListener('keydown', handleEscape);
      if (isMobile)
        CapacitorApp.removeAllListeners();
    };
  }, [views]);

  return (
    <FloatViewContext.Provider value={{ registerView, unregisterView }}>
      {children}
      {!!views.length && <div className={"top-0 absolute w-full z-10 float-view " + (views[0].showToolbar ? 'show-toolbar' : 'h-full')}>
      {views.map((view) => (
        <div key={view.id} className="bg-white h-full w-full" style={{ position: 'absolute', zIndex: view.id }}>
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

interface FloatViewProps {
  children: ReactNode;
  priority: number;
  showToolbar?: boolean;
  onEscape?: () => void;
}

let viewId = 0;

export const FloatView: React.FC<FloatViewProps> = memo(({ children, priority, showToolbar, onEscape }) => {
  const { registerView, unregisterView } = useFloatView();
  const id = useRef(++viewId);

  useEffect(() => {
    const view = { id: id.current, component: children, priority, onEscape, showToolbar };
    registerView(view);
    return () => unregisterView(id.current);
  }, []);

  return null;
});


