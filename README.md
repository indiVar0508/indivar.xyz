# Indivar’s personal site

A portfolio and Markdown notebook using Jekyll and actual [Salt Design System foundations](https://github.com/jpmorganchase/salt-ds). Native HTML and CSS render the site; a small script adds theme switching, filters, and title/description search. Pages and posts remain readable without JavaScript.

## Preview locally

Use Ruby 3.3 and Bundler:

```sh
bundle config set --local path vendor/bundle
bundle install
bundle exec jekyll serve --livereload
```

Visit <http://localhost:4000>. Restart Jekyll after changing `_config.yml`.

## Write a post

Create `_posts/YYYY-MM-DD-your-title.md`. The filename date controls publication; future posts stay unpublished until that date and the next build. Use `published: false` to keep a post unpublished, or put it in `_drafts/` and preview with `bundle exec jekyll serve --drafts`.

```markdown
---
title: "What I learned building a tiny tool"
date: 2026-09-13
category: Python
description: A short summary for the writing index and search previews.
---

Start writing here. The page template adds the title, author, date, and reading time.

## The interesting bit

Regular Markdown supports lists, links, images, tables, and fenced code blocks.
```

Posts automatically appear on the homepage, Writing page, RSS feed, and sitemap. No JSON index to update. Categories become filter buttons automatically. Use lowercase language names such as `python` on code fences for syntax highlighting.

For local images, add the image under `images/posts/` and use Jekyll’s URL filter so links work on repository subpaths:

```markdown
![Describe the image]({{ '/images/posts/example.png' | relative_url }})
```

The original Hello World post is preserved at `/blog/hello-world/`; its old `/#post/hello-world` link redirects there. Existing `#blog`, `#about`, and `#oss` links are also supported.

## Configure your site

| Change | File |
| --- | --- |
| Site title, description, domain, base path | `_config.yml` |
| Intro, profile, roots, social links | `_data/profile.yml` |
| Projects, order, categories, featured selection | `_data/projects.yml` |
| Open source contributions | `_data/contributions.yml` |
| Co-authored papers and book chapters | `_data/publications.yml` |
| About page | `about.md` |
| Colors, layout, light/dark theme | Semantic variables at the top of `css/style.css` |

Set `featured: true` on projects to show them on the homepage. Projects display as rows with their name, category, description, tags, and repository link; their order follows `_data/projects.yml`.

Your own YouTube channel, X profile, LinkedIn, and GitHub links are configured in `_data/profile.yml`. The Writing page lists only your Markdown posts. Publications are separate from posts and open source contributions.

Salt color, spacing, and typography foundations are vendored in `css/salt-foundations.css`, with the upstream license in `css/SALT-LICENSE.txt`. This site uses Salt tokens with custom native HTML, not Salt’s React components. Fonts load from Google Fonts with system fallbacks. Source versions and public research are in `docs/research.md`.

## Deploy to GitHub Pages

1. In the repository’s **Settings → Pages → Build and deployment**, select **GitHub Actions**.
2. For `indivar.xyz`, keep `url: "https://indivar.xyz"`, `baseurl: ""`, and the existing `CNAME`. Ensure the custom domain in Pages settings is `indivar.xyz`.
3. Commit and push to `main`. `.github/workflows/pages.yml` builds, checks internal links, and deploys `_site`. Pull requests build and check without publishing.

For a repository URL instead, remove `CNAME`, set `url: "https://YOUR-USERNAME.github.io"` and `baseurl: "/YOUR-REPOSITORY"`. An account site named `YOUR-USERNAME.github.io` uses an empty `baseurl`. Configure the domain or repository path before pushing.

## Check a build

```sh
bundle exec jekyll build
ruby test_site.rb
```

To verify a repository subpath without changing the production config:

```sh
bundle exec jekyll build --baseurl /preview --destination /tmp/indivar-preview
ruby test_site.rb /tmp/indivar-preview /preview
```

The check validates generated pages, Markdown output, local links and fragments, RSS, and sitemap URLs.
