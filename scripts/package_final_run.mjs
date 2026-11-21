import fs from "node:fs";
import path from "node:path";
import { zipSync } from "fflate";

const repoRoot = process.cwd();
const exportsDir = path.join(repoRoot, "exports");
const outputsDir = path.join(repoRoot, "outputs");

if (!fs.existsSync(outputsDir)) {
  fs.mkdirSync(outputsDir, { recursive: true });
}

function collectFiles(dir, base = "") {
  const result = {};
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, item.name);
    const relPath = base ? `${base}/${item.name}` : item.name;
    if (item.isDirectory()) {
      Object.assign(result, collectFiles(fullPath, relPath));
    } else {
      result[relPath] = fs.readFileSync(fullPath);
    }
  }
  return result;
}

const fileMap = collectFiles(exportsDir);
console.log(`Collected ${Object.keys(fileMap).length} files from exports.`);

const zipped = zipSync(fileMap, { level: 6 });
const outZipPath = path.join(outputsDir, "final_run.zip");
fs.writeFileSync(outZipPath, zipped);

console.log(`Saved ${outZipPath} (${zipped.length} bytes).`);
