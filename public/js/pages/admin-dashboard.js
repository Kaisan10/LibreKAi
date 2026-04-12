import { pagesMeta } from '../pages.js';

export const content = pagesMeta['/admin'].content;
export const title = '管理者パネル - KAi';
export const css = '/css/admin.css';

export async function init() {
    const m = await import('../admin.js');
    return m.initAdminDashboardPage();
}
