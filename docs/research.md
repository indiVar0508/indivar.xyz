# Portfolio research

Researched 13 September 2026. Public primary sources and the existing portfolio informed this redesign. Design recommendations below are interpretations of the work, not psychological or employment claims.

## Identity and content

- Indivar Mishra's GitHub profile describes his interests as “Product / OpenSource / AI” and lists India as his location. It links this website. No employer is listed. His profile README identifies him as a software engineer interested in Python, reinforcement learning and volunteering. [GitHub profile](https://github.com/indiVar0508), [profile README](https://github.com/indiVar0508/indiVar0508/blob/main/README.md).
- The owner says he is from Uttar Pradesh, has lived across India, enjoys learning and loves deep space. These details belong in a short personal introduction; they do not establish expertise in mathematics or astronomy.
- The owner wants his community co-organizer role limited to one brief mention on About. The homepage and site metadata should focus on his engineering work, projects, publications and writing.
- Water conservation and educational social work are existing owner-authored interests. Preserve them without inventing organizations, impact metrics or personal motivations. [Existing portfolio](https://github.com/indiVar0508/indivar.xyz).
- The owner supplied his [X profile](https://x.com/indimishra08) and [YouTube channel](https://www.youtube.com/@ivmIndi). These are personal social links; recommendations for other YouTube channels have been removed at his request.

## Publications

The owner supplied both publication links and identifies himself as a co-author. Present them as his work, separately from open source contributions and personal blog posts. Do not describe them as learning resources, and omit unverified dates and bibliographic details.

- IEEE paper: [An Assessment of Decision Tree based Classification and Regression Algorithms](https://ieeexplore.ieee.org/document/9034296).
- Book chapter, co-authored with his professor: [Analysis of Cutting-Edge Regression Algorithms Used for Data Analysis](https://www.researchgate.net/publication/331386732_Analysis_of_Cutting-Edge_Regression_Algorithms_Used_for_Data_Analysis).

## Selected projects

| Project | Verified scope | Suggested emphasis |
| --- | --- | --- |
| [uv-workspace-dynamic-versioning](https://github.com/indiVar0508/uv-workspace-dynamic-versioning) | Hatch plugin for uv workspaces; filters Git history to the package directory so unrelated changes do not affect that package's version metadata. | Practical Python tooling; lead with the concrete problem solved. |
| [BananiaAI](https://github.com/indiVar0508/BananiaAI) | Recreation of the first level of a 1990s maze game, with A* pathfinding and a manual play option. | Visual, playful AI experimentation. Avoid calling its A* implementation reinforcement learning. |
| [Fictional Commentator](https://github.com/indiVar0508/Fictional-Commentator) | Generative AI function calling for cricket commentary in sitcom characters' voices. | An accessible example connecting AI, cricket and humor. |
| [FlappyBirdAI](https://github.com/indiVar0508/FlappyBirdAI) | Python Flappy Bird project with a neural network and NEAT bot evolution, crediting tutorial influences. | Supporting project demonstrating sustained learning through games. |
| [Rick and Morty Space Adventures](https://github.com/indiVar0508/Rick-and-Morty-Space-Adventures) | Rust space game navigating an asteroid belt. | Supporting project for exploration beyond Python. |

The public API returned 404 for `indiVar0508/rl-llm-arena` during research. Do not present it as a verified public repository or infer whether it is private or nonexistent.

## Open source evidence

- CycloneDX Python Library has merged contributions from Indivar covering cryptographic references, optional model properties, vulnerability analysis timestamps and release publishing. These provide specific examples beyond a generic “open source enthusiast” claim. [PR 767](https://github.com/CycloneDX/cyclonedx-python-lib/pull/767), [PR 786](https://github.com/CycloneDX/cyclonedx-python-lib/pull/786), [PR 794](https://github.com/CycloneDX/cyclonedx-python-lib/pull/794), [PR 796](https://github.com/CycloneDX/cyclonedx-python-lib/pull/796).
- SQLAlchemy lists four authored pull requests about MariaDB generated columns, interval handling and inherited validators. All returned a null `merged_at` at research time. “Contributed pull requests” is accurate; “four merged fixes” would not be. [PR 10354](https://github.com/sqlalchemy/sqlalchemy/pull/10354), [PR 10383](https://github.com/sqlalchemy/sqlalchemy/pull/10383), [PR 10513](https://github.com/sqlalchemy/sqlalchemy/pull/10513), [PR 10574](https://github.com/sqlalchemy/sqlalchemy/pull/10574).

## Salt foundations for this site

Salt separates theme CSS from its React component package. Its token hierarchy includes foundations, palettes and semantic characteristics; the published theme CSS supplies variables, while React components supply their behavior and component styles. This portfolio can use actual Salt CSS foundations with native HTML and custom semantic styles. Describe this as using Salt foundations, rather than claiming to use Salt React components. [Salt repository](https://github.com/jpmorganchase/salt-ds), [design tokens](https://www.saltdesignsystem.com/salt/themes/design-tokens/index), [developing with Salt](https://www.saltdesignsystem.com/salt/getting-started/developing).

Open Sans and PT Mono are the publicly accessible Salt typefaces. The J.P. Morgan theme's Amplitude font download is provided through internal JPMC resources; it is unnecessary for this personal site. [Typography guidance](https://www.saltdesignsystem.com/salt/foundations/typography), [themes](https://www.saltdesignsystem.com/salt/themes/index).

Sources were checked at Salt commit `fa6a3cd132b278eba82295cc34b3173a276a073e` (12 September 2026). The published `@salt-ds/theme` package was version `1.45.0`. A small foundation subset avoids importing the complete application theme when the site only needs colors, spacing and font constants. Preserve the upstream Apache 2.0 license alongside vendored files and identify any modifications. [Package metadata](https://registry.npmjs.org/@salt-ds/theme/1.45.0), [Salt license](https://github.com/jpmorganchase/salt-ds/blob/fa6a3cd132b278eba82295cc34b3173a276a073e/LICENSE).

Exact source files:

- [Next color foundations](https://github.com/jpmorganchase/salt-ds/blob/fa6a3cd132b278eba82295cc34b3173a276a073e/packages/theme/src/css/next/foundations/color.css): scoped to `.salt-theme.salt-theme-next`.
- [Typography foundations](https://github.com/jpmorganchase/salt-ds/blob/fa6a3cd132b278eba82295cc34b3173a276a073e/packages/theme/src/css/foundations/typography.css): Open Sans, PT Mono and weight constants, scoped to `.salt-theme`.
- [Spacing foundations](https://github.com/jpmorganchase/salt-ds/blob/fa6a3cd132b278eba82295cc34b3173a276a073e/packages/theme/src/css/foundations/spacing.css): `.salt-density-low` sets the base spacing to 12px; multiples derive from it.

## Recommended direction

A restrained portfolio gives the work room to speak: a short introduction, selected projects, clearly labelled co-authored publications, and recent writing. Keep personal background on About. The owner has asked to remove gold accents and prefers a subtle reference to deep space; avoid elaborate space diagrams, mathematical branding, or invented personality claims. Use the existing portrait, readable typography, generous spacing and quiet dark surfaces. This is a design interpretation of the owner's feedback.

Jekyll directly supports Markdown posts with YAML front matter and GitHub Pages publishing. `_posts/YYYY-MM-DD-title.md`, `_config.yml` and `_data` suit the requested authoring/configuration workflow. Use Jekyll URL filters so both the custom domain and repository subpaths work. [GitHub Pages content guide](https://docs.github.com/en/pages/setting-up-a-github-pages-site-with-jekyll/adding-content-to-your-github-pages-site-using-jekyll), [Jekyll configuration](https://jekyllrb.com/docs/configuration/options/).
