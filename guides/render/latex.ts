/**
 * LaTeX renderer: the same manifest x locale data, emitted as a real document.
 *
 * This is a SIBLING of render/build.ts, not a replacement. Both read the capture
 * manifest and a locale file; neither knows anything the other doesn't. That is
 * the payoff of keeping prose out of the manifest — a second output format costs
 * a renderer, not a re-capture.
 *
 * LuaLaTeX (not pdflatex, not XeLaTeX) because the Hindi edition mixes scripts:
 * Devanagari prose with English UI labels kept in Latin on purpose. No installed
 * font covers both, and XeLaTeX has no automatic fallback — it silently renders
 * the uncovered script as empty boxes. LuaLaTeX's luaotfload does have one.
 *
 * Cross-references: a locale body may contain [[ref:chapter.step]], which becomes
 * a real \ref here and a hyperlink in HTML. Prose therefore never hardcodes a
 * step number, so renumbering a chapter cannot silently produce a wrong reference.
 */
import fs from "node:fs";
import path from "node:path";
import type { ChapterRecord } from "../lib/shot";

const ROOT = new URL("..", import.meta.url).pathname;
const OUT = path.join(ROOT, "out");
const MANIFEST = path.join(OUT, "manifest");
const LOCALES = path.join(ROOT, "locales");
const TEXDIR = path.join(OUT, "tex");

type StepText = { title: string; body: string };
type ChapterText = Record<string, StepText | string | undefined> & {
  $title?: string;
  $intro?: string;
};
type Locale = Record<string, ChapterText> & {
  $meta: {
    lang: string;
    dir: string;
    title: string;
    subtitle: string;
    $note?: string;
    $conventions?: string;
    $glossary?: Record<string, string>;
  };
};

