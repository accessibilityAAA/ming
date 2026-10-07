// ==========================================================================
// 臺灣本土語文數位學習網 - 智慧無障礙控制器與 Web Components 自動載入腳本
// ==========================================================================

// 1. 全域無障礙控制功能：字級切換 (小 / 中 / 大)
function setFontSize(size) {
  document.documentElement.setAttribute('data-font-size', size);
  localStorage.setItem('site-font-size', size);
}

// 2. 三階段視覺主題切換 (預設淺色 -> 深色 -> 高對比黃黑)
function toggleTheme() {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
  let newTheme = 'light';
  
  if (currentTheme === 'light') {
    newTheme = 'dark';
  } else if (currentTheme === 'dark') {
    newTheme = 'yellow';
  } else {
    newTheme = 'light';
  }

  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('site-theme', newTheme);
  updateThemeButtonText(newTheme);
}

function updateThemeButtonText(theme) {
  const btn = document.getElementById('theme-btn');
  if (!btn) return;

  if (theme === 'dark') {
    btn.innerHTML = '⚡ 黃黑對比模式';
    btn.setAttribute('aria-label', '當前為深色模式，點擊切換為黃黑高對比模式');
  } else if (theme === 'yellow') {
    btn.innerHTML = '☀️ 切換淺色模式';
    btn.setAttribute('aria-label', '當前為黃黑高對比模式，點擊切換為預設淺色模式');
  } else {
    btn.innerHTML = '🌙 切換深色模式';
    btn.setAttribute('aria-label', '當前為淺色模式，點擊切換為深色模式');
  }
}

// 3. RWD 手機版無障礙漢堡選單開關
function toggleMobileMenu() {
  const navList = document.getElementById('main-nav-list');
  const toggleBtn = document.getElementById('menu-toggle');
  if (navList && toggleBtn) {
    const isExpanded = toggleBtn.getAttribute('aria-expanded') === 'true';
    toggleBtn.setAttribute('aria-expanded', !isExpanded);
    navList.classList.toggle('is-active');
  }
}

// 4. 初始化讀取偏好設定
(function initAccessibilitySettings() {
  const savedSize = localStorage.getItem('site-font-size') || 'medium';
  const savedTheme = localStorage.getItem('site-theme') || 'light';
  document.documentElement.setAttribute('data-font-size', savedSize);
  document.documentElement.setAttribute('data-theme', savedTheme);
})();

// 5. 智慧型 Web Component 自動載入器
class RemoteComponent extends HTMLElement {
  constructor(file) {
    super();
    this.file = file;
  }

  connectedCallback() {
    const relativePrefix = getRelativePrefix();
    const fetchPath = relativePrefix + this.file;

    fetch(fetchPath)
      .then(res => {
        if (!res.ok) throw new Error(`${this.file} 載入失敗`);
        return res.text();
      })
      .then(html => {
        this.innerHTML = html;
        this.adjustRelativePaths(relativePrefix);
        this.highlightActiveLinks();
        
        if (this.file === 'header.html') {
          const currentTheme = document.documentElement.getAttribute('data-theme') || 'light';
          updateThemeButtonText(currentTheme);
        }
      })
      .catch(err => console.error('組件載入錯誤：', err));
  }

