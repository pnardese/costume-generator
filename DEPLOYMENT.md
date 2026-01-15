# Deployment Guide

## GitHub Pages Deployment

This static application can be deployed to GitHub Pages. Follow these steps:

### Option 1: Deploy from `gh-pages` branch (Recommended)

1. **Install gh-pages package** (if not already installed):
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Add deploy script to package.json**:
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d out"
   }
   ```

3. **Deploy to GitHub Pages**:
   ```bash
   npm run deploy
   ```

4. **Enable GitHub Pages**:
   - Go to your repository on GitHub
   - Navigate to Settings → Pages
   - Under "Source", select "gh-pages" branch
   - Click Save
   - Your site will be available at: `https://pnardese.github.io/costume-generator/`

### Option 2: Deploy from `/out` directory on main branch

1. **Build the application**:
   ```bash
   npm run build
   ```

2. **Commit the `/out` directory**:
   ```bash
   git add out/
   git commit -m "Update static build for GitHub Pages"
   git push
   ```

3. **Configure GitHub Pages**:
   - Go to your repository on GitHub
   - Navigate to Settings → Pages
   - Under "Source", select "main" branch
   - Select "/out" folder
   - Click Save

### Important Notes

- **`.nojekyll` file**: Already included in `/out` directory to prevent Jekyll processing
- **Ollama Integration**: Will only work when users have Ollama running locally on their machine
  - The web app can be accessed from anywhere
  - But LLM features require `http://localhost:11434` to be accessible
  - This is a limitation of local Ollama integration
- **Firebase Integration**: Optional - the app will fall back to Local Storage if Firebase config is not provided

### Testing the Deployment Locally

Before deploying, test the static build locally:

```bash
# Build the application
npm run build

# Serve it locally
cd out
python -m http.server 8000

# Or use the npm script
npm run serve
```

Then open http://localhost:8000 to verify everything works.

### Custom Domain (Optional)

To use a custom domain:

1. Add a `CNAME` file to the `/out` directory with your domain
2. Configure your DNS settings to point to GitHub Pages
3. Enable "Enforce HTTPS" in GitHub Pages settings

### Troubleshooting

**Assets not loading**:
- Ensure you're accessing via HTTP server, not file:// protocol
- Check browser console for CORS errors

**Ollama not working**:
- Verify Ollama is running: `ollama serve`
- Check that models are installed: `ollama list`
- Browser must access the app from localhost or configure CORS in Ollama

**404 errors on GitHub Pages**:
- Verify the `.nojekyll` file exists in the `/out` directory
- Check GitHub Pages settings are correct
- Wait a few minutes for GitHub to process the deployment
