import { pagesMeta } from '../pages.js';

export const content = pagesMeta['/admin/auth'].content;
export const title = 'ログインと認証 - 管理者パネル';
export const css = '/css/admin.css';

export async function init() {
    const m = await import('../admin.js');
    return m.initAdminAuthPage();
}
