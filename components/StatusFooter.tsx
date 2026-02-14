import React from 'react';

interface StatusFooterProps {
  latency: number | null;
  model: string | null;
  selectedModelId: string;
}

export const StatusFooter: React.FC<StatusFooterProps> = ({ latency, model, selectedModelId }) => {
  const service = selectedModelId.startsWith('simpletex:') ? 'SimpleTex'
    : selectedModelId.startsWith('siliconflow:') ? '硅基流动'
    : model?.includes('SimpleTex') ? 'SimpleTex'
    : model ? '硅基流动' : '-';

  return (
    <div className="px-4 py-1.5 bg-slate-50/80 dark:bg-slate-950/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-400">
      <div className="flex items-center gap-3">
        <span className="flex items-center gap-1">
          <span className="material-icons text-[13px]">cloud</span>
          {service}
        </span>
        {model && (
          <span className="flex items-center gap-1 text-slate-300 dark:text-slate-600">
            <span className="material-icons text-[13px]">smart_toy</span>
            {model}
          </span>
        )}
      </div>
      <div className="flex items-center gap-3">
        {latency && (
          <span className="flex items-center gap-1">
            <span className="material-icons text-[13px]">timer</span>
            {latency}ms
          </span>
        )}
        <span className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          就绪
        </span>
      </div>
    </div>
  );
};
