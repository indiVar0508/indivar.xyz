/**
 * Personal Website Logic
 * Handles Routing, Blog Rendering, and Dynamic Content
 */

const app = {
    state: {
        posts: [],
        currentFilter: 'all'
    },

    init: async () => {
        app.setYear();
        app.loadProjects();
        app.loadOSS();
        await app.loadBlogData();
        app.handleInitialRoute();

        // Load saved theme
        if (localStorage.getItem('theme') === 'light') {
            document.body.classList.add('light-theme');
            const btn = document.querySelector('.theme-toggle i');
            if (btn) {
                btn.classList.remove('fa-moon');
                btn.classList.add('fa-sun');
            }
        }

        // Listen for hash changes
        window.addEventListener('hashchange', app.handleInitialRoute);
    },

    setYear: () => {
        document.getElementById('year').textContent = new Date().getFullYear();
    },

    // Simple Router
    router: (view, sectionId = null) => {
        const root = document.getElementById('app-root');

        if (view === 'home') {
            const template = document.getElementById('home-template');
            root.innerHTML = '';
            root.appendChild(template.content.cloneNode(true));
            app.loadProjects(); // Re-bind projects
            app.loadOSS();      // Re-bind OSS

            if (sectionId) {
                // Wait for DOM
                setTimeout(() => {
                    const el = document.getElementById(sectionId);
                    if (el) el.scrollIntoView({ behavior: 'smooth' });
                }, 100);
            }
        } else if (view === 'blog') {
            const template = document.getElementById('blog-list-template');
            root.innerHTML = '';
            root.appendChild(template.content.cloneNode(true));
            app.renderBlogList();
            window.scrollTo(0, 0);
        }
    },

    handleInitialRoute: () => {
        const hash = window.location.hash;
        if (hash === '#blog') {
            app.router('blog');
        } else if (hash.startsWith('#post/')) {
            // e.g. #post/hello-world
            const slug = hash.split('/')[1];
            app.loadBlogPost(slug);
        } else {
            // Default Home
            app.router('home', hash.replace('#', ''));
        }
    },

    // Theme Toggle
    toggleTheme: () => {
        const body = document.body;
        body.classList.toggle('light-theme');

        const btn = document.querySelector('.theme-toggle i');
        if (body.classList.contains('light-theme')) {
            btn.classList.remove('fa-moon');
            btn.classList.add('fa-sun');
            localStorage.setItem('theme', 'light');
        } else {
            btn.classList.remove('fa-sun');
            btn.classList.add('fa-moon');
            localStorage.setItem('theme', 'dark');
        }
    },

    // Data: Projects (Updated for indiVar0508)
    loadProjects: () => {
        const container = document.getElementById('projects-container');
        if (!container) return;

        const projects = [
            {
                title: "BananiaAI",
                desc: "Recreation of the 90s classic 'Banania'. Uses pathfinding & AI algorithms to play the game autonomously.",
                tags: ["Python", "AI", "Game Dev"],
                link: "https://github.com/indiVar0508/BananiaAI",
                image: "images/projects/banania-ai.png"
            },
            {
                title: "FlappyBirdAI",
                desc: "Neural Network built from scratch + NEAT (NeuroEvolution) to evolve a bot that plays Flappy Bird.",
                tags: ["Python", "Neural Networks", "NEAT"],
                link: "https://github.com/indiVar0508/FlappyBirdAI",
                image: "images/projects/flappy-bird-ai.png"
            },
            {
                title: "Rick & Morty Space Adventures",
                desc: "Help Rick and Morty navigate an asteroid belt in this Rust-based space adventure game.",
                tags: ["Rust", "Game Dev"],
                link: "https://github.com/indiVar0508/Rick-and-Morty-Space-Adventures",
                image: "images/projects/rick-morty.png"
            },
            {
                title: "Fictional Commentator",
                desc: "GenAI project using function calling to commentate cricket matches as popular sitcom characters.",
                tags: ["Python", "GenAI", "LLMs"],
                link: "https://github.com/indiVar0508/Fictional-Commentator",
                image: "images/projects/commentator.png"
            },
            {
                title: "BangPypers Community",
                desc: "Active organizer and contributor. Fostering the Python ecosystem in Bangalore.",
                tags: ["Community", "Volunteering"],
                link: "https://www.meetup.com/BangPypers/",
                image: "images/projects/bangpypers.png"
            }
        ];

        container.innerHTML = projects.map(p => `
            <a href="${p.link}" target="_blank" class="project-card">
                <div style="overflow: hidden; height: 200px;">
                    <img src="${p.image}" alt="${p.title}" class="project-img" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'">
                    <div class="card-img-placeholder">
                        <i class="fas fa-code-branch"></i>
                    </div>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${p.title}</h3>
                    <p class="card-desc">${p.desc}</p>
                    <div class="card-meta">
                        <span>View Code <i class="fas fa-arrow-right" style="font-size:0.8rem"></i></span>
                        <span class="tag">${p.tags[0]}</span>
                    </div>
                </div>
            </a>
        `).join('');
    },

    // OSS Contributions
    loadOSS: () => {
        const container = document.getElementById('oss-container');
        if (!container) return;

        const contributions = [
            {
                project: "SQLAlchemy",
                desc: "Contributed Pull Requests to the Python SQL Toolkit and Object Relational Mapper.",
                icon: "fa-database",
                link: "https://github.com/sqlalchemy/sqlalchemy/pulls?q=is%3Apr+author%3AindiVar0508+"
            },
            {
                project: "CycloneDX Python Lib",
                desc: "Contributed to the Python implementation of the CycloneDX standard for Software Bill of Materials (SBOM).",
                icon: "fa-shield-alt",
                link: "https://github.com/CycloneDX/cyclonedx-python-lib/pulls?q=author%3AindiVar0508+is%3Aclosed+"
            }
        ];

        container.innerHTML = contributions.map(c => `
            <a href="${c.link}" target="_blank" class="oss-card">
                <div class="oss-header">
                    <i class="fas ${c.icon} oss-icon"></i>
                    <h3 class="oss-title">${c.project}</h3>
                </div>
                <p class="oss-desc">${c.desc}</p>
                <div class="oss-link">
                    See PRs <i class="fas fa-external-link-alt"></i>
                </div>
            </a>
        `).join('');
    },

    // Blog Engine
    loadBlogData: async () => {
        try {
            const response = await fetch('posts/metadata.json');
            if (response.ok) {
                app.state.posts = await response.json();
            } else {
                console.error("Failed to load blog info");
                app.state.posts = []; // Fallback
            }
        } catch (e) {
            console.error("Error fetching blog metadata", e);
        }
    },

    filterBlog: (category) => {
        app.state.currentFilter = category;

        // Update UI pills
        document.querySelectorAll('.pill').forEach(btn => {
            if (btn.textContent.toLowerCase() === category || (category === 'all' && btn.textContent === 'All')) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        app.renderBlogList();
    },

    renderBlogList: () => {
        const container = document.getElementById('blog-posts-container');
        if (!container) return;

        const filtered = app.state.currentFilter === 'all'
            ? app.state.posts
            : app.state.posts.filter(p => p.category.toLowerCase() === app.state.currentFilter);

        if (filtered.length === 0) {
            container.innerHTML = `<p style="grid-column: 1/-1; text-align: center; color: var(--text-muted);">No posts found.</p>`;
            return;
        }

        container.innerHTML = filtered.map(post => `
             <div class="blog-card" onclick="window.location.hash = '#post/${post.slug}'" style="cursor: pointer;">
                <div class="card-img-placeholder" style="height: 150px; background: linear-gradient(135deg, #1e1e1e, #252525);">
                    <i class="fas fa-newspaper"></i>
                </div>
                <div class="card-content">
                    <h3 class="card-title">${post.title}</h3>
                    <p class="card-desc">${post.summary}</p>
                    <div class="card-meta">
                        <span>${post.date}</span>
                        <span class="tag">${post.category}</span>
                    </div>
                </div>
            </div>
        `).join('');
    },

    loadBlogPost: async (slug) => {
        const root = document.getElementById('app-root');

        // Find post info
        const post = app.state.posts.find(p => p.slug === slug);
        if (!post) {
            root.innerHTML = `<div class="container section"><h2 class="section-title">Post not found</h2> <button class="btn primary" onclick="app.router('blog')">Go Back</button></div>`;
            return;
        }

        // Render skeleton
        const template = document.getElementById('blog-post-template');
        root.innerHTML = '';
        root.appendChild(template.content.cloneNode(true));
        window.scrollTo(0, 0);

        // Fetch Markdown
        try {
            const response = await fetch(`posts/${post.filename}`);
            if (!response.ok) throw new Error("File not found");
            const text = await response.text();

            // Render MD
            const contentEl = document.getElementById('markdown-content');
            contentEl.innerHTML = `
                <div style="margin-bottom: 2rem; border-bottom: 1px solid var(--glass-border); padding-bottom: 1rem;">
                    <h1>${post.title}</h1>
                    <p style="color: var(--accent);">${post.date} • ${post.category}</p>
                </div>
                ${marked.parse(text)}
            `;
        } catch (e) {
            document.getElementById('markdown-content').innerHTML = `<p>Error loading post content.</p>`;
        }
    }
};

// Start
document.addEventListener('DOMContentLoaded', app.init);
