# 🚀 Deployment Guide

This guide will walk you through deploying your Bomberman Multiplayer game to various hosting platforms.

## 📋 Prerequisites

Before deploying, make sure you have completed the Firebase setup:

1. ✅ Anonymous Authentication enabled
2. ✅ Realtime Database rules published
3. ✅ Firestore rules published
4. ✅ Firestore indexes created

## 🌐 Deployment Options

### Option 1: GitHub Pages (Recommended for beginners)

**Pros:**
- Free hosting
- Automatic deployment
- Custom domain support
- Easy setup

**Steps:**

1. Create a GitHub repository:
```bash
git init
git add .
git commit -m "Initial commit: Bomberman Multiplayer"
git branch -M main
```

2. Push to GitHub:
```bash
git remote add origin https://github.com/YOUR_USERNAME/bomberman.git
git push -u origin main
```

3. Enable GitHub Pages:
   - Go to repository **Settings**
   - Navigate to **Pages** section
   - Source: **Deploy from a branch**
   - Branch: **main** / **root**
   - Click **Save**

4. Wait 1-2 minutes, your game will be live at:
   ```
   https://YOUR_USERNAME.github.io/bomberman/
   ```

5. (Optional) Add custom domain:
   - Buy a domain (e.g., from Namecheap, Google Domains)
   - Add CNAME file with your domain
   - Configure DNS settings

---

### Option 2: Netlify (Best for quick deployment)

**Pros:**
- Free tier available
- Instant deployment
- Automatic HTTPS
- Form handling and serverless functions

**Method 1: Drag & Drop**

