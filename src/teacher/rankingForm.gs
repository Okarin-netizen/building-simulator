/**
 * 最高タワー工房　クラスランキングのフォームを作るスクリプト（先生用）
 *
 * 使い方（アプリの「先生用：クラスランキングの準備」と同じ手順）
 *   ① フォームを作る
 *      https://script.google.com で「新しいプロジェクト」を作り、最初から入っている文字をすべて消して、
 *      このスクリプトをまるごと貼りつける。上の「実行」を押す（関数は createRankingForm）
 *      初回は許可を求められるので、自分のアカウントを選んで「許可」する
 *      （「このアプリは Google で確認されていません」と出たら「詳細」→「（安全ではないページ）に移動」）
 *   ② ウェブアプリとして公開する
 *      右上の「デプロイ」→「新しいデプロイ」→ 歯車 →「ウェブアプリ」を選ぶ。
 *      「次のユーザーとして実行」は「自分」、「アクセスできるユーザー」は「全員」にして「デプロイ」
 *   ③ 出てきた「ウェブアプリの URL」をコピーして、アプリの準備画面の③の欄に貼る
 *      アプリが、生徒に配るクラスリンクを作る（ランキングもアプリの中で見られる）
 *
 *   学校のアカウントで「全員」が選べないとき（「組織内のすべてのユーザー」だけのとき）は、②③をとばし、
 *   ①の実行ログ（またはスプレッドシートの「先生用メモ」シート）に出る「クラスリンク」を配る。
 *   ランキングは、スプレッドシートの「ランキング」シートを大きな画面に映して使う。
 *
 *   公開されるのは、チャレンジの記録の「順位・組班・ニックネーム・高さ・星」の上位50件と、記録を送るフォームのリンクだけ。
 *   授業が終わったら「デプロイを管理」からアーカイブすると、ランキングは見られなくなる。
 *   このスクリプトを新しい版に貼りかえたときは、「デプロイを管理」→ 鉛筆のマーク →「バージョン」を「新バージョン」にして
 *   「デプロイ」を押す（URL は変わらないので、クラスリンクは配り直さなくてよい）。
 *   前の版のスクリプトでフォームを作った場合も、このスクリプトに貼りかえてデプロイすれば、そのフォームの記録を表示できる。
 *   ランキングは30秒ごとに読み直す。クラス全員がいっせいに開いても動くようにするため。
 *   （関数 makeClassLink を実行しても、ランキング入りのクラスリンクがログに出る）
 *
 * できるもの（先生のマイドライブ）
 *   - Google フォーム「最高タワー工房 クラスランキング」
 *   - 回答のスプレッドシート。「ランキング」シートに、最高タワーチャレンジの記録が
 *     一人ひとりの最高の高さで自動で並ぶ（回答が来るたびに更新）
 *
 * 生徒の名前・メールアドレスは集めない。記録はニックネームだけで送られる。
 */

/** アプリの公開先。クラスリンクはこの URL のうしろに設定を付けたもの */
var APP_URL = 'https://okarin-netizen.github.io/building-simulator/';

/** アプリに見せるランキングの件数 */
var RANKING_LIMIT = 50;

/** ランキングを覚えておく秒数（この間に送られた記録は、次に読み直したときに出る） */
var RANKING_CACHE_SECONDS = 30;
var RANKING_CACHE_KEY = 'ranking-v1';

/** フォームの質問（順番どおりにスプレッドシートの列になる）。placeholder はアプリの classForm.ts と同じ言葉 */
var RANKING_QUESTIONS = [
  { id: 'name', title: 'ニックネーム', placeholder: 'NAME', required: true },
  { id: 'group', title: '組・班', placeholder: 'GROUP', required: false },
  { id: 'stage', title: 'ステージ', placeholder: 'STAGE', required: true },
  { id: 'height', title: '高さ（m）', placeholder: 'HEIGHT', required: true },
  { id: 'stars', title: '星の数', placeholder: 'STARS', required: false },
  { id: 'cost', title: '費用（万円）', placeholder: 'COST', required: false },
  { id: 'result', title: '結果', placeholder: 'RESULT', required: false },
];

