import React, { ReactNode, forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import Select from 'react-select';
import { primaryColor, roundButton } from './styles';
import { FaAddressBook, FaAmilia, FaDAndD, FaFileUpload, FaPenNib, FaTimes } from 'react-icons/fa';
import { Scrollbars } from 'react-custom-scrollbars-2';
import { FaAnchor, FaOpencart, FaPerson } from 'react-icons/fa6';
import { FloatView } from './FloatView';

export interface Option<T> {
  value: T;
  label: string;
}

interface DropdownSelectProps<T> {
  selectedOption: T | undefined;
  options: Option<T>[];
  className?: string;
  menuPlacement?: 'top' | 'bottom';
  onSelect: (option: Option<T>) => void;
  disabled?: boolean;
}

export const DropdownSelect = <T,>({
  className,
  menuPlacement,
  selectedOption,
  options,
  disabled,
  onSelect,
}: DropdownSelectProps<T>) => {
  const handleChange = (selected: Option<T> | null) => {
    if (selected) {
      onSelect(selected);
    }
  };

  return (
    <Select
      value={options.find((option) => option.value === selectedOption)}
      options={options}
      onChange={handleChange}
      menuPlacement={menuPlacement}
      isDisabled={disabled}
      className={"w-full " + (className ?? '')}
      theme={(theme) => ({
        ...theme,
        borderRadius: 0,
        colors: {
          ...theme.colors,
          primary: 'black',
        },
      })}
    />
  );
};

export const FileUploadBase64: React.FC<{
  onFileSelect: (file: string) => void;
  disabled?: boolean;
  notext?: boolean;
}> = ({ onFileSelect, disabled, notext }) => {
  const [dragging, setDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const fileInputRef = useRef<any>(null);

  const handleDragEnter = (e: any) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e: any) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e: any) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDrop = (e: any) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      setFile(file);
      convertFileToBase64(file);
    }
  };

  const handleFileChange = (e: any) => {
    const file = e.target.files[0];
    if (file) {
      setFile(file);
      convertFileToBase64(file);
    }
  };

  const handleClick = () => {
    if (disabled) return;
    fileInputRef.current.click();
  };

  const convertFileToBase64 = (file: any) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = reader.result as string;
      onFileSelect(base64String.split(',')[1]);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={handleClick}
      className="cursor-pointer w-full h-8 text-gray-700 overflow-hidden rounded-full flex items-center justify-center"
      style={{
        backgroundColor: dragging ? '#0ea5e9' : '#e5e7eb',
      }}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        className="hidden"
      />
      <p className="whitespace-nowrap">{(file && !notext) ? file.name : <FaFileUpload />}</p>
    </div>
  );
};

interface TabProps {
  label: string;
  content: React.ReactNode;
  banToggle?: boolean;
  emoji: React.ReactNode
  onClick?: () => void;
}

interface TabComponentProps {
  tabs: TabProps[];
  toggleView?: React.ReactNode;
  className?: string;
  left?: boolean;
}

export const TabComponent: React.FC<TabComponentProps> = ({ left, tabs, toggleView }) => {
  const [activeTab, setActiveTab] = useState(0);
  const [toggleViewOpen, setToggleViewOpen] = useState(false);

  const handleTabClick = (index: number) => {
    tabs[index].onClick?.();
    setActiveTab(index);
  };

  return (
    <div className="h-full flex flex-col px-1 md:p-2">
      <div
        className={
          'flex p-1 md:p-0 md:py-2 flex-none gap-2 items-center w-full mb-1 md:mb-0'
        }
      >
        <div className="md:flex gap-1 w-full hidden">
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={
                'active:brightness-90 hover:brightness-95 select-none h-8 px-1 md:px-2 text-xs md:text-sm ' +
                (index === activeTab
                  ? `${primaryColor} text-white`
                  : 'bg-gray-400 text-white')
              }
              onClick={() => handleTabClick(index)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        <div className="flex md:hidden gap-1 w-full">
          {!tabs[activeTab].banToggle && toggleView && <button className='active:brightness-90 hover:brightness-95 select-none h-8 md:hidden text-sm text-white bg-sky-500 px-2 flex justify-center items-center mr-auto'
            onClick={() => setToggleViewOpen(!toggleViewOpen)}
            >
            {toggleViewOpen?'프롬프트 닫기':'프롬프트 열기'}
          </button>}
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={
                'active:brightness-90 hover:brightness-95 select-none px-2 text-sm h-8 ' +
                (index === activeTab
                  ? `${primaryColor} text-white`
                  : 'bg-gray-400 text-white')
              }
              onClick={() => handleTabClick(index)}
            >
              {tab.emoji}
            </button>
          ))}
        </div>
      </div>
      <div className="flex-1 overflow-hidden relative">
        {!tabs[activeTab].banToggle && toggleViewOpen && <FloatView priority={0} onEscape={()=>setToggleViewOpen(false)}>
          {toggleView}
        </FloatView>}
        {tabs.map((tab, index) => (
          <div
            key={index}
            className="h-full overflow-auto"
            style={{ display: index === activeTab ? 'block' : 'none' }}
          >
            {tab.content}
          </div>
        ))}
      </div>
    </div>
  );
};

export const NumberSelect: React.FC<{
  n: number;
  selectedNumber: number;
  onChange: (num: number) => void;
}> = ({ n, selectedNumber, onChange }) => {
  const handleChange = (event: any) => {
    onChange(Number(event.target.value));
  };

  return (
    <select value={selectedNumber} onChange={handleChange}>
      {Array.from({ length: n }, (_, i) => (
        <option key={i} value={i}>
          prompt set {i}
        </option>
      ))}
    </select>
  );
};

export const Collapsible = ({ title, children } : { title: string, children: ReactNode }) => {
  const [isOpen, setIsOpen] = useState(true);

  const toggleCollapse = () => {
    setIsOpen(!isOpen);
  };

  return (
    <div>
      <button onClick={toggleCollapse} className="button">
        {title}
      </button>
      <div style={{ display: isOpen ? 'block' : 'none', padding: '10px' }}>
        {children}
      </div>
    </div>
  );
};

export const TextAreaWithUndo = ({ value, onChange } : { value: string, onChange: (value: string) => void }) => {
  const textAreaRef = useRef<any>(null);
  useEffect(() => {
    if (value !== textAreaRef.current.value) {
      textAreaRef.current.value = value;
    }
  }, [value]);
  const handleChange = (e:any) => {
    const newValue = e.target.value;
    onChange(newValue);
  };
  return (
    <textarea
      className="clear-textarea h-full w-full bg-gray-200 p-2"
      ref={textAreaRef}
      onChange={handleChange}
    />
  );
};

export const CustomScrollbars = ({ onScroll, forwardedRef, style, children }: any) => {
  const refSetter = useCallback((scrollbarsRef:any) => {
    if (scrollbarsRef) {
      forwardedRef(scrollbarsRef.view);
    } else {
      forwardedRef(null);
    }
  }, []);

  return (
    <Scrollbars
      ref={refSetter}
      style={{ ...style, overflow: "hidden" }}
      onScroll={onScroll}
    >
      {children}
    </Scrollbars>
  );
};
