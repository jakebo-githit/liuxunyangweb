import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TOPICS = [
  {
    key: "htn_kidney",
    query:
      '("hypertensive nephropathy"[Title/Abstract] OR "hypertensive kidney disease"[Title/Abstract] OR "hypertension-related chronic kidney disease"[Title/Abstract])',
  },
  {
    key: "portal_hypertension",
    query:
      '("portal hypertension"[Title/Abstract] OR "portopulmonary hypertension"[Title/Abstract] OR "hepatic venous pressure gradient"[Title/Abstract])',
  },
];

const PAPER_LIMIT = 5;
const SEARCH_RETMAX = 40;
const NEWS_LIMIT = 5;
const PUBMED_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils";
const EXCLUDED_PUBTYPES = new Set([
  "Published Erratum",
  "Comment",
  "Editorial",
  "Letter",
  "News",
]);

const NEWS_FEEDS = {
  world: [
    { source: "Reuters", url: "https://feeds.reuters.com/reuters/worldNews" },
    { source: "BBC", url: "https://feeds.bbci.co.uk/news/world/rss.xml" },
  ],
  finance: [
    { source: "Reuters", url: "https://feeds.reuters.com/reuters/businessNews" },
    { source: "BBC", url: "https://feeds.bbci.co.uk/news/business/rss.xml" },
  ],
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, "../data");
const LATEST_PATH = path.resolve(DATA_DIR, "latest.json");
const HISTORY_PATH = path.resolve(DATA_DIR, "research-history.json");

async function fetchJson(url) {
  let lastError = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "father-medical-site/1.0",
        },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
      return res.json();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

async function fetchText(url) {
  let lastError = null;
  for (let i = 0; i < 3; i += 1) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "father-medical-site/1.0",
        },
      });
      if (!res.ok) throw new Error(`Request failed (${res.status}): ${url}`);
      return res.text();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
  throw lastError;
}

