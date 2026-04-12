// /admin/features – 管理者向け機能管理ページ
import { pagesMeta } from '../pages.js';

export const content = pagesMeta['/admin/features'].content;
export const title = pagesMeta['/admin/features'].title;
export const css = '/css/admin.css';

export async function init() {
    const m = await import('../admin.js');
    return m.initAdminFeaturesPage();
}
