# WordPress plugin zips

Zip plugins listed in `modules.config.ts` → `wordpress.plugins` with a relative
`zip` path (`{ slug: "bank-gateway", zip: "wordpress-plugins/bank-gateway.zip" }`)
are read from this folder by `npm run wp:up` / `npm run wp:plugins`.

Plugins from wordpress.org don't belong here: list their slug instead.
Commercial or bank-issued zips may carry licence terms; keep them out of public repos.
