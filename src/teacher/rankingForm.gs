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
 * できるもの（先生のマイドライブ）
 *   - Google フォーム「最高タワー工房 クラスランキング」
 *   - 回答のスプレッドシート。「ランキング」シートに、最高タワーチャレンジの記録が
 *     一人ひとりの最高の高さで自動で並ぶ（回答が来るたびに更新）
 *
 * 生徒の名前・メールアドレスは集めない。記録はニックネームだけで送られる。
 */

/** アプリの公開先。クラスリンクはこの URL のうしろに設定を付けたもの */
var APP_URL = 'https://okarin-netizen.github.io/building-simulator/';

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
  return classLink;
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
function buildClassLink_(prefilledUrl, appUrl) {
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
  return appUrl.split('#')[0] + '#class=' + encodeURIComponent(JSON.stringify(template));
}