function createRankingForm() {
  var form = FormApp.create('最高タワー工房 クラスランキング');
  form.setDescription(
    '「最高タワー工房」の結果カードの「クラスに送る」から開くと、記録が入った状態になります。\n' +
      'そのまま下の「送信」を押してください。自分で書きかえないでね。'
  );
  form.setCollectEmail(false);
  form.setLimitOneResponsePerUser(false);
  form.setAllowResponseEdits(false);
  form.setShowLinkToRespondAgain(false);
  form.setConfirmationMessage('送信できました！アプリにもどって、もっと高いタワーに挑戦しよう。');

  var items = {};
  RANKING_QUESTIONS.forEach(function (q) {
    items[q.id] = form.addTextItem().setTitle(q.title).setRequired(q.required);
  });

  // 回答のスプレッドシート
  var ss = SpreadsheetApp.create('最高タワー工房 クラスランキング（回答）');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());
  SpreadsheetApp.flush();
  ss = SpreadsheetApp.openById(ss.getId());
  var responses = ss.getSheets().filter(function (s) {
    return !!s.getFormUrl();
  })[0];
  if (!responses) throw new Error('回答のシートが見つかりませんでした。もう一度「実行」してください。');
  // 最初からある空のシートは消す
  ss.getSheets().forEach(function (s) {
    if (s.getSheetId() !== responses.getSheetId() && s.getLastRow() === 0) ss.deleteSheet(s);
  });

  var ranking = ss.insertSheet('ランキング', 0);
  setUpRankingSheet_(ranking, responses.getName());

  // 事前入力リンク（各質問に NAME などの言葉を入れたもの）と、生徒に配るクラスリンク
  var prefill = form.createResponse();
  RANKING_QUESTIONS.forEach(function (q) {
    prefill.withItemResponse(items[q.id].createResponse(q.placeholder));
  });
  var prefilledUrl = prefill.toPrefilledUrl();
  var classLink = buildClassLink_(prefilledUrl, APP_URL);
  // ランキングのウェブアプリ（doGet）と makeClassLink が使う
  PropertiesService.getScriptProperties().setProperties({ SHEET_ID: ss.getId(), PREFILLED_URL: prefilledUrl });

  var memo = ss.insertSheet('先生用メモ');
  var rows = [
    ['生徒に配るクラスリンク', classLink],
    ['ランキング表（このスプレッドシート）', ss.getUrl()],
    ['フォームの編集', form.getEditUrl()],
    ['フォームの回答ページ', form.getPublishedUrl()],
    ['事前入力リンク（アプリの「先生用：クラスランキングの準備」の③に貼っても同じクラスリンクができます）', prefilledUrl],
    ['作った日時', new Date()],
  ];
  memo.getRange(1, 1, rows.length, 2).setValues(rows);
  memo.setColumnWidth(1, 320);
  memo.setColumnWidth(2, 640);
  memo.getRange(1, 1, rows.length, 2).setWrap(true).setVerticalAlignment('top');
  memo.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#ffd23f');

  ss.setActiveSheet(ranking);

  Logger.log('①ができました。次は②：右上の「デプロイ」→「新しいデプロイ」→ 歯車 →「ウェブアプリ」で、' +
    'アクセスできるユーザーを「全員」にしてデプロイし、出てきた URL をアプリの準備画面の③に貼ってください。');
  Logger.log('■ 「全員」が選べないときは、このクラスリンクを生徒に配る（ランキングはスプレッドシートを映す）\n' + classLink);
  Logger.log('■ ランキング表（スプレッドシート）\n' + ss.getUrl());
  return classLink;
}

