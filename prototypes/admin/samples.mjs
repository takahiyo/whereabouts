/** 架空名簿の表示密度・空状態を比較するfixture。参照元: app.mjs、ブラウザ試験。 */
import { FIXTURE } from './constants.mjs';
import { copyRoster } from './model.mjs';

const LARGE_SAMPLE = Object.freeze({ groups: 6, members: 100, longNameEvery: 10 });

/** @param {string} scenario シナリオID @returns {object} 共有データと無関係なサンプル */
export function createSample(scenario) {
  if (scenario === 'empty') return { groups: [], members: [] };
  if (scenario !== 'large') return copyRoster(FIXTURE);
  const groups = Array.from({ length: LARGE_SAMPLE.groups }, (_, index) => ({ id: `large-group-${index}`, name: index === 0 ? '事業企画・システム開発・業務改善推進グループ' : `サンプル部署 ${index + 1}` }));
  const members = Array.from({ length: LARGE_SAMPLE.members }, (_, index) => ({ id: `large-member-${index}`, name: index % LARGE_SAMPLE.longNameEvery === 0 ? `非常に長い氏名の表示確認用 サンプルメンバー ${index + 1}` : `サンプル メンバー ${index + 1}`, group: groups[index % groups.length].id, ext: String(index + 1), email: `sample${index + 1}@example.invalid`, mobile: '', status: '在席', tomorrowPlan: '' }));
  return { groups, members };
}