/** Escape the ten characters TeX treats as syntax. */
function tex(s: string): string {
  return s
    .replace(/\\/g, "\\textbackslash{}")
    .replace(/([&%$#_{}])/g, "\\$1")
    .replace(/~/g, "\\textasciitilde{}")
    .replace(/\^/g, "\\textasciicircum{}");
}

/** Resolve [[ref:chapter.step]] to \ref{step:chapter.step} after escaping. */
function withRefs(s: string): string {
  return tex(s).replace(
    /\[\[ref:([a-z0-9.-]+)\]\]/gi,
    (_m, id: string) => `\\ref{step:${id}}`,
  );
}

function loadChapters(): ChapterRecord[] {
  return fs
    .readdirSync(MANIFEST)
    .filter((f) => f.endsWith(".json"))
    .map((f) => JSON.parse(fs.readFileSync(path.join(MANIFEST, f), "utf8")) as ChapterRecord)
    .sort((a, b) => a.order - b.order);
}

function preamble(loc: Locale): string {
  const hi = loc.$meta.lang === "hi";
  // Script fallback. Noto Sans Devanagari has NO Latin coverage, so the Hindi
  // edition's deliberately-English UI labels ("Dispatch दबाएँ") come out as tofu
  // without this. The fallback chain fills whatever the primary face is missing,
  // in both directions.
  const main = hi ? "Noto Sans Devanagari" : "Noto Serif";
  const sans = hi ? "Noto Sans Devanagari" : "Noto Sans";
  const fallback = hi
    ? '"NotoSans:mode=harf;", "NotoSerif:mode=harf;"'
    : '"NotoSansDevanagari:mode=harf;"';

  return String.raw`\documentclass[11pt,a4paper,oneside]{report}

\usepackage{fontspec}
\usepackage[a4paper,top=2.4cm,bottom=2.4cm,left=2.2cm,right=2.2cm]{geometry}
\usepackage{graphicx}
\usepackage{booktabs}
\usepackage{array}
\usepackage[table]{xcolor}
\usepackage{caption}
\usepackage{titlesec}
\usepackage{fancyhdr}
\usepackage{enumitem}
\usepackage{needspace}
\usepackage[hidelinks,bookmarksnumbered]{hyperref}

\directlua{
  luaotfload.add_fallback("guidefallback", { ${fallback} })
}
\setmainfont{${main}}[RawFeature={fallback=guidefallback}]
\setsansfont{${sans}}[RawFeature={fallback=guidefallback}]
\setmonofont{DejaVu Sans Mono}[Scale=0.85]

\definecolor{accent}{HTML}{B01030}
\definecolor{rule}{HTML}{D4D4D8}
\definecolor{muted}{HTML}{52525B}

% Section styling: restrained, numbered, documentation-like.
\titleformat{\chapter}[display]
  {\sffamily\bfseries\Large}
  {\color{muted}\normalsize\MakeUppercase{\chaptertitlename\ \thechapter}}
  {6pt}{\Huge}
\titlespacing*{\chapter}{0pt}{-18pt}{22pt}
\titleformat{\section}{\sffamily\bfseries\large}{\thesection}{0.7em}{}
\titlespacing*{\section}{0pt}{16pt}{6pt}

\captionsetup{
  font=small, labelfont={sf,bf}, textfont=sf,
  labelsep=period, justification=raggedright, singlelinecheck=false, skip=6pt
}

\pagestyle{fancy}
\fancyhf{}
\renewcommand{\headrulewidth}{0.4pt}
\renewcommand{\footrulewidth}{0pt}
\fancyhead[L]{\sffamily\footnotesize\color{muted}\nouppercase{\leftmark}}
\fancyhead[R]{\sffamily\footnotesize\color{muted}\thepage}
\fancypagestyle{plain}{\fancyhf{}\renewcommand{\headrulewidth}{0pt}%
  \fancyfoot[C]{\sffamily\footnotesize\color{muted}\thepage}}

% Screenshot: full text width, framed, with a numbered caption you can cite.
\newcommand{\screenshot}[3]{%
  \begin{figure}[htbp]
    \centering
    \setlength{\fboxsep}{0pt}\setlength{\fboxrule}{0.4pt}%
    \fcolorbox{rule}{white}{\includegraphics[width=\textwidth]{#1}}%
    \caption{#2}\label{#3}
  \end{figure}%
}

% Where-you-are strip under each step heading.
\newcommand{\locationbar}[2]{%
  {\sffamily\footnotesize\color{muted}\textbf{#1}\quad\texttt{#2}}\par\vspace{4pt}%
}

\setlength{\parindent}{0pt}
\setlength{\parskip}{6pt}
\raggedbottom
`;
}

function render(chapters: ChapterRecord[], loc: Locale): string {
  const { title, subtitle } = loc.$meta;
  const out: string[] = [preamble(loc)];

  out.push(String.raw`\begin{document}`);

  // ── title page ────────────────────────────────────────────────────────────
  out.push(String.raw`
\begin{titlepage}
\centering
\vspace*{5cm}
{\sffamily\bfseries\Huge ${tex(title)}\par}
\vspace{10pt}
{\sffamily\large\color{muted} ${tex(subtitle)}\par}
\vfill
{\sffamily\footnotesize\color{muted} ERTH Tailoring System \textperiodcentered\ Operations Manual\par}
\end{titlepage}
`);

  out.push(String.raw`\tableofcontents`);
  out.push(String.raw`\listoffigures`);
  out.push(String.raw`\clearpage`);

  // ── how to read this ──────────────────────────────────────────────────────
  if (loc.$meta.$conventions) {
    out.push(String.raw`\chapter*{${loc.$meta.lang === "hi" ? "इसे कैसे पढ़ें" : "How to read this manual"}}`);
    out.push(String.raw`\addcontentsline{toc}{chapter}{${loc.$meta.lang === "hi" ? "इसे कैसे पढ़ें" : "How to read this manual"}}`);
    out.push(tex(loc.$meta.$conventions));
    if (loc.$meta.$note) out.push(String.raw`\par\vspace{6pt}` + tex(loc.$meta.$note));
    out.push(String.raw`\clearpage`);
  }

  // ── chapters ──────────────────────────────────────────────────────────────
  for (const ch of chapters) {
    const text = loc[ch.id];
    if (!text) continue;

    out.push(String.raw`\chapter{${tex(text.$title ?? ch.id)}}`);
    out.push(String.raw`\label{ch:${ch.id}}`);
    if (text.$intro) out.push(withRefs(text.$intro));

    for (const s of ch.steps) {
      const key = s.id.split(".").slice(1).join(".");
      const t = text[key] as StepText | undefined;
      if (!t) continue;

      out.push(String.raw`\needspace{4\baselineskip}`);
      out.push(String.raw`\section{${tex(t.title)}}`);
      out.push(String.raw`\label{step:${s.id}}`);
      out.push(
        String.raw`\locationbar{${s.app === "shop" ? "Shop" : "Workshop"}}{${tex(s.route)}}`,
      );
      out.push(withRefs(t.body));
      out.push(
        String.raw`\screenshot{${path.join(OUT, s.image)}}{${tex(t.title)}}{fig:${s.id}}`,
      );
    }
  }

  // ── glossary ──────────────────────────────────────────────────────────────
  const glossary = loc.$meta.$glossary;
  if (glossary && Object.keys(glossary).length) {
    const heading = loc.$meta.lang === "hi" ? "शब्दावली" : "Glossary";
    out.push(String.raw`\chapter*{${heading}}`);
    out.push(String.raw`\addcontentsline{toc}{chapter}{${heading}}`);
    out.push(String.raw`\begin{description}[leftmargin=!,labelwidth=3.2cm,style=nextline,font=\sffamily\bfseries]`);
    for (const [term, def] of Object.entries(glossary)) {
      out.push(String.raw`\item[${tex(term)}] ${tex(def)}`);
    }
    out.push(String.raw`\end{description}`);
  }

  out.push(String.raw`\end{document}`);
  return out.join("\n\n");
}

// ── main ─────────────────────────────────────────────────────────────────────
const chapters = loadChapters();
fs.mkdirSync(TEXDIR, { recursive: true });

for (const file of fs.readdirSync(LOCALES).filter((f) => f.endsWith(".json"))) {
  const lang = file.replace(/\.json$/, "");
  const loc = JSON.parse(fs.readFileSync(path.join(LOCALES, file), "utf8")) as Locale;
  const dest = path.join(TEXDIR, `guide.${lang}.tex`);
  fs.writeFileSync(dest, render(chapters, loc));
  console.log(`wrote ${path.relative(ROOT, dest)}`);
}
