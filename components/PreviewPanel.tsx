import React, { useRef, useEffect } from 'react';

interface ModelOption {
  id: string;
  name: string;
  provider: string;
  modes: string[];
  available: boolean;
  freePerDay?: number;
  usageToday?: number;
  chargeBalance?: string;
  totalBalance?: string;
  pricing?: string;
  free?: boolean;
  voucher?: boolean;
}

interface PreviewPanelProps {
  imageSrc: string | null;
  isProcessing: boolean;
  mode: string;
  setMode: (mode: string) => void;
  selectedModel: string;
  setSelectedModel: (id: string) => void;
  models: ModelOption[];
  sfBalance?: string;
  onImageUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onImagePaste: (dataUrl: string) => void;
  onRemoveImage: () => void;
  onStartRecognition: () => void;
}

export const PreviewPanel: React.FC<PreviewPanelProps> = ({
  imageSrc, isProcessing, mode, setMode, selectedModel, setSelectedModel,
  models, sfBalance, onImageUpload, onImagePaste, onRemoveImage, onStartRecognition
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const file = item.getAsFile();
          if (!file) continue;
          const reader = new FileReader();
          reader.onloadend = () => onImagePaste(reader.result as string);
          reader.readAsDataURL(file);
          return;
        }
      }
    };
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [onImagePaste]);

  const modes = [
    { id: 'formula', label: '公式识别', icon: 'functions' },
    { id: 'ocr', label: '文字OCR', icon: 'text_fields', beta: true },
    { id: 'document', label: '通用识别', icon: 'article', beta: true },
  ];

  const filteredModels = models.filter((m: ModelOption) => m.modes.includes(mode) && m.available);
  const providers = [...new Set(filteredModels.map((m: ModelOption) => m.provider))];
  const currentModel = models.find((m: ModelOption) => m.id === selectedModel);

  let quotaInfo = '';
  if (currentModel) {
    if (currentModel.provider === 'SimpleTex' && currentModel.freePerDay) {
      quotaInfo = `今日: ${currentModel.usageToday ?? 0}/${currentModel.freePerDay} 次`;
    } else if (currentModel.provider === '硅基流动') {
      const parts: string[] = [];
      if (sfBalance !== undefined) parts.push(`余额: ¥${sfBalance}`);
      if (currentModel.voucher) parts.push('可用券');
      if (currentModel.pricing) parts.push(currentModel.pricing);
      quotaInfo = parts.join(' · ');
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Mode + Model row */}
      <div className="flex items-center gap-2">
        {/* Mode Switcher - compact pill */}
        <div className="bg-slate-100 dark:bg-slate-800 p-0.5 rounded-lg flex text-sm font-medium shrink-0">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => setMode(m.id)}
              className={`py-1.5 px-3 rounded-md transition-all flex items-center gap-1 ${
                mode === m.id
                  ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
              }`}
            >
              <span className="material-icons text-[15px]">{m.icon}</span>
              {m.label}
              {m.id === 'document' && <span className="text-[10px] px-1 py-0 rounded bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400 ml-0.5 leading-tight">ST</span>}
              {m.beta && <span className="text-[10px] px-1 py-0 rounded bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-400 ml-0.5 leading-tight">测试</span>}
            </button>
          ))}
        </div>

        {/* Model Selector */}
        <div className="flex-1 min-w-0">
          <select
            value={filteredModels.some((m: ModelOption) => m.id === selectedModel) ? selectedModel : ''}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedModel(e.target.value)}
            className="w-full px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-600 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-300 cursor-pointer transition-all"
          >
            {filteredModels.length === 0 && (
              <option value="" disabled>请先在设置中配置 API</option>
            )}
            {providers.map((provider: string) => (
              <optgroup key={provider} label={provider}>
                {filteredModels.filter((m: ModelOption) => m.provider === provider).map((m: ModelOption) => {
                  let suffix = '';
                  if (m.provider === 'SimpleTex' && m.freePerDay) {
                    suffix = ` [${m.usageToday ?? 0}/${m.freePerDay}]`;
                  } else if (m.free) {
                    suffix = m.voucher ? ' [免费·券]' : ' [免费]';
                  } else if (m.voucher) {
                    suffix = m.pricing ? ` [${m.pricing}·券]` : ' [券]';
                  } else if (m.pricing) {
                    suffix = ` [${m.pricing}]`;
                  }
                  return <option key={m.id} value={m.id}>{m.name}{suffix}</option>;
                })}
              </optgroup>
            ))}
          </select>
        </div>
      </div>

      {/* Quota info */}
      {quotaInfo && (
        <div className="flex items-center gap-1.5 text-xs text-slate-400 -mt-1 ml-1">
          <span className="material-icons text-[13px]">info_outline</span>
          <span>{quotaInfo}</span>
        </div>
      )}

      {/* Mode description tips */}
      {mode === 'ocr' && (
        <div className="flex gap-2 bg-sky-50/80 dark:bg-sky-950/20 border border-sky-200/50 dark:border-sky-800/30 rounded-lg px-3 py-2 -mt-1">
          <span className="material-icons text-[15px] text-sky-500 mt-0.5 shrink-0">text_fields</span>
          <div className="text-xs text-sky-700 dark:text-sky-400 leading-relaxed">
            <span className="font-medium">文字OCR</span> · 识别图片中的文字内容，返回纯文本。适合截图、文档、证件等场景。不同模型返回格式可能不同，建议多试几个模型对比效果。
          </div>
        </div>
      )}
      {mode === 'document' && (
        <div className="flex gap-2 bg-amber-50/80 dark:bg-amber-950/20 border border-amber-200/50 dark:border-amber-800/30 rounded-lg px-3 py-2 -mt-1">
          <span className="material-icons text-[15px] text-amber-500 mt-0.5 shrink-0">auto_awesome</span>
          <div className="text-xs text-amber-700 dark:text-amber-400 leading-relaxed">
            <span className="font-medium">通用识别</span> · 仅 SimpleTex 可用 · 支持 80+ 语言文字、公式、表格、混合排版、双栏论文、手写体。返回 Markdown 格式（公式用 $ 包裹），每日免费 50 次。
          </div>
        </div>
      )}

      {/* Image Upload Area */}
      <div className="relative w-full bg-gradient-to-b from-slate-50 to-white dark:from-slate-800/50 dark:to-slate-900 rounded-xl overflow-hidden border border-slate-200/80 dark:border-slate-700/50 group transition-all hover:border-indigo-300/60 hover:shadow-md hover:shadow-indigo-500/5">
        {imageSrc ? (
          <>
            <div className="absolute top-2 right-2 z-20">
              <button
                onClick={() => { onRemoveImage(); if (fileInputRef.current) fileInputRef.current.value = ''; }}
                className="bg-white/90 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full p-1 shadow-md backdrop-blur-sm transition-all cursor-pointer"
              >
                <span className="material-icons text-[14px]">close</span>
              </button>
            </div>
            <div className="relative w-full h-44 flex items-center justify-center bg-white/50 dark:bg-slate-800/50 cursor-pointer">
              <input
                type="file"
                ref={fileInputRef}
                onChange={onImageUpload}
                accept="image/*"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                style={{ zIndex: 10 }}
              />
              <img src={imageSrc} alt="Preview" className="object-contain max-h-40 max-w-full pointer-events-none" />
            </div>
          </>
        ) : (
          <div className="relative w-full h-44 flex flex-col items-center justify-center text-slate-400 gap-2 cursor-pointer hover:text-indigo-400 transition-colors">
            <input
              type="file"
              ref={fileInputRef}
              onChange={onImageUpload}
              accept="image/*"
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              style={{ zIndex: 10 }}
            />
            <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center mb-1">
              <span className="material-icons text-2xl text-slate-300 dark:text-slate-600">add_photo_alternate</span>
            </div>
            <span className="text-sm font-medium">点击上传图片 或 Ctrl+V 粘贴截图</span>
            <span className="text-xs text-slate-300 dark:text-slate-600">支持 PNG / JPG / WebP</span>
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}
              className="mt-1 px-4 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white text-sm rounded-lg shadow transition-colors"
              style={{ position: 'relative', zIndex: 20 }}
            >
              选择文件
            </button>
          </div>
        )}
      </div>

      {/* Action Button - more compact */}
      <button
        onClick={onStartRecognition}
        disabled={!imageSrc || isProcessing}
        className={`w-full py-2.5 rounded-xl font-medium text-base flex items-center justify-center gap-2 transition-all
          ${!imageSrc || isProcessing
            ? 'bg-slate-100 dark:bg-slate-800 cursor-not-allowed text-slate-400 dark:text-slate-600'
            : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 active:scale-[0.99] text-white shadow-lg shadow-indigo-500/20'
          }`}
      >
        {isProcessing ? (
          <span className="material-icons text-[18px] animate-spin">refresh</span>
        ) : (
          <span className="material-icons text-[18px]">bolt</span>
        )}
        {isProcessing ? '识别中...' : '开始识别'}
      </button>
    </div>
  );
};
