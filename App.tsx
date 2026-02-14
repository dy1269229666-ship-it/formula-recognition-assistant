import React, { useState, useCallback, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { PreviewPanel } from './components/PreviewPanel';
import { ResultPanel } from './components/ResultPanel';
import { StatusFooter } from './components/StatusFooter';
import { SettingsModal } from './components/SettingsModal';
import type { HistoryItem } from './types';
import { recognizeImage, getAvailableModels as fetchAvailableModels } from './services/tauriService';

function getImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

export default function App() {
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try { const s = localStorage.getItem('history'); return s ? JSON.parse(s) : []; }
    catch { return []; }
  });
  const [currentImage, setCurrentImage] = useState<string | null>(null);
  const [resultText, setResultText] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [mode, setMode] = useState<string>('formula');
  const [latency, setLatency] = useState<number | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verified, setVerified] = useState<boolean | null>(null);
  const [corrected, setCorrected] = useState(false);
  const [originalText, setOriginalText] = useState<string | null>(null);
  const [correctedText, setCorrectedText] = useState<string | null>(null);
  const [showingOriginal, setShowingOriginal] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [availableModels, setAvailableModels] = useState<any[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [sfBalance, setSfBalance] = useState<string | undefined>();

  // Persist history to localStorage
  useEffect(() => {
    try { localStorage.setItem('history', JSON.stringify(history)); }
    catch {}
  }, [history]);

  const fetchModels = () => {
    fetchAvailableModels().then(data => {
      const models = (data.models || []).map((m: any) => ({
        ...m,
        freePerDay: m.free_per_day,
        usageToday: m.usage_today,
        chargeBalance: m.charge_balance,
        totalBalance: m.total_balance,
      }));
      setAvailableModels(models);
      if (data.sf_balance) setSfBalance(data.sf_balance);
      if (!selectedModel) {
        const first = models.find((m: any) => m.available && m.modes.includes(mode));
        if (first) setSelectedModel(first.id);
      }
    }).catch(() => {});
  };

  useEffect(() => { fetchModels(); }, []);

  // When mode changes, ensure selected model supports it
  useEffect(() => {
    const current = availableModels.find(m => m.id === selectedModel);
    if (!current || !current.modes.includes(mode) || !current.available) {
      const first = availableModels.find(m => m.available && m.modes.includes(mode));
      if (first) setSelectedModel(first.id);
    }
  }, [mode, availableModels]);

  const resetState = () => {
    setResultText('');
    setLatency(null);
    setModel(null);
    setError(null);
    setVerified(null);
    setCorrected(false);
    setOriginalText(null);
    setCorrectedText(null);
    setShowingOriginal(false);
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCurrentImage(reader.result as string);
        resetState();
      };
      reader.readAsDataURL(file);
      e.target.value = ''; // allow re-selecting same file
    }
  };

  const handleImagePaste = useCallback((dataUrl: string) => {
    setCurrentImage(dataUrl);
    resetState();
  }, []);

  const handleRemoveImage = () => {
    setCurrentImage(null);
    resetState();
  };

  const handleStartRecognition = async () => {
    if (!currentImage) return;

    // Check image dimensions before sending to API (some models require min 28x28)
    const isSimpleTex = selectedModel.startsWith('simpletex:');
    if (!isSimpleTex) {
      try {
        const dims = await getImageDimensions(currentImage);
        if (dims.width < 28 || dims.height < 28) {
          setError(`图片尺寸太小 (${dims.width}×${dims.height})，硅基流动模型要求最小 28×28 像素，请使用更大的图片`);
          return;
        }
      } catch {}
    }

    setIsProcessing(true);
    setError(null);
    const startTime = Date.now();

    try {
      const res = await recognizeImage(currentImage, mode, selectedModel);
      const elapsed = Date.now() - startTime;
      if (!res.text || !res.text.trim()) {
        setError('识别结果为空，可能图片中没有可识别的内容，请换一张图片试试');
        setResultText('');
        setLatency(elapsed);
        setModel(res.model);
        setIsProcessing(false);
        return;
      }
      setResultText(res.text);
      setLatency(elapsed);
      setModel(res.model);
      setVerified(res.verified ?? null);
      setCorrected(res.corrected ?? false);
      setOriginalText(res.originalText ?? null);
      setCorrectedText(res.corrected ? res.text : null);
      setShowingOriginal(false);

      const preview = res.text.trim().substring(0, 30);
      const now = new Date();
      const dateLabel = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`;
      const newItem: HistoryItem = {
        id: Date.now().toString(),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        formula: preview + (preview.length >= 30 ? '...' : ''),
        isFavorite: false,
        dateLabel,
        mode,
      };
      setHistory(prev => [newItem, ...prev]);
      fetchModels(); // refresh usage counts
    } catch (err: any) {
      console.error(err);
      const msg = typeof err === 'string' ? err : (err.message || '识别失败');
      setError(msg);
      setResultText('');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleHistorySelect = (item: HistoryItem) => {
    setResultText(item.formula);
  };

  const handleToggleFavorite = (id: string) => {
    setHistory(prev => prev.map(item =>
      item.id === id ? { ...item, isFavorite: !item.isFavorite } : item
    ));
  };

  const handleDeleteItems = (ids: string[]) => {
    const idSet = new Set(ids);
    setHistory(prev => prev.filter(item => !idSet.has(item.id)));
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen flex items-center justify-center p-4">
      <div className="flex h-[700px] w-full max-w-[960px] shadow-2xl shadow-slate-300/50 dark:shadow-black/30 rounded-2xl overflow-hidden border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900">
        <Sidebar history={history} onSelectItem={handleHistorySelect} onToggleFavorite={handleToggleFavorite} onDeleteItems={handleDeleteItems} />
        <div className="flex-1 flex flex-col bg-white dark:bg-slate-900 relative z-10 min-w-0">
          {/* Header */}
          <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-white dark:bg-slate-900 z-10 shrink-0">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/25">
                <span className="material-icons text-[18px]">functions</span>
              </div>
              <div>
                <h1 className="font-bold text-base text-slate-800 dark:text-white tracking-tight leading-none">公式识别助手</h1>
                <span className="text-xs text-slate-400">AI OCR · 公式识别 · 导出Word</span>
              </div>
            </div>
            <button
              onClick={() => setSettingsOpen(true)}
              className="text-slate-400 hover:text-indigo-500 transition-colors p-1.5 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
              title="AI 设置"
            >
              <span className="material-icons text-[20px]">settings</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto scrollbar-hide flex flex-col">
            <div className="p-4 flex flex-col gap-3 h-full">
              <PreviewPanel
                imageSrc={currentImage}
                isProcessing={isProcessing}
                mode={mode}
                setMode={setMode}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                models={availableModels}
                sfBalance={sfBalance}
                onImageUpload={handleImageUpload}
                onImagePaste={handleImagePaste}
                onRemoveImage={handleRemoveImage}
                onStartRecognition={handleStartRecognition}
              />
              {error && (
                <div className="flex items-center gap-2 bg-red-50 dark:bg-red-950/20 border border-red-200/60 dark:border-red-800/30 text-red-600 dark:text-red-400 text-sm px-3 py-2 rounded-lg">
                  <span className="material-icons text-[16px]">error_outline</span>
                  {error}
                </div>
              )}
              <ResultPanel resultText={resultText} mode={mode} verified={verified} corrected={corrected} originalText={originalText} showingOriginal={showingOriginal}
                onUseOriginal={() => { if (originalText) { setResultText(originalText); setShowingOriginal(true); } }}
                onUseCorrected={() => { if (correctedText) { setResultText(correctedText); setShowingOriginal(false); } }}
              />
            </div>
          </div>
          <StatusFooter latency={latency} model={model} selectedModelId={selectedModel} />
        </div>
      </div>
      <SettingsModal open={settingsOpen} onClose={() => { setSettingsOpen(false); fetchModels(); }} />
    </div>
  );
}
