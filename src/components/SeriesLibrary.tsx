import React from "react";
import { BookOpen, Film, FolderPlus, Play, Clock3 } from "lucide-react";
import type { SeriesLibraryEntry } from "../services/seriesLibrary";

interface SeriesLibraryProps {
  entries: SeriesLibraryEntry[];
  onOpen: (entry: SeriesLibraryEntry) => void;
  onNewSeries: () => void;
}

export function SeriesLibrary({ entries, onOpen, onNewSeries }: SeriesLibraryProps) {
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">
        <div>
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
            <BookOpen size={15} /> Series library
          </div>
          <h1 className="text-2xl font-bold text-white">Your promo runs</h1>
          <p className="mt-1 max-w-2xl text-sm text-neutral-400">
            Open any completed series to review all ranked promos and episode drill-downs. Runs stay in this browser tab only.
          </p>
        </div>
        <button type="button" onClick={onNewSeries} className="flex items-center gap-2 rounded-lg bg-amber-500 px-4 py-2.5 text-sm font-semibold text-neutral-950 hover:bg-amber-400">
          <FolderPlus size={16} /> Add another series
        </button>
      </div>

      {entries.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-neutral-700 bg-neutral-900/50 p-12 text-center">
          <Film className="mx-auto text-neutral-600" size={34} />
          <h2 className="mt-3 font-semibold text-white">No completed series yet</h2>
          <p className="mt-1 text-sm text-neutral-500">Upload a folder, run discovery, and the complete ranked list will appear here.</p>
          <button type="button" onClick={onNewSeries} className="mt-5 rounded-lg border border-amber-500/40 px-4 py-2 text-sm font-semibold text-amber-300 hover:bg-amber-500/10">Upload your first series</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {entries.map((entry) => (
            <article key={entry.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5 transition-colors hover:border-neutral-700">
              <div className="flex items-start justify-between gap-3">
                <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2.5 text-amber-400"><Film size={20} /></div>
                <span className="rounded-full border border-neutral-700 bg-neutral-950 px-2.5 py-1 text-[10px] font-semibold uppercase text-neutral-400">{entry.run_record.status.replace(/_/g, " ")}</span>
              </div>
              <h2 className="mt-4 truncate text-lg font-bold text-white">{entry.title || "Unnamed series"}</h2>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-neutral-950 p-3"><span className="block text-neutral-500">Episodes</span><b className="mt-1 block text-lg text-white">{entry.episodes.length}</b></div>
                <div className="rounded-lg bg-neutral-950 p-3"><span className="block text-neutral-500">Ranked promos</span><b className="mt-1 block text-lg text-amber-300">{entry.promos.length}</b></div>
              </div>
              <div className="mt-3 flex items-center gap-1.5 text-[11px] text-neutral-500"><Clock3 size={12} /> {new Date(entry.saved_at).toLocaleString()}</div>
              <button type="button" onClick={() => onOpen(entry)} className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700"><Play size={14} /> Open ranked promos</button>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
