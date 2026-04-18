import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("../manifest.xml", import.meta.url);
const targetPath = new URL("../manifest.prod.xml", import.meta.url);

const source = await readFile(sourcePath, "utf8");
const target = source.replaceAll(
  "https://localhost:3155/pptypst/",
  "https://splines.github.io/pptypst/",
);

await writeFile(targetPath, target, "utf8");
console.log("已生成 manifest.prod.xml");
