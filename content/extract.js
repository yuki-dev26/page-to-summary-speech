(() => {
  if (window.__pageToSummarySpeechExtract) return;

  const NOISE_SELECTORS = [
    "script",
    "style",
    "noscript",
    "iframe",
    "svg",
    "nav",
    "aside",
    "footer",
    "header",
    "form",
    "button",
    "[role='navigation']",
    "[role='banner']",
    "[role='complementary']",
    "[role='contentinfo']",
    "[aria-hidden='true']",
    ".advertisement",
    ".ads",
    ".ad",
    ".sidebar",
    ".menu",
    ".nav",
    ".footer",
    ".header",
    ".share",
    ".social",
    ".cookie",
    ".newsletter",
    ".related",
    ".comments",
    "#comments",
  ].join(",");

  function metaContent(selectors) {
    for (const selector of selectors) {
      const el = document.querySelector(selector);
      if (!el) continue;
      const value =
        el.getAttribute("content") ||
        el.getAttribute("datetime") ||
        el.textContent;
      if (value && value.trim()) return value.trim();
    }
    return "";
  }

  function pickTitle() {
    return (
      metaContent([
        'meta[property="og:title"]',
        'meta[name="twitter:title"]',
      ]) ||
      document.querySelector("h1")?.textContent?.trim() ||
      document.title ||
      ""
    );
  }

  function pickAuthor() {
    return metaContent([
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="twitter:creator"]',
      '[rel="author"]',
      '[itemprop="author"]',
      ".author",
      ".byline",
    ]);
  }

  function pickPublishedDate() {
    return metaContent([
      'meta[property="article:published_time"]',
      'meta[name="publishdate"]',
      'meta[name="pubdate"]',
      'meta[name="date"]',
      "time[datetime]",
      "time",
      '[itemprop="datePublished"]',
    ]);
  }

  function scoreNode(node) {
    if (!(node instanceof HTMLElement)) return 0;

    const text = node.innerText || "";
    const length = text.replace(/\s+/g, " ").trim().length;
    if (length < 80) return 0;

    let score = length;

    const tag = node.tagName.toLowerCase();
    if (tag === "article") score += 120;
    if (tag === "main") score += 100;
    if (tag === "section") score += 40;

    const idClass = `${node.id} ${node.className}`.toLowerCase();
    if (/(article|content|post|entry|story|markdown|body)/.test(idClass)) {
      score += 80;
    }
    if (
      /(comment|sidebar|footer|header|nav|menu|share|promo|ad)/.test(idClass)
    ) {
      score -= 120;
    }

    const paragraphs = node.querySelectorAll("p").length;
    score += paragraphs * 25;

    const links = node.querySelectorAll("a").length;
    const linkDensity = links / Math.max(paragraphs, 1);
    if (linkDensity > 3) score -= 60;

    return score;
  }

  function findBestRoot() {
    const preferred = document.querySelector(
      "article, main, [role='main'], .post-content, .entry-content, .article-body, #content",
    );
    if (preferred && (preferred.innerText || "").trim().length > 200) {
      return preferred;
    }

    let best = null;
    let bestScore = 0;
    const candidates = document.querySelectorAll(
      "article, main, section, div, [role='main']",
    );

    for (const node of candidates) {
      const score = scoreNode(node);
      if (score > bestScore) {
        bestScore = score;
        best = node;
      }
    }

    return best || document.body;
  }

  function extractText(root) {
    const clone = root.cloneNode(true);
    clone.querySelectorAll(NOISE_SELECTORS).forEach((el) => el.remove());

    const blocks = [];
    const walk = document.createTreeWalker(clone, NodeFilter.SHOW_ELEMENT, {
      acceptNode(node) {
        const tag = node.tagName.toLowerCase();
        if (
          ["p", "h1", "h2", "h3", "h4", "li", "blockquote", "pre"].includes(tag)
        ) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_SKIP;
      },
    });

    while (walk.nextNode()) {
      const text = walk.currentNode.textContent?.replace(/\s+/g, " ").trim();
      if (text && text.length > 1) blocks.push(text);
    }

    if (blocks.length === 0) {
      const fallback = clone.innerText || clone.textContent || "";
      return fallback
        .replace(/\s+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }

    return blocks.join("\n\n").trim();
  }

  window.__pageToSummarySpeechExtract = function extractPageContent() {
    const root = findBestRoot();
    const content = extractText(root);

    return {
      title: pickTitle(),
      url: location.href,
      author: pickAuthor(),
      publishedDate: pickPublishedDate(),
      content,
      contentLength: content.length,
    };
  };
})();