  adjustRelativePaths(prefix) {
    if (!prefix) return;
    this.querySelectorAll('a[href], img[src], source[src]').forEach(el => {
      const href = el.getAttribute('href');
      if (href && !/^(https?:\/\/|mailto:|tel:|#|javascript:)/i.test(href)) {
        el.setAttribute('href', prefix + href);
      }
      const src = el.getAttribute('src');
      if (src && !/^(https?:\/\/|\/)/i.test(src)) {
        el.setAttribute('src', prefix + src);
      }
    });
  }

  highlightActiveLinks() {
    let currentPath = window.location.pathname.split('/').pop().split('?')[0].split('#')[0];
    if (!currentPath || currentPath === '') currentPath = 'index.html';
    
    this.querySelectorAll('a').forEach(link => {
      let href = link.getAttribute('href');
      if (!href) return;
      
      const cleanHref = href.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
      
      if (cleanHref === currentPath || (currentPath.endsWith('.html') && cleanHref.includes(currentPath))) {
        link.setAttribute('aria-current', 'page');
      } else {
        link.removeAttribute('aria-current');
      }
    });
  }
}

customElements.define('site-header', class extends RemoteComponent { constructor() { super('header.html'); } });
customElements.define('site-nav', class extends RemoteComponent { constructor() { super('nav.html'); } });
customElements.define('site-aside', class extends RemoteComponent { constructor() { super('aside.html'); } });
customElements.define('site-footer', class extends RemoteComponent { constructor() { super('footer.html'); } });

// ==========================================================================
// 🔍 全站模糊搜尋控制器 (Fuzzy Search Engine)
// ==========================================================================
let globalSearchData = [];

function getRelativePrefix() {
  const pathSegments = window.location.pathname.split('/').filter(Boolean);
  const dataIndex = pathSegments.indexOf('data');
  if (dataIndex !== -1) {
    const depthAfterData = pathSegments.length - 1 - dataIndex;
    return '../'.repeat(depthAfterData);
  }
  return '';
}

async function loadGlobalSearchIndex() {
  if (globalSearchData.length > 0) return;
  try {
    const prefix = getRelativePrefix();
    const res = await fetch(prefix + 'data/announcements.json?t=' + Date.now());
    if (res.ok) {
      globalSearchData = await res.json();
    }
  } catch (err) {
    console.error('全站搜尋索引載入失敗：', err);
  }
}

function fuzzyMatch(text, query) {
  if (!text || !query) return false;
  text = text.toLowerCase();
  query = query.toLowerCase().trim();

  if (text.includes(query)) return true;

  let queryIdx = 0;
  for (let i = 0; i < text.length; i++) {
    if (text[i] === query[queryIdx]) {
      queryIdx++;
    }
    if (queryIdx === query.length) return true;
  }
  return false;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, query) {
  if (!text || !query) return text || '';
  const safeQuery = escapeRegExp(query);
  const reg = new RegExp(`(${safeQuery})`, 'gi');
  return text.replace(reg, '<span class="search-highlight">$1</span>');
}

async function handleGlobalSearch(keyword) {
  await loadGlobalSearchIndex();
  const resultsBox = document.getElementById('global-search-results');
  if (!resultsBox) return;

  const cleanKey = keyword.trim();
  if (!cleanKey) {
    resultsBox.style.display = 'none';
    resultsBox.innerHTML = '';
    return;
  }

  const matches = globalSearchData.filter(item => {
    return fuzzyMatch(item.title, cleanKey) || 
           fuzzyMatch(item.category, cleanKey) || 
           fuzzyMatch(item.summary, cleanKey);
  });

  if (matches.length === 0) {
    resultsBox.innerHTML = `<div style="padding: 10px; text-align: center; color: var(--text-muted); font-size: 0.9rem;">未找到包含「${cleanKey}」的內容</div>`;
  } else {
    const prefix = getRelativePrefix();

    resultsBox.innerHTML = `
      <ul>
        ${matches.slice(0, 8).map(item => `
          <li>
            <a href="${prefix}${item.url}">
              <div class="search-result-title">[${item.category}]${highlightText(item.title, cleanKey)}</div>
              <div class="search-result-snippet">${highlightText(item.summary || '', cleanKey)}</div>
            </a>
          </li>
        `).join('')}
      </ul>
      ${matches.length > 8 ? `<div style="text-align:center; padding: 4px; font-size: 0.8rem; color: var(--text-muted);">僅顯示前 8 筆結果</div>` : ''}
    `;
  }

  resultsBox.style.display = 'block';
}

document.addEventListener('click', (e) => {
  const searchWrapper = document.querySelector('.site-search-wrapper');
  const resultsBox = document.getElementById('global-search-results');
  if (resultsBox && searchWrapper && !searchWrapper.contains(e.target)) {
    resultsBox.style.display = 'none';
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const resultsBox = document.getElementById('global-search-results');
    if (resultsBox) resultsBox.style.display = 'none';
  }
});