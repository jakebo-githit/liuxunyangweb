const TOPIC_MAP = {
  htn_kidney: document.getElementById("list-htn-kidney"),
  portal_hypertension: document.getElementById("list-portal-hypertension"),
};
const NEWS_MAP = {
  world: document.getElementById("list-world-news"),
  finance: document.getElementById("list-finance-news"),
};

const updatedEl = document.getElementById("updatedAt");
const fontToggleBtn = document.getElementById("fontToggleBtn");
const readPageBtn = document.getElementById("readPageBtn");
const stopReadBtn = document.getElementById("stopReadBtn");
const voiceStatus = document.getElementById("voiceStatus");
const readTopicButtons = document.querySelectorAll(".read-topic-btn");
const FONT_STORAGE_KEY = "elder_font_mode";
let latestData = null;

function formatDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("zh-CN", { hour12: false });
}

function updateFontModeLabel() {
  const enabled = document.body.classList.contains("extra-large");
  fontToggleBtn.textContent = enabled ? "关闭超大字模式" : "开启超大字模式";
}

function initFontMode() {
  const saved = localStorage.getItem(FONT_STORAGE_KEY);
  if (saved === "on") {
    document.body.classList.add("extra-large");
  }
  updateFontModeLabel();
  fontToggleBtn.addEventListener("click", () => {
    document.body.classList.toggle("extra-large");
    const enabled = document.body.classList.contains("extra-large");
    localStorage.setItem(FONT_STORAGE_KEY, enabled ? "on" : "off");
    updateFontModeLabel();
  });
}

function canSpeak() {
  return "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
}

function speak(text) {
  if (!canSpeak()) {
    voiceStatus.textContent = "当前浏览器不支持语音朗读。";
    return;
  }
  window.speechSynthesis.cancel();
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = "zh-CN";
  utter.rate = 0.95;
  utter.onstart = () => {
    voiceStatus.textContent = "正在朗读...";
  };
  utter.onend = () => {
    voiceStatus.textContent = "朗读完成。";
  };
  utter.onerror = () => {
    voiceStatus.textContent = "朗读失败，请稍后重试。";
  };
  window.speechSynthesis.speak(utter);
}

function buildTopicSpeechText(topicKey) {
  const name = topicKey === "htn_kidney" ? "高血压肾病" : "门静脉高压症";
  const papers = latestData?.topics?.[topicKey] || [];
  if (papers.length === 0) return `${name}，今日暂无新数据。`;
  const lines = papers.slice(0, 8).map((paper, idx) => {
    const summary = paper.zhSummary || "暂无中文总结。";
    return `第${idx + 1}条，${paper.title}。${summary}`;
  });
  return `${name}最新研究如下。${lines.join("")}`;
}

function bindSpeechControls() {
  readPageBtn.addEventListener("click", () => {
    const a = buildTopicSpeechText("htn_kidney");
    const b = buildTopicSpeechText("portal_hypertension");
    speak(`${a}${b}`);
  });

  stopReadBtn.addEventListener("click", () => {
    if (!canSpeak()) return;
    window.speechSynthesis.cancel();
    voiceStatus.textContent = "已停止朗读。";
  });

  readTopicButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const topicKey = button.dataset.topic;
      speak(buildTopicSpeechText(topicKey));
    });
  });
}