function decodeEntities(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#([0-9]+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}

function stripXmlTags(text = "") {
  return decodeEntities(text.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

function parseAbstractMap(xmlText) {
  const abstractByPmid = new Map();
  const articleRegex = /<PubmedArticle>([\s\S]*?)<\/PubmedArticle>/g;
  let match = articleRegex.exec(xmlText);

  while (match) {
    const block = match[1];
    const pmid = block.match(/<PMID[^>]*>(\d+)<\/PMID>/)?.[1];
    if (pmid) {
      const abstract = [...block.matchAll(/<AbstractText\b[^>]*>([\s\S]*?)<\/AbstractText>/g)]
        .map((m) => stripXmlTags(m[1]))
        .filter(Boolean)
        .join(" ");
      abstractByPmid.set(pmid, abstract);
    }
    match = articleRegex.exec(xmlText);
  }

  return abstractByPmid;
}

function parseDoi(elocationId = "") {
  return elocationId.match(/\bdoi:\s*([^\s;]+)/i)?.[1] || null;
}

function compressText(text, maxChars = 700) {
  if (!text) return "No abstract available from PubMed.";
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function pickTopicZh(topicKey) {
  return topicKey === "htn_kidney" ? "高血压肾病" : "门静脉高压症";
}

function detectMethodCn(studyType = "") {
  const t = studyType.toLowerCase();
  if (t.includes("review")) return "综述研究";
  if (t.includes("multicenter")) return "多中心临床研究";
  if (t.includes("clinical trial")) return "临床试验";
  if (t.includes("case")) return "病例研究";
  return "临床研究";
}

function extractSampleHint(text = "") {
  const m = text.match(/\b(\d{2,4})\b/);
  return m ? `样本量约为 ${m[1]}` : "";
}

function detectCoreFinding(title = "", abstractText = "") {
  const content = `${title} ${abstractText}`.toLowerCase();
  if (content.includes("risk factor")) return "提示并发症或不良结局的危险因素可被提前识别。";
  if (content.includes("review")) return "总结了当前治疗路径及证据分层，强调个体化决策。";
  if (content.includes("improve") || content.includes("ameliorate")) return "结果显示该策略可改善关键临床或病理指标。";
  if (content.includes("reduce") || content.includes("decrease")) return "结果提示该干预可降低损伤负担或事件风险。";
  if (content.includes("predict") || content.includes("model")) return "提出了预测模型，有助于临床分层与治疗选择。";
  if (content.includes("guideline") || content.includes("consensus")) return "对临床流程形成了可执行的规范化建议。";
  if (content.includes("surgery") || content.includes("splenectomy")) return "强调围手术期评估与并发症防控是治疗成败关键。";
  if (content.includes("varices") || content.includes("bleeding")) return "强调出血控制与再出血预防仍是管理重点。";
  return "提供了可直接用于临床判断的新证据。";
}

function buildZhSummary({ topicKey, title, studyType, abstractText }) {
  const topicZh = pickTopicZh(topicKey);
  const methodCn = detectMethodCn(studyType);
  const sampleHint = extractSampleHint(abstractText);
  const sentence1 = `该文聚焦${topicZh}，属于${methodCn}${sampleHint ? `（${sampleHint}）` : ""}。`;
  const sentence2 = `核心观点：${detectCoreFinding(title, abstractText)}`;
  return `${sentence1}${sentence2}`;
}

async function readJsonSafe(filePath, fallback) {
  try {
    const text = await fs.readFile(filePath, "utf8");
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

async function loadHistory() {
  const empty = { topics: { htn_kidney: [], portal_hypertension: [] } };
  const history = await readJsonSafe(HISTORY_PATH, empty);

  if (!history.topics) history.topics = empty.topics;
  if (!history.topics.htn_kidney) history.topics.htn_kidney = [];
  if (!history.topics.portal_hypertension) history.topics.portal_hypertension = [];

  if (history.topics.htn_kidney.length === 0 && history.topics.portal_hypertension.length === 0) {
    const latest = await readJsonSafe(LATEST_PATH, { topics: {} });
    for (const topic of TOPICS) {
      const pmids = (latest.topics?.[topic.key] || []).map((p) => p.pmid).filter(Boolean);
      history.topics[topic.key] = [...new Set(pmids)];
    }
  }

  return history;
}

async function fetchTopicPapers(topic, seenPmids) {
  const query = `${topic.query} AND english[Language]`;
  const searchUrl =
    `${PUBMED_BASE}/esearch.fcgi?db=pubmed&retmode=json&sort=pub+date&retmax=${SEARCH_RETMAX}` +
    `&term=${encodeURIComponent(query)}`;

  const searchData = await fetchJson(searchUrl);
  const ids = searchData?.esearchresult?.idlist || [];
  if (ids.length === 0) return [];

  const summaryUrl =
    `${PUBMED_BASE}/esummary.fcgi?db=pubmed&retmode=json&id=${encodeURIComponent(ids.join(","))}`;
  const summaryData = await fetchJson(summaryUrl);
  const fetchUrl =
    `${PUBMED_BASE}/efetch.fcgi?db=pubmed&retmode=xml&id=${encodeURIComponent(ids.join(","))}`;
  const abstractMap = parseAbstractMap(await fetchText(fetchUrl));

  const result = [];
  for (const pmid of ids) {
    if (seenPmids.has(pmid)) continue;
    const item = summaryData?.result?.[pmid];
    if (!item) continue;

    const pubtypes = item.pubtype || [];
    if (pubtypes.some((p) => EXCLUDED_PUBTYPES.has(p))) continue;

    const studyType = pubtypes.slice(0, 3).join(" / ") || "Not specified";
    const abstractText = compressText(abstractMap.get(pmid));
    const doi = parseDoi(item.elocationid || "");

    result.push({
      title: item.title || "无标题",
      journal: item.fulljournalname || item.source || "未知期刊",
      pubDate: item.pubdate || "日期未知",
      studyType,
      authors: (item.authors || []).slice(0, 3).map((a) => a.name).join(", ") || "Unknown",
      zhSummary: buildZhSummary({
        topicKey: topic.key,
        title: item.title || "",
        studyType,
        abstractText,
      }),
      abstract: abstractText,
      pmid,
      pubmedUrl: `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
      doiUrl: doi ? `https://doi.org/${doi}` : "",
      url: doi ? `https://doi.org/${doi}` : `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`,
    });

    if (result.length >= PAPER_LIMIT) break;
  }

  return result;
}

function parseRssItems(xmlText) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/g;
  let match = itemRegex.exec(xmlText);

  while (match) {
    const block = match[1];
    const cleanRssField = (text = "") => stripXmlTags(text.replace(/<!\[CDATA\[|\]\]>/g, ""));
    const title = cleanRssField(block.match(/<title>([\s\S]*?)<\/title>/)?.[1] || "");
    const link = cleanRssField(block.match(/<link>([\s\S]*?)<\/link>/)?.[1] || "");
    const pubDate = cleanRssField(block.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1] || "");
    const descriptionRaw = block.match(/<description>([\s\S]*?)<\/description>/)?.[1] || "";
    const description = cleanRssField(descriptionRaw);

    if (title && link) {
      items.push({ title, link, pubDate, description });
    }

    match = itemRegex.exec(xmlText);
  }

  return items;
}

async function translateToZh(text) {
  if (!text) return "";
  const endpoint =
    "https://translate.googleapis.com/translate_a/single?client=gtx&sl=en&tl=zh-CN&dt=t&q=" +
    encodeURIComponent(text);

  try {
    const data = await fetchJson(endpoint);
    const translated = (data?.[0] || []).map((part) => part?.[0] || "").join("").trim();
    if (translated) return translated;
  } catch {
    // fallback below
  }

  return `该英文报道关注最新动态：${text.slice(0, 80)}...`;
}

function summarizeNewsCn(titleZh, descZh, category) {
  const label = category === "world" ? "世界时事" : "金融市场";
  const desc = (descZh || "").trim();
  const line2 = desc ? `核心要点：${desc.slice(0, 80)}${desc.length > 80 ? "..." : ""}` : "核心要点：报道聚焦最新进展与潜在影响。";
  return `这是一条${label}新闻，重点围绕“${titleZh}”。${line2}`;
}

async function fetchNewsCategory(category) {
  const feeds = NEWS_FEEDS[category] || [];
  const merged = [];
  const seenLinks = new Set();

  for (const feed of feeds) {
    try {
      const xml = await fetchText(feed.url);
      const items = parseRssItems(xml);
      for (const item of items) {
        if (seenLinks.has(item.link)) continue;
        seenLinks.add(item.link);
        merged.push({ ...item, source: feed.source });
      }
    } catch {
      // skip failed feed, keep pipeline running
    }
  }

  const selected = merged.slice(0, NEWS_LIMIT);
  const localized = [];
  for (const item of selected) {
    const titleZh = await translateToZh(item.title);
    const descInput = item.description || item.title;
    const descZh = await translateToZh(descInput);

    localized.push({
      titleZh,
      summaryZh: summarizeNewsCn(titleZh, descZh, category),
      source: item.source,
      sourceLang: "English",
      publishedAt: item.pubDate || "",
      url: item.link,
    });
  }

  return localized;
}

async function main() {
  const history = await loadHistory();
  const latest = await readJsonSafe(LATEST_PATH, { topics: {}, news: { world: [], finance: [] } });
  const topics = {};

  for (const topic of TOPICS) {
    try {
      const seenSet = new Set(history.topics[topic.key] || []);
      const papers = await fetchTopicPapers(topic, seenSet);
      topics[topic.key] = papers;

      const nextSeen = [...new Set([...(history.topics[topic.key] || []), ...papers.map((p) => p.pmid)])];
      history.topics[topic.key] = nextSeen.slice(-1000);
    } catch (error) {
      console.warn(`Topic fetch failed (${topic.key}), using previous data.`, error?.message || error);
      topics[topic.key] = (latest.topics?.[topic.key] || []).slice(0, PAPER_LIMIT);
    }
  }

  const news = { world: [], finance: [] };
  try {
    news.world = await fetchNewsCategory("world");
  } catch (error) {
    console.warn("World news fetch failed, using previous data.", error?.message || error);
    news.world = latest.news?.world || [];
  }
  try {
    news.finance = await fetchNewsCategory("finance");
  } catch (error) {
    console.warn("Finance news fetch failed, using previous data.", error?.message || error);
    news.finance = latest.news?.finance || [];
  }

  const payload = {
    updatedAt: new Date().toISOString(),
    topics,
    news,
  };

  history.updatedAt = payload.updatedAt;

  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(LATEST_PATH, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  await fs.writeFile(HISTORY_PATH, `${JSON.stringify(history, null, 2)}\n`, "utf8");
  console.log(`Updated ${LATEST_PATH}`);
  console.log(`Updated ${HISTORY_PATH}`);
}

main().catch((error) => {
  console.error("Failed to update content:", error);
  process.exitCode = 1;
});
