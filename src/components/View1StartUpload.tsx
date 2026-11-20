import React, { useRef, useState } from "react";
import {
  Upload,
  Sparkles,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Settings,
  Key,
  FolderOpen,
  ArrowRight,
  Info,
  Layers,
  Sliders,
} from "lucide-react";
import {
  parseScreenplayText,
  type ParsedEpisode,
} from "../services/screenplayEngine";
import {
  SAMPLE_EPISODE_1,
  SAMPLE_EPISODE_2,
  SAMPLE_SHOW_NAME,
} from "../data/sampleScreenplay";

export interface ModelSettings {
  provider: "fallback" | "gemini" | "openai" | "no-api";
  modelName: string;
  baseUrl: string;
  apiKey: string;
  temperature: number;
}

interface View1Props {
  parsedEpisodes: ParsedEpisode[];
  setParsedEpisodes: (eps: ParsedEpisode[]) => void;
  showTitle: string;
  setShowTitle: (t: string) => void;
  minDuration: number;
  setMinDuration: (d: number) => void;
  maxDuration: number;
  setMaxDuration: (d: number) => void;
  modelSettings: ModelSettings;
  setModelSettings: (s: ModelSettings) => void;
  onRun: () => void;
  showToast: (toast: { message: string; type: "success" | "warning" | "info" }) => void;
}

