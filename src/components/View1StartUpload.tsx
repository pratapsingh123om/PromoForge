import React, { useRef, useState } from "react";
import {
  Upload,
  Sparkles,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Settings,
  FolderOpen,
  ArrowRight,
  Info,
  Layers,
  Sliders,
} from "lucide-react";
import {
  parseScreenplayText,
  ScreenplayParseError,
  type ParseFailure,
  type ParsedEpisode,
} from "../services/screenplayEngine";
import { DEMO_MODEL_OPTIONS, PRODUCT_NAME } from "../config";
import {
  SAMPLE_EPISODE_1,
  SAMPLE_EPISODE_2,
  SAMPLE_SHOW_NAME,
} from "../data/sampleScreenplay";
import {
  MAX_BATCH_BYTES,
  MAX_UPLOAD_FILES,
  folderNameFromRelativePath,
  extractZipScreenplays,
  readUtf8ScreenplayFile,
} from "../services/uploadValidation";

export interface ModelSettings {
  provider: "fallback" | "gemini" | "openai" | "no-api";
  modelName: string;
  baseUrl: string;
  temperature: number;
  maxTokens: number;
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
  onRun: (context: { language: string; targetAudience: string }) => void;
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
  const [parseFailures, setParseFailures] = useState<ParseFailure[]>([]);
  const [language, setLanguage] = useState("en");
  const [targetAudience, setTargetAudience] = useState("");
  const [showAdvancedSettings, setShowAdvancedSettings] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [parseProgress, setParseProgress] = useState({ completed: 0, total: 0 });
  const parseRunRef = useRef(0);
  const titleEditedThisSessionRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);

  const processFiles = async (files: FileList | File[]) => {
    const sourceFiles = Array.from(files);
    const failures: ParseFailure[] = [];
    const selectedFiles: File[] = [];
    let archiveTitle = "";

    if (sourceFiles.reduce((total, file) => total + file.size, 0) > MAX_BATCH_BYTES) {
      setParsedEpisodes([]);
      setParseFailures([{
        source_name: "Selected batch",
        message: "Compressed upload exceeds the 50 MB limit. Split it into smaller batches.",
        line_number: null,
      }]);
      showToast({ message: "Upload batch exceeds the 50 MB limit.", type: "warning" });
      return;
    }

    for (const file of sourceFiles) {
      if (file.name.toLowerCase().endsWith(".txt")) {
        selectedFiles.push(file);
        continue;
      }
      if (file.name.toLowerCase().endsWith(".zip")) {
        try {
          const entries = extractZipScreenplays(new Uint8Array(await file.arrayBuffer()));
          if (entries.length === 0) {
            failures.push({ source_name: file.name, message: "ZIP contains no .txt screenplay files.", line_number: null });
            continue;
          }
          archiveTitle ||= file.name.replace(/\.zip$/i, "").trim();
          entries.forEach((entry) => {
            selectedFiles.push(new File([entry.bytes.buffer as ArrayBuffer], entry.name, { type: "text/plain" }));
          });
        } catch {
          failures.push({ source_name: file.name, message: "ZIP could not be opened. Upload a valid archive containing UTF-8 .txt episodes.", line_number: null });
        }
        continue;
      }
      failures.push({
        source_name: file.name,
        message: "Unsupported file type. Select UTF-8 .txt screenplays or one .zip series archive.",
        line_number: null,
      });
    }

    if (selectedFiles.length > MAX_UPLOAD_FILES) {
      setParsedEpisodes([]);
      setParseFailures([{
        source_name: "Selected batch",
        message: `Batch contains ${selectedFiles.length} files; the stated limit is ${MAX_UPLOAD_FILES}. Split the folder into smaller batches.`,
        line_number: null,
      }]);
      showToast({ message: `Upload limit is ${MAX_UPLOAD_FILES} files per batch.`, type: "warning" });
      return;
    }
    const batchBytes = selectedFiles.reduce((total, file) => total + file.size, 0);
    if (batchBytes > MAX_BATCH_BYTES) {
      setParsedEpisodes([]);
      setParseFailures([{
        source_name: "Selected batch",
        message: `Batch exceeds the 50 MB limit (${(batchBytes / 1024 / 1024).toFixed(1)} MB). Split it into smaller batches.`,
        line_number: null,
      }]);
      showToast({ message: "Upload batch exceeds the 50 MB limit.", type: "warning" });
      return;
    }
    const runId = ++parseRunRef.current;
    setIsParsing(true);
    setParseProgress({ completed: 0, total: selectedFiles.length });
    const txtFiles = selectedFiles;
    setParseProgress({ completed: 0, total: selectedFiles.length });
    if (txtFiles.length === 0) {
      setParsedEpisodes([]);
      setParseFailures(failures);
      showToast({
        message: "No valid .txt screenplay files detected.",
        type: "warning",
      });
      setIsParsing(false);
      return;
    }

    const newEpisodes: ParsedEpisode[] = [];
    const episodeSources = new Map<string, string>();
    for (const file of txtFiles) {
      if (parseRunRef.current !== runId) return;
      try {
        const text = await readUtf8ScreenplayFile(file);
        const ep = parseScreenplayText(text, file.name, language);
        const duplicateSource = episodeSources.get(ep.episode_id);
        if (duplicateSource) {
          failures.push({
            source_name: file.name,
            message: `Duplicate ${ep.episode_id}; already parsed from ${duplicateSource}.`,
            line_number: null,
          });
          continue;
        }
        episodeSources.set(ep.episode_id, file.name);
        newEpisodes.push(ep);
      } catch (err) {
        failures.push({
          source_name: file.name,
          message: err instanceof Error ? err.message : String(err),
          line_number: err instanceof ScreenplayParseError ? err.lineNumber : null,
        });
      }
      setParseProgress((previous) => ({ ...previous, completed: previous.completed + 1 }));
      // Yield long enough for progress and cancellation controls to remain operable on large folders.
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    if (parseRunRef.current !== runId) return;

    newEpisodes.sort((a, b) => a.episode_number - b.episode_number);
    setParsedEpisodes(newEpisodes);
    setParseFailures(failures);
    if (txtFiles.length) {
      const folderTitle = archiveTitle || folderNameFromRelativePath(txtFiles[0].webkitRelativePath);
      if (folderTitle) {
        setShowTitle(folderTitle);
        titleEditedThisSessionRef.current = false;
      } else if (!titleEditedThisSessionRef.current) {
        // Never carry a previous run's title into a new loose-file upload.
        setShowTitle("");
      }
    }
    showToast({
      message: `${newEpisodes.length} file${newEpisodes.length === 1 ? "" : "s"} parsed; ${failures.length} failed. Review every row before running.`,
      type: failures.length ? "warning" : "success",
    });
    setIsParsing(false);
  };

  const cancelParsing = () => {
    parseRunRef.current += 1;
    setIsParsing(false);
    setParseProgress({ completed: 0, total: 0 });
    setParsedEpisodes([]);
    setParseFailures([{ source_name: "Upload", message: "Upload parsing was cancelled. You can select files again.", line_number: null }]);
    showToast({ message: "Upload parsing cancelled; the uploader is ready again.", type: "info" });
  };

  const loadSample = () => {
    const ep1 = parseScreenplayText(SAMPLE_EPISODE_1, "SAMPLE_EP_001.txt", "en");
    const ep2 = parseScreenplayText(SAMPLE_EPISODE_2, "SAMPLE_EP_002.txt", "en");
    setParsedEpisodes([ep1, ep2]);
    setParseFailures([]);
    setLanguage("en");
    setShowTitle(SAMPLE_SHOW_NAME);
    titleEditedThisSessionRef.current = false;
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
              Start here
            </div>
            <h1 className="text-xl font-bold text-white tracking-tight">
              Upload a series. Get its best promos.
            </h1>
            <p className="text-sm text-neutral-300 mt-1 max-w-2xl leading-relaxed">
              Choose a folder of episode scripts. {PRODUCT_NAME} checks every file, ranks the strongest clips,
              and keeps the finished series in your Library.
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

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {["1  Upload episodes", "2  Run discovery", "3  Review & export"].map((step, index) => (
          <div key={step} className={`rounded-lg border px-3 py-2 text-xs font-semibold ${index === 0 ? "border-amber-500/40 bg-amber-500/10 text-amber-300" : "border-neutral-800 bg-neutral-900 text-neutral-500"}`}>{step}</div>
        ))}
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
              Drop a series folder, ZIP, or screenplay files here
            </h3>
            <p className="text-xs text-neutral-400 mt-1 max-w-md">
              Supports standard timestamped format with <code className="text-amber-300">SCENE</code> headings,
              dialogue blocks, and <code className="text-amber-300">Start: (mm:ss.ff) | End: (mm:ss.ff)</code>.
            </p>
            <p className="mt-2 text-[11px] text-neutral-500">
              UTF-8 `.txt` or `.zip` · max 5 MB per screenplay · max 100 episodes / 50 MB unpacked
            </p>

            <div className="flex items-center gap-3 mt-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".txt,.zip"
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
            {isParsing && (
              <div className="mt-4 flex items-center gap-3 text-xs text-amber-300">
                <span>Parsing {parseProgress.completed} / {parseProgress.total} files…</span>
                <button type="button" onClick={cancelParsing} className="rounded border border-amber-500/40 px-2 py-1 hover:bg-amber-500/10">Cancel upload</button>
              </div>
            )}
          </div>
        </div>

        {/* Configuration Panel (1 col) */}
        <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-4">
          <div className="flex items-center gap-2 text-sm font-semibold text-white border-b border-neutral-800 pb-2">
            <Sliders size={16} className="text-amber-400" />
            <span>Series setup</span>
          </div>

          <div>
            <label className="block text-xs font-medium text-neutral-400 mb-1">
              Show / Series Title
            </label>
            <input
              type="text"
              value={showTitle}
              onChange={(e) => {
                titleEditedThisSessionRef.current = true;
                setShowTitle(e.target.value);
              }}
              placeholder="e.g. Glass Hearts"
              className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="button"
            onClick={() => setShowAdvancedSettings((value) => !value)}
            className="flex w-full items-center justify-between rounded-lg border border-neutral-700 bg-neutral-950 px-3 py-2 text-xs font-medium text-neutral-300 hover:border-neutral-600"
          >
            <span>Scoring & advanced settings</span>
            <span className="text-neutral-500">{showAdvancedSettings ? "Hide" : `${modelSettings.provider === "fallback" ? "Rule-only" : modelSettings.provider} · Change`}</span>
          </button>

          {showAdvancedSettings && (<>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Language</label>
              <select
                value={language}
                onChange={(event) => {
                  setLanguage(event.target.value);
                  setParsedEpisodes([]);
                  setParseFailures([]);
                }}
                className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white focus:outline-none focus:border-amber-500"
              >
                <option value="en">English</option>
                <option value="hi">Hindi</option>
                <option value="id">Indonesian</option>
                <option value="other">Other</option>
              </select>
              {language !== "en" && (
                <p className="mt-1 text-[10px] leading-relaxed text-amber-300">
                  English-only fragment and alias heuristics are disabled; timing and boundary checks still run.
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-neutral-400 mb-1">Target Audience <span className="text-neutral-600">(optional)</span></label>
              <input
                type="text"
                value={targetAudience}
                onChange={(event) => setTargetAudience(event.target.value)}
                placeholder="e.g. romance viewers"
                className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white placeholder-neutral-500 focus:outline-none focus:border-amber-500"
              />
            </div>
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
              onChange={(e) => {
                const provider = e.target.value as ModelSettings["provider"];
                const defaultModel = DEMO_MODEL_OPTIONS.find((option) => option.value === provider)?.defaultModel || "rule-based";
                setModelSettings({
                  ...modelSettings,
                  provider,
                  modelName: defaultModel,
                });
              }}
              className="w-full px-3 py-1.5 text-sm rounded-md bg-neutral-950 border border-neutral-700 text-white focus:outline-none focus:border-amber-500 cursor-pointer"
            >
              {DEMO_MODEL_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>

          {modelSettings.provider === "gemini" && (
            <div className="space-y-3 pt-2">
              <div>
                <label className="block text-xs font-medium text-neutral-400 mb-1">Gemini model</label>
                <input
                  type="text"
                  value={modelSettings.modelName}
                  onChange={(e) => setModelSettings({ ...modelSettings, modelName: e.target.value })}
                  placeholder="gemini-3.1-flash-lite"
                  className="w-full px-3 py-1.5 text-xs rounded-md bg-neutral-950 border border-neutral-700 text-white"
                />
                <p className="mt-1 text-[11px] text-emerald-300">
                  Credentials are supplied only by the backend environment. This browser never accepts, stores, or transmits an API key field.
                </p>
              </div>
            </div>
          )}

          {modelSettings.provider !== "fallback" && (
            <div className="p-2.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-[11px] text-blue-300 flex items-start gap-2">
              <Info size={13} className="shrink-0 mt-0.5" />
              <span>
                {modelSettings.provider === "no-api"
                  ? "The pipeline will generate a copyable scoring prompt, pause, validate your pasted JSON, and then continue."
                  : "Model output is schema-validated and retried once. A failure is shown explicitly; rule scores are never substituted silently."}
              </span>
            </div>
          )}
          </>)}

          <div className="pt-2">
            {parsedEpisodes.length > 1 ? (
              <div className="mb-2 p-2.5 rounded-lg bg-purple-950/40 border border-purple-500/30 text-[11px] text-purple-200">
                <div className="font-semibold text-purple-300 flex items-center gap-1.5">
                  <Sparkles size={12} className="text-purple-400" />
                  Series Mode Active ({parsedEpisodes.length} Episodes)
                </div>
                <div className="text-neutral-400 mt-0.5">
                  Generates 4–5 cuts per episode with rules (~{parsedEpisodes.length * 5} candidates), resolves series character aliases, scores top 70 with model, and outputs a quality-thresholded global campaign ranking with per-episode drill-down.
                </div>
              </div>
            ) : parsedEpisodes.length === 1 ? (
              <div className="mb-2 p-2.5 rounded-lg bg-blue-950/40 border border-blue-500/30 text-[11px] text-blue-200">
                <div className="font-semibold text-blue-300">
                  Episode Mode Active (Single Episode)
                </div>
                <div className="text-neutral-400 mt-0.5">
                  Ranks top 3 promo cuts within this episode.
                </div>
              </div>
            ) : null}
            <button
              type="button"
              disabled={
                parsedEpisodes.length === 0 || !modelSettings.modelName
              }
              onClick={() => onRun({ language, targetAudience })}
              className={`w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-semibold text-sm transition-all shadow-lg ${
                parsedEpisodes.length > 0 && modelSettings.modelName
                  ? "bg-amber-500 hover:bg-amber-400 text-neutral-950 shadow-amber-500/20 active:scale-98 cursor-pointer"
                  : "bg-neutral-800 text-neutral-500 cursor-not-allowed"
              }`}
            >
              <span>
                {modelSettings.provider === "no-api"
                  ? `Generate Prompt (${parsedEpisodes.length} eps)`
                  : parsedEpisodes.length > 1
                    ? `Run Series Discovery (${parsedEpisodes.length} eps)`
                    : `Run Discovery Pipeline (${parsedEpisodes.length} ep)`}
              </span>
              <ArrowRight size={16} />
            </button>
            {parsedEpisodes.length === 0 && (
              <p className="mt-1.5 text-center text-[10px] text-neutral-500">Add at least one valid UTF-8 screenplay before running.</p>
            )}
          </div>
        </div>
      </div>

      {/* Parse Summary Table (DEMO.md Section 4: must show before running) */}
      {(parsedEpisodes.length > 0 || parseFailures.length > 0) && (
      <div className="p-5 rounded-xl bg-neutral-900 border border-neutral-800 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers size={18} className="text-amber-400" />
            <h3 className="text-base font-semibold text-white">Parse Summary Table</h3>
            <span className="text-xs px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-300 border border-neutral-700">
              {parsedEpisodes.length} valid · {parseFailures.length} failed
            </span>
            {parsedEpisodes.length > 0 && (
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold border ${
                  parsedEpisodes.length > 1
                    ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                    : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                }`}
              >
                {parsedEpisodes.length > 1
                  ? `Series Mode: ${parsedEpisodes.length} Episodes`
                  : "Episode Mode: 1 Episode"}
              </span>
            )}
          </div>
          {(parsedEpisodes.length > 0 || parseFailures.length > 0) && (
            <button
              type="button"
              onClick={() => { setParsedEpisodes([]); setParseFailures([]); }}
              className="text-xs text-neutral-400 hover:text-red-400 transition-colors cursor-pointer"
            >
              Clear All
            </button>
          )}
        </div>

        {parsedEpisodes.length === 0 && parseFailures.length === 0 ? (
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
                      <span className="block">{ep.last_timestamp}</span>
                      <span className="block text-[10px] text-neutral-500">declared end {ep.declared_end_timestamp}</span>
                    </td>
                    <td className="py-2.5 px-3 font-sans">
                      {!ep.alias_analysis_available ? (
                        <span className="text-neutral-500 text-[11px]">Not measured for {ep.language}</span>
                      ) : ep.unresolved_aliases.length === 0 ? (
                        <span className="text-emerald-400 inline-flex items-center gap-1 text-[11px]">
                          <CheckCircle2 size={12} /> None detected
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
                {parseFailures.map((failure) => (
                  <tr key={`failed-${failure.source_name}`} className="bg-red-500/5">
                    <td className="py-2.5 px-3"><b className="block text-red-300">Not parsed</b><span className="text-[10px] text-neutral-500">{failure.source_name}</span></td>
                    <td className="py-2.5 px-3 text-neutral-600">—</td>
                    <td className="py-2.5 px-3 text-neutral-600">—</td>
                    <td className="py-2.5 px-3 text-neutral-600">Not measured</td>
                    <td className="py-2.5 px-3 font-sans text-red-300" colSpan={1}>{failure.line_number ? `Line ${failure.line_number}: ` : ""}{failure.message}</td>
                    <td className="py-2.5 px-3 font-sans"><span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-red-500/10 text-red-400 border border-red-500/20 text-[11px]"><AlertTriangle size={12} /> Failed</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      )}
    </div>
  );
}
