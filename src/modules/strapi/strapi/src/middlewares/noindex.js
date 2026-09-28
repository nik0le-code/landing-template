// The CMS shares the site's domain: keep every response of it out of search engines.
module.exports = () => async (ctx, next) => {
  await next();
  ctx.set("X-Robots-Tag", "noindex, nofollow");
};
