import fs from "node:fs";
import path from "node:path";

const output = path.resolve("tests/fixtures");
fs.mkdirSync(output, { recursive: true });

const clock = (seconds) => {
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return `${String(minutes).padStart(2, "0")}:${remainder.toFixed(2).padStart(5, "0")}`;
};

function screenplay(episode, options = {}) {
  const {
    lineEnding = "\n",
    bom = false,
    language = "English",
    long = false,
    osLabels = false,
  } = options;
  const speakerA = osLabels ? "THE WOMAN IN BLUE (O.S.)" : "MAYA RIVERA (urgent)";
  const speakerB = osLabels ? "ARJUN MEHTA (Off-screen)" : "NOAH CHEN (guarded)";
  const finalEnd = long ? 1205 : 52;
  const blocks = long
    ? [
        ["CAMERA", 0, 4, "A wide establishing shot crosses the empty station."],
        ["ACTION", 4, 9, "Maya finds a sealed envelope beneath the departure board."],
        [speakerA, 9, 15, "Who left this here, and why does it carry my name?"],
        [speakerB, 15, 23, "Because the person who wrote it believed you were already dead."],
        ["ACTION", 1180, 1188, "The station lights fail as footsteps approach from the tunnel."],
        [speakerA, 1189, 1197, "Tell me the truth before that train reaches us."],
        [speakerB, 1198, 1205, "The train is not coming for us. It is bringing your sister back."],
      ]
    : [
        ["CAMERA", 0, 4, "A wide establishing shot crosses the empty station."],
        ["ACTION", 4, 8, "Maya finds a sealed envelope beneath the departure board."],
        [speakerA, 8, 14, language === "Hindi" ? "यह पत्र मेरे नाम पर किसने छोड़ा?" : "Who left this here, and why does it carry my name?"],
        [speakerB, 15, 22, language === "Hindi" ? "जिसने लिखा था, उसे लगा कि तुम मर चुकी हो।" : "Because the person who wrote it believed you were already dead."],
        ["SOUND FX", 22, 25, "A dramatic metallic impact echoes through the station."],
        ["ACTION", 25, 31, "The station lights fail as footsteps approach from the tunnel."],
        [speakerA, 32, 39, language === "Hindi" ? "ट्रेन आने से पहले मुझे सच बताओ।" : "Tell me the truth before that train reaches us."],
        [speakerB, 40, 47, language === "Hindi" ? "ट्रेन तुम्हारी बहन को वापस ला रही है।" : "The train is bringing your missing sister back."],
        ["ACTION", 48, 52, "Maya turns as a familiar silhouette appears behind the glass."],
      ];
  const lines = [
    `EPISODE NUMBER: Episode ${episode}`,
    "EPISODE LOGLINE: A sealed letter turns a late-night reunion into a dangerous mystery.",
    osLabels
      ? "CONTINUITY NOTES: The Woman in Blue is Maya Rivera. Arjun Mehta is Noah Chen."
      : "CONTINUITY NOTES: Maya and Noah have not spoken since the station fire.",
    "",
    "--- SCRIPT START ---",
    "",
    "SCENE 01",
    "Scene heading: INT. CENTRAL STATION - NIGHT",
    "Scene start: (00:00.00)",
    `Scene end: (${clock(finalEnd)})`,
    "",
  ];
  for (const [label, start, end, text] of blocks) {
    lines.push(label, `Start: (${clock(start)}) | End: (${clock(end)})`, text, "");
  }
  lines.push("--- SCRIPT END ---");
  return `${bom ? "\uFEFF" : ""}${lines.join(lineEnding)}`;
}

function write(name, content, encoding = "utf8") {
  fs.writeFileSync(path.join(output, name), content, encoding);
}

write("valid_ep1.txt", screenplay(1));
write(
  "valid_ep2.txt",
  screenplay(2)
    .replace("Who left this here, and why does it carry my name?", "The envelope arrived while the platform was empty.")
    .replace("The train is bringing your missing sister back.", "At dawn the board will learn what happened here."),
);
write("empty.txt", "");
write("no_timestamps.txt", screenplay(3).replace(/Start: \([^\n]+\) \| End: \([^\n]+\)/g, "Timing unavailable"));
write("bad_timestamps.txt", screenplay(4).replace("Start: (00:08.00) | End: (00:14.00)", "Start: (00:14.00) | End: (00:08.00)"));
write("missing_header.txt", screenplay(5).replace("--- SCRIPT START ---", "--- MISSING START ---"));
write("truncated.txt", screenplay(6).replace(/\n--- SCRIPT END ---\s*$/, "\nMAYA RIVERA (urgent)\nStart: (00:53.00) | End: (00:58.00)"));
write("wrong_encoding.txt", Buffer.from(screenplay(7), "utf16le"));
write("utf8_bom.txt", screenplay(8, { bom: true }));
write("crlf_windows.txt", screenplay(9, { lineEnding: "\r\n" }));
write("non_english.txt", screenplay(10, { language: "Hindi" }));
write("very_short.txt", screenplay(11).replace(/Scene end: \([^\n]+\)/, "Scene end: (00:18.00)").split("\n").slice(0, 30).concat(["--- SCRIPT END ---"]).join("\n"));
write("large_episode.txt", screenplay(12, { long: true }));
write("episode [013] – café reunion.txt", screenplay(13));
write("overlap_os_sound.txt", screenplay(14, { osLabels: true }));
write("oversize.txt", `${screenplay(15)}\n${"x".repeat(5 * 1024 * 1024)}`);
write("not_a_script.pdf", Buffer.from("%PDF-1.4\n% invented placeholder for upload rejection\n", "utf8"));
write("image.png", Buffer.from("89504e470d0a1a0a", "hex"));

const hundred = path.join(output, "100_files");
fs.mkdirSync(hundred, { recursive: true });
for (let episode = 1; episode <= 100; episode += 1) {
  write(path.join("100_files", `episode-${String(episode).padStart(3, "0")}.txt`), screenplay(episode));
}

console.log(`Generated pre-deploy fixtures in ${output}`);

