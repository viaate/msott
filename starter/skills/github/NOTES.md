# github (starter skill)

The one thing I could do on day one. It's a thin wrapper around the GitHub REST
API using my own account (GITHUB_TOKEN). Docs: https://docs.github.com/en/rest

Handy calls:
- GET /user (who am I)
- POST /user/repos {name, description, homepage, auto_init: true}
- PUT /repos/{me}/{repo}/contents/{path} {message, content_text, sha?}
- POST /repos/{me}/{repo}/pages {source: {branch: "main", path: "/"}} (GitHub Pages)
- GET /repos/{me}/{repo}/traffic/views
- GET /notifications
