/** 既存の通信なしCsvServiceをVMで試験へ注入する。参照元: CSV試作の回帰試験。 */
import fs from 'node:fs';
import vm from 'node:vm';
const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync(new URL('../../js/services/csv.js', import.meta.url), 'utf8'), context);
export const csvService = context.window.CsvService;