1. Go to [Netlify Drop](https://app.netlify.com/drop)
2. Drag your project folder onto the page
3. Done! Your site is live with a random URL
4. (Optional) Change site name in settings

**Method 2: Git Integration**

1. Sign up at [Netlify](https://netlify.com)
2. Click "New site from Git"
3. Connect your GitHub repository
4. Build settings:
   - Build command: (leave empty)
   - Publish directory: `/`
5. Click "Deploy site"

**Method 3: Netlify CLI**

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Deploy
netlify deploy

# Follow prompts, then deploy to production
netlify deploy --prod
```

---

### Option 3: Vercel (Best for performance)

**Pros:**
- Free tier available
- Global CDN
- Excellent performance
- Zero configuration

**Steps:**

1. Install Vercel CLI:
```bash
npm install -g vercel
```

2. Login:
```bash
vercel login
```

3. Deploy:
```bash
cd /path/to/bomberman
vercel
```

4. Follow the prompts:
   - Set up and deploy? **Yes**
   - Which scope? **Your account**
   - Link to existing project? **No**
   - Project name? **bomberman**
   - Directory? **./**
   - Override settings? **No**

5. Your game is now live!

**Deploy updates:**
```bash
vercel --prod
```

---

### Option 4: Firebase Hosting (Best Firebase integration)

**Pros:**
- Same platform as backend
- Free tier (10 GB storage, 360 MB/day transfer)
- Custom domain support
- HTTPS by default

**Steps:**

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login:
```bash
firebase login
```

3. Initialize hosting:
```bash
firebase init hosting
```

4. Configuration:
   - Select your existing project: **bomb-16743**
   - Public directory: **. (current directory)**
   - Configure as SPA: **No**
   - Overwrite index.html: **No**
   - Set up automatic builds: **No**

5. Deploy:
```bash
firebase deploy --only hosting
```

6. Your game is live at:
   ```
   https://bomb-16743.web.app
   https://bomb-16743.firebaseapp.com
   ```

**Deploy updates:**
```bash
firebase deploy --only hosting
```

---

### Option 5: CloudFlare Pages

**Pros:**
- Free unlimited bandwidth
- Excellent global performance
- DDoS protection

**Steps:**

1. Sign up at [CloudFlare Pages](https://pages.cloudflare.com/)
2. Click "Create a project"
3. Connect your Git repository
4. Build settings:
   - Build command: (none)
   - Build output directory: `/`
5. Click "Save and Deploy"

---

## 🔧 Post-Deployment Configuration

### Update Firebase Rules for Production

Add your production domain to Firebase:

1. Go to Firebase Console → Authentication → Settings
2. Add your domain to "Authorized domains"
3. Example: `yourdomain.com`, `yourapp.netlify.app`

### Test Your Deployment

1. **Open the game in multiple browsers/tabs**
2. **Create a room**
3. **Join from another browser**
4. **Test gameplay**
5. **Check for console errors** (F12)

### Performance Optimization

1. **Enable caching:**
   - Add `cache-control` headers
   - Configure CDN caching

2. **Compress assets:**
   - Use Gzip compression
   - Minify CSS/JS (optional)

3. **Monitor Firebase usage:**
   - Check Realtime Database usage
   - Check Firestore read/write counts
   - Set budget alerts

---

## 🔍 Troubleshooting

### CORS Errors
- Make sure your domain is authorized in Firebase
- Check Firebase Authentication settings
- Verify Realtime Database rules

### Module Loading Errors
- Ensure you're using HTTPS (not HTTP)
- Check that all file paths are correct
- Verify ES6 modules are supported

### Firebase Connection Issues
- Check Firebase API key is correct
- Verify Firebase project is active
- Check browser console for specific errors

### Slow Loading
- Use a CDN for Firebase SDK
- Enable gzip compression
- Check Firebase region closest to users

---

## 📊 Monitoring & Analytics

### Firebase Analytics

Already enabled! Check:
- Firebase Console → Analytics
- User engagement
- Real-time active users
- Top events

### Custom Monitoring

Add to `index.html` and `game.html`:

```javascript
// Google Analytics (optional)
<script async src="https://www.googletagmanager.com/gtag/js?id=GA_MEASUREMENT_ID"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'GA_MEASUREMENT_ID');
</script>
```

---

## 🔒 Security Best Practices

1. **Never commit sensitive data**
   - API keys are safe to expose (client-side)
   - But keep Firebase rules strict

2. **Monitor abuse**
   - Set up Firebase alerts
   - Check for unusual activity
   - Implement rate limiting if needed

3. **Keep dependencies updated**
   - Update Firebase SDK regularly
   - Check for security patches

---

## 🌍 Custom Domain Setup

### Netlify
1. Go to Domain settings
2. Add custom domain
3. Configure DNS:
   ```
   CNAME  www  your-site.netlify.app
   A      @    75.2.60.5
   ```

### Vercel
1. Go to Project settings → Domains
2. Add your domain
3. Configure DNS as instructed

### Firebase
1. Go to Hosting → Add custom domain
2. Follow verification steps
3. Wait for SSL certificate provisioning

---

## 💰 Pricing Considerations

### Firebase Free Tier
- **Realtime Database**: 1 GB storage, 10 GB/month transfer
- **Firestore**: 1 GB storage, 50K reads, 20K writes per day
- **Authentication**: Unlimited
- **Hosting**: 10 GB storage, 360 MB/day transfer

**Estimated usage for 100 active players:**
- Realtime DB: ~2-5 GB/month (within free tier)
- Firestore: ~50K-100K reads/day (may exceed free tier)

### Hosting Free Tiers
- **GitHub Pages**: 100 GB/month bandwidth
- **Netlify**: 100 GB bandwidth
- **Vercel**: 100 GB bandwidth
- **CloudFlare**: Unlimited bandwidth

---

## 🎯 Production Checklist

Before going live, verify:

- [ ] Firebase rules are properly configured
- [ ] Anonymous authentication is enabled
- [ ] All Firebase indexes are created
- [ ] Game works in multiple browsers
- [ ] Multiplayer sync works correctly
- [ ] Mobile devices can access the game
- [ ] No console errors in browser
- [ ] Domain is configured (if using custom)
- [ ] Analytics are working
- [ ] Performance is acceptable (60 FPS)

---

## 🚀 Continuous Deployment

Set up automatic deployment on git push:

### GitHub Actions (for GitHub Pages)

Create `.github/workflows/deploy.yml`:

```yaml
name: Deploy to GitHub Pages

on:
  push:
    branches: [ main ]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./
```

---

## 📧 Support

Need help with deployment?
- Check Firebase Console for errors
- Review hosting provider documentation
- Check browser console for issues
- Open an issue on GitHub

---

**Happy Deploying! 🎮**