export function View1StartUpload({
  parsedEpisodes,
  setParsedEpisodes,
  showTitle,
  setShowTitle,
  minDuration,
  setMinDuration,
  maxDuration,
  setMaxDuration,
  modelSettings,
  setModelSettings,
  onRun,
  showToast,
}: View1Props) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const txtFiles = Array.from(files).filter(
      (f) => f.name.endsWith(".txt") || f.type.includes("text")
    );
    if (txtFiles.length === 0) {
      showToast({
        message: "No valid .txt screenplay files detected.",
        type: "warning",
      });
      return;
    }

    const newEpisodes: ParsedEpisode[] = [];
    for (const file of txtFiles) {
      try {
        const text = await file.text();
        const ep = parseScreenplayText(text, file.name);
        newEpisodes.push(ep);
      } catch (err) {
        showToast({
          message: `Failed to parse ${file.name}: ${err instanceof Error ? err.message : String(err)}`,
          type: "warning",
        });
      }
    }

    if (newEpisodes.length > 0) {
      newEpisodes.sort((a, b) => a.episode_number - b.episode_number);
      setParsedEpisodes(newEpisodes);
      if (!showTitle) {
        setShowTitle("Uploaded Microdrama");
      }
      showToast({
        message: `Successfully parsed ${newEpisodes.length} episode(s). Review parse summary below.`,
        type: "success",
      });
    }
  };

  const loadSample = () => {
    const ep1 = parseScreenplayText(SAMPLE_EPISODE_1, "SAMPLE_EP_001.txt");
    const ep2 = parseScreenplayText(SAMPLE_EPISODE_2, "SAMPLE_EP_002.txt");
    setParsedEpisodes([ep1, ep2]);
    setShowTitle(SAMPLE_SHOW_NAME);
    showToast({
      message: `Loaded invented sample series: "${SAMPLE_SHOW_NAME}" (2 episodes).`,
      type: "success",
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      void processFiles(e.dataTransfer.files);
    }
  };

  return (
    <div className="space-y-6">
      {/* Banner */}
      <div className="p-5 rounded-xl bg-gradient-to-r from-amber-500/10 via-purple-500/10 to-indigo-500/10 border border-amber-500/20">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 mb-2">
              <Sparkles size={12} />
              View 1: Screenplay Ingestion & Parse Verification
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Upload Screenplays & Verify Line Timestamps
            </h1>
            <p className="text-sm text-neutral-300 mt-1 max-w-2xl leading-relaxed">
              Drop timestamped microdrama episode scripts. PromoForge parses block timings, 
              canonicalizes speaker aliases from continuity notes, and verifies complete runtime 
              boundaries before candidate generation.
            </p>
          </div>
          <button
            type="button"
            onClick={loadSample}
            className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-md hover:shadow-indigo-500/20 active:scale-95 cursor-pointer"
          >
            <Sparkles size={16} />
            Load Invented Sample
          </button>
        </div>
      </div>

      {/* Grid: Dropzone & Settings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Drop Zone (2 cols) */}
        <div className="lg:col-span-2 space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all flex flex-col items-center justify-center min-h-[220px] ${
              isDragging
                ? "border-amber-400 bg-amber-500/10 scale-[1.01]"
                : "border-neutral-700 bg-neutral-900/60 hover:border-neutral-500"
            }`}
          >
            <div className="p-3.5 rounded-full bg-neutral-800 border border-neutral-700 text-amber-400 mb-3">
              <Upload size={28} />
            </div>
            <h3 className="text-base font-semibold text-white">
              Drop screenplay .txt files or folder here
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-md">
              Supports standard timestamped format with <code className="text-amber-300">SCENE</code> headings,
              dialogue blocks, and <code className="text-amber-300">Start: (mm:ss.ff) | End: (mm:ss.ff)</code>.
            </p>

            <div className="flex items-center gap-3 mt-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt"
                className="hidden"
                onChange={(e) => e.target.files && void processFiles(e.target.files)}
              />
              <input
                ref={folderInputRef}
                type="file"
                // @ts-expect-error webkitdirectory attribute is standard in browsers
                webkitdirectory=""
                directory=""
                className="hidden"
                onChange={(e) => e.target.files && void processFiles(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-xs font-medium text-white transition-colors cursor-pointer"
              >
                Select Files
              </button>
              <button
                type="button"
                onClick={() => folderInputRef.current?.click()}
                className="px-3.5 py-1.5 rounded-md bg-neutral-800 hover:bg-neutral-700 border border-neutral-600 text-xs font-medium text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <FolderOpen size={14} />
                Select Folder
              </button>
            </div>
          </div>
        </div>

        {/* Configuration Panel (1 col) */}
        <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white border-b border-neutral-800 pb-2">
            <Sliders size={16} className="text-amber-400" />
            <span>Run Parameters</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Show / Series Title
            </label>
            <input
              type="text"
              value={showTitle}
              onChange={(e) => setShowTitle(e.target.value)}
              placeholder="e.g. Glass Hearts"
              className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Min Length (s)
              </label>
              <input
                type="number"
                min={20}
                max={maxDuration - 1}
                value={minDuration}
                onChange={(e) => setMinDuration(Math.max(20, parseInt(e.target.value, 10) || 20))}
                className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">
                Max Length (s)
              </label>
              <input
                type="number"
                min={minDuration + 1}
                max={60}
                value={maxDuration}
                onChange={(e) => setMaxDuration(Math.min(60, parseInt(e.target.value, 10) || 60))}
                className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white focus:outline-none focus:border-amber-500"
              />
            </div>
          </div>

          <div className="border-t border-neutral-800 pt-3">
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Model & Scoring Engine
            </label>
            <select
              value={modelSettings.provider}
              onChange={(e) =>
                setModelSettings({
                  ...modelSettings,
                  provider: e.target.value as ModelSettings["provider"],
                })
              }
              className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              <option value="fallback">Rule-based scoring (lower quality, offline)</option>
              <option value="gemini">Google Gemini (Free tier)</option>
              <option value="openai">OpenAI-Compatible Endpoint</option>
              <option value="no-api">No-API Manual JSON Paste Mode</option>
            </select>
          </div>

          {modelSettings.provider !== "fallback" && modelSettings.provider !== "no-api" && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1 flex items-center gap-1">
                  <Key size={12} className="text-amber-400" /> API Key (In-Memory Only)
                </label>
                <input
                  type="password"
                  value={modelSettings.apiKey}
                  onChange={(e) =>
                    setModelSettings({ ...modelSettings, apiKey: e.target.value })
                  }
                  placeholder="Enter API key for session"
                  className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-600 focus:outline-none focus:border-amber-500 font-mono text-xs"
                />
                <p className="text-[11px] text-neutral-500 mt-0.5">
                  Stored strictly in browser RAM; never persisted to disk or sent to logs.
                </p>
              </div>

              {modelSettings.provider === "openai" && (
                <div>
                  <label className="block text-xs font-medium text-neutral-400 mb-1">
                    Base URL & Model
                  </label>
                  <input
                    type="text"
                    value={modelSettings.baseUrl}
                    onChange={(e) =>
                      setModelSettings({ ...modelSettings, baseUrl: e.target.value })
                    }
                    placeholder="https://api.openai.com/v1"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-neutral-950 border border-neutral-700 text-white mb-2"
                  />
                  <input
                    type="text"
                    value={modelSettings.modelName}
                    onChange={(e) =>
                      setModelSettings({ ...modelSettings, modelName: e.target.value })
                    }
                    placeholder="gpt-4o-mini"
                    className="w-full px-3 py-1.5 text-xs rounded-md bg-neutral-950 border border-neutral-700 text-white"
                  />
                </div>
              )}
            </div>
          )}

          <div className="pt-2">
            <button
              type="button"
              disabled={parsedEpisodes.length === 0}
              onClick={onRun}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all shadow-lg ${
                parsedEpisodes.length > 0
                  ? "bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-amber-500/20 active:scale-98 cursor-pointer"
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              }`}
            >
              <span>Run Discovery Pipeline ({parsedEpisodes.length} eps)</span>
              <ArrowRight size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Parse Summary Table (DEMO.md Section 4: must show before running) */}
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-amber-400" />
            <h3 className="text-base font-semibold text-white">Parse Summary Table</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
              {parsedEpisodes.length} episode(s) parsed
            </span>
          </div>
          {parsedEpisodes.length > 0 && (
            <button
              type="button"
              onClick={() => setParsedEpisodes([])}
              className="text-xs text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        {parsedEpisodes.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500 border border-dashed border-neutral-800 rounded-lg">
            No screenplays parsed yet. Drop files or click "Load Invented Sample" above.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-neutral-800">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-neutral-950 text-neutral-400 border-b border-neutral-800 uppercase font-semibold text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Episode</th>
                  <th className="py-2.5 px-3">Events Parsed</th>
                  <th className="py-2.5 px-3">Last Timestamp</th>
                  <th className="py-2.5 px-3">Unresolved Aliases</th>
                  <th className="py-2.5 px-3">Warnings</th>
                  <th className="py-2.5 px-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 font-mono">
                {parsedEpisodes.map((ep) => (
                  <tr key={ep.episode_id} className="hover:bg-neutral-800/40 transition-colors">
                    <td className="py-2.5 px-3 font-semibold text-white flex items-center gap-1.5">
                      <FileText size={14} className="text-amber-400" />
                      {ep.episode_id}
                    </td>
                    <td className="py-2.5 px-3 text-neutral-200">
                      {ep.events.length} events
                    </td>
                    <td className="py-2.5 px-3 text-amber-300">
                      {ep.last_timestamp}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {ep.unresolved_aliases.length === 0 ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1 text-[11px]">
                          <CheckCircle2 size={12} /> Resolved
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20 text-[11px]">
                          {ep.unresolved_aliases.join(", ")}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {ep.warnings.length === 0 ? (
                        <span className="text-neutral-500 text-[11px]">0 warnings</span>
                      ) : (
                        <span className="text-amber-400 text-[11px]">
                          {ep.warnings.length} warning(s)
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[11px]">
                        <CheckCircle2 size={12} /> Ready
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
