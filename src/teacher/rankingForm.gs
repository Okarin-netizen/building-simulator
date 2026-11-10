/**
 * 最高タワー工房　クラスランキングのフォームを作るスクリプト（先生用）
 *
 * 使い方
 *   1. https://script.google.com を開き、「新しいプロジェクト」を作る
 *   2. 最初から入っている文字をすべて消し、このスクリプトをまるごと貼りつける
 *   3. 上の「実行」を押す（関数は createRankingForm）
 *      初回は許可を求められるので、自分のアカウントを選んで「許可」する
 *      （「このアプリは Google で確認されていません」と出たら「詳細」→「（安全ではないページ）に移動」）
 *   4. 下の「実行ログ」に、生徒に配る「クラスリンク」とフォーム・ランキング表のリンクが出る
 *      同じリンクは、できたスプレッドシートの「先生用メモ」シートにも書いてある
 *
 * アプリの中でランキングを見られるようにするとき（しなくても記録は集まる）
 *   5. 右上の「デプロイ」→「新しいデプロイ」→ 種類「ウェブアプリ」を選ぶ
 *      「次のユーザーとして実行」は「自分」、「アクセスできるユーザー」は「全員」にして「デプロイ」
 *   6. 関数を makeClassLink に切りかえて「実行」する。ログに、ランキングも見られるクラスリンクが出るので、
 *      4. のリンクの代わりにこれを配る
 *   公開されるのは、チャレンジの記録の「順位・組班・ニックネーム・高さ」の上位50件だけ。
 *   授業が終わったら「デプロイを管理」からアーカイブすると、ランキングは見られなくなる。
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
    ['事前入力リンク（アプリの「先生用：クラスランキングの設定」に貼っても同じクラスリンクができます）', prefilledUrl],
    ['作った日時', new Date()],
  ];
  memo.getRange(1, 1, rows.length, 2).setValues(rows);
  memo.setColumnWidth(1, 320);
  memo.setColumnWidth(2, 640);
  memo.getRange(1, 1, rows.length, 2).setWrap(true).setVerticalAlignment('top');
  memo.getRange(1, 1, 1, 2).setFontWeight('bold').setBackground('#ffd23f');

  ss.setActiveSheet(ranking);

  Logger.log('できました。');
  Logger.log('■ 生徒に配るクラスリンク（Classroom などで配る）\n' + classLink);
  Logger.log('■ ランキング表\n' + ss.getUrl());
  Logger.log('■ フォームの編集\n' + form.getEditUrl());
  Logger.log('アプリの中でランキングを見られるようにするときは、ウェブアプリとしてデプロイしてから makeClassLink を実行してください。');
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
  var data;
  try {
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    var responses = ss.getSheets().filter(function (s) {
      return !!s.getFormUrl();
    })[0];
    data = computeRanking_(responses.getDataRange().getValues(), RANKING_LIMIT);
    data.updated = new Date().toISOString();
  } catch (err) {
    data = { error: 'ランキングを読めませんでした' };
  }
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

/**
 * 回答のシート（1行目は質問の見出し）から、チャレンジの記録を一人ひとりの最高の高さで並べる。
 * 返すのは順位・組班・ニックネーム・高さだけ（時刻や費用などは出さない）。
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
    var key = group + '\u0000' + name;
    if (!best[key]) best[key] = { group: group, name: name, height: height, tries: 0 };
    best[key].tries++;
    if (height > best[key].height) best[key].height = height;
  });
  var list = Object.keys(best).map(function (k) {
    return best[k];
  });
  list.sort(function (a, b) {
    return b.height - a.height || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  });
  var rows = [];
  for (var i = 0; i < list.length && i < limit; i++) {
    var rank = i > 0 && list[i].height === list[i - 1].height ? rows[i - 1].rank : i + 1;
    rows.push({ rank: rank, group: list[i].group, name: list[i].name, height: list[i].height });
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
