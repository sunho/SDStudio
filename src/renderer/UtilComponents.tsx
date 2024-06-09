import { ReactNode, forwardRef, useCallback, useEffect, useRef, useState } from 'react';

import Select from 'react-select';
import { primaryColor, roundButton } from './styles';
import { FaFileUpload, FaTimes } from 'react-icons/fa';
import { Scrollbars } from 'react-custom-scrollbars-2';

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
      className="w-full"
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
  const fileInputRef = useRef(null);

  const handleDragEnter = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDragLeave = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(false);
  };

  const handleDragOver = (e) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();
    setDragging(true);
  };

  const handleDrop = (e) => {
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

  const handleFileChange = (e) => {
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

  const convertFileToBase64 = (file) => {
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
  onClick?: () => void;
}

interface TabComponentProps {
  tabs: TabProps[];
  className?: string;
  left?: boolean;
}

export const TabComponent: React.FC<TabComponentProps> = ({ left, tabs }) => {
  const [activeTab, setActiveTab] = useState(0);

  const handleTabClick = (index: number) => {
    tabs[index].onClick?.();
    setActiveTab(index);
  };

  return (
    <div className="h-full flex flex-col p-2">
      <div
        className={
          'flex p-2 flex-none gap-2 items-center ' + (!left ? 'ml-auto' : '')
        }
      >
        <b>탭: </b>
        <div className="flex gap-1">
          {tabs.map((tab, index) => (
            <button
              key={index}
              className={
                'active:brightness-90 hover:brightness-95 select-none p-2 ' +
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
      </div>
      <div className="flex-1 overflow-hidden">
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

export const Collapsible = ({ title, children }) => {
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

export const TextAreaWithUndo = ({ value, onChange }) => {
  const textAreaRef = useRef<any>(null);
  useEffect(() => {
    if (value !== textAreaRef.current.value) {
      textAreaRef.current.value = value;
    }
  }, [value]);
  const handleChange = (e) => {
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
  const refSetter = useCallback(scrollbarsRef => {
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
