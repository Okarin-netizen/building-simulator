// 「このアプリについて」の窓：作者・更新履歴・ライセンス

import { APP_LICENSE, AUTHOR, CHANGELOG, MIT_TEXT, THIRD_PARTY } from '../game/about';
import { $, closeOnBackdrop, el } from './dom';

/** 中身を作り、開く・閉じるボタンをつなぐ。最初に1回だけ呼ぶ */
export function setupAboutDialog(): void {
  const aboutDialog = $<HTMLDivElement>('about-dialog');
  buildAbout();
  $('open-about').addEventListener('click', () => (aboutDialog.hidden = false));
  $('about-close').addEventListener('click', () => (aboutDialog.hidden = true));
  closeOnBackdrop(aboutDialog);
}

function buildAbout(): void {
  $('about-version').textContent = `ver.${CHANGELOG[0].version}`;
  $('about-author').textContent = AUTHOR;

  const log = $('about-changelog');
  for (const c of CHANGELOG) {
    const box = el('div', undefined, 'change');
    const head = el('p', undefined, 'change-head');
    head.append(el('span', `ver.${c.version}`, 'change-ver'), ` ${c.title}`, el('small', `　${c.date}`));
    const ul = el('ul');
    for (const it of c.items) ul.append(el('li', it));
    box.append(head, ul);
    log.append(box);
  }

  $('about-license').textContent = `このアプリは${APP_LICENSE.name}です。${APP_LICENSE.summary}`;
  $('about-license-text').textContent = `MIT License\n\n${APP_LICENSE.copyright}\n\n${MIT_TEXT}`;

  const libs = $('about-libs');
  for (const t of THIRD_PARTY) {
    const li = el('li');
    const a = el('a', t.name);
    a.href = t.url;
    a.target = '_blank';
    a.rel = 'noopener';
    li.append(a, `：${t.use}　`, el('span', t.license, 'lib-license'));
    libs.append(li);
  }
}
