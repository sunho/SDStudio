import { useContext, useEffect, useState } from 'react';
import { AppContext } from './App';
import { DropdownSelect } from './UtilComponents';

export interface ProgressDialog {
  text: string;
  done: number;
  total: number;
}

interface Props {
  dialog: ProgressDialog;
}

const ProgressWindow = ({ dialog }: Props) => {
  return (
    <div className="fixed flex justify-center w-full confirm-window">
      <div className="flex flex-col justify-between m-4 p-4 rounded-md shadow-xl bg-white dark:bg-slate-800 text-black w-96">
        <div className="break-keep text-center text-default">
          {dialog.text}
        </div>
        <div className="relative w-full h-8 bg-gray-500 dark:bg-slate-700 mt-4 flex justify-center text-white font-medium bg-clip-border">
          <div className="z-10">{dialog.done}/{dialog.total}</div>
          <div className="absolute top-0 left-0 h-8 bg-sky-500 dark:bg-indigo-400" style={{
            width: ((dialog.done/dialog.total)*100).toString() + '%'
          }}></div>
        </div>
      </div>
    </div>
  );
};

export default ProgressWindow;