/** ウェブアプリとしてデプロイしたあとに実行：ランキングも見られるクラスリンクを作る */
function makeClassLink() {
  var props = PropertiesService.getScriptProperties();
  var prefilledUrl = props.getProperty('PREFILLED_URL');
  if (!prefilledUrl) throw new Error('先に createRankingForm を実行してください。');
  var service = ScriptApp.getService().getUrl();
  if (!service) throw new Error('まだウェブアプリとしてデプロイされていません。「デプロイ」→「新しいデプロイ」→「ウェブアプリ」で、アクセスできるユーザーを「全員」にしてください。');
  var rankingUrl = service.replace(/\/dev$/, '/exec');
  var classLink = buildClassLink_(prefilledUrl, APP_URL, rankingUrl);
  var ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  var memo = ss.getSheetByName('先生用メモ');
  if (memo) {
    memo.getRange(1, 2).setValue(classLink);
    memo.getRange(memo.getLastRow() + 1, 1, 1, 2).setValues([['ランキング表示（ウェブアプリ）', rankingUrl]]);
  }
  Logger.log('■ ランキングも見られるクラスリンク（これを生徒に配る）\n' + classLink);
  Logger.log('■ ランキングのデータ（ブラウザで開くと確かめられる）\n' + rankingUrl);
  return classLink;
}

/** ウェブアプリ：アプリにランキングを返す */
function doGet() {
  return ContentService.createTextOutput(rankingJson_()).setMimeType(ContentService.MimeType.JSON);
}

/**
 * ランキングの JSON。クラス全員がいっせいに開いても、スプレッドシートを読むのは
 * RANKING_CACHE_SECONDS 秒に1回だけにする（ほかは覚えておいた答えをすぐ返すので、
 * Apps Script の「同時に動かせる数」の上限に当たりにくい）。
 */
function rankingJson_() {
  var cache = CacheService.getScriptCache();
  var hit = cache.get(RANKING_CACHE_KEY);
  if (hit) return hit;
  // 読み直すのは1人だけ。ほかの人は少し待って、その答えを使う
  var lock = LockService.getScriptLock();
  var locked = lock.tryLock(10000);
  try {
    if (locked) {
      hit = cache.get(RANKING_CACHE_KEY);
      if (hit) return hit;
    }
    var json = readRankingJson_();
    // 読めなかったとき（error）は覚えず、次の人がもう一度読む
    if (json) {
      try {
        cache.put(RANKING_CACHE_KEY, json, RANKING_CACHE_SECONDS);
      } catch (err) {
        // 大きすぎて覚えられなくても、答えは返す
      }
      return json;
    }
    return JSON.stringify({ error: 'ランキングを読めませんでした' });
  } finally {
    if (locked) lock.releaseLock();
  }
}

/** スプレッドシートを読んでランキングの JSON を作る。読めないときは null */
function readRankingJson_() {
  try {
    var ss = rankingSpreadsheet_();
    var responses = ss.getSheets().filter(function (s) {
      return !!s.getFormUrl();
    })[0];
    var data = computeRanking_(responses.getDataRange().getValues(), RANKING_LIMIT);
    data.updated = new Date().toISOString();
    // アプリの準備画面が、このウェブアプリの URL だけからクラスリンクを作れるように、記録を送るフォームのリンクも返す
    var form = prefilledUrl_(responses.getFormUrl());
    if (form) data.form = form;
    return JSON.stringify(data);
  } catch (err) {
    return null;
  }
}

/**
 * 記録を送るフォームの事前入力リンク（各質問に NAME などを入れたもの）。
 * 前の版のスクリプトで作ったときは保存されていないので、フォームの質問の名前から作って覚えておく。作れないときは null
 */
