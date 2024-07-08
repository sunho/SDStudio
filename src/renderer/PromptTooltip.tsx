import React, { useEffect, useRef, useState } from 'react';
import { promptService } from './models';

interface Props {
  text: string;
  x: number;
  y: number;
}

const Tooltip = ({ text, x, y }: Props) => {
  const tooltipRef = useRef<any>(null);

  const tooltipStyle: any = {
    position: 'fixed',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    color: 'white',
    pointerEvents: 'none',
    zIndex: 9999,
    left: `${x}px`,
    top: `${y}px`,
  };

  useEffect(() => {
    if (tooltipRef.current) {
      const tooltipRect = tooltipRef.current.getBoundingClientRect();
      const tooltipWidth = tooltipRect.width;
      const tooltipHeight = tooltipRect.height;
      const windowWidth = window.innerWidth;
      const windowHeight = window.innerHeight;

      let adjustedX = x;
      let adjustedY = y;

      // Adjust x coordinate
      if (x + tooltipWidth > windowWidth) {
        adjustedX = windowWidth - tooltipWidth - 10;
      } else if (x < 0) {
        adjustedX = 10;
      }

      // Adjust y coordinate
      if (y + tooltipHeight > windowHeight) {
        adjustedY = windowHeight - tooltipHeight - 10;
      } else if (y < 0) {
        adjustedY = 10;
      }

      tooltipRef.current.style.left = `${adjustedX}px`;
      tooltipRef.current.style.top = `${adjustedY}px`;
    }
  }, [text, x, y]);

  return text ? (
    <div ref={tooltipRef} style={tooltipStyle} className="text-white p-1 w-68 whitespace-pre-wrap max-h-screen">
      {text}
    </div>
  ) : (
    <></>
  );
};

const PromptTooltip = () => {
  const [tooltipData, setTooltipData] = useState({ text: '', x: 0, y: 0 });
  const flagRef = useRef(false);

  useEffect(() => {
    const handleTooltipEvent = (event: any) => {
      const { text, x, y } = event.detail;
      setTooltipData({ text, x, y });
      flagRef.current = true;
      event.stopPropagation();
    };

    const closeTooltip = () => {
      if (flagRef.current) {
        flagRef.current = false;
        return;
      }
      setTooltipData({ text: '', x: 0, y: 0 });
    };

    promptService.addEventListener('prompt-tooltip', handleTooltipEvent);
    window.addEventListener('mousemove', closeTooltip);
    return () => {
      promptService.removeEventListener('prompt-tooltip', handleTooltipEvent);
      window.removeEventListener('mousemove', closeTooltip);
    };
  }, []);

  return <Tooltip {...tooltipData} />;
};

export default PromptTooltip;