function renderTopic(listEl, papers) {
  listEl.innerHTML = "";

  if (!papers || papers.length === 0) {
    const li = document.createElement("li");
    li.textContent = "今日暂无新数据。";
    listEl.appendChild(li);
    return;
  }

  papers.forEach((paper) => {
    const li = document.createElement("li");
    const link = document.createElement("a");

    link.href = paper.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = paper.title;

    const meta = document.createElement("span");
    meta.className = "paper-meta";
    meta.textContent =
      `${paper.journal || "期刊未知"} | ${paper.pubDate || "日期未知"} | ` +
      `研究类型：${paper.studyType || "未知"} | 作者：${paper.authors || "未知"}`;

    const abstract = document.createElement("p");
    abstract.className = "paper-abstract";
    abstract.textContent = `英文摘要：${paper.abstract || "No abstract available from PubMed."}`;

    const zhSummary = document.createElement("p");
    zhSummary.className = "paper-zh-summary";
    zhSummary.textContent = `中文核心总结：${paper.zhSummary || "暂无中文总结。"}`;

    const source = document.createElement("div");
    source.className = "paper-source";
    source.innerHTML = "";

    const pubmedAnchor = document.createElement("a");
    pubmedAnchor.href = paper.pubmedUrl || paper.url;
    pubmedAnchor.target = "_blank";
    pubmedAnchor.rel = "noopener noreferrer";
    pubmedAnchor.textContent = `PubMed 原文（PMID: ${paper.pmid || "未知"}）`;
    source.appendChild(pubmedAnchor);

    if (paper.doiUrl) {
      const sep = document.createElement("span");
      sep.textContent = " | ";
      source.appendChild(sep);

      const doiAnchor = document.createElement("a");
      doiAnchor.href = paper.doiUrl;
      doiAnchor.target = "_blank";
      doiAnchor.rel = "noopener noreferrer";
      doiAnchor.textContent = "期刊原文（DOI）";
      source.appendChild(doiAnchor);
    }

    const controls = document.createElement("div");
    controls.className = "paper-controls";

    const readBtn = document.createElement("button");
    readBtn.type = "button";
    readBtn.className = "control-btn paper-read-btn";
    readBtn.textContent = "朗读此条";
    readBtn.addEventListener("click", () => {
      speak(
        `${paper.title}。${paper.journal || "期刊未知"}。发表日期${paper.pubDate || "未知"}。${
          paper.zhSummary || "暂无中文总结。"
        }`,
      );
    });

    controls.appendChild(readBtn);
    li.appendChild(link);
    li.appendChild(meta);
    li.appendChild(zhSummary);
    li.appendChild(abstract);
    li.appendChild(source);
    li.appendChild(controls);
    listEl.appendChild(li);
  });
}

function renderNews(listEl, items) {
  listEl.innerHTML = "";

  if (!items || items.length === 0) {
    const li = document.createElement("li");
    li.textContent = "今日暂无新闻数据。";
    listEl.appendChild(li);
    return;
  }

  items.forEach((item) => {
    const li = document.createElement("li");
    const link = document.createElement("a");
    link.href = item.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.titleZh || "未命名新闻";

    const meta = document.createElement("span");
    meta.className = "paper-meta";
    meta.textContent = `${item.source || "来源未知"}（英文媒体） | ${item.publishedAt || "时间未知"}`;

    const summary = document.createElement("p");
    summary.className = "paper-zh-summary";
    summary.textContent = `中文总结：${item.summaryZh || "暂无中文总结。"}`;

    li.appendChild(link);
    li.appendChild(meta);
    li.appendChild(summary);
    listEl.appendChild(li);
  });
}

async function loadData() {
  try {
    const res = await fetch("./data/latest.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    latestData = data;
    updatedEl.textContent = `最近更新：${formatDate(data.updatedAt)}`;

    Object.entries(TOPIC_MAP).forEach(([topicKey, listEl]) => {
      renderTopic(listEl, data.topics?.[topicKey] || []);
    });
    Object.entries(NEWS_MAP).forEach(([newsKey, listEl]) => {
      renderNews(listEl, data.news?.[newsKey] || []);
    });
  } catch (error) {
    if (window.location.protocol === "file:") {
      updatedEl.textContent = "当前为本地文件模式，无法读取数据。请用本地服务器打开。";
    } else {
      updatedEl.textContent = "数据加载失败，请稍后刷新。";
    }
    [...Object.values(TOPIC_MAP), ...Object.values(NEWS_MAP)].forEach((listEl) => {
      if (window.location.protocol === "file:") {
        listEl.innerHTML =
          "<li>请在项目目录运行 python3 -m http.server 8080，然后访问 http://localhost:8080</li>";
      } else {
        listEl.innerHTML = "<li>数据加载失败。</li>";
      }
    });
    console.error(error);
  }
}

initFontMode();
bindSpeechControls();
loadData();
