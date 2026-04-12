import { adminBasicPageContent } from '../pages.js';

export const content = adminBasicPageContent;
export const title = '基本設定 - 管理者パネル';
export const css = '/css/admin.css';

export async function init() {
    const m = await import('../admin.js');
    return m.initAdminBasicPage();
}