function prefilledUrl_(formUrl) {
  var props = PropertiesService.getScriptProperties();
  var saved = props.getProperty('PREFILLED_URL');
  if (saved) return saved;
  try {
    var form = FormApp.openByUrl(formUrl);
    var byTitle = {};
    form.getItems(FormApp.ItemType.TEXT).forEach(function (item) {
      byTitle[String(item.getTitle()).trim()] = item.asTextItem();
    });
    var response = form.createResponse();
    var found = 0;
    RANKING_QUESTIONS.forEach(function (q) {
      var item = byTitle[q.title];
      if (!item) return;
      response.withItemResponse(item.createResponse(q.placeholder));
      found++;
    });
    if (!found) return null;
    var url = response.toPrefilledUrl();
    props.setProperty('PREFILLED_URL', url);
    return url;
  } catch (err) {
    return null;
  }
}

/**
 * 回答のスプレッドシート。前の版のスクリプトで作ったときは ID が保存されていないので、
 * 名前で探して（いちばん新しいもの）覚えておく。
 */
function rankingSpreadsheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SHEET_ID');
  if (!id) {
    var files = DriveApp.getFilesByName('最高タワー工房 クラスランキング（回答）');
    var newest = null;
    while (files.hasNext()) {
      var f = files.next();
      if (!newest || f.getLastUpdated() > newest.getLastUpdated()) newest = f;
    }
    if (!newest) throw new Error('回答のスプレッドシートが見つかりません。先に createRankingForm を実行してください。');
    id = newest.getId();
    props.setProperty('SHEET_ID', id);
  }
  return SpreadsheetApp.openById(id);
}

/**
 * 回答のシート（1行目は質問の見出し）から、チャレンジの記録を一人ひとりの最高の高さで並べる。
 * 返すのは順位・組班・ニックネーム・高さと、その記録の星の数だけ（時刻や費用などは出さない）。同じ高さなら星の多い人を上に並べる。
 */
