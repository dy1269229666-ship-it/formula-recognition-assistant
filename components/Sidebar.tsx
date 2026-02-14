import React, { useState } from 'react';
import type { HistoryItem } from '../types';

interface SidebarProps {
  history: HistoryItem[];
  onSelectItem: (item: HistoryItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteItems: (ids: string[]) => void;
}

type View = 'history' | 'favorites';

function groupByDate(items: HistoryItem[]): { label: string; items: HistoryItem[] }[] {
  const map = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = item.dateLabel || '未知日期';
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(item);
  }
  return Array.from(map.entries()).map(([label, items]) => ({ label, items }));
}

export const Sidebar: React.FC<SidebarProps> = ({ history, onSelectItem, onToggleFavorite, onDeleteItems }) => {
  const [view, setView] = useState<View>('history');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items = view === 'favorites' ? history.filter(i => i.isFavorite) : history;
  const groups = groupByDate(items);

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === items.length) setSelected(new Set());
    else setSelected(new Set(items.map(i => i.id)));
  };

  const handleDelete = () => {
    if (selected.size === 0) return;
    onDeleteItems(Array.from(selected));
    setSelected(new Set());
    setSelectMode(false);
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelected(new Set());
  };

  return (
    <div className="w-60 bg-slate-50/80 dark:bg-slate-950 border-r border-slate-100 dark:border-slate-800 flex flex-col hidden md:flex h-full">
      {/* Nav tabs */}
      <div className="p-3 pb-2">
        <div className="flex gap-1 bg-slate-100/80 dark:bg-slate-900 p-0.5 rounded-lg">
          <button
            onClick={() => { setView('history'); exitSelectMode(); }}
            className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium flex items-center justify-center gap-1 transition-all ${
              view === 'history'
                ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-icons text-[16px]">history</span>
            历史
          </button>
          <button
            onClick={() => { setView('favorites'); exitSelectMode(); }}
            className={`flex-1 py-1.5 px-2 rounded-md text-sm font-medium flex items-center justify-center gap-1 transition-all ${
              view === 'favorites'
                ? 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 shadow-sm'
                : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
            }`}
          >
            <span className="material-icons text-[16px]">bookmark</span>
            收藏
          </button>
        </div>
      </div>

      {/* Batch action bar */}
      {items.length > 0 && (
        <div className="px-3 pb-1 flex items-center justify-between">
          {selectMode ? (
            <>
              <div className="flex items-center gap-1">
                <button
                  onClick={selectAll}
                  className="text-xs px-2 py-0.5 rounded text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-slate-800 transition-colors"
                >
                  {selected.size === items.length ? '取消全选' : '全选'}
                </button>
                <span className="text-xs text-slate-400">已选 {selected.size}</span>
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={handleDelete}
                  disabled={selected.size === 0}
                  className="text-xs p-1 rounded text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors disabled:opacity-30"
                >
                  <span className="material-icons text-[16px]">delete_outline</span>
                </button>
                <button
                  onClick={exitSelectMode}
                  className="text-xs px-1.5 py-0.5 rounded text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                >
                  取消
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={() => setSelectMode(true)}
              className="text-xs px-1.5 py-0.5 rounded text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex items-center gap-0.5"
            >
              <span className="material-icons text-[14px]">checklist</span>
              管理
            </button>
          )}
        </div>
      )}

      {/* Items list */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-3 pb-3 space-y-1">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center text-slate-300 dark:text-slate-600 py-12 gap-2">
            <span className="material-icons text-3xl">{view === 'favorites' ? 'bookmark_border' : 'inbox'}</span>
            <span className="text-xs">{view === 'favorites' ? '还没有收藏' : '还没有记录'}</span>
          </div>
        )}

        {groups.map((group, gi) => (
          <div key={group.label}>
            <div className={`text-xs font-semibold text-slate-400 tracking-wider px-2 py-1.5 ${gi > 0 ? 'mt-3' : 'mt-1'}`}>{group.label}</div>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <HistoryItemRow
                  key={item.id}
                  item={item}
                  selectMode={selectMode}
                  isSelected={selected.has(item.id)}
                  onClick={() => selectMode ? toggleSelect(item.id) : onSelectItem(item)}
                  onStar={() => onToggleFavorite(item.id)}
                  onDelete={() => onDeleteItems([item.id])}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="px-3 py-2.5 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-300 dark:text-slate-600 text-center">
        公式识别助手
      </div>
    </div>
  );
};

const HistoryItemRow: React.FC<{
  item: HistoryItem;
  selectMode: boolean;
  isSelected: boolean;
  onClick: () => void;
  onStar: () => void;
  onDelete: () => void;
}> = ({ item, selectMode, isSelected, onClick, onStar, onDelete }) => (
  <div
    onClick={onClick}
    className={`group px-2.5 py-2 rounded-lg cursor-pointer transition-all ${
      isSelected
        ? 'bg-indigo-50 dark:bg-indigo-950/30'
        : 'hover:bg-white dark:hover:bg-slate-900 hover:shadow-sm'
    }`}
  >
    <div className="flex justify-between items-center mb-0.5">
      <div className="flex items-center gap-1.5">
        {selectMode && (
          <span className={`material-icons text-[15px] ${isSelected ? 'text-indigo-500' : 'text-slate-300'}`}>
            {isSelected ? 'check_box' : 'check_box_outline_blank'}
          </span>
        )}
        <span className="text-xs font-mono text-slate-400">{item.timestamp}</span>
        <span className={`text-[11px] px-1 py-0.5 rounded-md font-medium ${
          item.mode === 'formula'
            ? 'bg-violet-50 text-violet-500 dark:bg-violet-900/20 dark:text-violet-400'
            : item.mode === 'document'
              ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
              : 'bg-sky-50 text-sky-500 dark:bg-sky-900/20 dark:text-sky-400'
        }`}>
          {item.mode === 'formula' ? '公式' : item.mode === 'document' ? '通用' : 'OCR'}
        </span>
      </div>
      {!selectMode && (
        <div className="flex items-center gap-0.5">
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-400 transition-all p-0.5"
          >
            <span className="material-icons text-[13px]">close</span>
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onStar(); }}
            className={`transition-all p-0.5 ${item.isFavorite ? 'text-amber-400 opacity-100' : 'opacity-0 group-hover:opacity-100 text-slate-300 hover:text-amber-400'}`}
          >
            <span className="material-icons text-[13px]">{item.isFavorite ? 'star' : 'star_border'}</span>
          </button>
        </div>
      )}
    </div>
    <div className="text-xs text-slate-600 dark:text-slate-400 font-mono truncate pl-0.5">
      {item.formula}
    </div>
  </div>
);
