// ==========================================================================
// 板橋國光國小 - 文章公告 JSON 自動批次產生器、多媒體優化與靜態健檢器
//
// 【這隻程式能為您做甚麼？】
// 1. 🔍 遞迴掃描文章：自動搜尋 data/ 目錄下所有子資料夾內的 HTML 文章頁面。
// 2. ⚡ 效能自動優化：自動為 HTML 內的 <audio> 標籤補上 preload="none"，提升網頁載入速度與節省流量。
// 3. 📄 智能資訊擷取：自動抓取文章標題 (<title>)、精準過濾 HTML 標籤產出純文字摘要。
// 4. 🏷️ 標籤與數據計算：自動提取文章小標題作為 Tags，並計算純文字字數與預估閱讀時間。
// 5. 📅 日期彈性處理：優先讀取頁面內的「發布日期」，若無則自動取得檔案最後修改時間 (mtime)。
// 6. 🚨 靜態資源健檢：檢查 HTML 內引用的影音檔 (MP3/WAV)、圖片 (PNG/JPG) 與下載檔 (PDF/ZIP) 是否真有檔案，預防死連結。
// 7. 📦 產出動態 JSON：整合所有文章資料並依日期降冪排序，輸出成 announcements.json 供前端搜尋與列表使用。
//
// 執行方式：在終端機輸入 node build-json.js
// ==========================================================================

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const OUTPUT_JSON = path.join(__dirname, 'data', 'announcements.json');

/**
 * 遞迴取得指定資料夾內的所有 HTML 檔案路徑
 */
function getAllHtmlFiles(dirPath, arrayOfFiles = []) {
  if (!fs.existsSync(dirPath)) return arrayOfFiles;
  const files = fs.readdirSync(dirPath);

  files.forEach(file => {
    const fullPath = path.join(dirPath, file);
    if (fs.statSync(fullPath).isDirectory()) {
      arrayOfFiles = getAllHtmlFiles(fullPath, arrayOfFiles);
    } else if (file.endsWith('.html')) {
      arrayOfFiles.push(fullPath);
    }
  });

  return arrayOfFiles;
}

/**
 * 格式化 Date 物件為 YYYY-MM-DD 字串
 */