function computeRanking_(values, limit) {
  var head = (values[0] || []).map(function (h) {
    return String(h).trim();
  });
  var col = {};
  RANKING_QUESTIONS.forEach(function (q) {
    col[q.id] = head.indexOf(q.title);
  });
  if (col.name < 0 || col.stage < 0 || col.height < 0) return { rows: [], total: 0 };
  var cell = function (row, id) {
    return col[id] < 0 ? '' : String(row[col[id]] == null ? '' : row[col[id]]).trim();
  };
  var best = {};
  values.slice(1).forEach(function (row) {
    var name = cell(row, 'name').slice(0, 20);
    if (!name) return;
    if (cell(row, 'stage').indexOf('最高タワー') < 0) return;
    if (cell(row, 'result') === 'ためし') return;
    var group = cell(row, 'group').slice(0, 20);
    var height = Number(cell(row, 'height'));
    if (!isFinite(height) || height < 0) height = 0;
    var stars = Math.round(Number(cell(row, 'stars')));
    if (!isFinite(stars) || stars < 0) stars = 0;
    if (stars > 3) stars = 3;
    var key = group + '\u0000' + name;
    if (!best[key]) best[key] = { group: group, name: name, height: height, stars: stars, tries: 0 };
    best[key].tries++;
    // 一番高い記録の星（同じ高さなら星の多いほう）
    var b = best[key];
    if (height > b.height || (height === b.height && stars > b.stars)) {
      b.height = height;
      b.stars = stars;
    }
  });
  var list = Object.keys(best).map(function (k) {
    return best[k];
  });
  list.sort(function (a, b) {
    return b.height - a.height || b.stars - a.stars || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
  var rows = [];
  for (var i = 0; i < list.length && i < limit; i++) {
    var rank = i > 0 && list[i].height === list[i - 1].height ? rows[i - 1].rank : i + 1;
    var out = { rank: rank, group: list[i].group, name: list[i].name, height: list[i].height };
    if (col.stars >= 0) out.stars = list[i].stars;
    rows.push(out);
  }
  return { rows: rows, total: list.length };
}

/** 「ランキング」シート：チャレンジの記録を、一人ひとりの最高の高さで並べる */
function setUpRankingSheet_(sheet, responsesName) {
  var r = "'" + responsesName.replace(/'/g, "''") + "'!";
  // 回答の列：A タイムスタンプ / B ニックネーム / C 組・班 / D ステージ / E 高さ / F 星 / G 費用 / H 結果
  sheet.getRange('A1:E1').setValues([['順位', '組・班', 'ニックネーム', '最高の高さ（m）', '送った回数']]);
  sheet
    .getRange('B2')
    .setFormula(
      '=ARRAYFORMULA(IFERROR(QUERY({TRIM(TO_TEXT(' + r + 'B2:B)), TRIM(TO_TEXT(' + r + 'C2:C)), TO_TEXT(' + r + 'D2:D), ' +
        'IFERROR(VALUE(' + r + 'E2:E), 0), TO_TEXT(' + r + 'H2:H)}, ' +
        '"select Col2, Col1, max(Col4), count(Col4) ' +
        "where Col1 <> '' and Col3 contains '最高タワー' and Col5 <> 'ためし' " +
        "group by Col2, Col1 order by max(Col4) desc label max(Col4) '', count(Col4) ''\", 0), \"\"))"
    );
  // 同じ高さは同じ順位
  sheet.getRange('A2').setFormula('=ARRAYFORMULA(IF(LEN(C2:C) = 0, "", COUNTIF(D2:D, ">" & D2:D) + 1))');

  sheet.setFrozenRows(1);
  sheet.getRange('A1:E1').setFontWeight('bold').setBackground('#ffd23f').setHorizontalAlignment('center');
  sheet.getRange('A:E').setFontSize(14);
  sheet.getRange('A:A').setHorizontalAlignment('center');
  sheet.setColumnWidth(1, 70);
  sheet.setColumnWidth(2, 110);
  sheet.setColumnWidth(3, 220);
  sheet.setColumnWidth(4, 160);
  sheet.setColumnWidth(5, 110);
  sheet.getRange('G1').setValue(
    '最高タワーチャレンジの記録だけを、ニックネーム（と組・班）ごとに一番高い記録で並べます。倒れた・くずれた試験は 0 m で送られます。' +
      '先生のテスト送信（結果「ためし」）は入りません。元の回答は「' + responsesName + '」シートにあります。'
  );
  sheet.getRange('G1').setWrap(true).setFontColor('#666666');
  sheet.setColumnWidth(7, 360);
}

/**
 * 事前入力リンクから、アプリのクラスリンクを作る（アプリの classForm.ts の classLinkFor と同じ形）。
 * 学校のアカウントでは /a/学校/forms/… や /u/0/ が入ることがあるので、/d/e/ID の部分だけを使う。
 */
function buildClassLink_(prefilledUrl, appUrl, rankingUrl) {
  var m = /\/forms\/(?:u\/\d+\/)?d\/e\/([\w-]+)\/viewform/.exec(prefilledUrl);
  if (!m) throw new Error('事前入力リンクの形がちがいます：' + prefilledUrl);
  var entries = {};
  var re = /[?&](entry\.\d+)=([^&#]*)/g;
  var e;
  while ((e = re.exec(prefilledUrl))) {
    var value = decodeURIComponent(e[2].replace(/\+/g, ' ')).trim().toUpperCase();
    RANKING_QUESTIONS.forEach(function (q) {
      if (q.placeholder === value) entries[q.id] = e[1];
    });
  }
  RANKING_QUESTIONS.forEach(function (q) {
    if (q.required && !entries[q.id]) throw new Error('事前入力リンクに ' + q.placeholder + ' が見つかりません');
  });
  var template = { url: 'https://docs.google.com/forms/d/e/' + m[1] + '/viewform', entries: entries };
  if (rankingUrl) template.ranking = rankingUrl;
  return appUrl.split('#')[0] + '#class=' + encodeURIComponent(JSON.stringify(template));
}
