// Path -> page module mapping for SPA static/admin pages.
// Router dynamically imports these modules; each module exports at least:
//   - content: HTML string
//   - title: document title
//   - optional css / description / keywords / init()
//
// 404 Not Found ページ: notFound → public/js/pages/not-found.js

export const routeMap = {
  '/admin': '/js/pages/admin-dashboard.js',
  '/admin/models': '/js/pages/admin-models.js',
  '/admin/users': '/js/pages/admin-users.js',
  '/admin/basic': '/js/pages/admin-basic.js',
  '/admin/plugins': '/js/pages/admin-plugins.js',
  '/admin/auth': '/js/pages/admin-auth.js',
  '/admin/features': '/js/pages/admin-features.js',
  '/pages': '/js/pages/pages-index.js',
  '/pages/privacy': '/js/pages/privacy.js',
  '/pages/terms': '/js/pages/terms.js',
  '/pages/pro': '/js/pages/pro.js',
  '/pages/pro/settings': '/js/pages/pro-settings.js',
  '/pages/embedded-sites': '/js/pages/embedded-sites.js',
  '/pages/api': '/js/pages/api.js',
  '/pages/faq': '/js/pages/faq.js',
  '/tags': '/js/pages/tags.js',
  '/blogs': '/js/pages/blogs.js',
  /** 404: 実体は public/js/pages/not-found.js */
  notFound: '/js/pages/not-found.js',
};

