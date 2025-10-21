# Git & Automated Backup Setup

## ✅ What's Been Set Up

### **1. Git Repository**
- ✅ Git initialized
- ✅ `.gitignore` configured
- ✅ Ready to push to GitHub

### **2. Automated Backups**
- ✅ GitHub Actions workflow (daily backups)
- ✅ Local backup script
- ✅ Backup archives (90-day retention)

### **3. Auto-Deploy**
- ✅ Vercel integration ready
- ✅ Auto-deploy on push to main

---

## 🚀 Quick Start

### **Step 1: Create GitHub Repository**

```bash
# Using GitHub CLI (recommended)
gh repo create asteroids-game --public --source=. --push

# Or manually:
# 1. Go to https://github.com/new
# 2. Create repo named "asteroids-game"
# 3. Run these commands:
git remote add origin https://github.com/YOUR_USERNAME/asteroids-game.git
git branch -M main
git push -u origin main
```

### **Step 2: Initial Commit**

```bash
# Add all files
git add .

# Commit with message
git commit -m "Initial commit: Asteroids game with mobile controls"

# Push to GitHub
git push -u origin main
```

### **Step 3: Set Up Vercel Auto-Deploy**

1. Go to your Vercel project: https://vercel.com/mikehelm-gmailcoms-projects/asteroids
2. Click **Settings** → **Git**
3. Click **Connect Git Repository**
4. Select your GitHub repo
5. ✅ Now every push auto-deploys!

---

## 📦 Backup Options

### **Option 1: Manual Backup (Anytime)**

```bash
./scripts/backup.sh
```

This will:
- ✅ Commit all changes
- ✅ Push to GitHub
- ✅ Create local archive in `~/Backups/Asteroids/`

### **Option 2: Automated Daily Backups**

GitHub Actions runs automatically:
- ✅ Every day at 2 AM UTC
- ✅ On every push to main
- ✅ Manual trigger available

View backups: https://github.com/YOUR_USERNAME/asteroids-game/actions

### **Option 3: Cron Job (Local Automated)**

Set up daily local backups:

```bash
# Edit crontab
crontab -e

# Add this line (runs daily at 2 AM)
0 2 * * * cd "/Volumes/Sandisk 2TB/MAKE STUFF/Asteroids/project 2" && ./scripts/backup.sh >> ~/backup.log 2>&1
```

---

## 🔄 Daily Workflow

### **When You Make Changes:**

```bash
# 1. Save your work
git add .
git commit -m "Description of changes"
git push

# That's it! Auto-deploys to Vercel + backs up to GitHub
```

### **Quick Backup:**

```bash
./scripts/backup.sh
```

---

## 📊 What Gets Backed Up

✅ **Included:**
- All source code (`src/`)
- Configuration files
- Assets (images, sounds)
- Documentation

❌ **Excluded:**
- `node_modules/` (can be reinstalled)
- `dist/` (build output)
- `.git/` (in archives)
- `.vercel/` (deployment config)

---

## 🔐 Backup Locations

### **1. GitHub (Primary)**
- Full version history
- Accessible anywhere
- Free unlimited storage for code

### **2. Local Archives**
- Location: `~/Backups/Asteroids/`
- Format: `asteroids-backup-YYYY-MM-DD.tar.gz`
- Compressed (excludes node_modules)

### **3. GitHub Actions Artifacts**
- 90-day retention
- Download from Actions tab
- Automatic on every push

---

## 🆘 Restore from Backup

### **From GitHub:**
```bash
git clone https://github.com/YOUR_USERNAME/asteroids-game.git
cd asteroids-game
npm install
npm run dev
```

### **From Local Archive:**
```bash
cd ~/Backups/Asteroids
tar -xzf asteroids-backup-YYYY-MM-DD.tar.gz -C ~/restored-project
cd ~/restored-project
npm install
npm run dev
```

---

## 🎯 Next Steps

1. ✅ Create GitHub repo (see Step 1 above)
2. ✅ Push initial commit
3. ✅ Connect Vercel to GitHub
4. ✅ Test auto-deploy (make a small change and push)
5. ✅ Set up cron job (optional)

---

## 💡 Pro Tips

- **Commit often:** Small, frequent commits are better
- **Use branches:** Create feature branches for big changes
- **Write good commit messages:** Describe what changed and why
- **Tag releases:** `git tag v1.0.0` for important milestones
- **Check backup logs:** Verify backups are running

---

## 📞 Useful Commands

```bash
# Check status
git status

# View commit history
git log --oneline

# Create a branch
git checkout -b feature-name

# Merge branch
git checkout main
git merge feature-name

# View backups
ls -lh ~/Backups/Asteroids/

# Manual backup
./scripts/backup.sh

# Deploy to Vercel
vercel --prod
```

---

**Your code is now safe and automatically backed up!** 🎉