function formatDate(dateObj) {
  const d = new Date(dateObj);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * 主執行函式：處理 HTML 檔案並產生 JSON
 */
function processAndGenerateAnnouncements() {
  console.log('🔍 開始掃描與優化 data/ 資料夾內的所有文章...');
  const htmlFiles = getAllHtmlFiles(DATA_DIR);
  const announcements = [];
  let updatedAudioCount = 0;
  let missingFileWarnings = 0;

  htmlFiles.forEach(filePath => {
    try {
      let content = fs.readFileSync(filePath, 'utf-8');
      const relativeUrl = path.relative(__dirname, filePath).replace(/\\/g, '/');
      const fileStat = fs.statSync(filePath);
      const articleDir = path.dirname(filePath);

      // ------------------------------------------------------------------
      // 功能 1：自動優化 <audio> 載入效能 (加上 preload="none")
      // ------------------------------------------------------------------
      if (/<audio(?![^>]*\bpreload=)/i.test(content)) {
        content = content.replace(/<audio(\s+[^>]*>|>)/gi, (match, p1) => {
          return `<audio preload="none"${p1.startsWith(' ') ? p1 : ' ' + p1}`;
        });
        fs.writeFileSync(filePath, content, 'utf-8');
        updatedAudioCount++;
      }

      // ------------------------------------------------------------------
      // 功能 2：解析文章標題 <title> (自動去除網站後綴選單字眼)
      // ------------------------------------------------------------------
      const titleMatch = content.match(/<title>(.*?)<\/title>/i);
      let title = titleMatch 
        ? titleMatch[1]
            .replace(' - 臺灣本土語文數位學習網', '')
            .replace(' - 新北市板橋區國光國民小學', '')
            .trim() 
        : '未命名文章';

      // ------------------------------------------------------------------
      // 功能 3：根據檔案相對路徑自動判定文章分類
      // ------------------------------------------------------------------
      let category = '最新消息';
      if (relativeUrl.includes('/proverb/')) category = '俗語/諺語';
      else if (relativeUrl.includes('/story/') || relativeUrl.includes('/idiom/')) category = '民間故事';
      else if (relativeUrl.includes('/song/')) category = '老歌賞析';
      else if (relativeUrl.includes('/download/')) category = '教材下載';
      else if (relativeUrl.includes('/exam/')) category = '認證考古題';

      // ------------------------------------------------------------------
      // 功能 4：自動偵測目錄下的語音檔與插圖資源
      // ------------------------------------------------------------------
      const dirFiles = fs.readdirSync(articleDir);
      
      const hasAudioInTag = /<audio[\s>]/i.test(content);
      const hasAudioFile = dirFiles.some(f => /\.(mp3|wav|ogg|m4a)$/i.test(f));
      const hasAudio = hasAudioInTag || hasAudioFile;

      const images = dirFiles
        .filter(f => /\.(jpg|jpeg|png|webp|svg)$/i.test(f))
        .map(f => path.relative(__dirname, path.join(articleDir, f)).replace(/\\/g, '/'));

      // ------------------------------------------------------------------
      // 功能 5：智能抓取段落文字並清理 HTML 標籤以產出文章摘要
      // ------------------------------------------------------------------
      let summary = '暫無摘要';
      const articleMatch = content.match(/<article[\s\S]*?<\/article>/i);
      const targetScope = articleMatch ? articleMatch[0] : content;
      
      const pMatches = [...targetScope.matchAll(/<p[^>]*>(.*?)<\/p>/gi)];
      for (const m of pMatches) {
        const cleanText = m[1]
          .replace(/<[^>]+>/g, '')
          .replace(/\s+/g, ' ')
          .trim();

        if (cleanText.length > 5 && !cleanText.includes('發布日期：')) {
          summary = cleanText.length > 80 ? cleanText.substring(0, 80) + '...' : cleanText;
          break;
        }
      }

      // ------------------------------------------------------------------
      // 功能 6：抓取發布日期 (若找不到則自動使用檔案最後修改時間 mtime)
      // ------------------------------------------------------------------
      const dateMatch = content.match(/發布日期：(\d{4}-\d{2}-\d{2})/i) || content.match(/(\d{4}\d{2}\d{2})/);
      let date = '';
      if (dateMatch) {
        date = dateMatch[1].includes('-') 
          ? dateMatch[1] 
          : `${dateMatch[1].slice(0,4)}-${dateMatch[1].slice(4,6)}-${dateMatch[1].slice(6,8)}`;
      } else {
        date = formatDate(fileStat.mtime);
      }

      // ------------------------------------------------------------------
      // 功能 7：自動提取文章標題與內文 h2/h3 小標作為搜尋關鍵字 Tags
      // ------------------------------------------------------------------
      const tagsSet = new Set([category, "台語"]);
      const headingMatches = [...targetScope.matchAll(/<h[23][^>]*>(.*?)<\/h[23]>/gi)];
      headingMatches.forEach(m => {
        const cleanHead = m[1].replace(/<[^>]+>/g, '').trim();
        if (cleanHead && cleanHead.length < 15) tagsSet.add(cleanHead);
      });

      // ------------------------------------------------------------------
      // 功能 8：計算文章純文字字數與估算閱讀時間 (以每分鐘 300 字計算)
      // ------------------------------------------------------------------
      const pureText = targetScope.replace(/<[^>]+>/g, '').replace(/\s+/g, '');
      const wordCount = pureText.length;
      const readingTime = Math.max(1, Math.ceil(wordCount / 300));

      // ------------------------------------------------------------------
      // 功能 9：靜態健檢 (檢查 HTML 內引用的檔是否存在，預防死連結)
      // ------------------------------------------------------------------
      const srcMatches = [...content.matchAll(/(?:src|href)=["']([^"']+\.(?:mp3|wav|png|jpg|jpeg|webp|pdf|zip))["']/gi)];
      srcMatches.forEach(m => {
        const refUrl = m[1];
        if (!refUrl.startsWith('http') && !refUrl.startsWith('//')) {
          const resourcePath = path.resolve(articleDir, refUrl);
          if (!fs.existsSync(resourcePath)) {
            console.warn(`  ⚠️  [資源遺失警告] ${path.basename(filePath)} 引用的檔案不存在: ${refUrl}`);
            missingFileWarnings++;
          }
        }
      });

      const articleId = path.basename(filePath, '.html');

      // 組合單篇文章物件資料
      announcements.push({
        id: articleId,
        category: category,
        language: "台語",
        title: title,
        date: date,
        department: "國光國小本土語組",
        summary: summary,
        url: relativeUrl,
        has_audio: hasAudio,
        images: images,
        tags: Array.from(tagsSet),
        word_count: wordCount,
        reading_time: readingTime
      });

    } catch (err) {
      console.error(`❌ 處理檔案失敗: ${filePath}`, err.message);
    }
  });

  // ------------------------------------------------------------------
  // 功能 10：依日期降冪排序 (最新的文章排最前面) 並寫入 announcements.json
  // ------------------------------------------------------------------
  announcements.sort((a, b) => new Date(b.date) - new Date(a.date));

  fs.writeFileSync(OUTPUT_JSON, JSON.stringify(announcements, null, 2), 'utf-8');
  console.log(`\n✅ 處理完成！`);
  console.log(`   - 共索引 ${announcements.length} 篇文章至 data/announcements.json`);
  console.log(`   - 自動優化了 ${updatedAudioCount} 個 HTML 檔案中的 <audio> 載入效能 (preload="none")`);
  if (missingFileWarnings > 0) {
    console.log(`   - 🚨 發現 ${missingFileWarnings} 個缺失的多媒體/下載檔案警示，請檢查上述警告！`);
  } else {
    console.log(`   - 🎉 靜態健檢通過：所有文章引用的影音與 PDF 檔案皆正常存在！`);
  }
}

// 啟動程式
processAndGenerateAnnouncements();