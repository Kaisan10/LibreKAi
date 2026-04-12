import { pagesMeta } from '../pages.js';

export const content = pagesMeta['/admin/models'].content;
export const title = 'モデル管理 - 管理者パネル';
export const css = '/css/admin.css';

export async function init() {
    const m = await import('../admin.js');
    return m.initAdminModelsPage();
}
